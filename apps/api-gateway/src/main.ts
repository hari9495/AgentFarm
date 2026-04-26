import Fastify from 'fastify';
import { rateLimit } from './lib/rate-limit.js';
import { buildSessionToken, verifySessionToken } from './lib/session-auth.js';
import { prisma } from './lib/db.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerConnectorAuthRoutes } from './routes/connector-auth.js';
import { registerConnectorActionRoutes } from './routes/connector-actions.js';
import { createDefaultSecretStore } from './lib/secret-store.js';
import { registerApprovalRoutes } from './routes/approvals.js';
import { registerAuditRoutes } from './routes/audit.js';
import { registerRoleRoutes } from './routes/roles.js';
import { registerSnapshotRoutes } from './routes/snapshots.js';
import { startProvisioningWorker, stopProvisioningWorker } from './services/provisioning-worker.js';
import {
    startConnectorTokenLifecycleWorker,
    stopConnectorTokenLifecycleWorker,
} from './services/connector-token-lifecycle-worker.js';
import { startConnectorHealthWorker, stopConnectorHealthWorker } from './services/connector-health-worker.js';
import {
    PROVISIONING_SLA_TARGET_MS,
    PROVISIONING_STUCK_ALERT_MS,
    PROVISIONING_TIMEOUT_MS,
} from './services/provisioning-monitoring.js';

const app = Fastify({ logger: true });
const port = Number(process.env.API_GATEWAY_PORT ?? 3000);
const requireAuth = process.env.API_REQUIRE_AUTH === 'true';

type PathParams = {
    workspaceId: string;
};

type JobIdParams = {
    jobId: string;
};

type OpsSlaSummary = {
    generated_at: string;
    threshold_ms: {
        sla_target: number;
        stuck_alert: number;
        timeout: number;
    };
    totals: {
        jobs: number;
        completed_within_sla: number;
        completed_sla_breaches: number;
        active_sla_breaches: number;
        timed_out_candidates: number;
        stuck_candidates: number;
    };
    status_counts: Record<string, number>;
    tenant_breakdown: Array<{
        tenant_id: string;
        jobs: number;
        completed_within_sla: number;
        completed_sla_breaches: number;
        active_sla_breaches: number;
        timed_out_candidates: number;
        stuck_candidates: number;
    }>;
};

type SessionPayload = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

const readSessionToken = (request: { headers: Record<string, unknown> }): string | null => {
    const authHeader = request.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
        return authHeader.slice(7).trim();
    }

    const rawCookie = request.headers.cookie;
    if (typeof rawCookie !== 'string') {
        return null;
    }

    const cookieItem = rawCookie
        .split(';')
        .map((value) => value.trim())
        .find((value) => value.startsWith('agentfarm_session='));

    if (!cookieItem) {
        return null;
    }

    return decodeURIComponent(cookieItem.slice('agentfarm_session='.length));
};

const readSession = (request: { headers: Record<string, unknown> }): SessionPayload | null => {
    const token = readSessionToken(request);
    if (!token) {
        return null;
    }

    return verifySessionToken(token);
};

const verifyOpsToken = (request: { headers: Record<string, unknown> }): boolean => {
    const configuredToken = process.env.OPS_MONITORING_TOKEN;
    if (!configuredToken) {
        return false;
    }
    const headerToken = request.headers['x-ops-token'];
    return typeof headerToken === 'string' && headerToken === configuredToken;
};

// Helper function to get total workspace count and counts for summaries
const getTenantSummary = async (tenantId: string) => {
    const [totalWorkspaces, activeBots, tenant] = await Promise.all([
        prisma.workspace.count({ where: { tenantId } }),
        prisma.bot.count({ where: { workspace: { tenantId }, status: 'active' } }),
        prisma.tenant.findUnique({ where: { id: tenantId } }),
    ]);

    return {
        tenant_id: tenantId,
        tenant_name: tenant?.name ?? 'Tenant',
        plan_name: 'Growth',
        tenant_status: tenant?.status ?? 'pending',
        total_workspaces: totalWorkspaces,
        active_bots: activeBots,
        degraded_workspaces: 0,
        pending_approvals: await prisma.approval.count({
            where: { tenantId, decision: 'pending' },
        }),
        created_at: tenant?.createdAt.toISOString() ?? new Date().toISOString(),
    };
};

