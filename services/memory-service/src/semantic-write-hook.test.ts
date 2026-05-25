/**
 * semantic-write-hook.test.ts — unit tests for writeSemanticMemory
 */

import { describe, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { EmbedFn } from './embedding-service.js';
import { writeSemanticMemory } from './semantic-write-hook.js';

const MOCK_VECTOR = Array.from({ length: 1536 }, (_, i) => i * 0.001);

const makeEmbed = (vec = MOCK_VECTOR): EmbedFn =>
    mock.fn(async () => vec) as unknown as EmbedFn;

const makeBaseRow = (overrides: object = {}) => ({
    id: 'cuid_abc',
    tenantId: 'tenant_1',
    botId: null,
    content: 'test content',
    sourceUrl: null,
    sourceType: 'manual',
    embeddingModel: 'text-embedding-3-small',
    createdAt: new Date('2026-05-22T00:00:00.000Z'),
    updatedAt: new Date('2026-05-22T00:00:00.000Z'),
    ...overrides,
});

const makePrisma = (returnRow: object = {}) => ({
    $queryRaw: mock.fn(async () => [makeBaseRow(returnRow)]),
});

describe('writeSemanticMemory', () => {
    test('returns a SemanticMemoryRecord on success', async () => {
        const embed = makeEmbed();
        const prisma = makePrisma();
        const result = await writeSemanticMemory(
            { tenantId: 'tenant_1', content: 'test content', sourceType: 'manual' },
            embed,
            prisma as never,
            'text-embedding-3-small',
        );
        assert.equal(result.id, 'cuid_abc');
        assert.equal(result.tenantId, 'tenant_1');
        assert.equal(result.botId, null);
        assert.equal(result.content, 'test content');
        assert.equal(result.sourceType, 'manual');
        assert.equal(result.embeddingModel, 'text-embedding-3-small');
        assert.equal(result.createdAt, '2026-05-22T00:00:00.000Z');
    });

    test('calls embed with the content text', async () => {
        const embed = makeEmbed();
        const prisma = makePrisma();
        await writeSemanticMemory(
            { tenantId: 't', content: 'hello world', sourceType: 'document' },
            embed,
            prisma as never,
            'text-embedding-3-small',
        );
        const embedMock = embed as unknown as ReturnType<typeof mock.fn>;
        assert.equal(embedMock.mock.calls[0].arguments[0], 'hello world');
    });

    test('throws if $queryRaw returns no rows', async () => {
        const embed = makeEmbed();
        const prisma = { $queryRaw: mock.fn(async () => []) };
        await assert.rejects(
            async () => writeSemanticMemory(
                { tenantId: 't', content: 'x', sourceType: 'manual' },
                embed,
                prisma as never,
                'model',
            ),
            /writeSemanticMemory: insert returned no rows/,
        );
    });

    test('passes botId and sourceUrl when provided', async () => {
        const embed = makeEmbed();
        const prisma = makePrisma({
            id: 'c2', tenantId: 'tenant_x', botId: 'bot_42',
            content: 'bot knowledge', sourceUrl: 'https://example.com',
            sourceType: 'webpage', embeddingModel: 'm',
        });
        const result = await writeSemanticMemory(
            {
                tenantId: 'tenant_x', botId: 'bot_42',
                content: 'bot knowledge', sourceUrl: 'https://example.com',
                sourceType: 'webpage',
            },
            embed,
            prisma as never,
            'm',
        );
        assert.equal(result.botId, 'bot_42');
        assert.equal(result.sourceUrl, 'https://example.com');
    });
});
