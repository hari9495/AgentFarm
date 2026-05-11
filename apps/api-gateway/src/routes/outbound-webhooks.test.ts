import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerOutboundWebhookRoutes } from './outbound-webhooks.js';
import { dispatchOutboundWebhooks } from '../lib/webhook-dispatcher.js';
import { resetCircuit } from '../lib/circuit-breaker.js';

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

// ── Group 1: replay delivery route ───────────────────────────────────────────

const makeDeliveryRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'del_1',
    webhookId: 'wh_1',
    tenantId: 'tenant_1',
    eventType: 'task_completed',
    payload: { eventType: 'task_completed', tenantId: 'tenant_1', taskId: null, payload: null, timestamp: '2026-05-11T00:00:00Z' },
    responseStatus: 200,
    responseBody: 'ok',
    durationMs: 42,
    success: true,
    firedAt: new Date('2026-05-11T00:01:00Z'),
    ...overrides,
});

const makePrismaWithDelivery = (deliveryOverrides: Record<string, unknown> = {}, fetchSuccess = true) => ({
    outboundWebhook: {
        create: async ({ data }: { data: Record<string, unknown> }) => makeWebhookRecord({ ...data, id: 'wh_new' }),
        findMany: async () => [makeWebhookRecord()],
        findUnique: async ({ where }: { where: { id: string } }) =>
            where.id === 'wh_1' ? makeWebhookRecord() : null,
        delete: async () => makeWebhookRecord(),
        update: async () => makeWebhookRecord(),
    },
    outboundWebhookDelivery: {
        findUnique: async ({ where }: { where: { id: string } }) =>
            where.id === 'del_1' ? makeDeliveryRecord(deliveryOverrides) : null,
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
            if (where['id'] === 'del_1' && where['tenantId'] === 'tenant_1') {
                return makeDeliveryRecord(deliveryOverrides);
            }
            return null;
        },
        findMany: async () => [makeDeliveryRecord(deliveryOverrides)],
        create: async ({ data }: { data: Record<string, unknown> }) => ({ ...data, id: 'del_new' }),
    },
    webhookDlqEntry: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({ ...data, id: 'dlq_new', createdAt: new Date() }),
        findMany: async () => [],
        findUnique: async () => null,
        update: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'dlq_1', ...data }),
    },
} as any);

test('POST /v1/webhooks/deliveries/:id/replay — success — returns replayed true and success true', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({
        ok: true,
        status: 200,
        text: async () => 'ok',
    }));

    const app = Fastify();
    await registerOutboundWebhookRoutes(app, {
        getSession: () => makeSession(),
        prisma: makePrismaWithDelivery(),
    });

    const res = await app.inject({ method: 'POST', url: '/v1/webhooks/deliveries/del_1/replay' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.replayed, true);
    assert.equal(body.success, true);
});

test('POST /v1/webhooks/deliveries/:id/replay — webhook returns error — success false', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({
        ok: false,
        status: 503,
        text: async () => 'service unavailable',
    }));

    const app = Fastify();
    await registerOutboundWebhookRoutes(app, {
        getSession: () => makeSession(),
        prisma: makePrismaWithDelivery(),
    });

    const res = await app.inject({ method: 'POST', url: '/v1/webhooks/deliveries/del_1/replay' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.replayed, true);
    assert.equal(body.success, false);
});

test('POST /v1/webhooks/deliveries/:id/replay — wrong tenant — 403', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, text: async () => 'ok' }));

    const app = Fastify();
    await registerOutboundWebhookRoutes(app, {
        getSession: () => makeSession('tenant_other'),
        prisma: makePrismaWithDelivery(),
    });

    const res = await app.inject({ method: 'POST', url: '/v1/webhooks/deliveries/del_1/replay' });
    assert.equal(res.statusCode, 403);
});

test('POST /v1/webhooks/deliveries/:id/replay — unknown deliveryId — 404', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, text: async () => 'ok' }));

    const app = Fastify();
    await registerOutboundWebhookRoutes(app, {
        getSession: () => makeSession(),
        prisma: makePrismaWithDelivery(),
    });

    const res = await app.inject({ method: 'POST', url: '/v1/webhooks/deliveries/del_MISSING/replay' });
    assert.equal(res.statusCode, 404);
});

// ── Group 2: DLQ threshold in dispatchOutboundWebhooks ───────────────────────

