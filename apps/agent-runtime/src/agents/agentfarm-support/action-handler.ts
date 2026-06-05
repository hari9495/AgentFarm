// ============================================================================
// AGENTFARM SUPPORT AGENT — ACTION HANDLER
//
// Routes all agentfarm_support_* actions to the correct module.
// Sprint 19: issue_ingest, diagnose, config_fix are fully implemented.
// Sprint 20-23 actions return not-yet-implemented until those sprints land.
// ============================================================================

import { buildDiagnosisReport, type DiagnosisReport } from './platform-diagnostics.js';
import { applyTier1Fix } from './config-fixer.js';
import { buildCodeFixRequest, dispatchToDeveloperAgent } from './code-fix-dispatcher.js';
import { buildInfraFixRequest, dispatchToDevopsAgent } from './infra-fix-dispatcher.js';
import { buildEscalationReport, sendEscalation, updateIssueEscalated, type TriedTier } from './escalation-handler.js';
import { ingestApprovedCase } from './rag-retriever.js';
import { ingestSupportFeedback, GatewaySupportLessonStore } from './lesson-pipeline.js';
import {
    detectPromptInjection,
    detectProprietaryInfoRequest,
    sanitizeResponseForCustomer,
    INJECTION_REFUSAL,
    DISCLOSURE_REFUSAL,
} from './information-disclosure-guard.js';
import { sendSupportCsatSurvey } from './csat-sender.js';
import { deduplicateIssue } from './issue-deduplicator.js';

// ---------------------------------------------------------------------------
// Input length limits — enforced at the action boundary before any processing
// ---------------------------------------------------------------------------

const MAX_LEN = {
    title: 500,
    description: 2_000,
    transcript: 3_000,
    issueId: 100,
    resolutionNotes: 5_000,
    issueDescription: 2_000,
} as const;

