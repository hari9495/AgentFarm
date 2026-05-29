/**
 * knowledge-base.test.ts — unit tests for the knowledge-base routes
 * Uses node:test + assert (api-gateway convention — no vitest).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { registerKnowledgeBaseRoutes, type RegisterKnowledgeBaseRoutesOptions } from './knowledge-base.js';
import type { EmbedFn } from '@agentfarm/memory-service';
import type { SemanticWriteRequest } from '@agentfarm/shared-types';
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
let capturedWriteReq: SemanticWriteRequest | undefined;

const mockWrite = async (req: SemanticWriteRequest) => {
    capturedWriteReq = req;
    return writeResult;
};
const mockSearch = async () => searchResult;

const mockEmbed: EmbedFn = async () => Array<number>(1536).fill(0.1);

const session = {
    userId: 'u1',
    tenantId: 'tenant_1',
    workspaceIds: [] as string[],
    expiresAt: Date.now() + 3_600_000,
};

const makePrisma = () => ({} as PrismaClient);

// Build a fresh app instance for each test (multipart registered so ingest-file works)
const makeApp = (sess: typeof session | null, embed: EmbedFn | null = mockEmbed) => {
    const app = Fastify({ logger: false });
    app.register(multipart, { limits: { fileSize: 25_000_000 } });
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

// ── multipart helper ──────────────────────────────────────────────────────
// Builds a minimal multipart/form-data Buffer without external dependencies.

function makeMultipartBody(
    fields: Record<string, string>,
    file?: { fieldname?: string; filename: string; content: Buffer; mimeType: string },
): { body: Buffer; contentType: string } {
    const boundary = 'TestBoundary' + Math.random().toString(36).slice(2);
    const CRLF = '\r\n';
    const parts: Buffer[] = [];

    if (file) {
        const fname = file.fieldname ?? 'file';
        parts.push(Buffer.from(
            `--${boundary}${CRLF}` +
            `Content-Disposition: form-data; name="${fname}"; filename="${file.filename}"${CRLF}` +
            `Content-Type: ${file.mimeType}${CRLF}${CRLF}`,
        ));
        parts.push(file.content);
        parts.push(Buffer.from(CRLF));
    }

    for (const [name, value] of Object.entries(fields)) {
        parts.push(Buffer.from(
            `--${boundary}${CRLF}` +
            `Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}` +
            `${value}${CRLF}`,
        ));
    }

    parts.push(Buffer.from(`--${boundary}--${CRLF}`));

    return {
        body: Buffer.concat(parts),
        contentType: `multipart/form-data; boundary=${boundary}`,
    };
}

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
    capturedWriteReq = undefined;
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

test('POST /v1/knowledge-base/write — mimeType:text/html converts content to Markdown', async () => {
    capturedWriteReq = undefined;
    const app = makeApp(session);
    const res = await app.inject({
        method: 'POST', url: '/v1/knowledge-base/write',
        payload: {
            content: '<h1>Requirements</h1><p>Must support <strong>OAuth2</strong>.</p>',
            sourceType: 'requirements',
            mimeType: 'text/html',
        },
    });
    await app.close();
    assert.equal(res.statusCode, 201);
    assert.ok(capturedWriteReq, 'writeHook should have been called');
    const htmlReq = capturedWriteReq as SemanticWriteRequest;
    assert.match(htmlReq.content, /^# Requirements/m, 'heading should be ATX markdown');
    assert.match(htmlReq.content, /\*\*OAuth2\*\*/, 'bold should be markdown');
});

test('POST /v1/knowledge-base/write — unknown mimeType stores content as-is', async () => {
    capturedWriteReq = undefined;
    const original = 'Some plain text content';
    const app = makeApp(session);
    const res = await app.inject({
        method: 'POST', url: '/v1/knowledge-base/write',
        payload: { content: original, sourceType: 'notes', mimeType: 'image/png' },
    });
    await app.close();
    assert.equal(res.statusCode, 201);
    assert.equal(capturedWriteReq!.content, original);
});

