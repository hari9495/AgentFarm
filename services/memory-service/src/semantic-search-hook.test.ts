/**
 * semantic-search-hook.test.ts — unit tests for searchSemanticMemory
 */

import { describe, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { EmbedFn } from './embedding-service.js';
import { searchSemanticMemory } from './semantic-search-hook.js';

const MOCK_VECTOR = Array.from({ length: 1536 }, (_, i) => i * 0.001);
const makeEmbed = (): EmbedFn => mock.fn(async () => MOCK_VECTOR) as unknown as EmbedFn;

const mockRow = (overrides: object = {}) => ({
    id: 'mem_1',
    tenantId: 'tenant_1',
    botId: null,
    content: 'Company uses TypeScript monorepo.',
    sourceUrl: null,
    sourceType: 'document',
    embeddingModel: 'text-embedding-3-small',
    createdAt: new Date('2026-05-22T00:00:00.000Z'),
    updatedAt: new Date('2026-05-22T00:00:00.000Z'),
    similarity: 0.92,
    ...overrides,
});

const makePrisma = (rows: object[] = [mockRow()]) => ({
    $queryRaw: mock.fn(async () => rows),
});

describe('searchSemanticMemory', () => {
    test('returns SemanticSearchResult[] on success', async () => {
        const embed = makeEmbed();
        const prisma = makePrisma();
        const results = await searchSemanticMemory(
            { tenantId: 'tenant_1', queryText: 'how is the codebase structured?' },
            embed,
            prisma as never,
        );
        assert.equal(results.length, 1);
        assert.ok(Math.abs(results[0].similarity - 0.92) < 0.001, 'similarity should be close to 0.92');
        assert.equal(results[0].memory.content, 'Company uses TypeScript monorepo.');
        assert.equal(results[0].memory.createdAt, '2026-05-22T00:00:00.000Z');
    });

    test('returns empty array when no matches', async () => {
        const embed = makeEmbed();
        const prisma = makePrisma([]);
        const results = await searchSemanticMemory(
            { tenantId: 'tenant_1', queryText: 'irrelevant query' },
            embed,
            prisma as never,
        );
        assert.equal(results.length, 0);
    });

    test('calls embed with the queryText', async () => {
        const embed = makeEmbed();
        const prisma = makePrisma();
        await searchSemanticMemory(
            { tenantId: 't', queryText: 'architecture overview' },
            embed,
            prisma as never,
        );
        const embedMock = embed as unknown as ReturnType<typeof mock.fn>;
        assert.equal(embedMock.mock.calls[0].arguments[0], 'architecture overview');
    });

    test('issues one $queryRaw call when botId is provided', async () => {
        const embed = makeEmbed();
        const prisma = makePrisma([mockRow({ botId: 'bot_5' })]);
        const results = await searchSemanticMemory(
            { tenantId: 't', botId: 'bot_5', queryText: 'query' },
            embed,
            prisma as never,
        );
        assert.equal(results[0].memory.botId, 'bot_5');
        assert.equal(prisma.$queryRaw.mock.calls.length, 1);
    });

    test('maps botId null to null on the result', async () => {
        const embed = makeEmbed();
        const prisma = makePrisma([mockRow({ botId: null })]);
        const results = await searchSemanticMemory(
            { tenantId: 't', queryText: 'q' },
            embed,
            prisma as never,
        );
        assert.equal(results[0].memory.botId, null);
    });
});
