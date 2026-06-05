// Issue deduplicator.
// Detects when a new dispatch would address the same root cause as an already-open
// issue (raised within the last 30 minutes) so code-fix / infra-fix dispatchers
// can return a deduplicated response instead of spinning up a duplicate agent run.

import type { DiagnosisReport } from './platform-diagnostics.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeduplicatorDeps {
    gatewayBaseUrl: string;
    serviceToken: string;
}

export interface DuplicateCheckResult {
    isDuplicate: boolean;
    existingIssueId?: string;
    rootCauseKey?: string;
}

// ---------------------------------------------------------------------------
// Root-cause key extraction (pure — no IO)
// ---------------------------------------------------------------------------

export function extractRootCauseKey(report: DiagnosisReport): string | null {
    // Priority order: billing > approvals > provisioning > connectors > tasks

    if (report.billing.state?.isHardStopped) return 'billing:hard_stopped';
    if (report.billing.state?.isThrottled)   return 'billing:throttled';

    if (report.approvalQueue.state?.isJammed) return 'approval_queue:jammed';

    if ((report.provisioning.state?.stuckJobs?.length ?? 0) > 0) return 'provisioning:stuck';

    if (report.connectorHealth.status === 'ok') {
        const unhealthy = report.connectorHealth.connectors.filter((c) => c.status !== 'healthy');
        if (unhealthy.length > 0) {
            const types = [...new Set(unhealthy.map((c) => c.connectorType))].sort().join('+');
            return `connector:${types}:error`;
        }
    }

    if (report.taskLogs.status === 'ok') {
        const total = report.taskLogs.entries.length;
        const failed = report.taskLogs.entries.filter((e) => e.status === 'failed').length;
        if (total >= 5 && failed / total >= 0.5) return 'tasks:high_failure_rate';
    }

    return null;
}

// ---------------------------------------------------------------------------
// Query open issues from gateway
// ---------------------------------------------------------------------------

interface OpenIssue {
    id: string;
    rootCauseKey?: string;
    createdAt: string;
}

async function fetchRecentOpenIssues(
    tenantId: string,
    rootCauseKey: string,
    windowMs: number,
    deps: DeduplicatorDeps,
): Promise<OpenIssue[]> {
    const base = deps.gatewayBaseUrl.replace(/\/+$/, '');
    const since = new Date(Date.now() - windowMs).toISOString();
    try {
        const res = await fetch(
            `${base}/v1/support/issues?tenantId=${encodeURIComponent(tenantId)}&status=open&rootCauseKey=${encodeURIComponent(rootCauseKey)}&since=${encodeURIComponent(since)}`,
            {
                headers: { Authorization: `Bearer ${deps.serviceToken}` },
                signal: AbortSignal.timeout(5_000),
            },
        );
        if (!res.ok) return [];
        const data = (await res.json()) as { issues?: OpenIssue[] };
        return data.issues ?? [];
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// Main dedup check
// ---------------------------------------------------------------------------

export async function deduplicateIssue(
    report: DiagnosisReport,
    tenantId: string,
    deps: DeduplicatorDeps,
    windowMs = 30 * 60_000,
): Promise<DuplicateCheckResult> {
    const key = extractRootCauseKey(report);
    if (!key) return { isDuplicate: false };

    const existing = await fetchRecentOpenIssues(tenantId, key, windowMs, deps);
    if (existing.length === 0) return { isDuplicate: false, rootCauseKey: key };

    return {
        isDuplicate: true,
        existingIssueId: existing[0]?.id,
        rootCauseKey: key,
    };
}
