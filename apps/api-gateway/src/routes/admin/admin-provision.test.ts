import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerAdminProvisionRoutes } from './admin-provision.js';
import type { PrismaClient } from '@prisma/client';

const internalSession = {
    userId: 'admin-user-1',
    tenantId: 'tenant-admin',
    workspaceIds: [],
    scope: 'internal' as const,
    expiresAt: Date.now() + 3_600_000,
};

const customerSession = {
    userId: 'cust-user-1',
    tenantId: 'tenant-cust',
    workspaceIds: ['ws-001'],
    scope: 'customer' as const,
    expiresAt: Date.now() + 3_600_000,
};

const stubOrder = {
    id: 'ord-001',
    tenantId: 'tenant-001',
    planId: 'plan-pro-001',
    amountCents: 24900,
    currency: 'usd',
    status: 'paid',
    paymentProvider: 'stripe',
    providerOrderId: 'pi_001',
    providerPaymentId: 'ch_001',
    providerSignature: null,
    customerEmail: 'buyer@example.com',
    customerCountry: 'US',
    createdAt: new Date(),
    updatedAt: new Date(),
};

const stubPlan = {
    id: 'plan-pro-001',
    name: 'Pro',
    priceInr: 24900,
    priceUsd: 24900,
    agentSlots: 10,
    features: '["10 agents"]',
    isActive: true,
    createdAt: new Date(),
};

const stubWorkspace = {
    id: 'ws-001',
    tenantId: 'tenant-001',
    name: 'Primary Workspace',
    status: 'provisioning',
    createdAt: new Date(),
};

const stubBot = {
    id: 'bot-001',
    workspaceId: 'ws-001',
    role: 'developer_agent',
    status: 'created',
    createdAt: new Date(),
    updatedAt: new Date(),
};

const stubJob = {
    id: 'job-001',
    tenantId: 'tenant-001',
    workspaceId: 'ws-001',
    botId: 'bot-001',
    planId: 'plan-pro-001',
    runtimeTier: 'dedicated_vm',
    roleType: 'developer_agent',
    correlationId: 'corr_provision_123',
    triggerSource: 'admin_billing',
    status: 'queued',
    requestedBy: 'admin-user-1',
    requestedAt: new Date(),
    orderId: 'ord-001',
    triggeredBy: 'admin',
    metadata: '{"planName":"Pro","customerEmail":"buyer@example.com","agentSlots":10}',
    failureReason: null,
    remediationHint: null,
    cleanupResult: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
};

function buildMockPrisma(overrides: Partial<{
    orderResult: typeof stubOrder | null;
    planResult: typeof stubPlan | null;
    workspaceResult: typeof stubWorkspace | null;
    botResult: typeof stubBot | null;
    jobResult: typeof stubJob | null;
}> = {}): PrismaClient {
    const {
        orderResult = stubOrder,
        planResult = stubPlan,
        workspaceResult = stubWorkspace,
        botResult = stubBot,
        jobResult = stubJob,
    } = overrides;

    return {
        order: { findFirst: () => Promise.resolve(orderResult) },
        plan: { findFirst: () => Promise.resolve(planResult) },
        workspace: { findFirst: () => Promise.resolve(workspaceResult) },
        bot: { findFirst: () => Promise.resolve(botResult) },
        provisioningJob: {
            create: () => Promise.resolve(jobResult!),
            findFirst: () => Promise.resolve(jobResult),
        },
    } as unknown as PrismaClient;
}

