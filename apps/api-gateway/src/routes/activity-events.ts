import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActivityCategory = 'runtime' | 'approval' | 'ci' | 'connector' | 'provisioning' | 'security' | 'system';
type ActivityStatus = 'unread' | 'read' | 'acked';

type ActivityEventRecord = {
    id: string;
    tenantId: string;
    workspaceId: string;
    category: ActivityCategory;
    title: string;
    body?: string;
    payload?: Record<string, unknown>;
    status: ActivityStatus;
    sequence: number;
    ackedAt?: string;
    ackedBy?: string;
    correlationId: string;
    createdAt: string;
};

type WorkspacePath = { workspaceId: string };
type EventIdPath = { workspaceId: string; eventId: string };
type ActivityQuery = { tenant_id?: string; status?: string; category?: string; limit?: string };
type AckBody = { eventIds?: unknown };

// ---------------------------------------------------------------------------
// Store (for tests — isolated per app instance)
// ---------------------------------------------------------------------------

type ActivityStore = {
    events: Map<string, ActivityEventRecord>;
    sequences: Map<string, number>; // key = tenantId:workspaceId
};

const createStore = (): ActivityStore => ({
    events: new Map(),
    sequences: new Map(),
});

const VALID_CATEGORIES = new Set<string>([
    'runtime', 'approval', 'ci', 'connector', 'provisioning', 'security', 'system',
]);
const VALID_STATUSES = new Set<string>(['unread', 'read', 'acked']);

const toKey = (tenantId: string, workspaceId: string) => `${tenantId}:${workspaceId}`;

// ---------------------------------------------------------------------------
// Repo interface
// ---------------------------------------------------------------------------

type ActivityRepo = {
    listEvents(input: {
        tenantId: string;
        workspaceId: string;
        status?: string;
        category?: string;
        limit: number;
    }): Promise<ActivityEventRecord[]>;
    createEvent(input: {
        tenantId: string;
        workspaceId: string;
        category: ActivityCategory;
        title: string;
        body?: string;
        payload?: Record<string, unknown>;
        correlationId: string;
        nowIso: string;
    }): Promise<ActivityEventRecord>;
    ackEvents(input: {
        tenantId: string;
        workspaceId: string;
        eventIds: string[];
        actor: string;
        nowIso: string;
    }): Promise<{ acked: number }>;
};

// ---------------------------------------------------------------------------
// In-memory repo
// ---------------------------------------------------------------------------

const createInMemoryRepo = (store: ActivityStore): ActivityRepo => ({
    async listEvents({ tenantId, workspaceId, status, category, limit }) {
        const results = Array.from(store.events.values())
            .filter((e) => e.tenantId === tenantId && e.workspaceId === workspaceId)
            .filter((e) => !status || e.status === status)
            .filter((e) => !category || e.category === category)
            .sort((a, b) => b.sequence - a.sequence)
            .slice(0, limit);
        return results;
    },
    async createEvent({ tenantId, workspaceId, category, title, body, payload, correlationId, nowIso }) {
        const key = toKey(tenantId, workspaceId);
        const seq = (store.sequences.get(key) ?? 0) + 1;
        store.sequences.set(key, seq);
        const event: ActivityEventRecord = {
            id: randomUUID(),
            tenantId,
            workspaceId,
            category,
            title,
            body,
            payload,
            status: 'unread',
            sequence: seq,
            correlationId,
            createdAt: nowIso,
        };
        store.events.set(event.id, event);
        return event;
    },
    async ackEvents({ tenantId, workspaceId, eventIds, actor, nowIso }) {
        let acked = 0;
        for (const id of eventIds) {
            const ev = store.events.get(id);
            if (ev && ev.tenantId === tenantId && ev.workspaceId === workspaceId && ev.status !== 'acked') {
                store.events.set(id, { ...ev, status: 'acked', ackedAt: nowIso, ackedBy: actor });
                acked++;
            }
        }
        return { acked };
    },
});

