import { initObservability } from '@agentfarm/observability';
initObservability({
    serviceName: 'api-gateway',
    azureConnectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
    otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
});

import Fastify from 'fastify';
import type { FastifyError } from 'fastify';
import helmet from '@fastify/helmet';
import { rateLimit, rateLimitTenant } from './lib/rate-limit.js';
import { buildSessionToken, verifySessionToken, type SessionPayload } from './lib/session-auth.js';
import { prisma } from './lib/db.js';
import { checkSubscription } from './lib/subscription-guard.js';
import { registerAuthRoutes } from './routes/auth.js';
import { parseApprovalPacket } from './lib/approval-packet.js';
import { registerConnectorAuthRoutes } from './routes/connector-auth.js';
import { registerMcpRegistryRoutes } from './routes/mcp-registry.js';
import { registerLanguageRoutes } from './routes/language.js';
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
import {
    getInternalLoginPolicyConfig,
    isInternalLoginPolicyEmpty,
} from './lib/internal-login-policy.js';
import { registerInternalLoginPolicyRoutes } from './routes/internal-login-policy.js';
import { registerRuntimeLlmConfigRoutes } from './routes/runtime-llm-config.js';
import { registerRuntimeTaskRoutes } from './routes/runtime-tasks.js';
import { registerWorkspaceSessionRoutes } from './routes/workspace-session.js';
import { registerDesktopProfileRoutes } from './routes/desktop-profile.js';
import { registerIdeStateRoutes } from './routes/ide-state.js';
import { registerBudgetPolicyRoutes } from './routes/budget-policy.js';
import { registerGovernanceWorkflowRoutes } from './routes/governance-workflows.js';
import { registerPluginLoadingRoutes } from './routes/plugin-loading.js';
import { registerActivityRoutes } from './routes/activity-events.js';
import { registerEnvReconcilerRoutes } from './routes/env-reconciler.js';
import { registerDesktopActionRoutes } from './routes/desktop-actions.js';
import { registerPrRoutes } from './routes/pull-requests.js';
import { registerCiFailureRoutes } from './routes/ci-failures.js';
import { registerWorkMemoryRoutes } from './routes/work-memory.js';
import { registerReproPackRoutes } from './routes/repro-packs.js';
import { registerSkillPipelineRoutes } from './routes/skill-pipelines.js';
import { registerSkillSchedulerRoutes } from './routes/skill-scheduler.js';
import { registerWebhookRoutes } from './routes/webhooks.js';
import { registerConnectorHealthRoutes } from './routes/connector-health.js';
import { registerKnowledgeGraphRoutes } from './routes/knowledge-graph.js';
import { registerAgentFeedbackRoutes } from './routes/agent-feedback.js';
import { registerAutonomousLoopRoutes } from './routes/autonomous-loops.js';
import { registerSkillCompositionRoutes } from './routes/skill-composition-execute.js';
import { registerGovernanceKPIRoutes } from './routes/governance-kpis.js';
import { registerAdapterRegistryRoutes } from './routes/adapter-registry.js';
import { registerHandoffRoutes } from './routes/handoffs.js';
import { registerObservabilityRoutes } from './routes/observability.js';
import { registerQuestionRoutes } from './routes/questions.js';
import { registerMemoryRoutes } from './routes/memory.js';
import { registerMeetingRoutes } from './routes/meetings.js';
import { registerBillingRoutes } from './routes/billing.js';
import { registerAnalyticsRoutes } from './routes/analytics.js';
import { registerAgentControlRoutes } from './routes/agent-control.js';
import { registerAgentsRoutes } from './routes/agents.js';
import { registerAdminProvisionRoutes } from './routes/admin-provision.js';
import { registerAgentDispatchRoutes } from './routes/agent-dispatch.js';
import { registerZohoSignWebhookRoutes } from './routes/zoho-sign-webhook.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerRetentionPolicyRoutes } from './routes/retention-policy.js';
import { registerSseTaskRoutes } from './routes/sse-tasks.js';
import { registerOutboundWebhookRoutes } from './routes/outbound-webhooks.js';
import { registerTeamRoutes } from './routes/team.js';
import { registerScheduleRoutes } from './routes/schedules.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerBotVersionRoutes } from './routes/bot-versions.js';
import { registerOrchestrationRoutes } from './routes/orchestration.js';
import { registerMarketplaceRoutes } from './routes/marketplace.js';
import { registerAbTestRoutes } from './routes/ab-tests.js';
import { registerCircuitBreakerRoutes } from './routes/circuit-breakers.js';
import { registerTaskQueueRoutes } from './routes/task-queue.js';
import { registerScheduledReportRoutes } from './routes/scheduled-reports.js';
import { registerApiKeyRoutes } from './routes/api-keys.js';
import { validateApiKey } from './lib/api-key-auth.js';
import { startDrainSweep, stopDrainSweep } from './lib/task-queue.js';