test('DLQ threshold — 4 consecutive failures — failureCount=4, webhook still enabled', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 500, text: async () => '' }));

    let failureCount = 0;
    let enabled = true;
    let dlqCreated = false;

    const prisma = {
        outboundWebhook: {
            findMany: async () => [makeWebhookRecord({ failureCount: 0 })],
            update: async ({ data }: { data: Record<string, unknown> }) => {
                if (typeof data['failureCount'] === 'object' && data['failureCount'] !== null) {
                    failureCount++;
                } else if (data['failureCount'] === 0) {
                    failureCount = 0;
                }
                if (data['enabled'] === false) enabled = false;
                return makeWebhookRecord({ failureCount, enabled });
            },
            findUnique: async () => ({ failureCount }),
        },
        outboundWebhookDelivery: {
            create: async () => ({}),
        },
        webhookDlqEntry: {
            create: async () => { dlqCreated = true; return {}; },
        },
    } as any;

    for (let i = 0; i < 4; i++) {
        await dispatchOutboundWebhooks(
            { tenantId: 'tenant_1', workspaceId: 'ws_1', eventType: 'task_completed', timestamp: new Date().toISOString() },
            prisma,
        );
    }

    assert.equal(failureCount, 4);
    assert.equal(enabled, true);
    assert.equal(dlqCreated, false);
});

test('DLQ threshold — 5th consecutive failure — webhook disabled and DlqEntry created', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 500, text: async () => '' }));

    let failureCount = 4; // already 4 failures
    let enabled = true;
    let dlqCreated = false;

    const prisma = {
        outboundWebhook: {
            findMany: async () => [makeWebhookRecord({ failureCount: 4 })],
            update: async ({ data }: { data: Record<string, unknown> }) => {
                if (typeof data['failureCount'] === 'object' && data['failureCount'] !== null) {
                    failureCount++;
                } else if (data['failureCount'] === 0) {
                    failureCount = 0;
                }
                if (data['enabled'] === false) enabled = false;
                return makeWebhookRecord({ failureCount, enabled });
            },
            findUnique: async () => ({ failureCount }),
        },
        outboundWebhookDelivery: {
            create: async () => ({}),
        },
        webhookDlqEntry: {
            create: async () => { dlqCreated = true; return {}; },
        },
    } as any;

    await dispatchOutboundWebhooks(
        { tenantId: 'tenant_1', workspaceId: 'ws_1', eventType: 'task_completed', timestamp: new Date().toISOString() },
        prisma,
    );

    assert.equal(failureCount, 5);
    assert.equal(enabled, false);
    assert.equal(dlqCreated, true);
});

test('DLQ threshold — success after 3 failures — failureCount reset to 0', async (t) => {
    // Reset the in-memory circuit so accumulated failures from previous DLQ
    // threshold tests don't fast-fail this success scenario.
    resetCircuit('webhook:wh_1');
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, text: async () => 'ok' }));

    let failureCount = 3;

    const prisma = {
        outboundWebhook: {
            findMany: async () => [makeWebhookRecord({ failureCount: 3 })],
            update: async ({ data }: { data: Record<string, unknown> }) => {
                if (typeof data['failureCount'] === 'object' && data['failureCount'] !== null) {
                    failureCount++;
                } else if (data['failureCount'] === 0) {
                    failureCount = 0;
                }
                return makeWebhookRecord({ failureCount });
            },
            findUnique: async () => ({ failureCount }),
        },
        outboundWebhookDelivery: {
            create: async () => ({}),
        },
        webhookDlqEntry: {
            create: async () => ({}),
        },
    } as any;

    await dispatchOutboundWebhooks(
        { tenantId: 'tenant_1', workspaceId: 'ws_1', eventType: 'task_completed', timestamp: new Date().toISOString() },
        prisma,
    );

    assert.equal(failureCount, 0);
});

