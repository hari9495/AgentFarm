import test from 'node:test';
import assert from 'node:assert/strict';
import {
    writeMemoryEdge,
    readEdgesFrom,
    readEdgesTo,
    traverseMemoryGraph,
} from './graph.js';
import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// In-memory edge store stub
// ---------------------------------------------------------------------------

type EdgeRow = {
    id: string;
    tenantId: string;
    workspaceId: string;
    fromId: string;
    fromType: string;
    toId: string;
    toType: string;
    edgeType: string;
    agentPrefix: string | null;
    weight: number;
    createdAt: Date;
};

let edgeStore: EdgeRow[] = [];
let seq = 0;

function makeStub(): PrismaClient & { _store: EdgeRow[] } {
    edgeStore = [];
    seq = 0;

    const stub = {
        _store: edgeStore,
        $executeRaw: async (...args: unknown[]) => {
            // args: [TemplateStringsArray, tenantId, wsId, fromId, fromType, toId, toType, edgeType, agentPrefix, weight]
            const tenantId    = args[1] as string;
            const workspaceId = args[2] as string;
            const fromId      = args[3] as string;
            const fromType    = args[4] as string;
            const toId        = args[5] as string;
            const toType      = args[6] as string;
            const edgeType    = args[7] as string;
            const agentPrefix = args[8] as string | null;
            const weight      = args[9] as number;

            // Upsert: check for existing edge
            const existing = edgeStore.find(
                e => e.tenantId === tenantId && e.fromId === fromId && e.toId === toId && e.edgeType === edgeType,
            );
            if (existing) {
                existing.weight = Math.max(existing.weight, weight);
            } else {
                edgeStore.push({
                    id: `edge-${++seq}`,
                    tenantId, workspaceId, fromId, fromType,
                    toId, toType, edgeType, agentPrefix, weight,
                    createdAt: new Date(),
                });
            }
            return 1;
        },
        $queryRaw: async (...args: unknown[]) => {
            // Identify which query (by index of bound params)
            // readEdgesFrom: args[1]=tenantId, args[2]=fromId, args[3]=fromType
            // readEdgesTo:   args[1]=tenantId, args[2]=toId,   args[3]=toType
            const tenantId = args[1] as string;
            const id2      = args[2] as string;
            const type2    = args[3] as string;

            // Check query type by looking at whether the template contains "fromId" or "toId"
            // We detect by checking the 4th arg presence (readEdgesFrom uses fromId/fromType)
            // Simple heuristic: try both directions and return whichever matches
            const fromMatches = edgeStore.filter(
                e => e.tenantId === tenantId && e.fromId === id2 && e.fromType === type2,
            );
            const toMatches = edgeStore.filter(
                e => e.tenantId === tenantId && e.toId === id2 && e.toType === type2,
            );
            // Return from-matches if any, else to-matches (caller knows which they asked for)
            return fromMatches.length > 0 || toMatches.length === 0 ? fromMatches : toMatches;
        },
    } as unknown as PrismaClient & { _store: EdgeRow[] };

    // Keep _store pointing at same array
    Object.defineProperty(stub, '_store', { get: () => edgeStore });
    return stub;
}

// ---------------------------------------------------------------------------
// writeMemoryEdge
// ---------------------------------------------------------------------------

test('writeMemoryEdge — creates an edge', async () => {
    const prisma = makeStub();
    await writeMemoryEdge(prisma, {
        tenantId: 't1', workspaceId: 'ws1',
        fromId: 'doc-1', fromType: 'knowledge',
        toId: 'lesson-1', toType: 'lesson',
        edgeType: 'spawned_lesson',
        agentPrefix: 'ba',
    });
    assert.equal(edgeStore.length, 1);
    assert.equal(edgeStore[0]!.fromId, 'doc-1');
    assert.equal(edgeStore[0]!.toId, 'lesson-1');
    assert.equal(edgeStore[0]!.edgeType, 'spawned_lesson');
    assert.equal(edgeStore[0]!.weight, 1.0);
});

