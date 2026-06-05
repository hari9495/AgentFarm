/**
 * AgentFarm Support Agent — Code Fix Dispatcher (Tier 2)
 *
 * Builds a structured fix request from the diagnosis report and dispatches
 * it to the developer agent via POST /v1/agents/dispatch.
 *
 * Fire-and-forget from the action handler — returns a dispatchId immediately.
 * pollPrStatus() is provided for orchestrators that want to track completion.
 */

import type { DiagnosisReport } from './platform-diagnostics.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CodeFixRequest {
    issueId: string;
    issueDescription: string;
    tenantId: string;
    errorMessages: string[];
    failedTaskIds: string[];
    diagnosisSummary: string[];
}

export interface CodeFixDispatchResult {
    dispatched: boolean;
    dispatchId?: string;
    detail?: string;
}

export type PrStatusResult =
    | { status: 'completed'; prUrl?: string }
    | { status: 'failed'; detail: string }
    | { status: 'timeout'; detail: string }
    | { status: 'pending' };

export interface CodeFixDispatcherDeps {
    gatewayBaseUrl: string;
    serviceToken: string;
    supportBotId?: string;
    developerBotId?: string;
    workspaceId?: string;
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

// ---------------------------------------------------------------------------
// Build request
// ---------------------------------------------------------------------------

export function buildCodeFixRequest(
    diagnosisReport: DiagnosisReport,
    issueDescription: string,
    issueId: string,
): CodeFixRequest {
    const errorMessages: string[] = [];
    const failedTaskIds: string[] = [];

    for (const task of diagnosisReport.taskLogs.entries) {
        if (task.status === 'failed') {
            failedTaskIds.push(task.id);
            if (task.errorMessage) {
                errorMessages.push(`Task ${task.actionType}: ${task.errorMessage}`);
            }
        }
    }

    for (const c of diagnosisReport.connectorHealth.connectors) {
        if ((c.status === 'error' || c.status === 'degraded') && c.errorMessage) {
            errorMessages.push(`Connector ${c.connectorType}: ${c.errorMessage}`);
        }
    }

    return {
        issueId,
        issueDescription,
        tenantId: diagnosisReport.tenantId,
        errorMessages,
        failedTaskIds,
        diagnosisSummary: diagnosisReport.summary,
    };
}

// ---------------------------------------------------------------------------
// Dispatch to developer agent
// ---------------------------------------------------------------------------

export async function dispatchToDeveloperAgent(
    request: CodeFixRequest,
    deps: CodeFixDispatcherDeps,
    fetchFn: FetchFn = fetch,
): Promise<CodeFixDispatchResult> {
    const base = deps.gatewayBaseUrl.replace(/\/+$/, '');
    const toAgentId = deps.developerBotId ?? process.env['DEVELOPER_AGENT_BOT_ID'] ?? '';
    const fromAgentId = deps.supportBotId ?? process.env['SUPPORT_AGENT_BOT_ID'] ?? 'support-agent';
    const workspaceId = deps.workspaceId ?? process.env['SUPPORT_AGENT_WORKSPACE_ID'] ?? '';

    if (!toAgentId) {
        return { dispatched: false, detail: 'DEVELOPER_AGENT_BOT_ID is not configured' };
    }

    const errorContext = request.errorMessages.length > 0
        ? `\nErrors:\n${request.errorMessages.map((e) => `  - ${e}`).join('\n')}`
        : '';
    const summaryContext = request.diagnosisSummary.length > 0
        ? `\nDiagnosis:\n${request.diagnosisSummary.map((s) => `  - ${s}`).join('\n')}`
        : '';

    const taskDescription =
        `Fix platform issue for tenant ${request.tenantId}: ${request.issueDescription}` +
        errorContext +
        summaryContext +
        `\n\nInvestigate the root cause, implement a fix, and create a pull request. ` +
        `Reference issue ID: ${request.issueId}`;

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
// Poll PR status (for orchestrator use — not called synchronously)
// ---------------------------------------------------------------------------

export async function pollPrStatus(
    dispatchId: string,
    deps: CodeFixDispatcherDeps,
    opts: { maxWaitMs?: number; pollIntervalMs?: number } = {},
    fetchFn: FetchFn = fetch,
): Promise<PrStatusResult> {
    const { maxWaitMs = 30 * 60_000, pollIntervalMs = 30_000 } = opts;
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
                    const prUrl = data.output?.['prUrl'] as string | undefined;
                    return { status: 'completed', prUrl };
                }
                if (status === 'failed') {
                    return { status: 'failed', detail: String(data.output?.['error'] ?? 'Developer agent reported failure') };
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

export async function notifyCustomerPrRaised(
    issueId: string,
    prUrl: string,
    deps: CodeFixDispatcherDeps,
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
                resolutionNotes: `Developer agent raised a pull request: ${prUrl}. Awaiting review and merge.`,
            }),
            signal: AbortSignal.timeout(10_000),
        });
    } catch { /* best-effort */ }
}
