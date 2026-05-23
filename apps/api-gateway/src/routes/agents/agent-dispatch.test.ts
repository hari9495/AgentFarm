import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerAgentDispatchRoutes } from './agent-dispatch.js';
import type { AgentDispatchResult } from '@agentfarm/shared-types';

const buildSession = () => ({
    userId: 'user_1',
    tenantId: 'tenant_1',
    workspaceIds: ['ws_1'],
    expiresAt: Date.now() + 60_000,
});

const validBody = {
    fromAgentId: 'agent-code',
    toAgentId: 'agent-security',
    workspaceId: 'ws_1',
    tenantId: 'tenant_1',
    taskDescription: 'Run a security review on the latest PR',
};

const buildPrismaStub = (overrides: Partial<{ create: () => Promise<void> }> = {}) => ({
    agentDispatchRecord: {
        create: overrides.create ?? (async () => { /* no-op */ }),
    },
});

test('POST /v1/agents/dispatch with valid body returns 202 with dispatchId', async () => {
    const app = Fastify({ logger: false });
    await registerAgentDispatchRoutes(app, {
        getSession: () => buildSession(),
        prisma: buildPrismaStub() as never,
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/agents/dispatch',
            payload: validBody,
        });

        assert.equal(response.statusCode, 202);
        const body = response.json() as AgentDispatchResult;
        assert.equal(body.fromAgentId, 'agent-code');
        assert.equal(body.toAgentId, 'agent-security');
        assert.equal(body.status, 'queued');
        assert.ok(typeof body.dispatchId === 'string' && body.dispatchId.length > 0);
        assert.ok(typeof body.queuedAt === 'string');
    } finally {
        await app.close();
    }
});

test('POST /v1/agents/dispatch missing toAgentId returns 400', async () => {
    const app = Fastify({ logger: false });
    await registerAgentDispatchRoutes(app, {
        getSession: () => buildSession(),
        prisma: buildPrismaStub() as never,
    });

    try {
        const { toAgentId: _, ...body } = validBody;
        const response = await app.inject({
            method: 'POST',
            url: '/v1/agents/dispatch',
            payload: body,
        });

        assert.equal(response.statusCode, 400);
        const parsed = response.json() as { error: string };
        assert.ok(parsed.error.includes('toAgentId'));
    } finally {
        await app.close();
    }
});

test('POST /v1/agents/dispatch missing taskDescription returns 400', async () => {
    const app = Fastify({ logger: false });
    await registerAgentDispatchRoutes(app, {
        getSession: () => buildSession(),
        prisma: buildPrismaStub() as never,
    });

    try {
        const { taskDescription: _, ...body } = validBody;
        const response = await app.inject({
            method: 'POST',
            url: '/v1/agents/dispatch',
            payload: body,
        });

        assert.equal(response.statusCode, 400);
        const parsed = response.json() as { error: string };
        assert.ok(parsed.error.includes('taskDescription'));
    } finally {
        await app.close();
    }
});

test('POST /v1/agents/dispatch with Prisma error still returns 202 with status failed', async () => {
    const app = Fastify({ logger: false });
    await registerAgentDispatchRoutes(app, {
        getSession: () => buildSession(),
        prisma: buildPrismaStub({
            create: async () => { throw new Error('DB connection failed'); },
        }) as never,
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/agents/dispatch',
            payload: validBody,
        });

        assert.equal(response.statusCode, 202);
        const body = response.json() as AgentDispatchResult;
        assert.equal(body.status, 'failed');
        assert.ok(typeof body.error === 'string' && body.error.length > 0);
        assert.ok(typeof body.dispatchId === 'string');
    } finally {
        await app.close();
    }
});

test('dispatchId in response is a valid UUID', async () => {
    const app = Fastify({ logger: false });
    await registerAgentDispatchRoutes(app, {
        getSession: () => buildSession(),
        prisma: buildPrismaStub() as never,
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/agents/dispatch',
            payload: validBody,
        });

        assert.equal(response.statusCode, 202);
        const body = response.json() as AgentDispatchResult;
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        assert.match(body.dispatchId, uuidPattern, `expected UUID but got: ${body.dispatchId}`);
    } finally {
        await app.close();
    }
});