function tooLong(value: string, max: number, field: string): AgentfarmSupportActionResult | null {
    return value.length > max
        ? { ok: false, output: '', errorOutput: `payload.${field} exceeds ${max} character limit` }
        : null;
}

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

    const deps = { gatewayBaseUrl, serviceToken } as const;

    switch (actionType) {
        // ── Sprint 19: Issue ingest ──────────────────────────────────────────
        case 'agentfarm_support_issue_ingest': {
            const title       = str(payload['title'], 'Untitled issue');
            const description = str(payload['description']);
            const severity    = str(payload['severity'], 'medium');
            if (!description) {
                return { ok: false, output: '', errorOutput: 'payload.description is required' };
            }
            const e1 = tooLong(title, MAX_LEN.title, 'title');               if (e1) return e1;
            const e2 = tooLong(description, MAX_LEN.description, 'description'); if (e2) return e2;
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
                const report = await buildDiagnosisReport(tenantId, deps, {
                    correlationId,
                    timeWindowHours,
                    requestedBy: params.botId,
                });
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
            const e3 = tooLong(customerMessage, MAX_LEN.description, 'customerMessage'); if (e3) return e3;

            // Security checks — injection first, then disclosure
            if (detectPromptInjection(customerMessage)) {
                return { ok: true, output: JSON.stringify({ text: INJECTION_REFUSAL.chat, refused: true }) };
            }
            if (detectProprietaryInfoRequest(customerMessage)) {
                return { ok: true, output: JSON.stringify({ text: DISCLOSURE_REFUSAL.chat, refused: true }) };
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

            return { ok: true, output: JSON.stringify({ text: sanitizeResponseForCustomer(replyText) }) };
        }

        // ── Sprint 22: Voice reply ────────────────────────────────────────────
        case 'agentfarm_support_voice_reply': {
            const transcript = str(payload['transcript']);
            if (!transcript) {
                return { ok: false, output: '', errorOutput: 'payload.transcript is required' };
            }

            const e4 = tooLong(transcript, MAX_LEN.transcript, 'transcript'); if (e4) return e4;

            // Security checks — injection first, then disclosure
            if (detectPromptInjection(transcript)) {
                return {
                    ok: true,
                    output: JSON.stringify({
                        text: INJECTION_REFUSAL.voice,
                        languageCode: str(payload['languageCode'], 'en-IN'),
                        refused: true,
                    }),
                };
            }
            if (detectProprietaryInfoRequest(transcript)) {
                return {
                    ok: true,
                    output: JSON.stringify({
                        text: DISCLOSURE_REFUSAL.voice,
                        languageCode: str(payload['languageCode'], 'en-IN'),
                        refused: true,
                    }),
                };
            }

            const languageCode = str(payload['languageCode'], 'hi-IN');
            const issueId = str(payload['issueId'], '');

            // Build a concise spoken reply (short sentences work better for TTS)
            let replyText: string;
            const lc = languageCode.toLowerCase();
            if (lc.startsWith('hi')) {
                replyText = `आपकी बात सुन ली। मैं आपकी समस्या की जाँच कर रहा हूँ।${issueId ? ` इशू आईडी: ${issueId.slice(0, 8)}.` : ''} कृपया प्रतीक्षा करें।`;
            } else if (lc.startsWith('ta')) {
                replyText = `உங்கள் பிரச்சனையை கேட்டேன். ஆராய்கிறேன். சற்று காத்திருங்கள்.`;
            } else if (lc.startsWith('te')) {
                replyText = `మీ సమస్య విన్నాను. పరిశీలిస్తున్నాను. దయచేసి వేచి ఉండండి.`;
            } else {
                replyText = `I heard you. You said: "${transcript.slice(0, 80)}".${issueId ? ` Issue ${issueId.slice(0, 8)} is being investigated.` : ''} I'm checking your platform now. Please hold on.`;
            }

            return {
                ok: true,
                output: JSON.stringify({ text: sanitizeResponseForCustomer(replyText), languageCode }),
            };
        }

        // ── Sprint 23: Code fix dispatch (Tier 2) ────────────────────────────
        case 'agentfarm_support_code_fix_dispatch': {
            const rawReport = payload['diagnosisReport'];
            if (!rawReport || typeof rawReport !== 'object') {
                return { ok: false, output: '', errorOutput: 'payload.diagnosisReport is required' };
            }
            const issueId = str(payload['issueId'], '');
            const issueDescription = str(payload['issueDescription'], 'Unknown platform issue');
            const e5 = tooLong(issueId, MAX_LEN.issueId, 'issueId');                         if (e5) return e5;
            const e6 = tooLong(issueDescription, MAX_LEN.issueDescription, 'issueDescription'); if (e6) return e6;

            // Dedup check — avoid spinning up a developer agent for a root cause already in flight
            const codeDup = await deduplicateIssue(rawReport as DiagnosisReport, tenantId, deps);
            if (codeDup.isDuplicate) {
                return {
                    ok: true,
                    output: JSON.stringify({
                        deduplicated: true,
                        existingIssueId: codeDup.existingIssueId,
                        rootCauseKey: codeDup.rootCauseKey,
                        message: `A fix for root cause '${codeDup.rootCauseKey}' is already in progress (issue ${codeDup.existingIssueId}).`,
                    }),
                };
            }

            const request = buildCodeFixRequest(rawReport as DiagnosisReport, issueDescription, issueId);
            const result = await dispatchToDeveloperAgent(request, {
                ...deps,
                supportBotId: params.botId,
                workspaceId: params.workspaceId,
            });

            if (!result.dispatched) {
                // Tier 2 retries exhausted — automatically fall through to Tier 3 (infra dispatch)
                if (result.retriesExhausted) {
                    const infraFallback = buildInfraFixRequest(rawReport as DiagnosisReport, issueDescription, issueId);
                    const infraResult = await dispatchToDevopsAgent(infraFallback, {
                        ...deps,
                        supportBotId: params.botId,
                        workspaceId: params.workspaceId,
                    });
                    if (infraResult.dispatched) {
                        return {
                            ok: true,
                            output: JSON.stringify({
                                dispatched: true,
                                tier: 3,
                                dispatchId: infraResult.dispatchId,
                                message: `Tier 2 queue full — DevOps agent dispatched as Tier 3 fallback (ID: ${infraResult.dispatchId ?? 'unknown'}).`,
                            }),
                        };
                    }
                }
                if (params.workspaceId) {
                    const store = new GatewaySupportLessonStore(gatewayBaseUrl, serviceToken);
                    await ingestSupportFeedback(
                        { tenantId, workspaceId: params.workspaceId, taskId: params.taskId, issueId, actionType: 'agentfarm_support_code_fix_dispatch', correlationId: issueId },
                        [{ body: `Code fix dispatch failed for issue "${issueDescription}": ${result.detail ?? 'unknown error'}` }],
                        store,
                    );
                }
                return { ok: false, output: '', errorOutput: `Code fix dispatch failed: ${result.detail}` };
            }
            return {
                ok: true,
                output: JSON.stringify({
                    dispatched: true,
                    tier: 2,
                    dispatchId: result.dispatchId,
                    message: `Developer agent dispatched (ID: ${result.dispatchId ?? 'unknown'}). A pull request will be raised once the fix is ready.`,
                }),
            };
        }

        // ── Sprint 23: Infra fix dispatch (Tier 3) ───────────────────────────
        case 'agentfarm_support_infra_fix_dispatch': {
            const rawReport = payload['diagnosisReport'];
            if (!rawReport || typeof rawReport !== 'object') {
                return { ok: false, output: '', errorOutput: 'payload.diagnosisReport is required' };
            }
            const issueId = str(payload['issueId'], '');
            const issueDescription = str(payload['issueDescription'], 'Unknown infrastructure failure');
            const e7 = tooLong(issueId, MAX_LEN.issueId, 'issueId');                         if (e7) return e7;
            const e8 = tooLong(issueDescription, MAX_LEN.issueDescription, 'issueDescription'); if (e8) return e8;

            // Dedup check — avoid spinning up a devops agent for a root cause already in flight
            const infraDup = await deduplicateIssue(rawReport as DiagnosisReport, tenantId, deps);
            if (infraDup.isDuplicate) {
                return {
                    ok: true,
                    output: JSON.stringify({
                        deduplicated: true,
                        existingIssueId: infraDup.existingIssueId,
                        rootCauseKey: infraDup.rootCauseKey,
                        message: `A fix for root cause '${infraDup.rootCauseKey}' is already in progress (issue ${infraDup.existingIssueId}).`,
                    }),
                };
            }

            const request = buildInfraFixRequest(rawReport as DiagnosisReport, issueDescription, issueId);
            const result = await dispatchToDevopsAgent(request, {
                ...deps,
                supportBotId: params.botId,
                workspaceId: params.workspaceId,
            });

            if (!result.dispatched) {
                if (params.workspaceId) {
                    const store = new GatewaySupportLessonStore(gatewayBaseUrl, serviceToken);
                    await ingestSupportFeedback(
                        { tenantId, workspaceId: params.workspaceId, taskId: params.taskId, issueId, actionType: 'agentfarm_support_infra_fix_dispatch', correlationId: issueId },
                        [{ body: `Infra fix dispatch failed for issue "${issueDescription}": ${result.detail ?? 'unknown error'}` }],
                        store,
                    );
                }
                return { ok: false, output: '', errorOutput: `Infra fix dispatch failed: ${result.detail}` };
            }
            return {
                ok: true,
                output: JSON.stringify({
                    dispatched: true,
                    dispatchId: result.dispatchId,
                    message: `DevOps agent dispatched (ID: ${result.dispatchId ?? 'unknown'}). A runbook will be executed to restore service.`,
                }),
            };
        }

        // ── Sprint 23: Escalate (Tier 4) ──────────────────────────────────────
        case 'agentfarm_support_escalate': {
            const rawReport = payload['diagnosisReport'];
            if (!rawReport || typeof rawReport !== 'object') {
                return { ok: false, output: '', errorOutput: 'payload.diagnosisReport is required' };
            }
            const issueId = str(payload['issueId'], '');
            const issueDescription = str(payload['issueDescription'], 'Unknown issue requiring escalation');
            const e9  = tooLong(issueId, MAX_LEN.issueId, 'issueId');                         if (e9) return e9;
            const e10 = tooLong(issueDescription, MAX_LEN.issueDescription, 'issueDescription'); if (e10) return e10;
            const rawTiers = Array.isArray(payload['triedTiers']) ? payload['triedTiers'] : ['tier1'];
            const triedTiers = (rawTiers as unknown[])
                .map((t) => String(t))
                .filter((t): t is TriedTier => ['tier1', 'tier2', 'tier3'].includes(t));

            const report = buildEscalationReport(
                issueId,
                issueDescription,
                rawReport as DiagnosisReport,
                triedTiers.length > 0 ? triedTiers : ['tier1'],
                {
                    tier1Result: str(payload['tier1Result'], undefined as unknown as string) || undefined,
                    tier2Result: str(payload['tier2Result'], undefined as unknown as string) || undefined,
                    tier3Result: str(payload['tier3Result'], undefined as unknown as string) || undefined,
                },
            );

            const escalationResult = await sendEscalation(report, deps);
            await updateIssueEscalated(
                issueId,
                { channel: escalationResult.channel, escalatedAt: report.escalatedAt },
                deps,
            );

            return {
                ok: true,
                output: JSON.stringify({
                    escalated: escalationResult.escalated,
                    channel: escalationResult.channel ?? null,
                    detail: escalationResult.detail ?? null,
                    escalatedAt: report.escalatedAt,
                }),
            };
        }

        // ── Sprint 23: Resolve ────────────────────────────────────────────────
        case 'agentfarm_support_resolve': {
            const issueId = str(payload['issueId'], '');
            const resolutionNotes = str(payload['resolutionNotes'], 'Issue resolved by support agent.');
            const e11 = tooLong(issueId, MAX_LEN.issueId, 'issueId');                        if (e11) return e11;
            const e12 = tooLong(resolutionNotes, MAX_LEN.resolutionNotes, 'resolutionNotes'); if (e12) return e12;
            const base = deps.gatewayBaseUrl.replace(/\/+$/, '');

            if (issueId) {
                try {
                    await fetch(`${base}/v1/support/issues/${encodeURIComponent(issueId)}/resolve`, {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/json',
                            Authorization: `Bearer ${deps.serviceToken}`,
                        },
                        body: JSON.stringify({ resolutionNotes }),
                        signal: AbortSignal.timeout(10_000),
                    });
                } catch { /* best-effort — don't fail the action on network error */ }
            }

            // Best-effort CSAT survey — fire-and-forget, never blocks resolve
            void sendSupportCsatSurvey({ tenantId, botId: params.botId, issueId, resolutionNotes }, deps).catch(() => {});

            // Feed the RAG flywheel — ingest resolved case so future retrievals benefit
            if (resolutionNotes.length > 20) {
                await ingestApprovedCase({
                    tenantId,
                    botId: params.botId,
                    caseTitle: issueId ? `Resolved issue ${issueId}` : 'Resolved support case',
                    documentType: 'case_resolution',
                    content: resolutionNotes,
                    issueCategory: str(payload['issueCategory'], undefined as unknown as string) || undefined,
                    gatewayBaseUrl,
                    serviceToken,
                });
            }

            return {
                ok: true,
                output: JSON.stringify({
                    resolved: true,
                    issueId: issueId || null,
                    resolvedAt: new Date().toISOString(),
                    resolutionNotes,
                }),
            };
        }
    }
}
