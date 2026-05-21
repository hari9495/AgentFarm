import test from 'node:test';
import assert from 'node:assert/strict';
import { writeEpisodicMemoryNoEmbed, searchEpisodicMemoryNoEmbed } from './episodic-text-fallback.js';
import type { EpisodicMemoryRecord, EpisodicSearchResult } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Minimal Prisma stub
// ---------------------------------------------------------------------------

function makePrismaStub(rows: unknown[] = []) {
    return {
        async $executeRaw(_query: TemplateStringsArray, ..._values: unknown[]): Promise<number> {
            return 1;
        },
        async $queryRaw<T>(_query: TemplateStringsArray, ..._values: unknown[]): Promise<T> {
            return rows as T;
        },
    };
}

const SAMPLE_WRITE_REQUEST = {
    tenantId: 'tenant-1',
    botId: 'bot-1',
    workspaceId: 'ws-1',
    summary: 'Fixed a login bug in auth.ts',
    pattern: 'workspace_edit_file',
    confidence: 0.85,
    taskId: 'task-001',
};

const SAMPLE_DB_ROW = {
    id: 'mem-001',
    tenantId: 'tenant-1',
    workspaceId: 'ws-1',
    botId: 'bot-1',
    pattern: 'workspace_edit_file',
    summary: 'Fixed a login bug in auth.ts',
    embeddingModel: 'none:text-search-fallback',
    confidence: 0.85,
    observedCount: 1,
    lastSeen: new Date('2026-05-15T10:00:00Z'),
    createdAt: new Date('2026-05-15T10:00:00Z'),
};

// ---------------------------------------------------------------------------
// writeEpisodicMemoryNoEmbed
// ---------------------------------------------------------------------------

test('writeEpisodicMemoryNoEmbed: returns shaped EpisodicMemoryRecord', async () => {
    const prisma = makePrismaStub([SAMPLE_DB_ROW]);
    const record = await writeEpisodicMemoryNoEmbed(SAMPLE_WRITE_REQUEST, prisma);

    assert.equal(record.tenantId, 'tenant-1');
    assert.equal(record.botId, 'bot-1');
    assert.equal(record.workspaceId, 'ws-1');
    assert.equal(record.pattern, 'workspace_edit_file');
    assert.equal(record.summary, 'Fixed a login bug in auth.ts');
    assert.equal(record.confidence, 0.85);
    assert.equal(record.observedCount, 1);
    assert.equal(record.embeddingModel, 'none:text-search-fallback');
    // lastSeen and createdAt should be ISO strings
    assert.ok(record.lastSeen.includes('2026'), `lastSeen should be ISO string: ${record.lastSeen}`);
});

test('writeEpisodicMemoryNoEmbed: throws when prisma returns empty rows', async () => {
    const prisma = makePrismaStub([]);
    await assert.rejects(
        () => writeEpisodicMemoryNoEmbed(SAMPLE_WRITE_REQUEST, prisma),
        /no row returned/i,
    );
});

test('writeEpisodicMemoryNoEmbed: falls back botId from request when row has null botId', async () => {
    const rowWithNullBot = { ...SAMPLE_DB_ROW, botId: null };
    const prisma = makePrismaStub([rowWithNullBot]);
    const record = await writeEpisodicMemoryNoEmbed(SAMPLE_WRITE_REQUEST, prisma);
    assert.equal(record.botId, 'bot-1'); // from request fallback
});

// ---------------------------------------------------------------------------
// searchEpisodicMemoryNoEmbed
// ---------------------------------------------------------------------------

test('searchEpisodicMemoryNoEmbed: returns shaped EpisodicSearchResult[]', async () => {
    const prisma = makePrismaStub([SAMPLE_DB_ROW]);
    const results = await searchEpisodicMemoryNoEmbed(
        { tenantId: 'tenant-1', botId: 'bot-1', workspaceId: 'ws-1', queryText: 'login bug', topK: 5 },
        prisma,
    );
    assert.equal(results.length, 1);
    const r = results[0] as EpisodicSearchResult;
    assert.equal(r.similarity, 0.5); // fixed text-fallback similarity score
    assert.equal(r.memory.pattern, 'workspace_edit_file');
    assert.equal(r.memory.summary, 'Fixed a login bug in auth.ts');
});

test('searchEpisodicMemoryNoEmbed: returns empty array when no rows match', async () => {
    const prisma = makePrismaStub([]);
    const results = await searchEpisodicMemoryNoEmbed(
        { tenantId: 'tenant-1', botId: 'bot-1', workspaceId: 'ws-1', queryText: 'payment', topK: 5 },
        prisma,
    );
    assert.equal(results.length, 0);
});

test('searchEpisodicMemoryNoEmbed: defaults topK to 5 when not provided', async () => {
    const calls: unknown[][] = [];
    const prisma = {
        async $executeRaw(_q: TemplateStringsArray, ..._v: unknown[]) { return 1; },
        async $queryRaw<T>(_q: TemplateStringsArray, ...values: unknown[]): Promise<T> {
            calls.push(values);
            return [] as T;
        },
    };
    await searchEpisodicMemoryNoEmbed(
        { tenantId: 'tenant-1', botId: 'bot-1', workspaceId: 'ws-1', queryText: 'test' },
        prisma,
    );
    // Verify topK=5 was bound (last value in the template call)
    assert.ok(calls.length > 0, 'prisma.$queryRaw should have been called');
    const boundValues = calls[0] as unknown[];
    assert.ok(boundValues.includes(5), `Expected topK=5 in bound values: ${JSON.stringify(boundValues)}`);
});

test('searchEpisodicMemoryNoEmbed: all result similarities are 0.5', async () => {
    const twoRows = [SAMPLE_DB_ROW, { ...SAMPLE_DB_ROW, id: 'mem-002', summary: 'another fix' }];
    const prisma = makePrismaStub(twoRows);
    const results = await searchEpisodicMemoryNoEmbed(
        { tenantId: 'tenant-1', botId: 'bot-1', workspaceId: 'ws-1', queryText: 'fix', topK: 10 },
        prisma,
    );
    assert.equal(results.length, 2);
    for (const r of results) {
        assert.equal((r as EpisodicSearchResult).similarity, 0.5);
    }
});
