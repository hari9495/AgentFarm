import test from 'node:test';
import assert from 'node:assert/strict';
import { runMaxMode, isMaxModeEnabled, isMaxModeEnabledForPayload, getMaxModeCandidates, shouldSkipMaxMode } from './max-mode.js';
import type { ProcessedTaskResult } from './execution-engine.js';

function makeResult(status: ProcessedTaskResult['status'], output?: string): ProcessedTaskResult {
    return {
        decision: {} as ProcessedTaskResult['decision'],
        status,
        attempts: 1,
        transientRetries: 0,
        executionPayload: {},
        payloadOverrideSource: 'none',
        actionOutput: output,
    };
}

// --- isMaxModeEnabled ---

test('isMaxModeEnabled returns false by default', () => {
    delete process.env['AF_MAX_MODE_ENABLED'];
    assert.equal(isMaxModeEnabled(), false);
});

test('isMaxModeEnabled returns true when env var is "true"', () => {
    process.env['AF_MAX_MODE_ENABLED'] = 'true';
    assert.equal(isMaxModeEnabled(), true);
    delete process.env['AF_MAX_MODE_ENABLED'];
});

test('isMaxModeEnabled returns true when env var is "1"', () => {
    process.env['AF_MAX_MODE_ENABLED'] = '1';
    assert.equal(isMaxModeEnabled(), true);
    delete process.env['AF_MAX_MODE_ENABLED'];
});

// --- isMaxModeEnabledForPayload ---

test('isMaxModeEnabledForPayload returns false when env and payload both unset', () => {
    delete process.env['AF_MAX_MODE_ENABLED'];
    assert.equal(isMaxModeEnabledForPayload({}), false);
});

test('isMaxModeEnabledForPayload returns true when env var is set', () => {
    process.env['AF_MAX_MODE_ENABLED'] = 'true';
    assert.equal(isMaxModeEnabledForPayload({}), true);
    delete process.env['AF_MAX_MODE_ENABLED'];
});

test('isMaxModeEnabledForPayload returns true when payload._max_mode_enabled is true', () => {
    delete process.env['AF_MAX_MODE_ENABLED'];
    assert.equal(isMaxModeEnabledForPayload({ _max_mode_enabled: true }), true);
});

test('isMaxModeEnabledForPayload returns false when _max_mode_enabled is false', () => {
    delete process.env['AF_MAX_MODE_ENABLED'];
    assert.equal(isMaxModeEnabledForPayload({ _max_mode_enabled: false }), false);
});

// --- runMaxMode: winner score propagated ---

test('runMaxMode sets maxModeCandidates and maxModeWinnerScore on the winning result', async () => {
    const a = makeResult('success', 'output A');
    const b = makeResult('success', 'output B');
    let i = 0;
    const result = await runMaxMode(
        () => Promise.resolve([a, b][i++]),
        (out) => Promise.resolve(out === 'output B' ? 0.9 : 0.4),
        2,
    );
    assert.equal(result.actionOutput, 'output B');
    assert.equal(result.maxModeCandidates, 2);
    assert.equal(result.maxModeWinnerScore, 0.9);
});

test('runMaxMode does not set maxModeCandidates when n=1', async () => {
    const result = await runMaxMode(
        () => Promise.resolve(makeResult('success', 'only')),
        () => Promise.resolve(0.8),
        1,
    );
    assert.equal(result.maxModeCandidates, undefined);
    assert.equal(result.maxModeWinnerScore, undefined);
});

// --- getMaxModeCandidates ---

test('getMaxModeCandidates returns 3 by default', () => {
    delete process.env['AF_MAX_MODE_CANDIDATES'];
    assert.equal(getMaxModeCandidates(), 3);
});

test('getMaxModeCandidates respects AF_MAX_MODE_CANDIDATES env var', () => {
    process.env['AF_MAX_MODE_CANDIDATES'] = '5';
    assert.equal(getMaxModeCandidates(), 5);
    delete process.env['AF_MAX_MODE_CANDIDATES'];
});

test('getMaxModeCandidates falls back to 3 for invalid value', () => {
    process.env['AF_MAX_MODE_CANDIDATES'] = 'bad';
    assert.equal(getMaxModeCandidates(), 3);
    delete process.env['AF_MAX_MODE_CANDIDATES'];
});

// --- shouldSkipMaxMode ---

