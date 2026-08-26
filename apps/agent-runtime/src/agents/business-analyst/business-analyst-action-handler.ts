/**
 * Business Analyst — Action Handler
 *
 * Orchestration layer that wires all BA modules into a single entry point for
 * every workspace_ba_* action type.
 *
 * For each action the handler executes in order:
 *   0. Stakeholder auto-load  — if payload.stakeholder_id set, load profile from gateway
 *   1. RAG context retrieval  — prior BRDs, compliance checklists, BA lessons
 *   2. Tone adaptation        — rewrite prose style if a stakeholder profile exists
 *   3. Content generation     — LLM draft using enriched system prompt
 *   4. Completeness check     — scored for BRD-family document types
 *   5. Risk gate              — classify → auto-execute | async notify | escalate
 *   6. Post-run persistence   — version control + KB ingest + document store + tickets
 *   7. Episodic memory        — pattern + summary written after every run
 *   8. Stakeholder auto-save  — updated profile written back to gateway
 *
 * Proactive monitoring action types (ac_check, epic_check, conflict_scan) use a
 * separate lightweight pipeline that searches the KB and reports findings without
 * going through the full generation/gate pipeline.
 *
 * Mirrors the structure of developer-action-handler.ts but uses document
 * generation (callLlm) rather than code execution sub-actions.
 */

import type { MeetingProviderExecutor } from '../meeting-agent/meeting-transcription.js';
import type { MeetingProtocolInterviewClient } from '../shared/meeting-interview-adapter.js';
import { INTERVIEW_PROTOCOL, INTERVIEW_OPENING } from './business-analyst-interview-protocol.js';
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
import {
    loadStakeholderProfile,
    saveStakeholderProfile,
} from './business-analyst-stakeholder-store.js';
import {
    writeTicketsFromDocument,
    type BaTicketWriteRequest,
    type TicketPlatform,
} from './business-analyst-ticket-writer.js';
import {
    persistBaDocument,
    type BaDocumentPersistRequest,
} from './business-analyst-document-store.js';
import { buildVersionedDocument } from './business-analyst-document-versioner.js';
import {
    detectRequirementConflicts,
    formatConflictsForNotification,
} from './business-analyst-conflict-detector.js';
import {
    checkDocumentReadiness,
} from './business-analyst-dor-checker.js';
import {
    extractRequirementsFromBrd,
    linkStoriesToRequirements,
    linkTestCasesToStories,
    generateRtmDocument,
    getRtmCoverage,
} from './business-analyst-rtm.js';
import {
    recordSignoff,
    type SignoffDecision,
} from './business-analyst-signoff-ledger.js';
import { deriveMemoryConfig } from '@agentfarm/memory-service';
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
    | 'share_spec_external'
    | 'workspace_ba_proactive_ac_check'
    | 'workspace_ba_proactive_epic_check'
    | 'workspace_ba_proactive_conflict_scan'
    | 'workspace_ba_rtm_generate';

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
    'workspace_ba_proactive_ac_check',
    'workspace_ba_proactive_epic_check',
    'workspace_ba_proactive_conflict_scan',
    'workspace_ba_rtm_generate',
]);

export function isBaActionType(at: string): at is BaActionType {
    return BA_ACTION_TYPES.has(at as BaActionType);
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** Connector function used by ticket write-back and document persistence. */
type ExecuteActionFn = (
    actionType: string,
    payload: Record<string, unknown>,
) => Promise<{ ok: boolean; output: string; errorOutput?: string }>;

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
    /**
     * Connector function for ticket write-back (Jira/Linear/GitHub) and
     * document persistence (file system / Confluence / Notion).
     */
    executeAction?: ExecuteActionFn;
    /** Local workspace directory for file-system document persistence. */
    workspaceDir?: string;
    /**
     * Stable document identifier used for version control.
     * Defaults to `<taskId>-<documentType>` when not provided.
     */
    documentId?: string;
    /**
     * Runs a live protocol interview (requirements elicitation). When provided
     * and elicit_requirements is called with join=true, the BA conducts the
     * stakeholder interview itself and structures the transcript into
     * requirements. Executor defaults it to runMeetingProtocolInterview.
     */
    protocolInterviewClient?: MeetingProtocolInterviewClient;
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
// Proactive monitoring handlers
// ---------------------------------------------------------------------------

/** Fetches approved BA documents from the KB for proactive analysis. */
async function fetchKbDocuments(params: {
    tenantId: string;
    botId?: string;
    queryText: string;
    topK: number;
    gatewayBaseUrl: string;
    serviceToken: string;
}): Promise<Array<{ content: string; sourceUrl?: string }>> {
    const base = params.gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/v1/knowledge-base/search`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${params.serviceToken}`,
            },
            body: JSON.stringify({
                tenantId: params.tenantId,
                botId: params.botId,
                queryText: params.queryText,
                topK: params.topK,
                minSimilarity: 0.25,
            }),
            signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return [];
        const data = (await res.json()) as {
            results?: Array<{ content?: string; sourceUrl?: string; sourceType?: string }>;
        };
        return (data.results ?? [])
            .filter((r) => r.sourceType === 'ba_approved_document' && r.content)
            .map((r) => ({ content: r.content ?? '', sourceUrl: r.sourceUrl }));
    } catch {
        return [];
    }
}

