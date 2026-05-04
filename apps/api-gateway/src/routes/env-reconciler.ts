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

type ToolchainEntryStatus = 'ok' | 'missing' | 'version_mismatch' | 'unknown';
type ReconcileStatus = 'clean' | 'drifted' | 'reconciling' | 'failed';

type ToolchainEntry = {
    name: string;
    requiredVersion: string;
    actualVersion?: string;
    status: ToolchainEntryStatus;
};

type EnvProfileRecord = {
    tenantId: string;
    workspaceId: string;
    toolchain: ToolchainEntry[];
    reconcileStatus: ReconcileStatus;
    lastReconcileAt?: string;
    driftReport?: Record<string, unknown>;
    updatedAt: string;
    createdAt: string;
};

type ReconcileResult = {
    profile: EnvProfileRecord;
    drifted: ToolchainEntry[];
    dryRun: boolean;
    correlationId: string;
};

type WorkspacePath = { workspaceId: string };
type EnvQuery = { tenant_id?: string };
type EnvBody = { toolchain?: unknown };
type ReconcileBody = { dryRun?: unknown };

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type EnvStore = {
    profileByKey: Map<string, EnvProfileRecord>;
};

const createStore = (): EnvStore => ({
    profileByKey: new Map(),
});

const toKey = (tenantId: string, workspaceId: string) => `${tenantId}:${workspaceId}`;

const VALID_SHELLS = new Set<string>(['ok', 'missing', 'version_mismatch', 'unknown']);

const isToolchainArray = (value: unknown): value is ToolchainEntry[] => {
    if (!Array.isArray(value)) return false;
    return value.every(
        (v) =>
            typeof v === 'object' &&
            v !== null &&
            typeof (v as Record<string, unknown>).name === 'string' &&
            typeof (v as Record<string, unknown>).requiredVersion === 'string',
    );
};

// ---------------------------------------------------------------------------
// Repo interface
// ---------------------------------------------------------------------------

type EnvRepo = {
    getProfile(input: { tenantId: string; workspaceId: string }): Promise<EnvProfileRecord | null>;
    upsertProfile(input: {
        tenantId: string;
        workspaceId: string;
        toolchain: ToolchainEntry[];
        nowIso: string;
    }): Promise<EnvProfileRecord>;
    reconcile(input: {
        tenantId: string;
        workspaceId: string;
        dryRun: boolean;
        nowIso: string;
    }): Promise<ReconcileResult>;
    createAuditEvent(input: {
        tenantId: string;
        workspaceId: string;
        actor: string;
        summary: string;
        correlationId: string;
    }): Promise<void>;
};

// ---------------------------------------------------------------------------
// Reconcile logic (shared by both repos)
// ---------------------------------------------------------------------------

const computeDrift = (toolchain: ToolchainEntry[]): ToolchainEntry[] =>
    toolchain.filter((t) => {
        if (t.status === 'ok') return false;
        if (t.status === 'missing' || t.status === 'version_mismatch') return true;
        // "unknown" or no actualVersion → treat as drifted
        return !t.actualVersion;
    });

// ---------------------------------------------------------------------------
// In-memory repo
// ---------------------------------------------------------------------------

const createInMemoryRepo = (store: EnvStore): EnvRepo => ({
    async getProfile({ tenantId, workspaceId }) {
        return store.profileByKey.get(toKey(tenantId, workspaceId)) ?? null;
    },
    async upsertProfile({ tenantId, workspaceId, toolchain, nowIso }) {
        const key = toKey(tenantId, workspaceId);
        const existing = store.profileByKey.get(key);
        const profile: EnvProfileRecord = {
            tenantId,
            workspaceId,
            toolchain,
            reconcileStatus: existing?.reconcileStatus ?? 'clean',
            lastReconcileAt: existing?.lastReconcileAt,
            driftReport: existing?.driftReport,
            updatedAt: nowIso,
            createdAt: existing?.createdAt ?? nowIso,
        };
        store.profileByKey.set(key, profile);
        return profile;
    },
    async reconcile({ tenantId, workspaceId, dryRun, nowIso }) {
        const correlationId = randomUUID();
        const key = toKey(tenantId, workspaceId);
        const existing = store.profileByKey.get(key);
        const toolchain = existing?.toolchain ?? [];
        const drifted = computeDrift(toolchain);
        const reconcileStatus: ReconcileStatus = drifted.length > 0 ? 'drifted' : 'clean';
        const driftReport: Record<string, unknown> = {
            drifted_count: drifted.length,
            entries: drifted.map((d) => ({ name: d.name, required: d.requiredVersion, actual: d.actualVersion, status: d.status })),
            run_at: nowIso,
            dry_run: dryRun,
        };
        if (!dryRun) {
            const updated: EnvProfileRecord = {
                ...(existing ?? { tenantId, workspaceId, toolchain, createdAt: nowIso }),
                tenantId,
                workspaceId,
                toolchain,
                reconcileStatus,
                lastReconcileAt: nowIso,
                driftReport,
                updatedAt: nowIso,
            };
            store.profileByKey.set(key, updated);
            return { profile: updated, drifted, dryRun, correlationId };
        }
        const preview: EnvProfileRecord = {
            ...(existing ?? { tenantId, workspaceId, toolchain, createdAt: nowIso }),
            tenantId,
            workspaceId,
            toolchain,
            reconcileStatus,
            driftReport,
            updatedAt: nowIso,
        };
        return { profile: preview, drifted, dryRun, correlationId };
    },
    async createAuditEvent() {
        // no-op in tests
    },
});

