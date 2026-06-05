// Proactive platform health monitor.
// Runs on a configurable interval (default 15 min), scans all active tenants,
// and auto-raises support issues for critical conditions detected via the
// existing buildDiagnosisReport() pipeline.

import { buildDiagnosisReport, type DiagnosisReport } from './platform-diagnostics.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProactiveMonitorDeps {
    gatewayBaseUrl: string;
    serviceToken: string;
    supportBotId: string;
    timeoutMs?: number;
}

export interface CriticalCondition {
    title: string;
    description: string;
    severity: 'critical' | 'high' | 'medium';
}

interface ActiveTenant {
    tenantId: string;
}

// ---------------------------------------------------------------------------
// Fetch active tenants from gateway
// ---------------------------------------------------------------------------

export async function fetchAllActiveTenants(deps: ProactiveMonitorDeps): Promise<ActiveTenant[]> {
    const base = deps.gatewayBaseUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/v1/tenants/active`, {
        headers: { Authorization: `Bearer ${deps.serviceToken}` },
        signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000),
    });
    if (!res.ok) throw new Error(`fetchAllActiveTenants: HTTP ${res.status}`);
    const data = (await res.json()) as { tenants?: ActiveTenant[] };
    return data.tenants ?? [];
}

// ---------------------------------------------------------------------------
// Guard: skip tenants that already have an open auto-monitor issue
// ---------------------------------------------------------------------------

async function hasOpenAutoIssue(tenantId: string, deps: ProactiveMonitorDeps): Promise<boolean> {
    const base = deps.gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(
            `${base}/v1/support/issues?tenantId=${encodeURIComponent(tenantId)}&source=auto_monitor&status=open`,
            {
                headers: { Authorization: `Bearer ${deps.serviceToken}` },
                signal: AbortSignal.timeout(5_000),
            },
        );
        if (!res.ok) return false;
        const data = (await res.json()) as { issues?: unknown[] };
        return (data.issues ?? []).length > 0;
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Raise a support issue via gateway
// ---------------------------------------------------------------------------

async function raiseAutoIssue(
    tenantId: string,
    title: string,
    description: string,
    severity: CriticalCondition['severity'],
    deps: ProactiveMonitorDeps,
): Promise<void> {
    const base = deps.gatewayBaseUrl.replace(/\/+$/, '');
    await fetch(`${base}/v1/support/issues`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            Authorization: `Bearer ${deps.serviceToken}`,
        },
        body: JSON.stringify({
            tenantId,
            title,
            description,
            severity,
            source: 'auto_monitor',
            raisedBy: deps.supportBotId,
            raisedAt: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10_000),
    });
}

// ---------------------------------------------------------------------------
// Classify critical conditions from a diagnosis report (pure, testable)
// ---------------------------------------------------------------------------

export function detectCriticalConditions(report: DiagnosisReport): CriticalCondition[] {
    const issues: CriticalCondition[] = [];

    // Billing hard-stop or throttle
    if (report.billing.status === 'ok' && report.billing.state) {
        const b = report.billing.state;
        if (b.isHardStopped) {
            issues.push({
                title: 'Billing hard-stop: agent execution suspended',
                description: `Tenant has exceeded budget limits. Hard-stop enforced. Monthly usage: ${b.monthlyUsagePercent}%.`,
                severity: 'critical',
            });
        } else if (b.isThrottled) {
            issues.push({
                title: 'Billing throttle: agent execution slowed',
                description: `Tenant is being throttled. Monthly usage: ${b.monthlyUsagePercent}%.`,
                severity: 'high',
            });
        } else if (b.monthlyUsagePercent >= 80) {
            issues.push({
                title: 'Billing warning: usage approaching monthly limit',
                description: `Monthly usage at ${b.monthlyUsagePercent}%. Hard-stop will trigger at 100%.`,
                severity: 'medium',
            });
        }
    }

    // Jammed approval queue
    if (report.approvalQueue.status === 'ok' && report.approvalQueue.state?.isJammed) {
        const q = report.approvalQueue.state;
        issues.push({
            title: 'Approval queue jammed',
            description: `${q.pendingCount} approvals pending, oldest ${q.oldestPendingAgeMinutes} minutes. Manual review required.`,
            severity: 'high',
        });
    }

    // Stuck provisioning jobs
    const stuckCount = report.provisioning.state?.stuckJobs?.length ?? 0;
    if (report.provisioning.status === 'ok' && stuckCount > 0) {
        const stuck = report.provisioning.state!.stuckJobs;
        issues.push({
            title: `Provisioning stuck: ${stuck.length} job(s) not progressing`,
            description: stuck.map((j) => `Job ${j.jobId} stuck for ${j.ageMinutes} min`).join('; '),
            severity: 'high',
        });
    }

    // Unhealthy connectors
    if (report.connectorHealth.status === 'ok') {
        const unhealthy = report.connectorHealth.connectors.filter((c) => c.status !== 'healthy');
        if (unhealthy.length > 0) {
            issues.push({
                title: `${unhealthy.length} connector(s) unhealthy`,
                description: unhealthy
                    .map((c) => `${c.connectorType}(${c.connectorId}): ${c.status}${c.errorMessage ? ' — ' + c.errorMessage : ''}`)
                    .join('; '),
                severity: unhealthy.length >= 3 ? 'critical' : 'high',
            });
        }
    }

    // High task failure rate (≥50% of ≥5 tasks)
    if (report.taskLogs.status === 'ok') {
        const total = report.taskLogs.entries.length;
        const failed = report.taskLogs.entries.filter((e) => e.status === 'failed').length;
        if (total >= 5 && failed / total >= 0.5) {
            issues.push({
                title: 'High task failure rate',
                description: `${failed} of ${total} recent tasks failed.`,
                severity: 'high',
            });
        }
    }

    return issues;
}

// ---------------------------------------------------------------------------
// Per-tenant check
// ---------------------------------------------------------------------------

export async function checkTenantForIssues(
    tenantId: string,
    deps: ProactiveMonitorDeps,
): Promise<{ tenantId: string; issued: number }> {
    // Avoid raising duplicate issues
    const alreadyOpen = await hasOpenAutoIssue(tenantId, deps);
    if (alreadyOpen) return { tenantId, issued: 0 };

    const diagDeps = {
        gatewayBaseUrl: deps.gatewayBaseUrl,
        serviceToken: deps.serviceToken,
        timeoutMs: deps.timeoutMs ?? 10_000,
    };

    let report: DiagnosisReport;
    try {
        report = await buildDiagnosisReport(tenantId, diagDeps, {
            requestedBy: deps.supportBotId,
            correlationId: `proactive-${tenantId}-${Date.now()}`,
        });
    } catch {
        return { tenantId, issued: 0 };
    }

    const conditions = detectCriticalConditions(report);
    let issued = 0;

    for (const condition of conditions) {
        try {
            await raiseAutoIssue(tenantId, condition.title, condition.description, condition.severity, deps);
            issued++;
        } catch {
            // best-effort — don't let one failure block others
        }
    }

    return { tenantId, issued };
}

// ---------------------------------------------------------------------------
// Main monitor run — processes all tenants sequentially
// ---------------------------------------------------------------------------

export async function runProactiveMonitor(deps: ProactiveMonitorDeps): Promise<void> {
    let tenants: ActiveTenant[];
    try {
        tenants = await fetchAllActiveTenants(deps);
    } catch (err) {
        console.warn('[proactive-monitor] failed to fetch active tenants:', String(err));
        return;
    }

    for (const tenant of tenants) {
        try {
            await checkTenantForIssues(tenant.tenantId, deps);
        } catch {
            // individual tenant failures are non-fatal
        }
    }
}

// ---------------------------------------------------------------------------
// Startup registration
// ---------------------------------------------------------------------------

export function startProactiveMonitor(deps: ProactiveMonitorDeps): NodeJS.Timeout | null {
    if (process.env['PROACTIVE_MONITOR_ENABLED'] !== 'true') return null;

    const intervalMs = Math.max(
        60_000,
        Number(process.env['PROACTIVE_MONITOR_INTERVAL_MS'] ?? 15 * 60_000),
    );

    const timer = setInterval(() => {
        void runProactiveMonitor(deps).catch((err: unknown) => {
            console.warn('[proactive-monitor] run error:', String(err));
        });
    }, intervalMs);

    // Allow process exit even if the timer is pending
    if (typeof timer.unref === 'function') timer.unref();

    console.log(`[proactive-monitor] started — interval ${intervalMs}ms`);
    return timer;
}
