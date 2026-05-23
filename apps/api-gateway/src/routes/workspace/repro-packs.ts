// repro-packs.ts
// Sprint 4 — F9: Crash Recovery + Repro Pack Generator
// Canonical source: planning/phase-1-vm-realism-execution-plan.md
//
// Endpoints:
//   POST /v1/runs/:runId/resume                               — recover interrupted run
//   POST /v1/workspaces/:workspaceId/repro-packs              — create access-controlled repro pack
//   GET  /v1/workspaces/:workspaceId/repro-packs/:reproPackId — fetch repro pack with manifest

import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { assessRecovery, buildManifest } from '../lib/run-recovery-worker.js';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

type ResumeStrategy = 'last_checkpoint' | 'latest_state';
type ReproPackStatus = 'generating' | 'ready' | 'expired' | 'failed';
type RunResumeStatus = 'queued' | 'resuming' | 'resumed' | 'failed';

type RunResumeRecord = {
    id: string;
    contractVersion: string;
    tenantId: string;
    workspaceId: string;
    runId: string;
    strategy: ResumeStrategy;
    resumedFrom?: string;
    status: RunResumeStatus;
    failureReason?: string;
    correlationId: string;
    createdAt: string;
    updatedAt: string;
};

type ReproPackManifest = {
    runId: string;
    workspaceId: string;
    tenantId: string;
    includedLogs: boolean;
    includedScreenshots: boolean;
    includedDiffs: boolean;
    includedActionTraces: boolean;
    actionCount: number;
    logBundleRef?: string;
    screenshotRefs: string[];
    diffRefs: string[];
    timeline: Array<{ at: string; event: string; actor: string }>;
};

type ReproPackRecord = {
    id: string;
    contractVersion: string;
    tenantId: string;
    workspaceId: string;
    runId: string;
    status: ReproPackStatus;
    manifest: ReproPackManifest;
    downloadRef?: string;
    expiresAt: string;
    exportAuditEventId?: string;
    correlationId: string;
    createdAt: string;
    updatedAt: string;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

// ---------------------------------------------------------------------------
// In-memory store (isolated per Fastify instance in tests)
// ---------------------------------------------------------------------------

type Store = {
    resumes: Map<string, RunResumeRecord>;
    packs: Map<string, ReproPackRecord>;
};

function createStore(): Store {
    return {
        resumes: new Map(),
        packs: new Map(),
    };
}

// ---------------------------------------------------------------------------
// Prisma client type (narrow subset — injected for testability)
// ---------------------------------------------------------------------------

type ReproPackPrismaClient = {
    reproPack: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string; status: string;[key: string]: unknown }>;
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<{ id: string; status: string;[key: string]: unknown }>;
    };
    runResume: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string; status: string;[key: string]: unknown }>;
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
    };
};

// ---------------------------------------------------------------------------
// Route options
// ---------------------------------------------------------------------------

export type ReproPackRouteOptions = {
    getSession?: (request: FastifyRequest) => SessionContext | null;
    getPrisma?: () => Promise<ReproPackPrismaClient>;
};

// ---------------------------------------------------------------------------
// Param / body / query types
// ---------------------------------------------------------------------------

type RunIdParam = { runId: string };
type WorkspaceParam = { workspaceId: string };
type ReproPackParam = { workspaceId: string; reproPackId: string };
type TenantQuery = { tenant_id?: string };

type ResumeBody = {
    strategy?: unknown;
    workspaceId?: unknown;
};

type CreateReproPackBody = {
    runId?: unknown;
    includeScreenshots?: unknown;
    includeDiffs?: unknown;
    includeLogs?: unknown;
};

// ---------------------------------------------------------------------------
// Session helper — mirrors pattern from other routes
// ---------------------------------------------------------------------------

const RUNTIME_SERVICE_TOKEN = process.env['RUNTIME_SERVICE_TOKEN'];

