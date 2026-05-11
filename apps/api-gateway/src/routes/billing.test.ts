import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerBillingRoutes } from './billing.js';
import type { PrismaClient } from '@prisma/client';

const makeSession = (tenantId = 'tenant-1') => ({
    userId: 'user-1',
    tenantId,
    workspaceIds: ['ws-1'],
    role: 'admin',
    expiresAt: Date.now() + 60_000,
});

function makePrisma(): PrismaClient {
    return {
        taskExecutionRecord: {
            aggregate: async () => ({
                _count: { id: 0 },
                _sum: { estimatedCostUsd: 0, promptTokens: 0, completionTokens: 0 },
            }),
        },
        order: {
            findMany: async () => [],
        },
        plan: {
            findMany: async () => [],
            findFirst: async () => null,
        },
    } as unknown as PrismaClient;
}

// ── tenantId isolation tests ──────────────────────────────────────────────────

test('GET /v1/billing/cost-summary — mismatched tenantId → 403', async () => {
    const app = Fastify({ logger: false });
    await registerBillingRoutes(app, {
        getSession: () => makeSession('tenant-A'),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/billing/cost-summary?tenantId=tenant-B',
        });
        assert.equal(res.statusCode, 403);
        assert.equal(res.json<{ error: string }>().error, 'forbidden');
    } finally {
        await app.close();
    }
});

test('GET /v1/billing/cost-summary — correct tenantId → 200', async () => {
    const app = Fastify({ logger: false });
    await registerBillingRoutes(app, {
        getSession: () => makeSession('tenant-1'),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/billing/cost-summary?tenantId=tenant-1',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ tenantId: string }>();
        assert.equal(body.tenantId, 'tenant-1');
    } finally {
        await app.close();
    }
});

test('GET /v1/billing/orders/:tenantId — mismatched tenantId → 403', async () => {
    const app = Fastify({ logger: false });
    await registerBillingRoutes(app, {
        getSession: () => makeSession('tenant-A'),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/billing/orders/tenant-B',
        });
        assert.equal(res.statusCode, 403);
        assert.equal(res.json<{ error: string }>().error, 'forbidden');
    } finally {
        await app.close();
    }
});

test('GET /v1/billing/orders/:tenantId — correct tenantId → 200', async () => {
    const app = Fastify({ logger: false });
    await registerBillingRoutes(app, {
        getSession: () => makeSession('tenant-1'),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/billing/orders/tenant-1',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ orders: unknown[] }>();
        assert.ok(Array.isArray(body.orders));
    } finally {
        await app.close();
    }
});

test('POST /v1/billing/create-order — no session → 401', async () => {
    const app = Fastify({ logger: false });
    await registerBillingRoutes(app, {
        getSession: () => null,
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/billing/create-order',
            payload: { planId: 'plan-1', customerEmail: 'a@b.com', tenantId: 'tenant-1' },
        });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('POST /v1/billing/create-order — mismatched tenantId → 403', async () => {
    const app = Fastify({ logger: false });
    await registerBillingRoutes(app, {
        getSession: () => makeSession('tenant-A'),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/billing/create-order',
            payload: { planId: 'plan-1', customerEmail: 'a@b.com', tenantId: 'tenant-B' },
        });
        assert.equal(res.statusCode, 403);
        assert.equal(res.json<{ error: string }>().error, 'forbidden');
    } finally {
        await app.close();
    }
});

// ── GET /v1/billing/subscription tests ───────────────────────────────────────

type SubRecord = {
    status: string;
    expiresAt: Date;
    gracePeriodDays: number;
    suspendedAt: Date | null;
} | null;

function makeSubPrisma(sub: SubRecord): PrismaClient {
    return {
        ...makePrisma(),
        tenantSubscription: {
            findUnique: async () => sub,
        },
    } as unknown as PrismaClient;
}

test('GET /v1/billing/subscription — missing tenantId — 400', async () => {
    const app = Fastify({ logger: false });
    await registerBillingRoutes(app, {
        getSession: () => makeSession(),
        prisma: makeSubPrisma(null),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/billing/subscription' });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('GET /v1/billing/subscription — no subscription record — returns { status: none }', async () => {
    const app = Fastify({ logger: false });
    await registerBillingRoutes(app, {
        getSession: () => makeSession(),
        prisma: makeSubPrisma(null),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/billing/subscription?tenantId=tenant-1',
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json<{ status: string }>().status, 'none');
    } finally {
        await app.close();
    }
});

test('GET /v1/billing/subscription — active subscription — returns status + expiresAt', async () => {
    const expiresAt = new Date(Date.now() + 30 * 86400000);
    const app = Fastify({ logger: false });
    await registerBillingRoutes(app, {
        getSession: () => makeSession(),
        prisma: makeSubPrisma({
            status: 'active',
            expiresAt,
            gracePeriodDays: 3,
            suspendedAt: null,
        }),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/billing/subscription?tenantId=tenant-1',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ status: string; expiresAt: string; daysUntilSuspension: null }>();
        assert.equal(body.status, 'active');
        assert.ok(body.expiresAt);
        assert.equal(body.daysUntilSuspension, null);
    } finally {
        await app.close();
    }
});

test('GET /v1/billing/subscription — expired subscription — returns daysUntilSuspension', async () => {
    const expiresAt = new Date(Date.now() - 1 * 86400000); // expired 1 day ago
    const app = Fastify({ logger: false });
    await registerBillingRoutes(app, {
        getSession: () => makeSession(),
        prisma: makeSubPrisma({
            status: 'expired',
            expiresAt,
            gracePeriodDays: 3,
            suspendedAt: null,
        }),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/billing/subscription?tenantId=tenant-1',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ status: string; daysUntilSuspension: number }>();
        assert.equal(body.status, 'expired');
        assert.ok(typeof body.daysUntilSuspension === 'number');
        assert.ok(body.daysUntilSuspension >= 0);
    } finally {
        await app.close();
    }
});

test('GET /v1/billing/subscription — suspended subscription — returns suspendedAt', async () => {
    const suspendedAt = new Date(Date.now() - 2 * 86400000);
    const app = Fastify({ logger: false });
    await registerBillingRoutes(app, {
        getSession: () => makeSession(),
        prisma: makeSubPrisma({
            status: 'suspended',
            expiresAt: new Date(Date.now() - 5 * 86400000),
            gracePeriodDays: 3,
            suspendedAt,
        }),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/billing/subscription?tenantId=tenant-1',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ status: string; suspendedAt: string; daysUntilSuspension: null }>();
        assert.equal(body.status, 'suspended');
        assert.ok(body.suspendedAt);
        assert.equal(body.daysUntilSuspension, null);
    } finally {
        await app.close();
    }
});
