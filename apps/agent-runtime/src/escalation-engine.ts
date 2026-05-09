/**
 * Escalation engine.
 *
 * A real human developer knows when to stop retrying and escalate.  This module
 * gives the agent the same judgement: it inspects the task state and attempt
 * history and decides whether the agent should continue or hand off to a human.
 */

/** Canonical reasons why a task should be escalated rather than retried. */
export type EscalationReason =
    | 'max_retries_exceeded'
    | 'approval_rejected_twice'
    | 'ambiguous_task'
    | 'scope_too_large'
    | 'test_failures_unresolved';

/** The outcome of an escalation evaluation. */
export interface EscalationDecision {
    /** Whether the task should be escalated (true) or is safe to proceed (false). */
    shouldEscalate: boolean;
    /** The primary reason for escalation, if shouldEscalate is true. */
    reason?: EscalationReason;
    /** A human-readable message explaining the decision. */
    message: string;
    /** What the caller should do next. */
    suggestedAction: 'ask_human' | 'reduce_scope' | 'request_approval' | 'stop';
}

/** Pattern matching test / build failure output. */
const TEST_FAILURE_PATTERN = /test.*fail|FAIL|exit code [^0]/i;

/**
 * Evaluate whether a task should be escalated to a human.
 *
 * Checks five independent escalation conditions in priority order and returns
 * the first matching decision.  Returns a non-escalating decision when none match.
 *
 * @param task          The task envelope (or its payload) — must expose a `payload` property.
 * @param attemptCount  Number of execution attempts completed so far (0-based: 0 = first attempt).
 * @param lastError     The error output from the most recent failed attempt, if any.
 */
export function evaluateEscalation(
    task: { payload?: Record<string, unknown> } | Record<string, unknown>,
    attemptCount: number,
    lastError?: string,
): EscalationDecision {
    // Normalise: support both TaskEnvelope {payload:{...}} and bare payload objects
    const payload: Record<string, unknown> =
        task && typeof (task as { payload?: unknown })['payload'] === 'object' && (task as { payload?: unknown })['payload'] !== null
            ? (task as { payload: Record<string, unknown> })['payload']
            : (task as Record<string, unknown>);

    const maxAttempts =
        typeof payload['max_attempts'] === 'number' && payload['max_attempts'] > 0
            ? payload['max_attempts']
            : 3;

    // 1. Max retries exceeded
    if (attemptCount >= maxAttempts) {
        return {
            shouldEscalate: true,
            reason: 'max_retries_exceeded',
            message: `Task has exhausted ${attemptCount} of ${maxAttempts} allowed attempt(s). Escalating to human for review.`,
            suggestedAction: 'ask_human',
        };
    }

    // 2. Approval rejected twice
    const rejectionCount =
        typeof payload['_approval_rejection_count'] === 'number'
            ? payload['_approval_rejection_count']
            : 0;
    if (rejectionCount >= 2) {
        return {
            shouldEscalate: true,
            reason: 'approval_rejected_twice',
            message: `Approval has been rejected ${rejectionCount} time(s). Requesting human intervention to resolve the approval block.`,
            suggestedAction: 'request_approval',
        };
    }

    // 3. Ambiguous task (summary is explicitly set but too short, and this is the first attempt)
    const summaryRaw = payload['summary'];
    if (typeof summaryRaw === 'string' && summaryRaw.trim().length < 10 && attemptCount === 0) {
        const summary = summaryRaw.trim();
        return {
            shouldEscalate: true,
            reason: 'ambiguous_task',
            message: `Task summary is too short to act on safely ("${summary}"). Escalating to human for clarification before any changes.`,
            suggestedAction: 'ask_human',
        };
    }

    // 4. Scope too large (more than 10 files to change)
    const filesToChange = payload['files_to_change'];
    if (Array.isArray(filesToChange) && filesToChange.length > 10) {
        return {
            shouldEscalate: true,
            reason: 'scope_too_large',
            message: `Task requests changes to ${filesToChange.length} files, which exceeds the safe threshold of 10. Escalating to reduce scope before execution.`,
            suggestedAction: 'reduce_scope',
        };
    }

    // 5. Persistent test failures across multiple attempts
    if (
        typeof lastError === 'string' &&
        TEST_FAILURE_PATTERN.test(lastError) &&
        attemptCount >= 2
    ) {
        return {
            shouldEscalate: true,
            reason: 'test_failures_unresolved',
            message: `Test failures have persisted across ${attemptCount} attempt(s) without resolution. Escalating to human rather than retrying blindly.`,
            suggestedAction: 'ask_human',
        };
    }

    return {
        shouldEscalate: false,
        message: 'No escalation criteria met. Task may proceed.',
        suggestedAction: 'stop',
    };
}

/**
 * Build a structured escalation message for inclusion in task results, logs, or notifications.
 *
 * @param decision  The EscalationDecision from evaluateEscalation.
 * @param task      The task envelope or payload (for context extraction).
 */
export function buildEscalationMessage(
    decision: EscalationDecision,
    task: { taskId?: string; payload?: Record<string, unknown> } | Record<string, unknown>,
): string {
    if (!decision.shouldEscalate) {
        return 'No escalation required.';
    }

    const taskId =
        typeof (task as { taskId?: string })['taskId'] === 'string'
            ? (task as { taskId: string })['taskId']
            : 'unknown';

    const payload: Record<string, unknown> =
        task && typeof (task as { payload?: unknown })['payload'] === 'object' && (task as { payload?: unknown })['payload'] !== null
            ? (task as { payload: Record<string, unknown> })['payload']
            : (task as Record<string, unknown>);

    const actionType =
        typeof payload['action_type'] === 'string' ? payload['action_type'] : 'task';

    return [
        `ESCALATION REQUIRED`,
        `Task:    ${taskId}`,
        `Action:  ${actionType}`,
        `Reason:  ${decision.reason ?? 'unknown'}`,
        `Message: ${decision.message}`,
        `Next:    ${decision.suggestedAction}`,
    ].join('\n');
}