test('DLQ threshold — DLQ entry has correct reason and lastPayload', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 500, text: async () => '' }));

    let failureCount = 4;
    let dlqData: Record<string, unknown> | null = null;

    const prisma = {
        outboundWebhook: {
            findMany: async () => [makeWebhookRecord({ failureCount: 4 })],
            update: async ({ data }: { data: Record<string, unknown> }) => {
                if (typeof data['failureCount'] === 'object') failureCount++;
                return makeWebhookRecord({ failureCount, enabled: data['enabled'] !== false });
            },
            findUnique: async () => ({ failureCount }),
        },
        outboundWebhookDelivery: {
            create: async () => ({}),
        },
        webhookDlqEntry: {
            create: async ({ data }: { data: Record<string, unknown> }) => { dlqData = data; return {}; },
        },
    } as any;

    await dispatchOutboundWebhooks(
        { tenantId: 'tenant_1', workspaceId: 'ws_1', eventType: 'task_completed', payload: { foo: 'bar' }, timestamp: new Date().toISOString() },
        prisma,
    );

    assert.ok(dlqData !== null);
    assert.ok(String((dlqData as Record<string, unknown>)['reason']).includes('5'));
    assert.deepEqual((dlqData as Record<string, unknown>)['lastPayload'], { foo: 'bar' });
    assert.equal((dlqData as Record<string, unknown>)['lastEventType'], 'task_completed');
});

// ── Group 3: GET /v1/webhooks/dlq ────────────────────────────────────────────

const makeDlqEntry = (overrides: Record<string, unknown> = {}) => ({
    id: 'dlq_1',
    webhookId: 'wh_1',
    tenantId: 'tenant_1',
    reason: '5 consecutive failures',
    lastPayload: {},
    lastEventType: 'task_completed',
    createdAt: new Date('2026-05-11T00:00:00Z'),
    resolvedAt: null,
    resolvedBy: null,
    ...overrides,
});

test('GET /v1/webhooks/dlq — returns only unresolved entries for tenant', async () => {
    const prisma = makePrisma({
        webhookDlqEntry: {
            findMany: async ({ where }: { where: Record<string, unknown> }) => {
                if (where['tenantId'] === 'tenant_1' && where['resolvedAt'] === null) {
                    return [makeDlqEntry()];
                }
                return [];
            },
        },
    });

    const app = Fastify();
    await registerOutboundWebhookRoutes(app, { getSession: () => makeSession(), prisma });

    const res = await app.inject({ method: 'GET', url: '/v1/webhooks/dlq' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body.dlq));
    assert.equal(body.dlq.length, 1);
    assert.equal(body.dlq[0].id, 'dlq_1');
    assert.equal(body.dlq[0].resolvedAt, null);
});

test('GET /v1/webhooks/dlq?resolved=true — returns only resolved entries', async () => {
    const resolvedEntry = makeDlqEntry({ resolvedAt: new Date('2026-05-12T00:00:00Z'), resolvedBy: 'user_1' });

    const prisma = makePrisma({
        webhookDlqEntry: {
            findMany: async ({ where }: { where: Record<string, unknown> }) => {
                const filter = where['resolvedAt'] as Record<string, unknown> | null;
                if (filter !== null && typeof filter === 'object' && 'not' in filter) {
                    return [resolvedEntry];
                }
                return [];
            },
        },
    });

    const app = Fastify();
    await registerOutboundWebhookRoutes(app, { getSession: () => makeSession(), prisma });

    const res = await app.inject({ method: 'GET', url: '/v1/webhooks/dlq?resolved=true' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body.dlq));
    assert.equal(body.dlq.length, 1);
    assert.ok(body.dlq[0].resolvedAt !== null);
});

