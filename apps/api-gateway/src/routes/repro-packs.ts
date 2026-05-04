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
// Route options
// ---------------------------------------------------------------------------

export type ReproPackRouteOptions = {
    getSession?: (request: FastifyRequest) => SessionContext | null;
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
}