// ---------------------------------------------------------------------------
// DB repo
// ---------------------------------------------------------------------------

const createDbRepo = (prismaClient: Awaited<ReturnType<typeof getPrisma>>): ActivityRepo => ({
    async listEvents({ tenantId, workspaceId, status, category, limit }) {
        const where: Record<string, unknown> = { tenantId, workspaceId };
        if (status) where.status = status;
        if (category) where.category = category;
        const rows = await (prismaClient as any).activityEvent.findMany({
            where,
            orderBy: { sequence: 'desc' },
            take: limit,
        });
        return rows.map((r: any) => ({
            id: r.id,
            tenantId: r.tenantId,
            workspaceId: r.workspaceId,
            category: r.category,
            title: r.title,
            body: r.body ?? undefined,
            payload: r.payload ?? undefined,
            status: r.status,
            sequence: r.sequence,
            ackedAt: r.ackedAt?.toISOString(),
            ackedBy: r.ackedBy ?? undefined,
            correlationId: r.correlationId,
            createdAt: r.createdAt.toISOString(),
        }));
    },
    async createEvent({ tenantId, workspaceId, category, title, body, payload, correlationId, nowIso }) {
        const last = await (prismaClient as any).activityEvent.findFirst({
            where: { tenantId, workspaceId },
            orderBy: { sequence: 'desc' },
            select: { sequence: true },
        });
        const seq = (last?.sequence ?? 0) + 1;
        const row = await (prismaClient as any).activityEvent.create({
            data: {
                id: randomUUID(),
                tenantId,
                workspaceId,
                category,
                title,
                body: body ?? null,
                payload: payload ?? null,
                status: 'unread',
                sequence: seq,
                correlationId,
                createdAt: new Date(nowIso),
                updatedAt: new Date(nowIso),
            },
        });
        return {
            id: row.id,
            tenantId: row.tenantId,
            workspaceId: row.workspaceId,
            category: row.category,
            title: row.title,
            body: row.body ?? undefined,
            payload: row.payload ?? undefined,
            status: row.status,
            sequence: row.sequence,
            correlationId: row.correlationId,
            createdAt: row.createdAt.toISOString(),
        };
    },
    async ackEvents({ tenantId, workspaceId, eventIds, actor, nowIso }) {
        const result = await (prismaClient as any).activityEvent.updateMany({
            where: { id: { in: eventIds }, tenantId, workspaceId, status: { not: 'acked' } },
            data: { status: 'acked', ackedAt: new Date(nowIso), ackedBy: actor, updatedAt: new Date(nowIso) },
        });
        return { acked: result.count };
    },
});

// ---------------------------------------------------------------------------
// Options + helper
// ---------------------------------------------------------------------------

type RegisterActivityRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    now?: () => number;
    store?: ActivityStore;
    repo?: ActivityRepo;
};

const resolveRepo = (options: RegisterActivityRoutesOptions, store: ActivityStore): ActivityRepo => {
    if (options.repo) return options.repo;
    return createInMemoryRepo(store);
};

const resolveSession = (
    request: FastifyRequest,
    options: RegisterActivityRoutesOptions,
    tenantId: string | undefined,
): SessionContext | null => {
    const session = options.getSession(request);
    if (session) return session;
    const runtimeToken = request.headers['x-runtime-token'];
    const configuredToken = process.env.RUNTIME_SERVICE_TOKEN;
    if (configuredToken && typeof runtimeToken === 'string' && runtimeToken === configuredToken && tenantId) {
        return { userId: 'runtime-service', tenantId, workspaceIds: [], scope: 'internal', expiresAt: Date.now() + 60_000 };
    }
    return null;
};

