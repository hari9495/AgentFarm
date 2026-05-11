import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSubscription, isSubscriptionSuspended } from './subscription-guard.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeRequest = (url: string, session?: object) => ({
    url,
    session,
    headers: {},
} as any);

const makeReply = () => {
    const headers: Record<string, string> = {};
    let statusCode = 200;
    let body: unknown;
    return {
        code(n: number) { statusCode = n; return this; },
        send(b: unknown) { body = b; return this; },
        header(k: string, v: string) { headers[k] = v; return this; },
        _headers: headers,
        _status: () => statusCode,
        _body: () => body,
    };
};

// A mock prisma that throws if any DB call is made — used to assert "no DB call" scenarios.
const throwingPrisma = {
    tenantSubscription: {
        findUnique: () => { throw new Error('unexpected DB call: tenantSubscription'); },
    },
    agentSubscription: {
        findUnique: () => { throw new Error('unexpected DB call: agentSubscription'); },
    },
} as any;

const makePrisma = (
    tenantSub: { status: string } | null,
    agentSub: { status: string } | null = null,
) => ({
    tenantSubscription: {
        findUnique: async () => tenantSub,
    },
    agentSubscription: {
        findUnique: async () => agentSub,
    },
} as any);

const activeSession = {
    userId: 'user_1',
    tenantId: 'tenant_abc',
    workspaceIds: ['ws_1'],
    scope: 'customer' as const,
    expiresAt: Date.now() + 60_000,
};

// ---------------------------------------------------------------------------
// checkSubscription tests
// ---------------------------------------------------------------------------

test('checkSubscription — no session — allows through', async () => {
    const req = makeRequest('/v1/tasks');
    const reply = makeReply();
    // throwingPrisma ensures no DB call is made
    await checkSubscription(req, reply, throwingPrisma);
    assert.equal(reply._status(), 200);
    assert.equal(reply._body(), undefined);
});

test('checkSubscription — allowlisted route /v1/auth/login — allows through without DB call', async () => {
    const req = makeRequest('/v1/auth/login', activeSession);
    const reply = makeReply();
    await checkSubscription(req, reply, throwingPrisma);
    assert.equal(reply._status(), 200);
    assert.equal(reply._body(), undefined);
});

test('checkSubscription — allowlisted route /v1/billing/plans — allows through without DB call', async () => {
    const req = makeRequest('/v1/billing/plans', activeSession);
    const reply = makeReply();
    await checkSubscription(req, reply, throwingPrisma);
    assert.equal(reply._status(), 200);
    assert.equal(reply._body(), undefined);
});

test('checkSubscription — allowlisted route /v1/audit/trail — allows through without DB call', async () => {
    const req = makeRequest('/v1/audit/trail', activeSession);
    const reply = makeReply();
    await checkSubscription(req, reply, throwingPrisma);
    assert.equal(reply._status(), 200);
    assert.equal(reply._body(), undefined);
});

test('checkSubscription — active subscription — allows through', async () => {
    const req = makeRequest('/v1/workspaces/ws_1/approvals', activeSession);
    const reply = makeReply();
    const prisma = makePrisma({ status: 'active' });
    await checkSubscription(req, reply, prisma);
    assert.equal(reply._status(), 200);
    assert.equal(reply._body(), undefined);
    assert.equal(reply._headers['x-subscription-warning'], undefined);
});

test('checkSubscription — expired subscription — allows through with x-subscription-warning header', async () => {
    const req = makeRequest('/v1/workspaces/ws_1/approvals', activeSession);
    const reply = makeReply();
    const prisma = makePrisma({ status: 'expired' });
    await checkSubscription(req, reply, prisma);
    assert.equal(reply._status(), 200);
    assert.equal(reply._body(), undefined);
    assert.equal(reply._headers['x-subscription-warning'], 'expired');
});

test('checkSubscription — suspended subscription — returns 403 with SUBSCRIPTION_SUSPENDED', async () => {
    const req = makeRequest('/v1/workspaces/ws_1/approvals', activeSession);
    const reply = makeReply();
    const prisma = makePrisma({ status: 'suspended' });
    await checkSubscription(req, reply, prisma);
    assert.equal(reply._status(), 403);
    assert.deepEqual(reply._body(), {
        code: 'SUBSCRIPTION_SUSPENDED',
        message: 'Your subscription has been suspended. Please renew to continue.',
    });
});

test('checkSubscription — no subscription record — allows through', async () => {
    const req = makeRequest('/v1/workspaces/ws_1/approvals', activeSession);
    const reply = makeReply();
    const prisma = makePrisma(null);
    await checkSubscription(req, reply, prisma);
    assert.equal(reply._status(), 200);
    assert.equal(reply._body(), undefined);
    assert.equal(reply._headers['x-subscription-warning'], undefined);
});

// ---------------------------------------------------------------------------
// isSubscriptionSuspended tests
// ---------------------------------------------------------------------------

test('isSubscriptionSuspended — active agent sub — returns false even if tenant suspended', async () => {
    const prisma = makePrisma({ status: 'suspended' }, { status: 'active' });
    const result = await isSubscriptionSuspended('tenant_abc', 'agent_1', prisma);
    assert.equal(result, false);
});

test('isSubscriptionSuspended — no agent sub + tenant suspended — returns true', async () => {
    const prisma = makePrisma({ status: 'suspended' }, null);
    const result = await isSubscriptionSuspended('tenant_abc', 'agent_1', prisma);
    assert.equal(result, true);
});

test('isSubscriptionSuspended — no agent sub + tenant active — returns false', async () => {
    const prisma = makePrisma({ status: 'active' }, null);
    const result = await isSubscriptionSuspended('tenant_abc', 'agent_1', prisma);
    assert.equal(result, false);
});

test('isSubscriptionSuspended — no records at all — returns false', async () => {
    const prisma = makePrisma(null, null);
    const result = await isSubscriptionSuspended('tenant_abc', 'agent_1', prisma);
    assert.equal(result, false);
});
