/**
 * semantic-write-hook.test.ts — unit tests for writeSemanticMemory
 */

import { describe, it, expect, vi } from 'vitest';
import type { EmbedFn } from './embedding-service.js';
import { writeSemanticMemory } from './semantic-write-hook.js';

const MOCK_VECTOR = Array.from({ length: 1536 }, (_, i) => i * 0.001);

const makeEmbed = (vec = MOCK_VECTOR): EmbedFn =>
    vi.fn().mockResolvedValue(vec);

type MockPrisma = {
    $queryRaw: ReturnType<typeof vi.fn>;
};

const makePrisma = (returnRow: object = {}): MockPrisma => ({
    $queryRaw: vi.fn().mockResolvedValue([
        {
            id: 'cuid_abc',
            tenantId: 'tenant_1',
            botId: null,
            content: 'test content',
            sourceUrl: null,
            sourceType: 'manual',
            embeddingModel: 'text-embedding-3-small',
            createdAt: new Date('2026-05-22T00:00:00.000Z'),
            updatedAt: new Date('2026-05-22T00:00:00.000Z'),
            ...returnRow,
        },
    ]),
});

describe('writeSemanticMemory', () => {
    it('returns a SemanticMemoryRecord on success', async () => {
        const embed = makeEmbed();
        const prisma = makePrisma();
        const result = await writeSemanticMemory(
            { tenantId: 'tenant_1', content: 'test content', sourceType: 'manual' },
            embed,
            prisma as never,
            'text-embedding-3-small',
        );
        expect(result.id).toBe('cuid_abc');
        expect(result.tenantId).toBe('tenant_1');
        expect(result.botId).toBeNull();
        expect(result.content).toBe('test content');
        expect(result.sourceType).toBe('manual');
        expect(result.embeddingModel).toBe('text-embedding-3-small');
        expect(result.createdAt).toBe('2026-05-22T00:00:00.000Z');
    });

    it('calls embed with the content text', async () => {
        const embed = makeEmbed();
        const prisma = makePrisma();
        await writeSemanticMemory(
            { tenantId: 't', content: 'hello world', sourceType: 'document' },
            embed,
            prisma as never,
            'text-embedding-3-small',
        );
        expect(embed).toHaveBeenCalledWith('hello world');
    });

    it('throws if $queryRaw returns no rows', async () => {
        const embed = makeEmbed();
        const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
        await expect(
            writeSemanticMemory(
                { tenantId: 't', content: 'x', sourceType: 'manual' },
                embed,
                prisma as never,
                'model',
            ),
        ).rejects.toThrow('writeSemanticMemory: insert returned no rows');
    });

    it('passes botId and sourceUrl when provided', async () => {
        const embed = makeEmbed();
        const mockRow = {
            id: 'c2', tenantId: 'tenant_x', botId: 'bot_42',
            content: 'bot knowledge', sourceUrl: 'https://example.com',
            sourceType: 'webpage', embeddingModel: 'm',
            createdAt: new Date(), updatedAt: new Date(),
        };
        const prisma = makePrisma(mockRow);
        const result = await writeSemanticMemory(
            { tenantId: 'tenant_x', botId: 'bot_42', content: 'bot knowledge', sourceUrl: 'https://example.com', sourceType: 'webpage' },
            embed,
            prisma as never,
            'm',
        );
        expect(result.botId).toBe('bot_42');
        expect(result.sourceUrl).toBe('https://example.com');
    });
});
