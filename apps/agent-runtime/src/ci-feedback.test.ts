import test from 'node:test';
import assert from 'node:assert/strict';

import { pollPrChecks, runCiFeedbackCycle } from './ci-feedback.js';

// ---------------------------------------------------------------------------
// Helpers — scripted fetch returning a sequence of check-runs payloads
// ---------------------------------------------------------------------------

const checkRunsResponse = (
    runs: Array<{ name: string; status: string; conclusion?: string | null; summary?: string }>,
) =>
    new Response(
        JSON.stringify({
            total_count: runs.length,
            check_runs: runs.map((r) => ({
                name: r.name,
                status: r.status,
                conclusion: r.conclusion ?? null,
                output: { title: r.name, summary: r.summary ?? '' },
            })),
        }),
        { status: 200 },
    );

const makeSequencedFetch = (responses: Response[]) => {
    const calls: string[] = [];
    let idx = 0;
    const fetcher = async (url: string | URL): Promise<Response> => {
        calls.push(String(url));
        const next = responses[Math.min(idx, responses.length - 1)]!;
        idx += 1;
        return next.clone() as Response;
    };
    return { fetcher: fetcher as typeof fetch, calls };
};

const noSleep = async () => {};

// ---------------------------------------------------------------------------
// pollPrChecks
// ---------------------------------------------------------------------------

test('pollPrChecks returns success when every check run completes green', async () => {
    const { fetcher, calls } = makeSequencedFetch([
        checkRunsResponse([
            { name: 'typecheck', status: 'completed', conclusion: 'success' },
            { name: 'tests', status: 'completed', conclusion: 'success' },
            { name: 'lint', status: 'completed', conclusion: 'skipped' },
        ]),
    ]);

    const result = await pollPrChecks({
        githubToken: 'tok',
        owner: 'acme',
        repo: 'web',
        ref: 'feat/branch-1',
        fetcher,
        sleep: noSleep,
        pollIntervalMs: 1,
        timeoutMs: 1_000,
    });

    assert.equal(result.outcome, 'success');
    assert.equal(result.failing.length, 0);
    assert.equal(result.checksSeen, 3);
    assert.ok(calls[0]!.includes('/repos/acme/web/commits/feat%2Fbranch-1/check-runs'));
});

test('pollPrChecks keeps polling while checks are in progress, then reports failures with summaries', async () => {
    const { fetcher, calls } = makeSequencedFetch([
        checkRunsResponse([{ name: 'tests', status: 'in_progress' }]),
        checkRunsResponse([
            { name: 'tests', status: 'completed', conclusion: 'failure', summary: '2 tests failed: auth.spec' },
            { name: 'typecheck', status: 'completed', conclusion: 'success' },
        ]),
    ]);

    const result = await pollPrChecks({
        githubToken: 'tok',
        owner: 'acme',
        repo: 'web',
        ref: 'feat/branch-1',
        fetcher,
        sleep: noSleep,
        pollIntervalMs: 1,
        timeoutMs: 10_000,
    });

    assert.equal(result.outcome, 'failure');
    assert.equal(result.failing.length, 1);
    assert.equal(result.failing[0]!.name, 'tests');
    assert.ok(result.failing[0]!.summary.includes('auth.spec'));
    assert.ok(calls.length >= 2, 'should have polled at least twice');
});

test('pollPrChecks returns no_checks when the repo reports zero check runs', async () => {
    const { fetcher } = makeSequencedFetch([checkRunsResponse([])]);

    const result = await pollPrChecks({
        githubToken: 'tok',
        owner: 'acme',
        repo: 'web',
        ref: 'feat/x',
        fetcher,
        sleep: noSleep,
        pollIntervalMs: 1,
        timeoutMs: 5,
    });

    assert.equal(result.outcome, 'no_checks');
});

test('pollPrChecks returns timed_out when checks never complete within the budget', async () => {
    const { fetcher } = makeSequencedFetch([
        checkRunsResponse([{ name: 'tests', status: 'in_progress' }]),
    ]);

    let clock = 0;
    const result = await pollPrChecks({
        githubToken: 'tok',
        owner: 'acme',
        repo: 'web',
        ref: 'feat/x',
        fetcher,
        sleep: noSleep,
        pollIntervalMs: 10,
        timeoutMs: 25,
        now: () => {
            clock += 10;
            return clock;
        },
    });

    assert.equal(result.outcome, 'timed_out');
});

