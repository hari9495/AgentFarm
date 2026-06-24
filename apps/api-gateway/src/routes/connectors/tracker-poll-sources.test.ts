import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerTrackerPollSourceRoutes } from './tracker-poll-sources.js';

type Row = Record<string, unknown>;

const makeSession = (tenantId = 'tenant_1', role = 'operator') => ({
    userId: 'user_1',
    tenantId,
    workspaceIds: ['ws_1'],
    role,
    expiresAt: Date.now() + 60_000,
});

function buildPrismaStub() {
    const rows: Row[] = [];
    let seq = 0;
    const prisma = {
        trackerPollSource: {
            findMany: async ({ where }: any) => rows.filter((r) => r['tenantId'] === where.tenantId),
            findFirst: async ({ where }: any) =>
                rows.find((r) => r['id'] === where.id && r['tenantId'] === where.tenantId) ?? null,
            create: async ({ data }: any) => {
                const row = {
                    id: `tps_${++seq}`,
                    ...data,
                    lastPolledAt: null,
                    lastError: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
                rows.push(row);
                return row;
            },
            update: async ({ where, data }: any) => {
                const row = rows.find((r) => r['id'] === where.id)!;
                Object.assign(row, data, { updatedAt: new Date() });
                return row;
            },
            delete: async ({ where }: any) => {
                const i = rows.findIndex((r) => r['id'] === where.id);
                if (i >= 0) rows.splice(i, 1);
                return {};
            },
        },
    } as any;
    return { prisma, rows };
}

function buildApp(opts: { tenantId?: string; role?: string; session?: boolean } = {}) {
    const app = Fastify();
    const { prisma, rows } = buildPrismaStub();
    registerTrackerPollSourceRoutes(app, {
        getSession: () => (opts.session === false ? null : makeSession(opts.tenantId, opts.role)),
        prisma,
    });
    return { app, prisma, rows };
}

// 1. Unauthenticated → 401
test('GET sources — 401 without session', async () => {
    const { app } = buildApp({ session: false });
    const res = await app.inject({ method: 'GET', url: '/v1/tracker-poll-sources' });
    assert.equal(res.statusCode, 401);
});

// 2. Create + list round-trip, secret masked
test('POST then GET — creates and lists with secret masked', async () => {
    const { app } = buildApp();
    const create = await app.inject({
        method: 'POST',
        url: '/v1/tracker-poll-sources',
        payload: {
            tracker: 'jira',
            agentId: 'bot_1',
            baseUrl: 'https://acme.atlassian.net',
            assignee: 'dev@acme.io',
            secretRef: 'super-secret-token',
            intervalSec: 300,
        },
    });
    assert.equal(create.statusCode, 201);
    const created = create.json().source;
    assert.equal(created.tracker, 'jira');
    assert.equal(created.hasSecret, true);
    assert.equal(created.secretRef, undefined, 'raw secret must never be returned');

    const list = await app.inject({ method: 'GET', url: '/v1/tracker-poll-sources' });
    assert.equal(list.statusCode, 200);
    assert.equal(list.json().sources.length, 1);
    assert.equal(list.json().sources[0].assignee, 'dev@acme.io');
});

// 3. Validation — bad tracker
test('POST — 400 on invalid tracker', async () => {
    const { app } = buildApp();
    const res = await app.inject({
        method: 'POST',
        url: '/v1/tracker-poll-sources',
        payload: { tracker: 'bugzilla', assignee: 'x' },
    });
    assert.equal(res.statusCode, 400);
});

// 4. Validation — custom requires url + idField
test('POST — 400 when custom tracker missing customConfig', async () => {
    const { app } = buildApp();
    const res = await app.inject({
        method: 'POST',
        url: '/v1/tracker-poll-sources',
        payload: { tracker: 'custom', assignee: 'x' },
    });
    assert.equal(res.statusCode, 400);
});

// 5. github requires owner/repo
test('POST — 400 when github source lacks owner/repo projectFilter', async () => {
    const { app } = buildApp();
    const res = await app.inject({
        method: 'POST',
        url: '/v1/tracker-poll-sources',
        payload: { tracker: 'github', assignee: 'octocat' },
    });
    assert.equal(res.statusCode, 400);
});

// 6. Role gate — viewer cannot create
test('POST — 403 for viewer role', async () => {
    const { app } = buildApp({ role: 'viewer' });
    const res = await app.inject({
        method: 'POST',
        url: '/v1/tracker-poll-sources',
        payload: { tracker: 'linear', assignee: 'dev@acme.io' },
    });
    assert.equal(res.statusCode, 403);
});

// 7. Tenant isolation — cannot update another tenant's source
test('PATCH — 404 across tenants', async () => {
    const { app, rows } = buildApp();
    rows.push({ id: 'tps_x', tenantId: 'tenant_OTHER', tracker: 'jira', assignee: 'a' });
    const res = await app.inject({
        method: 'PATCH',
        url: '/v1/tracker-poll-sources/tps_x',
        payload: { enabled: false },
    });
    assert.equal(res.statusCode, 404);
});

// 8. PATCH does not wipe secret when omitted
test('PATCH — keeps existing secret when secretRef omitted', async () => {
    const { app } = buildApp();
    const created = (
        await app.inject({
            method: 'POST',
            url: '/v1/tracker-poll-sources',
            payload: { tracker: 'jira', assignee: 'dev@acme.io', baseUrl: 'https://x', secretRef: 'tok' },
        })
    ).json().source;

    const patch = await app.inject({
        method: 'PATCH',
        url: `/v1/tracker-poll-sources/${created.id}`,
        payload: { enabled: false },
    });
    assert.equal(patch.statusCode, 200);
    assert.equal(patch.json().source.enabled, false);
    assert.equal(patch.json().source.hasSecret, true, 'secret preserved');
});

// 9. DELETE removes
test('DELETE — removes the source', async () => {
    const { app } = buildApp();
    const created = (
        await app.inject({
            method: 'POST',
            url: '/v1/tracker-poll-sources',
            payload: { tracker: 'linear', assignee: 'dev@acme.io' },
        })
    ).json().source;
    const del = await app.inject({ method: 'DELETE', url: `/v1/tracker-poll-sources/${created.id}` });
    assert.equal(del.statusCode, 200);
    const list = await app.inject({ method: 'GET', url: '/v1/tracker-poll-sources' });
    assert.equal(list.json().sources.length, 0);
});