// Helper function to get workspace + bot summary
const getWorkspaceBotSummaries = async (tenantId: string) => {
    const workspaces = await prisma.workspace.findMany({
        where: { tenantId },
        include: { bot: true },
    });

    return workspaces.map((ws: any) => ({
        workspace_id: ws.id,
        tenant_id: tenantId,
        workspace_name: ws.name,
        role_type: ws.bot?.role ?? 'Developer Agent',
        bot_id: ws.bot?.id ?? null,
        bot_name: ws.bot?.name ?? 'Unnamed Bot',
        bot_status: ws.bot?.status ?? 'created',
        workspace_status: ws.status,
        runtime_tier: 'dedicated_vm',
        last_heartbeat_at: new Date().toISOString(),
        provisioning_status: 'pending',
        latest_incident_level: 'none',
    }));
};

// Helper function to get provisioning job
const getProvisioningStatus = async (workspaceId: string) => {
    const job = await prisma.provisioningJob.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
    });

    if (!job) {
        return null;
    }

    const now = Date.now();
    const anchor = job.startedAt ?? job.requestedAt;
    const latencyMs = Math.max(0, now - anchor.getTime());
    const stuckMs = Math.max(0, now - job.updatedAt.getTime());

    return {
        job_id: job.id,
        workspace_id: workspaceId,
        bot_id: job.botId,
        job_status: job.status,
        current_step: job.status,
        started_at: job.startedAt?.toISOString() ?? null,
        completed_at: job.completedAt?.toISOString() ?? null,
        error_code: job.failureReason ?? null,
        error_message: job.remediationHint ?? null,
        provisioning_latency_ms: latencyMs,
        sla_target_ms: PROVISIONING_SLA_TARGET_MS,
        sla_breached: latencyMs > PROVISIONING_SLA_TARGET_MS,
        stuck_alert_threshold_ms: PROVISIONING_STUCK_ALERT_MS,
        is_stuck: stuckMs > PROVISIONING_STUCK_ALERT_MS,
        timeout_at: new Date(anchor.getTime() + PROVISIONING_TIMEOUT_MS).toISOString(),
        step_history: [],
    };
};

// Helper function to get connector health
const getConnectorHealth = async (workspaceId: string) => {
    const connectors = await prisma.connectorAuthMetadata.findMany({
        where: { workspaceId },
    });

    return connectors.map((c: any) => ({
        connector_id: c.id,
        workspace_id: workspaceId,
        connector_type: c.connectorType,
        status: c.status,
        permission_scope: c.grantedScopes?.join(',') ?? '',
        last_healthcheck_at: c.lastHealthcheckAt?.toISOString() ?? null,
        last_error_code: c.lastErrorClass ?? null,
        last_error_message: null,
    }));
};

// Helper function to get approvals
const getApprovals = async (workspaceId: string) => {
    const approvals = await prisma.approval.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
    });

    return approvals.map((a: any) => ({
        approval_id: a.id,
        workspace_id: workspaceId,
        bot_id: a.botId,
        task_id: a.taskId,
        action_summary: a.actionSummary,
        risk_level: a.riskLevel,
        decision_status: a.decision,
        requested_at: a.createdAt.toISOString(),
        decided_at: a.decidedAt?.toISOString() ?? null,
        decision_reason: a.decisionReason,
    }));
};

const calculateApprovalMetrics = (approvals: Array<{
    requested_at: string;
    decided_at: string | null;
    decision_status: string;
}>) => {
    const pendingCount = approvals.filter((item) => item.decision_status === 'pending').length;
    const decided = approvals.filter((item) => item.decision_status !== 'pending' && item.decided_at !== null);
    const latencies = decided
        .map((item) => {
            const requested = new Date(item.requested_at).getTime();
            const decidedAt = new Date(item.decided_at as string).getTime();
            if (!Number.isFinite(requested) || !Number.isFinite(decidedAt) || decidedAt < requested) {
                return null;
            }
            return Math.floor((decidedAt - requested) / 1000);
        })
        .filter((value): value is number => value !== null)
        .sort((a, b) => a - b);

    const p95 = latencies.length > 0
        ? latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)]
        : null;

    return {
        pending_count: pendingCount,
        decision_count: decided.length,
        p95_decision_latency_seconds: p95,
    };
};

