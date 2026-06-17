/**
 * max-mode.ts — Parallel candidate sampling with quality-based selection.
 *
 * When enabled, Max Mode runs N independent LLM candidates for the same task
 * concurrently. Each successful candidate is scored by Goal Judge; the highest-
 * confidence result is returned to the quality gates pipeline.
 *
 * Cost: multiplies LLM cost by N. Enable only where output quality justifies it.
 *
 * Gating:
 *   - AF_MAX_MODE_ENABLED=true  → global operator override (all workspaces)
 *   - payload._max_mode_enabled → per-workspace flag injected at task dispatch
 *   - Pro/Enterprise workspaces have maxModeEnabled=true in the Workspace DB record
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
 * Returns true if Max Mode should run for this task.
 * Checks the global env var override first, then the per-workspace flag
 * injected into the payload as _max_mode_enabled.
 */
export function isMaxModeEnabledForPayload(payload: Record<string, unknown>): boolean {
    if (isEnabled()) return true;
    return payload['_max_mode_enabled'] === true;
}

/**
 * Run N parallel candidates and return the highest-scoring successful one.
 * The returned result carries maxModeCandidates and maxModeWinnerScore
 * when N>1 candidates were scored.
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
        const firstFulfilled = settled.find(
            (r): r is PromiseFulfilledResult<ProcessedTaskResult> => r.status === 'fulfilled',
        );
        if (firstFulfilled) return firstFulfilled.value;
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
    const winner = scored[0];
    return { ...winner.result, maxModeCandidates: n, maxModeWinnerScore: winner.score };
}

export function isMaxModeEnabled(): boolean {
    return isEnabled();
}

export function getMaxModeCandidates(): number {
    return getCandidateCount();
}
