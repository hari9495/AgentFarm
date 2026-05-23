import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WorkMemoryEntry = {
    key: string;
    value: unknown;
    tags?: string[];
    updatedAt: string;
};

type WorkMemoryMergeMode = 'replace' | 'merge' | 'append';

type WorkMemoryRecord = {
    id: string;
    tenantId: string;
    workspaceId: string;
    memoryVersion: number;
    entries: WorkMemoryEntry[];
    summary?: string;
    correlationId: string;
    createdAt: string;
    updatedAt: string;
};

type NextActionItem = {
    action: string;
    reason: string;
    confidence: number;
    requiresApproval: boolean;
    priority: 'high' | 'medium' | 'low';
};

type DailyPlanRecord = {
    id: string;
    tenantId: string;
    workspaceId: string;
    objective?: string;
    constraints?: string[];
    nextActions: NextActionItem[];
    risks: string[];
    approvalsNeeded: string[];
    correlationId: string;
    createdAt: string;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

type WorkspacePath = { workspaceId: string };
type MemQuery = { tenant_id?: string };

type PutMemoryBody = {
    entries?: unknown;
    mergeMode?: unknown;
    summary?: unknown;
};

type DailyPlanBody = {
    objective?: unknown;
    constraints?: unknown;
};

// ---------------------------------------------------------------------------
// Merge logic
// ---------------------------------------------------------------------------

const applyMerge = (
    existing: WorkMemoryEntry[],
    incoming: WorkMemoryEntry[],
    mode: WorkMemoryMergeMode,
): WorkMemoryEntry[] => {
    switch (mode) {
        case 'replace':
            return incoming;
        case 'merge': {
            const map = new Map(existing.map((e) => [e.key, e]));
            for (const entry of incoming) {
                map.set(entry.key, entry);
            }
            return Array.from(map.values());
        }
        case 'append': {
            const existingKeys = new Set(existing.map((e) => e.key));
            const added = incoming.filter((e) => !existingKeys.has(e.key));
            return [...existing, ...added];
        }
        default:
            return incoming;
    }
};

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

const APPROVAL_KEYWORDS = ['deploy', 'merge', 'delete', 'promote', 'publish', 'release'];

const derivePlan = (
    entries: WorkMemoryEntry[],
    objective?: string,
    constraints?: string[],
): Omit<DailyPlanRecord, 'id' | 'tenantId' | 'workspaceId' | 'correlationId' | 'createdAt'> => {
    const nextActions: NextActionItem[] = [];
    const risks: string[] = [];
    const approvalsNeeded: string[] = [];

    // Scan entries for actionable patterns
    for (const entry of entries) {
        const raw = JSON.stringify(entry.value).toLowerCase();
        const keyLower = entry.key.toLowerCase();

        if (keyLower.includes('pending_approval') || raw.includes('pending_approval')) {
            const action = `Review and approve pending item: ${entry.key}`;
            nextActions.push({ action, reason: 'Pending approval blocks downstream work', confidence: 0.9, requiresApproval: true, priority: 'high' });
            approvalsNeeded.push(entry.key);
        } else if (keyLower.includes('failed') || raw.includes('"failed"') || raw.includes('"error"')) {
            nextActions.push({
                action: `Investigate and fix failure: ${entry.key}`,
                reason: 'Failure detected in work memory state',
                confidence: 0.75,
                requiresApproval: false,
                priority: 'high',
            });
            risks.push(`Unresolved failure in ${entry.key}`);
        } else if (keyLower.includes('todo') || keyLower.includes('task') || raw.includes('"todo"')) {
            nextActions.push({
                action: `Complete pending task: ${entry.key}`,
                reason: 'Task recorded in work memory, not yet completed',
                confidence: 0.6,
                requiresApproval: false,
                priority: 'medium',
            });
        } else if (APPROVAL_KEYWORDS.some((kw) => keyLower.includes(kw) || raw.includes(kw))) {
            nextActions.push({
                action: `Proceed with ${entry.key} (requires approval gate)`,
                reason: 'Action contains deployment/release keyword — approval required before execution',
                confidence: 0.7,
                requiresApproval: true,
                priority: 'medium',
            });
            approvalsNeeded.push(entry.key);
        }
    }

    // If objective provided, add it as the first action if not already covered
    if (objective && !nextActions.some((a) => a.action.toLowerCase().includes(objective.toLowerCase().slice(0, 20)))) {
        nextActions.unshift({
            action: `Work toward objective: ${objective}`,
            reason: 'Session objective specified by user',
            confidence: 0.8,
            requiresApproval: false,
            priority: 'high',
        });
    }

    // Constraint risks
    if (constraints) {
        for (const c of constraints) {
            risks.push(`Constraint active: ${c}`);
        }
    }

    // Ensure at least one next action
    if (nextActions.length === 0) {
        nextActions.push({
            action: 'Review current work memory and define next steps',
            reason: 'No explicit pending items detected in memory',
            confidence: 0.5,
            requiresApproval: false,
            priority: 'low',
        });
    }

    return { objective, constraints, nextActions, risks, approvalsNeeded };
};

// ---------------------------------------------------------------------------
// Store + Repo
// ---------------------------------------------------------------------------

type MemStore = {
    memory: Map<string, WorkMemoryRecord>; // key: "${tenantId}:${workspaceId}"
    plans: Map<string, DailyPlanRecord>;
};

const createStore = (): MemStore => ({ memory: new Map(), plans: new Map() });

type MemRepo = {
    getMemory(input: { tenantId: string; workspaceId: string }): Promise<WorkMemoryRecord | null>;
    upsertMemory(input: {
        tenantId: string;
        workspaceId: string;
        entries: WorkMemoryEntry[];
        summary?: string;
        correlationId: string;
        nowIso: string;
    }): Promise<WorkMemoryRecord>;
    createAuditEvent(input: {
        tenantId: string;
        workspaceId: string;
        actor: string;
        summary: string;
        correlationId: string;
    }): Promise<void>;
};

const createInMemoryRepo = (store: MemStore): MemRepo => ({
    async getMemory({ tenantId, workspaceId }) {
        return store.memory.get(`${tenantId}:${workspaceId}`) ?? null;
    },
    async upsertMemory({ tenantId, workspaceId, entries, summary, correlationId, nowIso }) {
        const key = `${tenantId}:${workspaceId}`;
        const existing = store.memory.get(key);
        const record: WorkMemoryRecord = existing
            ? { ...existing, entries, summary: summary ?? existing.summary, memoryVersion: existing.memoryVersion + 1, updatedAt: nowIso }
            : { id: randomUUID(), tenantId, workspaceId, memoryVersion: 1, entries, summary, correlationId, createdAt: nowIso, updatedAt: nowIso };
        store.memory.set(key, record);
        return record;
    },
    async createAuditEvent() {
        // no-op in tests
    },
});

// ---------------------------------------------------------------------------
// Options + helpers
// ---------------------------------------------------------------------------

type RegisterWorkMemoryRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    now?: () => number;
    store?: MemStore;
    repo?: MemRepo;
};

