/**
 * Business Analyst — Post-Interview BRD Builder
 *
 * Converts a completed `BaInterviewResult` (requirements elicited during a
 * live meeting session) into a structured first-draft BRD.
 *
 * Pipeline:
 *   1. Group `ElicitedRequirement[]` by interview topic
 *   2. Retrieve RAG context (prior BRDs + compliance + lessons)
 *   3. Call LLM to generate a full BRD from the requirements and RAG context
 *   4. Run a completeness check on the generated BRD
 *   5. Return the draft + completeness result + retrieval metadata
 *
 * The output of this builder is meant to be passed directly to
 * `handleBaAction()` (workspace_ba_draft_brd) or saved to the workspace
 * document store by the caller.
 *
 * No I/O other than the LLM call and the RAG retrieval.
 */

import {
    buildBaRagContext,
    type BaRagQuery,
    type BaRagContext,
} from './business-analyst-rag-retriever.js';
import { checkBrdCompleteness, type BrdCompletenessResult } from './business-analyst-brd-completeness-checker.js';
import type { BaProseCallerFn } from './business-analyst-tone-adapter.js';
import type { BaInterviewResult } from './business-analyst-interview-runner.js';
import type { ElicitedRequirement, InterviewTopic } from './business-analyst-interview-protocol.js';
import type { BaComplianceFramework } from './business-analyst-rag-retriever.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PostInterviewBrdInput {
    tenantId: string;
    botId?: string;
    workspaceId: string;
    /** Title of the project — used as the BRD title and RAG query. */
    projectTitle: string;
    /** The completed interview result from runBaInterviewSession(). */
    interviewResult: BaInterviewResult;
    /** Compliance frameworks that apply to this project. */
    complianceFrameworks?: BaComplianceFramework[];
    /** Industry domain — improves RAG precision. */
    domain?: BaRagQuery['domain'];
    /** Gateway base URL for RAG retrieval. */
    gatewayBaseUrl: string;
    /** Service token for gateway calls. */
    serviceToken: string;
    /** LLM prose caller — required for BRD generation. */
    callLlm: (prompt: string, systemPrompt?: string) => Promise<string>;
    /** Author name shown in the BRD header. Default: 'AI Business Analyst Agent'. */
    authorName?: string;
}

export interface PostInterviewBrdResult {
    /** Full BRD markdown. Empty string if callLlm was unavailable. */
    brdContent: string;
    /** Completeness check on the generated BRD. */
    completeness: BrdCompletenessResult;
    /** RAG retrieval metadata. */
    ragContext: BaRagContext;
    /** Number of requirements extracted from the interview. */
    requirementCount: number;
    /** ISO-8601 timestamp when the BRD was generated. */
    generatedAt: string;
}

// ---------------------------------------------------------------------------
// Requirement grouping
// ---------------------------------------------------------------------------

/**
 * Group requirements by topic and format them as a structured block for the
 * LLM prompt. Topics map roughly to BRD sections.
 */
const TOPIC_LABELS: Record<InterviewTopic, string> = {
    business_context:    'Business Context',
    current_state:       'Current State',
    pain_points:         'Pain Points & Problems',
    stakeholders:        'Stakeholders',
    success_criteria:    'Success Criteria',
    constraints:         'Constraints & Assumptions',
    assumptions:         'Assumptions',
    timeline:            'Timeline & Phasing',
};

function groupRequirementsByTopic(requirements: ElicitedRequirement[]): string {
    if (requirements.length === 0) return '_No requirements were elicited._';

    // Group by topic
    const byTopic = new Map<InterviewTopic, ElicitedRequirement[]>();
    for (const req of requirements) {
        if (!byTopic.has(req.topic)) byTopic.set(req.topic, []);
        byTopic.get(req.topic)!.push(req);
    }

    const sections: string[] = [];

    for (const [topic, reqs] of byTopic) {
        const label = TOPIC_LABELS[topic] ?? (topic as string).replace(/_/g, ' ');
        sections.push(`### ${label}`);
        for (const req of reqs) {
            // confidence is 0-1; round to percentage for readability
            const conf = ` _(confidence: ${Math.round(req.confidence * 100)}%)_`;
            const source = req.source ? ` _(source quote: "${req.source.slice(0, 80)}")_` : '';
            sections.push(`- ${req.text}${conf}${source}`);
        }
        sections.push('');
    }

    return sections.join('\n');
}

