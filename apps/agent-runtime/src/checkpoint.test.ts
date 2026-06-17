import test from 'node:test';
import assert from 'node:assert/strict';
import { isCheckpointEnabled, injectCheckpointIntoPayload, loadCheckpoint, saveCheckpoint, clearCheckpoint } from './checkpoint.js';
import type { TaskCheckpoint } from './checkpoint.js';

function makeCheckpoint(overrides?: Partial<TaskCheckpoint>): TaskCheckpoint {
    return {
        taskId: 'task-123',
        stepIndex: 1,
        partialOutput: 'I completed steps 1 and 2.',
        actionType: 'code_write',
        savedAt: '2026-06-18T10:00:00.000Z',
        ...overrides,
    };
}

// --- isCheckpointEnabled ---

test('isCheckpointEnabled returns false by default', () => {
    delete process.env['AF_CHECKPOINT_ENABLED'];
    assert.equal(isCheckpointEnabled(), false);
});

test('isCheckpointEnabled returns true when env var is "true"', () => {
    process.env['AF_CHECKPOINT_ENABLED'] = 'true';
    assert.equal(isCheckpointEnabled(), true);
    delete process.env['AF_CHECKPOINT_ENABLED'];
});

test('isCheckpointEnabled returns true when env var is "1"', () => {
    process.env['AF_CHECKPOINT_ENABLED'] = '1';
    assert.equal(isCheckpointEnabled(), true);
    delete process.env['AF_CHECKPOINT_ENABLED'];
});

// --- injectCheckpointIntoPayload: field priority ---

test('injectCheckpointIntoPayload injects into goal_spec when present', () => {
    const ckpt = makeCheckpoint();
    const payload = { goal_spec: 'Write auth module', prompt: 'also a prompt' };
    const result = injectCheckpointIntoPayload(payload, ckpt);
    assert.ok((result['goal_spec'] as string).startsWith('[CHECKPOINT:'));
    assert.ok((result['goal_spec'] as string).includes('Write auth module'));
    assert.equal(result['prompt'], 'also a prompt'); // untouched
});

test('injectCheckpointIntoPayload falls back to prompt when no goal_spec', () => {
    const ckpt = makeCheckpoint();
    const payload = { prompt: 'Do the thing' };
    const result = injectCheckpointIntoPayload(payload, ckpt);
    assert.ok((result['prompt'] as string).startsWith('[CHECKPOINT:'));
    assert.ok((result['prompt'] as string).includes('Do the thing'));
});

test('injectCheckpointIntoPayload falls back to description', () => {
    const ckpt = makeCheckpoint();
    const payload = { description: 'Build feature X' };
    const result = injectCheckpointIntoPayload(payload, ckpt);
    assert.ok((result['description'] as string).startsWith('[CHECKPOINT:'));
});

test('injectCheckpointIntoPayload falls back to summary', () => {
    const ckpt = makeCheckpoint();
    const payload = { summary: 'A brief summary' };
    const result = injectCheckpointIntoPayload(payload, ckpt);
    assert.ok((result['summary'] as string).startsWith('[CHECKPOINT:'));
});

test('injectCheckpointIntoPayload uses prior_checkpoint field when no prompt field found', () => {
    const ckpt = makeCheckpoint();
    const payload = { actionType: 'code_write', tenantId: 't-1' };
    const result = injectCheckpointIntoPayload(payload, ckpt);
    assert.ok(typeof result['prior_checkpoint'] === 'string');
    assert.ok((result['prior_checkpoint'] as string).startsWith('[CHECKPOINT:'));
});

// --- injectCheckpointIntoPayload: content correctness ---

test('injectCheckpointIntoPayload includes step index and timestamp in header', () => {
    const ckpt = makeCheckpoint({ stepIndex: 2, savedAt: '2026-06-18T12:00:00.000Z' });
    const payload = { prompt: 'continue' };
    const result = injectCheckpointIntoPayload(payload, ckpt);
    assert.ok((result['prompt'] as string).includes('step 2'));
    assert.ok((result['prompt'] as string).includes('2026-06-18T12:00:00.000Z'));
});

test('injectCheckpointIntoPayload includes partial output in injected text', () => {
    const ckpt = makeCheckpoint({ partialOutput: 'Files A, B, C complete.' });
    const payload = { prompt: 'task' };
    const result = injectCheckpointIntoPayload(payload, ckpt);
    assert.ok((result['prompt'] as string).includes('Files A, B, C complete.'));
});

test('injectCheckpointIntoPayload truncates partialOutput to 2000 chars', () => {
    const longOutput = 'x'.repeat(3000);
    const ckpt = makeCheckpoint({ partialOutput: longOutput });
    const payload = { prompt: 'task' };
    const result = injectCheckpointIntoPayload(payload, ckpt);
    // the injected prefix should contain at most 2000 x's
    const injected = result['prompt'] as string;
    const xCount = (injected.match(/x/g) ?? []).length;
    assert.equal(xCount, 2000);
});

test('injectCheckpointIntoPayload does not mutate the original payload', () => {
    const ckpt = makeCheckpoint();
    const payload = { prompt: 'original' };
    injectCheckpointIntoPayload(payload, ckpt);
    assert.equal(payload['prompt'], 'original');
});

// --- Redis-backed operations: graceful when no Redis ---

test('loadCheckpoint returns null when Redis is unavailable', async () => {
    const saved = process.env['REDIS_URL'];
    delete process.env['REDIS_URL'];
    const result = await loadCheckpoint('task-xyz');
    assert.equal(result, null);
    if (saved !== undefined) process.env['REDIS_URL'] = saved;
});

test('saveCheckpoint does not throw when Redis is unavailable', async () => {
    const saved = process.env['REDIS_URL'];
    delete process.env['REDIS_URL'];
    await assert.doesNotReject(() => saveCheckpoint(makeCheckpoint()));
    if (saved !== undefined) process.env['REDIS_URL'] = saved;
});

test('clearCheckpoint does not throw when Redis is unavailable', async () => {
    const saved = process.env['REDIS_URL'];
    delete process.env['REDIS_URL'];
    await assert.doesNotReject(() => clearCheckpoint('task-xyz'));
    if (saved !== undefined) process.env['REDIS_URL'] = saved;
});
