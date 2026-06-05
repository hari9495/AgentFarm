/**
 * AgentFarm Support Agent — Escalation Handler (Tier 4)
 *
 * When all automated fix tiers are exhausted, compiles a full escalation
 * report and sends it to a human via Slack or PagerDuty (MCP).
 */

import type { DiagnosisReport } from './platform-diagnostics.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EscalationChannel = 'slack' | 'pagerduty';
export type TriedTier = 'tier1' | 'tier2' | 'tier3';

export interface EscalationReport {
    issueId: string;
    tenantId: string;
    issueDescription: string;
    triedTiers: TriedTier[];
    tier1Result?: string;
    tier2Result?: string;
    tier3Result?: string;
    escalatedAt: string;
    fullContext: string;
    diagnosisSummary: string[];
    failedTaskCount: number;
    unhealthyConnectorCount: number;
}

export interface EscalationResult {
    escalated: boolean;
    channel?: EscalationChannel;
    detail?: string;
}

export interface EscalationHandlerDeps {
    gatewayBaseUrl: string;
    serviceToken: string;
    slackMcpUrl?: string;
    pagerdutyMcpUrl?: string;
    slackChannel?: string;
}

/** Injectable MCP invoker — defaults to the real invokeMcpTool. */
export type McpInvokerFn = (
    serverUrl: string,
    headers: Record<string, string>,
    toolName: string,
    args: Record<string, unknown>,
) => Promise<unknown>;

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

// ---------------------------------------------------------------------------
// Build escalation report
// ---------------------------------------------------------------------------

export function buildEscalationReport(
    issueId: string,
    issueDescription: string,
    diagnosisReport: DiagnosisReport,
    triedTiers: TriedTier[],
    opts: { tier1Result?: string; tier2Result?: string; tier3Result?: string } = {},
): EscalationReport {
    const failedTaskCount = diagnosisReport.taskLogs.entries.filter((t) => t.status === 'failed').length;
    const unhealthyConnectorCount = diagnosisReport.connectorHealth.connectors.filter(
        (c) => c.status !== 'healthy',
    ).length;

    const tierLines = triedTiers.map((t) => {
        const result =
            t === 'tier1' ? opts.tier1Result
            : t === 'tier2' ? opts.tier2Result
            : opts.tier3Result;
        return `- ${t.toUpperCase()}: ${result ?? 'applied — issue persists'}`;
    });

    const summaryLines = diagnosisReport.summary.length > 0
        ? diagnosisReport.summary.map((s) => `- ${s}`)
        : ['- No notable findings in current time window'];

    const lines = [
        `🚨 AgentFarm Support Escalation`,
        ``,
        `Issue ID: ${issueId || '(none)'}`,
        `Tenant: ${diagnosisReport.tenantId}`,
        `Description: ${issueDescription}`,
        `Escalated at: ${new Date().toISOString()}`,
        ``,
        `What was tried:`,
        ...tierLines,
        ``,
        `Diagnosis summary:`,
        ...summaryLines,
        ``,
        `Platform state:`,
        `  Failed tasks: ${failedTaskCount}`,
        `  Unhealthy connectors: ${unhealthyConnectorCount}`,
        ``,
        `Action required: all automated fix tiers exhausted — human intervention needed.`,
    ];

    return {
        issueId,
        tenantId: diagnosisReport.tenantId,
        issueDescription,
        triedTiers,
        ...opts,
        escalatedAt: new Date().toISOString(),
        fullContext: lines.join('\n'),
        diagnosisSummary: diagnosisReport.summary,
        failedTaskCount,
        unhealthyConnectorCount,
    };
}

// ---------------------------------------------------------------------------
// Send escalation via MCP
// ---------------------------------------------------------------------------

async function defaultMcpInvoker(
    serverUrl: string,
    headers: Record<string, string>,
    toolName: string,
    args: Record<string, unknown>,
): Promise<unknown> {
    const { invokeMcpTool } = await import('../../mcp-registry-client.js');
    return invokeMcpTool(serverUrl, headers, toolName, args);
}

export async function sendEscalation(
    report: EscalationReport,
    deps: EscalationHandlerDeps,
    mcpInvoker: McpInvokerFn = defaultMcpInvoker,
): Promise<EscalationResult> {
    const slackUrl = deps.slackMcpUrl ?? process.env['MCP_SLACK_URL'] ?? '';
    const pagerdutyUrl = deps.pagerdutyMcpUrl ?? process.env['MCP_PAGERDUTY_URL'] ?? '';
    const channel = deps.slackChannel ?? process.env['SUPPORT_SLACK_CHANNEL'] ?? '#agentfarm-support-escalations';

    if (slackUrl) {
        try {
            await mcpInvoker(slackUrl, {}, 'slack_post_message', {
                channel,
                text: report.fullContext.slice(0, 3_000),
            });
            return { escalated: true, channel: 'slack' };
        } catch { /* fall through to PagerDuty */ }
    }

    if (pagerdutyUrl) {
        try {
            await mcpInvoker(pagerdutyUrl, {}, 'pagerduty_create_incident', {
                title: `AgentFarm Support Escalation: ${report.issueDescription.slice(0, 100)}`,
                description: report.fullContext.slice(0, 4_000),
                urgency: 'high',
                details: {
                    issueId: report.issueId,
                    tenantId: report.tenantId,
                    triedTiers: report.triedTiers.join(', '),
                    escalatedAt: report.escalatedAt,
                },
            });
            return { escalated: true, channel: 'pagerduty' };
        } catch (err) {
            return {
                escalated: false,
                detail: `PagerDuty failed: ${err instanceof Error ? err.message : String(err)}`,
            };
        }
    }

    return {
        escalated: false,
        detail: 'No escalation channel configured (set MCP_SLACK_URL or MCP_PAGERDUTY_URL)',
    };
}

// ---------------------------------------------------------------------------
// Update issue record
// ---------------------------------------------------------------------------

export async function updateIssueEscalated(
    issueId: string,
    escalationDetails: { channel?: EscalationChannel; escalatedAt: string },
    deps: EscalationHandlerDeps,
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
                status: 'escalated',
                escalatedTo: escalationDetails.channel ?? 'unknown',
                resolutionNotes:
                    `Escalated to human via ${escalationDetails.channel ?? 'unknown channel'} ` +
                    `at ${escalationDetails.escalatedAt}. All automated tiers exhausted.`,
            }),
            signal: AbortSignal.timeout(10_000),
        });
    } catch { /* best-effort */ }
}