function resolveSession(
    request: FastifyRequest,
    options: ReproPackRouteOptions,
    tenantIdOverride?: string,
): SessionContext | null {
    if (options.getSession) {
        const s = options.getSession(request);
        if (s) return s;
    }
    const runtimeToken = (request.headers as Record<string, string>)['x-runtime-token'];
    if (RUNTIME_SERVICE_TOKEN && runtimeToken === RUNTIME_SERVICE_TOKEN && tenantIdOverride) {
        return {
            userId: 'runtime-service',
            tenantId: tenantIdOverride,
            workspaceIds: [],
            scope: 'internal',
            expiresAt: Date.now() + 3600_000,
        };
    }
    return null;
}

// ---------------------------------------------------------------------------
// registerReproPackRoutes
// ---------------------------------------------------------------------------

export async function registerReproPackRoutes(
    app: FastifyInstance,
    options: ReproPackRouteOptions = {},
): Promise<void> {
    const store = createStore();

    const defaultGetPrisma = async (): Promise<ReproPackPrismaClient> => {
        const db = await import('../lib/db.js');
        return db.prisma as unknown as ReproPackPrismaClient;
    };
    const getPrisma = options.getPrisma ?? defaultGetPrisma;

    // -------------------------------------------------------------------------
    // POST /v1/runs/:runId/resume
    // Recover an interrupted run from persisted state.
    // Body: { strategy: 'last_checkpoint' | 'latest_state', workspaceId: string }
    // Response 202: { runId, resumedFrom, status }
    // -------------------------------------------------------------------------
    app.post<{ Params: RunIdParam; Body: ResumeBody; Querystring: TenantQuery }>(
        '/v1/runs/:runId/resume',
        async (request, reply) => {
            const tenantIdOverride =
                typeof request.query.tenant_id === 'string' ? request.query.tenant_id : undefined;
            const session = resolveSession(request, options, tenantIdOverride);
            if (!session) {
                return reply.status(401).send({ error: 'unauthorized' });
            }

            const { runId } = request.params;
            const { strategy, workspaceId: bodyWorkspaceId } = request.body ?? {};

            // Validate strategy
            if (strategy !== 'last_checkpoint' && strategy !== 'latest_state') {
                return reply.status(400).send({
                    error: 'invalid_strategy',
                    message:
                        'strategy must be "last_checkpoint" or "latest_state"',
                });
            }

            // workspaceId: body first, fall back to first workspaceId in session
            const workspaceId =
                typeof bodyWorkspaceId === 'string' && bodyWorkspaceId
                    ? bodyWorkspaceId
                    : session.workspaceIds[0];

            if (!workspaceId) {
                return reply.status(400).send({
                    error: 'workspace_required',
                    message: 'workspaceId must be provided in the request body or via session',
                });
            }

            const correlationId = randomUUID();
            const now = new Date().toISOString();

            // Run recovery assessment
            const assessment = assessRecovery(runId, strategy as ResumeStrategy);

            if (!assessment.canResume) {
                const record: RunResumeRecord = {
                    id: randomUUID(),
                    contractVersion: '1.0.0',
                    tenantId: session.tenantId,
                    workspaceId,
                    runId,
                    strategy: strategy as ResumeStrategy,
                    status: 'failed',
                    failureReason: assessment.failureReason ?? 'recovery_not_possible',
                    correlationId,
                    createdAt: now,
                    updatedAt: now,
                };
                store.resumes.set(record.id, record);
                return reply.status(422).send({
                    error: 'recovery_not_possible',
                    reason: record.failureReason,
                    correlationId,
                });
            }

            const record: RunResumeRecord = {
                id: randomUUID(),
                contractVersion: '1.0.0',
                tenantId: session.tenantId,
                workspaceId,
                runId,
                strategy: strategy as ResumeStrategy,
                resumedFrom: assessment.resumePoint,
                status: 'resumed',
                correlationId,
                createdAt: now,
                updatedAt: now,
            };
            store.resumes.set(record.id, record);

            return reply.status(202).send({
                runId,
                resumedFrom: assessment.resumePoint,
                status: record.status,
                estimatedLoss: assessment.estimatedLoss,
                correlationId,
            });
        },
    );

    // -------------------------------------------------------------------------
    // POST /v1/workspaces/:workspaceId/repro-packs
    // Create an access-controlled repro pack for a run.
    // Body: { runId, includeScreenshots?, includeDiffs?, includeLogs? }
    // Response 201: { reproPackId, downloadRef, expiresAt }
    // -------------------------------------------------------------------------
    app.post<{ Params: WorkspaceParam; Body: CreateReproPackBody; Querystring: TenantQuery }>(
        '/v1/workspaces/:workspaceId/repro-packs',
        async (request, reply) => {
            const tenantIdOverride =
                typeof request.query.tenant_id === 'string' ? request.query.tenant_id : undefined;
            const session = resolveSession(request, options, tenantIdOverride);
            if (!session) {
                return reply.status(401).send({ error: 'unauthorized' });
            }

            const { workspaceId } = request.params;

            // Workspace tenancy check — session must include this workspaceId (unless internal)
            if (
                session.scope !== 'internal' &&
                session.workspaceIds.length > 0 &&
                !session.workspaceIds.includes(workspaceId)
            ) {
                return reply.status(403).send({ error: 'forbidden', message: 'workspace not in session' });
            }

            const { runId, includeScreenshots, includeDiffs, includeLogs } = request.body ?? {};

            if (typeof runId !== 'string' || !runId.trim()) {
                return reply.status(400).send({ error: 'runId is required' });
            }

            const correlationId = randomUUID();
            const now = new Date().toISOString();

            // Build manifest
            const manifest = buildManifest({
                runId: runId as string,
                workspaceId,
                tenantId: session.tenantId,
                includeScreenshots: includeScreenshots === true,
                includeDiffs: includeDiffs === true,
                includeLogs: includeLogs !== false, // default true
                nowIso: now,
            });

            // Expiry: 7 days from creation
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            const packId = randomUUID();
            const downloadRef = `repro-packs/${session.tenantId}/${workspaceId}/${packId}.zip`;

            // Audit event ID assigned on export
            const exportAuditEventId = randomUUID();

            const record: ReproPackRecord = {
                id: packId,
                contractVersion: '1.0.0',
                tenantId: session.tenantId,
                workspaceId,
                runId: runId as string,
                status: 'ready',
                manifest,
                downloadRef,
                expiresAt,
                exportAuditEventId,
                correlationId,
                createdAt: now,
                updatedAt: now,
            };
            store.packs.set(packId, record);

            return reply.status(201).send({
                reproPackId: packId,
                downloadRef,
                expiresAt,
                exportAuditEventId,
                correlationId,
            });
        },
    );

    // -------------------------------------------------------------------------
    // GET /v1/workspaces/:workspaceId/repro-packs/:reproPackId
    // Fetch repro pack with manifest. Requires session owning the workspace.
    // Response 200: { reproPackId, manifest, downloadRef, createdAt }
    // -------------------------------------------------------------------------
    app.get<{ Params: ReproPackParam; Querystring: TenantQuery }>(
        '/v1/workspaces/:workspaceId/repro-packs/:reproPackId',
        async (request, reply) => {
            const tenantIdOverride =
                typeof request.query.tenant_id === 'string' ? request.query.tenant_id : undefined;
            const session = resolveSession(request, options, tenantIdOverride);
            if (!session) {
                return reply.status(401).send({ error: 'unauthorized' });
            }

            const { workspaceId, reproPackId } = request.params;

            // Workspace tenancy check
            if (
                session.scope !== 'internal' &&
                session.workspaceIds.length > 0 &&
                !session.workspaceIds.includes(workspaceId)
            ) {
                return reply.status(403).send({ error: 'forbidden', message: 'workspace not in session' });
            }

            const record = store.packs.get(reproPackId);
            if (!record) {
                return reply.status(404).send({ error: 'repro_pack_not_found' });
            }

            // Cross-tenant isolation — ensure pack belongs to session tenant
            if (record.tenantId !== session.tenantId) {
                return reply.status(403).send({ error: 'forbidden', message: 'tenant mismatch' });
            }

            return reply.status(200).send({
                reproPackId: record.id,
                manifest: record.manifest,
                downloadRef: record.downloadRef,
                expiresAt: record.expiresAt,
                exportAuditEventId: record.exportAuditEventId,
                createdAt: record.createdAt,
                correlationId: record.correlationId,
            });
        },
    );

    // -------------------------------------------------------------------------
    // POST /v1/repro-packs
    // Create a repro pack record (Prisma-backed, flat path).
    // Body: { tenantId, workspaceId, taskId, expiresInMs? }
    // Response 201: { id, status: 'capturing' }
    // -------------------------------------------------------------------------
    type CreateReproPackFlatBody = {
        tenantId?: unknown;
        workspaceId?: unknown;
        taskId?: unknown;
        expiresInMs?: unknown;
    };

    app.post<{ Body: CreateReproPackFlatBody }>(
        '/v1/repro-packs',
        async (request, reply) => {
            const session = resolveSession(request, options);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });

            const { tenantId, workspaceId, taskId, expiresInMs } = request.body ?? {};

            if (typeof tenantId !== 'string' || !tenantId.trim()) {
                return reply.status(400).send({ error: 'tenantId is required' });
            }
            if (typeof workspaceId !== 'string' || !workspaceId.trim()) {
                return reply.status(400).send({ error: 'workspaceId is required' });
            }
            if (typeof taskId !== 'string' || !taskId.trim()) {
                return reply.status(400).send({ error: 'taskId is required' });
            }

            const ttlMs = typeof expiresInMs === 'number' && expiresInMs > 0
                ? expiresInMs
                : 7 * 24 * 60 * 60 * 1000;
            const expiresAt = new Date(Date.now() + ttlMs);
            const correlationId = randomUUID();

            try {
                const prisma = await getPrisma();
                const row = await prisma.reproPack.create({
                    data: {
                        tenantId,
                        workspaceId,
                        runId: taskId,
                        status: 'capturing',
                        manifest: {},
                        expiresAt,
                        correlationId,
                    },
                });
                return reply.status(201).send({ id: row['id'], status: row['status'] });
            } catch (err) {
                console.error('[repro-packs] create error:', err);
                return reply.status(500).send({ error: 'internal_error' });
            }
        },
    );

    // -------------------------------------------------------------------------
    // GET /v1/repro-packs/:id
    // Fetch a repro pack by id.
    // Response 200: record | 404
    // -------------------------------------------------------------------------
    type ReproPackIdParam = { id: string };

    app.get<{ Params: ReproPackIdParam }>(
        '/v1/repro-packs/:id',
        async (request, reply) => {
            const session = resolveSession(request, options);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });

            const { id } = request.params;

            try {
                const prisma = await getPrisma();
                const row = await prisma.reproPack.findUnique({ where: { id } });
                if (!row) return reply.status(404).send({ error: 'not_found' });
                if (row['tenantId'] !== session.tenantId) {
                    return reply.status(403).send({ error: 'forbidden' });
                }
                return reply.status(200).send(row);
            } catch (err) {
                console.error('[repro-packs] fetch error:', err);
                return reply.status(500).send({ error: 'internal_error' });
            }
        },
    );

    // -------------------------------------------------------------------------
    // POST /v1/repro-packs/:id/ready
    // Mark a repro pack as ready.
    // Body: { archiveUrl?, manifest? }
    // Response 200: { id, status: 'ready' }
    // -------------------------------------------------------------------------
    type MarkReadyParam = { id: string };
    type MarkReadyBody = { archiveUrl?: unknown; manifest?: unknown };

    app.post<{ Params: MarkReadyParam; Body: MarkReadyBody }>(
        '/v1/repro-packs/:id/ready',
        async (request, reply) => {
            const session = resolveSession(request, options);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });

            const { id } = request.params;
            const { archiveUrl, manifest } = request.body ?? {};

            try {
                const prisma = await getPrisma();
                const existing = await prisma.reproPack.findUnique({ where: { id } });
                if (!existing) return reply.status(404).send({ error: 'not_found' });
                if (existing['tenantId'] !== session.tenantId) {
                    return reply.status(403).send({ error: 'forbidden' });
                }

                const updateData: Record<string, unknown> = { status: 'ready' };
                if (typeof archiveUrl === 'string' && archiveUrl) {
                    updateData['downloadRef'] = archiveUrl;
                }
                if (manifest !== undefined && manifest !== null) {
                    updateData['manifest'] = manifest;
                }

                const updated = await prisma.reproPack.update({ where: { id }, data: updateData });
                return reply.status(200).send({ id: updated['id'], status: updated['status'] });
            } catch (err) {
                console.error('[repro-packs] mark-ready error:', err);
                return reply.status(500).send({ error: 'internal_error' });
            }
        },
    );

    // -------------------------------------------------------------------------
    // POST /v1/run-resume
    // Create a run-resume record (Prisma-backed).
    // Body: { tenantId, workspaceId, originalRunId, resumeStrategy, reproPackId? }
    // Response 202: { id, status: 'pending' }
    // -------------------------------------------------------------------------
    type CreateRunResumeBody = {
        tenantId?: unknown;
        workspaceId?: unknown;
        originalRunId?: unknown;
        resumeStrategy?: unknown;
        reproPackId?: unknown;
    };

    app.post<{ Body: CreateRunResumeBody }>(
        '/v1/run-resume',
        async (request, reply) => {
            const session = resolveSession(request, options);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });

            const { tenantId, workspaceId, originalRunId, resumeStrategy, reproPackId } = request.body ?? {};

            if (typeof tenantId !== 'string' || !tenantId.trim()) {
                return reply.status(400).send({ error: 'tenantId is required' });
            }
            if (typeof workspaceId !== 'string' || !workspaceId.trim()) {
                return reply.status(400).send({ error: 'workspaceId is required' });
            }
            if (typeof originalRunId !== 'string' || !originalRunId.trim()) {
                return reply.status(400).send({ error: 'originalRunId is required' });
            }
            if (resumeStrategy !== 'last_checkpoint' && resumeStrategy !== 'latest_state') {
                return reply.status(400).send({
                    error: 'invalid_strategy',
                    message: 'resumeStrategy must be "last_checkpoint" or "latest_state"',
                });
            }

            const correlationId = randomUUID();

            try {
                const prisma = await getPrisma();
                const row = await prisma.runResume.create({
                    data: {
                        tenantId,
                        workspaceId,
                        runId: originalRunId as string,
                        strategy: resumeStrategy as string,
                        status: 'pending',
                        correlationId,
                        ...(typeof reproPackId === 'string' && reproPackId
                            ? { resumedFrom: reproPackId }
                            : {}),
                    },
                });
                return reply.status(202).send({ id: row['id'], status: row['status'] });
            } catch (err) {
                console.error('[run-resume] create error:', err);
                return reply.status(500).send({ error: 'internal_error' });
            }
        },
    );

    // -------------------------------------------------------------------------
    // GET /v1/run-resume/:id
    // Fetch a run-resume record by id.
    // Response 200: record | 404
    // -------------------------------------------------------------------------
    type RunResumeIdParam = { id: string };

    app.get<{ Params: RunResumeIdParam }>(
        '/v1/run-resume/:id',
        async (request, reply) => {
            const session = resolveSession(request, options);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });

            const { id } = request.params;

            try {
                const prisma = await getPrisma();
                const row = await prisma.runResume.findUnique({ where: { id } });
                if (!row) return reply.status(404).send({ error: 'not_found' });
                if (row['tenantId'] !== session.tenantId) {
                    return reply.status(403).send({ error: 'forbidden' });
                }
                return reply.status(200).send(row);
            } catch (err) {
                console.error('[run-resume] fetch error:', err);
                return reply.status(500).send({ error: 'internal_error' });
            }
        },
    );
}