const resolveRepo = (options: RegisterWorkMemoryRoutesOptions, store: MemStore): MemRepo => {
    if (options.repo) return options.repo;
    return createInMemoryRepo(store);
};

const resolveSession = (
    request: FastifyRequest,
    options: RegisterWorkMemoryRoutesOptions,
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

const normalizeEntries = (raw: unknown, nowIso: string): WorkMemoryEntry[] => {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((e): e is Record<string, unknown> => e !== null && typeof e === 'object')
        .filter((e) => typeof e.key === 'string')
        .map((e) => ({
            key: e.key as string,
            value: e.value,
            tags: Array.isArray(e.tags) ? (e.tags as string[]).filter((t) => typeof t === 'string') : undefined,
            updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : nowIso,
        }));
};

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerWorkMemoryRoutes = async (
    app: FastifyInstance,
    options: RegisterWorkMemoryRoutesOptions,
): Promise<void> => {
    const store = options.store ?? createStore();

    // -----------------------------------------------------------------------
    // GET /v1/workspaces/:workspaceId/work-memory
    // -----------------------------------------------------------------------
    app.get<{ Params: WorkspacePath; Querystring: MemQuery }>(
        '/v1/workspaces/:workspaceId/work-memory',
        async (request, reply) => {
            const { workspaceId } = request.params;
            const session = resolveSession(request, options, request.query.tenant_id);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            if (!checkAccess(session, workspaceId)) return reply.status(403).send({ error: 'forbidden' });

            const repo = resolveRepo(options, store);
            const mem = await repo.getMemory({ tenantId: session.tenantId, workspaceId });

            return reply.status(200).send({
                memoryVersion: mem?.memoryVersion ?? 0,
                entries: mem?.entries ?? [],
                summary: mem?.summary ?? null,
                updatedAt: mem?.updatedAt ?? null,
            });
        },
    );

    // -----------------------------------------------------------------------
    // PUT /v1/workspaces/:workspaceId/work-memory
    // -----------------------------------------------------------------------
    app.put<{ Params: WorkspacePath; Querystring: MemQuery; Body: PutMemoryBody }>(
        '/v1/workspaces/:workspaceId/work-memory',
        async (request, reply) => {
            const { workspaceId } = request.params;
            const session = resolveSession(request, options, request.query.tenant_id);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            if (!checkAccess(session, workspaceId)) return reply.status(403).send({ error: 'forbidden' });

            const body = request.body ?? {};
            const nowIso = new Date(options.now ? options.now() : Date.now()).toISOString();
            const incoming = normalizeEntries(body.entries, nowIso);
            const rawMode = typeof body.mergeMode === 'string' ? body.mergeMode : 'replace';
            const mergeMode: WorkMemoryMergeMode = ['replace', 'merge', 'append'].includes(rawMode)
                ? (rawMode as WorkMemoryMergeMode)
                : 'replace';
            const summary = typeof body.summary === 'string' ? body.summary : undefined;

            const repo = resolveRepo(options, store);
            const existing = await repo.getMemory({ tenantId: session.tenantId, workspaceId });
            const mergedEntries = applyMerge(existing?.entries ?? [], incoming, mergeMode);

            const correlationId = randomUUID();
            const record = await repo.upsertMemory({
                tenantId: session.tenantId,
                workspaceId,
                entries: mergedEntries,
                summary,
                correlationId,
                nowIso,
            });

            await repo.createAuditEvent({
                tenantId: session.tenantId,
                workspaceId,
                actor: session.userId,
                summary: `work_memory_updated: mergeMode=${mergeMode} entries=${mergedEntries.length} version=${record.memoryVersion}`,
                correlationId,
            });

            return reply.status(200).send({
                memoryVersion: record.memoryVersion,
                updatedAt: record.updatedAt,
                correlationId,
            });
        },
    );

    // -----------------------------------------------------------------------
    // GET /v1/workspaces/:workspaceId/next-actions
    // -----------------------------------------------------------------------
    app.get<{ Params: WorkspacePath; Querystring: MemQuery }>(
        '/v1/workspaces/:workspaceId/next-actions',
        async (request, reply) => {
            const { workspaceId } = request.params;
            const session = resolveSession(request, options, request.query.tenant_id);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            if (!checkAccess(session, workspaceId)) return reply.status(403).send({ error: 'forbidden' });

            const repo = resolveRepo(options, store);
            const mem = await repo.getMemory({ tenantId: session.tenantId, workspaceId });
            const plan = derivePlan(mem?.entries ?? []);

            return reply.status(200).send({ items: plan.nextActions });
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/workspaces/:workspaceId/daily-plan
    // -----------------------------------------------------------------------
    app.post<{ Params: WorkspacePath; Querystring: MemQuery; Body: DailyPlanBody }>(
        '/v1/workspaces/:workspaceId/daily-plan',
        async (request, reply) => {
            const { workspaceId } = request.params;
            const session = resolveSession(request, options, request.query.tenant_id);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            if (!checkAccess(session, workspaceId)) return reply.status(403).send({ error: 'forbidden' });

            const body = request.body ?? {};
            const objective = typeof body.objective === 'string' ? body.objective : undefined;
            const constraints: string[] | undefined = Array.isArray(body.constraints)
                ? (body.constraints as string[]).filter((c) => typeof c === 'string')
                : undefined;

            const repo = resolveRepo(options, store);
            const mem = await repo.getMemory({ tenantId: session.tenantId, workspaceId });
            const plan = derivePlan(mem?.entries ?? [], objective, constraints);

            const nowIso = new Date(options.now ? options.now() : Date.now()).toISOString();
            const correlationId = randomUUID();

            const planRecord: DailyPlanRecord = {
                id: randomUUID(),
                tenantId: session.tenantId,
                workspaceId,
                ...plan,
                correlationId,
                createdAt: nowIso,
            };

            return reply.status(201).send({
                planId: planRecord.id,
                objective: planRecord.objective,
                constraints: planRecord.constraints ?? [],
                nextActions: planRecord.nextActions,
                risks: planRecord.risks,
                approvalsNeeded: planRecord.approvalsNeeded,
                correlationId,
            });
        },
    );
};
