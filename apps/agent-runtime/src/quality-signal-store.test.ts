import test from 'node:test';
import assert from 'node:assert/strict';
import { persistQualitySignal, loadRecentQualityScores } from './quality-signal-store.js';
import type { QualitySignalEvent } from './llm-quality-tracker.js';

const makeEvent = (overrides: Partial<QualitySignalEvent> = {}): QualitySignalEvent => ({
    id: 'evt-1',
    provider: 'openai',
    actionType: 'workspace_code_review',
    score: 0.85,
    source: 'runtime_outcome',
    observedAt: new Date().toISOString(),
    taskId: 'task-1',
    ...overrides,
});

type CreateCall = { data: Record<string, unknown> };

function makePrisma(rows: Array<{ score: number | null; recordedAt: Date; metadata: unknown }> = []) {
    const calls: CreateCall[] = [];
    return {
        calls,
        qualitySignalLog: {
            create: async (args: CreateCall) => { calls.push(args); },
            findMany: async () => rows,
        },
    };
}

await test('persistQualitySignal: writes all expected fields to the DB', async () => {
    const prisma = makePrisma();
    const event = makeEvent({ signal: 'action_succeeded', weight: 0.9, reason: 'tests passed' });
    await persistQualitySignal(prisma as never, event, { tenantId: 't1', workspaceId: 'w1' });

    assert.equal(prisma.calls.length, 1);
    const { data } = prisma.calls[0]!;
    assert.equal(data['tenantId'], 't1');
    assert.equal(data['workspaceId'], 'w1');
    assert.equal(data['taskId'], 'task-1');
    assert.equal(data['score'], 0.85);
    assert.equal(data['source'], 'runtime_outcome');
    const meta = data['metadata'] as Record<string, unknown>;
    assert.equal(meta['provider'], 'openai');
    assert.equal(meta['actionType'], 'workspace_code_review');
});

await test('persistQualitySignal: stores null taskId when event has no taskId', async () => {
    const prisma = makePrisma();
    await persistQualitySignal(prisma as never, makeEvent({ taskId: undefined }), { tenantId: 't1', workspaceId: 'w1' });
    assert.equal(prisma.calls[0]!.data['taskId'], null);
});

await test('loadRecentQualityScores: returns scores matching provider and actionType', async () => {
    const rows = [
        { score: 0.7, recordedAt: new Date(), metadata: { provider: 'openai', actionType: 'workspace_code_review' } },
        { score: 0.9, recordedAt: new Date(), metadata: { provider: 'openai', actionType: 'workspace_code_review' } },
        { score: 0.5, recordedAt: new Date(), metadata: { provider: 'anthropic', actionType: 'workspace_code_review' } },
    ];
    const prisma = makePrisma(rows);
    const results = await loadRecentQualityScores(prisma as never, 'openai', 'workspace_code_review');
    assert.equal(results.length, 2);
    assert.deepEqual(results.map((r) => r.score), [0.7, 0.9]);
});

await test('loadRecentQualityScores: filters out null scores', async () => {
    const rows = [{ score: null, recordedAt: new Date(), metadata: { provider: 'openai', actionType: 'act' } }];
    const prisma = makePrisma(rows);
    const results = await loadRecentQualityScores(prisma as never, 'openai', 'act');
    assert.equal(results.length, 0);
});

await test('loadRecentQualityScores: is case-insensitive for provider and actionType', async () => {
    const rows = [{ score: 0.8, recordedAt: new Date(), metadata: { provider: 'openai', actionType: 'workspace_act' } }];
    const prisma = makePrisma(rows);
    const results = await loadRecentQualityScores(prisma as never, 'OpenAI', 'WORKSPACE_ACT');
    assert.equal(results.length, 1);
});