test('GET /v1/webhooks/dlq — empty array when no DLQ entries', async () => {
    const prisma = makePrisma({
        webhookDlqEntry: {
            findMany: async () => [],
        },
    });

    const app = Fastify();
    await registerOutboundWebhookRoutes(app, { getSession: () => makeSession(), prisma });

    const res = await app.inject({ method: 'GET', url: '/v1/webhooks/dlq' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.deepEqual(body.dlq, []);
});

test('GET /v1/webhooks/dlq — entries from other tenants not returned', async () => {
    const prisma = makePrisma({
        webhookDlqEntry: {
            findMany: async ({ where }: { where: Record<string, unknown> }) => {
                // Only return entries matching the queried tenantId
                return where['tenantId'] === 'tenant_1' ? [makeDlqEntry()] : [];
            },
        },
    });

    const app = Fastify();
    // Session is tenant_other — should get nothing
    await registerOutboundWebhookRoutes(app, { getSession: () => makeSession('tenant_other'), prisma });

    const res = await app.inject({ method: 'GET', url: '/v1/webhooks/dlq' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.deepEqual(body.dlq, []);
});

// ── Group 4: POST /v1/webhooks/dlq/:id/retry ─────────────────────────────────

test('POST /v1/webhooks/dlq/:id/retry — re-enables webhook and resets failureCount', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, text: async () => 'ok' }));

    let webhookUpdated: Record<string, unknown> | null = null;

    const prisma = {
        outboundWebhook: {
            findMany: async () => [makeWebhookRecord({ failureCount: 5, enabled: false })],
            findUnique: async () => makeWebhookRecord({ failureCount: 5, enabled: false }),
            update: async ({ data }: { data: Record<string, unknown> }) => {
                webhookUpdated = data;
                return makeWebhookRecord({ ...data });
            },
        },
        outboundWebhookDelivery: {
            findFirst: async () => makeDeliveryRecord(),
            findUnique: async () => makeDeliveryRecord(),
            create: async () => ({}),
        },
        webhookDlqEntry: {
            findUnique: async ({ where }: { where: { id: string } }) =>
                where.id === 'dlq_1' ? makeDlqEntry() : null,
            update: async ({ data }: { data: Record<string, unknown> }) => ({ ...makeDlqEntry(), ...data }),
        },
    } as any;

    const app = Fastify();
    await registerOutboundWebhookRoutes(app, { getSession: () => makeSession(), prisma });

    const res = await app.inject({ method: 'POST', url: '/v1/webhooks/dlq/dlq_1/retry' });
    assert.equal(res.statusCode, 200);
    assert.ok(webhookUpdated !== null);
    assert.equal((webhookUpdated as Record<string, unknown>)['enabled'], true);
    assert.equal((webhookUpdated as Record<string, unknown>)['failureCount'], 0);
    assert.equal((webhookUpdated as Record<string, unknown>)['dlqAt'], null);
});

test('POST /v1/webhooks/dlq/:id/retry — marks DlqEntry resolved with resolvedBy userId', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, text: async () => 'ok' }));

    let dlqUpdateData: Record<string, unknown> | null = null;

    const prisma = {
        outboundWebhook: {
            findMany: async () => [makeWebhookRecord()],
            findUnique: async () => makeWebhookRecord(),
            update: async () => makeWebhookRecord(),
        },
        outboundWebhookDelivery: {
            findFirst: async () => makeDeliveryRecord(),
            findUnique: async () => makeDeliveryRecord(),
            create: async () => ({}),
        },
        webhookDlqEntry: {
            findUnique: async ({ where }: { where: { id: string } }) =>
                where.id === 'dlq_1' ? makeDlqEntry() : null,
            update: async ({ data }: { data: Record<string, unknown> }) => {
                dlqUpdateData = data;
                return { ...makeDlqEntry(), ...data };
            },
        },
    } as any;

    const app = Fastify();
    await registerOutboundWebhookRoutes(app, { getSession: () => makeSession(), prisma });

    const res = await app.inject({ method: 'POST', url: '/v1/webhooks/dlq/dlq_1/retry' });
    assert.equal(res.statusCode, 200);
    assert.ok(dlqUpdateData !== null);
    assert.equal((dlqUpdateData as Record<string, unknown>)['resolvedBy'], 'user_1');
    assert.ok((dlqUpdateData as Record<string, unknown>)['resolvedAt'] instanceof Date);
});

test('POST /v1/webhooks/dlq/:id/retry — replays last delivery', async (t) => {
    let fetchCalled = false;
    t.mock.method(globalThis, 'fetch', async () => {
        fetchCalled = true;
        return { ok: true, status: 200, text: async () => 'ok' };
    });

    const prisma = {
        outboundWebhook: {
            findMany: async () => [makeWebhookRecord()],
            findUnique: async () => makeWebhookRecord(),
            update: async () => makeWebhookRecord(),
        },
        outboundWebhookDelivery: {
            findFirst: async () => makeDeliveryRecord(),
            findUnique: async () => makeDeliveryRecord(),
            create: async () => ({}),
        },
        webhookDlqEntry: {
            findUnique: async ({ where }: { where: { id: string } }) =>
                where.id === 'dlq_1' ? makeDlqEntry() : null,
            update: async ({ data }: { data: Record<string, unknown> }) => ({ ...makeDlqEntry(), ...data }),
        },
    } as any;

    const app = Fastify();
    await registerOutboundWebhookRoutes(app, { getSession: () => makeSession(), prisma });

    const res = await app.inject({ method: 'POST', url: '/v1/webhooks/dlq/dlq_1/retry' });
    assert.equal(res.statusCode, 200);
    assert.equal(fetchCalled, true);
    const body = JSON.parse(res.body);
    assert.equal(body.retried, true);
    assert.equal(body.webhookId, 'wh_1');
});

