/**
 * AgentFarm Support Agent — Config Fixer (Tier 1)
 *
 * Applies reversible, low-blast-radius fixes that do NOT require human
 * approval. Each fix targets one known platform failure mode.
 *
 * applyTier1Fix() is the entry point: it reads a DiagnosisReport and decides
 * which fix(es) to apply, then returns a FixResult describing what was done.
 */

import type { DiagnosisReport } from './platform-diagnostics.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FixResult {
    applied: boolean;
    fixes: AppliedFix[];
    skipped: string[];
}

export interface AppliedFix {
    type: Tier1FixType;
    description: string;
    ok: boolean;
    detail?: string;
}

export type Tier1FixType =
    | 'connector_token_refresh'
    | 'connector_needs_reconnect'
    | 'provisioning_job_retry'
    | 'billing_limit_notify'
    | 'approval_queue_surface'
    | 'no_fix_needed';

export interface ConfigFixerDeps {
    gatewayBaseUrl: string;
    serviceToken: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiPost(
    url: string,
    body: Record<string, unknown>,
    token: string,
): Promise<{ ok: boolean; detail?: string }> {
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            return { ok: false, detail: `HTTP ${res.status}: ${text.slice(0, 200)}` };
        }
        return { ok: true };
    } catch (err) {
        return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
}