// 1 MB max request body — prevents large payload DoS
const app = Fastify({
    logger: true,
    bodyLimit: 1_048_576,
});
// Security headers via helmet
await app.register(helmet, {
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'none'"],
            frameAncestors: ["'none'"],
        },
    },
    referrerPolicy: { policy: ['strict-origin-when-cross-origin'] },
    frameguard: { action: 'deny' },
});
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
    // Check for API-key-injected session (set by preHandler when Bearer af_ key is validated)
    const injected = (request as any)._injectedSession as SessionPayload | undefined;
    if (injected) {
        return injected;
    }

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
        ...parseApprovalPacket(a.actionSummary),
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

app.get('/health', async () => ({
    status: 'ok',
    service: 'api-gateway',
    ts: new Date().toISOString(),
}));

// Detailed health — requires internal session
app.get('/health/detail', async (request, reply) => {
    const session = readSession(request);
    if (!session || session.scope !== 'internal') {
        return reply.code(401).send({ error: 'unauthorized' });
    }
    let dbOk = false;
    try {
        await prisma.$queryRaw`SELECT 1`;
        dbOk = true;
    } catch { /* db unreachable */ }
    return {
        status: dbOk ? 'ok' : 'degraded',
        service: 'api-gateway',
        db: dbOk ? 'connected' : 'unreachable',
        uptime: process.uptime(),
        memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        ts: new Date().toISOString(),
    };
});

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
const PUBLIC_PATHS = new Set(['/health', '/auth/signup', '/auth/login', '/auth/internal-login']);
const isPublicPath = (url: string): boolean => {
    const path = url.split('?')[0] ?? '';
    return (
        PUBLIC_PATHS.has(path) ||
        path === '/auth/logout' ||
        // Webhook event catalog is public — consumers read it without credentials
        path.startsWith('/v1/webhooks/events')
    );
};

// Security headers on every response
app.addHook('onSend', async (_request, reply) => {
    reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
});

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

    // CORS origin validation
    const allowedOriginsEnv = process.env['ALLOWED_ORIGINS'];
    const origin = request.headers['origin'];
    if (allowedOriginsEnv && typeof origin === 'string') {
        const allowedList = allowedOriginsEnv.split(',').map((s) => s.trim());
        if (!allowedList.includes(origin)) {
            reply.header('Vary', 'Origin');
            void reply.code(403).send({ error: 'origin not allowed' });
            return;
        }
        reply.header('Access-Control-Allow-Origin', origin);
        reply.header('Vary', 'Origin');
    }

    // Per-tenant rate limit (only when a session exists)
    const tenantSession = readSession(request);
    if (tenantSession?.tenantId) {
        const tenantResult = rateLimitTenant(tenantSession.tenantId, {
            limit: 600,
            windowMs: 60_000,
        });
        reply.header('x-ratelimit-tenant-remaining', String(tenantResult.remaining));
        if (!tenantResult.allowed) {
            void reply.code(429).send({
                error: 'rate_limit_exceeded',
                scope: 'tenant',
                retryAfterMs: tenantResult.resetIn,
            });
            return;
        }
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

    let session = readSession(request);

    // API key fallback — Bearer af_<key> is a long-lived programmatic key
    if (!session) {
        const authHeader = request.headers['authorization'] as string | undefined;
        if (typeof authHeader === 'string' && authHeader.startsWith('Bearer af_')) {
            const rawKey = authHeader.slice(7);
            const keyData = await validateApiKey(rawKey, prisma);
            if (keyData) {
                const injected: SessionPayload = {
                    userId: keyData.apiKeyId,
                    tenantId: keyData.tenantId,
                    workspaceIds: [],
                    scope: 'customer',
                    role: keyData.role,
                    expiresAt: Date.now() + 60_000,
                };
                (request as any)._injectedSession = injected;
                session = injected;
            }
        }
    }

    if (!session) {
        void reply.code(401).send({
            error: 'unauthorized',
            message: 'Provide a valid bearer token or agentfarm_session cookie.',
        });
        return;
    }
});

// Subscription guard — runs after auth gate so session is available.
// Populates request.session then checks tenant subscription status.
app.addHook('preHandler', async (request, reply) => {
    (request as any).session = readSession(request) ?? undefined;
    await checkSubscription(request, reply);
});

