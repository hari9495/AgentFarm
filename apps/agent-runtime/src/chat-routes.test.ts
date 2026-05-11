import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerChatRoutes } from './chat-routes.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeSession = (id = 'session_1', tenantId = 'tenant_1') => ({
    id,
    tenantId,
    agentId: null,
    title: null,
    createdAt: new Date(),
    updatedAt: new Date(),
});

const makeMessage = (id = 'msg_1', sessionId = 'session_1', role = 'assistant', content = 'Hello') => ({
    id,
    sessionId,
    role,
    content,
    createdAt: new Date(),
});

type PrismaOverrides = Partial<{
    'chatSession.findMany': (args?: unknown) => unknown;
    'chatSession.findUnique': (args?: unknown) => unknown;
    'chatSession.create': (args?: unknown) => unknown;
    'chatSession.update': (args?: unknown) => unknown;
    'chatSession.delete': (args?: unknown) => unknown;
    'chatMessage.findMany': (args?: unknown) => unknown;
    'chatMessage.create': (args?: unknown) => unknown;
}>;

function makePrisma(overrides: PrismaOverrides = {}): import('@prisma/client').PrismaClient {
    return {
        chatSession: {
            findMany: overrides['chatSession.findMany'] ?? (() => Promise.resolve([])),
            findUnique: overrides['chatSession.findUnique'] ?? (() => Promise.resolve(null)),
            create: overrides['chatSession.create'] ?? (() => Promise.resolve(makeSession())),
            update: overrides['chatSession.update'] ?? (() => Promise.resolve(makeSession())),
            delete: overrides['chatSession.delete'] ?? (() => Promise.resolve(makeSession())),
        },
        chatMessage: {
            findMany: overrides['chatMessage.findMany'] ?? (() => Promise.resolve([])),
            create: overrides['chatMessage.create'] ?? (() => Promise.resolve(makeMessage())),
        },
    } as unknown as import('@prisma/client').PrismaClient;
}

function mockGetChatReply(content = 'mocked reply') {
    return async () => ({ content });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('GET /chat/sessions: returns 400 when tenantId missing', async () => {
    const app = Fastify();
    registerChatRoutes(app, { prisma: makePrisma() });
    try {
        const res = await app.inject({ method: 'GET', url: '/chat/sessions' });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('GET /chat/sessions: returns sessions list for tenant', async () => {
    const sessions = [makeSession('s1'), makeSession('s2')];
    const app = Fastify();
    registerChatRoutes(app, {
        prisma: makePrisma({ 'chatSession.findMany': () => Promise.resolve(sessions) }),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/chat/sessions?tenantId=tenant_1',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.equal(body.sessions.length, 2);
    } finally {
        await app.close();
    }
});

test('POST /chat/sessions: returns 400 when tenantId missing', async () => {
    const app = Fastify();
    registerChatRoutes(app, { prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/chat/sessions',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title: 'Test' }),
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('POST /chat/sessions: creates and returns new session', async () => {
    const created = makeSession('new_session', 'tenant_1');
    const app = Fastify();
    registerChatRoutes(app, {
        prisma: makePrisma({ 'chatSession.create': () => Promise.resolve(created) }),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/chat/sessions',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tenantId: 'tenant_1', title: 'My chat' }),
        });
        assert.equal(res.statusCode, 201);
        const body = res.json();
        assert.equal(body.session.id, 'new_session');
    } finally {
        await app.close();
    }
});

test('GET /chat/sessions/:sessionId/messages: returns 404 for unknown session', async () => {
    const app = Fastify();
    registerChatRoutes(app, {
        prisma: makePrisma({ 'chatSession.findUnique': () => Promise.resolve(null) }),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/chat/sessions/bad_id/messages?tenantId=tenant_1',
        });
        assert.equal(res.statusCode, 404);
    } finally {
        await app.close();
    }
});

test('GET /chat/sessions/:sessionId/messages: returns messages for valid session', async () => {
    const session = makeSession('s1', 'tenant_1');
    const messages = [makeMessage('m1', 's1', 'user', 'Hi'), makeMessage('m2', 's1', 'assistant', 'Hello')];
    const app = Fastify();
    registerChatRoutes(app, {
        prisma: makePrisma({
            'chatSession.findUnique': () => Promise.resolve(session),
            'chatMessage.findMany': () => Promise.resolve(messages),
        }),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/chat/sessions/s1/messages?tenantId=tenant_1',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.equal(body.messages.length, 2);
    } finally {
        await app.close();
    }
});

test('POST /chat/sessions/:sessionId/messages: returns 400 when content missing', async () => {
    const session = makeSession('s1', 'tenant_1');
    const app = Fastify();
    registerChatRoutes(app, {
        prisma: makePrisma({ 'chatSession.findUnique': () => Promise.resolve(session) }),
        getChatReply: mockGetChatReply() as unknown as typeof import('./chat-service.js').getChatReply,
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/chat/sessions/s1/messages',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tenantId: 'tenant_1' }),
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('POST /chat/sessions/:sessionId/messages: creates user + assistant messages', async () => {
    const session = makeSession('s1', 'tenant_1');
    const userMsg = makeMessage('m1', 's1', 'user', 'Hi');
    const assistantMsg = makeMessage('m2', 's1', 'assistant', 'mocked reply');
    let createCallCount = 0;

    const app = Fastify();
    registerChatRoutes(app, {
        prisma: makePrisma({
            'chatSession.findUnique': () => Promise.resolve(session),
            'chatMessage.findMany': () => Promise.resolve([userMsg]),
            'chatMessage.create': () => {
                createCallCount++;
                return Promise.resolve(createCallCount === 1 ? userMsg : assistantMsg);
            },
            'chatSession.update': () => Promise.resolve(session),
        }),
        getChatReply: mockGetChatReply('mocked reply') as unknown as typeof import('./chat-service.js').getChatReply,
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/chat/sessions/s1/messages',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tenantId: 'tenant_1', content: 'Hi' }),
        });
        assert.equal(res.statusCode, 201);
        const body = res.json();
        assert.equal(body.message.role, 'assistant');
        assert.equal(createCallCount, 2);
    } finally {
        await app.close();
    }
});

test('DELETE /chat/sessions/:sessionId: returns 404 for unknown session', async () => {
    const app = Fastify();
    registerChatRoutes(app, {
        prisma: makePrisma({ 'chatSession.findUnique': () => Promise.resolve(null) }),
    });
    try {
        const res = await app.inject({
            method: 'DELETE',
            url: '/chat/sessions/bad_id?tenantId=tenant_1',
        });
        assert.equal(res.statusCode, 404);
    } finally {
        await app.close();
    }
});

test('DELETE /chat/sessions/:sessionId: deletes session and returns 204', async () => {
    const session = makeSession('s1', 'tenant_1');
    let deleted = false;
    const app = Fastify();
    registerChatRoutes(app, {
        prisma: makePrisma({
            'chatSession.findUnique': () => Promise.resolve(session),
            'chatSession.delete': () => { deleted = true; return Promise.resolve(session); },
        }),
    });
    try {
        const res = await app.inject({
            method: 'DELETE',
            url: '/chat/sessions/s1?tenantId=tenant_1',
        });
        assert.equal(res.statusCode, 204);
        assert.ok(deleted);
    } finally {
        await app.close();
    }
});
