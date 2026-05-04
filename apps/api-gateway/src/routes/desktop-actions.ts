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

type DesktopActionType = 'launch' | 'click' | 'type' | 'upload' | 'screenshot' | 'select_file';
type DesktopActionResult = 'success' | 'failed' | 'retrying' | 'approval_pending' | 'blocked';
type DesktopActionRisk = 'low' | 'medium' | 'high';
type DesktopActionRetryClass = 'retryable' | 'non_retryable';

type DesktopActionRecord = {
    id: string;
    tenantId: string;
    workspaceId: string;
    actionType: DesktopActionType;
    target?: string;
    inputPayload?: Record<string, unknown>;
    result: DesktopActionResult;
    riskLevel: DesktopActionRisk;
    retryClass: DesktopActionRetryClass;
    retryCount: number;
    screenshotRef?: string;
    approvalId?: string;
    errorMessage?: string;
    completedAt?: string;
    correlationId: string;
    createdAt: string;
};

type WorkspacePath = { workspaceId: string };
type ActionIdPath = { workspaceId: string; actionId: string };
type DesktopQuery = { tenant_id?: string };
type CreateActionBody = {
    actionType?: unknown;
    target?: unknown;
    inputPayload?: unknown;
    riskLevel?: unknown;
};
type UpdateActionBody = {
    result?: unknown;
    screenshotRef?: unknown;
    errorMessage?: unknown;
    approvalId?: unknown;
    retryCount?: unknown;
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type DesktopActionStore = {
    actions: Map<string, DesktopActionRecord>;
};

const createStore = (): DesktopActionStore => ({ actions: new Map() });

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTION_TYPES = new Set<string>(['launch', 'click', 'type', 'upload', 'screenshot', 'select_file']);
const VALID_RESULTS = new Set<string>(['success', 'failed', 'retrying', 'approval_pending', 'blocked']);
const VALID_RISK_LEVELS = new Set<string>(['low', 'medium', 'high']);
const HIGH_RISK_ACTIONS = new Set<DesktopActionType>(['upload', 'type']);

const retryClassFor = (actionType: DesktopActionType): DesktopActionRetryClass => {
    const nonRetryable = new Set<DesktopActionType>(['upload', 'screenshot']);
    return nonRetryable.has(actionType) ? 'non_retryable' : 'retryable';
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

// ---------------------------------------------------------------------------
// Repo interface
// ---------------------------------------------------------------------------

type DesktopActionRepo = {
    listActions(input: { tenantId: string; workspaceId: string; limit: number }): Promise<DesktopActionRecord[]>;
    createAction(input: {
        tenantId: string;
        workspaceId: string;
        actionType: DesktopActionType;
        target?: string;
        inputPayload?: Record<string, unknown>;
        riskLevel: DesktopActionRisk;
        result: DesktopActionResult;
        approvalId?: string;
        correlationId: string;
        nowIso: string;
    }): Promise<DesktopActionRecord>;
    updateAction(input: {
        id: string;
        tenantId: string;
        workspaceId: string;
        result?: DesktopActionResult;
        screenshotRef?: string;
        errorMessage?: string;
        approvalId?: string;
        retryCount?: number;
        nowIso: string;
    }): Promise<DesktopActionRecord | null>;
    createAuditEvent(input: {
        tenantId: string;
        workspaceId: string;
        actor: string;
        summary: string;
        correlationId: string;
    }): Promise<void>;
};

// ---------------------------------------------------------------------------
// In-memory repo
// ---------------------------------------------------------------------------

const createInMemoryRepo = (store: DesktopActionStore): DesktopActionRepo => ({
    async listActions({ tenantId, workspaceId, limit }) {
        return Array.from(store.actions.values())
            .filter((a) => a.tenantId === tenantId && a.workspaceId === workspaceId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, limit);
    },
    async createAction({ tenantId, workspaceId, actionType, target, inputPayload, riskLevel, result, approvalId, correlationId, nowIso }) {
        const action: DesktopActionRecord = {
            id: randomUUID(),
            tenantId,
            workspaceId,
            actionType,
            target,
            inputPayload,
            result,
            riskLevel,
            retryClass: retryClassFor(actionType),
            retryCount: 0,
            approvalId,
            correlationId,
            createdAt: nowIso,
        };
        store.actions.set(action.id, action);
        return action;
    },
    async updateAction({ id, tenantId, workspaceId, result, screenshotRef, errorMessage, approvalId, retryCount, nowIso }) {
        const existing = store.actions.get(id);
        if (!existing || existing.tenantId !== tenantId || existing.workspaceId !== workspaceId) return null;
        const updated: DesktopActionRecord = {
            ...existing,
            ...(result !== undefined && { result }),
            ...(screenshotRef !== undefined && { screenshotRef }),
            ...(errorMessage !== undefined && { errorMessage }),
            ...(approvalId !== undefined && { approvalId }),
            ...(retryCount !== undefined && { retryCount }),
            completedAt: result === 'success' || result === 'failed' || result === 'blocked' ? nowIso : existing.completedAt,
        };
        store.actions.set(id, updated);
        return updated;
    },
    async createAuditEvent() {
        // no-op in tests
    },
});

// ---------------------------------------------------------------------------
// DB repo
// ---------------------------------------------------------------------------

const createDbRepo = (prismaClient: Awaited<ReturnType<typeof getPrisma>>): DesktopActionRepo => ({
    async listActions({ tenantId, workspaceId, limit }) {
        const rows = await (prismaClient as any).desktopAction.findMany({
            where: { tenantId, workspaceId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
        return rows.map((r: any) => ({
            id: r.id,
            tenantId: r.tenantId,
            workspaceId: r.workspaceId,
            actionType: r.actionType as DesktopActionType,
            target: r.target ?? undefined,
            inputPayload: r.inputPayload ?? undefined,
            result: r.result as DesktopActionResult,
            riskLevel: r.riskLevel as DesktopActionRisk,
            retryClass: r.retryClass as DesktopActionRetryClass,
            retryCount: r.retryCount,
            screenshotRef: r.screenshotRef ?? undefined,
            approvalId: r.approvalId ?? undefined,
            errorMessage: r.errorMessage ?? undefined,
            completedAt: r.completedAt?.toISOString(),
            correlationId: r.correlationId,
            createdAt: r.createdAt.toISOString(),
        }));
    },
    async createAction({ tenantId, workspaceId, actionType, target, inputPayload, riskLevel, result, approvalId, correlationId, nowIso }) {
        const row = await (prismaClient as any).desktopAction.create({
            data: {
                id: randomUUID(),
                tenantId,
                workspaceId,
                actionType,
                target: target ?? null,
                inputPayload: inputPayload ?? null,
                result,
                riskLevel,
                retryClass: retryClassFor(actionType),
                retryCount: 0,
                approvalId: approvalId ?? null,
                correlationId,
                createdAt: new Date(nowIso),
                updatedAt: new Date(nowIso),
            },
        });
        return {
            id: row.id,
            tenantId: row.tenantId,
            workspaceId: row.workspaceId,
            actionType: row.actionType as DesktopActionType,
            target: row.target ?? undefined,
            inputPayload: row.inputPayload ?? undefined,
            result: row.result as DesktopActionResult,
            riskLevel: row.riskLevel as DesktopActionRisk,
            retryClass: row.retryClass as DesktopActionRetryClass,
            retryCount: row.retryCount,
            approvalId: row.approvalId ?? undefined,
            correlationId: row.correlationId,
            createdAt: row.createdAt.toISOString(),
        };
    },
    async updateAction({ id, tenantId, workspaceId, result, screenshotRef, errorMessage, approvalId, retryCount, nowIso }) {
        const existing = await (prismaClient as any).desktopAction.findFirst({ where: { id, tenantId, workspaceId } });
        if (!existing) return null;
        const completedAt =
            result === 'success' || result === 'failed' || result === 'blocked' ? new Date(nowIso) : existing.completedAt;
        const row = await (prismaClient as any).desktopAction.update({
            where: { id },
            data: {
                ...(result !== undefined && { result }),
                ...(screenshotRef !== undefined && { screenshotRef }),
                ...(errorMessage !== undefined && { errorMessage }),
                ...(approvalId !== undefined && { approvalId }),
                ...(retryCount !== undefined && { retryCount }),
                completedAt,
                updatedAt: new Date(nowIso),
            },
        });
        return {
            id: row.id,
            tenantId: row.tenantId,
            workspaceId: row.workspaceId,
            actionType: row.actionType as DesktopActionType,
            target: row.target ?? undefined,
            inputPayload: row.inputPayload ?? undefined,
            result: row.result as DesktopActionResult,
            riskLevel: row.riskLevel as DesktopActionRisk,
            retryClass: row.retryClass as DesktopActionRetryClass,
            retryCount: row.retryCount,
            screenshotRef: row.screenshotRef ?? undefined,
            approvalId: row.approvalId ?? undefined,
            errorMessage: row.errorMessage ?? undefined,
            completedAt: row.completedAt?.toISOString(),
            correlationId: row.correlationId,
            createdAt: row.createdAt.toISOString(),
        };
    },
    async createAuditEvent({ tenantId, workspaceId, actor, summary, correlationId }) {
        await (prismaClient as any).auditEvent.create({
            data: {
                id: randomUUID(),
                tenantId,
                workspaceId,
                actor,
                eventType: 'audit_event',
                severity: 'info',
                summary,
                correlationId,
                createdAt: new Date(),
            },
        });
    },
});

// ---------------------------------------------------------------------------
// Options + helpers
// ---------------------------------------------------------------------------

type RegisterDesktopActionRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    now?: () => number;
    store?: DesktopActionStore;
    repo?: DesktopActionRepo;
    requireApprovalForHighRisk?: boolean;
};

const resolveRepo = (options: RegisterDesktopActionRoutesOptions, store: DesktopActionStore): DesktopActionRepo => {
    if (options.repo) return options.repo;
    return createInMemoryRepo(store);
};

const resolveSession = (
    request: FastifyRequest,
    options: RegisterDesktopActionRoutesOptions,
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

export const registerDesktopActionRoutes = async (
    app: FastifyInstance,
    options: RegisterDesktopActionRoutesOptions,
): Promise<void> => {
    const store = options.store ?? createStore();
    const requireApproval = options.requireApprovalForHighRisk ?? true;

    // -----------------------------------------------------------------------
    // GET /v1/workspaces/:workspaceId/desktop-actions
    // -----------------------------------------------------------------------
    app.get<{ Params: WorkspacePath; Querystring: DesktopQuery & { limit?: string } }>(
        '/v1/workspaces/:workspaceId/desktop-actions',
        async (request, reply) => {
            const { workspaceId } = request.params;
            const session = resolveSession(request, options, request.query.tenant_id);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            if (!checkAccess(session, workspaceId)) return reply.status(403).send({ error: 'forbidden' });

            const limit = Math.min(Math.max(parseInt(request.query.limit ?? '50', 10) || 50, 1), 200);
            const repo = resolveRepo(options, store);
            const actions = await repo.listActions({ tenantId: session.tenantId, workspaceId, limit });
            return reply.status(200).send({ workspaceId, actions, total: actions.length });
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/workspaces/:workspaceId/desktop-actions
    // -----------------------------------------------------------------------
    app.post<{ Params: WorkspacePath; Querystring: DesktopQuery; Body: CreateActionBody }>(
        '/v1/workspaces/:workspaceId/desktop-actions',
        async (request, reply) => {
            const { workspaceId } = request.params;
            const session = resolveSession(request, options, request.query.tenant_id);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            if (!checkAccess(session, workspaceId)) return reply.status(403).send({ error: 'forbidden' });

            const body = request.body ?? {};
            const actionType = body.actionType as string;
            const riskLevel = (typeof body.riskLevel === 'string' ? body.riskLevel : 'low') as DesktopActionRisk;

            if (!actionType || !VALID_ACTION_TYPES.has(actionType)) {
                return reply.status(400).send({ error: `actionType required; must be one of: ${[...VALID_ACTION_TYPES].join(', ')}` });
            }
            if (!VALID_RISK_LEVELS.has(riskLevel)) {
                return reply.status(400).send({ error: `riskLevel must be one of: ${[...VALID_RISK_LEVELS].join(', ')}` });
            }
            if (body.inputPayload !== undefined && !isRecord(body.inputPayload)) {
                return reply.status(400).send({ error: 'inputPayload must be an object' });
            }

            // High-risk actions require approval routing
            const isHighRisk = riskLevel === 'high' || HIGH_RISK_ACTIONS.has(actionType as DesktopActionType);
            const result: DesktopActionResult = requireApproval && isHighRisk ? 'approval_pending' : 'success';
            const approvalId = result === 'approval_pending' ? randomUUID() : undefined;

            const nowIso = new Date(options.now ? options.now() : Date.now()).toISOString();
            const correlationId = randomUUID();
            const repo = resolveRepo(options, store);

            const action = await repo.createAction({
                tenantId: session.tenantId,
                workspaceId,
                actionType: actionType as DesktopActionType,
                target: typeof body.target === 'string' ? body.target : undefined,
                inputPayload: body.inputPayload as Record<string, unknown> | undefined,
                riskLevel,
                result,
                approvalId,
                correlationId,
                nowIso,
            });

            await repo.createAuditEvent({
                tenantId: session.tenantId,
                workspaceId,
                actor: session.userId,
                summary: `desktop_action_created: type=${actionType} risk=${riskLevel} result=${result}`,
                correlationId,
            });

            return reply.status(201).send(action);
        },
    );

    // -----------------------------------------------------------------------
    // PUT /v1/workspaces/:workspaceId/desktop-actions/:actionId
    // -----------------------------------------------------------------------
    app.put<{ Params: ActionIdPath; Querystring: DesktopQuery; Body: UpdateActionBody }>(
        '/v1/workspaces/:workspaceId/desktop-actions/:actionId',
        async (request, reply) => {
            const { workspaceId, actionId } = request.params;
            const session = resolveSession(request, options, request.query.tenant_id);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            if (!checkAccess(session, workspaceId)) return reply.status(403).send({ error: 'forbidden' });

            const body = request.body ?? {};
            if (body.result !== undefined && !VALID_RESULTS.has(body.result as string)) {
                return reply.status(400).send({ error: `result must be one of: ${[...VALID_RESULTS].join(', ')}` });
            }
            if (body.retryCount !== undefined && typeof body.retryCount !== 'number') {
                return reply.status(400).send({ error: 'retryCount must be a number' });
            }

            const nowIso = new Date(options.now ? options.now() : Date.now()).toISOString();
            const correlationId = randomUUID();
            const repo = resolveRepo(options, store);

            const updated = await repo.updateAction({
                id: actionId,
                tenantId: session.tenantId,
                workspaceId,
                result: body.result as DesktopActionResult | undefined,
                screenshotRef: body.screenshotRef as string | undefined,
                errorMessage: body.errorMessage as string | undefined,
                approvalId: body.approvalId as string | undefined,
                retryCount: body.retryCount as number | undefined,
                nowIso,
            });

            if (!updated) return reply.status(404).send({ error: 'desktop action not found' });

            await repo.createAuditEvent({
                tenantId: session.tenantId,
                workspaceId,
                actor: session.userId,
                summary: `desktop_action_updated: id=${actionId} result=${updated.result}`,
                correlationId,
            });

            return reply.status(200).send({ ...updated, correlationId });
        },
    );
};
