/**
 * max-mode.ts — Parallel candidate sampling with quality-based selection.
 *
 * When enabled, Max Mode runs N independent LLM candidates for the same task
 * concurrently. Each successful candidate is scored by Goal Judge; the highest-
 * confidence result is returned to the quality gates pipeline.
 *
 * Cost: multiplies LLM cost by N. Enable only where output quality justifies it.
 *
 * See docs/QUALITY_GATES.md §6 for the full design.
 */

import type { ProcessedTaskResult } from './execution-engine.js';

function isEnabled(): boolean {
    return (
        process.env['AF_MAX_MODE_ENABLED'] === 'true' ||
        process.env['AF_MAX_MODE_ENABLED'] === '1'
    );
}

function getCandidateCount(): number {
    const raw = process.env['AF_MAX_MODE_CANDIDATES'];
    if (raw) {
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed) && parsed >= 1) return parsed;
    }
    return 3;
}

const SKIP_ACTION_TYPES = new Set([
    'code_read',
    'workspace_read_file',
    'workspace_list_files',
    'workspace_grep',
    'workspace_scout',
    'k8s_get',
    'k8s_logs',
    'prometheus_query',
    'vault_read',
]);

export function shouldSkipMaxMode(payload: Record<string, unknown>): boolean {
    if (payload['skip_max_mode'] === true) return true;
    const actionType = typeof payload['actionType'] === 'string' ? payload['actionType'] : '';
    return SKIP_ACTION_TYPES.has(actionType);
}

/**
 * Run N parallel candidates and return the highest-scoring successful one.
 *
 * @param executeFn   Factory producing one candidate run. Called N times in parallel.
 * @param scoreFn     Scores a successful candidate output 0–1. Called on each success.
 * @param n           Number of candidates. Must be ≥ 1.
 *
 * Selection rules:
 *   - If 0 candidates succeed → return the first settled result (any status).
 *   - If 1 candidate succeeds → return it directly (no scoring overhead).
 *   - If N>1 succeed → score all, return the highest-scoring one.
 *   - If scoreFn throws for a candidate → that candidate scores 0.5 (neutral).
 */
export async function runMaxMode(
    executeFn: () => Promise<ProcessedTaskResult>,
    scoreFn: (output: string) => Promise<number>,
    n: number,
): Promise<ProcessedTaskResult> {
    if (n <= 1) return executeFn();

    const settled = await Promise.allSettled(
        Array.from({ length: n }, () => executeFn()),
    );

    const successes = settled
        .filter(
            (r): r is PromiseFulfilledResult<ProcessedTaskResult> =>
                r.status === 'fulfilled' && r.value.status === 'success',
        )
        .map((r) => r.value);

    if (successes.length === 0) {
        // No candidate succeeded — return the first fulfilled result (preserves error detail)
        const firstFulfilled = settled.find(
            (r): r is PromiseFulfilledResult<ProcessedTaskResult> => r.status === 'fulfilled',
        );
        if (firstFulfilled) return firstFulfilled.value;
        // All rejected (should not happen with executeTaskWithRetries which never throws)
        const rejected = settled[0] as PromiseRejectedResult;
        throw rejected.reason;
    }

    if (successes.length === 1) return successes[0];

    // Score all successful candidates and pick the highest
    const scored = await Promise.all(
        successes.map(async (result) => ({
            result,
            score: await scoreFn(result.actionOutput ?? '').catch(() => 0.5),
        })),
    );

    scored.sort((a, b) => b.score - a.score);
    return scored[0].result;
}

export function isMaxModeEnabled(): boolean {
    return isEnabled();
}

export function getMaxModeCandidates(): number {
    return getCandidateCount();
}
