/**
 * CI feedback loop — closes the developer agent's issue→PR→green-CI cycle.
 *
 * After the autonomous coding loop opens a PR, `pollPrChecks` watches the
 * GitHub check-runs on the PR's head ref until they complete, and
 * `runCiFeedbackCycle` orchestrates fix → push → re-poll rounds (bounded)
 * when checks fail. Both take injected dependencies so the cycle is fully
 * unit-testable without GitHub.
 */

export type CiPollOutcome = 'success' | 'failure' | 'no_checks' | 'timed_out' | 'error';

export type CiPollResult = {
    outcome: CiPollOutcome;
    failing: Array<{ name: string; summary: string }>;
    checksSeen: number;
};

type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Conclusions that do not require a fix round.
const PASSING_CONCLUSIONS = new Set(['success', 'neutral', 'skipped']);

type CheckRunsPayload = {
    total_count?: number;
    check_runs?: Array<{
        name?: string;
        status?: string;
        conclusion?: string | null;
        output?: { title?: string | null; summary?: string | null };
    }>;
};

/**
 * Poll GitHub check-runs for a ref (branch or SHA) until every run completes
 * or the time budget is spent.
 *
 * - all completed and passing        → 'success'
 * - any completed non-passing        → 'failure' (+ failing run summaries)
 * - zero check runs reported         → 'no_checks' (repo has no CI on this ref)
 * - still running at timeout         → 'timed_out'
 * - GitHub API error                 → 'error'
 */
export async function pollPrChecks(params: {
    githubToken: string;
    owner: string;
    repo: string;
    ref: string;
    fetcher?: typeof fetch;
    sleep?: SleepFn;
    pollIntervalMs?: number;
    timeoutMs?: number;
    now?: () => number;
}): Promise<CiPollResult> {
    const fetcher = params.fetcher ?? globalThis.fetch;
    const sleep = params.sleep ?? defaultSleep;
    const pollIntervalMs = params.pollIntervalMs ?? 30_000;
    const timeoutMs = params.timeoutMs ?? 15 * 60_000;
    const now = params.now ?? Date.now;

    const url =
        `https://api.github.com/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}` +
        `/commits/${encodeURIComponent(params.ref)}/check-runs?per_page=100`;

    const deadline = now() + timeoutMs;
    let lastChecksSeen = 0;

    for (;;) {
        let payload: CheckRunsPayload;
        try {
            const res = await fetcher(url, {
                headers: {
                    Authorization: `Bearer ${params.githubToken}`,
                    Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                },
            });
            if (!res.ok) {
                return { outcome: 'error', failing: [], checksSeen: lastChecksSeen };
            }
            payload = (await res.json()) as CheckRunsPayload;
        } catch {
            return { outcome: 'error', failing: [], checksSeen: lastChecksSeen };
        }

        const runs = payload.check_runs ?? [];
        lastChecksSeen = runs.length;

        if (runs.length === 0) {
            // Checks may simply not have been scheduled yet — keep waiting
            // within the budget, then report the repo as check-less.
            if (now() >= deadline) return { outcome: 'no_checks', failing: [], checksSeen: 0 };
        } else {
            const pending = runs.filter((r) => r.status !== 'completed');
            if (pending.length === 0) {
                const failing = runs
                    .filter((r) => !PASSING_CONCLUSIONS.has(r.conclusion ?? ''))
                    .map((r) => ({
                        name: r.name ?? '(unnamed check)',
                        summary: r.output?.summary?.trim() || r.output?.title?.trim() || (r.conclusion ?? 'failed'),
                    }));
                return failing.length === 0
                    ? { outcome: 'success', failing: [], checksSeen: runs.length }
                    : { outcome: 'failure', failing, checksSeen: runs.length };
            }
            if (now() >= deadline) return { outcome: 'timed_out', failing: [], checksSeen: runs.length };
        }

        await sleep(pollIntervalMs);
        if (now() >= deadline && lastChecksSeen === 0) return { outcome: 'no_checks', failing: [], checksSeen: 0 };
        if (now() >= deadline) return { outcome: 'timed_out', failing: [], checksSeen: lastChecksSeen };
    }
}

export type CiCycleOutcome = 'green' | 'exhausted' | 'fix_failed' | 'push_failed' | 'no_checks' | 'timed_out' | 'error';

export type CiCycleRound = {
    attempt: number;
    pollOutcome: CiPollOutcome;
    failing: Array<{ name: string; summary: string }>;
    fixOk?: boolean;
    pushOk?: boolean;
};

export type CiCycleResult = {
    outcome: CiCycleOutcome;
    attempts: number;
    history: CiCycleRound[];
};

/**
 * Bounded poll → fix → push cycle. Dependencies are injected:
 *  - poll(): one full check-runs poll (e.g. a bound `pollPrChecks`)
 *  - fix(failureSummary, attempt): produce and apply a code fix
 *  - push(attempt): commit and push the fix to the PR branch
 */
export async function runCiFeedbackCycle(params: {
    poll: () => Promise<CiPollResult>;
    fix: (failureSummary: string, attempt: number) => Promise<{ ok: boolean; detail?: unknown }>;
    push: (attempt: number) => Promise<{ ok: boolean }>;
    maxAttempts?: number;
}): Promise<CiCycleResult> {
    const maxAttempts = params.maxAttempts ?? 3;
    const history: CiCycleRound[] = [];
    let attempts = 0;

    for (;;) {
        const poll = await params.poll();
        const round: CiCycleRound = { attempt: attempts, pollOutcome: poll.outcome, failing: poll.failing };
        history.push(round);

        if (poll.outcome === 'success') return { outcome: 'green', attempts, history };
        if (poll.outcome === 'no_checks') return { outcome: 'no_checks', attempts, history };
        if (poll.outcome === 'timed_out') return { outcome: 'timed_out', attempts, history };
        if (poll.outcome === 'error') return { outcome: 'error', attempts, history };

        // failure — spend a fix attempt if any remain
        if (attempts >= maxAttempts) return { outcome: 'exhausted', attempts, history };
        attempts += 1;
        round.attempt = attempts;

        const failureSummary = poll.failing
            .map((f) => `${f.name}: ${f.summary}`)
            .join('\n')
            .slice(0, 8_000);

        const fixResult = await params.fix(failureSummary, attempts);
        round.fixOk = fixResult.ok;
        if (!fixResult.ok) return { outcome: 'fix_failed', attempts, history };

        const pushResult = await params.push(attempts);
        round.pushOk = pushResult.ok;
        if (!pushResult.ok) return { outcome: 'push_failed', attempts, history };
    }
}