test('writeMemoryEdge — idempotent upsert keeps max weight', async () => {
    const prisma = makeStub();
    await writeMemoryEdge(prisma, {
        tenantId: 't1', workspaceId: 'ws1',
        fromId: 'doc-1', fromType: 'knowledge',
        toId: 'lesson-1', toType: 'lesson',
        edgeType: 'spawned_lesson', weight: 0.5,
    });
    await writeMemoryEdge(prisma, {
        tenantId: 't1', workspaceId: 'ws1',
        fromId: 'doc-1', fromType: 'knowledge',
        toId: 'lesson-1', toType: 'lesson',
        edgeType: 'spawned_lesson', weight: 0.9,
    });
    assert.equal(edgeStore.length, 1);
    assert.equal(edgeStore[0]!.weight, 0.9);
});

test('writeMemoryEdge — different edge type creates separate edge', async () => {
    const prisma = makeStub();
    await writeMemoryEdge(prisma, {
        tenantId: 't1', workspaceId: 'ws1',
        fromId: 'doc-1', fromType: 'knowledge',
        toId: 'doc-2', toType: 'knowledge',
        edgeType: 'derived_from',
    });
    await writeMemoryEdge(prisma, {
        tenantId: 't1', workspaceId: 'ws1',
        fromId: 'doc-1', fromType: 'knowledge',
        toId: 'doc-2', toType: 'knowledge',
        edgeType: 'reinforces',
    });
    assert.equal(edgeStore.length, 2);
});

// ---------------------------------------------------------------------------
// readEdgesFrom
// ---------------------------------------------------------------------------

test('readEdgesFrom — returns outgoing edges for a node', async () => {
    const prisma = makeStub();
    edgeStore.push(
        { id: 'e1', tenantId: 't1', workspaceId: 'ws1', fromId: 'doc-1', fromType: 'knowledge', toId: 'lesson-1', toType: 'lesson', edgeType: 'spawned_lesson', agentPrefix: 'ba', weight: 1.0, createdAt: new Date() },
        { id: 'e2', tenantId: 't1', workspaceId: 'ws1', fromId: 'doc-1', fromType: 'knowledge', toId: 'lesson-2', toType: 'lesson', edgeType: 'spawned_lesson', agentPrefix: 'ba', weight: 1.0, createdAt: new Date() },
        { id: 'e3', tenantId: 't2', workspaceId: 'ws1', fromId: 'doc-1', fromType: 'knowledge', toId: 'lesson-3', toType: 'lesson', edgeType: 'spawned_lesson', agentPrefix: 'ba', weight: 1.0, createdAt: new Date() },
    );
    const edges = await readEdgesFrom(prisma, 't1', 'doc-1', 'knowledge');
    assert.equal(edges.length, 2);
    assert.ok(edges.every(e => e.tenantId === 't1'));
});

test('readEdgesFrom — returns empty array when no edges', async () => {
    const prisma = makeStub();
    const edges = await readEdgesFrom(prisma, 't1', 'nonexistent', 'knowledge');
    assert.equal(edges.length, 0);
});

test('readEdgesFrom — maps createdAt to ISO string', async () => {
    const prisma = makeStub();
    const date = new Date('2026-01-15T12:00:00Z');
    edgeStore.push({ id: 'e1', tenantId: 't1', workspaceId: 'ws1', fromId: 'doc-1', fromType: 'knowledge', toId: 'lesson-1', toType: 'lesson', edgeType: 'spawned_lesson', agentPrefix: null, weight: 1.0, createdAt: date });
    const edges = await readEdgesFrom(prisma, 't1', 'doc-1', 'knowledge');
    assert.equal(edges[0]!.createdAt, date.toISOString());
});

// ---------------------------------------------------------------------------
// readEdgesTo
// ---------------------------------------------------------------------------