async function apiPatch(
    url: string,
    body: Record<string, unknown>,
    token: string,
): Promise<{ ok: boolean; detail?: string }> {
    try {
        const res = await fetch(url, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            return { ok: false, detail: `HTTP ${res.status}: ${text.slice(0, 200)}` };
        }
        return { ok: true };
    } catch (err) {
        return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
}

// ---------------------------------------------------------------------------
// Individual fix functions
// ---------------------------------------------------------------------------

export async function refreshConnectorToken(
    tenantId: string,
    connectorId: string,
    deps: ConfigFixerDeps,
): Promise<{ ok: boolean; detail?: string }> {
    const base = deps.gatewayBaseUrl.replace(/\/+$/, '');
    return apiPost(
        `${base}/v1/connectors/${encodeURIComponent(connectorId)}/refresh`,
        { tenantId },
        deps.serviceToken,
    );
}

export async function markConnectorNeedsReconnect(
    tenantId: string,
    connectorId: string,
    deps: ConfigFixerDeps,
): Promise<{ ok: boolean; detail?: string }> {
    const base = deps.gatewayBaseUrl.replace(/\/+$/, '');
    const result = await apiPatch(
        `${base}/v1/connectors/${encodeURIComponent(connectorId)}/status`,
        { tenantId, status: 'needs_reconnect' },
        deps.serviceToken,
    );
    if (result.ok) {
        // notify tenant admin about the reconnection requirement
        await apiPost(
            `${base}/v1/notifications`,
            {
                tenantId,
                type: 'connector_needs_reconnect',
                payload: { connectorId, message: 'A connector requires re-authentication. Please reconnect it in the dashboard.' },
            },
            deps.serviceToken,
        );
    }
    return result;
}

export async function retryStuckProvisioningJob(
    tenantId: string,
    jobId: string,
    deps: ConfigFixerDeps,
): Promise<{ ok: boolean; detail?: string }> {
    const base = deps.gatewayBaseUrl.replace(/\/+$/, '');
    return apiPost(
        `${base}/v1/admin/provision/jobs/${encodeURIComponent(jobId)}/retry`,
        { tenantId },
        deps.serviceToken,
    );
}

export async function notifyTenantBillingLimit(
    tenantId: string,
    deps: ConfigFixerDeps,
): Promise<{ ok: boolean; detail?: string }> {
    const base = deps.gatewayBaseUrl.replace(/\/+$/, '');
    return apiPost(
        `${base}/v1/notifications`,
        {
            tenantId,
            type: 'billing_limit_warning',
            payload: { message: 'Your AgentFarm usage has reached the budget threshold. Please review your plan or increase your budget to avoid service interruption.' },
        },
        deps.serviceToken,
    );
}

export async function surfaceApprovalQueueJam(
    tenantId: string,
    pendingCount: number,
    oldestAgeMinutes: number,
    deps: ConfigFixerDeps,
): Promise<{ ok: boolean; detail?: string }> {
    const base = deps.gatewayBaseUrl.replace(/\/+$/, '');
    return apiPost(
        `${base}/v1/notifications`,
        {
            tenantId,
            type: 'approval_queue_jam',
            payload: {
                message: `Your approval queue has ${pendingCount} pending items. The oldest has been waiting ${oldestAgeMinutes} minutes. Please review pending approvals in the dashboard.`,
                pendingCount,
                oldestAgeMinutes,
            },
        },
        deps.serviceToken,
    );
}

// ---------------------------------------------------------------------------
// Tier 1 decision engine
// ---------------------------------------------------------------------------

export async function applyTier1Fix(
    report: DiagnosisReport,
    deps: ConfigFixerDeps,
): Promise<FixResult> {
    const fixes: AppliedFix[] = [];
    const skipped: string[] = [];

    // --- Connector fixes ---
    if (report.connectorHealth.status === 'ok') {
        for (const connector of report.connectorHealth.connectors) {
            if (connector.status === 'degraded' || connector.status === 'error') {
                // Try token refresh first
                const refreshResult = await refreshConnectorToken(report.tenantId, connector.connectorId, deps);
                fixes.push({
                    type: 'connector_token_refresh',
                    description: `Refreshed OAuth token for connector ${connector.connectorType} (${connector.connectorId})`,
                    ok: refreshResult.ok,
                    detail: refreshResult.detail,
                });
            } else if (connector.status === 'needs_reconnect') {
                const result = await markConnectorNeedsReconnect(report.tenantId, connector.connectorId, deps);
                fixes.push({
                    type: 'connector_needs_reconnect',
                    description: `Marked connector ${connector.connectorType} (${connector.connectorId}) as needs-reconnect and notified tenant`,
                    ok: result.ok,
                    detail: result.detail,
                });
            }
        }
    } else {
        skipped.push('connector_fixes (connector health unavailable)');
    }

    // --- Stuck provisioning jobs ---
    if (report.provisioning.status === 'ok' && report.provisioning.state) {
        for (const stuckJob of report.provisioning.state.stuckJobs) {
            const result = await retryStuckProvisioningJob(report.tenantId, stuckJob.jobId, deps);
            fixes.push({
                type: 'provisioning_job_retry',
                description: `Retried stuck provisioning job ${stuckJob.jobId} (was ${stuckJob.status} for ${stuckJob.ageMinutes} minutes)`,
                ok: result.ok,
                detail: result.detail,
            });
        }
    } else if (report.provisioning.status !== 'ok') {
        skipped.push('provisioning_fixes (provisioning state unavailable)');
    }

    // --- Billing notification ---
    if (report.billing.status === 'ok' && report.billing.state) {
        const billing = report.billing.state;
        if (billing.isThrottled || billing.isHardStopped || billing.monthlyUsagePercent >= 80) {
            const result = await notifyTenantBillingLimit(report.tenantId, deps);
            fixes.push({
                type: 'billing_limit_notify',
                description: `Notified tenant of billing limit (${billing.monthlyUsagePercent}% monthly, throttled=${billing.isThrottled}, stopped=${billing.isHardStopped})`,
                ok: result.ok,
                detail: result.detail,
            });
        }
    } else if (report.billing.status !== 'ok') {
        skipped.push('billing_fixes (billing state unavailable)');
    }

    // --- Approval queue jam ---
    if (report.approvalQueue.status === 'ok' && report.approvalQueue.state?.isJammed) {
        const { pendingCount, oldestPendingAgeMinutes } = report.approvalQueue.state;
        const result = await surfaceApprovalQueueJam(report.tenantId, pendingCount, oldestPendingAgeMinutes, deps);
        fixes.push({
            type: 'approval_queue_surface',
            description: `Surfaced approval queue jam to tenant admin (${pendingCount} pending, oldest ${oldestPendingAgeMinutes} min)`,
            ok: result.ok,
            detail: result.detail,
        });
    } else if (report.approvalQueue.status !== 'ok') {
        skipped.push('approval_queue_fixes (approval queue state unavailable)');
    }

    if (fixes.length === 0) {
        fixes.push({
            type: 'no_fix_needed',
            description: 'No Tier 1 fixes applicable for the current diagnosis report',
            ok: true,
        });
    }

    return {
        applied: fixes.some((f) => f.ok && f.type !== 'no_fix_needed'),
        fixes,
        skipped,
    };
}