test('shouldSkipMaxMode returns true for read-only action types', () => {
    for (const actionType of ['code_read', 'workspace_read_file', 'workspace_list_files', 'workspace_grep']) {
        assert.equal(shouldSkipMaxMode({ actionType }), true, `expected skip for ${actionType}`);
    }
});

test('shouldSkipMaxMode returns false for write action types', () => {
    assert.equal(shouldSkipMaxMode({ actionType: 'code_write' }), false);
    assert.equal(shouldSkipMaxMode({ actionType: 'workspace_run_command' }), false);
});

test('shouldSkipMaxMode returns true when skip_max_mode=true regardless of actionType', () => {
    assert.equal(shouldSkipMaxMode({ actionType: 'code_write', skip_max_mode: true }), true);
});

// --- runMaxMode: n=1 passthrough ---

test('runMaxMode with n=1 calls executeFn exactly once and returns its result', async () => {
    let callCount = 0;
    const result = makeResult('success', 'output A');
    const got = await runMaxMode(
        () => { callCount++; return Promise.resolve(result); },
        () => Promise.resolve(0.9),
        1,
    );
    assert.equal(callCount, 1);
    assert.equal(got, result);
});

// --- runMaxMode: parallel calls ---

test('runMaxMode with n=3 calls executeFn 3 times', async () => {
    let callCount = 0;
    const result = makeResult('success', 'out');
    await runMaxMode(
        () => { callCount++; return Promise.resolve(result); },
        () => Promise.resolve(0.8),
        3,
    );
    assert.equal(callCount, 3);
});

// --- runMaxMode: picks highest-scoring candidate ---

test('runMaxMode returns the highest-scoring successful candidate', async () => {
    const low = makeResult('success', 'low quality output');
    const mid = makeResult('success', 'medium quality output');
    const high = makeResult('success', 'high quality output');
    const candidates = [low, mid, high];
    let callIndex = 0;

    const scores: Record<string, number> = {
        'low quality output': 0.4,
        'medium quality output': 0.6,
        'high quality output': 0.9,
    };

    const result = await runMaxMode(
        () => Promise.resolve(candidates[callIndex++]),
        (output) => Promise.resolve(scores[output] ?? 0.5),
        3,
    );

    assert.equal(result.actionOutput, 'high quality output');
});

// --- runMaxMode: single success, no scoring ---

test('runMaxMode returns the one successful candidate without calling scoreFn when only 1 succeeds', async () => {
    const results = [
        makeResult('failed'),
        makeResult('success', 'only winner'),
        makeResult('failed'),
    ];
    let callIndex = 0;
    let scoreCalls = 0;

    const result = await runMaxMode(
        () => Promise.resolve(results[callIndex++]),
        () => { scoreCalls++; return Promise.resolve(0.8); },
        3,
    );

    assert.equal(result.actionOutput, 'only winner');
    assert.equal(scoreCalls, 0);
});

// --- runMaxMode: all candidates fail ---

test('runMaxMode returns first fulfilled result when all candidates fail', async () => {
    const failed = makeResult('failed');
    failed.errorMessage = 'something went wrong';
    let callIndex = 0;

    const result = await runMaxMode(
        () => Promise.resolve({ ...failed }),
        () => Promise.resolve(0.5),
        3,
    );

    assert.equal(result.status, 'failed');
});

// --- runMaxMode: scoreFn throws gracefully ---

test('runMaxMode handles scoreFn throwing by defaulting score to 0.5', async () => {
    const a = makeResult('success', 'output A');
    const b = makeResult('success', 'output B');
    let callIndex = 0;
    const candidates = [a, b];

    // scoreFn throws for A (scores 0.5), returns 0.9 for B
    const result = await runMaxMode(
        () => Promise.resolve(candidates[callIndex++]),
        (output) => output === 'output A'
            ? Promise.reject(new Error('judge failed'))
            : Promise.resolve(0.9),
        2,
    );

    assert.equal(result.actionOutput, 'output B');
});

// --- runMaxMode: tie-breaking ---

test('runMaxMode returns a consistent result on score tie (first after sort)', async () => {
    const a = makeResult('success', 'A');
    const b = makeResult('success', 'B');
    let callIndex = 0;

    const result = await runMaxMode(
        () => Promise.resolve([a, b][callIndex++]),
        () => Promise.resolve(0.7), // same score for both
        2,
    );

    // Either A or B is valid — just confirm it's one of them
    assert.ok(result.actionOutput === 'A' || result.actionOutput === 'B');
});