test('readEdgesTo — returns incoming edges for a node', async () => {
    const prisma = makeStub();
    edgeStore.push(
        { id: 'e1', tenantId: 't1', workspaceId: 'ws1', fromId: 'doc-1', fromType: 'knowledge', toId: 'lesson-1', toType: 'lesson', edgeType: 'spawned_lesson', agentPrefix: 'ba', weight: 1.0, createdAt: new Date() },
        { id: 'e2', tenantId: 't1', workspaceId: 'ws1', fromId: 'doc-2', fromType: 'knowledge', toId: 'lesson-1', toType: 'lesson', edgeType: 'reinforces',     agentPrefix: 'ba', weight: 0.8, createdAt: new Date() },
    );
    const edges = await readEdgesTo(prisma, 't1', 'lesson-1', 'lesson');
    assert.equal(edges.length, 2);
});

// ---------------------------------------------------------------------------
// traverseMemoryGraph
// ---------------------------------------------------------------------------

test('traverseMemoryGraph — returns empty array for isolated node', async () => {
    const prisma = makeStub();
    const result = await traverseMemoryGraph(prisma, 't1', 'doc-1', 'knowledge', 2);
    assert.equal(result.length, 0);
});

test('traverseMemoryGraph — returns depth-1 nodes', async () => {
    const prisma = makeStub();
    edgeStore.push(
        { id: 'e1', tenantId: 't1', workspaceId: 'ws1', fromId: 'doc-1', fromType: 'knowledge', toId: 'lesson-1', toType: 'lesson', edgeType: 'spawned_lesson', agentPrefix: 'ba', weight: 1.0, createdAt: new Date() },
        { id: 'e2', tenantId: 't1', workspaceId: 'ws1', fromId: 'doc-1', fromType: 'knowledge', toId: 'lesson-2', toType: 'lesson', edgeType: 'spawned_lesson', agentPrefix: 'ba', weight: 0.8, createdAt: new Date() },
    );
    const result = await traverseMemoryGraph(prisma, 't1', 'doc-1', 'knowledge', 2);
    assert.equal(result.length, 2);
    assert.ok(result.every(n => n.depth === 1));
    assert.ok(result.every(n => n.edgeType === 'spawned_lesson'));
});

test('traverseMemoryGraph — respects maxDepth', async () => {
    const prisma = makeStub();
    // doc-1 → lesson-1 → doc-2 (2 hops)
    edgeStore.push(
        { id: 'e1', tenantId: 't1', workspaceId: 'ws1', fromId: 'doc-1',    fromType: 'knowledge', toId: 'lesson-1', toType: 'lesson',    edgeType: 'spawned_lesson', agentPrefix: 'ba', weight: 1.0, createdAt: new Date() },
        { id: 'e2', tenantId: 't1', workspaceId: 'ws1', fromId: 'lesson-1', fromType: 'lesson',    toId: 'doc-2',    toType: 'knowledge', edgeType: 'derived_from',   agentPrefix: 'pm', weight: 0.9, createdAt: new Date() },
    );
    const depth1 = await traverseMemoryGraph(prisma, 't1', 'doc-1', 'knowledge', 1);
    assert.equal(depth1.length, 1);
    assert.equal(depth1[0]!.id, 'lesson-1');

    const depth2 = await traverseMemoryGraph(prisma, 't1', 'doc-1', 'knowledge', 2);
    assert.equal(depth2.length, 2);
});

test('traverseMemoryGraph — handles cycles without infinite loop', async () => {
    const prisma = makeStub();
    // doc-1 → lesson-1 → doc-1 (cycle)
    edgeStore.push(
        { id: 'e1', tenantId: 't1', workspaceId: 'ws1', fromId: 'doc-1',    fromType: 'knowledge', toId: 'lesson-1', toType: 'lesson',    edgeType: 'spawned_lesson', agentPrefix: 'ba', weight: 1.0, createdAt: new Date() },
        { id: 'e2', tenantId: 't1', workspaceId: 'ws1', fromId: 'lesson-1', fromType: 'lesson',    toId: 'doc-1',    toType: 'knowledge', edgeType: 'derived_from',   agentPrefix: 'ba', weight: 0.5, createdAt: new Date() },
    );
    const result = await traverseMemoryGraph(prisma, 't1', 'doc-1', 'knowledge', 5);
    // doc-1 is already visited so lesson-1's back-edge is ignored
    assert.equal(result.length, 1);
    assert.equal(result[0]!.id, 'lesson-1');
});
