import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerAgentMessageRoutes } from './agent-messages.js';

const session = () => ({
    userId: 'user-1',
    tenantId: 'tenant-1',
    workspaceIds: ['ws-1'],
    expiresAt: Date.now() + 60_000,
});

const sampleMessage = () => ({
    id: 'msg-1',
    fromBotId: 'bot-1',
    toBotId: 'bot-2',
    threadId: 'thread-1',
    messageType: 'QUESTION',
    subject: 'Test question',
    body: 'What is the status?',
    metadata: null,
    status: 'PENDING',
    readAt: null,
    repliedAt: null,
    replyToId: null,
    createdAt: new Date(),
    expiresAt: null,
});

const makePrisma = (overrides: Record<string, unknown> = {}) => ({
    agentMessage: {
        create: async (args: { data: Record<string, unknown> }) => ({
            ...sampleMessage(),
            ...args.data,
            id: 'msg-new-1',
        }),
        findMany: async () => [sampleMessage()],
        findUnique: async () => sampleMessage(),
        findFirst: async () => sampleMessage(),
        update: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => ({
            ...sampleMessage(),
            ...args.data,
        }),
        ...(overrides['agentMessage'] as Record<string, unknown> | undefined ?? {}),
    },
    bot: {
        findFirst: async () => ({ id: 'bot-1', workspaceId: 'ws-1' }),
        ...(overrides['bot'] as Record<string, unknown> | undefined ?? {}),
    },
});

// ── POST /v1/agents/:botId/messages/send ──────────────────────────────────────

test('POST /v1/agents/:botId/messages/send — valid payload returns 201', async () => {
    const app = Fastify();
    registerAgentMessageRoutes(app, {
        getSession: () => session(),
        getPrisma: async () => makePrisma() as never,
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/agents/bot-1/messages/send',
            payload: { toBotId: 'bot-2', messageType: 'QUESTION', body: 'Hello?' },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json() as { message: { id: string } };
        assert.ok(body.message.id, 'message.id should be present');
    } finally {
        await app.close();
    }
});

test('POST /v1/agents/:botId/messages/send — missing toBotId returns 400', async () => {
    const app = Fastify();
    registerAgentMessageRoutes(app, {
        getSession: () => session(),
        getPrisma: async () => makePrisma() as never,
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/agents/bot-1/messages/send',
            payload: { messageType: 'QUESTION', body: 'Hello?' },
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('POST /v1/agents/:botId/messages/send — invalid messageType returns 400', async () => {
    const app = Fastify();
    registerAgentMessageRoutes(app, {
        getSession: () => session(),
        getPrisma: async () => makePrisma() as never,
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/agents/bot-1/messages/send',
            payload: { toBotId: 'bot-2', messageType: 'INVALID_TYPE', body: 'Hello?' },
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('POST /v1/agents/:botId/messages/send — no session returns 401', async () => {
    const app = Fastify();
    registerAgentMessageRoutes(app, {
        getSession: () => null,
        getPrisma: async () => makePrisma() as never,
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/agents/bot-1/messages/send',
            payload: { toBotId: 'bot-2', messageType: 'QUESTION', body: 'Hello?' },
        });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('POST /v1/agents/:botId/messages/send — bot not in session returns 403', async () => {
    const app = Fastify();
    registerAgentMessageRoutes(app, {
        getSession: () => session(),
        getPrisma: async () => makePrisma({ bot: { findFirst: async () => null } }) as never,
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/agents/bot-99/messages/send',
            payload: { toBotId: 'bot-2', messageType: 'QUESTION', body: 'Hello?' },
        });
        assert.equal(res.statusCode, 403);
    } finally {
        await app.close();
    }
});

// ── GET /v1/agents/:botId/messages/inbox ─────────────────────────────────────

test('GET /v1/agents/:botId/messages/inbox — returns inbox messages', async () => {
    const app = Fastify();
    registerAgentMessageRoutes(app, {
        getSession: () => session(),
        getPrisma: async () => makePrisma() as never,
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/agents/bot-1/messages/inbox' });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { messages: unknown[]; total: number };
        assert.ok(Array.isArray(body.messages), 'messages should be an array');
        assert.ok(typeof body.total === 'number', 'total should be a number');
    } finally {
        await app.close();
    }
});

test('GET /v1/agents/:botId/messages/inbox — no session returns 401', async () => {
    const app = Fastify();
    registerAgentMessageRoutes(app, {
        getSession: () => null,
        getPrisma: async () => makePrisma() as never,
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/agents/bot-1/messages/inbox' });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

// ── GET /v1/agents/:botId/messages/sent ──────────────────────────────────────

test('GET /v1/agents/:botId/messages/sent — returns sent messages', async () => {
    const app = Fastify();
    registerAgentMessageRoutes(app, {
        getSession: () => session(),
        getPrisma: async () => makePrisma() as never,
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/agents/bot-1/messages/sent' });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { messages: unknown[]; total: number };
        assert.ok(Array.isArray(body.messages));
    } finally {
        await app.close();
    }
});

// ── PATCH /v1/agents/:botId/messages/:messageId/status ───────────────────────

test('PATCH status — valid status update returns 200', async () => {
    const app = Fastify();
    registerAgentMessageRoutes(app, {
        getSession: () => session(),
        getPrisma: async () => makePrisma() as never,
    });
    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/agents/bot-1/messages/msg-1/status',
            payload: { status: 'READ' },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { message: { status: string } };
        assert.ok(body.message, 'message should be present');
    } finally {
        await app.close();
    }
});

test('PATCH status — invalid status returns 400', async () => {
    const app = Fastify();
    registerAgentMessageRoutes(app, {
        getSession: () => session(),
        getPrisma: async () => makePrisma() as never,
    });
    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/agents/bot-1/messages/msg-1/status',
            payload: { status: 'INVALID' },
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('PATCH status — message not found returns 404', async () => {
    const app = Fastify();
    registerAgentMessageRoutes(app, {
        getSession: () => session(),
        getPrisma: async () =>
            makePrisma({ agentMessage: { ...makePrisma().agentMessage, findFirst: async () => null } }) as never,
    });
    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/agents/bot-1/messages/msg-nonexistent/status',
            payload: { status: 'READ' },
        });
        assert.equal(res.statusCode, 404);
    } finally {
        await app.close();
    }
});

// ── POST /v1/agents/:botId/messages/:messageId/reply ─────────────────────────

test('POST reply — valid reply returns 201', async () => {
    const app = Fastify();
    registerAgentMessageRoutes(app, {
        getSession: () => session(),
        getPrisma: async () => makePrisma() as never,
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/agents/bot-1/messages/msg-1/reply',
            payload: { body: 'The status is OK.' },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json() as { message: { id: string } };
        assert.ok(body.message.id, 'reply message.id should be present');
    } finally {
        await app.close();
    }
});

// ── GET /v1/agents/:botId/messages/thread/:threadId ──────────────────────────

test('GET thread — returns thread messages', async () => {
    const app = Fastify();
    registerAgentMessageRoutes(app, {
        getSession: () => session(),
        getPrisma: async () => makePrisma() as never,
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/agents/bot-1/messages/thread/thread-1',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { threadId: string; messages: unknown[]; total: number };
        assert.equal(body.threadId, 'thread-1');
        assert.ok(Array.isArray(body.messages));
    } finally {
        await app.close();
    }
});
