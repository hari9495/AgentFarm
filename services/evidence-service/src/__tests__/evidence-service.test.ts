/**
 * Evidence Service — HTTP server tests (7 cases)
 * Uses Fastify inject to call routes with mocked Prisma and blob storage.
 * No real DB or blob calls are made.
 */
import { test } from 'node:test';
import * as assert from 'node:assert';
import { buildServer, type BuildServerOptions } from '../server.js';
import type { EvidenceBundle } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

type StoredRow = {
    id: string;
    taskId: string;
    tenantId: string;
    workspaceId: string;
    botId: string;
    actionType: string;
    riskLevel: string;
    routeDecision: string;
    llmProvider: string;
    inputTokens: number;
    outputTokens: number;
    screenshots: string[];
    approvalId: string | null;
    signature: string | null;
    finalised: boolean;
    finalisedAt: Date | null;
    createdAt: Date;
};

let idCounter = 0;
const makeId = () => `test-id-${++idCounter}`;

const makeMockRepo = (initial: StoredRow[] = []) => {
    const store = new Map<string, StoredRow>(initial.map(r => [r.id, r]));

    return {
        async create({ data }: { data: Omit<StoredRow, 'id' | 'createdAt'> & { approvalId?: string | null; finalised?: boolean } }) {
            const row: StoredRow = {
                id: makeId(),
                taskId: data.taskId,
                tenantId: data.tenantId,
                workspaceId: data.workspaceId,
                botId: data.botId,
                actionType: data.actionType,
                riskLevel: data.riskLevel,
                routeDecision: data.routeDecision,
                llmProvider: data.llmProvider,
                inputTokens: data.inputTokens,
                outputTokens: data.outputTokens,
                screenshots: data.screenshots,
                approvalId: data.approvalId ?? null,
                signature: null,
                finalised: data.finalised ?? false,
                finalisedAt: null,
                createdAt: new Date(),
            };
            store.set(row.id, row);
            return row;
        },
        async findUnique({ where }: { where: { id: string } }) {
            return store.get(where.id) ?? null;
        },
        async findMany({ where = {}, skip = 0, take = 20, orderBy: _orderBy }: {
            where?: Partial<StoredRow>;
            skip?: number;
            take?: number;
            orderBy?: unknown;
        }) {
            const all = Array.from(store.values()).filter(row =>
                Object.entries(where).every(([k, v]) => row[k as keyof StoredRow] === v),
            );
            return all.slice(skip, skip + take);
        },
        async count({ where = {} }: { where?: Partial<StoredRow> }) {
            return Array.from(store.values()).filter(row =>
                Object.entries(where).every(([k, v]) => row[k as keyof StoredRow] === v),
            ).length;
        },
        async update({ where, data }: { where: { id: string }; data: Partial<StoredRow> }) {
            const existing = store.get(where.id);
            if (!existing) throw new Error(`Record not found: ${where.id}`);
            const updated = { ...existing, ...data };
            store.set(where.id, updated);
            return updated;
        },
    };
};

const VALID_TOKEN = 'test-service-token-abc';

