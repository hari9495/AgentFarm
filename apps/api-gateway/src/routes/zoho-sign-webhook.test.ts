import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerZohoSignWebhookRoutes } from './zoho-sign-webhook.js';
import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Mock Prisma builder
// ---------------------------------------------------------------------------

type MockPrismaOverrides = {
    order?: Record<string, unknown>;
    provisioningJob?: Record<string, unknown>;
    plan?: Record<string, unknown>;
    workspace?: Record<string, unknown>;
    bot?: Record<string, unknown>;
};

function buildMockPrisma(overrides: MockPrismaOverrides = {}): PrismaClient {
    return {
        order: {
            findFirst: async () => null,
            update: async () => ({}),
            ...overrides.order,
        },
        provisioningJob: {
            findFirst: async () => null,
            create: async (args: { data: Record<string, unknown> }) => ({ id: 'job-mock', ...args.data }),
            ...overrides.provisioningJob,
        },
        plan: {
            findFirst: async () => null,
            ...overrides.plan,
        },
        workspace: {
            findFirst: async () => null,
            ...overrides.workspace,
        },
        bot: {
            findFirst: async () => null,
            ...overrides.bot,
        },
    } as unknown as PrismaClient;
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

async function buildApp(prisma?: PrismaClient) {
    process.env['ZOHO_SIGN_WEBHOOK_TOKEN'] = 'valid-webhook-token';
    const app = Fastify();
    await registerZohoSignWebhookRoutes(app, { prisma });
    return app;
}

const VALID_HEADERS = { 'x-zoho-webhook-token': 'valid-webhook-token' };

const COMPLETED_PAYLOAD = {
    requests: { request_id: 'req-abc', request_status: 'completed' },
};

const sampleOrder = {
    id: 'order-1',
    tenantId: 'tenant-1',
    planId: 'plan-1',
    amountCents: 99900,
    currency: 'INR',
    customerEmail: 'alice@example.com',
    zohoSignRequestId: 'req-abc',
    status: 'paid',
};

const samplePlan = {
    id: 'plan-1',
    name: 'Professional',
    agentSlots: 5,
    features: 'API access, Priority support',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('zoho-sign-webhook', () => {
    test('returns 401 when webhook token is missing', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/webhooks/zoho-sign',
            // No x-zoho-webhook-token header
            payload: COMPLETED_PAYLOAD,
        });
        assert.equal(res.statusCode, 401);
        assert.equal(JSON.parse(res.body).error, 'Unauthorized');
    });

    test('returns 401 when webhook token is wrong', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/webhooks/zoho-sign',
            headers: { 'x-zoho-webhook-token': 'wrong-token' },
            payload: COMPLETED_PAYLOAD,
        });
        assert.equal(res.statusCode, 401);
        assert.equal(JSON.parse(res.body).error, 'Unauthorized');
    });

    test('returns 200 and ignores non-completed request_status', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/webhooks/zoho-sign',
            headers: VALID_HEADERS,
            payload: { requests: { request_id: 'req-abc', request_status: 'inprogress' } },
        });
        assert.equal(res.statusCode, 200);
        assert.equal(JSON.parse(res.body).received, true);
    });

    test('returns 200 (idempotent) when order is not found', async () => {
        // order.findFirst returns null (default)
        const prisma = buildMockPrisma();
        const app = await buildApp(prisma);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/webhooks/zoho-sign',
            headers: VALID_HEADERS,
            payload: { requests: { request_id: 'req-not-found', request_status: 'completed' } },
        });
        assert.equal(res.statusCode, 200);
        assert.equal(JSON.parse(res.body).received, true);
    });

    test('returns 200 and updates order signatureStatus to signed on valid webhook', async () => {
        let updatedData: Record<string, unknown> | null = null;

        const prisma = buildMockPrisma({
            order: {
                findFirst: async () => ({ ...sampleOrder }),
                update: async (args: { data: Record<string, unknown> }) => {
                    updatedData = args.data;
                    return { ...sampleOrder, ...args.data };
                },
            },
            provisioningJob: {
                findFirst: async () => null,
                create: async () => ({ id: 'job-new' }),
            },
            plan: {
                findFirst: async () => ({ ...samplePlan }),
            },
        });

        const app = await buildApp(prisma);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/webhooks/zoho-sign',
            headers: VALID_HEADERS,
            payload: COMPLETED_PAYLOAD,
        });

        assert.equal(res.statusCode, 200);
        assert.ok(updatedData, 'order.update should have been called');
        assert.equal((updatedData as Record<string, unknown>)['signatureStatus'], 'signed');
        assert.ok((updatedData as Record<string, unknown>)['signedAt'] instanceof Date);
    });

    test('creates ProvisioningJob with correct fields when contract is signed', async () => {
        let capturedJobData: Record<string, unknown> | null = null;

        const prisma = buildMockPrisma({
            order: {
                findFirst: async () => ({ ...sampleOrder }),
                update: async () => ({}),
            },
            provisioningJob: {
                findFirst: async () => null,
                create: async (args: { data: Record<string, unknown> }) => {
                    capturedJobData = args.data;
                    return { id: 'job-created', ...args.data };
                },
            },
            plan: {
                findFirst: async () => ({ ...samplePlan }),
            },
        });

        const app = await buildApp(prisma);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/webhooks/zoho-sign',
            headers: VALID_HEADERS,
            payload: COMPLETED_PAYLOAD,
        });

        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.body);
        assert.equal(body.jobId, 'job-created');
        assert.ok(capturedJobData, 'provisioningJob.create should have been called');
        assert.equal((capturedJobData as Record<string, unknown>)['triggeredBy'], 'zoho_sign_webhook');
        assert.equal((capturedJobData as Record<string, unknown>)['triggerSource'], 'zoho_sign_webhook');
        assert.equal((capturedJobData as Record<string, unknown>)['status'], 'queued');
        assert.equal((capturedJobData as Record<string, unknown>)['orderId'], 'order-1');
        assert.equal((capturedJobData as Record<string, unknown>)['tenantId'], 'tenant-1');
    });

    test('does not create duplicate ProvisioningJob if one already exists', async () => {
        let jobCreateCalled = false;

        const prisma = buildMockPrisma({
            order: {
                findFirst: async () => ({ ...sampleOrder }),
                update: async () => ({}),
            },
            provisioningJob: {
                findFirst: async () => ({ id: 'existing-job', orderId: 'order-1', status: 'queued' }),
                create: async () => {
                    jobCreateCalled = true;
                    return { id: 'should-not-be-created' };
                },
            },
        });

        const app = await buildApp(prisma);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/webhooks/zoho-sign',
            headers: VALID_HEADERS,
            payload: COMPLETED_PAYLOAD,
        });

        assert.equal(res.statusCode, 200);
        assert.equal(JSON.parse(res.body).received, true);
        assert.equal(jobCreateCalled, false, 'should not create a duplicate ProvisioningJob');
    });
});
