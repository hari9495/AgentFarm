import test from 'node:test';
import assert from 'node:assert/strict';

import { checkAgentShiftWithPrisma } from './shift-gate.js';

function fakePrisma(persona: unknown, createdRows: unknown[]): any {
    return {
        agentPersona: { findUnique: async () => persona },
        deferredTask: {
            create: async ({ data }: any) => {
                createdRows.push(data);
                return { id: 'deferred_1' };
            },
        },
    };
}

test('no agentId — always available (back-compat 24/7)', async () => {
    const result = await checkAgentShiftWithPrisma(fakePrisma(null, []), null, 't1', 'task1', {});
    assert.equal(result.available, true);
});

test('no persona row — always available', async () => {
    const result = await checkAgentShiftWithPrisma(fakePrisma(null, []), 'bot1', 't1', 'task1', {});
    assert.equal(result.available, true);
});

test('persona has no workingHours — always available', async () => {
    const persona = { timezone: 'UTC', workingHours: null };
    const result = await checkAgentShiftWithPrisma(fakePrisma(persona, []), 'bot1', 't1', 'task1', {});
    assert.equal(result.available, true);
});

test('off-shift persona defers the task with the shift-gate envelope', async () => {
    // A 1-minute window exactly 12h opposite "now" (UTC) — never adjacent to
    // the instant the test actually runs, so this can't flake at the boundary.
    const nowUtcMinutes = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
    const oppositeMinutes = (nowUtcMinutes + 12 * 60) % (24 * 60);
    const hm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    const persona = {
        timezone: 'UTC',
        workingHours: { start: hm(oppositeMinutes), end: hm((oppositeMinutes + 1) % (24 * 60)), days: [0, 1, 2, 3, 4, 5, 6] },
    };
    const created: any[] = [];
    const result = await checkAgentShiftWithPrisma(fakePrisma(persona, created), 'bot1', 'tenant1', 'task1', { foo: 'bar' });
    assert.equal(result.available, false);
    assert.equal(created.length, 1);
    assert.equal(created[0].payload.__deferredKind, 'runtime_intake');
    assert.equal(created[0].payload.task_id, 'task1');
    assert.deepEqual(created[0].payload.payload, { foo: 'bar' });
});

test('DB error on persona lookup fails open', async () => {
    const prisma = {
        agentPersona: { findUnique: async () => { throw new Error('db down'); } },
        deferredTask: { create: async () => ({ id: 'x' }) },
    };
    const result = await checkAgentShiftWithPrisma(prisma, 'bot1', 't1', 'task1', {});
    assert.equal(result.available, true);
});