describe('admin-provision routes', () => {
    // -----------------------------------------------------------------------
    // POST /v1/admin/provision — 401 when no session
    // -----------------------------------------------------------------------
    test('POST returns 401 when no session', async () => {
        const app = Fastify({ logger: false });
        await registerAdminProvisionRoutes(app, {
            getSession: () => null,
            prisma: buildMockPrisma(),
        });

        const res = await app.inject({
            method: 'POST',
            url: '/v1/admin/provision',
            payload: { tenantId: 'tenant-001', orderId: 'ord-001' },
        });

        assert.strictEqual(res.statusCode, 401);
    });

    // -----------------------------------------------------------------------
    // POST /v1/admin/provision — 403 for non-admin (customer) session
    // -----------------------------------------------------------------------
    test('POST returns 403 for customer session', async () => {
        const app = Fastify({ logger: false });
        await registerAdminProvisionRoutes(app, {
            getSession: () => customerSession,
            prisma: buildMockPrisma(),
        });

        const res = await app.inject({
            method: 'POST',
            url: '/v1/admin/provision',
            payload: { tenantId: 'tenant-001', orderId: 'ord-001' },
        });

        assert.strictEqual(res.statusCode, 403);
    });

    // -----------------------------------------------------------------------
    // POST /v1/admin/provision — 404 when order not found
    // -----------------------------------------------------------------------
    test('POST returns 404 when order not found', async () => {
        const app = Fastify({ logger: false });
        await registerAdminProvisionRoutes(app, {
            getSession: () => internalSession,
            prisma: buildMockPrisma({ orderResult: null }),
        });

        const res = await app.inject({
            method: 'POST',
            url: '/v1/admin/provision',
            payload: { tenantId: 'tenant-001', orderId: 'ord-missing' },
        });

        assert.strictEqual(res.statusCode, 404);
        const body = JSON.parse(res.body) as { error: string };
        assert.ok(body.error.includes('Order not found'));
    });

    // -----------------------------------------------------------------------
    // POST /v1/admin/provision — 400 when order not paid
    // -----------------------------------------------------------------------
    test('POST returns 400 when order is not paid', async () => {
        const pendingOrder = { ...stubOrder, status: 'pending' };
        const app = Fastify({ logger: false });
        await registerAdminProvisionRoutes(app, {
            getSession: () => internalSession,
            prisma: buildMockPrisma({ orderResult: pendingOrder }),
        });

        const res = await app.inject({
            method: 'POST',
            url: '/v1/admin/provision',
            payload: { tenantId: 'tenant-001', orderId: 'ord-001' },
        });

        assert.strictEqual(res.statusCode, 400);
        const body = JSON.parse(res.body) as { error: string };
        assert.ok(body.error.includes('paid'));
    });

    // -----------------------------------------------------------------------
    // POST /v1/admin/provision — 200 and queued job when order is paid
    // -----------------------------------------------------------------------
    test('POST returns 200 and queues job for paid order', async () => {
        const app = Fastify({ logger: false });
        await registerAdminProvisionRoutes(app, {
            getSession: () => internalSession,
            prisma: buildMockPrisma(),
        });

        const res = await app.inject({
            method: 'POST',
            url: '/v1/admin/provision',
            payload: { tenantId: 'tenant-001', orderId: 'ord-001' },
        });

        assert.strictEqual(res.statusCode, 200);
        const body = JSON.parse(res.body) as { jobId: string; status: string; message: string };
        assert.strictEqual(body.status, 'queued');
        assert.ok(typeof body.jobId === 'string');
        assert.ok(body.message.toLowerCase().includes('provisioning'));
    });

    // -----------------------------------------------------------------------
    // GET /v1/admin/provision/:jobId/status — 200 returns job details
    // -----------------------------------------------------------------------
    test('GET returns job status', async () => {
        const app = Fastify({ logger: false });
        await registerAdminProvisionRoutes(app, {
            getSession: () => internalSession,
            prisma: buildMockPrisma(),
        });

        const res = await app.inject({
            method: 'GET',
            url: '/v1/admin/provision/job-001/status',
        });

        assert.strictEqual(res.statusCode, 200);
        const body = JSON.parse(res.body) as { jobId: string; status: string; tenantId: string };
        assert.strictEqual(body.status, 'queued');
        assert.strictEqual(body.tenantId, 'tenant-001');
    });

    // -----------------------------------------------------------------------
    // GET /v1/admin/provision/:jobId/status — 404 for unknown job
    // -----------------------------------------------------------------------
    test('GET returns 404 for unknown jobId', async () => {
        const app = Fastify({ logger: false });
        await registerAdminProvisionRoutes(app, {
            getSession: () => internalSession,
            prisma: buildMockPrisma({ jobResult: null }),
        });

        const res = await app.inject({
            method: 'GET',
            url: '/v1/admin/provision/job-not-found/status',
        });

        assert.strictEqual(res.statusCode, 404);
        const body = JSON.parse(res.body) as { error: string };
        assert.ok(body.error.includes('not found'));
    });
});