// Helper function to get activity/events
const getActivityEvents = async (workspaceId: string) => {
    const events = await prisma.auditEvent.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 100,
    });

    return events.map((e: any) => ({
        event_id: e.id,
        tenant_id: e.tenantId,
        workspace_id: workspaceId,
        bot_id: e.botId,
        event_type: e.eventType,
        severity: e.severity,
        summary: e.summary,
        source_system: e.sourceSystem,
        created_at: e.createdAt.toISOString(),
        correlation_id: e.correlationId,
    }));
};

app.get('/health', async () => ({ status: 'ok', service: 'api-gateway' }));

// Dev-only session helper — disabled in production
app.get('/v1/auth/dev-session', async (_request, reply) => {
    if (process.env.NODE_ENV === 'production') {
        return reply.code(404).send({ error: 'not_found' });
    }
    const token = buildSessionToken({
        userId: 'dev-user-001',
        tenantId: 'tenant_acme_001',
        workspaceIds: ['ws_primary_001'],
    });
    return {
        token,
        expires_in_seconds: 8 * 60 * 60,
    };
});

// Public paths that bypass auth checks (still rate-limited)
const PUBLIC_PATHS = new Set(['/health', '/auth/signup', '/auth/login']);
const isPublicPath = (url: string): boolean => {
    const path = url.split('?')[0] ?? '';
    return PUBLIC_PATHS.has(path) || path === '/auth/logout';
};

app.addHook('preHandler', async (request, reply) => {
    // Always rate-limit (auth endpoints use tighter limit to slow brute-force)
    const isAuthEndpoint = request.url.startsWith('/auth/');
    const limit = isAuthEndpoint ? 20 : 180;
    const identityKey = `${request.ip}:${isAuthEndpoint ? 'auth' : request.url}`;
    const result = rateLimit(identityKey, { limit, windowMs: 60_000 });
    reply.header('x-ratelimit-remaining', String(result.remaining));
    reply.header('x-ratelimit-reset-in-ms', String(result.resetIn));

    if (!result.allowed) {
        void reply.code(429).send({
            error: 'rate_limit_exceeded',
            message: 'Too many requests. Retry after the reset window.',
        });
        return;
    }

    // Public paths do not require session
    if (isPublicPath(request.url)) {
        return;
    }

    // All /v1/* routes require a valid session
    if (!request.url.startsWith('/v1/')) {
        return;
    }

    if (!requireAuth) {
        return;
    }

    const session = readSession(request);
    if (!session) {
        void reply.code(401).send({
            error: 'unauthorized',
            message: 'Provide a valid bearer token or agentfarm_session cookie.',
        });
        return;
    }
});

// Register auth routes (signup, login, logout)
await registerAuthRoutes(app);
await registerConnectorAuthRoutes(app, {
    getSession: (request) => readSession(request),
    secretStore: createDefaultSecretStore(),
});
await registerConnectorActionRoutes(app, {
    getSession: (request) => readSession(request),
    secretStore: createDefaultSecretStore(),
});
await registerApprovalRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerAuditRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerRoleRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerSnapshotRoutes(app, {
    getSession: (request) => readSession(request),
});

