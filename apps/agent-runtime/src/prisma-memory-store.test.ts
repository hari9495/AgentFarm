import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrismaMemoryStore, searchMemory } from './prisma-memory-store.js';
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

// ===========================================================================
// Tests 8–16: searchMemory + scoreText
// ===========================================================================

// Helper: build a minimal Prisma mock for searchMemory
function makeSearchPrisma(opts: {
    shortRows?: Array<{ id: string; summary: string; repoName: string | null; createdAt: Date }>;
    longRows?: Array<{ id: string; pattern: string; repoName: string | null; createdAt: Date }>;
    repoRows?: Array<{ id: string; key: string; value: unknown; repoName: string | null; createdAt: Date }>;
    shortCapture?: { where: unknown } | null;
} = {}) {
    const shortRows = opts.shortRows ?? [];
    const longRows = opts.longRows ?? [];
    const repoRows = opts.repoRows ?? [];
    let capturedShortWhere: unknown = undefined;
    return {
        __getShortWhere: () => capturedShortWhere,
        agentShortTermMemory: {
            findMany: async (args: { where: unknown }) => {
                capturedShortWhere = args.where;
                return shortRows;
            },
        },
        agentLongTermMemory: {
            findMany: async () => longRows,
        },
        agentRepoKnowledge: {
            findMany: async () => repoRows,
        },
    } as unknown as import('@prisma/client').PrismaClient;
}

// Test 8: scoreText — exact phrase match scores highest
test('scoreText: exact match of full phrase adds 0.5 base bonus', async () => {
    // scoreText is not exported — validate indirectly via searchMemory results
    const recentDate = new Date();
    const prisma = makeSearchPrisma({
        shortRows: [
            { id: 'a', summary: 'auth token refresh logic', repoName: null, createdAt: recentDate },
            { id: 'b', summary: 'something unrelated', repoName: null, createdAt: recentDate },
        ],
        types: undefined,
    } as Parameters<typeof makeSearchPrisma>[0]);
    const results = await searchMemory(
        { tenantId: 't1', query: 'auth token refresh logic', types: ['short'] },
        prisma,
    );
    assert.ok(results.length >= 1, 'expected at least 1 result');
    assert.equal(results[0].id, 'a', 'exact phrase match should rank first');
});

// Test 9: scoreText — no match scores 0 → filtered out
test('scoreText: zero-score rows are filtered from results', async () => {
    const prisma = makeSearchPrisma({
        shortRows: [
            { id: 'x', summary: 'completely unrelated zebra content', repoName: null, createdAt: new Date() },
        ],
    });
    const results = await searchMemory(
        { tenantId: 't1', query: 'banana split', types: ['short'] },
        prisma,
    );
    assert.equal(results.length, 0);
});

// Test 10: scoreText — score never exceeds 1
test('scoreText: score is capped at 1.0 even with recency boost', async () => {
    const prisma = makeSearchPrisma({
        shortRows: [
            { id: 'r', summary: 'exact exact exact exact exact', repoName: null, createdAt: new Date() },
        ],
    });
    const results = await searchMemory(
        { tenantId: 't1', query: 'exact', types: ['short'] },
        prisma,
    );
    assert.ok(results.length === 1);
    assert.ok(results[0].score <= 1, `score ${results[0].score} should be <= 1`);
});

// Test 11: searchMemory — types=['short'] only calls agentShortTermMemory
test('searchMemory: returns short results when types=[short]', async () => {
    let longCalled = false;
    let repoCalled = false;
    const prisma = {
        agentShortTermMemory: {
            findMany: async () => [{ id: 's1', summary: 'auth token', repoName: null, createdAt: new Date() }],
        },
        agentLongTermMemory: { findMany: async () => { longCalled = true; return []; } },
        agentRepoKnowledge: { findMany: async () => { repoCalled = true; return []; } },
    } as unknown as import('@prisma/client').PrismaClient;

    const results = await searchMemory(
        { tenantId: 't1', query: 'auth', types: ['short'] },
        prisma,
    );
    assert.ok(results.length >= 1);
    assert.equal(results[0].type, 'short');
    assert.equal(longCalled, false, 'long-term findMany should not be called');
    assert.equal(repoCalled, false, 'repo findMany should not be called');
});