test('POST /v1/knowledge-base/write — mimeType:application/json formats to fenced block', async () => {
    capturedWriteReq = undefined;
    const app = makeApp(session);
    const res = await app.inject({
        method: 'POST', url: '/v1/knowledge-base/write',
        payload: {
            content: JSON.stringify({ key: 'value' }),
            sourceType: 'config',
            mimeType: 'application/json',
        },
    });
    await app.close();
    assert.equal(res.statusCode, 201);
    assert.match(capturedWriteReq!.content, /^```json/m);
    assert.match(capturedWriteReq!.content, /```$/m);
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

// ── ingest-file route ────────────────────────────────────────────────────────

test('POST /v1/knowledge-base/ingest-file — 401 when no session', async () => {
    const app = makeApp(null);
    const { body, contentType } = makeMultipartBody(
        { sourceType: 'manual' },
        { filename: 'doc.txt', content: Buffer.from('hello'), mimeType: 'text/plain' },
    );
    const res = await app.inject({
        method: 'POST', url: '/v1/knowledge-base/ingest-file',
        headers: { 'content-type': contentType },
        payload: body,
    });
    await app.close();
    assert.equal(res.statusCode, 401);
});

test('POST /v1/knowledge-base/ingest-file — 503 when embedFn is null', async () => {
    const app = makeApp(session, null);
    const { body, contentType } = makeMultipartBody(
        { sourceType: 'manual' },
        { filename: 'doc.txt', content: Buffer.from('hello'), mimeType: 'text/plain' },
    );
    const res = await app.inject({
        method: 'POST', url: '/v1/knowledge-base/ingest-file',
        headers: { 'content-type': contentType },
        payload: body,
    });
    await app.close();
    assert.equal(res.statusCode, 503);
});

test('POST /v1/knowledge-base/ingest-file — 400 when file field is missing', async () => {
    const app = makeApp(session);
    const { body, contentType } = makeMultipartBody({ sourceType: 'manual' });
    const res = await app.inject({
        method: 'POST', url: '/v1/knowledge-base/ingest-file',
        headers: { 'content-type': contentType },
        payload: body,
    });
    await app.close();
    assert.equal(res.statusCode, 400);
    assert.match(res.json<{ error: string }>().error, /file field is required/);
});

test('POST /v1/knowledge-base/ingest-file — 400 when sourceType is missing', async () => {
    const app = makeApp(session);
    const { body, contentType } = makeMultipartBody(
        {},
        { filename: 'doc.txt', content: Buffer.from('hello'), mimeType: 'text/plain' },
    );
    const res = await app.inject({
        method: 'POST', url: '/v1/knowledge-base/ingest-file',
        headers: { 'content-type': contentType },
        payload: body,
    });
    await app.close();
    assert.equal(res.statusCode, 400);
    assert.match(res.json<{ error: string }>().error, /sourceType field is required/);
});

test('POST /v1/knowledge-base/ingest-file — 415 when file type is unsupported', async () => {
    const app = makeApp(session);
    const { body, contentType } = makeMultipartBody(
        { sourceType: 'manual' },
        { filename: 'photo.jpg', content: Buffer.from('\xff\xd8\xff'), mimeType: 'image/jpeg' },
    );
    const res = await app.inject({
        method: 'POST', url: '/v1/knowledge-base/ingest-file',
        headers: { 'content-type': contentType },
        payload: body,
    });
    await app.close();
    assert.equal(res.statusCode, 415);
    const respBody = res.json<{ error: string; supported: string[] }>();
    assert.match(respBody.error, /Unsupported file type/);
    assert.ok(Array.isArray(respBody.supported));
});

test('POST /v1/knowledge-base/ingest-file — 201 plain text file stored as-is', async () => {
    capturedWriteReq = undefined;
    const app = makeApp(session);
    const { body, contentType } = makeMultipartBody(
        { sourceType: 'notes' },
        { filename: 'readme.txt', content: Buffer.from('Hello AgentFarm'), mimeType: 'text/plain' },
    );
    const res = await app.inject({
        method: 'POST', url: '/v1/knowledge-base/ingest-file',
        headers: { 'content-type': contentType },
        payload: body,
    });
    await app.close();
    assert.equal(res.statusCode, 201);
    const resp = res.json<{ ok: boolean; originalFilename: string; mimeType: string; charCount: number }>();
    assert.equal(resp.ok, true);
    assert.equal(resp.originalFilename, 'readme.txt');
    assert.equal(resp.mimeType, 'text/plain');
    assert.equal(capturedWriteReq!.content, 'Hello AgentFarm');
    assert.equal(capturedWriteReq!.sourceType, 'notes');
});

test('POST /v1/knowledge-base/ingest-file — HTML file is converted to Markdown', async () => {
    capturedWriteReq = undefined;
    const app = makeApp(session);
    const html = '<h2>Spec</h2><ul><li>Requirement A</li><li>Requirement B</li></ul>';
    const { body, contentType } = makeMultipartBody(
        { sourceType: 'requirements' },
        { filename: 'spec.html', content: Buffer.from(html), mimeType: 'text/html' },
    );
    const res = await app.inject({
        method: 'POST', url: '/v1/knowledge-base/ingest-file',
        headers: { 'content-type': contentType },
        payload: body,
    });
    await app.close();
    assert.equal(res.statusCode, 201);
    // HTML should be normalised to Markdown, not stored raw
    assert.match(capturedWriteReq!.content, /^## Spec/m);
    assert.match(capturedWriteReq!.content, /Requirement A/);
    assert.ok(!capturedWriteReq!.content.includes('<h2>'), 'raw HTML tags should not be stored');
});

test('POST /v1/knowledge-base/ingest-file — MIME type resolved from filename extension', async () => {
    capturedWriteReq = undefined;
    const app = makeApp(session);
    // Browser-reported type is 'application/octet-stream', but filename is .html
    const html = '<p>Hello</p>';
    const { body, contentType } = makeMultipartBody(
        { sourceType: 'docs' },
        { filename: 'page.html', content: Buffer.from(html), mimeType: 'application/octet-stream' },
    );
    const res = await app.inject({
        method: 'POST', url: '/v1/knowledge-base/ingest-file',
        headers: { 'content-type': contentType },
        payload: body,
    });
    await app.close();
    assert.equal(res.statusCode, 201);
    // Extension-based detection should win — HTML should be converted
    const resp = res.json<{ mimeType: string }>();
    assert.equal(resp.mimeType, 'text/html');
    assert.ok(!capturedWriteReq!.content.includes('<p>'), 'HTML tags should be stripped');
});

test('POST /v1/knowledge-base/ingest-file — sourceUrl is set from field when provided', async () => {
    capturedWriteReq = undefined;
    const app = makeApp(session);
    const { body, contentType } = makeMultipartBody(
        { sourceType: 'notes', sourceUrl: 'https://wiki.example.com/page' },
        { filename: 'note.txt', content: Buffer.from('Some note'), mimeType: 'text/plain' },
    );
    const res = await app.inject({
        method: 'POST', url: '/v1/knowledge-base/ingest-file',
        headers: { 'content-type': contentType },
        payload: body,
    });
    await app.close();
    assert.equal(res.statusCode, 201);
    assert.equal(capturedWriteReq!.sourceUrl, 'https://wiki.example.com/page');
});

test('POST /v1/knowledge-base/ingest-file — auto-generates URN sourceUrl when no sourceUrl given', async () => {
    capturedWriteReq = undefined;
    const app = makeApp(session);
    const { body, contentType } = makeMultipartBody(
        { sourceType: 'notes' },
        { filename: 'requirements.txt', content: Buffer.from('...'), mimeType: 'text/plain' },
    );
    const res = await app.inject({
        method: 'POST', url: '/v1/knowledge-base/ingest-file',
        headers: { 'content-type': contentType },
        payload: body,
    });
    await app.close();
    assert.equal(res.statusCode, 201);
    assert.match(capturedWriteReq!.sourceUrl!, /^urn:agentfarm:doc:/);
    assert.match(capturedWriteReq!.sourceUrl!, /requirements\.txt/);
});