test('POST /v1/webhooks/dlq/:id/retry — 404 when DLQ entry not found', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, text: async () => 'ok' }));

    const prisma = {
        outboundWebhook: {
            findMany: async () => [],
            findUnique: async () => null,
            update: async () => null,
        },
        outboundWebhookDelivery: {
            findFirst: async () => null,
            findUnique: async () => null,
            create: async () => ({}),
        },
        webhookDlqEntry: {
            findUnique: async () => null,
            update: async () => null,
        },
    } as any;

    const app = Fastify();
    await registerOutboundWebhookRoutes(app, { getSession: () => makeSession(), prisma });

    const res = await app.inject({ method: 'POST', url: '/v1/webhooks/dlq/dlq_MISSING/retry' });
    assert.equal(res.statusCode, 404);
});

// ── Event catalog tests (Phase 27) ───────────────────────────────────────────

// POST /v1/webhooks/outbound: rejects unknown event type — 400, response includes validTypes
test('POST /v1/webhooks/outbound — unknown event type — 400 with validTypes', async () => {
    const app = Fastify();
    await registerOutboundWebhookRoutes(app, {
        getSession: () => makeSession(),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/webhooks/outbound',
            payload: { url: 'https://example.com/hook', events: ['not_a_real_event'] },
        });
        assert.equal(res.statusCode, 400);
        const body = res.json<{ error: string; invalid: string[]; validTypes: string[] }>();
        assert.equal(body.error, 'invalid_event_types');
        assert.ok(Array.isArray(body.invalid), 'invalid must be an array');
        assert.ok(body.invalid.includes('not_a_real_event'));
        assert.ok(Array.isArray(body.validTypes) && body.validTypes.length > 0, 'validTypes must be a non-empty array');
    } finally {
        await app.close();
    }
});

// POST /v1/webhooks/outbound: accepts a valid event type from the catalog — 201
test('POST /v1/webhooks/outbound — valid catalog event type — 201', async () => {
    const app = Fastify();
    await registerOutboundWebhookRoutes(app, {
        getSession: () => makeSession(),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/webhooks/outbound',
            payload: { url: 'https://example.com/hook', events: ['task_completed'] },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json<{ events: string[] }>();
        assert.ok(Array.isArray(body.events));
    } finally {
        await app.close();
    }
});

// GET /v1/webhooks/events — returns 200 with events array (no auth)
test('GET /v1/webhooks/events — 200 with events array (no auth required)', async () => {
    const app = Fastify();
    await registerOutboundWebhookRoutes(app, {
        getSession: () => null, // no session — public endpoint
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/webhooks/events' });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ events: unknown[]; count: number }>();
        assert.ok(Array.isArray(body.events) && body.events.length > 0, 'events must be a non-empty array');
        assert.ok(typeof body.count === 'number', 'count must be a number');
    } finally {
        await app.close();
    }
});

// GET /v1/webhooks/events — count matches events.length
test('GET /v1/webhooks/events — count matches events.length', async () => {
    const app = Fastify();
    await registerOutboundWebhookRoutes(app, {
        getSession: () => null,
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/webhooks/events' });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ events: unknown[]; count: number }>();
        assert.equal(body.count, body.events.length, 'count must equal events.length');
    } finally {
        await app.close();
    }
});

// GET /v1/webhooks/events/:eventType — returns 200 with schemaVersion
test('GET /v1/webhooks/events/:eventType — returns 200 with schemaVersion', async () => {
    const app = Fastify();
    await registerOutboundWebhookRoutes(app, {
        getSession: () => null,
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/webhooks/events/task_completed' });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ event: { schemaVersion: string; eventType: string } }>();
        assert.ok(body.event, 'event must be present');
        assert.ok(
            typeof body.event.schemaVersion === 'string' && body.event.schemaVersion.length > 0,
            'schemaVersion must be a non-empty string',
        );
        assert.equal(body.event.eventType, 'task_completed');
    } finally {
        await app.close();
    }
});

// GET /v1/webhooks/events/:unknownType — returns 404
test('GET /v1/webhooks/events/:unknownType — 404 for unknown event type', async () => {
    const app = Fastify();
    await registerOutboundWebhookRoutes(app, {
        getSession: () => null,
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/webhooks/events/this_event_does_not_exist' });
        assert.equal(res.statusCode, 404);
        const body = res.json<{ error: string }>();
        assert.equal(body.error, 'event_type_not_found');
    } finally {
        await app.close();
    }
});