const makeBundle = (overrides: Partial<EvidenceBundle> = {}): EvidenceBundle => ({
    taskId: 'task-001',
    tenantId: 'tenant-001',
    workspaceId: 'ws-001',
    botId: 'bot-001',
    actionType: 'create_pr',
    riskLevel: 'medium',
    routeDecision: 'pending_approval',
    llmProvider: 'azure-openai',
    inputTokens: 512,
    outputTokens: 128,
    screenshots: [],
    finalised: false,
    createdAt: new Date().toISOString(),
    ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('POST /v1/evidence with valid token returns 201 with id', async () => {
    const repo = makeMockRepo();
    const app = await buildServer({
        repo: repo as unknown as BuildServerOptions['repo'],
        blobStorage: null,
        env: { EVIDENCE_SERVICE_TOKEN: VALID_TOKEN },
    });

    const response = await app.inject({
        method: 'POST',
        url: '/v1/evidence',
        headers: { 'x-service-token': VALID_TOKEN, 'content-type': 'application/json' },
        payload: makeBundle(),
    });

    assert.equal(response.statusCode, 201);
    const body = JSON.parse(response.body) as { id: string; status: string; createdAt: string };
    assert.ok(body.id, 'id should be returned');
    assert.equal(body.status, 'stored');
    assert.ok(body.createdAt, 'createdAt should be returned');

    await app.close();
});

test('POST /v1/evidence with missing token returns 401', async () => {
    const repo = makeMockRepo();
    const app = await buildServer({
        repo: repo as unknown as BuildServerOptions['repo'],
        blobStorage: null,
        env: { EVIDENCE_SERVICE_TOKEN: VALID_TOKEN },
    });

    const response = await app.inject({
        method: 'POST',
        url: '/v1/evidence',
        headers: { 'content-type': 'application/json' },
        payload: makeBundle(),
    });

    assert.equal(response.statusCode, 401);
    const body = JSON.parse(response.body) as { error: string };
    assert.equal(body.error, 'unauthorized');

    await app.close();
});

test('GET /v1/evidence/:id returns stored bundle', async () => {
    const repo = makeMockRepo();
    const app = await buildServer({
        repo: repo as unknown as BuildServerOptions['repo'],
        blobStorage: null,
        env: { EVIDENCE_SERVICE_TOKEN: VALID_TOKEN },
    });

    // First create a record
    const createResp = await app.inject({
        method: 'POST',
        url: '/v1/evidence',
        headers: { 'x-service-token': VALID_TOKEN, 'content-type': 'application/json' },
        payload: makeBundle({ taskId: 'task-get-001' }),
    });
    assert.equal(createResp.statusCode, 201);
    const created = JSON.parse(createResp.body) as { id: string };

    // Now retrieve it
    const getResp = await app.inject({
        method: 'GET',
        url: `/v1/evidence/${created.id}`,
        headers: { 'x-service-token': VALID_TOKEN },
    });

    assert.equal(getResp.statusCode, 200);
    const bundle = JSON.parse(getResp.body) as EvidenceBundle & { id: string };
    assert.equal(bundle.taskId, 'task-get-001');
    assert.equal(bundle.id, created.id);

    await app.close();
});

test('GET /v1/evidence/:id with unknown id returns 404', async () => {
    const repo = makeMockRepo();
    const app = await buildServer({
        repo: repo as unknown as BuildServerOptions['repo'],
        blobStorage: null,
        env: { EVIDENCE_SERVICE_TOKEN: VALID_TOKEN },
    });

    const getResp = await app.inject({
        method: 'GET',
        url: '/v1/evidence/nonexistent-id',
        headers: { 'x-service-token': VALID_TOKEN },
    });

    assert.equal(getResp.statusCode, 404);
    const body = JSON.parse(getResp.body) as { error: string };
    assert.equal(body.error, 'not found');

    await app.close();
});

test('GET /v1/evidence with workspaceId filter returns matching records', async () => {
    const repo = makeMockRepo();
    const app = await buildServer({
        repo: repo as unknown as BuildServerOptions['repo'],
        blobStorage: null,
        env: { EVIDENCE_SERVICE_TOKEN: VALID_TOKEN },
    });

    // Insert two bundles with different workspaceIds
    for (const wsId of ['ws-alpha', 'ws-beta']) {
        await app.inject({
            method: 'POST',
            url: '/v1/evidence',
            headers: { 'x-service-token': VALID_TOKEN, 'content-type': 'application/json' },
            payload: makeBundle({ workspaceId: wsId, taskId: `task-${wsId}` }),
        });
    }

    const listResp = await app.inject({
        method: 'GET',
        url: '/v1/evidence?workspaceId=ws-alpha',
        headers: { 'x-service-token': VALID_TOKEN },
    });

    assert.equal(listResp.statusCode, 200);
    const body = JSON.parse(listResp.body) as { items: Array<EvidenceBundle & { id: string }>; total: number };
    assert.equal(body.total, 1);
    assert.equal(body.items[0]?.workspaceId, 'ws-alpha');

    await app.close();
});

test('POST /v1/evidence/:id/sign returns signature string and finalised: true', async () => {
    const repo = makeMockRepo();
    const app = await buildServer({
        repo: repo as unknown as BuildServerOptions['repo'],
        blobStorage: null,
        env: { EVIDENCE_SERVICE_TOKEN: VALID_TOKEN },
    });

    // Create a bundle first
    const createResp = await app.inject({
        method: 'POST',
        url: '/v1/evidence',
        headers: { 'x-service-token': VALID_TOKEN, 'content-type': 'application/json' },
        payload: makeBundle(),
    });
    assert.equal(createResp.statusCode, 201);
    const created = JSON.parse(createResp.body) as { id: string };

    // Sign it
    const signResp = await app.inject({
        method: 'POST',
        url: `/v1/evidence/${created.id}/sign`,
        headers: { 'x-service-token': VALID_TOKEN },
    });

    assert.equal(signResp.statusCode, 200);
    const signed = JSON.parse(signResp.body) as { id: string; signature: string; finalised: boolean; finalisedAt: string };
    assert.ok(signed.signature, 'signature should be returned');
    assert.equal(signed.finalised, true);
    assert.ok(signed.finalisedAt, 'finalisedAt should be returned');
    // SHA-256 hex is 64 characters
    assert.equal(signed.signature.length, 64);

    await app.close();
});

test('GET /health returns 200 with status ok — no token required', async () => {
    const repo = makeMockRepo();
    const app = await buildServer({
        repo: repo as unknown as BuildServerOptions['repo'],
        blobStorage: null,
        env: { EVIDENCE_SERVICE_TOKEN: VALID_TOKEN },
    });

    const resp = await app.inject({
        method: 'GET',
        url: '/health',
        // Intentionally NO x-service-token header
    });

    assert.equal(resp.statusCode, 200);
    const body = JSON.parse(resp.body) as { status: string; service: string };
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'evidence-service');

    await app.close();
});
