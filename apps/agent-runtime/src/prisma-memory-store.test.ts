import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrismaMemoryStore } from './prisma-memory-store.js';
import { getRoleSystemPrompt } from './role-system-prompts.js';

// ---------------------------------------------------------------------------
// Helpers — build mock Prisma clients
// ---------------------------------------------------------------------------

function makeWritePrisma(overrides: { create?: unknown; upsert?: unknown } = {}) {
    let createCallCount = 0;
    let createCallArgs: unknown = undefined;
    const create = async (args: unknown) => {
        createCallCount += 1;
        createCallArgs = args;
        if (overrides.create instanceof Error) throw overrides.create;
        return {};
    };
    const upsert = async () => {
        if (overrides.upsert instanceof Error) throw overrides.upsert;
        return {};
    };
    return {
        prisma: {
            agentShortTermMemory: { create, upsert },
            agentLongTermMemory: { upsert },
        } as unknown as import('@prisma/client').PrismaClient,
        getCreateCallCount: () => createCallCount,
        getCreateCallArgs: () => createCallArgs,
    };
}

function makeReadPrisma(records: unknown[], fail = false) {
    return {
        agentShortTermMemory: {
            findMany: async () => {
                if (fail) throw new Error('db_error');
                return records;
            },
            create: async () => ({}),
            upsert: async () => ({}),
        },
        agentLongTermMemory: {
            upsert: async () => ({}),
        },
    } as unknown as import('@prisma/client').PrismaClient;
}

const baseRequest = {
    workspaceId: 'ws-001',
    tenantId: 'tenant-001',
    taskId: 'task-001',
    actionsTaken: ['code_edit'],
    approvalOutcomes: [{ action: 'code_edit', decision: 'approved' as const }],
    connectorsUsed: ['github'],
    llmProvider: 'anthropic',
    executionStatus: 'success' as const,
    summary: 'Refactored auth module',
    correlationId: 'corr-001',
};

// ---------------------------------------------------------------------------
// Test 1: writeMemoryAfterTask calls prisma.agentShortTermMemory.create
// ---------------------------------------------------------------------------

test('writeMemoryAfterTask calls agentShortTermMemory.create once with correct fields', async () => {
    const { prisma, getCreateCallCount, getCreateCallArgs } = makeWritePrisma();
    const store = createPrismaMemoryStore(prisma);
    await store.writeMemoryAfterTask(baseRequest);
    assert.strictEqual(getCreateCallCount(), 1);
    const args = getCreateCallArgs() as { data: Record<string, unknown> };
    assert.strictEqual(args.data['workspaceId'], 'ws-001');
    assert.strictEqual(args.data['tenantId'], 'tenant-001');
});

// ---------------------------------------------------------------------------
// Test 2: writeMemoryAfterTask does not throw when prisma.create rejects
// ---------------------------------------------------------------------------

test('writeMemoryAfterTask resolves without throwing when create rejects', async () => {
    const { prisma } = makeWritePrisma({ create: new Error('prisma_create_failed') });
    const store = createPrismaMemoryStore(prisma);
    await assert.doesNotReject(() => store.writeMemoryAfterTask(baseRequest));
});

// ---------------------------------------------------------------------------
// Test 3: readMemoryForTask returns safe defaults on prisma error
// ---------------------------------------------------------------------------

test('readMemoryForTask returns safe empty defaults when findMany rejects', async () => {
    const prisma = makeReadPrisma([], /* fail */ true);
    const store = createPrismaMemoryStore(prisma);
    const result = await store.readMemoryForTask('ws-001');
    assert.deepEqual(result.recentMemories, []);
    assert.strictEqual(result.memoryCountThisWeek, 0);
    assert.deepEqual(result.mostCommonConnectors, []);
    assert.strictEqual(result.approvalRejectionRate, 0);
});

// ---------------------------------------------------------------------------
// Test 4: readMemoryForTask computes approvalRejectionRate correctly
// ---------------------------------------------------------------------------

test('readMemoryForTask computes approvalRejectionRate = 0.5 for 2 rejected of 4', async () => {
    const records = [
        { approvalOutcomes: [{ decision: 'rejected' }], connectorsUsed: [], actionsTaken: ['code_edit'], executionStatus: 'failed', createdAt: new Date() },
        { approvalOutcomes: [{ decision: 'rejected' }], connectorsUsed: [], actionsTaken: ['code_edit'], executionStatus: 'failed', createdAt: new Date() },
        { approvalOutcomes: [{ decision: 'approved' }], connectorsUsed: [], actionsTaken: ['code_edit'], executionStatus: 'success', createdAt: new Date() },
        { approvalOutcomes: [{ decision: 'approved' }], connectorsUsed: [], actionsTaken: ['code_edit'], executionStatus: 'success', createdAt: new Date() },
    ];
    const prisma = makeReadPrisma(records);
    const store = createPrismaMemoryStore(prisma);
    const result = await store.readMemoryForTask('ws-001');
    assert.strictEqual(result.approvalRejectionRate, 0.5);
});

// ---------------------------------------------------------------------------
// Test 5: readMemoryForTask returns mostCommonConnectors top 3 in order
// ---------------------------------------------------------------------------

test('readMemoryForTask returns mostCommonConnectors with most frequent first', async () => {
    const records = [
        { approvalOutcomes: [], connectorsUsed: ['github', 'github', 'jira'], actionsTaken: ['code_edit'], executionStatus: 'success', createdAt: new Date() },
        { approvalOutcomes: [], connectorsUsed: ['slack', 'github'], actionsTaken: ['code_edit'], executionStatus: 'success', createdAt: new Date() },
    ];
    const prisma = makeReadPrisma(records);
    const store = createPrismaMemoryStore(prisma);
    const result = await store.readMemoryForTask('ws-001');
    // github appears 3x, jira 1x, slack 1x
    assert.strictEqual(result.mostCommonConnectors[0], 'github');
    assert.ok(result.mostCommonConnectors.length <= 3);
});

// ---------------------------------------------------------------------------
// Test 6: getRoleSystemPrompt with repoName includes repo line
// ---------------------------------------------------------------------------

test('getRoleSystemPrompt with repoName appends repo scope line', () => {
    const prompt = getRoleSystemPrompt('developer', 'AgentFarm');
    assert.ok(prompt.includes('Current repo: AgentFarm'), `Expected prompt to include repo line but got: ${prompt.slice(-200)}`);
});

// ---------------------------------------------------------------------------
// Test 7: getRoleSystemPrompt without repoName does not include repo line
// ---------------------------------------------------------------------------

test('getRoleSystemPrompt without repoName does not include repo scope line', () => {
    const prompt = getRoleSystemPrompt('developer');
    assert.ok(!prompt.includes('Current repo:'), `Expected no repo line but got: ${prompt.slice(-200)}`);
});
