/**
 * Business Analyst — Action Handler
 *
 * Orchestration layer that wires all BA modules into a single entry point for
 * every workspace_ba_* action type.
 *
 * For each action the handler executes in order:
 *   1. RAG context retrieval  — prior BRDs, compliance checklists, BA lessons
 *   2. Tone adaptation        — rewrite prose style if a stakeholder profile exists
 *   3. Content generation     — LLM draft using enriched system prompt
 *   4. Completeness check     — scored for BRD-family document types
 *   5. Risk gate              — classify → auto-execute | async notify | escalate
 *   6. Post-run persistence   — KB ingestion on approval, lesson write on rejection
 *   7. Episodic memory        — pattern + summary written after every run
 *
 * Mirrors the structure of developer-action-handler.ts but uses document
 * generation (callLlm) rather than code execution sub-actions.
 */

import type { MeetingProviderExecutor } from '../meeting-agent/meeting-transcription.js';
import {
    buildBaRagContext,
    ingestApprovedDocument,
    type BaRagQuery,
} from './business-analyst-rag-retriever.js';
import {
    classifyBaActionRisk,
    isAutoApproved,
    requiresAsyncNotification,
    formatGateDecisionSummary,
    ACTION_TYPE_TO_DOC_TYPE,
    type DocumentAudience,
} from './business-analyst-approval-gate.js';
import {
    sendAsyncApprovalNotification,
    pollApprovalDecision,
    type AsyncApprovalNotificationRequest,
} from './business-analyst-async-approval.js';
import { checkBrdCompleteness } from './business-analyst-brd-completeness-checker.js';
import { adaptBaToneForStakeholder, detectBaStakeholderTone } from './business-analyst-tone-adapter.js';
import type { BaProseCallerFn } from './business-analyst-tone-adapter.js';
import type { StakeholderProfile } from './business-analyst-stakeholder-profile.js';
import {
    ingestBaFeedback,
    persistLessonToMemory,
    buildBaEpisodicPattern,
    buildBaEpisodicSummary,
    GatewayBaLessonStore,
    type BaFeedbackContext,
    type BaFeedbackItem,
    type BaDocumentTypeFilter,
} from './business-analyst-lesson-pipeline.js';
import type { TaskEnvelope, ProcessedTaskResult } from '../../execution-engine.js';

// ---------------------------------------------------------------------------
// Action type registry
// ---------------------------------------------------------------------------

export type BaActionType =
    | 'workspace_ba_draft_brd'
    | 'workspace_ba_draft_user_story'
    | 'workspace_ba_finalize_brd'
    | 'workspace_ba_finalize_acceptance_criteria'
    | 'workspace_ba_process_map'
    | 'workspace_ba_gap_analysis'
    | 'workspace_ba_impact_analysis'
    | 'workspace_ba_solution_eval'
    | 'workspace_ba_stakeholder_update'
    | 'workspace_ba_uat_checklist'
    | 'workspace_ba_elicit_requirements'
    | 'share_spec_external';

export const BA_ACTION_TYPES = new Set<BaActionType>([
    'workspace_ba_draft_brd',
    'workspace_ba_draft_user_story',
    'workspace_ba_finalize_brd',
    'workspace_ba_finalize_acceptance_criteria',
    'workspace_ba_process_map',
    'workspace_ba_gap_analysis',
    'workspace_ba_impact_analysis',
    'workspace_ba_solution_eval',
    'workspace_ba_stakeholder_update',
    'workspace_ba_uat_checklist',
    'workspace_ba_elicit_requirements',
    'share_spec_external',
]);