async function handleRtmGenerate(params: BaActionParams): Promise<BaActionResult> {
    const { workspaceId, gatewayBaseUrl, serviceToken } = params;

    const [rtmDoc, coverage] = await Promise.all([
        generateRtmDocument(workspaceId, gatewayBaseUrl, serviceToken),
        getRtmCoverage(workspaceId, gatewayBaseUrl, serviceToken),
    ]);

    return {
        ok: true,
        output: rtmDoc,
        documentType: 'rtm',
        ragContextUsed: coverage.totalRequirements > 0,
        totalRequirements: coverage.totalRequirements,
        coveragePercent: coverage.coveragePercent,
        uncoveredRequirements: coverage.uncoveredRequirements,
    };
}

async function handleProactiveConflictScan(params: BaActionParams): Promise<BaActionResult> {
    const { tenantId, botId, workspaceId, gatewayBaseUrl, serviceToken, callLlm, payload } = params;

    const maxDocuments =
        typeof payload['max_documents'] === 'number' ? payload['max_documents'] : 20;
    const minKeywordOverlap =
        typeof payload['min_keyword_overlap'] === 'number' ? payload['min_keyword_overlap'] : 2;

    const result = await detectRequirementConflicts({
        tenantId,
        botId,
        workspaceId,
        gatewayBaseUrl,
        serviceToken,
        callLlm,
        maxDocuments,
        minKeywordOverlap,
    });

    const notification = formatConflictsForNotification(result);

    return {
        ok: true,
        output: notification,
        documentType: 'conflict_report',
        ragContextUsed: result.documentsScanned > 0,
        conflictsDetected: result.conflicts.length,
        documentsScanned: result.documentsScanned,
        requirementsExtracted: result.requirementsExtracted,
    };
}

async function handleProactiveAcCheck(params: BaActionParams): Promise<BaActionResult> {
    const { tenantId, botId, workspaceId, gatewayBaseUrl, serviceToken, callLlm } = params;

    if (!callLlm) {
        return {
            ok: false,
            output: '',
            errorOutput: 'callLlm is required for proactive acceptance criteria check.',
        };
    }

    const docs = await fetchKbDocuments({
        tenantId,
        botId,
        queryText: 'As a user I want acceptance criteria given when then user story',
        topK: 15,
        gatewayBaseUrl,
        serviceToken,
    });

    if (docs.length === 0) {
        return {
            ok: true,
            output: '✅ No approved user stories found in the knowledge base requiring an AC check.',
            documentType: 'proactive_ac_check',
            ragContextUsed: false,
        };
    }

    // Identify stories that lack Given/When/Then acceptance criteria
    const storiesWithoutAc = docs.filter((d) => {
        const lower = d.content.toLowerCase();
        // Must look like a user story and must be missing AC
        const isStory = /\bas\s+a\b/i.test(d.content);
        const hasAc =
            lower.includes('given') &&
            lower.includes('when') &&
            (lower.includes('then') || lower.includes('acceptance criteria'));
        return isStory && !hasAc;
    });

    if (storiesWithoutAc.length === 0) {
        return {
            ok: true,
            output: `✅ All ${docs.length} approved user stories have acceptance criteria.`,
            documentType: 'proactive_ac_check',
            ragContextUsed: true,
            storiesChecked: docs.length,
        };
    }

    const excerpts = storiesWithoutAc
        .slice(0, 5)
        .map((d, i) => `### Story ${i + 1}\n${d.content.slice(0, 600)}`)
        .join('\n\n---\n\n');

    const generated = await callLlmSafe(
        callLlm,
        `The following approved user stories are missing acceptance criteria. For each, generate clear Given/When/Then acceptance criteria that cover the happy path, at least one error path, and any relevant edge cases.\n\n${excerpts}`,
        'You are a senior business analyst. Generate concise, testable acceptance criteria for each user story presented. Format each as: **Story N Acceptance Criteria** followed by Given/When/Then scenarios as a bulleted list.',
    );

    const lines: string[] = [
        `⚠️ Found ${storiesWithoutAc.length} of ${docs.length} approved user stories missing acceptance criteria.`,
        '',
        generated || '_Could not generate acceptance criteria — LLM returned empty response._',
    ];

    return {
        ok: true,
        output: lines.join('\n'),
        documentType: 'proactive_ac_check',
        ragContextUsed: true,
        storiesChecked: docs.length,
        storiesNeedingAc: storiesWithoutAc.length,
    };
}

