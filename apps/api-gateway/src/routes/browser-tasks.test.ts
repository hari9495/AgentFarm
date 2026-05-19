/**
 * browser-tasks.test.ts — api-gateway route tests
 *
 * Pattern: node:test + node:assert/strict, Fastify instance per test group,
 * PrismaStub injected, runBrowserTaskFn stubbed to avoid real HTTP calls.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerBrowserTasksRoutes } from './browser-tasks.js';
import type { BrowserTaskRecord, SalesAgentConfigRecord } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

interface PrismaStub {
    browserTask: {
        created: Row[];
        updated: Row[];
        rows: Row[];
        create: (args: { data: Row }) => Promise<{ id: string }>;
        update: (args: { where: { id: string }; data: Row }) => Promise<{ id: string }>;
        findUnique: (args: { where: { id: string } }) => Promise<Row | null>;
        findMany: (args: { where: Row; skip?: number; take?: number; orderBy?: Row }) => Promise<Row[]>;
        count: (args: { where: Row }) => Promise<number>;
    };
    salesAgentConfig: {
        findFirst: (args: { where: Row }) => Promise<Row | null>;
    };
}

const now = new Date();

function makeTask(overrides: Partial<Row> = {}): Row {
    return {
        id: 'bt-1',
        tenantId: 't1',
        botId: 'bot-1',
        prospectId: null,
        dealId: null,
        goal: 'Find pricing',
        allowedDomain: null,
        status: 'completed',
        steps: JSON.stringify([]),
        result: 'Pricing starts at $99',
        errorMessage: null,
        startedAt: now.toISOString(),
        completedAt: now.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        ...overrides,
    };
}

function makePrismaStub(
    task: Row | null = null,
    tasks: Row[] = [],
    config: Row | null = { id: 'cfg-1', tenantId: 't1', botId: 'bot-1', browserEnabled: true, browserAllowedDomains: null },
): PrismaStub {
    const stub: PrismaStub = {
        browserTask: {
            created: [],
            updated: [],
            rows: tasks,
            async create(args) { stub.browserTask.created.push(args.data); return { id: 'bt-new-1' }; },
            async update(args) { stub.browserTask.updated.push(args.data); return { id: args.where.id }; },
            async findUnique({ where }) { return task && String(task['id']) === where.id ? task : null; },
            async findMany({ skip = 0, take = 25 }) { return tasks.slice(skip, skip + take); },
            async count() { return tasks.length; },
        },
        salesAgentConfig: {
            async findFirst() { return config; },
        },
    };
    return stub;
}

function makeRunBrowserTaskStub(result: BrowserTaskRecord) {
    return async () => result;
}

function makeApp(
    prisma: PrismaStub,
    session: SessionContext | null,
    runBrowserTaskFn?: typeof import('./browser-tasks.js').registerBrowserTasksRoutes extends (app: unknown, opts: { runBrowserTaskFn?: infer F }) => unknown ? F : never,
) {
    const app = Fastify({ logger: false });
    void registerBrowserTasksRoutes(app, {
        getSession: () => session,
        prisma: prisma as never,
        runBrowserTaskFn: runBrowserTaskFn as never,
    });
    return app;
}

const SESSION: SessionContext = {
    userId: 'u1',
    tenantId: 't1',
    workspaceIds: [],
    expiresAt: Date.now() + 3_600_000,
};

const TASK = makeTask();

const TASK_RECORD: BrowserTaskRecord = {
    id: 'bt-new-1',
    tenantId: 't1',
    botId: 'bot-1',
    prospectId: null,
    dealId: null,
    goal: 'Find pricing',
    allowedDomain: null,
    status: 'pending',
    steps: [],
    result: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
};

const CONFIG_ROW = { id: 'cfg-1', tenantId: 't1', botId: 'bot-1', browserEnabled: true, browserAllowedDomains: null } as unknown as SalesAgentConfigRecord;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /v1/sales/browser-tasks', () => {
    test('returns 401 when no session', async () => {
        const app = makeApp(makePrismaStub(), null);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/sales/browser-tasks',
            payload: { botId: 'bot-1', goal: 'Test goal' },
        });
        assert.equal(res.statusCode, 401);
    });

    test('returns 400 when botId missing', async () => {
        const app = makeApp(makePrismaStub(), SESSION, makeRunBrowserTaskStub(TASK_RECORD) as never);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/sales/browser-tasks',
            payload: { goal: 'Test goal' },
        });
        assert.equal(res.statusCode, 400);
    });

    test('returns 400 when goal missing', async () => {
        const app = makeApp(makePrismaStub(), SESSION, makeRunBrowserTaskStub(TASK_RECORD) as never);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/sales/browser-tasks',
            payload: { botId: 'bot-1' },
        });
        assert.equal(res.statusCode, 400);
    });

    test('returns 404 when SalesAgentConfig not found for botId', async () => {
        const prisma = makePrismaStub(null, [], null);
        const app = makeApp(prisma, SESSION, makeRunBrowserTaskStub(TASK_RECORD) as never);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/sales/browser-tasks',
            payload: { botId: 'unknown-bot', goal: 'Find pricing' },
        });
        assert.equal(res.statusCode, 404);
    });

    test('returns 202 with taskId when config found', async () => {
        const prisma = makePrismaStub(null, [], CONFIG_ROW as unknown as Row);
        const app = makeApp(prisma, SESSION, makeRunBrowserTaskStub(TASK_RECORD) as never);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/sales/browser-tasks',
            payload: { botId: 'bot-1', goal: 'Find pricing on example.com' },
        });
        assert.equal(res.statusCode, 202);
        const body = JSON.parse(res.body) as { taskId: string; status: string };
        assert.equal(typeof body.taskId, 'string');
        assert.ok(body.taskId.length > 0);
    });
});

describe('GET /v1/sales/browser-tasks/:id', () => {
    test('returns 401 when no session', async () => {
        const app = makeApp(makePrismaStub(TASK), null);
        const res = await app.inject({ method: 'GET', url: '/v1/sales/browser-tasks/bt-1' });
        assert.equal(res.statusCode, 401);
    });

    test('returns 404 when task not found', async () => {
        const app = makeApp(makePrismaStub(null), SESSION);
        const res = await app.inject({ method: 'GET', url: '/v1/sales/browser-tasks/bt-missing' });
        assert.equal(res.statusCode, 404);
    });

    test('returns 404 when task belongs to different tenant', async () => {
        const otherTask = makeTask({ tenantId: 'other-tenant' });
        const app = makeApp(makePrismaStub(otherTask), SESSION);
        const res = await app.inject({ method: 'GET', url: '/v1/sales/browser-tasks/bt-1' });
        assert.equal(res.statusCode, 404);
    });

    test('returns 200 with task record when found', async () => {
        const app = makeApp(makePrismaStub(TASK), SESSION);
        const res = await app.inject({ method: 'GET', url: '/v1/sales/browser-tasks/bt-1' });
        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.body) as Record<string, unknown>;
        assert.equal(body['id'], 'bt-1');
        assert.equal(body['goal'], 'Find pricing');
        assert.equal(body['status'], 'completed');
        assert.ok(Array.isArray(body['steps']), 'steps should be an array');
    });
});

describe('GET /v1/sales/browser-tasks', () => {
    test('returns 401 when no session', async () => {
        const app = makeApp(makePrismaStub(null, [TASK]), null);
        const res = await app.inject({ method: 'GET', url: '/v1/sales/browser-tasks' });
        assert.equal(res.statusCode, 401);
    });

    test('returns 200 with tasks list', async () => {
        const app = makeApp(makePrismaStub(null, [TASK]), SESSION);
        const res = await app.inject({ method: 'GET', url: '/v1/sales/browser-tasks' });
        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.body) as { tasks: unknown[]; total: number; page: number; limit: number };
        assert.ok(Array.isArray(body.tasks));
        assert.equal(body.tasks.length, 1);
        assert.equal(body.total, 1);
        assert.equal(body.page, 1);
        assert.equal(body.limit, 25);
    });

    test('returns 200 with empty tasks when none exist', async () => {
        const app = makeApp(makePrismaStub(null, []), SESSION);
        const res = await app.inject({ method: 'GET', url: '/v1/sales/browser-tasks' });
        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.body) as { tasks: unknown[]; total: number };
        assert.equal(body.tasks.length, 0);
        assert.equal(body.total, 0);
    });

    test('respects page and limit query params', async () => {
        const tasks = Array.from({ length: 5 }, (_, i) => makeTask({ id: `bt-${i}` }));
        const app = makeApp(makePrismaStub(null, tasks), SESSION);
        const res = await app.inject({ method: 'GET', url: '/v1/sales/browser-tasks?page=2&limit=2' });
        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.body) as { page: number; limit: number };
        assert.equal(body.page, 2);
        assert.equal(body.limit, 2);
    });
});
