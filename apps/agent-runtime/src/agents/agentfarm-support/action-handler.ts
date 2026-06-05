// ============================================================================
// AGENTFARM SUPPORT AGENT — ACTION HANDLER
//
// Routes all agentfarm_support_* actions to the correct module.
// Sprint 19: issue_ingest, diagnose, config_fix are fully implemented.
// Sprint 20-23 actions return not-yet-implemented until those sprints land.
// ============================================================================

import { buildDiagnosisReport } from './platform-diagnostics.js';
import { applyTier1Fix } from './config-fixer.js';

// ---------------------------------------------------------------------------
// Action type registry
// ---------------------------------------------------------------------------

export type AgentfarmSupportActionType =
    | 'agentfarm_support_issue_ingest'
    | 'agentfarm_support_diagnose'
    | 'agentfarm_support_config_fix'
    | 'agentfarm_support_chat_reply'
    | 'agentfarm_support_voice_reply'
    | 'agentfarm_support_code_fix_dispatch'
    | 'agentfarm_support_infra_fix_dispatch'
    | 'agentfarm_support_escalate'
    | 'agentfarm_support_resolve';

const AGENTFARM_SUPPORT_ACTION_TYPES = new Set<AgentfarmSupportActionType>([
    'agentfarm_support_issue_ingest',
    'agentfarm_support_diagnose',
    'agentfarm_support_config_fix',
    'agentfarm_support_chat_reply',
    'agentfarm_support_voice_reply',
    'agentfarm_support_code_fix_dispatch',
    'agentfarm_support_infra_fix_dispatch',
    'agentfarm_support_escalate',
    'agentfarm_support_resolve',
]);

export function isAgentfarmSupportActionType(at: string): at is AgentfarmSupportActionType {
    return AGENTFARM_SUPPORT_ACTION_TYPES.has(at as AgentfarmSupportActionType);
}

// ---------------------------------------------------------------------------
// Handler params
// ---------------------------------------------------------------------------

export interface AgentfarmSupportActionParams {
    actionType: AgentfarmSupportActionType;
    tenantId: string;
    botId: string;
    taskId: string;
    payload: Record<string, unknown>;
    gatewayBaseUrl: string;
    serviceToken: string;
    workspaceId?: string;
}

export interface AgentfarmSupportActionResult {
    ok: boolean;
    output: string;
    errorOutput?: string;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function str(v: unknown, fallback = ''): string {
    return typeof v === 'string' ? v.trim() : fallback;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleAgentfarmSupportAction(
    params: AgentfarmSupportActionParams,
): Promise<AgentfarmSupportActionResult> {
    const { actionType, tenantId, payload, gatewayBaseUrl, serviceToken } = params;

    const deps = { gatewayBaseUrl, serviceToken };

    switch (actionType) {
        // ── Sprint 19: Issue ingest ──────────────────────────────────────────
        case 'agentfarm_support_issue_ingest': {
            const title       = str(payload['title'], 'Untitled issue');
            const description = str(payload['description']);
            const severity    = str(payload['severity'], 'medium');
            if (!description) {
                return { ok: false, output: '', errorOutput: 'payload.description is required' };
            }
            return {
                ok: true,
                output: JSON.stringify({
                    status: 'ingested',
                    tenantId,
                    title,
                    description,
                    severity,
                    ingestedAt: new Date().toISOString(),
                }),
            };
        }

        // ── Sprint 19: Diagnose ─────────────────────────────────────────────
        case 'agentfarm_support_diagnose': {
            const correlationId    = str(payload['correlationId'], undefined as unknown as string) || undefined;
            const timeWindowHours  = typeof payload['timeWindowHours'] === 'number' ? payload['timeWindowHours'] : 4;
            try {
                const report = await buildDiagnosisReport(tenantId, deps, { correlationId, timeWindowHours });
                return { ok: true, output: JSON.stringify(report) };
            } catch (err) {
                return {
                    ok: false,
                    output: '',
                    errorOutput: `Diagnosis failed: ${err instanceof Error ? err.message : String(err)}`,
                };
            }
        }

        // ── Sprint 19: Config fix (Tier 1) ──────────────────────────────────
        case 'agentfarm_support_config_fix': {
            const rawReport = payload['diagnosisReport'];
            if (!rawReport || typeof rawReport !== 'object') {
                return { ok: false, output: '', errorOutput: 'payload.diagnosisReport is required' };
            }
            try {
                const fixResult = await applyTier1Fix(rawReport as Parameters<typeof applyTier1Fix>[0], deps);
                return { ok: true, output: JSON.stringify(fixResult) };
            } catch (err) {
                return {
                    ok: false,
                    output: '',
                    errorOutput: `Config fix failed: ${err instanceof Error ? err.message : String(err)}`,
                };
            }
        }

        // ── Sprint 20: Chat reply ────────────────────────────────────────────
        case 'agentfarm_support_chat_reply': {
            const customerMessage = str(payload['customerMessage']);
            if (!customerMessage) {
                return { ok: false, output: '', errorOutput: 'payload.customerMessage is required' };
            }
            const rawReport = payload['diagnosisReport'] as Record<string, unknown> | null | undefined;
            const summary: string[] = rawReport
                ? ((rawReport['summary'] as string[] | undefined) ?? [])
                : [];
            const issueId = str(payload['issueId'], '');

            let replyText: string;
            if (summary.length > 0) {
                const bulletList = summary.map((s) => `• ${s}`).join('\n');
                replyText = `I've analysed your platform and found the following:\n\n${bulletList}\n\nI've applied all available automatic fixes. Please let me know if the issue persists or if you need further assistance.`;
            } else {
                replyText = `Thank you for reaching out. I've run a full platform diagnosis${issueId ? ` for issue ${issueId}` : ''}. No critical issues were detected in the current window. If the problem continues, please share any error messages or task IDs and I'll investigate further.`;
            }

            return { ok: true, output: JSON.stringify({ text: replyText }) };
        }

        // ── Sprint 22: Voice reply (stub) ────────────────────────────────────
        case 'agentfarm_support_voice_reply': {
            return {
                ok: false,
                output: '',
                errorOutput: 'agentfarm_support_voice_reply: not yet implemented (Sprint 22)',
            };
        }

        // ── Sprint 23: Code fix dispatch (stub) ──────────────────────────────
        case 'agentfarm_support_code_fix_dispatch': {
            return {
                ok: false,
                output: '',
                errorOutput: 'agentfarm_support_code_fix_dispatch: not yet implemented (Sprint 23)',
            };
        }

        // ── Sprint 23: Infra fix dispatch (stub) ─────────────────────────────
        case 'agentfarm_support_infra_fix_dispatch': {
            return {
                ok: false,
                output: '',
                errorOutput: 'agentfarm_support_infra_fix_dispatch: not yet implemented (Sprint 23)',
            };
        }

        // ── Sprint 23: Escalate (stub) ────────────────────────────────────────
        case 'agentfarm_support_escalate': {
            return {
                ok: false,
                output: '',
                errorOutput: 'agentfarm_support_escalate: not yet implemented (Sprint 23)',
            };
        }

        // ── Sprint 23: Resolve (stub) ─────────────────────────────────────────
        case 'agentfarm_support_resolve': {
            return {
                ok: false,
                output: '',
                errorOutput: 'agentfarm_support_resolve: not yet implemented (Sprint 23)',
            };
        }
    }
}
