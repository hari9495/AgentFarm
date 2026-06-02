/**
 * dashboard.ts — workspace dashboard and provisioning routes.
 *
 * All six inline route handlers that lived at the bottom of main.ts are
 * extracted here. The business logic lives in workspace-summary-service.ts;
 * this file is pure HTTP binding: parse params, call service, return response.
 */

import type { FastifyInstance } from 'fastify';
import { readSession } from '../../request-context.js';
import {
    getTenantSummary,
    getWorkspaceBotSummaries,
    getProvisioningStatus,
    getConnectorHealth,
    getApprovals,
    calculateApprovalMetrics,
    getActivityEvents,
    EMPTY_PROVISIONING,
    PROVISIONING_STEPS,
} from '../../services/workspace-summary-service.js';
import {
    PROVISIONING_SLA_TARGET_MS,
    PROVISIONING_STUCK_ALERT_MS,
    PROVISIONING_TIMEOUT_MS,
} from '../../services/provisioning-monitoring.js';
import { prisma } from '../../lib/db.js';

export const registerDashboardRoutes = async (app: FastifyInstance): Promise<void> => {
    // ------------------------------------------------------------------
    // Tenant-level dashboard summary
    // ------------------------------------------------------------------

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
            return reply.code(403).send({ error: 'forbidden', message: 'Internal session required for dashboard summary.' });
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
            session_scope: { tenant_id: session.tenantId, workspace_ids: session.workspaceIds },
            tenantSummary,
            workspaceBotSummaries,
            usageSummary,
        };
    });

    // ------------------------------------------------------------------
    // Per-workspace detail dashboard
    // ------------------------------------------------------------------

    app.get<{ Params: { workspaceId: string } }>('/v1/dashboard/workspace/:workspaceId', async (request, reply) => {
        const { workspaceId } = request.params;
        const session = readSession(request);

        if (!session || session.scope !== 'internal') {
            return reply.code(403).send({ error: 'forbidden', message: 'Internal session required for workspace dashboard access.' });
        }

        if (!session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({ error: 'forbidden', message: 'Workspace is outside your session scope.' });
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
            provisioning: provisioning ?? EMPTY_PROVISIONING(workspaceId),
            connectors,
            pending_approvals: approvals.filter((a: any) => a.decision_status === 'pending'),
            recent_decisions: approvals.filter((a: any) => a.decision_status !== 'pending'),
            approval_metrics: approvalMetrics,
            events,
            next_cursor: null,
        };
    });

    // ------------------------------------------------------------------
    // Workspace-scoped resource endpoints
    // ------------------------------------------------------------------

    app.get<{ Params: { workspaceId: string } }>('/v1/workspaces/:workspaceId/provisioning', async (request, reply) => {
        const { workspaceId } = request.params;
        const session = readSession(request);

        if (session && !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({ error: 'forbidden', message: 'Workspace is outside your session scope.' });
        }

        return (await getProvisioningStatus(workspaceId)) ?? EMPTY_PROVISIONING(workspaceId);
    });

    app.get<{ Params: { workspaceId: string } }>('/v1/workspaces/:workspaceId/connectors', async (request, reply) => {
        const { workspaceId } = request.params;
        const session = readSession(request);

        if (session && !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({ error: 'forbidden', message: 'Workspace is outside your session scope.' });
        }

        return { connectors: await getConnectorHealth(workspaceId) };
    });

    app.get<{ Params: { workspaceId: string } }>('/v1/workspaces/:workspaceId/approvals', async (request, reply) => {
        const { workspaceId } = request.params;
        const session = readSession(request);

        if (session && !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({ error: 'forbidden', message: 'Workspace is outside your session scope.' });
        }

        const approvals = await getApprovals(workspaceId);
        return {
            pending_approvals: approvals.filter((a: any) => a.decision_status === 'pending'),
            recent_decisions: approvals.filter((a: any) => a.decision_status !== 'pending'),
            approval_metrics: calculateApprovalMetrics(approvals),
        };
    });

    app.get<{ Params: { workspaceId: string } }>('/v1/workspaces/:workspaceId/activity', async (request, reply) => {
        const { workspaceId } = request.params;
        const session = readSession(request);

        if (session && !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({ error: 'forbidden', message: 'Workspace is outside your session scope.' });
        }

        return { events: await getActivityEvents(workspaceId), next_cursor: null };
    });

    // ------------------------------------------------------------------
    // Workspace historical metrics (time-series)
    // ------------------------------------------------------------------

    app.get<{ Params: { workspaceId: string }; Querystring: { window?: string; bucket?: string } }>(
        '/v1/dashboard/workspace/:workspaceId/historical-metrics',
        async (request, reply) => {
            const { workspaceId } = request.params;
            const { window: windowParam = '12h', bucket: bucketParam = '1h' } = request.query;

            const windowMatch = windowParam.match(/^(\d+)([hd])$/);
            const bucketMatch = bucketParam.match(/^(\d+)([hm])$/);

            const windowMs = windowMatch
                ? parseInt(windowMatch[1]) * (windowMatch[2] === 'h' ? 3600000 : 86400000)
                : 12 * 3600000;
            const bucketMs = bucketMatch
                ? parseInt(bucketMatch[1]) * (bucketMatch[2] === 'h' ? 3600000 : 60000)
                : 3600000;

            const since = new Date(Date.now() - windowMs);

            const records = await prisma.taskExecutionRecord.findMany({
                where: { workspaceId, executedAt: { gte: since } },
                select: { executedAt: true, outcome: true, latencyMs: true, totalTokens: true },
                orderBy: { executedAt: 'asc' },
            });

            // Build bucket map
            const bucketCount = Math.ceil(windowMs / bucketMs);
            const buckets: Array<{ at: string; task_count: number; success_count: number; error_count: number; avg_latency_ms: number; total_tokens: number }> = [];

            for (let i = 0; i < bucketCount; i++) {
                const bucketStart = since.getTime() + i * bucketMs;
                const bucketEnd = bucketStart + bucketMs;
                const slice = records.filter((r) => {
                    const t = r.executedAt.getTime();
                    return t >= bucketStart && t < bucketEnd;
                });
                const successes = slice.filter((r) => r.outcome === 'success');
                const avgLatency = slice.length > 0 ? Math.round(slice.reduce((s, r) => s + r.latencyMs, 0) / slice.length) : 0;
                const totalTokens = slice.reduce((s, r) => s + (r.totalTokens ?? 0), 0);
                buckets.push({
                    at: new Date(bucketStart).toISOString(),
                    task_count: slice.length,
                    success_count: successes.length,
                    error_count: slice.length - successes.length,
                    avg_latency_ms: avgLatency,
                    total_tokens: totalTokens,
                });
            }

            return {
                workspace_id: workspaceId,
                window: windowParam,
                bucket: bucketParam,
                points: buckets,
            };
        },
    );

    // ------------------------------------------------------------------
    // Single provisioning job detail
    // ------------------------------------------------------------------

    app.get<{ Params: { jobId: string } }>('/v1/provisioning/jobs/:jobId', async (request, reply) => {
        const { jobId } = request.params;
        const session = readSession(request);

        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'Authentication required.' });
        }

        const job = await prisma.provisioningJob.findUnique({ where: { id: jobId } });

        if (!job) {
            return reply.code(404).send({ error: 'not_found', message: 'Provisioning job not found.' });
        }

        if (job.tenantId !== session.tenantId) {
            return reply.code(403).send({ error: 'forbidden', message: 'Job is outside your tenant scope.' });
        }

        const now = Date.now();
        const anchor = job.startedAt ?? job.requestedAt;
        const latencyMs = Math.max(0, now - anchor.getTime());
        const stuckMs = Math.max(0, now - job.updatedAt.getTime());

        const currentIndex = PROVISIONING_STEPS.indexOf(job.status as typeof PROVISIONING_STEPS[number]);
        const stepHistory = PROVISIONING_STEPS.map((step, i) => ({
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
};
