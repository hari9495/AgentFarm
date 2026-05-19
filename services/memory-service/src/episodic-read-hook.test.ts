import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { searchEpisodicMemory } from './episodic-read-hook.js';
import type { EpisodicSearchRequest } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const FAKE_VECTOR = Array.from({ length: 1536 }, (_, i) => i * 0.001);
const stubEmbed = async (_text: string) => FAKE_VECTOR;

function makeRow(similarity: number, pattern: string, summary: string) {
    return {
        id: `mem-${pattern.slice(0, 4)}`,
        tenantId: 't1',
        workspaceId: 'ws1',
        botId: 'bot1',
        pattern,
        summary,
        embeddingModel: 'text-embedding-3-small',
        confidence: 0.8,
        observedCount: 2,
        lastSeen: new Date('2026-05-15T10:00:00Z'),
        createdAt: new Date('2026-05-10T08:00:00Z'),
        similarity,
    };
}

function makePrismaStub(rows: ReturnType<typeof makeRow>[]) {
    return {
        $queryRaw: async <T>(_query: TemplateStringsArray, ..._args: unknown[]) => rows as unknown as T,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('searchEpisodicMemory', () => {
    const baseRequest: EpisodicSearchRequest = {
        tenantId: 't1',
        botId: 'bot1',
        workspaceId: 'ws1',
        queryText: 'refactor JWT authentication',
    };

    it('returns EpisodicSearchResult array with correct shape', async () => {
        const rows = [makeRow(0.92, 'prefers JWT', 'Refactored auth to JWT'), makeRow(0.81, 'runs tests after', 'Fixed unit tests in auth.ts')];
        const prisma = makePrismaStub(rows);

        const results = await searchEpisodicMemory(baseRequest, stubEmbed, prisma as never);

        assert.equal(results.length, 2);
        assert.ok(typeof results[0].similarity === 'number');
        assert.ok(typeof results[0].memory.id === 'string');
        assert.ok(typeof results[0].memory.lastSeen === 'string');
        assert.ok(typeof results[0].memory.createdAt === 'string');
    });

    it('returns empty array when no rows match', async () => {
        const prisma = makePrismaStub([]);
        const results = await searchEpisodicMemory(baseRequest, stubEmbed, prisma as never);
        assert.deepEqual(results, []);
    });

    it('calls embed with the queryText', async () => {
        const embedCalls: string[] = [];
        const trackingEmbed = async (text: string) => {
            embedCalls.push(text);
            return FAKE_VECTOR;
        };

        const prisma = makePrismaStub([]);
        await searchEpisodicMemory(baseRequest, trackingEmbed, prisma as never);

        assert.equal(embedCalls.length, 1);
        assert.equal(embedCalls[0], baseRequest.queryText);
    });

    it('respects topK from request', async () => {
        // $queryRaw is responsible for enforcing LIMIT in SQL; we verify it's called once regardless
        let capturedQuery = '';
        const prisma = {
            $queryRaw: async (query: TemplateStringsArray, ..._args: unknown[]) => {
                capturedQuery = query.join('');
                return [];
            },
        };

        await searchEpisodicMemory(
            { ...baseRequest, topK: 3 },
            stubEmbed,
            prisma as never
        );

        // The query template must include LIMIT interpolation site
        assert.ok(capturedQuery.includes('LIMIT'));
    });

    it('converts Date objects to ISO strings in returned records', async () => {
        const row = makeRow(0.88, 'some pattern', 'some summary');
        const prisma = makePrismaStub([row]);

        const results = await searchEpisodicMemory(baseRequest, stubEmbed, prisma as never);

        assert.equal(results[0].memory.lastSeen, '2026-05-15T10:00:00.000Z');
        assert.equal(results[0].memory.createdAt, '2026-05-10T08:00:00.000Z');
    });
});