async function handleProactiveEpicCheck(params: BaActionParams): Promise<BaActionResult> {
    const { tenantId, botId, workspaceId, gatewayBaseUrl, serviceToken, callLlm } = params;

    if (!callLlm) {
        return {
            ok: false,
            output: '',
            errorOutput: 'callLlm is required for proactive epic BRD check.',
        };
    }

    const docs = await fetchKbDocuments({
        tenantId,
        botId,
        queryText: 'epic feature initiative business objective requirement stakeholder',
        topK: 15,
        gatewayBaseUrl,
        serviceToken,
    });

    if (docs.length === 0) {
        return {
            ok: true,
            output: '✅ No approved BA documents found requiring an epic BRD coverage check.',
            documentType: 'proactive_epic_check',
            ragContextUsed: false,
        };
    }

    // Identify epics / initiatives without BRD coverage
    const epicsWithoutBrd = docs.filter((d) => {
        const lower = d.content.toLowerCase();
        const hasBrdContent =
            lower.includes('business requirements') ||
            lower.includes('brd') ||
            (lower.includes('req-') && lower.includes('scope')) ||
            (lower.includes('objective') && lower.includes('success criteria'));
        return !hasBrdContent;
    });

    if (epicsWithoutBrd.length === 0) {
        return {
            ok: true,
            output: `✅ All ${docs.length} approved documents appear to have BRD coverage.`,
            documentType: 'proactive_epic_check',
            ragContextUsed: true,
            epicsChecked: docs.length,
        };
    }

    const excerpts = epicsWithoutBrd
        .slice(0, 3)
        .map((d, i) => `### Initiative ${i + 1}\n${d.content.slice(0, 700)}`)
        .join('\n\n---\n\n');

    const generated = await callLlmSafe(
        callLlm,
        `The following business initiatives do not appear to have Business Requirements Documents. For each, produce a brief BRD outline with: Executive Summary, 5-8 numbered functional requirements (REQ-NNN), Out-of-Scope items, and Success Criteria.\n\n${excerpts}`,
        'You are a senior business analyst. Generate concise BRD outlines. Use the format: ## Executive Summary, ## Functional Requirements (numbered REQ-001, REQ-002…), ## Out of Scope, ## Success Criteria.',
    );

    const lines: string[] = [
        `⚠️ Found ${epicsWithoutBrd.length} of ${docs.length} approved documents without BRD coverage.`,
        '',
        generated || '_Could not generate BRD outlines — LLM returned empty response._',
    ];

    return {
        ok: true,
        output: lines.join('\n'),
        documentType: 'proactive_epic_check',
        ragContextUsed: true,
        epicsChecked: docs.length,
        epicsNeedingBrd: epicsWithoutBrd.length,
    };
}

// ---------------------------------------------------------------------------
// Core handler (internal)
// ---------------------------------------------------------------------------

/**
 * Inner implementation — called by the public handleBaAction wrapper after
 * stakeholder auto-load. Uses `params.stakeholderProfile` as the resolved
 * profile (auto-loaded value already substituted by the wrapper).
 */