export function isBaActionType(at: string): at is BaActionType {
    return BA_ACTION_TYPES.has(at as BaActionType);
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BaActionParams {
    actionType: BaActionType;
    tenantId: string;
    botId: string;
    taskId: string;
    workspaceId: string;
    payload: Record<string, unknown>;
    gatewayBaseUrl: string;
    serviceToken: string;
    /** LLM prose caller — required for document generation. */
    callLlm?: (prompt: string, systemPrompt?: string) => Promise<string>;
    /** Provider executor — required for async Slack/email approval notifications. */
    notificationExecutor?: MeetingProviderExecutor;
    /** Pre-loaded stakeholder profile for tone adaptation. */
    stakeholderProfile?: StakeholderProfile;
    /**
     * Notification target for async approvals (Slack user ID, channel, or email).
     * Required when using async (medium risk) approval flow.
     */
    approvalNotificationTarget?: string;
    /** Channel for async approval notifications. Default: 'slack'. */
    approvalNotificationChannel?: 'slack' | 'email';
    /** ISO-8601 deadline for async approvals — auto-rejected after this time. */
    approvalEscalationDeadlineIso?: string;
    /** Override auto-approve completeness threshold. Default: 0.85. */
    autoApproveThreshold?: number;
}

export interface BaActionResult {
    ok: boolean;
    /** Generated document content, or empty string if approval is pending. */
    output: string;
    documentType?: string;
    riskLevel?: 'low' | 'medium' | 'high';
    completenessScore?: number;
    gaps?: string[];
    approvalId?: string;
    approvalStatus?: 'auto_approved' | 'pending_async' | 'pending_escalation';
    ragContextUsed?: boolean;
    errorOutput?: string;
    [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(v: unknown, fallback = ''): string {
    return typeof v === 'string' ? v.trim() : fallback;
}

function arr(v: unknown): string[] {
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

async function callLlmSafe(
    callLlm: ((prompt: string, sys?: string) => Promise<string>) | undefined,
    prompt: string,
    systemPrompt?: string,
): Promise<string> {
    if (!callLlm) return '';
    try {
        return await callLlm(prompt, systemPrompt);
    } catch {
        return '';
    }
}

/**
 * Adapt a `(prompt, systemPrompt?) => Promise<string>` callLlm function to the
 * BaProseCallerFn signature used by tone-adapter and completeness-checker.
 *
 * BaProseCallerFn: (systemPrompt, userPrompt) → Promise<{ text, tokensUsed? }>
 * callLlm:        (userPrompt, systemPrompt?) → Promise<string>
 *
 * Note the swapped argument order.
 */
function toBaProseCallerFn(
    callLlm: (prompt: string, sys?: string) => Promise<string>,
): BaProseCallerFn {
    return async (systemPrompt: string, userPrompt: string) => {
        try {
            const text = await callLlm(userPrompt, systemPrompt);
            return { text };
        } catch (err) {
            return { text: null, error: String(err) };
        }
    };
}

/**
 * Submit an approval intake request to the gateway.
 * Returns the approvalId on success, null on failure.
 */
async function submitApprovalIntake(params: {
    tenantId: string;
    workspaceId: string;
    botId: string;
    taskId: string;
    actionType: string;
    payload: Record<string, unknown>;
    riskLevel: 'medium' | 'high';
    gatewayBaseUrl: string;
    serviceToken: string;
}): Promise<string | null> {
    const base = params.gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/v1/approvals/intake`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${params.serviceToken}`,
            },
            body: JSON.stringify({
                tenantId: params.tenantId,
                workspaceId: params.workspaceId,
                botId: params.botId,
                taskId: params.taskId,
                actionType: params.actionType,
                payload: params.payload,
                riskLevel: params.riskLevel,
            }),
            signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return null;
        const body = (await res.json()) as { approvalId?: string };
        return body.approvalId ?? null;
    } catch {
        return null;
    }
}

/**
 * Write an episodic memory record to the gateway after a BA action completes.
 */
async function writeEpisodicMemory(params: {
    tenantId: string;
    workspaceId: string;
    pattern: string;
    summary: string;
    gatewayBaseUrl: string;
    serviceToken: string;
}): Promise<void> {
    const base = params.gatewayBaseUrl.replace(/\/+$/, '');
    try {
        await fetch(`${base}/v1/memory/patterns`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${params.serviceToken}`,
            },
            body: JSON.stringify({
                tenantId: params.tenantId,
                workspaceId: params.workspaceId,
                pattern: params.pattern,
                summary: params.summary,
                confidence: 0.8,
                observedCount: 1,
                lastSeen: new Date().toISOString(),
            }),
            signal: AbortSignal.timeout(10_000),
        });
    } catch {
        // Non-fatal — memory write failures don't block the action result
    }
}

/**
 * Build the system prompt for BA document generation.
 * Combines: role + document-type instructions + RAG context + lessons + tone.
 */
function buildBaSystemPrompt(params: {
    actionType: BaActionType;
    ragContextBlock: string;
    lessonsBlock: string;
    toneHint?: string;
}): string {
    const { actionType, ragContextBlock, lessonsBlock, toneHint } = params;

    const docInstructions: Record<string, string> = {
        workspace_ba_draft_brd: `You are drafting a Business Requirements Document (BRD).
Structure with: Executive Summary, Business Objectives, Scope (in/out), Stakeholders, Functional Requirements (MoSCoW), Non-Functional Requirements, Assumptions & Constraints, Success Criteria, Risks.
Number all requirements (e.g. REQ-001). Use clear, unambiguous language.`,

        workspace_ba_draft_user_story: `You are drafting user stories.
Format each as: "As a [persona], I want [goal] so that [benefit]."
Include acceptance criteria in Given/When/Then format.
Add edge cases, error states, and performance NFRs for API/integration stories.`,

        workspace_ba_finalize_brd: `You are reviewing and finalising a Business Requirements Document.
Check: all requirements are numbered and traceable; stakeholders are named; success criteria are measurable; risks are documented; scope is explicitly bounded.
Do not add new requirements — only fill gaps and improve clarity.`,

        workspace_ba_finalize_acceptance_criteria: `You are finalising acceptance criteria.
Ensure every story has at least one Given/When/Then scenario.
Check for: ambiguous terms, missing error paths, missing SLA/performance conditions.`,

        workspace_ba_process_map: `You are documenting a business process.
Use BPMN-style notation in markdown: pools, lanes, decision diamonds, swimlanes.
Capture: trigger, steps, decision points, exceptions, end states.`,

        workspace_ba_gap_analysis: `You are producing a gap analysis.
Structure: Current State → Desired State → Gap Description → Root Cause → Recommendation → Priority.
Be specific: name systems, teams, and processes.`,

        workspace_ba_impact_analysis: `You are producing a change impact analysis.
Structure: Proposed Change → Affected Systems → Affected Teams → Risk Level → Mitigation → Estimated Effort.
Flag dependencies and integration points explicitly.`,

        workspace_ba_solution_eval: `You are evaluating solution options.
Structure: Problem Statement → Evaluation Criteria (weighted) → Options × Criteria matrix → Recommendation with rationale.
Include: cost estimate range, implementation complexity, risk, vendor maturity.`,

        workspace_ba_stakeholder_update: `You are drafting a stakeholder communication.
Be concise. Open with: what was decided / what changed / what's next.
Match the tone to the audience. Avoid technical jargon unless the audience is technical.`,

        workspace_ba_uat_checklist: `You are producing a User Acceptance Testing checklist.
Structure: Test ID | Scenario | Preconditions | Steps | Expected Result | Pass/Fail.
Cover: happy paths, error paths, boundary conditions, rollback procedure.`,

        workspace_ba_elicit_requirements: `You are converting interview notes into structured requirements.
Group by theme. Write each requirement as: ID | Priority | Description | Source (stakeholder name).
Flag ambiguities and open questions separately.`,

        share_spec_external: `You are preparing a specification document for external distribution.
Remove all internal comments, open questions, and draft markers.
Ensure all compliance requirements are explicitly stated. Add a distribution note.`,
    };

    const baseInstruction = docInstructions[actionType] ??
        'You are a senior business analyst. Produce clear, structured, unambiguous documentation.';

    const parts: string[] = [
        '# Business Analyst Agent',
        '',
        baseInstruction,
        '',
        'Guidelines:',
        '- Every claim must be traceable to a stated requirement or stakeholder input.',
        '- Prefer specific, measurable language over vague statements.',
        '- Flag open questions with [TBD] rather than guessing.',
        '- Do not invent requirements; only document what was provided.',
    ];

    if (toneHint) {
        parts.push('', `Tone guidance: ${toneHint}`);
    }

    if (ragContextBlock) {
        parts.push('', ragContextBlock);
    }

    if (lessonsBlock) {
        parts.push('', lessonsBlock);
    }

    return parts.join('\n');
}

/**
 * Map action type to a BaRagQuery documentType.
 */
function actionToRagDocType(actionType: BaActionType): BaRagQuery['documentType'] {
    const map: Record<string, BaRagQuery['documentType']> = {
        workspace_ba_draft_brd: 'brd',
        workspace_ba_finalize_brd: 'brd',
        workspace_ba_draft_user_story: 'user_story',
        workspace_ba_finalize_acceptance_criteria: 'acceptance_criteria',
        workspace_ba_process_map: 'process_map',
        workspace_ba_gap_analysis: 'gap_analysis',
        workspace_ba_impact_analysis: 'impact_analysis',
        workspace_ba_solution_eval: 'brd',
        workspace_ba_stakeholder_update: 'brd',
        workspace_ba_uat_checklist: 'uat_checklist',
        workspace_ba_elicit_requirements: 'brd',
        share_spec_external: 'brd',
    };
    return map[actionType] ?? 'brd';
}

/**
 * Returns true for document types where a completeness check makes sense.
 */
function shouldCheckCompleteness(actionType: BaActionType): boolean {
    return (
        actionType === 'workspace_ba_draft_brd' ||
        actionType === 'workspace_ba_finalize_brd' ||
        actionType === 'workspace_ba_draft_user_story' ||
        actionType === 'workspace_ba_finalize_acceptance_criteria'
    );
}

/**
 * Build the user prompt for the LLM from the action payload.
 */
function buildUserPrompt(actionType: BaActionType, payload: Record<string, unknown>): string {
    const title = str(payload['title']);
    const description = str(payload['description']);
    const requirements = arr(payload['requirements']);
    const existingContent = str(payload['content'] ?? payload['existing_content']);
    const stakeholders = arr(payload['stakeholders']);
    const domain = str(payload['domain']);
    const constraints = str(payload['constraints']);
    const successCriteria = str(payload['success_criteria']);

    const parts: string[] = [];

    if (title) parts.push(`## ${title}`);
    if (description) parts.push(description);
    if (existingContent) parts.push(`\n### Current Draft\n${existingContent}`);
    if (requirements.length > 0) parts.push(`\n### Requirements\n${requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}`);
    if (stakeholders.length > 0) parts.push(`\n### Stakeholders\n${stakeholders.join(', ')}`);
    if (domain) parts.push(`\n### Domain\n${domain}`);
    if (constraints) parts.push(`\n### Constraints\n${constraints}`);
    if (successCriteria) parts.push(`\n### Success Criteria\n${successCriteria}`);

    if (parts.length === 0) {
        parts.push(`Generate a ${actionType.replace('workspace_ba_', '').replace(/_/g, ' ')} document.`);
    }

    return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Core handler
// ---------------------------------------------------------------------------

/**
 * Route a BA action through the full pipeline: RAG → tone → generate → gate → persist.
 *
 * This is the single entry point called by the agent runtime execution engine
 * when an action type matches BA_ACTION_TYPES.
 */
export async function handleBaAction(params: BaActionParams): Promise<BaActionResult> {
    const {
        actionType,
        tenantId,
        botId,
        taskId,
        workspaceId,
        payload,
        gatewayBaseUrl,
        serviceToken,
        callLlm,
        notificationExecutor,
        stakeholderProfile,
        approvalNotificationTarget,
        approvalNotificationChannel = 'slack',
        approvalEscalationDeadlineIso,
        autoApproveThreshold = 0.85,
    } = params;

    const audience = (str(payload['audience'], 'internal')) as DocumentAudience;
    const projectTitle = str(payload['title'] ?? payload['project_title'], actionType);
    const projectDescription = str(payload['description'], '');
    const complianceFrameworks = arr(payload['compliance_frameworks']) as BaRagQuery['complianceFrameworks'];
    const domain = str(payload['domain']) as BaRagQuery['domain'] | undefined;

    // -------------------------------------------------------------------------
    // 1. RAG context retrieval + lesson retrieval (parallel)
    // -------------------------------------------------------------------------
    const ragQuery: BaRagQuery = {
        tenantId,
        botId,
        projectTitle,
        projectDescription,
        documentType: actionToRagDocType(actionType),
        complianceFrameworks: complianceFrameworks?.length ? complianceFrameworks : undefined,
        domain: domain || undefined,
    };

    const lessonStore = new GatewayBaLessonStore(gatewayBaseUrl, serviceToken);

    const [ragResult, lessons] = await Promise.all([
        buildBaRagContext(ragQuery, gatewayBaseUrl, serviceToken, workspaceId),
        lessonStore.findByWorkspace(workspaceId, {
            docType: actionToRagDocType(actionType) as 'brd' | 'user_story' | 'acceptance_criteria' | 'gap_analysis' | 'process_map' | 'impact_analysis' | 'uat_checklist' | 'any',
            limit: 12,
        }),
    ]);

    const lessonsBlock =
        lessons.length > 0
            ? `Workspace BA rules (from past stakeholder feedback):\n${lessons.slice(0, 10).map((l) => `- [${l.category}] ${l.feedback}`).join('\n')}`
            : '';

    // -------------------------------------------------------------------------
    // 2. Tone hint (detect preferred style from stakeholder profile)
    // -------------------------------------------------------------------------
    let toneHint = '';
    if (stakeholderProfile) {
        toneHint = detectBaStakeholderTone(stakeholderProfile); // e.g. 'executive'
    }

    // -------------------------------------------------------------------------
    // 3. Content generation
    // -------------------------------------------------------------------------
    const systemPrompt = buildBaSystemPrompt({
        actionType,
        ragContextBlock: ragResult.contextBlock,
        lessonsBlock,
        toneHint: toneHint || undefined,
    });

    const userPrompt = buildUserPrompt(actionType, payload);
    let generatedContent = await callLlmSafe(callLlm, userPrompt, systemPrompt);

    // If stakeholder profile exists and we generated content, adapt prose tone
    if (stakeholderProfile && generatedContent && callLlm) {
        try {
            const adapted = await adaptBaToneForStakeholder(
                generatedContent,
                stakeholderProfile,
                toBaProseCallerFn(callLlm),
            );
            if (adapted.body) generatedContent = adapted.body;
        } catch {
            // Non-fatal — keep original content if tone adaptation fails
        }
    }

    // -------------------------------------------------------------------------
    // 4. Completeness check
    // -------------------------------------------------------------------------
    let completenessScore = 0;
    let gaps: string[] = [];

    if (shouldCheckCompleteness(actionType) && generatedContent) {
        const baCallerFn: BaProseCallerFn | null = callLlm ? toBaProseCallerFn(callLlm) : null;
        const completeness = await checkBrdCompleteness(generatedContent, baCallerFn);
        completenessScore = completeness.score;
        gaps = completeness.gaps;
    }

    // -------------------------------------------------------------------------
    // 5. Risk gate classification
    // -------------------------------------------------------------------------
    const gateResult = classifyBaActionRisk({
        actionType,
        audience,
        completenessScore,
        autoApproveThreshold,
    });

    const gateSummary = formatGateDecisionSummary(actionType, gateResult);
    console.info(`[ba-action-handler] ${gateSummary}`);

    const documentType = ACTION_TYPE_TO_DOC_TYPE[actionType] ?? 'draft_brd';

    // -------------------------------------------------------------------------
    // 6. Route by effective risk
    // -------------------------------------------------------------------------

    // AUTO-EXECUTE (low risk)
    if (isAutoApproved(gateResult)) {
        // Persist to KB for future RAG retrieval
        if (generatedContent) {
            await ingestApprovedDocument({
                tenantId,
                botId,
                documentTitle: projectTitle,
                documentType: actionToRagDocType(actionType),
                content: generatedContent,
                domain: domain,
                complianceFrameworks: complianceFrameworks,
                gatewayBaseUrl,
                serviceToken,
            });
        }

        await writeEpisodicMemory({
            tenantId,
            workspaceId,
            pattern: `ba:${documentType}:auto_approved`,
            summary: `BA auto-approved ${documentType}: ${projectTitle.slice(0, 80)}`,
            gatewayBaseUrl,
            serviceToken,
        });

        return {
            ok: true,
            output: generatedContent,
            documentType,
            riskLevel: 'low',
            completenessScore,
            gaps,
            approvalStatus: 'auto_approved',
            ragContextUsed: !!ragResult.contextBlock,
        };
    }

    // ASYNC NOTIFY (medium risk) — submit to intake + send notification
    if (requiresAsyncNotification(gateResult)) {
        const approvalId = await submitApprovalIntake({
            tenantId,
            workspaceId,
            botId,
            taskId,
            actionType,
            payload: { ...payload, generated_content: generatedContent?.slice(0, 2000) },
            riskLevel: 'medium',
            gatewayBaseUrl,
            serviceToken,
        });

        if (approvalId && notificationExecutor && approvalNotificationTarget) {
            const completenessResult = shouldCheckCompleteness(actionType)
                ? await checkBrdCompleteness(
                      generatedContent,
                      callLlm ? toBaProseCallerFn(callLlm) : null,
                  )
                : undefined;

            const notifReq: AsyncApprovalNotificationRequest = {
                approvalId,
                taskId,
                actionType,
                actionSummary: `${documentType.replace(/_/g, ' ')} for: ${projectTitle.slice(0, 80)}`,
                documentTitle: projectTitle,
                completenessResult,
                gateResult,
                notificationTarget: approvalNotificationTarget,
                channel: approvalNotificationChannel,
                gatewayBaseUrl,
                workspaceId,
                escalationDeadlineIso: approvalEscalationDeadlineIso,
            };
            await sendAsyncApprovalNotification(notifReq, notificationExecutor);
        }

        await writeEpisodicMemory({
            tenantId,
            workspaceId,
            pattern: `ba:${documentType}:pending_approval`,
            summary: `BA ${documentType} pending async approval: ${projectTitle.slice(0, 80)}`,
            gatewayBaseUrl,
            serviceToken,
        });

        return {
            ok: true,
            output: generatedContent,
            documentType,
            riskLevel: 'medium',
            completenessScore,
            gaps,
            approvalId: approvalId ?? undefined,
            approvalStatus: 'pending_async',
            ragContextUsed: !!ragResult.contextBlock,
        };
    }

    // ESCALATE (high risk) — submit to intake, let gateway handle escalation
    const approvalId = await submitApprovalIntake({
        tenantId,
        workspaceId,
        botId,
        taskId,
        actionType,
        payload: { ...payload, generated_content: generatedContent?.slice(0, 2000) },
        riskLevel: 'high',
        gatewayBaseUrl,
        serviceToken,
    });

    await writeEpisodicMemory({
        tenantId,
        workspaceId,
        pattern: `ba:${documentType}:pending_escalation`,
        summary: `BA ${documentType} pending human escalation: ${projectTitle.slice(0, 80)}`,
        gatewayBaseUrl,
        serviceToken,
    });

    return {
        ok: true,
        output: generatedContent,
        documentType,
        riskLevel: 'high',
        completenessScore,
        gaps,
        approvalId: approvalId ?? undefined,
        approvalStatus: 'pending_escalation',
        ragContextUsed: !!ragResult.contextBlock,
    };
}

// ---------------------------------------------------------------------------
// Post-decision handlers — called after a stakeholder approves or rejects
// ---------------------------------------------------------------------------

/**
 * Call after a BA document receives stakeholder approval.
 *
 * Ingests the approved document into the knowledge base so it becomes
 * available as prior work for future RAG retrievals.
 */
export async function onBaDocumentApproved(params: {
    tenantId: string;
    botId?: string;
    workspaceId: string;
    taskId: string;
    actionType: BaActionType;
    documentTitle: string;
    documentContent: string;
    domain?: string;
    complianceFrameworks?: string[];
    gatewayBaseUrl: string;
    serviceToken: string;
}): Promise<void> {
    const {
        tenantId, botId, workspaceId, taskId, actionType,
        documentTitle, documentContent, domain, complianceFrameworks,
        gatewayBaseUrl, serviceToken,
    } = params;

    await ingestApprovedDocument({
        tenantId,
        botId,
        documentTitle,
        documentType: actionToRagDocType(actionType),
        content: documentContent,
        domain,
        complianceFrameworks,
        gatewayBaseUrl,
        serviceToken,
    });

    await writeEpisodicMemory({
        tenantId,
        workspaceId,
        pattern: `ba:${ACTION_TYPE_TO_DOC_TYPE[actionType] ?? 'draft_brd'}:approved`,
        summary: `BA document approved and ingested: ${documentTitle.slice(0, 80)}`,
        gatewayBaseUrl,
        serviceToken,
    });
}

/**
 * Call after a BA document is rejected by a stakeholder.
 *
 * Ingests the feedback as a lesson and persists it to long-term memory so
 * future drafts benefit from this rejection signal.
 */
export async function onBaDocumentRejected(params: {
    tenantId: string;
    workspaceId: string;
    taskId: string;
    actionType: BaActionType;
    documentId: string;
    rejectionReasons: string[];
    rejectionAuthor?: string;
    gatewayBaseUrl: string;
    serviceToken: string;
}): Promise<void> {
    const {
        tenantId, workspaceId, taskId, actionType, documentId,
        rejectionReasons, rejectionAuthor, gatewayBaseUrl, serviceToken,
    } = params;

    // Map the RAG doc type to the BaDocumentTypeFilter subset understood by the lesson pipeline
    const ragDocType = actionToRagDocType(actionType);
    const validDocTypeFilters = ['brd', 'user_story', 'acceptance_criteria', 'gap_analysis', 'process_map', 'impact_analysis', 'uat_checklist'] as const;
    const docTypeFilter = (validDocTypeFilters.includes(ragDocType as typeof validDocTypeFilters[number])
        ? ragDocType
        : 'brd') as BaDocumentTypeFilter;

    const feedbackCtx: BaFeedbackContext = {
        tenantId,
        workspaceId,
        taskId,
        documentId,
        documentType: docTypeFilter,
        actionType,
        correlationId: taskId,
    };

    const feedbackItems: BaFeedbackItem[] = rejectionReasons.map((reason) => ({
        body: reason,
        author: rejectionAuthor,
        createdAt: new Date().toISOString(),
    }));

    const lessonStore = new GatewayBaLessonStore(gatewayBaseUrl, serviceToken);
    const lessons = await ingestBaFeedback(feedbackCtx, feedbackItems, lessonStore);

    // Persist each lesson to gateway memory for cross-session retrieval
    await Promise.all(
        lessons.map((lesson) => persistLessonToMemory(lesson, gatewayBaseUrl, serviceToken)),
    );

    await writeEpisodicMemory({
        tenantId,
        workspaceId,
        pattern: `ba:${ACTION_TYPE_TO_DOC_TYPE[actionType] ?? 'draft_brd'}:rejected`,
        summary: `BA document rejected — ${lessons.length} lesson(s) learned. Reasons: ${rejectionReasons[0]?.slice(0, 80) ?? 'unknown'}`,
        gatewayBaseUrl,
        serviceToken,
    });
}

// ---------------------------------------------------------------------------
// Episodic hooks — called by the execution engine after any BA task completes
// ---------------------------------------------------------------------------

export { buildBaEpisodicPattern, buildBaEpisodicSummary };