test('pollPrChecks returns error outcome on a non-2xx GitHub response', async () => {
    const { fetcher } = makeSequencedFetch([new Response('forbidden', { status: 403 })]);

    const result = await pollPrChecks({
        githubToken: 'tok',
        owner: 'acme',
        repo: 'web',
        ref: 'feat/x',
        fetcher,
        sleep: noSleep,
        pollIntervalMs: 1,
        timeoutMs: 1_000,
    });

    assert.equal(result.outcome, 'error');
});

// ---------------------------------------------------------------------------
// runCiFeedbackCycle
// ---------------------------------------------------------------------------

test('runCiFeedbackCycle returns green without fixing when the first poll is green', async () => {
    let fixCalls = 0;
    const result = await runCiFeedbackCycle({
        poll: async () => ({ outcome: 'success', failing: [], checksSeen: 2 }),
        fix: async () => {
            fixCalls += 1;
            return { ok: true };
        },
        push: async () => ({ ok: true }),
        maxAttempts: 3,
    });

    assert.equal(result.outcome, 'green');
    assert.equal(result.attempts, 0);
    assert.equal(fixCalls, 0);
});

test('runCiFeedbackCycle fixes, pushes, and re-polls until green', async () => {
    const polls: Array<'failure' | 'success'> = ['failure', 'success'];
    const fixSummaries: string[] = [];
    let pushes = 0;

    const result = await runCiFeedbackCycle({
        poll: async () => {
            const outcome = polls.shift() ?? 'success';
            return outcome === 'failure'
                ? { outcome: 'failure', failing: [{ name: 'tests', summary: 'auth.spec failed' }], checksSeen: 1 }
                : { outcome: 'success', failing: [], checksSeen: 1 };
        },
        fix: async (failureSummary) => {
            fixSummaries.push(failureSummary);
            return { ok: true };
        },
        push: async () => {
            pushes += 1;
            return { ok: true };
        },
        maxAttempts: 3,
    });

    assert.equal(result.outcome, 'green');
    assert.equal(result.attempts, 1);
    assert.equal(pushes, 1);
    assert.ok(fixSummaries[0]!.includes('auth.spec failed'));
});

test('runCiFeedbackCycle exhausts after maxAttempts persistent failures', async () => {
    let fixes = 0;
    const result = await runCiFeedbackCycle({
        poll: async () => ({ outcome: 'failure', failing: [{ name: 'tests', summary: 'still broken' }], checksSeen: 1 }),
        fix: async () => {
            fixes += 1;
            return { ok: true };
        },
        push: async () => ({ ok: true }),
        maxAttempts: 2,
    });

    assert.equal(result.outcome, 'exhausted');
    assert.equal(result.attempts, 2);
    assert.equal(fixes, 2);
});

test('runCiFeedbackCycle stops with fix_failed when no fix can be produced', async () => {
    const result = await runCiFeedbackCycle({
        poll: async () => ({ outcome: 'failure', failing: [{ name: 'tests', summary: 'broken' }], checksSeen: 1 }),
        fix: async () => ({ ok: false }),
        push: async () => ({ ok: true }),
        maxAttempts: 3,
    });

    assert.equal(result.outcome, 'fix_failed');
    assert.equal(result.attempts, 1);
});

test('runCiFeedbackCycle passes through no_checks and timed_out outcomes', async () => {
    const noChecks = await runCiFeedbackCycle({
        poll: async () => ({ outcome: 'no_checks', failing: [], checksSeen: 0 }),
        fix: async () => ({ ok: true }),
        push: async () => ({ ok: true }),
    });
    assert.equal(noChecks.outcome, 'no_checks');

    const timedOut = await runCiFeedbackCycle({
        poll: async () => ({ outcome: 'timed_out', failing: [], checksSeen: 1 }),
        fix: async () => ({ ok: true }),
        push: async () => ({ ok: true }),
    });
    assert.equal(timedOut.outcome, 'timed_out');
});
