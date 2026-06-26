import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parsePolicyProvenance,
    inferViolationSource,
    recordPolicyViolation,
} from './policy-violation-recorder.js';

// --- parsePolicyProvenance ----------------------------------------------------

test('parsePolicyProvenance extracts id + version', () => {
    const p = parsePolicyProvenance('[POLICY_DENIED] no prod | policy=pol_abc@v3');
    assert.equal(p.matchedPolicyId, 'pol_abc');
    assert.equal(p.policyVersion, 3);
});

test('parsePolicyProvenance handles id with unknown version', () => {
    const p = parsePolicyProvenance('blocked policy=pol_x@v?');
    assert.equal(p.matchedPolicyId, 'pol_x');
    assert.equal(p.policyVersion, undefined);
});

test('parsePolicyProvenance returns empty when absent', () => {
    assert.deepEqual(parsePolicyProvenance('connector action denied'), {});
    assert.deepEqual(parsePolicyProvenance(undefined), {});
});

// --- inferViolationSource -----------------------------------------------------

test('inferViolationSource classifies by markers', () => {
    assert.equal(inferViolationSource('connector salesforce read-only', 'delete'), 'connector');
    assert.equal(inferViolationSource('outside allowed time window', 'deploy'), 'env_time');
    assert.equal(inferViolationSource('not permitted for the role', 'x'), 'role');
    assert.equal(inferViolationSource('something else', 'read_task'), 'runtime');
});

// --- recordPolicyViolation ----------------------------------------------------

function fakePrisma() {
    const created: Record<string, unknown>[] = [];
    return {
        prisma: { policyViolation: { create: async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return { id: 'v1', ...data }; } } },
        created,
    };
}

test('recordPolicyViolation persists with parsed provenance + source', async () => {
    const { prisma, created } = fakePrisma();
    const ok = await recordPolicyViolation({
        tenantId: 't1', workspaceId: 'ws1', botId: 'b1', taskId: 'task1',
        actionType: 'deploy_production', riskLevel: 'high',
        reason: '[POLICY_DENIED] production deploy not permitted | policy=pol_9@v2',
        correlationId: 'corr1',
    }, prisma as never);
    assert.equal(ok, true);
    assert.equal(created.length, 1);
    assert.equal(created[0].matchedPolicyId, 'pol_9');
    assert.equal(created[0].policyVersion, 2);
    assert.equal(created[0].actionType, 'deploy_production');
    assert.equal(created[0].effect, 'deny');
});

test('recordPolicyViolation returns false without tenantId (no write)', async () => {
    const { prisma, created } = fakePrisma();
    const ok = await recordPolicyViolation({ tenantId: '', actionType: 'x', reason: 'y' }, prisma as never);
    assert.equal(ok, false);
    assert.equal(created.length, 0);
});

test('recordPolicyViolation is best-effort (swallows prisma errors)', async () => {
    const prisma = { policyViolation: { create: async () => { throw new Error('db down'); } } };
    const ok = await recordPolicyViolation({ tenantId: 't1', actionType: 'x', reason: 'y' }, prisma as never);
    assert.equal(ok, false);
});