// Test 12: searchMemory — repoName filter is forwarded to findMany
test('searchMemory: repoName filter is passed in where clause', async () => {
    let capturedWhere: Record<string, unknown> = {};
    const prisma = {
        agentShortTermMemory: {
            findMany: async (args: { where: Record<string, unknown> }) => {
                capturedWhere = args.where;
                return [];
            },
        },
        agentLongTermMemory: { findMany: async () => [] },
        agentRepoKnowledge: { findMany: async () => [] },
    } as unknown as import('@prisma/client').PrismaClient;

    await searchMemory(
        { tenantId: 't1', query: 'deploy', repoName: 'repo-a', types: ['short'] },
        prisma,
    );
    assert.equal((capturedWhere as { repoName?: string }).repoName, 'repo-a');
});

// Test 13: searchMemory — results sorted by score DESC
test('searchMemory: results sorted by score descending', async () => {
    const recentDate = new Date();
    const prisma = makeSearchPrisma({
        shortRows: [
            { id: 'partial', summary: 'auth something', repoName: null, createdAt: recentDate },
            { id: 'full', summary: 'auth token', repoName: null, createdAt: recentDate },
        ],
    });
    const results = await searchMemory(
        { tenantId: 't1', query: 'auth token', types: ['short'] },
        prisma,
    );
    assert.ok(results.length >= 2);
    assert.ok(results[0].score >= results[1].score, 'first result should have higher or equal score');
});

// Test 14: searchMemory — limit respected
test('searchMemory: limit is respected', async () => {
    const recentDate = new Date();
    const manyRows = Array.from({ length: 5 }, (_, i) => ({
        id: `r${i}`,
        summary: 'auth token logic',
        repoName: null,
        createdAt: recentDate,
    }));
    const prisma = makeSearchPrisma({ shortRows: manyRows });
    const results = await searchMemory(
        { tenantId: 't1', query: 'auth', types: ['short'], limit: 2 },
        prisma,
    );
    assert.equal(results.length, 2);
});

// Test 15: searchMemory — recency boost: recent row scores higher than old row with identical text
// Use a partial-match query so base score < 0.9, giving recency boost room to lift the recent row
test('searchMemory: recency boost lifts score for rows within 7 days', async () => {
    const recentDate = new Date();
    const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // summary="auth commit", query="auth deploy" → only "auth" token matches → base score = 0.25
    const prisma = makeSearchPrisma({
        shortRows: [
            { id: 'old', summary: 'auth commit', repoName: null, createdAt: oldDate },
            { id: 'recent', summary: 'auth commit', repoName: null, createdAt: recentDate },
        ],
    });
    const results = await searchMemory(
        { tenantId: 't1', query: 'auth deploy', types: ['short'] },
        prisma,
    );
    const recentResult = results.find((r) => r.id === 'recent');
    const oldResult = results.find((r) => r.id === 'old');
    assert.ok(recentResult && oldResult, 'both rows should appear in results');
    assert.ok(recentResult.score > oldResult.score, 'recent row should score higher');
});

// Test 16: searchMemory — repo type: key+value text is searched
test('searchMemory: repo type searches key and JSON-stringified value', async () => {
    const prisma = {
        agentShortTermMemory: { findMany: async () => [] },
        agentLongTermMemory: { findMany: async () => [] },
        agentRepoKnowledge: {
            findMany: async () => [
                { id: 'k1', key: 'deploy-config', value: { environment: 'staging' }, repoName: 'repo-x', createdAt: new Date() },
            ],
        },
    } as unknown as import('@prisma/client').PrismaClient;

    const results = await searchMemory(
        { tenantId: 't1', query: 'staging', types: ['repo'] },
        prisma,
    );
    assert.ok(results.length === 1);
    assert.equal(results[0].type, 'repo');
    assert.equal(results[0].id, 'k1');
    assert.deepEqual((results[0].metadata as { key: string }).key, 'deploy-config');
});