app.get('/v1/dashboard/summary', async (request) => {
    const session = readSession(request);

    if (!session) {
        return {
            session_scope: null,
            tenantSummary: null,
            workspaceBotSummaries: [],
            usageSummary: null,
        };
    }

    const [tenantSummary, workspaceBotSummaries] = await Promise.all([
        getTenantSummary(session.tenantId),
        getWorkspaceBotSummaries(session.tenantId),
    ]);

    const usageSummary = {
        tenant_id: session.tenantId,
        workspace_id: session.workspaceIds[0] ?? null,
        billing_period: new Date().toISOString().slice(0, 7),
        action_count: 0,
        approval_count: await prisma.approval.count({ where: { tenantId: session.tenantId } }),
        connector_error_count: 0,
        runtime_restart_count: 0,
        estimated_cost: 0,
    };

    return {
        session_scope: {
            tenant_id: session.tenantId,
            workspace_ids: session.workspaceIds,
        },
        tenantSummary,
        workspaceBotSummaries,
        usageSummary,
    };
});

app.get('/ops/provisioning/sla', async (request, reply) => {
    if (!verifyOpsToken(request)) {
        return reply.code(401).send({
            error: 'unauthorized',
            message: 'Provide a valid x-ops-token for monitoring endpoints.',
        });
    }

    const nowMs = Date.now();
    const jobs = await prisma.provisioningJob.findMany({
        select: {
            id: true,
            tenantId: true,
            status: true,
            requestedAt: true,
            startedAt: true,
            completedAt: true,
            updatedAt: true,
        },
    });

    const statusCounts: Record<string, number> = {};
    const perTenant = new Map<string, OpsSlaSummary['tenant_breakdown'][number]>();

    const totals = {
        jobs: 0,
        completed_within_sla: 0,
        completed_sla_breaches: 0,
        active_sla_breaches: 0,
        timed_out_candidates: 0,
        stuck_candidates: 0,
    };

    for (const job of jobs) {
        const anchor = job.startedAt ?? job.requestedAt;
        const latencyMs = Math.max(0, nowMs - anchor.getTime());
        const stuckMs = Math.max(0, nowMs - job.updatedAt.getTime());
        const isCompleted = job.status === 'completed';
        const isActive = ['queued', 'validating', 'creating_resources', 'bootstrapping_vm', 'starting_container', 'registering_runtime', 'healthchecking'].includes(job.status);
        const completedWithinSla = isCompleted && latencyMs <= PROVISIONING_SLA_TARGET_MS;
        const completedBreach = isCompleted && latencyMs > PROVISIONING_SLA_TARGET_MS;
        const activeBreach = isActive && latencyMs > PROVISIONING_SLA_TARGET_MS;
        const timeoutCandidate = isActive && latencyMs > PROVISIONING_TIMEOUT_MS;
        const stuckCandidate = stuckMs > PROVISIONING_STUCK_ALERT_MS;

        statusCounts[job.status] = (statusCounts[job.status] ?? 0) + 1;

        totals.jobs += 1;
        if (completedWithinSla) {
            totals.completed_within_sla += 1;
        }
        if (completedBreach) {
            totals.completed_sla_breaches += 1;
        }
        if (activeBreach) {
            totals.active_sla_breaches += 1;
        }
        if (timeoutCandidate) {
            totals.timed_out_candidates += 1;
        }
        if (stuckCandidate) {
            totals.stuck_candidates += 1;
        }

        const tenantBucket = perTenant.get(job.tenantId) ?? {
            tenant_id: job.tenantId,
            jobs: 0,
            completed_within_sla: 0,
            completed_sla_breaches: 0,
            active_sla_breaches: 0,
            timed_out_candidates: 0,
            stuck_candidates: 0,
        };

        tenantBucket.jobs += 1;
        if (completedWithinSla) {
            tenantBucket.completed_within_sla += 1;
        }
        if (completedBreach) {
            tenantBucket.completed_sla_breaches += 1;
        }
        if (activeBreach) {
            tenantBucket.active_sla_breaches += 1;
        }
        if (timeoutCandidate) {
            tenantBucket.timed_out_candidates += 1;
        }
        if (stuckCandidate) {
            tenantBucket.stuck_candidates += 1;
        }

        perTenant.set(job.tenantId, tenantBucket);
    }

    return {
        generated_at: new Date(nowMs).toISOString(),
        threshold_ms: {
            sla_target: PROVISIONING_SLA_TARGET_MS,
            stuck_alert: PROVISIONING_STUCK_ALERT_MS,
            timeout: PROVISIONING_TIMEOUT_MS,
        },
        totals,
        status_counts: statusCounts,
        tenant_breakdown: Array.from(perTenant.values()).sort((a, b) => b.jobs - a.jobs),
    } satisfies OpsSlaSummary;
});