/**
 * Build a summary of the interview session for the BRD introduction.
 */
function buildInterviewSummary(interviewResult: BaInterviewResult): string {
    const { topicSummary, totalTurns } = interviewResult;

    const answered = Object.values(topicSummary).filter((t) => t.status === 'answered').length;
    const skipped  = Object.values(topicSummary).filter((t) => t.status === 'skipped').length;

    const lines: string[] = [
        `**Topics answered:** ${answered}`,
        `**Topics skipped:** ${skipped}`,
        `**Total conversation turns:** ${totalTurns}`,
    ];

    if (topicSummary && Object.keys(topicSummary).length > 0) {
        lines.push('');
        lines.push('**Topic notes from the interview:**');
        for (const [topic, entry] of Object.entries(topicSummary)) {
            if (entry.extractedInfo) {
                lines.push(`- ${topic.replace(/_/g, ' ')}: ${entry.extractedInfo.slice(0, 120)}`);
            }
        }
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// BRD template builder
// ---------------------------------------------------------------------------

/**
 * Build the system prompt for BRD generation from interview requirements.
 */
function buildBrdSystemPrompt(ragContextBlock: string): string {
    return [
        '# Business Analyst Agent — BRD Generator',
        '',
        'You are converting stakeholder interview notes into a professional Business Requirements Document.',
        '',
        'STRUCTURE (use these exact headings):',
        '1. Executive Summary',
        '2. Business Objectives',
        '3. Scope',
        '   3.1 In-Scope',
        '   3.2 Out-of-Scope',
        '4. Stakeholders',
        '5. Functional Requirements (number as REQ-001, REQ-002 …; MoSCoW priority)',
        '6. Non-Functional Requirements (performance, security, scalability, reliability)',
        '7. Assumptions & Constraints',
        '8. Success Criteria (measurable KPIs)',
        '9. Risks & Mitigations',
        '10. Open Questions (anything [TBD] or unresolved from the interview)',
        '',
        'RULES:',
        '- Do NOT invent requirements. Only document what was stated in the interview notes.',
        '- Mark genuinely unknown items as [TBD] — do not guess.',
        '- Every functional requirement must be numbered and assigned a MoSCoW priority.',
        '- Success criteria must be measurable (include numbers, percentages, SLAs where stated).',
        '- Keep language clear, specific, and free of jargon unless the stakeholder used it.',
        '',
        ragContextBlock || '',
    ].filter((l) => l !== undefined).join('\n');
}

/**
 * Build the user prompt from the interview result.
 */
function buildBrdUserPrompt(params: {
    projectTitle: string;
    interviewResult: BaInterviewResult;
    authorName: string;
    date: string;
}): string {
    const { projectTitle, interviewResult, authorName, date } = params;

    const requirementBlock = groupRequirementsByTopic(interviewResult.elicitedRequirements ?? []);
    const interviewSummaryBlock = buildInterviewSummary(interviewResult);

    return [
        `## Project: ${projectTitle}`,
        `**Date:** ${date}`,
        `**Author:** ${authorName}`,
        `**Interview conducted at:** ${interviewResult.completedAt ?? 'unknown'}`,
        '',
        '---',
        '',
        '## Interview Summary',
        interviewSummaryBlock,
        '',
        '---',
        '',
        '## Elicited Requirements',
        requirementBlock,
        '',
        '---',
        '',
        'Using the above interview notes, generate the complete BRD following the required structure.',
        'Preserve all stated requirements exactly — do not paraphrase requirements in a way that changes meaning.',
        'Use [TBD] for any section where the interview did not provide enough information.',
    ].join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a completed BA interview result into a first-draft BRD.
 *
 * This is the primary output of the interview flow — it should be called
 * immediately after `runBaInterviewSession()` returns.
 *
 * Example usage:
 * ```ts
 * const interviewResult = await runBaInterviewSession(params, caller, executor);
 * const brdResult = await buildBrdFromInterview({
 *     tenantId, workspaceId, projectTitle: 'Payment Gateway Upgrade',
 *     interviewResult, callLlm, gatewayBaseUrl, serviceToken,
 * });
 * ```
 */
export async function buildBrdFromInterview(
    input: PostInterviewBrdInput,
): Promise<PostInterviewBrdResult> {
    const {
        tenantId, botId, workspaceId,
        projectTitle, interviewResult,
        complianceFrameworks, domain,
        gatewayBaseUrl, serviceToken, callLlm,
        authorName = 'AI Business Analyst Agent',
    } = input;

    const generatedAt = new Date().toISOString();
    const dateLabel = new Date().toLocaleDateString('en-GB', { dateStyle: 'long' });
    const requirements = interviewResult.elicitedRequirements ?? [];

    // -------------------------------------------------------------------------
    // RAG retrieval — fetch prior BRDs, compliance checklists, and lessons
    // -------------------------------------------------------------------------
    const ragQuery: BaRagQuery = {
        tenantId,
        botId,
        projectTitle,
        projectDescription: requirements.slice(0, 5).map((r) => r.text).join('\n'),
        documentType: 'brd',
        complianceFrameworks: complianceFrameworks?.length ? complianceFrameworks : undefined,
        domain: domain || undefined,
    };

    const ragContext = await buildBaRagContext(ragQuery, gatewayBaseUrl, serviceToken, workspaceId);

    // -------------------------------------------------------------------------
    // BRD generation
    // -------------------------------------------------------------------------
    const systemPrompt = buildBrdSystemPrompt(ragContext.contextBlock);
    const userPrompt = buildBrdUserPrompt({
        projectTitle,
        interviewResult,
        authorName,
        date: dateLabel,
    });

    let brdContent = '';
    try {
        brdContent = await callLlm(userPrompt, systemPrompt);
    } catch (err) {
        console.error('[ba-post-interview-builder] LLM call failed:', err);
        // Fallback: produce a minimal skeleton from the requirements
        brdContent = buildMinimalBrdSkeleton(projectTitle, requirements, authorName, dateLabel);
    }

    // -------------------------------------------------------------------------
    // Completeness check
    // -------------------------------------------------------------------------
    // Adapt callLlm to BaProseCallerFn: (systemPrompt, userPrompt) → { text }
    // Note parameter order is swapped vs callLlm(userPrompt, systemPrompt?)
    const baCallerFn: BaProseCallerFn = async (systemPrompt: string, userPrompt: string) => {
        try {
            const text = await callLlm(userPrompt, systemPrompt);
            return { text };
        } catch (err) {
            return { text: null, error: String(err) };
        }
    };

    const completeness = await checkBrdCompleteness(brdContent, baCallerFn);

    return {
        brdContent,
        completeness,
        ragContext,
        requirementCount: requirements.length,
        generatedAt,
    };
}

// ---------------------------------------------------------------------------
// Minimal BRD skeleton (fallback when LLM is unavailable)
// ---------------------------------------------------------------------------

/**
 * Produce a structured but unfilled BRD skeleton from raw requirements.
 * Used as a fallback when the LLM call fails.
 */
function buildMinimalBrdSkeleton(
    projectTitle: string,
    requirements: ElicitedRequirement[],
    authorName: string,
    date: string,
): string {
    const reqLines = requirements.length > 0
        ? requirements.map((r, i) => {
              const id = `REQ-${String(i + 1).padStart(3, '0')}`;
              return `| ${id} | ${r.text} | [TBD] | MUST |`;
          })
        : ['| REQ-001 | [TBD — requirements not captured] | [TBD] | MUST |'];

    return [
        `# Business Requirements Document`,
        `## ${projectTitle}`,
        '',
        `**Date:** ${date}  `,
        `**Author:** ${authorName}  `,
        `**Status:** Draft  `,
        '',
        '---',
        '',
        '## 1. Executive Summary',
        '',
        '[TBD — to be completed from stakeholder interview transcript]',
        '',
        '## 2. Business Objectives',
        '',
        '[TBD]',
        '',
        '## 3. Scope',
        '',
        '### 3.1 In-Scope',
        '[TBD]',
        '',
        '### 3.2 Out-of-Scope',
        '[TBD]',
        '',
        '## 4. Stakeholders',
        '',
        '[TBD]',
        '',
        '## 5. Functional Requirements',
        '',
        '| ID | Requirement | Details | Priority |',
        '|----|-------------|---------|----------|',
        ...reqLines,
        '',
        '## 6. Non-Functional Requirements',
        '',
        '[TBD]',
        '',
        '## 7. Assumptions & Constraints',
        '',
        '[TBD]',
        '',
        '## 8. Success Criteria',
        '',
        '[TBD]',
        '',
        '## 9. Risks & Mitigations',
        '',
        '[TBD]',
        '',
        '## 10. Open Questions',
        '',
        '[TBD — review interview transcript for unresolved items]',
    ].join('\n');
}
