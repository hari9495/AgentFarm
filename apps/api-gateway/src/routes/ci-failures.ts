import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CiTriageStatus = 'queued' | 'triaging' | 'complete' | 'failed';

type CiFailedJob = {
    jobName: string;
    step?: string;
    exitCode?: number;
    logRef?: string;
};

type CiTriageReport = {
    id: string;
    tenantId: string;
    workspaceId: string;
    provider: string;
    runId: string;
    repo: string;
    branch: string;
    failedJobs: CiFailedJob[];
    logRefs: string[];
    status: CiTriageStatus;
    rootCauseHypothesis?: string;
    reproSteps?: string[];
    patchProposal?: string;
    confidence?: number;
    blastRadius?: string;
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

type WorkspacePath = { workspaceId: string };
type TriageIdPath = { workspaceId: string; triageId: string };
type CiQuery = { tenant_id?: string };

type IntakeBody = {
    provider?: unknown;
    runId?: unknown;
    repo?: unknown;
    branch?: unknown;
    failedJobs?: unknown;
    logRefs?: unknown;
};

// ---------------------------------------------------------------------------
// Triage worker (inline — runs synchronously in memory; production would
// schedule an async job. Patch proposals are SUGGESTIONS only — never
// auto-applied; must pass approval before execution.)
// ---------------------------------------------------------------------------

const FLAKY_PATTERNS = ['timeout', 'flak', 'intermittent', 'rate limit'];
const BUILD_PATTERNS = ['compile error', 'syntax error', 'type error', 'cannot find module', 'import error'];
const ENV_PATTERNS = ['env var', 'secret', 'credential', 'permission denied', 'access denied', '401', '403', 'forbidden'];
const INFRA_PATTERNS = ['oom', 'out of memory', 'disk full', 'no space left', 'network unreachable', 'connection refused'];

const detectCategory = (jobs: CiFailedJob[]): 'flaky' | 'build' | 'env' | 'infra' | 'test' => {
    const corpus = jobs
        .map((j) => `${j.jobName} ${j.step ?? ''} ${j.logRef ?? ''}`.toLowerCase())
        .join(' ');
    if (FLAKY_PATTERNS.some((p) => corpus.includes(p))) return 'flaky';
    if (ENV_PATTERNS.some((p) => corpus.includes(p))) return 'env';
    if (INFRA_PATTERNS.some((p) => corpus.includes(p))) return 'infra';
    if (BUILD_PATTERNS.some((p) => corpus.includes(p))) return 'build';
    return 'test';
};

const runTriage = (
    report: CiTriageReport,
): Pick<CiTriageReport, 'status' | 'rootCauseHypothesis' | 'reproSteps' | 'patchProposal' | 'confidence' | 'blastRadius'> => {
    const category = detectCategory(report.failedJobs);
    const jobNames = report.failedJobs.map((j) => j.jobName).join(', ');

    switch (category) {
        case 'flaky':
            return {
                status: 'complete',
                rootCauseHypothesis: `Flaky test or transient infrastructure issue detected in jobs: ${jobNames}. Pattern suggests retry may succeed.`,
                reproSteps: [
                    '1. Re-run the failed jobs without code changes.',
                    '2. If failures persist more than 3 retries, investigate upstream service health.',
                ],
                patchProposal:
                    'SUGGESTION (requires approval before execution): Wrap flaky test with retry decorator or quarantine it.',
                confidence: 0.6,
                blastRadius: 'Low — likely isolated to specific test; other workflows unaffected.',
            };
        case 'build':
            return {
                status: 'complete',
                rootCauseHypothesis: `Build/compilation failure in: ${jobNames}. Likely a recent code change introduced a type or syntax error.`,
                reproSteps: [
                    '1. Check the most recent commit diff in the failing job.',
                    '2. Run `pnpm typecheck` locally to reproduce.',
                    '3. Fix errors reported by the compiler.',
                ],
                patchProposal:
                    'SUGGESTION (requires approval before execution): Fix type errors or missing imports identified in compiler output.',
                confidence: 0.85,
                blastRadius: 'High — all downstream jobs blocked until build is fixed.',
            };
        case 'env':
            return {
                status: 'complete',
                rootCauseHypothesis: `Environment/credential issue in: ${jobNames}. Missing secret, expired token, or misconfigured environment variable.`,
                reproSteps: [
                    '1. Check CI secret store for missing or expired values.',
                    '2. Verify environment variable names match what the code expects.',
                    '3. Rotate credentials if expired.',
                ],
                patchProposal:
                    'SUGGESTION (requires approval before execution): Refresh the secret referenced in the failing step.',
                confidence: 0.8,
                blastRadius: 'Medium — other jobs using the same secret will also fail.',
            };
        case 'infra':
            return {
                status: 'complete',
                rootCauseHypothesis: `Infrastructure resource exhaustion in: ${jobNames}. Runner may be OOM, disk-full, or network-unreachable.`,
                reproSteps: [
                    '1. Check runner resource metrics at time of failure.',
                    '2. Increase memory/disk allocation or switch to a larger runner.',
                    '3. Re-run to confirm resolution.',
                ],
                patchProposal:
                    'SUGGESTION (requires approval before execution): Upgrade runner tier or add resource limits to prevent recurrence.',
                confidence: 0.75,
                blastRadius: 'Medium-High — affects all jobs on the same runner pool.',
            };
        default:
            return {
                status: 'complete',
                rootCauseHypothesis: `Test failure(s) in: ${jobNames}. A recent code change likely broke one or more assertions.`,
                reproSteps: [
                    '1. Check which specific test cases failed in the CI log.',
                    '2. Run the test file locally with the latest branch code.',
                    '3. Fix the failing assertions or update snapshots if behaviour changed intentionally.',
                ],
                patchProposal:
                    'SUGGESTION (requires approval before execution): Fix failing test assertions or revert the breaking commit.',
                confidence: 0.7,
                blastRadius: 'Low-Medium — only the affected package tests are failing.',
            };
    }
};

// ---------------------------------------------------------------------------
// Store + Repo
// ---------------------------------------------------------------------------

type CiStore = {
    reports: Map<string, CiTriageReport>;
    runIndex: Map<string, string>; // "${tenantId}:${workspaceId}:${runId}" -> reportId
};

const createStore = (): CiStore => ({ reports: new Map(), runIndex: new Map() });

type CiRepo = {
    getReport(input: { id: string; tenantId: string; workspaceId: string }): Promise<CiTriageReport | null>;
    findByRunId(input: { tenantId: string; workspaceId: string; runId: string }): Promise<CiTriageReport | null>;
    createReport(input: Omit<CiTriageReport, 'id' | 'createdAt' | 'updatedAt'> & { nowIso: string }): Promise<CiTriageReport>;
    updateReport(input: {
        id: string;
        patch: Partial<
            Pick<CiTriageReport, 'status' | 'rootCauseHypothesis' | 'reproSteps' | 'patchProposal' | 'confidence' | 'blastRadius'>
        >;
        nowIso: string;
    }): Promise<CiTriageReport | null>;
    createAuditEvent(input: {
        tenantId: string;
        workspaceId: string;
        actor: string;
        summary: string;
        correlationId: string;
    }): Promise<void>;
};

const createInMemoryRepo = (store: CiStore): CiRepo => ({
    async getReport({ id, tenantId, workspaceId }) {
        const r = store.reports.get(id);
        if (!r || r.tenantId !== tenantId || r.workspaceId !== workspaceId) return null;
        return r;
    },
    async findByRunId({ tenantId, workspaceId, runId }) {
        const key = `${tenantId}:${workspaceId}:${runId}`;
        const id = store.runIndex.get(key);
        if (!id) return null;
        return store.reports.get(id) ?? null;
    },
    async createReport({ nowIso, ...fields }) {
        const record: CiTriageReport = { id: randomUUID(), createdAt: nowIso, updatedAt: nowIso, ...fields };
        store.reports.set(record.id, record);
        const key = `${record.tenantId}:${record.workspaceId}:${record.runId}`;
        store.runIndex.set(key, record.id);
        return record;
    },
    async updateReport({ id, patch, nowIso }) {
        const existing = store.reports.get(id);
        if (!existing) return null;
        const updated: CiTriageReport = { ...existing, ...patch, updatedAt: nowIso };
        store.reports.set(id, updated);
        return updated;
    },
    async createAuditEvent() {
        // no-op in tests
    },
});

// ---------------------------------------------------------------------------
// Options + helpers
// ---------------------------------------------------------------------------

type RegisterCiFailureRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    now?: () => number;
    store?: CiStore;
    repo?: CiRepo;
};

