import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerNotificationRoutes } from './notifications.js';

const session = () => ({
    userId: 'user-1',
    tenantId: 'tenant-1',
    workspaceIds: ['ws-1'],
    expiresAt: Date.now() + 60_000,
});

const makeMockPrisma = (overrides: Record<string, unknown> = {}) => ({
    notificationLog: {
        create: async (args: { data: Record<string, unknown> }) => {
            return { id: 'notif-log-1', ...args.data };
        },
        findMany: async () => [
            { id: 'notif-log-1', tenantId: 'tenant-1', workspaceId: null, channel: 'email', eventTrigger: 'task_complete', status: 'sent', error: null, sentAt: new Date() },
        ],
        groupBy: async () => [
            { channel: 'email', status: 'sent', _count: { id: 3 } },
            { channel: 'slack', status: 'failed', _count: { id: 1 } },
        ],
        ...overrides,
    },
});

test('POST /v1/notifications/log with valid body returns 201 with id', async () => {
    const app = Fastify();
    registerNotificationRoutes(app, {
        getSession: () => session(),
        getPrisma: async () => makeMockPrisma() as Parameters<typeof registerNotificationRoutes>[1]['getPrisma'] extends (() => Promise<infer T>) | undefined ? T : never,
    });

    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/notifications/log',
            payload: {
                tenantId: 'tenant-1',
                channel: 'email',
                eventTrigger: 'task_complete',
                status: 'sent',
            },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json() as { id: string };
        assert.ok(typeof body.id === 'string' && body.id.length > 0, 'response should include an id');
    } finally {
        await app.close();
    }
});

test('POST /v1/notifications/log missing tenantId returns 400', async () => {
    const app = Fastify();
    registerNotificationRoutes(app, {
        getSession: () => session(),
        getPrisma: async () => makeMockPrisma() as Parameters<typeof registerNotificationRoutes>[1]['getPrisma'] extends (() => Promise<infer T>) | undefined ? T : never,
    });

    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/notifications/log',
            payload: { channel: 'email', eventTrigger: 'task_complete', status: 'sent' },
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('POST /v1/notifications/log missing status returns 400', async () => {
    const app = Fastify();
    registerNotificationRoutes(app, {
        getSession: () => session(),
        getPrisma: async () => makeMockPrisma() as Parameters<typeof registerNotificationRoutes>[1]['getPrisma'] extends (() => Promise<infer T>) | undefined ? T : never,
    });

    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/notifications/log',
            payload: { tenantId: 'tenant-1', channel: 'email', eventTrigger: 'task_complete' },
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('GET /v1/notifications requires auth — no session returns 401', async () => {
    const app = Fastify();
    registerNotificationRoutes(app, {
        getSession: () => null,
        getPrisma: async () => makeMockPrisma() as Parameters<typeof registerNotificationRoutes>[1]['getPrisma'] extends (() => Promise<infer T>) | undefined ? T : never,
    });

    try {
        const res = await app.inject({ method: 'GET', url: '/v1/notifications' });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('GET /v1/notifications/summary requires auth — no session returns 401', async () => {
    const app = Fastify();
    registerNotificationRoutes(app, {
        getSession: () => null,
        getPrisma: async () => makeMockPrisma() as Parameters<typeof registerNotificationRoutes>[1]['getPrisma'] extends (() => Promise<infer T>) | undefined ? T : never,
    });

    try {
        const res = await app.inject({ method: 'GET', url: '/v1/notifications/summary' });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('GET /v1/notifications returns notifications array', async () => {
    const app = Fastify();
    registerNotificationRoutes(app, {
        getSession: () => session(),
        getPrisma: async () => makeMockPrisma() as Parameters<typeof registerNotificationRoutes>[1]['getPrisma'] extends (() => Promise<infer T>) | undefined ? T : never,
    });

    try {
        const res = await app.inject({ method: 'GET', url: '/v1/notifications' });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { notifications: unknown[] };
        assert.ok(Array.isArray(body.notifications));
        assert.equal(body.notifications.length, 1);
    } finally {
        await app.close();
    }
});
