/**
 * AgentFarm Support Agent — Infra Fix Dispatcher (Tier 3)
 *
 * Builds a structured infra fix request from the diagnosis report and dispatches
 * it to the devops agent via POST /v1/agents/dispatch.
 *
 * Fire-and-forget from the action handler — returns a dispatchId immediately.
 * pollRunbookStatus() is provided for orchestrators that want to track completion.
 */

import type { DiagnosisReport } from './platform-diagnostics.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InfraFixRequest {
    issueId: string;
    issueDescription: string;
    tenantId: string;
    failingServices: string[];
    stuckJobIds: string[];
    billingState: string;
    diagnosisSummary: string[];
}

export interface InfraFixDispatchResult {
    dispatched: boolean;
    dispatchId?: string;
    detail?: string;
}

export type RunbookStatusResult =
    | { status: 'completed'; runbookSummary?: string }
    | { status: 'failed'; detail: string }
    | { status: 'timeout'; detail: string }
    | { status: 'pending' };

export interface InfraFixDispatcherDeps {
    gatewayBaseUrl: string;
    serviceToken: string;
    supportBotId?: string;
    devopsBotId?: string;
    workspaceId?: string;
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

// ---------------------------------------------------------------------------
// Build request
// ---------------------------------------------------------------------------

export function buildInfraFixRequest(
    diagnosisReport: DiagnosisReport,
    issueDescription: string,
    issueId: string,
): InfraFixRequest {
    const failingServices: string[] = [];
    const stuckJobIds: string[] = [];

    for (const c of diagnosisReport.connectorHealth.connectors) {
        if (c.status === 'error' || c.status === 'degraded') {
            failingServices.push(`${c.connectorType} (${c.status})`);
        }
    }

    if (diagnosisReport.provisioning.status === 'ok' && diagnosisReport.provisioning.state) {
        for (const job of diagnosisReport.provisioning.state.stuckJobs) {
            stuckJobIds.push(`${job.jobId} (${job.status}, ${job.ageMinutes}min)`);
        }
    }

    let billingState = 'unknown';
    if (diagnosisReport.billing.status === 'ok' && diagnosisReport.billing.state) {
        const b = diagnosisReport.billing.state;
        billingState = b.isHardStopped
            ? 'hard-stopped'
            : b.isThrottled
            ? `throttled (${b.monthlyUsagePercent}% monthly)`
            : `ok (${b.monthlyUsagePercent}% monthly)`;
    }

    return {
        issueId,
        issueDescription,
        tenantId: diagnosisReport.tenantId,
        failingServices,
        stuckJobIds,
        billingState,
        diagnosisSummary: diagnosisReport.summary,
    };
}

// ---------------------------------------------------------------------------
// Dispatch to devops agent
// ---------------------------------------------------------------------------

export async function dispatchToDevopsAgent(
    request: InfraFixRequest,
    deps: InfraFixDispatcherDeps,
    fetchFn: FetchFn = fetch,
): Promise<InfraFixDispatchResult> {
    const base = deps.gatewayBaseUrl.replace(/\/+$/, '');
    const toAgentId = deps.devopsBotId ?? process.env['DEVOPS_AGENT_BOT_ID'] ?? '';
    const fromAgentId = deps.supportBotId ?? process.env['SUPPORT_AGENT_BOT_ID'] ?? 'support-agent';
    const workspaceId = deps.workspaceId ?? process.env['SUPPORT_AGENT_WORKSPACE_ID'] ?? '';

    if (!toAgentId) {
        return { dispatched: false, detail: 'DEVOPS_AGENT_BOT_ID is not configured' };
    }

    const serviceContext = request.failingServices.length > 0
        ? `\nFailing services:\n${request.failingServices.map((s) => `  - ${s}`).join('\n')}`
        : '';
    const jobContext = request.stuckJobIds.length > 0
        ? `\nStuck provisioning jobs:\n${request.stuckJobIds.map((j) => `  - ${j}`).join('\n')}`
        : '';
    const summaryContext = request.diagnosisSummary.length > 0
        ? `\nDiagnosis:\n${request.diagnosisSummary.map((s) => `  - ${s}`).join('\n')}`
        : '';

    const taskDescription =
        `Investigate and fix infrastructure failure for tenant ${request.tenantId}: ${request.issueDescription}` +
        serviceContext +
        jobContext +
        summaryContext +
        `\nBilling state: ${request.billingState}` +
        `\n\nExecute the appropriate runbook to restore service. Reference issue ID: ${request.issueId}`;

    try {
        const res = await fetchFn(`${base}/v1/agents/dispatch`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${deps.serviceToken}`,
            },
            body: JSON.stringify({ fromAgentId, toAgentId, workspaceId, tenantId: request.tenantId, taskDescription }),
            signal: AbortSignal.timeout(15_000),
        });

        const data = await res.json() as { dispatchId?: string; error?: string };
        if (!res.ok || !data.dispatchId) {
            return { dispatched: false, detail: data.error ?? `HTTP ${res.status}` };
        }

        return { dispatched: true, dispatchId: data.dispatchId };
    } catch (err) {
        return { dispatched: false, detail: err instanceof Error ? err.message : String(err) };
    }
}

// ---------------------------------------------------------------------------
// Poll runbook status (for orchestrator use — not called synchronously)
// ---------------------------------------------------------------------------

export async function pollRunbookStatus(
    dispatchId: string,
    deps: InfraFixDispatcherDeps,
    opts: { maxWaitMs?: number; pollIntervalMs?: number } = {},
    fetchFn: FetchFn = fetch,
): Promise<RunbookStatusResult> {
    const { maxWaitMs = 60 * 60_000, pollIntervalMs = 60_000 } = opts;
    const base = deps.gatewayBaseUrl.replace(/\/+$/, '');
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
        try {
            const res = await fetchFn(
                `${base}/v1/agents/dispatch/${encodeURIComponent(dispatchId)}`,
                {
                    headers: { Authorization: `Bearer ${deps.serviceToken}` },
                    signal: AbortSignal.timeout(10_000),
                },
            );

            if (res.ok) {
                const data = await res.json() as { status?: string; output?: Record<string, unknown> };
                const status = data.status ?? '';

                if (status === 'completed') {
                    const runbookSummary = data.output?.['summary'] as string | undefined;
                    return { status: 'completed', runbookSummary };
                }
                if (status === 'failed') {
                    return { status: 'failed', detail: String(data.output?.['error'] ?? 'DevOps agent reported failure') };
                }
            }
        } catch { /* transient error — keep polling */ }

        await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    return { status: 'timeout', detail: `No completion after ${Math.round(maxWaitMs / 60_000)} minutes` };
}

// ---------------------------------------------------------------------------
// Customer notification
// ---------------------------------------------------------------------------

export async function notifyCustomerInfraFixed(
    issueId: string,
    runbookSummary: string,
    deps: InfraFixDispatcherDeps,
    fetchFn: FetchFn = fetch,
): Promise<void> {
    if (!issueId) return;
    const base = deps.gatewayBaseUrl.replace(/\/+$/, '');
    try {
        await fetchFn(`${base}/v1/support/issues/${encodeURIComponent(issueId)}`, {
            method: 'PATCH',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${deps.serviceToken}`,
            },
            body: JSON.stringify({
                status: 'fixing',
                resolutionNotes: `DevOps agent executed runbook: ${runbookSummary}`,
            }),
            signal: AbortSignal.timeout(10_000),
        });
    } catch { /* best-effort */ }
}
