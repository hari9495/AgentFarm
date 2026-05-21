/**
 * intent-clarifier.ts
 *
 * Detects ambiguous task descriptions before execution begins.
 * If the task is too vague, the agent sends clarifying questions via the
 * notification channel instead of guessing — matching how a human employee
 * would ask "Can you clarify what you mean?" rather than doing the wrong thing.
 *
 * Integration point: call assessTaskClarity() at the top of processOneTask,
 * before the LLM execution path.  If result.clear === false, persist a
 * 'clarification_requested' record and return early.
 */

import type { TaskEnvelope } from './execution-engine.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClarityAssessment {
    /** True when the task description is sufficiently clear to proceed. */
    clear: boolean;
    /** Confidence score 0-1 from the heuristic analysis. */
    clarityScore: number;
    /** Structured questions to send back to the requester when clear=false. */
    questions: string[];
    /** Human-readable reason (for audit logging). */
    reason: string;
}

/** Injected LLM function for deep ambiguity analysis on borderline tasks. */
export type ClarityLlmFn = (prompt: string) => Promise<string>;

// ---------------------------------------------------------------------------
// Heuristic signals
// ---------------------------------------------------------------------------

const VAGUE_OPENERS = [
    /^(fix|update|change|improve|make|do|handle|deal with|look at)\s+\w+\.?$/i,
    /^(help|check|see|review|verify)\s+\w+\.?$/i,
];

const MINIMUM_WORD_COUNT = 5;

// Actions that always require an explicit target (file path, ticket ID, URL…)
const TARGET_REQUIRED_ACTIONS = new Set([
    'code_edit',
    'code_edit_patch',
    'workspace_fix_test_failures',
    'workspace_github_issue_fix',
    'workspace_autonomous_plan_execute',
    'workspace_bulk_refactor',
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assess whether a task envelope contains enough information to proceed.
 *
 * @param task     The raw task as received by the runtime.
 * @param llmFn    Optional LLM function for borderline cases (omit in tests).
 */
export async function assessTaskClarity(
    task: TaskEnvelope,
    llmFn?: ClarityLlmFn,
): Promise<ClarityAssessment> {
    const payload = task.payload;

    // Extract the best human-readable description available
    const description =
        (typeof payload['prompt'] === 'string' ? payload['prompt'] : '') ||
        (typeof payload['objective'] === 'string' ? payload['objective'] : '') ||
        (typeof payload['summary'] === 'string' ? payload['summary'] : '') ||
        (typeof payload['title'] === 'string' ? payload['title'] : '');

    const actionType =
        typeof payload['action_type'] === 'string' ? payload['action_type'] : '';
    const hasFilePath =
        typeof payload['file_path'] === 'string' && payload['file_path'].trim().length > 0;
    const hasTargetFiles =
        Array.isArray(payload['target_files']) && (payload['target_files'] as unknown[]).length > 0;
    const hasTicketId =
        typeof payload['ticket_id'] === 'string' && payload['ticket_id'].trim().length > 0;

    const wordCount = description.trim().split(/\s+/).filter(Boolean).length;
    const questions: string[] = [];
    let score = 1.0;
    let reason = 'Task is sufficiently clear.';

    // ── Heuristic 1: description too short ──────────────────────────────────
    if (wordCount < MINIMUM_WORD_COUNT) {
        score -= 0.4;
        questions.push('Can you provide more detail about what you want to achieve?');
        reason = `Task description is too short (${wordCount} words).`;
    }

    // ── Heuristic 2: vague opener matched ───────────────────────────────────
    if (VAGUE_OPENERS.some((re) => re.test(description.trim()))) {
        score -= 0.3;
        if (!questions.some((q) => q.includes('detail'))) {
            questions.push('What specific outcome are you expecting?');
        }
        reason = 'Task description matches a vague opener pattern.';
    }

    // ── Heuristic 3: action requires a target but none provided ─────────────
    if (TARGET_REQUIRED_ACTIONS.has(actionType) && !hasFilePath && !hasTargetFiles) {
        score -= 0.35;
        questions.push(
            `Which file(s) or component(s) should be affected? (action: ${actionType})`,
        );
        reason = `Action '${actionType}' requires a target file or component.`;
    }

    // ── Heuristic 4: no description at all ──────────────────────────────────
    if (!description.trim()) {
        score = 0;
        questions.length = 0;
        questions.push(
            'What should I do? Please provide a description, objective, or prompt.',
        );
        reason = 'No task description found in payload.';
    }

    // ── Cap score to [0, 1] ──────────────────────────────────────────────────
    const clarityScore = Math.max(0, Math.min(1, score));

    // Borderline range [0.45 – 0.65]: optionally ask LLM for deeper analysis
    if (clarityScore >= 0.45 && clarityScore < 0.65 && llmFn) {
        try {
            const llmPrompt = buildLlmClarityPrompt(description, actionType, hasFilePath || hasTargetFiles || hasTicketId);
            const response = await llmFn(llmPrompt);
            const parsed = parseLlmClarityResponse(response);
            if (!parsed.clear) {
                questions.push(...parsed.questions.filter((q) => !questions.includes(q)));
                reason = `LLM analysis: ${parsed.reason}`;
                return { clear: false, clarityScore: parsed.score, questions, reason };
            }
        } catch {
            // LLM failure must never block execution — fall through to heuristic result
        }
    }

    const clear = clarityScore > 0.65;
    return { clear, clarityScore, questions, reason };
}

// ---------------------------------------------------------------------------
// Build clarifying questions as a human-readable message
// ---------------------------------------------------------------------------

export function buildClarificationMessage(
    assessment: ClarityAssessment,
    taskId: string,
    agentDisplayName?: string,
): string {
    const name = agentDisplayName ?? 'The agent';
    const lines = [
        `Hi! ${name} needs a bit more context before starting task \`${taskId}\`.`,
        '',
        ...assessment.questions.map((q, i) => `${i + 1}. ${q}`),
        '',
        'Please reply with the clarification and re-submit the task. No work has been started.',
    ];
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildLlmClarityPrompt(
    description: string,
    actionType: string,
    hasTarget: boolean,
): string {
    return [
        'Assess whether the following task description provides enough information for an AI agent to execute it correctly.',
        `Action type: ${actionType || 'unspecified'}`,
        `Has explicit target (file/ticket/component): ${hasTarget}`,
        `Description: "${description}"`,
        '',
        'Respond in JSON: { "clear": boolean, "score": number (0-1), "questions": string[], "reason": string }',
        'score > 0.65 means clear enough to proceed.',
    ].join('\n');
}

function parseLlmClarityResponse(raw: string): {
    clear: boolean;
    score: number;
    questions: string[];
    reason: string;
} {
    try {
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('no JSON');
        const parsed = JSON.parse(match[0]) as {
            clear?: boolean;
            score?: number;
            questions?: string[];
            reason?: string;
        };
        return {
            clear: parsed.clear ?? true,
            score: typeof parsed.score === 'number' ? parsed.score : 0.5,
            questions: Array.isArray(parsed.questions) ? (parsed.questions as string[]) : [],
            reason: typeof parsed.reason === 'string' ? parsed.reason : 'LLM assessment',
        };
    } catch {
        return { clear: true, score: 0.7, questions: [], reason: 'LLM response unparseable — defaulting to clear' };
    }
}