const checkAccess = (session: SessionContext, workspaceId: string): boolean =>
    session.scope === 'internal' || session.workspaceIds.includes(workspaceId);

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerActivityRoutes = async (
    app: FastifyInstance,
    options: RegisterActivityRoutesOptions,
): Promise<void> => {
    const store = options.store ?? createStore();

    // -----------------------------------------------------------------------
    // GET /v1/workspaces/:workspaceId/activity-events
    // -----------------------------------------------------------------------
    app.get<{ Params: WorkspacePath; Querystring: ActivityQuery }>(
        '/v1/workspaces/:workspaceId/activity-events',
        async (request, reply) => {
            const { workspaceId } = request.params;
            const { tenant_id, status, category, limit: limitStr } = request.query;
            const session = resolveSession(request, options, tenant_id);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            if (!checkAccess(session, workspaceId)) return reply.status(403).send({ error: 'forbidden' });

            if (status && !VALID_STATUSES.has(status)) {
                return reply.status(400).send({ error: `status must be one of: ${[...VALID_STATUSES].join(', ')}` });
            }
            if (category && !VALID_CATEGORIES.has(category)) {
                return reply.status(400).send({ error: `category must be one of: ${[...VALID_CATEGORIES].join(', ')}` });
            }

            const limit = Math.min(Math.max(parseInt(limitStr ?? '50', 10) || 50, 1), 200);
            const repo = resolveRepo(options, store);
            const events = await repo.listEvents({ tenantId: session.tenantId, workspaceId, status, category, limit });
            return reply.status(200).send({ workspaceId, events, total: events.length });
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/workspaces/:workspaceId/activity-events  (internal emit)
    // -----------------------------------------------------------------------
    app.post<{ Params: WorkspacePath; Querystring: ActivityQuery; Body: Record<string, unknown> }>(
        '/v1/workspaces/:workspaceId/activity-events',
        async (request, reply) => {
            const { workspaceId } = request.params;
            const { tenant_id } = request.query;
            const session = resolveSession(request, options, tenant_id);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            if (!checkAccess(session, workspaceId)) return reply.status(403).send({ error: 'forbidden' });

            const body = request.body ?? {};
            const category = body.category as string;
            const title = body.title as string;

            if (!category || !VALID_CATEGORIES.has(category)) {
                return reply.status(400).send({ error: `category required; must be one of: ${[...VALID_CATEGORIES].join(', ')}` });
            }
            if (!title || typeof title !== 'string') {
                return reply.status(400).send({ error: 'title is required' });
            }

            const nowIso = new Date(options.now ? options.now() : Date.now()).toISOString();
            const correlationId = randomUUID();
            const repo = resolveRepo(options, store);
            const event = await repo.createEvent({
                tenantId: session.tenantId,
                workspaceId,
                category: category as ActivityCategory,
                title,
                body: typeof body.body === 'string' ? body.body : undefined,
                payload: typeof body.payload === 'object' && body.payload !== null && !Array.isArray(body.payload)
                    ? (body.payload as Record<string, unknown>)
                    : undefined,
                correlationId,
                nowIso,
            });
            return reply.status(201).send(event);
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/workspaces/:workspaceId/activity-events/ack
    // -----------------------------------------------------------------------
    app.post<{ Params: WorkspacePath; Querystring: ActivityQuery; Body: AckBody }>(
        '/v1/workspaces/:workspaceId/activity-events/ack',
        async (request, reply) => {
            const { workspaceId } = request.params;
            const { tenant_id } = request.query;
            const session = resolveSession(request, options, tenant_id);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            if (!checkAccess(session, workspaceId)) return reply.status(403).send({ error: 'forbidden' });

            const body = request.body ?? {};
            if (!Array.isArray(body.eventIds) || !body.eventIds.every((id: unknown) => typeof id === 'string')) {
                return reply.status(400).send({ error: 'eventIds must be an array of strings' });
            }

            const nowIso = new Date(options.now ? options.now() : Date.now()).toISOString();
            const repo = resolveRepo(options, store);
            const result = await repo.ackEvents({
                tenantId: session.tenantId,
                workspaceId,
                eventIds: body.eventIds,
                actor: session.userId,
                nowIso,
            });
            return reply.status(200).send({ workspaceId, ...result });
        },
    );
};
