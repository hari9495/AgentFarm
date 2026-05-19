/**
 * semantic-search-hook.test.ts — unit tests for searchSemanticMemory
 */

import { describe, it, expect, vi } from 'vitest';
import type { EmbedFn } from './embedding-service.js';
import { searchSemanticMemory } from './semantic-search-hook.js';

const MOCK_VECTOR = Array.from({ length: 1536 }, (_, i) => i * 0.001);
const makeEmbed = (): EmbedFn => vi.fn().mockResolvedValue(MOCK_VECTOR);

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
    $queryRaw: vi.fn().mockResolvedValue(rows),
});

describe('searchSemanticMemory', () => {
    it('returns SemanticSearchResult[] on success', async () => {
        const embed = makeEmbed();
        const prisma = makePrisma();
        const results = await searchSemanticMemory(
            { tenantId: 'tenant_1', queryText: 'how is the codebase structured?' },
            embed,
            prisma as never,
        );
        expect(results).toHaveLength(1);
        expect(results[0].similarity).toBeCloseTo(0.92);
        expect(results[0].memory.content).toBe('Company uses TypeScript monorepo.');
        expect(results[0].memory.createdAt).toBe('2026-05-22T00:00:00.000Z');
    });

    it('returns empty array when no matches', async () => {
        const embed = makeEmbed();
        const prisma = makePrisma([]);
        const results = await searchSemanticMemory(
            { tenantId: 'tenant_1', queryText: 'irrelevant query' },
            embed,
            prisma as never,
        );
        expect(results).toHaveLength(0);
    });

    it('calls embed with the queryText', async () => {
        const embed = makeEmbed();
        const prisma = makePrisma();
        await searchSemanticMemory(
            { tenantId: 't', queryText: 'architecture overview' },
            embed,
            prisma as never,
        );
        expect(embed).toHaveBeenCalledWith('architecture overview');
    });

    it('issues two-branch query when botId is provided', async () => {
        const embed = makeEmbed();
        const prisma = makePrisma([mockRow({ botId: 'bot_5' })]);
        const results = await searchSemanticMemory(
            { tenantId: 't', botId: 'bot_5', queryText: 'query' },
            embed,
            prisma as never,
        );
        expect(results[0].memory.botId).toBe('bot_5');
        // Verify $queryRaw was called once (the botId-aware branch)
        expect((prisma.$queryRaw as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    });

    it('maps botId null to null on the result', async () => {
        const embed = makeEmbed();
        const prisma = makePrisma([mockRow({ botId: null })]);
        const results = await searchSemanticMemory(
            { tenantId: 't', queryText: 'q' },
            embed,
            prisma as never,
        );
        expect(results[0].memory.botId).toBeNull();
    });
});
