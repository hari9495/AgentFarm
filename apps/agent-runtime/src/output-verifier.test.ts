import test from 'node:test';
import assert from 'node:assert/strict';

type FetchCall = { url: string; body: string };
const fetchCalls: FetchCall[] = [];
let fetchShouldThrow = false;

// @ts-expect-error — replace global fetch with test double
globalThis.fetch = async (url: string, init: RequestInit): Promise<Response> => {
    if (fetchShouldThrow) throw new Error('network error');
    fetchCalls.push({ url: url as string, body: init.body as string });
    return { ok: true } as Response;
};

// Import after patching fetch so the module captures the test double
const { storeHeuristicScore, checkEvaluatorResult, purgeStalePendingEntries } = await import('./output-verifier.js');

const META = { tenantId: 't1', workspaceId: 'w1', botId: 'bot-1', actionType: 'workspace_create_pr' };

function resetCalls(): void {
    fetchCalls.length = 0;
    fetchShouldThrow = false;
}

await test('checkEvaluatorResult: returns flagged=false when no heuristic stored', async () => {
    resetCalls();
    const result = await checkEvaluatorResult('unknown-task', 0.5);
    assert.equal(result.flagged, false);
    assert.equal(result.divergence, 0);
});

await test('checkEvaluatorResult: returns flagged=false when divergence is below threshold', async () => {
    resetCalls();
    storeHeuristicScore('task-low', 0.8, META);
    const result = await checkEvaluatorResult('task-low', 0.75);
    assert.equal(result.flagged, false);
    assert.ok(Math.abs(result.divergence - 0.05) < 0.001);
});

await test('checkEvaluatorResult: flags and fires notification when divergence >= 0.3', async () => {
    resetCalls();
    storeHeuristicScore('task-high', 0.9, META);
    const result = await checkEvaluatorResult('task-high', 0.5);
    assert.equal(result.flagged, true);
    assert.ok(Math.abs(result.divergence - 0.4) < 0.001);
    assert.equal(fetchCalls.length, 1);
    const body = JSON.parse(fetchCalls[0]!.body);
    assert.equal(body.eventTrigger, 'quality_divergence');
    assert.equal(body.payload.taskId, 'task-high');
});

await test('checkEvaluatorResult: second call for same task returns no match', async () => {
    resetCalls();
    storeHeuristicScore('task-once', 0.9, META);
    await checkEvaluatorResult('task-once', 0.5);
    const second = await checkEvaluatorResult('task-once', 0.5);
    assert.equal(second.flagged, false);
    assert.equal(second.divergence, 0);
});

await test('checkEvaluatorResult: divergence exactly at 0.3 triggers flag', async () => {
    resetCalls();
    storeHeuristicScore('task-boundary', 0.8, META);
    const result = await checkEvaluatorResult('task-boundary', 0.5);
    assert.equal(result.flagged, true);
});

await test('purgeStalePendingEntries: does not throw on empty or populated map', () => {
    storeHeuristicScore('task-fresh', 0.5, META);
    assert.doesNotThrow(() => purgeStalePendingEntries());
});
