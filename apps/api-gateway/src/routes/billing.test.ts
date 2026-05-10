import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerBillingRoutes } from './billing.js';
import type { PrismaClient } from '@prisma/client';

const makeSession = (tenantId = 'tenant-1') => ({
    userId: 'user-1',
    tenantId,
    workspaceIds: ['ws-1'],
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
