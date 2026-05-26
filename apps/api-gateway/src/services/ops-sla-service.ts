/**
 * ops-sla-service.ts — SLA calculation domain logic.
 *
 * Pure business logic for provisioning SLA metrics. Accepting raw job records
 * and returning a typed summary makes this independently testable without
 * requiring a database or HTTP context.
 */

import {
    PROVISIONING_SLA_TARGET_MS,
    PROVISIONING_STUCK_ALERT_MS,
    PROVISIONING_TIMEOUT_MS,
} from '../services/provisioning-monitoring.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProvisioningJobRecord = {
    id: string;
    tenantId: string;
    status: string;
    requestedAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    updatedAt: Date;
};

type TenantSlaBucket = {
    tenant_id: string;
    jobs: number;
    completed_within_sla: number;
    completed_sla_breaches: number;
    active_sla_breaches: number;
    timed_out_candidates: number;
    stuck_candidates: number;
};

export type SlaSummary = {
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
    tenant_breakdown: TenantSlaBucket[];
};

const ACTIVE_STATUSES = new Set([
    'queued', 'validating', 'creating_resources', 'bootstrapping_vm',
    'starting_container', 'registering_runtime', 'healthchecking',
]);

// ---------------------------------------------------------------------------
// Service function
// ---------------------------------------------------------------------------

/**
 * Aggregates provisioning job records into a per-tenant SLA report.
 * Pure function — accepts job records, returns a typed summary.
 */
export const buildSlaSummary = (jobs: ProvisioningJobRecord[]): SlaSummary => {
    const nowMs = Date.now();
    const statusCounts: Record<string, number> = {};
    const perTenant = new Map<string, TenantSlaBucket>();

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
        const isActive = ACTIVE_STATUSES.has(job.status);

        const completedWithinSla = isCompleted && latencyMs <= PROVISIONING_SLA_TARGET_MS;
        const completedBreach = isCompleted && latencyMs > PROVISIONING_SLA_TARGET_MS;
        const activeBreach = isActive && latencyMs > PROVISIONING_SLA_TARGET_MS;
        const timeoutCandidate = isActive && latencyMs > PROVISIONING_TIMEOUT_MS;
        const stuckCandidate = stuckMs > PROVISIONING_STUCK_ALERT_MS;

        statusCounts[job.status] = (statusCounts[job.status] ?? 0) + 1;
        totals.jobs += 1;
        if (completedWithinSla) totals.completed_within_sla += 1;
        if (completedBreach) totals.completed_sla_breaches += 1;
        if (activeBreach) totals.active_sla_breaches += 1;
        if (timeoutCandidate) totals.timed_out_candidates += 1;
        if (stuckCandidate) totals.stuck_candidates += 1;

        const bucket = perTenant.get(job.tenantId) ?? {
            tenant_id: job.tenantId,
            jobs: 0,
            completed_within_sla: 0,
            completed_sla_breaches: 0,
            active_sla_breaches: 0,
            timed_out_candidates: 0,
            stuck_candidates: 0,
        };

        bucket.jobs += 1;
        if (completedWithinSla) bucket.completed_within_sla += 1;
        if (completedBreach) bucket.completed_sla_breaches += 1;
        if (activeBreach) bucket.active_sla_breaches += 1;
        if (timeoutCandidate) bucket.timed_out_candidates += 1;
        if (stuckCandidate) bucket.stuck_candidates += 1;

        perTenant.set(job.tenantId, bucket);
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
    };
};