app.get<{ Params: PathParams }>('/v1/workspaces/:workspaceId/provisioning', async (request, reply) => {
    const { workspaceId } = request.params;
    const session = readSession(request);

    if (session && !session.workspaceIds.includes(workspaceId)) {
        return reply.code(403).send({
            error: 'forbidden',
            message: 'Workspace is outside your session scope.',
        });
    }

    const provisioning = await getProvisioningStatus(workspaceId);

    return provisioning ?? {
        job_id: null,
        workspace_id: workspaceId,
        bot_id: null,
        job_status: 'pending',
        current_step: 'queued',
        started_at: null,
        completed_at: null,
        error_code: null,
        error_message: null,
        provisioning_latency_ms: 0,
        sla_target_ms: PROVISIONING_SLA_TARGET_MS,
        sla_breached: false,
        stuck_alert_threshold_ms: PROVISIONING_STUCK_ALERT_MS,
        is_stuck: false,
        timeout_at: null,
        step_history: [],
    };
});

app.get<{ Params: PathParams }>('/v1/workspaces/:workspaceId/connectors', async (request, reply) => {
    const { workspaceId } = request.params;
    const session = readSession(request);

    if (session && !session.workspaceIds.includes(workspaceId)) {
        return reply.code(403).send({
            error: 'forbidden',
            message: 'Workspace is outside your session scope.',
        });
    }

    const connectors = await getConnectorHealth(workspaceId);

    return {
        connectors,
    };
});

app.get<{ Params: PathParams }>('/v1/workspaces/:workspaceId/approvals', async (request, reply) => {
    const { workspaceId } = request.params;
    const session = readSession(request);

    if (session && !session.workspaceIds.includes(workspaceId)) {
        return reply.code(403).send({
            error: 'forbidden',
            message: 'Workspace is outside your session scope.',
        });
    }

    const approvals = await getApprovals(workspaceId);
    const approvalMetrics = calculateApprovalMetrics(approvals);

    return {
        pending_approvals: approvals.filter((a: any) => a.decision_status === 'pending'),
        recent_decisions: approvals.filter((a: any) => a.decision_status !== 'pending'),
        approval_metrics: approvalMetrics,
    };
});

app.get<{ Params: PathParams }>('/v1/workspaces/:workspaceId/activity', async (request, reply) => {
    const { workspaceId } = request.params;
    const session = readSession(request);

    if (session && !session.workspaceIds.includes(workspaceId)) {
        return reply.code(403).send({
            error: 'forbidden',
            message: 'Workspace is outside your session scope.',
        });
    }

    const events = await getActivityEvents(workspaceId);

    return {
        events,
        next_cursor: null,
    };
});

app.get<{ Params: PathParams }>('/v1/dashboard/workspace/:workspaceId', async (request, reply) => {
    const { workspaceId } = request.params;
    const session = readSession(request);

    if (session && !session.workspaceIds.includes(workspaceId)) {
        return reply.code(403).send({
            error: 'forbidden',
            message: 'Workspace is outside your session scope.',
        });
    }

    const [provisioning, connectors, approvals, events] = await Promise.all([
        getProvisioningStatus(workspaceId),
        getConnectorHealth(workspaceId),
        getApprovals(workspaceId),
        getActivityEvents(workspaceId),
    ]);

    const approvalMetrics = calculateApprovalMetrics(approvals);

    return {
        workspace_id: workspaceId,
        provisioning: provisioning ?? {
            job_id: null,
            workspace_id: workspaceId,
            bot_id: null,
            job_status: 'pending',
            current_step: 'queued',
            started_at: null,
            completed_at: null,
            error_code: null,
            error_message: null,
            provisioning_latency_ms: 0,
            sla_target_ms: PROVISIONING_SLA_TARGET_MS,
            sla_breached: false,
            stuck_alert_threshold_ms: PROVISIONING_STUCK_ALERT_MS,
            is_stuck: false,
            timeout_at: null,
            step_history: [],
        },
        connectors,
        pending_approvals: approvals.filter((a: any) => a.decision_status === 'pending'),
        recent_decisions: approvals.filter((a: any) => a.decision_status !== 'pending'),
        approval_metrics: approvalMetrics,
        events,
        next_cursor: null,
    };
});