const resolveRepo = (options: RegisterCiFailureRoutesOptions, store: CiStore): CiRepo => {
    if (options.repo) return options.repo;
    return createInMemoryRepo(store);
};

const resolveSession = (
    request: FastifyRequest,
    options: RegisterCiFailureRoutesOptions,
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

export const registerCiFailureRoutes = async (
    app: FastifyInstance,
    options: RegisterCiFailureRoutesOptions,
): Promise<void> => {
    const store = options.store ?? createStore();

    // -----------------------------------------------------------------------
    // POST /v1/workspaces/:workspaceId/ci-failures/intake
    // -----------------------------------------------------------------------
    app.post<{ Params: WorkspacePath; Querystring: CiQuery; Body: IntakeBody }>(
        '/v1/workspaces/:workspaceId/ci-failures/intake',
        async (request, reply) => {
            const { workspaceId } = request.params;
            const session = resolveSession(request, options, request.query.tenant_id);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            if (!checkAccess(session, workspaceId)) return reply.status(403).send({ error: 'forbidden' });

            const body = request.body ?? {};

            if (!body.provider || typeof body.provider !== 'string')
                return reply.status(400).send({ error: 'provider is required' });
            if (!body.runId || typeof body.runId !== 'string')
                return reply.status(400).send({ error: 'runId is required' });
            if (!body.repo || typeof body.repo !== 'string')
                return reply.status(400).send({ error: 'repo is required' });
            if (!body.branch || typeof body.branch !== 'string')
                return reply.status(400).send({ error: 'branch is required' });

            const failedJobs: CiFailedJob[] = Array.isArray(body.failedJobs) ? (body.failedJobs as CiFailedJob[]) : [];
            const logRefs: string[] = Array.isArray(body.logRefs)
                ? (body.logRefs as string[]).filter((x) => typeof x === 'string')
                : [];

            const repo = resolveRepo(options, store);

            // Idempotency — return existing report if same runId already ingested
            const existing = await repo.findByRunId({
                tenantId: session.tenantId,
                workspaceId,
                runId: body.runId,
            });
            if (existing) {
                return reply.status(200).send({ triageId: existing.id, status: existing.status, correlationId: existing.correlationId });
            }

            const nowIso = new Date(options.now ? options.now() : Date.now()).toISOString();
            const correlationId = randomUUID();

            const report = await repo.createReport({
                tenantId: session.tenantId,
                workspaceId,
                provider: body.provider,
                runId: body.runId,
                repo: body.repo,
                branch: body.branch,
                failedJobs,
                logRefs,
                status: 'queued',
                correlationId,
                nowIso,
            });

            await repo.createAuditEvent({
                tenantId: session.tenantId,
                workspaceId,
                actor: session.userId,
                summary: `ci_triage_intake: runId=${body.runId} triageId=${report.id}`,
                correlationId,
            });

            // Run inline triage worker synchronously (no auto-apply, proposal is suggestion only)
            const triagedAt = new Date(options.now ? options.now() : Date.now()).toISOString();
            const triageResult = runTriage(report);

            await repo.updateReport({ id: report.id, patch: triageResult, nowIso: triagedAt });

            return reply.status(202).send({ triageId: report.id, status: 'queued', correlationId });
        },
    );

    // -----------------------------------------------------------------------
    // GET /v1/workspaces/:workspaceId/ci-failures/:triageId/report
    // -----------------------------------------------------------------------
    app.get<{ Params: TriageIdPath; Querystring: CiQuery }>(
        '/v1/workspaces/:workspaceId/ci-failures/:triageId/report',
        async (request, reply) => {
            const { workspaceId, triageId } = request.params;
            const session = resolveSession(request, options, request.query.tenant_id);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            if (!checkAccess(session, workspaceId)) return reply.status(403).send({ error: 'forbidden' });

            const repo = resolveRepo(options, store);
            const report = await repo.getReport({ id: triageId, tenantId: session.tenantId, workspaceId });
            if (!report) return reply.status(404).send({ error: 'triage report not found' });

            return reply.status(200).send({
                triageId: report.id,
                provider: report.provider,
                runId: report.runId,
                repo: report.repo,
                branch: report.branch,
                failedJobs: report.failedJobs,
                status: report.status,
                rootCauseHypothesis: report.rootCauseHypothesis,
                reproSteps: report.reproSteps,
                patchProposal: report.patchProposal,
                confidence: report.confidence,
                blastRadius: report.blastRadius,
                correlationId: report.correlationId,
                createdAt: report.createdAt,
                updatedAt: report.updatedAt,
            });
        },
    );
};
