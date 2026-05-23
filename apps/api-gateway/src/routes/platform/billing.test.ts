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

// ── POST /v1/billing/checkout-session ────────────────────────────────────────

function makeCheckoutPrisma(plan: { id: string; priceUsdCents: number; isActive: boolean } | null): PrismaClient {
    return {
        ...makePrisma(),
        plan: {
            findMany: async () => (plan ? [plan] : []),
            findFirst: async () => plan,
        },
        order: {
            findMany: async () => [],
            create: async () => ({
                id: 'order-stub',
                tenantId: 'tenant-1',
                planId: plan?.id ?? 'plan-1',
                amountCents: plan?.priceUsdCents ?? 0,
                currency: 'usd',
                status: 'pending',
                paymentProvider: 'stripe',
                providerOrderId: 'cs_test_stub',
                createdAt: new Date(),
                updatedAt: new Date(),
            }),
        },
    } as unknown as PrismaClient;
}

test('POST /v1/billing/checkout-session — no session → 401', async () => {
    const app = Fastify({ logger: false });
    await registerBillingRoutes(app, {
        getSession: () => null,
        prisma: makeCheckoutPrisma(null),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/billing/checkout-session',
            payload: {
                planId: 'plan-1',
                customerEmail: 'a@b.com',
                tenantId: 'tenant-1',
                successUrl: 'https://example.com/success',
                cancelUrl: 'https://example.com/cancel',
            },
        });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('POST /v1/billing/checkout-session — mismatched tenantId → 403', async () => {
    const app = Fastify({ logger: false });
    await registerBillingRoutes(app, {
        getSession: () => makeSession('tenant-A'),
        prisma: makeCheckoutPrisma(null),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/billing/checkout-session',
            payload: {
                planId: 'plan-1',
                customerEmail: 'a@b.com',
                tenantId: 'tenant-B',
                successUrl: 'https://example.com/success',
                cancelUrl: 'https://example.com/cancel',
            },
        });
        assert.equal(res.statusCode, 403);
        assert.equal(res.json<{ error: string }>().error, 'forbidden');
    } finally {
        await app.close();
    }
});

test('POST /v1/billing/checkout-session — missing fields → 400', async () => {
    const app = Fastify({ logger: false });
    await registerBillingRoutes(app, {
        getSession: () => makeSession('tenant-1'),
        prisma: makeCheckoutPrisma(null),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/billing/checkout-session',
            payload: { planId: 'plan-1', tenantId: 'tenant-1' },
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('POST /v1/billing/checkout-session — plan not found → 404', async () => {
    const app = Fastify({ logger: false });
    await registerBillingRoutes(app, {
        getSession: () => makeSession('tenant-1'),
        prisma: makeCheckoutPrisma(null),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/billing/checkout-session',
            payload: {
                planId: 'plan-missing',
                customerEmail: 'a@b.com',
                tenantId: 'tenant-1',
                successUrl: 'https://example.com/success',
                cancelUrl: 'https://example.com/cancel',
            },
        });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json<{ error: string }>().error, 'plan_not_found');
    } finally {
        await app.close();
    }
});

// ── GET /v1/billing/invoices/:invoiceId/download ──────────────────────────────

function makeInvoicePrisma(invoice: Record<string, unknown> | null): PrismaClient {
    return {
        ...makePrisma(),
        invoice: {
            findFirst: async () => invoice,
        },
    } as unknown as PrismaClient;
}

test('GET /v1/billing/invoices/:invoiceId/download — no session → 401', async () => {
    const app = Fastify({ logger: false });
    await registerBillingRoutes(app, {
        getSession: () => null,
        prisma: makeInvoicePrisma(null),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/billing/invoices/inv-1/download' });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('GET /v1/billing/invoices/:invoiceId/download — not found → 404', async () => {
    const app = Fastify({ logger: false });
    await registerBillingRoutes(app, {
        getSession: () => makeSession('tenant-1'),
        prisma: makeInvoicePrisma(null),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/billing/invoices/inv-999/download' });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json<{ error: string }>().error, 'invoice_not_found');
    } finally {
        await app.close();
    }
});

test('GET /v1/billing/invoices/:invoiceId/download — found → 200 with invoice data', async () => {
    const app = Fastify({ logger: false });
    const invoice = {
        id: 'inv-1',
        number: 'INV-2026-001',
        amountCents: 9900,
        currency: 'usd',
        pdfUrl: 'https://storage.example.com/inv-1.pdf',
        paidAt: new Date('2026-05-01'),
        createdAt: new Date('2026-05-01'),
        order: { id: 'order-1', planId: 'plan-starter', status: 'paid' },
    };
    await registerBillingRoutes(app, {
        getSession: () => makeSession('tenant-1'),
        prisma: makeInvoicePrisma(invoice),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/billing/invoices/inv-1/download' });
        assert.equal(res.statusCode, 200);
        const body = res.json<{
            invoiceId: string;
            number: string;
            amountCents: number;
            pdfUrl: string;
        }>();
        assert.equal(body.invoiceId, 'inv-1');
        assert.equal(body.number, 'INV-2026-001');
        assert.equal(body.amountCents, 9900);
        assert.equal(body.pdfUrl, 'https://storage.example.com/inv-1.pdf');
    } finally {
        await app.close();
    }
});

// ── POST /v1/billing/webhook/stripe ──────────────────────────────────────────

test('POST /v1/billing/webhook/stripe — missing stripe-signature header → 400', async () => {
    const app = Fastify({ logger: false });
    await registerBillingRoutes(app, {
        getSession: () => null,
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/billing/webhook/stripe',
            payload: JSON.stringify({ type: 'checkout.session.completed', data: { object: {} } }),
            headers: { 'content-type': 'application/json' },
        });
        // No valid stripe-signature → verifyStripeWebhook returns success:false → 400
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('POST /v1/billing/webhook/stripe — invalid stripe-signature value → 400', async () => {
    const app = Fastify({ logger: false });
    await registerBillingRoutes(app, {
        getSession: () => null,
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/billing/webhook/stripe',
            payload: JSON.stringify({ type: 'checkout.session.completed', data: { object: {} } }),
            headers: {
                'content-type': 'application/json',
                'stripe-signature': 'invalid_sig',
            },
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

// ── POST /v1/billing/webhook/razorpay ────────────────────────────────────────

test('POST /v1/billing/webhook/razorpay — missing razorpay-signature header → 400', async () => {
    const app = Fastify({ logger: false });
    await registerBillingRoutes(app, {
        getSession: () => null,
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/billing/webhook/razorpay',
            payload: JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: {} } } }),
            headers: { 'content-type': 'application/json' },
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