// ---------------------------------------------------------------------------
// DB repo
// ---------------------------------------------------------------------------

const createDbRepo = (prismaClient: Awaited<ReturnType<typeof getPrisma>>): EnvRepo => ({
    async getProfile({ tenantId, workspaceId }) {
        const row = await (prismaClient as any).envProfile.findUnique({
            where: { tenantId_workspaceId: { tenantId, workspaceId } },
        });
        if (!row) return null;
        return {
            tenantId: row.tenantId,
            workspaceId: row.workspaceId,
            toolchain: (row.toolchain as ToolchainEntry[]) ?? [],
            reconcileStatus: row.reconcileStatus as ReconcileStatus,
            lastReconcileAt: row.lastReconcileAt?.toISOString(),
            driftReport: row.driftReport as Record<string, unknown> | undefined,
            updatedAt: row.updatedAt.toISOString(),
            createdAt: row.createdAt.toISOString(),
        };
    },
    async upsertProfile({ tenantId, workspaceId, toolchain, nowIso }) {
        const row = await (prismaClient as any).envProfile.upsert({
            where: { tenantId_workspaceId: { tenantId, workspaceId } },
            update: { toolchain, updatedAt: new Date(nowIso) },
            create: {
                id: randomUUID(),
                tenantId,
                workspaceId,
                toolchain,
                reconcileStatus: 'clean',
                createdAt: new Date(nowIso),
                updatedAt: new Date(nowIso),
            },
        });
        return {
            tenantId: row.tenantId,
            workspaceId: row.workspaceId,
            toolchain: (row.toolchain as ToolchainEntry[]) ?? [],
            reconcileStatus: row.reconcileStatus as ReconcileStatus,
            lastReconcileAt: row.lastReconcileAt?.toISOString(),
            driftReport: row.driftReport as Record<string, unknown> | undefined,
            updatedAt: row.updatedAt.toISOString(),
            createdAt: row.createdAt.toISOString(),
        };
    },
    async reconcile({ tenantId, workspaceId, dryRun, nowIso }) {
        const correlationId = randomUUID();
        const existing = await (prismaClient as any).envProfile.findUnique({
            where: { tenantId_workspaceId: { tenantId, workspaceId } },
        });
        const toolchain: ToolchainEntry[] = (existing?.toolchain as ToolchainEntry[]) ?? [];
        const drifted = computeDrift(toolchain);
        const reconcileStatus: ReconcileStatus = drifted.length > 0 ? 'drifted' : 'clean';
        const driftReport: Record<string, unknown> = {
            drifted_count: drifted.length,
            entries: drifted.map((d) => ({ name: d.name, required: d.requiredVersion, actual: d.actualVersion, status: d.status })),
            run_at: nowIso,
            dry_run: dryRun,
        };
        if (!dryRun) {
            const row = await (prismaClient as any).envProfile.upsert({
                where: { tenantId_workspaceId: { tenantId, workspaceId } },
                update: { reconcileStatus, lastReconcileAt: new Date(nowIso), driftReport, updatedAt: new Date(nowIso) },
                create: {
                    id: randomUUID(),
                    tenantId,
                    workspaceId,
                    toolchain: [],
                    reconcileStatus,
                    lastReconcileAt: new Date(nowIso),
                    driftReport,
                    createdAt: new Date(nowIso),
                    updatedAt: new Date(nowIso),
                },
            });
            const profile: EnvProfileRecord = {
                tenantId: row.tenantId,
                workspaceId: row.workspaceId,
                toolchain: (row.toolchain as ToolchainEntry[]) ?? [],
                reconcileStatus: row.reconcileStatus as ReconcileStatus,
                lastReconcileAt: row.lastReconcileAt?.toISOString(),
                driftReport: row.driftReport as Record<string, unknown> | undefined,
                updatedAt: row.updatedAt.toISOString(),
                createdAt: row.createdAt.toISOString(),
            };
            return { profile, drifted, dryRun, correlationId };
        }
        const profile: EnvProfileRecord = {
            tenantId,
            workspaceId,
            toolchain,
            reconcileStatus,
            driftReport,
            updatedAt: nowIso,
            createdAt: existing?.createdAt?.toISOString() ?? nowIso,
        };
        return { profile, drifted, dryRun, correlationId };
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

type RegisterEnvReconcilerRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    now?: () => number;
    store?: EnvStore;
    repo?: EnvRepo;
};

const resolveRepo = (options: RegisterEnvReconcilerRoutesOptions, store: EnvStore): EnvRepo => {
    if (options.repo) return options.repo;
    return createInMemoryRepo(store);
};

const resolveSession = (
    request: FastifyRequest,
    options: RegisterEnvReconcilerRoutesOptions,
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

export const registerEnvReconcilerRoutes = async (
    app: FastifyInstance,
    options: RegisterEnvReconcilerRoutesOptions,
): Promise<void> => {
    const store = options.store ?? createStore();

    // -----------------------------------------------------------------------
    // GET /v1/workspaces/:workspaceId/env-profile
    // -----------------------------------------------------------------------
    app.get<{ Params: WorkspacePath; Querystring: EnvQuery }>(
        '/v1/workspaces/:workspaceId/env-profile',
        async (request, reply) => {
            const { workspaceId } = request.params;
            const session = resolveSession(request, options, request.query.tenant_id);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            if (!checkAccess(session, workspaceId)) return reply.status(403).send({ error: 'forbidden' });

            const repo = resolveRepo(options, store);
            const profile = await repo.getProfile({ tenantId: session.tenantId, workspaceId });
            if (!profile) {
                return reply.status(200).send({
                    workspaceId,
                    toolchain: [],
                    reconcileStatus: 'clean',
                    source: 'default',
                });
            }
            return reply.status(200).send({ ...profile, source: 'persisted' });
        },
    );

    // -----------------------------------------------------------------------
    // PUT /v1/workspaces/:workspaceId/env-profile
    // -----------------------------------------------------------------------
    app.put<{ Params: WorkspacePath; Querystring: EnvQuery; Body: EnvBody }>(
        '/v1/workspaces/:workspaceId/env-profile',
        async (request, reply) => {
            const { workspaceId } = request.params;
            const session = resolveSession(request, options, request.query.tenant_id);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            if (!checkAccess(session, workspaceId)) return reply.status(403).send({ error: 'forbidden' });

            const body = request.body ?? {};
            if (body.toolchain !== undefined && !isToolchainArray(body.toolchain)) {
                return reply.status(400).send({ error: 'toolchain must be an array of {name, requiredVersion} objects' });
            }

            const nowIso = new Date(options.now ? options.now() : Date.now()).toISOString();
            const correlationId = randomUUID();
            const repo = resolveRepo(options, store);

            const existing = await repo.getProfile({ tenantId: session.tenantId, workspaceId });
            const toolchain = (body.toolchain as ToolchainEntry[] | undefined) ?? existing?.toolchain ?? [];

            const profile = await repo.upsertProfile({ tenantId: session.tenantId, workspaceId, toolchain, nowIso });

            await repo.createAuditEvent({
                tenantId: session.tenantId,
                workspaceId,
                actor: session.userId,
                summary: `env_profile_updated: ${toolchain.length} toolchain entries`,
                correlationId,
            });

            return reply.status(200).send({ ...profile, correlationId });
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/workspaces/:workspaceId/env-profile/reconcile
    // -----------------------------------------------------------------------
    app.post<{ Params: WorkspacePath; Querystring: EnvQuery; Body: ReconcileBody }>(
        '/v1/workspaces/:workspaceId/env-profile/reconcile',
        async (request, reply) => {
            const { workspaceId } = request.params;
            const session = resolveSession(request, options, request.query.tenant_id);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            if (!checkAccess(session, workspaceId)) return reply.status(403).send({ error: 'forbidden' });

            const body = request.body ?? {};
            const dryRun = body.dryRun === true;
            const nowIso = new Date(options.now ? options.now() : Date.now()).toISOString();

            const repo = resolveRepo(options, store);
            const result = await repo.reconcile({ tenantId: session.tenantId, workspaceId, dryRun, nowIso });

            await repo.createAuditEvent({
                tenantId: session.tenantId,
                workspaceId,
                actor: session.userId,
                summary: `env_reconcile_run: dry_run=${dryRun} drifted=${result.drifted.length} status=${result.profile.reconcileStatus}`,
                correlationId: result.correlationId,
            });

            return reply.status(200).send(result);
        },
    );
};
