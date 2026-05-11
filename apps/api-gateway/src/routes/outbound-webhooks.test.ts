import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerOutboundWebhookRoutes } from './outbound-webhooks.js';

// ── Session helpers ───────────────────────────────────────────────────────────

const makeSession = (tenantId = 'tenant_1') => ({
    userId: 'user_1',
    tenantId,
    workspaceIds: ['ws_1'],
    role: 'admin',
    expiresAt: Date.now() + 60_000,
});

const noSession = () => null;

// ── Prisma mock ───────────────────────────────────────────────────────────────

const makeWebhookRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'wh_1',
    tenantId: 'tenant_1',
    workspaceId: null,
    url: 'https://example.com/hook',
    secret: 'a'.repeat(64),
    events: ['task_completed'],
    enabled: true,
    createdAt: new Date('2026-05-11T00:00:00Z'),
    updatedAt: new Date('2026-05-11T00:00:00Z'),
    ...overrides,
});

const makePrisma = (overrides: Record<string, unknown> = {}) => ({
    outboundWebhook: {
        create: async ({ data }: { data: Record<string, unknown> }) =>
            makeWebhookRecord({ ...data, id: 'wh_new' }),
        findMany: async () => {
            const { secret: _secret, ...rest } = makeWebhookRecord();
            return [rest];
        },
        findUnique: async ({ where }: { where: { id: string } }) =>
            where.id === 'wh_1' ? makeWebhookRecord() : null,
        delete: async () => makeWebhookRecord(),
    },
    outboundWebhookDelivery: {
        findMany: async () => [
            {
                id: 'del_1',
                webhookId: 'wh_1',
                tenantId: 'tenant_1',
                eventType: 'task_completed',
                payload: {},
                responseStatus: 200,
                responseBody: 'ok',
                durationMs: 42,
                success: true,
                firedAt: new Date('2026-05-11T00:01:00Z'),
            },
        ],
    },
    ...overrides,
} as any);

// ── Tests ─────────────────────────────────────────────────────────────────────

test('POST /v1/webhooks/outbound — non-https url — 400', async () => {
    const app = Fastify();
    await registerOutboundWebhookRoutes(app, {
        getSession: () => makeSession(),
        prisma: makePrisma(),
    });

    const res = await app.inject({
        method: 'POST',
        url: '/v1/webhooks/outbound',
        payload: { url: 'http://insecure.example.com/hook', events: ['task_completed'] },
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes('https'));
});

test('POST /v1/webhooks/outbound — empty events array — 400', async () => {
    const app = Fastify();
    await registerOutboundWebhookRoutes(app, {
        getSession: () => makeSession(),
        prisma: makePrisma(),
    });

    const res = await app.inject({
        method: 'POST',
        url: '/v1/webhooks/outbound',
        payload: { url: 'https://example.com/hook', events: [] },
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes('events'));
});

test('POST /v1/webhooks/outbound — valid — 201 with secret', async () => {
    const app = Fastify();
    await registerOutboundWebhookRoutes(app, {
        getSession: () => makeSession(),
        prisma: makePrisma(),
    });

    const res = await app.inject({
        method: 'POST',
        url: '/v1/webhooks/outbound',
        payload: { url: 'https://example.com/hook', events: ['task_completed'] },
    });
    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.ok(typeof body.id === 'string');
    assert.ok(typeof body.secret === 'string' && body.secret.length > 0);
    assert.ok(Array.isArray(body.events));
    assert.ok(body.createdAt);
});

test('GET /v1/webhooks/outbound — returns list without secret field', async () => {
    const app = Fastify();
    await registerOutboundWebhookRoutes(app, {
        getSession: () => makeSession(),
        prisma: makePrisma(),
    });

    const res = await app.inject({
        method: 'GET',
        url: '/v1/webhooks/outbound',
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body.webhooks));
    assert.equal(body.webhooks.length, 1);
    // secret must not be present
    assert.equal(body.webhooks[0].secret, undefined);
    assert.ok(body.webhooks[0].id);
    assert.ok(body.webhooks[0].url);
});

test('DELETE /v1/webhooks/outbound/:id — wrong tenant — 403', async () => {
    const app = Fastify();
    // webhook belongs to tenant_1, session is tenant_other
    await registerOutboundWebhookRoutes(app, {
        getSession: () => makeSession('tenant_other'),
        prisma: makePrisma(),
    });

    const res = await app.inject({
        method: 'DELETE',
        url: '/v1/webhooks/outbound/wh_1',
    });
    assert.equal(res.statusCode, 403);
});

test('DELETE /v1/webhooks/outbound/:id — correct tenant — 204', async () => {
    const app = Fastify();
    await registerOutboundWebhookRoutes(app, {
        getSession: () => makeSession('tenant_1'),
        prisma: makePrisma(),
    });

    const res = await app.inject({
        method: 'DELETE',
        url: '/v1/webhooks/outbound/wh_1',
    });
    assert.equal(res.statusCode, 204);
});

test('GET /v1/webhooks/outbound/:id/deliveries — returns delivery history', async () => {
    const app = Fastify();
    await registerOutboundWebhookRoutes(app, {
        getSession: () => makeSession('tenant_1'),
        prisma: makePrisma(),
    });

    const res = await app.inject({
        method: 'GET',
        url: '/v1/webhooks/outbound/wh_1/deliveries',
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body.deliveries));
    assert.equal(body.deliveries.length, 1);
    assert.equal(body.deliveries[0].webhookId, 'wh_1');
    assert.equal(body.deliveries[0].success, true);
});
