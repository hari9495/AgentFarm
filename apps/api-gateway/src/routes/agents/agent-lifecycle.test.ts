/**
 * agent-lifecycle.test.ts — unit tests for the fire-agent terminate route
 * Uses node:test + assert (api-gateway convention — no vitest).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerAgentLifecycleRoutes } from './agent-lifecycle.js';
import type { PrismaClient } from '@prisma/client';

type MockSession = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

type MockPrismaDelegate = {
    findUnique: (args?: unknown) => Promise<unknown>;
    findFirst: (args?: unknown) => Promise<unknown>;
    create: (args?: unknown) => Promise<unknown>;
};

const makeDelegate = (result: unknown): MockPrismaDelegate => ({
    findUnique: async () => result,
    findFirst: async () => result,
    create: async (_args?: unknown) => result,
});

const makePrisma = (
    bot: unknown = null,
    workspace: unknown = null,
    existingJob: unknown = null,
    createdJob: unknown = { id: 'job_new', status: 'cleanup_pending' },
): PrismaClient => ({
    bot: { ...makeDelegate(bot), findUnique: async () => bot },
    workspace: { ...makeDelegate(workspace), findUnique: async () => workspace },
    provisioningJob: {
        ...makeDelegate(null),
        findFirst: async () => existingJob,
        create: async () => createdJob,
    },
} as unknown as PrismaClient);

const makeApp = (session: MockSession | null, prisma: PrismaClient) => {
    const app = Fastify({ logger: false });
    registerAgentLifecycleRoutes(app, { getSession: () => session, prisma });
    return app;
};

const baseSession: MockSession = {
    userId: 'user_1',
    tenantId: 'tenant_abc',
    workspaceIds: ['ws_1'],
    scope: 'customer',
    expiresAt: Date.now() + 3_600_000,
};

const bot = { id: 'bot_1', workspaceId: 'ws_1', role: 'developer_agent' };
const workspace = { id: 'ws_1', tenantId: 'tenant_abc' };

// ── POST /v1/agents/:botId/terminate ────────────────────────────────────────

test('POST /v1/agents/:botId/terminate — 401 when no session', async () => {
    const app = makeApp(null, makePrisma());
    const res = await app.inject({ method: 'POST', url: '/v1/agents/bot_1/terminate' });
    await app.close();
    assert.equal(res.statusCode, 401);
});

test('POST /v1/agents/:botId/terminate — 404 when bot not found', async () => {
    const app = makeApp(baseSession, makePrisma(null, workspace));
    const res = await app.inject({ method: 'POST', url: '/v1/agents/missing_bot/terminate' });
    await app.close();
    assert.equal(res.statusCode, 404);
    assert.match(res.json<{ error: string }>().error, /bot not found/i);
});

test('POST /v1/agents/:botId/terminate — 404 when workspace not found', async () => {
    const app = makeApp(baseSession, makePrisma(bot, null));
    const res = await app.inject({ method: 'POST', url: '/v1/agents/bot_1/terminate' });
    await app.close();
    assert.equal(res.statusCode, 404);
    assert.match(res.json<{ error: string }>().error, /workspace not found/i);
});

test('POST /v1/agents/:botId/terminate — 403 when bot belongs to different tenant', async () => {
    const otherWorkspace = { id: 'ws_1', tenantId: 'other_tenant' };
    const app = makeApp(baseSession, makePrisma(bot, otherWorkspace));
    const res = await app.inject({ method: 'POST', url: '/v1/agents/bot_1/terminate' });
    await app.close();
    assert.equal(res.statusCode, 403);
    assert.match(res.json<{ error: string }>().error, /forbidden/i);
});

test('POST /v1/agents/:botId/terminate — 202 with reused=true when active job exists', async () => {
    const existing = { id: 'job_existing' };
    const app = makeApp(baseSession, makePrisma(bot, workspace, existing));
    const res = await app.inject({ method: 'POST', url: '/v1/agents/bot_1/terminate' });
    await app.close();
    assert.equal(res.statusCode, 202);
    const body = res.json<{ reused: boolean; jobId: string }>();
    assert.equal(body.reused, true);
    assert.equal(body.jobId, 'job_existing');
});

test('POST /v1/agents/:botId/terminate — 202 with reused=false and new job created', async () => {
    const createdJob = { id: 'job_new', status: 'cleanup_pending', triggerSource: 'termination', botId: 'bot_1' };
    let capturedData: Record<string, unknown> | undefined;
    const prisma = {
        bot: { findUnique: async () => bot },
        workspace: { findUnique: async () => workspace },
        provisioningJob: {
            findFirst: async () => null,
            create: async (args: { data: Record<string, unknown> }) => {
                capturedData = args.data;
                return createdJob;
            },
        },
    } as unknown as PrismaClient;
    const app = makeApp(baseSession, prisma);
    const res = await app.inject({ method: 'POST', url: '/v1/agents/bot_1/terminate' });
    await app.close();
    assert.equal(res.statusCode, 202);
    const body = res.json<{ reused: boolean; jobId: string; status: string }>();
    assert.equal(body.reused, false);
    assert.equal(body.jobId, 'job_new');
    assert.equal(body.status, 'cleanup_pending');
    assert.equal(capturedData?.triggerSource, 'termination');
    assert.equal(capturedData?.status, 'cleanup_pending');
    assert.equal(capturedData?.botId, 'bot_1');
});

test('POST /v1/agents/:botId/terminate — internal session can terminate cross-tenant bot', async () => {
    const internalSession: MockSession = { ...baseSession, tenantId: 'internal_tenant', scope: 'internal' };
    const otherWorkspace = { id: 'ws_1', tenantId: 'different_tenant' };
    const app = makeApp(internalSession, makePrisma(bot, otherWorkspace, null));
    const res = await app.inject({ method: 'POST', url: '/v1/agents/bot_1/terminate' });
    await app.close();
    assert.equal(res.statusCode, 202);
});

// ── GET /v1/agents/:botId/terminate/status ───────────────────────────────────

test('GET /v1/agents/:botId/terminate/status — 401 when no session', async () => {
    const app = makeApp(null, makePrisma());
    const res = await app.inject({ method: 'GET', url: '/v1/agents/bot_1/terminate/status' });
    await app.close();
    assert.equal(res.statusCode, 401);
});

test('GET /v1/agents/:botId/terminate/status — 404 when no termination job', async () => {
    const app = makeApp(baseSession, makePrisma(null, null, null));
    const res = await app.inject({ method: 'GET', url: '/v1/agents/bot_1/terminate/status' });
    await app.close();
    assert.equal(res.statusCode, 404);
});

test('GET /v1/agents/:botId/terminate/status — 200 with job details', async () => {
    const mockJob = {
        id: 'job_123',
        status: 'cleaned_up',
        correlationId: 'corr_abc',
        requestedAt: new Date(),
        completedAt: new Date(),
        cleanupResult: 'Resources fully deprovisioned.',
        failureReason: null,
    };
    const app = makeApp(baseSession, makePrisma(null, null, mockJob));
    const res = await app.inject({ method: 'GET', url: '/v1/agents/bot_1/terminate/status' });
    await app.close();
    assert.equal(res.statusCode, 200);
    const body = res.json<{ jobId: string; status: string }>();
    assert.equal(body.jobId, 'job_123');
    assert.equal(body.status, 'cleaned_up');
});