// Register auth routes (signup, login, logout)
await registerAuthRoutes(app);
await registerConnectorAuthRoutes(app, {
    getSession: (request) => readSession(request),
    secretStore: createDefaultSecretStore(),
});
await registerMcpRegistryRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerLanguageRoutes(app, {
    getSession: (request) => readSession(request),
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
await registerInternalLoginPolicyRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerRuntimeLlmConfigRoutes(app, {
    getSession: (request) => readSession(request),
    secretStore: createDefaultSecretStore(),
});
await registerRuntimeTaskRoutes(app, {
    getSession: (request) => readSession(request),
    prisma,
});
await registerWorkspaceSessionRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerDesktopProfileRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerIdeStateRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerBudgetPolicyRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerGovernanceWorkflowRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerPluginLoadingRoutes(app, {
    getSession: (request) => readSession(request),
    featureEnabled: process.env.FEATURE_EXTERNAL_PLUGIN_LOADING === 'true',
    trustedPublishers: [
        {
            publisher: 'agentfarm-plugins',
            sourceRepoPrefix: 'https://github.com/agentfarm/',
        },
    ],
});
await registerActivityRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerEnvReconcilerRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerDesktopActionRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerPrRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerCiFailureRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerWorkMemoryRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerReproPackRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerHandoffRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerObservabilityRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerQuestionRoutes(app, prisma);
await registerMemoryRoutes(app, prisma, { getSession: (request) => readSession(request) });
await registerMeetingRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerBillingRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerAnalyticsRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerAgentsRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerAgentControlRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerAgentDispatchRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerAdminProvisionRoutes(app, {
    getSession: (request) => readSession(request),
});
await registerZohoSignWebhookRoutes(app);
registerNotificationRoutes(app, { getSession: (request) => readSession(request) });
registerSkillPipelineRoutes(app, { getSession: (request) => readSession(request) });
registerSkillSchedulerRoutes(app, { getSession: (request) => readSession(request) });
registerWebhookRoutes(app, prisma);
registerConnectorHealthRoutes(app);
registerKnowledgeGraphRoutes(app, { getSession: (request) => readSession(request) });
registerAgentFeedbackRoutes(app, { getSession: (request) => readSession(request) });
registerAutonomousLoopRoutes(app);
registerSkillCompositionRoutes(app);
registerGovernanceKPIRoutes(app);
registerAdapterRegistryRoutes(app);
await registerRetentionPolicyRoutes(app, prisma);
await registerSseTaskRoutes(app, { getSession: (request) => readSession(request) });
await registerOutboundWebhookRoutes(app, { getSession: (request) => readSession(request) });
await registerTeamRoutes(app, { getSession: (request) => readSession(request) });
await registerScheduleRoutes(app, { getSession: (request) => readSession(request) });
await registerChatRoutes(app, { getSession: (request) => readSession(request) });
await registerBotVersionRoutes(app, { getSession: (request) => readSession(request) });
await registerOrchestrationRoutes(app, { getSession: (request) => readSession(request) });
await registerMarketplaceRoutes(app, { getSession: (request) => readSession(request) });
await registerAbTestRoutes(app, { getSession: (request) => readSession(request) });
await registerCircuitBreakerRoutes(app, { getSession: (request) => readSession(request) });
await registerTaskQueueRoutes(app, { getSession: (request) => readSession(request), prisma: prisma as never });
await registerScheduledReportRoutes(app, { getSession: (request) => readSession(request), prisma: prisma as never });
await registerApiKeyRoutes(app, { getSession: (request) => readSession(request), prisma: prisma as never });

app.get('/v1/dashboard/summary', async (request, reply) => {
    const session = readSession(request);

    if (!session) {
        return {
            session_scope: null,
            tenantSummary: null,
            workspaceBotSummaries: [],
            usageSummary: null,
        };
    }

    if (session.scope !== 'internal') {
        return reply.code(403).send({
            error: 'forbidden',
            message: 'Internal session required for dashboard summary.',
        });
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

    if (!session || session.scope !== 'internal') {
        return reply.code(403).send({
            error: 'forbidden',
            message: 'Internal session required for workspace dashboard access.',
        });
    }

    if (!session.workspaceIds.includes(workspaceId)) {
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

// Global error handler — prevents stack traces leaking to clients
app.setErrorHandler((error: FastifyError, _request, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 500) {
        console.error('[unhandled-error]', error);
        return reply.code(500).send({ error: 'internal server error' });
    }
    return reply.code(status).send({ error: error.message ?? 'bad request' });
});

const startupChecks = async (): Promise<void> => {
    const requiredVars = ['DATABASE_URL', 'API_SESSION_SECRET'];
    const missing = requiredVars.filter((v) => !process.env[v]?.trim());
    if (missing.length > 0) {
        app.log.error(`Startup checks failed: missing required env vars: ${missing.join(', ')}`);
        process.exit(1);
    }
    try {
        await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
        app.log.error({ err }, 'Startup checks failed: database connectivity check failed');
        process.exit(1);
    }
    app.log.info('Startup checks passed');
};

const start = async (): Promise<void> => {
    try {
        const internalLoginPolicy = getInternalLoginPolicyConfig();
        if (isInternalLoginPolicyEmpty(internalLoginPolicy)) {
            app.log.warn(
                'Internal login policy is empty: set API_INTERNAL_LOGIN_ALLOWED_DOMAINS and/or API_INTERNAL_LOGIN_ADMIN_ROLES. Internal login is currently deny-by-default.',
            );
        }

        await startupChecks();
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
        startDrainSweep({
            agentRuntimeUrl: process.env.AGENT_RUNTIME_URL ?? 'http://localhost:3001',
            prisma: prisma as never,
        });
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

const stop = async (): Promise<void> => {
    stopProvisioningWorker();
    stopConnectorTokenLifecycleWorker();
    stopConnectorHealthWorker();
    stopDrainSweep();
    await app.close();
    process.exit(0);
};

process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());

void start();