app.get<{ Params: JobIdParams }>('/v1/provisioning/jobs/:jobId', async (request, reply) => {
    const { jobId } = request.params;
    const session = readSession(request);

    if (!session) {
        return reply.code(401).send({ error: 'unauthorized', message: 'Authentication required.' });
    }

    const job = await prisma.provisioningJob.findUnique({ where: { id: jobId } });

    if (!job) {
        return reply.code(404).send({ error: 'not_found', message: 'Provisioning job not found.' });
    }

    // Tenant-scope check: job must belong to the session's tenant
    if (job.tenantId !== session.tenantId) {
        return reply.code(403).send({ error: 'forbidden', message: 'Job is outside your tenant scope.' });
    }

    const now = Date.now();
    const anchor = job.startedAt ?? job.requestedAt;
    const latencyMs = Math.max(0, now - anchor.getTime());
    const stuckMs = Math.max(0, now - job.updatedAt.getTime());

    const orderedSteps = [
        'queued', 'validating', 'creating_resources', 'bootstrapping_vm',
        'starting_container', 'registering_runtime', 'healthchecking', 'completed',
    ] as const;
    const currentIndex = orderedSteps.indexOf(job.status as typeof orderedSteps[number]);

    const stepHistory = orderedSteps.map((step, i) => ({
        step,
        status: i < currentIndex ? 'completed' : i === currentIndex ? 'active' : 'pending',
    }));

    return {
        job_id: job.id,
        tenant_id: job.tenantId,
        workspace_id: job.workspaceId,
        bot_id: job.botId,
        correlation_id: job.correlationId,
        plan_id: job.planId,
        runtime_tier: job.runtimeTier,
        role_type: job.roleType,
        job_status: job.status,
        current_step: job.status,
        started_at: job.startedAt?.toISOString() ?? null,
        completed_at: job.completedAt?.toISOString() ?? null,
        error_code: job.failureReason ?? null,
        error_message: job.remediationHint ?? null,
        provisioning_latency_ms: latencyMs,
        sla_target_ms: PROVISIONING_SLA_TARGET_MS,
        sla_breached: latencyMs > PROVISIONING_SLA_TARGET_MS,
        stuck_alert_threshold_ms: PROVISIONING_STUCK_ALERT_MS,
        is_stuck: stuckMs > PROVISIONING_STUCK_ALERT_MS,
        timeout_at: new Date(anchor.getTime() + PROVISIONING_TIMEOUT_MS).toISOString(),
        step_history: stepHistory,
    };
});

const start = async (): Promise<void> => {
    try {
        await app.listen({ port, host: '0.0.0.0' });
        app.log.info(`api-gateway listening on ${port}`);

        // Start provisioning worker after server is bound
        startProvisioningWorker({
            info: (msg) => app.log.info(msg),
            error: (msg, err) => app.log.error({ err }, msg),
        });
        startConnectorTokenLifecycleWorker(
            {
                info: (msg) => app.log.info(msg),
                error: (msg, err) => app.log.error({ err }, msg),
            },
            {
                secretStore: createDefaultSecretStore(),
            },
        );
        startConnectorHealthWorker(
            {
                secretStore: createDefaultSecretStore(),
            },
            {
                info: (msg) => app.log.info(msg),
                error: (msg, err) => app.log.error({ err }, msg),
            },
        );
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

const stop = async (): Promise<void> => {
    stopProvisioningWorker();
    stopConnectorTokenLifecycleWorker();
    stopConnectorHealthWorker();
    await app.close();
    process.exit(0);
};

process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());

void start();