async function _handleBaActionCore(params: BaActionParams): Promise<BaActionResult> {
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
        stakeholderProfile,       // already resolved by wrapper
        approvalNotificationTarget,
        approvalNotificationChannel = 'slack',
        approvalEscalationDeadlineIso,
        autoApproveThreshold = 0.85,
        executeAction,
        workspaceDir,
        documentId,
        protocolInterviewClient,
    } = params;

    // -------------------------------------------------------------------------
    // Guard — reject unrecognised action types before entering the pipeline
    // -------------------------------------------------------------------------
    if (!isBaActionType(actionType)) {
        return { ok: false, output: '', errorOutput: `Unknown BA action: ${actionType as string}` };
    }

    // -------------------------------------------------------------------------
    // Proactive monitoring actions use a separate lightweight pipeline
    // -------------------------------------------------------------------------
    if (actionType === 'workspace_ba_proactive_conflict_scan') {
        return handleProactiveConflictScan(params);
    }
    if (actionType === 'workspace_ba_rtm_generate') {
        return handleRtmGenerate(params);
    }
    if (actionType === 'workspace_ba_proactive_ac_check') {
        return handleProactiveAcCheck(params);
    }
    if (actionType === 'workspace_ba_proactive_epic_check') {
        return handleProactiveEpicCheck(params);
    }

    // -------------------------------------------------------------------------
    // Presence: for elicit_requirements with join=true, the BA actually CONDUCTS
    // the stakeholder interview (shared interview engine over live meeting audio)
    // and structures the transcript into requirements — instead of only
    // converting notes a human already captured. Fail-safe: any problem falls
    // through to the notes-based path so the work is never lost.
    // -------------------------------------------------------------------------
    let interviewTranscript = '';
    if (actionType === 'workspace_ba_elicit_requirements' && payload['join'] === true && protocolInterviewClient) {
        const desktopSessionId = str(payload['desktopSessionId']).trim();
        const meetingUrl = str(payload['meetingUrl']).trim();
        const platform = str(payload['platform']).trim();
        if (desktopSessionId && meetingUrl && platform && workspaceId) {
            try {
                const protocol = INTERVIEW_PROTOCOL.map((q) => ({
                    id: q.id,
                    question: q.text,
                    required: q.isRequired,
                    maxProbes: q.probes.length,
                }));
                const res = await protocolInterviewClient({
                    tenantId, workspaceId, agentId: botId,
                    desktopSessionId, meetingUrl, platform,
                    protocol,
                    opening: INTERVIEW_OPENING,
                    language: str(payload['language']) || undefined,
                });
                interviewTranscript = res.transcript.map((t) => `${t.speaker}: ${t.text}`).join('\n');
            } catch { /* fall through to notes-based elicitation */ }
        }
    }

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
        buildBaRagContext(ragQuery, gatewayBaseUrl, serviceToken, workspaceId, deriveMemoryConfig(actionType)),
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
        toneHint = detectBaStakeholderTone(stakeholderProfile);
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

    let userPrompt = buildUserPrompt(actionType, payload);
    if (interviewTranscript) {
        userPrompt += `\n\n### Live Interview Transcript\n${interviewTranscript}`;
    }
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
    // 4b. Definition of Ready check (user story and AC types only)
    // -------------------------------------------------------------------------
    let dorReady: boolean | undefined;
    let dorBlockers: string[] = [];
    let dorWarnings: string[] = [];

    if (
        (actionType === 'workspace_ba_draft_user_story' ||
            actionType === 'workspace_ba_finalize_acceptance_criteria') &&
        generatedContent
    ) {
        try {
            const baCallerFn = callLlm ? toBaProseCallerFn(callLlm) : undefined;
            const docReadiness = await checkDocumentReadiness(generatedContent, baCallerFn);
            dorReady = docReadiness.overallReady;
            dorBlockers = docReadiness.storyResults.flatMap((r) => r.blockers);
            dorWarnings = docReadiness.storyResults.flatMap((r) => r.warnings);

            // DoR blockers reduce completeness score so the story can't auto-approve
            if (!dorReady && dorBlockers.length > 0) {
                const penalty = Math.min(0.4, dorBlockers.length * 0.1);
                completenessScore = Math.max(0, completenessScore - penalty);
                gaps = [...gaps, ...dorBlockers];
            }
        } catch {
            // Non-fatal — skip DoR check on error
        }
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
        const resolvedDocumentId = documentId ?? `${taskId}-${documentType}`;

        // Version control — track document revisions across sessions
        let versionedContent = generatedContent;
        if (generatedContent) {
            try {
                const versionResult = await buildVersionedDocument({
                    documentId: resolvedDocumentId,
                    currentContent: generatedContent,
                    workspaceId,
                    callLlm,
                    gatewayBaseUrl,
                    serviceToken,
                    author: 'BA Agent',
                });
                versionedContent = versionResult.versionedContent;
            } catch (e) {
                console.warn('[ba-action-handler] version control failed:', e);
            }
        }

        // Persist to KB for future RAG retrieval, then write derived_from edges
        if (versionedContent) {
            const newDocId = await ingestApprovedDocument({
                tenantId,
                botId,
                documentTitle: projectTitle,
                documentType: actionToRagDocType(actionType),
                content: versionedContent,
                domain: domain,
                complianceFrameworks: complianceFrameworks,
                gatewayBaseUrl,
                serviceToken,
            });
            if (newDocId && ragResult.similarDocumentIds.length > 0) {
                const base = gatewayBaseUrl.replace(/\/+$/, '');
                for (const priorId of ragResult.similarDocumentIds) {
                    fetch(`${base}/v1/memory/edges`, {
                        method: 'POST',
                        headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` },
                        body: JSON.stringify({ tenantId, workspaceId, fromId: newDocId, fromType: 'knowledge', toId: priorId, toType: 'knowledge', edgeType: 'derived_from', agentPrefix: 'ba' }),
                        signal: AbortSignal.timeout(5_000),
                    }).catch(() => { /* non-fatal */ });
                }
            }
        }

        // RTM auto-update — fire-and-forget, never blocks the response
        if (versionedContent) {
            if (actionType === 'workspace_ba_draft_brd' || actionType === 'workspace_ba_finalize_brd') {
                extractRequirementsFromBrd({
                    brdContent: versionedContent,
                    sourceDocumentId: resolvedDocumentId,
                    workspaceId,
                    gatewayBaseUrl,
                    serviceToken,
                }).catch((e) => console.warn('[ba-action-handler] RTM extract failed:', e));
            } else if (
                actionType === 'workspace_ba_draft_user_story' ||
                actionType === 'workspace_ba_finalize_acceptance_criteria'
            ) {
                linkStoriesToRequirements({
                    storyContent: versionedContent,
                    workspaceId,
                    gatewayBaseUrl,
                    serviceToken,
                    callLlm: callLlm ? toBaProseCallerFn(callLlm) : undefined,
                }).catch((e) => console.warn('[ba-action-handler] RTM link stories failed:', e));
            } else if (actionType === 'workspace_ba_uat_checklist') {
                linkTestCasesToStories({
                    uatContent: versionedContent,
                    workspaceId,
                    gatewayBaseUrl,
                    serviceToken,
                }).catch((e) => console.warn('[ba-action-handler] RTM link tests failed:', e));
            }
        }

        // Persist to durable storage (FS / Confluence / Notion)
        const persistWorkspaceDir = (workspaceDir ?? str(payload['workspace_dir'])) || undefined;
        const confluenceSpaceKey = str(payload['confluence_space_key']) || undefined;
        const notionDatabaseId = str(payload['notion_database_id']) || undefined;

        if (executeAction && versionedContent && (persistWorkspaceDir || confluenceSpaceKey || notionDatabaseId)) {
            const persistReq: BaDocumentPersistRequest = {
                documentType,
                documentTitle: projectTitle,
                content: versionedContent,
                workspaceDir: persistWorkspaceDir,
                confluenceSpaceKey,
                confluenceParentPageId: str(payload['confluence_parent_page_id']) || undefined,
                notionDatabaseId,
                domain: domain || undefined,
            };
            try {
                const persistResult = await persistBaDocument(persistReq, executeAction);
                if (persistResult.ok) {
                    console.info('[ba-action-handler] document persisted:', persistResult.summary);
                } else if (persistResult.errors.length > 0) {
                    console.warn('[ba-action-handler] document persist partial failure:', persistResult.errors);
                }
            } catch (e) {
                console.warn('[ba-action-handler] document persistence failed:', e);
            }
        }

        // Ticket write-back — Jira / Linear / GitHub for actionable document types
        const ticketableTypes: BaActionType[] = [
            'workspace_ba_draft_user_story',
            'workspace_ba_finalize_acceptance_criteria',
            'workspace_ba_uat_checklist',
        ];
        if (executeAction && versionedContent && ticketableTypes.includes(actionType)) {
            const ticketPlatform = str(payload['ticket_platform']) as TicketPlatform | '';
            const ticketProjectKey =
                str(payload['ticket_project_key']) ||
                str(payload['jira_project_key']) ||
                str(payload['linear_team_id']) ||
                str(payload['github_repo']);

            if (ticketPlatform && ticketProjectKey) {
                const ticketDocType =
                    actionType === 'workspace_ba_draft_user_story' ? 'user_story'
                    : actionType === 'workspace_ba_finalize_acceptance_criteria' ? 'acceptance_criteria'
                    : 'uat_checklist';

                const ticketReq: BaTicketWriteRequest = {
                    platform: ticketPlatform as TicketPlatform,
                    projectKey: ticketProjectKey,
                    documentType: ticketDocType,
                    content: versionedContent,
                    documentTitle: projectTitle,
                    epicId:
                        str(payload['epic_id']) ||
                        str(payload['jira_epic']) ||
                        str(payload['linear_cycle']) ||
                        undefined,
                    priority: (str(payload['priority']) as BaTicketWriteRequest['priority']) || 'medium',
                    baLabel: 'ba-generated',
                };
                try {
                    const receipt = await writeTicketsFromDocument(ticketReq, executeAction);
                    if (!receipt.skipped) {
                        console.info(`[ba-action-handler] ${receipt.ticketsCreated} ticket(s) created in ${ticketPlatform}`);
                    } else if (receipt.skipReason) {
                        console.info(`[ba-action-handler] ticket write skipped: ${receipt.skipReason}`);
                    }
                } catch (e) {
                    console.warn('[ba-action-handler] ticket write-back failed:', e);
                }
            }
        }

        // stakeholder_update: deliver the approved communication to the
        // stakeholder — Slack channel or email. Draft→act; only sends on this
        // approved path. Fail-safe: a delivery failure never drops the content.
        let stakeholderDelivery: Record<string, unknown> | undefined;
        if (actionType === 'workspace_ba_stakeholder_update' && payload['send'] === true && versionedContent) {
            const channel = str(payload['channel']).trim();
            const email = str(payload['stakeholder_email']).trim() || (stakeholderProfile?.email ?? '');
            if (channel && executeAction) {
                const r = await executeAction('workspace_slack_notify', { channel, message: versionedContent });
                stakeholderDelivery = r.ok ? { sent: true, via: 'slack', channel } : { sent: false, via: 'slack', reason: r.errorOutput ?? 'slack post failed' };
            } else if (email && notificationExecutor) {
                const r = await notificationExecutor({
                    connectorType: str(payload['email_provider'], 'gmail'),
                    actionType: 'send_email',
                    payload: { to: email, subject: `Update: ${projectTitle}`, body: versionedContent },
                    attempt: 1,
                    secretRefId: null,
                });
                stakeholderDelivery = r.ok ? { sent: true, via: 'email', to: email } : { sent: false, via: 'email', reason: r.resultSummary };
            } else {
                stakeholderDelivery = { sent: false, reason: 'no channel or stakeholder_email available to deliver the update' };
            }
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
            output: versionedContent,
            documentType,
            riskLevel: 'low',
            completenessScore,
            gaps,
            approvalStatus: 'auto_approved',
            ragContextUsed: !!ragResult.contextBlock,
            ...(dorReady !== undefined ? { dorReady, dorBlockers, dorWarnings } : {}),
            ...(stakeholderDelivery ? { stakeholderDelivery } : {}),
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
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Route a BA action through the full pipeline: RAG → tone → generate → gate → persist.
 *
 * This is the single entry point called by the agent runtime execution engine
 * when an action type matches BA_ACTION_TYPES.
 *
 * Automatically loads the stakeholder profile from the gateway when
 * `payload.stakeholder_id` is present and no profile was explicitly provided.
 * Automatically saves the profile back after the action completes.
 */
export async function handleBaAction(params: BaActionParams): Promise<BaActionResult> {
    const { workspaceId, gatewayBaseUrl, serviceToken, stakeholderProfile, payload } = params;

    // -------------------------------------------------------------------------
    // 0. Stakeholder auto-load
    //    If no profile was passed by the caller but payload has stakeholder_id,
    //    attempt to load the profile from the gateway memory API.
    // -------------------------------------------------------------------------
    let resolvedProfile = stakeholderProfile;
    const stakeholderIdFromPayload = str(payload['stakeholder_id']);
    if (!resolvedProfile && stakeholderIdFromPayload) {
        try {
            const loaded = await loadStakeholderProfile(
                stakeholderIdFromPayload,
                workspaceId,
                gatewayBaseUrl,
                serviceToken,
            );
            if (loaded) resolvedProfile = loaded;
        } catch {
            // Non-fatal — continue without profile
        }
    }

    // Run the core action pipeline with the resolved profile
    const result = await _handleBaActionCore({ ...params, stakeholderProfile: resolvedProfile });

    // -------------------------------------------------------------------------
    // 8. Stakeholder auto-save (fire-and-forget — never block the result)
    //    The profile accumulates interaction history across sessions.
    // -------------------------------------------------------------------------
    if (resolvedProfile) {
        saveStakeholderProfile(resolvedProfile, workspaceId, gatewayBaseUrl, serviceToken).catch(
            (e) => console.warn('[ba-action-handler] stakeholder auto-save failed:', e),
        );
    }

    return result;
}

// ---------------------------------------------------------------------------
// Post-decision handlers — called after a stakeholder approves or rejects
// ---------------------------------------------------------------------------

/**
 * Call after a BA document receives stakeholder approval.
 *
 * Ingests the approved document into the knowledge base so it becomes
 * available as prior work for future RAG retrievals.  Also persists the
 * document to durable storage and writes tickets when connectors are provided.
 */
export async function onBaDocumentApproved(params: {
    tenantId: string;
    botId?: string;
    workspaceId: string;
    taskId: string;
    actionType: BaActionType;
    documentId?: string;
    documentTitle: string;
    documentContent: string;
    documentVersion?: number;
    domain?: string;
    complianceFrameworks?: string[];
    gatewayBaseUrl: string;
    serviceToken: string;
    /** Stakeholder who approved — recorded in the sign-off ledger. */
    stakeholderId?: string;
    stakeholderName?: string;
    stakeholderRole?: string;
    /** Comments or conditions attached to this approval. */
    approvalComments?: string;
    /** Connector for document persistence and ticket write-back. */
    executeAction?: ExecuteActionFn;
    /** Local workspace directory for file-system persistence. */
    workspaceDir?: string;
    /** Ticket platform for write-back (jira | linear | github). */
    ticketPlatform?: TicketPlatform;
    /** Project / team / repo key for ticket write-back. */
    ticketProjectKey?: string;
    /** Epic / cycle / milestone ID for ticket grouping. */
    ticketEpicId?: string;
    /**
     * IDs of similar prior documents retrieved during generation — used to write
     * derived_from memory-graph edges so the new document is linked to its sources.
     * Comes from BaRagContext.similarDocumentIds; pass an empty array or omit to skip.
     */
    similarDocumentIds?: string[];
}): Promise<void> {
    const {
        tenantId, botId, workspaceId, taskId, actionType,
        documentId, documentTitle, documentContent, documentVersion = 1,
        domain, complianceFrameworks,
        gatewayBaseUrl, serviceToken,
        stakeholderId, stakeholderName, stakeholderRole, approvalComments,
        executeAction, workspaceDir,
        ticketPlatform, ticketProjectKey, ticketEpicId,
        similarDocumentIds = [],
    } = params;

    const documentType = ACTION_TYPE_TO_DOC_TYPE[actionType] ?? 'draft_brd';
    const resolvedDocumentId = documentId ?? `${taskId}-${documentType}`;

    // Sign-off ledger — record the approval decision
    if (stakeholderId && stakeholderName) {
        recordSignoff(
            {
                documentId: resolvedDocumentId,
                documentTitle,
                documentVersion,
                documentType,
                stakeholderId,
                stakeholderName,
                stakeholderRole,
                decision: 'approved',
                comments: approvalComments,
                workspaceId,
            },
            gatewayBaseUrl,
            serviceToken,
        ).catch((e) => console.warn('[ba-action-handler] signoff record failed:', e));
    }

    const newDocId = await ingestApprovedDocument({
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
    if (newDocId && similarDocumentIds.length > 0) {
        const base = gatewayBaseUrl.replace(/\/+$/, '');
        for (const priorId of similarDocumentIds) {
            fetch(`${base}/v1/memory/edges`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` },
                body: JSON.stringify({ tenantId, workspaceId, fromId: newDocId, fromType: 'knowledge', toId: priorId, toType: 'knowledge', edgeType: 'derived_from', agentPrefix: 'ba' }),
                signal: AbortSignal.timeout(5_000),
            }).catch(() => { /* non-fatal */ });
        }
    }

    // Persist to durable storage when connectors are available
    if (executeAction && documentContent && workspaceDir) {
        const persistReq: BaDocumentPersistRequest = {
            documentType,
            documentTitle,
            content: documentContent,
            workspaceDir,
            domain,
        };
        try {
            const pr = await persistBaDocument(persistReq, executeAction);
            if (pr.ok) {
                console.info('[ba-action-handler] approved doc persisted:', pr.summary);
            }
        } catch (e) {
            console.warn('[ba-action-handler] persistence failed on approval:', e);
        }
    }

    // Write tickets for ticketable document types
    const ticketableTypes: BaActionType[] = [
        'workspace_ba_draft_user_story',
        'workspace_ba_finalize_acceptance_criteria',
        'workspace_ba_uat_checklist',
    ];
    if (executeAction && ticketPlatform && ticketProjectKey && ticketableTypes.includes(actionType)) {
        const ticketDocType =
            actionType === 'workspace_ba_draft_user_story' ? 'user_story'
            : actionType === 'workspace_ba_finalize_acceptance_criteria' ? 'acceptance_criteria'
            : 'uat_checklist';

        const ticketReq: BaTicketWriteRequest = {
            platform: ticketPlatform,
            projectKey: ticketProjectKey,
            documentType: ticketDocType,
            content: documentContent,
            documentTitle,
            epicId: ticketEpicId,
            baLabel: 'ba-generated',
        };
        try {
            const receipt = await writeTicketsFromDocument(ticketReq, executeAction);
            if (!receipt.skipped) {
                console.info(`[ba-action-handler] ${receipt.ticketsCreated} ticket(s) created on approval for ${ticketPlatform}`);
            }
        } catch (e) {
            console.warn('[ba-action-handler] ticket write failed on approval:', e);
        }
    }

    await writeEpisodicMemory({
        tenantId,
        workspaceId,
        pattern: `ba:${documentType}:approved`,
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
    documentTitle?: string;
    documentVersion?: number;
    rejectionReasons: string[];
    /** Stakeholder who rejected — recorded in the sign-off ledger. */
    rejectionAuthor?: string;
    rejectionAuthorId?: string;
    rejectionAuthorRole?: string;
    gatewayBaseUrl: string;
    serviceToken: string;
}): Promise<void> {
    const {
        tenantId, workspaceId, taskId, actionType, documentId,
        documentTitle, documentVersion = 1,
        rejectionReasons, rejectionAuthor, rejectionAuthorId, rejectionAuthorRole,
        gatewayBaseUrl, serviceToken,
    } = params;

    // Sign-off ledger — record the rejection decision
    if (rejectionAuthorId && rejectionAuthor) {
        recordSignoff(
            {
                documentId,
                documentTitle: documentTitle ?? documentId,
                documentVersion,
                documentType: ACTION_TYPE_TO_DOC_TYPE[actionType] ?? 'draft_brd',
                stakeholderId: rejectionAuthorId,
                stakeholderName: rejectionAuthor,
                stakeholderRole: rejectionAuthorRole,
                decision: 'rejected',
                comments: rejectionReasons.join('; ').slice(0, 400),
                workspaceId,
            },
            gatewayBaseUrl,
            serviceToken,
        ).catch((e) => console.warn('[ba-action-handler] signoff record failed:', e));
    }

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
