/**
 * knowledge-base.test.ts — unit tests for the knowledge-base routes
 * Uses node:test + assert (api-gateway convention — no vitest).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerKnowledgeBaseRoutes, type RegisterKnowledgeBaseRoutesOptions } from './knowledge-base.js';
import type { EmbedFn } from '@agentfarm/memory-service';
import type { PrismaClient } from '@prisma/client';

// ── stub implementations injected into routes ─────────────────────────────

const mockRecord = {
    id: 'uid-1',
    tenantId: 'tenant_1',
    botId: null,
    content: 'AgentFarm uses TypeScript.',
    sourceUrl: null,
    sourceType: 'document',
    embeddingModel: 'text-embedding-3-small',
    createdAt: '2026-05-22T00:00:00.000Z',
    updatedAt: '2026-05-22T00:00:00.000Z',
};

const mockResults = [{ memory: mockRecord, similarity: 0.91 }];

let writeResult: unknown = mockRecord;
let searchResult: unknown[] = mockResults;

// Overridable stubs for write/search hooks — injected via module-level
// variables because node:test does not have vi.mock.
const mockWrite = async () => writeResult;
const mockSearch = async () => searchResult;

const mockEmbed: EmbedFn = async () => Array<number>(1536).fill(0.1);

const session = {
    userId: 'u1',
    tenantId: 'tenant_1',
    workspaceIds: [] as string[],
    expiresAt: Date.now() + 3_600_000,
};

const makePrisma = () => ({} as PrismaClient);

// Build a fresh app instance for each test
const makeApp = (sess: typeof session | null, embed: EmbedFn | null = mockEmbed) => {
    const app = Fastify({ logger: false });
    const opts: RegisterKnowledgeBaseRoutesOptions = {
        getSession: () => sess,
        embedFn: embed,
        embeddingDeployment: 'text-embedding-3-small',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _writeHook: mockWrite as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _searchHook: mockSearch as any,
    };
    registerKnowledgeBaseRoutes(app, makePrisma(), opts);
    return app;
};

// ── write route ──────────────────────────────────────────────────────────────

test('POST /v1/knowledge-base/write — 401 when no session', async () => {
    const app = makeApp(null);
    const res = await app.inject({
        method: 'POST', url: '/v1/knowledge-base/write',
        payload: { content: 'x', sourceType: 'manual' },
    });
    await app.close();
    assert.equal(res.statusCode, 401);
});

test('POST /v1/knowledge-base/write — 503 when embedFn is null', async () => {
    const app = makeApp(session, null);
    const res = await app.inject({
        method: 'POST', url: '/v1/knowledge-base/write',
        payload: { content: 'x', sourceType: 'manual' },
    });
    await app.close();
    assert.equal(res.statusCode, 503);
});

test('POST /v1/knowledge-base/write — 400 when content is missing', async () => {
    const app = makeApp(session);
    const res = await app.inject({
        method: 'POST', url: '/v1/knowledge-base/write',
        payload: { sourceType: 'document' },
    });
    await app.close();
    assert.equal(res.statusCode, 400);
});

test('POST /v1/knowledge-base/write — 400 when sourceType is missing', async () => {
    const app = makeApp(session);
    const res = await app.inject({
        method: 'POST', url: '/v1/knowledge-base/write',
        payload: { content: 'some text' },
    });
    await app.close();
    assert.equal(res.statusCode, 400);
});

test('POST /v1/knowledge-base/write — 201 with persisted record', async () => {
    writeResult = mockRecord;
    const app = makeApp(session);
    const res = await app.inject({
        method: 'POST', url: '/v1/knowledge-base/write',
        payload: { content: 'AgentFarm uses TypeScript.', sourceType: 'document' },
    });
    await app.close();
    assert.equal(res.statusCode, 201);
    const body = res.json<{ record: typeof mockRecord }>();
    assert.equal(body.record.id, 'uid-1');
    assert.equal(body.record.content, 'AgentFarm uses TypeScript.');
});

// ── search route ─────────────────────────────────────────────────────────────

test('POST /v1/knowledge-base/search — 401 when no session', async () => {
    const app = makeApp(null);
    const res = await app.inject({
        method: 'POST', url: '/v1/knowledge-base/search',
        payload: { queryText: 'hello' },
    });
    await app.close();
    assert.equal(res.statusCode, 401);
});

test('POST /v1/knowledge-base/search — 503 when embedFn is null', async () => {
    const app = makeApp(session, null);
    const res = await app.inject({
        method: 'POST', url: '/v1/knowledge-base/search',
        payload: { queryText: 'hello' },
    });
    await app.close();
    assert.equal(res.statusCode, 503);
});

test('POST /v1/knowledge-base/search — 400 when queryText is missing', async () => {
    const app = makeApp(session);
    const res = await app.inject({
        method: 'POST', url: '/v1/knowledge-base/search',
        payload: {},
    });
    await app.close();
    assert.equal(res.statusCode, 400);
});

test('POST /v1/knowledge-base/search — 200 with results array', async () => {
    searchResult = mockResults;
    const app = makeApp(session);
    const res = await app.inject({
        method: 'POST', url: '/v1/knowledge-base/search',
        payload: { queryText: 'architecture' },
    });
    await app.close();
    assert.equal(res.statusCode, 200);
    const body = res.json<{ results: typeof mockResults }>();
    assert.equal(body.results.length, 1);
    assert.ok(body.results[0]!.similarity > 0.9);
});

