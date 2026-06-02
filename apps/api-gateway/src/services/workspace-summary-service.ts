/**
 * workspace-summary-service.ts — business logic for workspace/dashboard queries.
 *
 * Extracted from main.ts where these were private helper functions embedded
 * directly alongside route registration code. Moving them here means:
 *   - They are independently testable
 *   - Multiple route handlers can share them without copy-paste
 *   - The data-access concern is clearly separated from HTTP routing
 */

import { prisma } from '../lib/db.js';
import { parseApprovalPacket } from '../lib/approval-packet.js';
import {
    PROVISIONING_SLA_TARGET_MS,
    PROVISIONING_STUCK_ALERT_MS,
    PROVISIONING_TIMEOUT_MS,
} from '../services/provisioning-monitoring.js';

// ---------------------------------------------------------------------------
// Tenant & workspace summaries
// ---------------------------------------------------------------------------

export const getTenantSummary = async (tenantId: string) => {
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

export const getWorkspaceBotSummaries = async (tenantId: string) => {
    const workspaces = await prisma.workspace.findMany({
        where: { tenantId },
        include: { bots: true },
    });

    return workspaces.map((ws: any) => ({
        workspace_id: ws.id,
        tenant_id: tenantId,
        workspace_name: ws.name,
        role_type: ws.bots?.[0]?.role ?? 'Developer Agent',
        bot_id: ws.bots?.[0]?.id ?? null,
        bot_name: ws.bots?.[0]?.name ?? 'Unnamed Bot',
        bot_status: ws.bots?.[0]?.status ?? 'created',
        workspace_status: ws.status,
        runtime_tier: 'dedicated_vm',
        last_heartbeat_at: new Date().toISOString(),
        provisioning_status: 'pending',
        latest_incident_level: 'none',
    }));
};

// ---------------------------------------------------------------------------
// Provisioning
// ---------------------------------------------------------------------------

export const PROVISIONING_STEPS = [
    'queued', 'validating', 'creating_resources', 'bootstrapping_vm',
    'starting_container', 'registering_runtime', 'healthchecking', 'completed',
] as const;

const EMPTY_PROVISIONING = (workspaceId: string) => ({
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
});

export { EMPTY_PROVISIONING };

export const getProvisioningStatus = async (workspaceId: string) => {
    const job = await prisma.provisioningJob.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
    });

    if (!job) return null;

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

// ---------------------------------------------------------------------------
// Connector health
// ---------------------------------------------------------------------------

export const getConnectorHealth = async (workspaceId: string) => {
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

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export const getApprovals = async (workspaceId: string) => {
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

export type ApprovalSummary = {
    requested_at: string;
    decided_at: string | null;
    decision_status: string;
};

export const calculateApprovalMetrics = (approvals: ApprovalSummary[]) => {
    const pendingCount = approvals.filter((a) => a.decision_status === 'pending').length;
    const decided = approvals.filter((a) => a.decision_status !== 'pending' && a.decided_at !== null);
    const latencies = decided
        .map((a) => {
            const requested = new Date(a.requested_at).getTime();
            const decidedAt = new Date(a.decided_at as string).getTime();
            if (!Number.isFinite(requested) || !Number.isFinite(decidedAt) || decidedAt < requested) {
                return null;
            }
            return Math.floor((decidedAt - requested) / 1000);
        })
        .filter((v): v is number => v !== null)
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

// ---------------------------------------------------------------------------
// Activity / audit events
// ---------------------------------------------------------------------------

export const getActivityEvents = async (workspaceId: string) => {
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
