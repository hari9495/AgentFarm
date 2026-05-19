import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeEpisodicMemory } from './episodic-write-hook.js';
import type { EpisodicWriteRequest } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const FAKE_VECTOR = Array.from({ length: 1536 }, (_, i) => i * 0.001);
const stubEmbed = async (_text: string) => FAKE_VECTOR;

function makePrismaStub() {
    const calls: { query: string }[] = [];

    const fakeRow = {
        id: 'mem-001',
        tenantId: 't1',
        workspaceId: 'ws1',
        botId: 'bot1',
        pattern: 'prefers JWT',
        summary: 'Refactored auth to use JWT',
        embeddingModel: 'text-embedding-3-small',
        confidence: 0.85,
        observedCount: 1,
        lastSeen: new Date('2026-05-15T10:00:00Z'),
        createdAt: new Date('2026-05-15T10:00:00Z'),
    };

    return {
        calls,
        prisma: {
            $executeRaw: async (query: TemplateStringsArray, ..._args: unknown[]) => {
                calls.push({ query: query.join('') });
                return 1;
            },
            $queryRaw: async (query: TemplateStringsArray, ..._args: unknown[]) => {
                calls.push({ query: query.join('') });
                return [fakeRow];
            },
        },
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('writeEpisodicMemory', () => {
    const baseRequest: EpisodicWriteRequest = {
        tenantId: 't1',
        botId: 'bot1',
        workspaceId: 'ws1',
        summary: 'Refactored auth to use JWT',
        pattern: 'prefers JWT',
        confidence: 0.85,
        taskId: 'task-123',
    };

    it('calls embed with the request summary', async () => {
        const embedCalls: string[] = [];
        const trackingEmbed = async (text: string) => {
            embedCalls.push(text);
            return FAKE_VECTOR;
        };

        const { prisma } = makePrismaStub();
        await writeEpisodicMemory(baseRequest, trackingEmbed, prisma as never, 'text-embedding-3-small');

        assert.equal(embedCalls.length, 1);
        assert.equal(embedCalls[0], baseRequest.summary);
    });

    it('calls $queryRaw (upsert) exactly once', async () => {
        const { prisma, calls } = makePrismaStub();
        await writeEpisodicMemory(baseRequest, stubEmbed, prisma as never, 'text-embedding-3-small');

        assert.equal(calls.length, 1);
        assert.ok(calls[0].query.includes('INSERT INTO'));
        assert.ok(calls[0].query.includes('ON CONFLICT'));
    });

    it('returns an EpisodicMemoryRecord with correct shape', async () => {
        const { prisma } = makePrismaStub();
        const result = await writeEpisodicMemory(
            baseRequest,
            stubEmbed,
            prisma as never,
            'text-embedding-3-small'
        );

        assert.ok(typeof result.id === 'string');
        assert.equal(result.tenantId, 't1');
        assert.equal(result.botId, 'bot1');
        assert.equal(result.workspaceId, 'ws1');
        assert.equal(result.pattern, 'prefers JWT');
        assert.equal(result.summary, 'Refactored auth to use JWT');
        assert.equal(result.embeddingModel, 'text-embedding-3-small');
        assert.ok(typeof result.confidence === 'number');
        assert.ok(typeof result.observedCount === 'number');
        assert.ok(typeof result.lastSeen === 'string');
        assert.ok(typeof result.createdAt === 'string');
    });

    it('throws when $queryRaw returns empty rows', async () => {
        const prisma = {
            $executeRaw: async () => 0,
            $queryRaw: async () => [],
        };

        await assert.rejects(
            () => writeEpisodicMemory(baseRequest, stubEmbed, prisma as never, 'text-embedding-3-small'),
            (err: Error) => {
                assert.ok(err.message.includes('no rows'));
                return true;
            }
        );
    });
});
