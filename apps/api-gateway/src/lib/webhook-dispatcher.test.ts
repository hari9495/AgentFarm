import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { dispatchOutboundWebhooks } from './webhook-dispatcher.js';

// ── Prisma mock helpers ───────────────────────────────────────────────────────

type DeliveryData = {
    webhookId: string;
    tenantId: string;
    eventType: string;
    success: boolean;
    responseStatus: number | null;
    payload: unknown;
};

const makeEvent = (overrides: Partial<Parameters<typeof dispatchOutboundWebhooks>[0]> = {}) => ({
    tenantId: 'tenant_1',
    workspaceId: 'ws_1',
    eventType: 'task_completed',
    taskId: 'task_abc',
    payload: { result: 'ok' },
    timestamp: '2026-05-11T10:00:00.000Z',
    ...overrides,
});

const makeWebhook = (overrides: Record<string, unknown> = {}) => ({
    id: 'wh_1',
    url: 'https://customer.example.com/hook',
    secret: 'secret-key-1',
    events: ['task_completed', 'task_failed'],
    workspaceId: null,
    ...overrides,
});

const makePrisma = (webhooks: ReturnType<typeof makeWebhook>[], deliveries: DeliveryData[] = []) => ({
    outboundWebhook: {
        findMany: async () => webhooks,
    },
    outboundWebhookDelivery: {
        create: ({ data }: { data: DeliveryData }) => {
            deliveries.push(data);
            return Promise.resolve({});
        },
    },
} as any);

// ── Tests ─────────────────────────────────────────────────────────────────────

test('dispatchOutboundWebhooks — no matching webhooks — fetch not called', async (t) => {
    const fetchCalls: unknown[] = [];
    t.mock.method(globalThis, 'fetch', async (...args: unknown[]) => {
        fetchCalls.push(args);
        return new Response('', { status: 200 });
    });

    const prisma = makePrisma([]);
    await dispatchOutboundWebhooks(makeEvent(), prisma);
    assert.equal(fetchCalls.length, 0);
});

test('dispatchOutboundWebhooks — webhook not subscribed to this eventType — fetch not called', async (t) => {
    const fetchCalls: unknown[] = [];
    t.mock.method(globalThis, 'fetch', async (...args: unknown[]) => {
        fetchCalls.push(args);
        return new Response('', { status: 200 });
    });

    const prisma = makePrisma([makeWebhook({ events: ['task_started'] })]);
    await dispatchOutboundWebhooks(makeEvent({ eventType: 'task_completed' }), prisma);
    assert.equal(fetchCalls.length, 0);
});

test('dispatchOutboundWebhooks — matching webhook — fetch called with correct URL and headers', async (t) => {
    const fetchCalls: Array<[string, RequestInit]> = [];
    t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
        fetchCalls.push([url, init]);
        return new Response('ok', { status: 200 });
    });

    const prisma = makePrisma([makeWebhook()]);
    await dispatchOutboundWebhooks(makeEvent(), prisma);

    assert.equal(fetchCalls.length, 1);
    const [url, init] = fetchCalls[0];
    assert.equal(url, 'https://customer.example.com/hook');
    assert.equal(init.method, 'POST');
    const headers = init.headers as Record<string, string>;
    assert.equal(headers['Content-Type'], 'application/json');
    assert.equal(headers['X-AgentFarm-Event'], 'task_completed');
});

test('dispatchOutboundWebhooks — HMAC signature present in X-AgentFarm-Signature header', async (t) => {
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = '';
    t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
        capturedHeaders = init.headers as Record<string, string>;
        capturedBody = init.body as string;
        return new Response('ok', { status: 200 });
    });

    const prisma = makePrisma([makeWebhook({ secret: 'my-secret' })]);
    await dispatchOutboundWebhooks(makeEvent(), prisma);

    const expectedSig = 'sha256=' + createHmac('sha256', 'my-secret').update(capturedBody).digest('hex');
    assert.equal(capturedHeaders['X-AgentFarm-Signature'], expectedSig);
});

test('dispatchOutboundWebhooks — fetch returns non-ok — success=false logged', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response('error body', { status: 500 }));

    const deliveries: DeliveryData[] = [];
    const prisma = makePrisma([makeWebhook()], deliveries);
    await dispatchOutboundWebhooks(makeEvent(), prisma);

    // flush microtasks so fire-and-forget delivery create runs
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].success, false);
    assert.equal(deliveries[0].responseStatus, 500);
});

test('dispatchOutboundWebhooks — fetch throws — success=false logged, no throw', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => {
        throw new Error('network error');
    });

    const deliveries: DeliveryData[] = [];
    const prisma = makePrisma([makeWebhook()], deliveries);

    // Must not throw
    await assert.doesNotReject(dispatchOutboundWebhooks(makeEvent(), prisma));

    await Promise.resolve();
    await Promise.resolve();

    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].success, false);
    assert.equal(deliveries[0].responseStatus, null);
});

test('dispatchOutboundWebhooks — workspaceId filter — only fires for matching workspace', async (t) => {
    const fetchCalls: unknown[] = [];
    t.mock.method(globalThis, 'fetch', async (...args: unknown[]) => {
        fetchCalls.push(args);
        return new Response('ok', { status: 200 });
    });

    const webhooks = [
        makeWebhook({ id: 'wh_match', workspaceId: 'ws_1' }),
        makeWebhook({ id: 'wh_skip', workspaceId: 'ws_other' }),
    ];
    const prisma = makePrisma(webhooks);
    await dispatchOutboundWebhooks(makeEvent({ workspaceId: 'ws_1' }), prisma);

    assert.equal(fetchCalls.length, 1);
});
