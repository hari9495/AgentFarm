import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import type { PrismaClient } from '@prisma/client';
import { registerPolicyDocumentRoutes } from './policy-documents.js';

const session = { userId: 'u1', tenantId: 'tenant_1', workspaceIds: [] as string[], expiresAt: Date.now() + 3_600_000 };

// In-memory prisma double covering the calls these routes make.
function makePrisma() {
    const docs = new Map<string, any>();
    const policies: any[] = [];
    let seq = 0;
    const prisma = {
        policyDocument: {
            findUnique: async ({ where }: any) => {
                if (where.id) return docs.get(where.id) ?? null;
                if (where.tenantId_sha256) {
                    return [...docs.values()].find(
                        (d) => d.tenantId === where.tenantId_sha256.tenantId && d.sha256 === where.tenantId_sha256.sha256,
                    ) ?? null;
                }
                return null;
            },
            findMany: async ({ where }: any) =>
                [...docs.values()].filter((d) => d.tenantId === where.tenantId),
            create: async ({ data }: any) => {
                const row = { id: `doc_${++seq}`, createdAt: new Date(), updatedAt: new Date(), ...data };
                docs.set(row.id, row);
                return row;
            },
            update: async ({ where, data }: any) => {
                const row = { ...docs.get(where.id), ...data };
                docs.set(where.id, row);
                return row;
            },
            delete: async ({ where }: any) => { docs.delete(where.id); return {}; },
        },
        governancePolicy: {
            findFirst: async ({ where }: any) =>
                policies
                    .filter((p) => p.tenantId === where.tenantId && p.scope === where.scope && p.scopeRef === where.scopeRef && (!where.status || p.status === where.status))
                    .sort((a, b) => b.version - a.version)[0] ?? null,
            update: async ({ where, data }: any) => {
                const p = policies.find((x) => x.id === where.id);
                Object.assign(p, data);
                return p;
            },
            create: async ({ data }: any) => {
                const p = { id: `pol_${++seq}`, ...data };
                policies.push(p);
                return p;
            },
        },
        $transaction: async (fn: any) => fn(prisma),
    };
    return { prisma: prisma as unknown as PrismaClient, docs, policies };
}

function makeApp(sess: typeof session | null, prisma: PrismaClient) {
    const app = Fastify({ logger: false });
    app.register(multipart, { limits: { fileSize: 5_000_000 } });
    registerPolicyDocumentRoutes(app, prisma, {
        getSession: () => sess,
        embedFn: null, // RAG disabled in tests
        _convertFn: async (buf) => `# Policy\n${buf.toString('utf8')}`,
        _extractRulesFn: async () => [
            { id: 'c1', actionType: 'deploy_production', effect: 'deny', confidence: 0.9, sourceQuote: 'No prod.' },
            { id: 'c2', actionType: 'send_email', effect: 'require_approval', confidence: 0.6 },
        ],
    });
    return app;
}

function multipartFile(content: string, filename = 'policy.txt', mimeType = 'text/plain') {
    const boundary = 'B' + Math.random().toString(36).slice(2);
    const CRLF = '\r\n';
    const body = Buffer.concat([
        Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}Content-Type: ${mimeType}${CRLF}${CRLF}`),
        Buffer.from(content),
        Buffer.from(`${CRLF}--${boundary}--${CRLF}`),
    ]);
    return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

// --- auth regressions ---------------------------------------------------------

for (const [method, url] of [
    ['POST', '/v1/governance/policy-documents'],
    ['GET', '/v1/governance/policy-documents'],
    ['POST', '/v1/governance/policy-documents/x/apply'],
] as const) {
    test(`${method} ${url} — 401 without session`, async () => {
        const { prisma } = makePrisma();
        const app = makeApp(null, prisma);
        const res = await app.inject({ method, url, payload: method === 'POST' ? {} : undefined });
        await app.close();
        assert.equal(res.statusCode, 401);
    });
}

// --- upload + ingest ----------------------------------------------------------

test('POST upload ingests, returns parsed + candidates', async () => {
    const { prisma } = makePrisma();
    const app = makeApp(session, prisma);
    const { body, contentType } = multipartFile('No production deploys allowed.');
    const res = await app.inject({
        method: 'POST', url: '/v1/governance/policy-documents',
        payload: body, headers: { 'content-type': contentType },
    });
    await app.close();
    assert.equal(res.statusCode, 201);
    const json = res.json();
    assert.equal(json.status, 'parsed');
    assert.equal(json.candidates.length, 2);
});

test('POST upload dedups identical content (200)', async () => {
    const { prisma } = makePrisma();
    const app = makeApp(session, prisma);
    const f = multipartFile('same bytes');
    await app.inject({ method: 'POST', url: '/v1/governance/policy-documents', payload: f.body, headers: { 'content-type': f.contentType } });
    const f2 = multipartFile('same bytes');
    const res = await app.inject({ method: 'POST', url: '/v1/governance/policy-documents', payload: f2.body, headers: { 'content-type': f2.contentType } });
    await app.close();
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().deduped, true);
});

// --- apply (human review gate) ------------------------------------------------

test('POST apply publishes deny candidate into a role policy, skips non-deny', async () => {
    const { prisma, policies } = makePrisma();
    const app = makeApp(session, prisma);
    const f = multipartFile('No production deploys allowed.');
    const up = await app.inject({ method: 'POST', url: '/v1/governance/policy-documents', payload: f.body, headers: { 'content-type': f.contentType } });
    const docId = up.json().id;

    const res = await app.inject({
        method: 'POST', url: `/v1/governance/policy-documents/${docId}/apply`,
        payload: { scope: 'role', roleKey: 'developer' },
    });
    await app.close();
    assert.equal(res.statusCode, 201);
    const json = res.json();
    assert.equal(json.appliedCount, 1, 'only the deny candidate is enforceable');
    assert.equal(json.skipped.length, 1);
    assert.equal(json.skipped[0].id, 'c2');
    // policy created with the deny rule
    assert.equal(policies.length, 1);
    assert.equal(policies[0].scope, 'role');
    assert.equal(policies[0].rulesJson[0].actionType, 'deploy_production');
});

test('POST apply 400 when no enforceable candidates selected', async () => {
    const { prisma } = makePrisma();
    const app = makeApp(session, prisma);
    const f = multipartFile('x');
    const up = await app.inject({ method: 'POST', url: '/v1/governance/policy-documents', payload: f.body, headers: { 'content-type': f.contentType } });
    const docId = up.json().id;
    const res = await app.inject({
        method: 'POST', url: `/v1/governance/policy-documents/${docId}/apply`,
        payload: { scope: 'role', roleKey: 'developer', candidateIds: ['c2'] }, // only the require_approval one
    });
    await app.close();
    assert.equal(res.statusCode, 400);
});

test('GET list and GET one return documents scoped to tenant', async () => {
    const { prisma } = makePrisma();
    const app = makeApp(session, prisma);
    const f = multipartFile('hello');
    const up = await app.inject({ method: 'POST', url: '/v1/governance/policy-documents', payload: f.body, headers: { 'content-type': f.contentType } });
    const docId = up.json().id;

    const list = await app.inject({ method: 'GET', url: '/v1/governance/policy-documents' });
    assert.equal(list.json().documents.length, 1);
    assert.equal(list.json().documents[0].candidateCount, 2);

    const one = await app.inject({ method: 'GET', url: `/v1/governance/policy-documents/${docId}` });
    await app.close();
    assert.equal(one.statusCode, 200);
    assert.match(one.json().document.extractedText, /# Policy/);
    assert.equal(one.json().document.candidates.length, 2);
});
