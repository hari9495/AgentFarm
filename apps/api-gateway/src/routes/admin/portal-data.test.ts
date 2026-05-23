import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { PortalSessionData } from '../lib/portal-session.js';
import { registerPortalDataRoutes, type PortalDataRepo } from './portal-data.js';

// ---------------------------------------------------------------------------
// Local record types (mirror portal-data.ts internal types)
// ---------------------------------------------------------------------------

type BotRecord = {
    id: string;
    role: string;
    status: string;
    workspaceId: string;
    createdAt: Date;
    updatedAt: Date;
    workspace: { name: string };
};

type TaskRecord = {
    id: string;
    outcome: string;
    latencyMs: number;
    estimatedCostUsd: number | null;
    createdAt: Date;
    modelProfile: string;
};

type TaskRawRecord = {
    botId: string;
    outcome: string;
    estimatedCostUsd: number | null;
};

type SubscriptionRecord = {
    id: string;
    tenantId: string;
    planId: string;
    status: string;
    paymentProvider: string;
    startedAt: Date;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
};

type AccountRecord = {
    id: string;
    email: string;
    displayName: string | null;
    role: string;
    createdAt: Date;
    lastLoginAt: Date | null;
};

type TenantRecord = {
    id: string;
    name: string;
    status: string;
};

// ---------------------------------------------------------------------------
// Mock repo factory
// ---------------------------------------------------------------------------

type MockState = {
    bots: BotRecord[];
    findBotReturn: BotRecord | null;
    taskReturn: TaskRecord[];
    taskCount: number;
    taskCost: number;
    recentTasks: Array<{ createdAt: Date; outcome: string }>;
    botsForTenant: Array<{ id: string; role: string }>;
    tasksByBotIds: TaskRawRecord[];
    subscription: SubscriptionRecord | null;
    invoices: unknown[];
    orders: unknown[];
    messages: unknown[];
    accountReturn: AccountRecord | null;
    tenantReturn: TenantRecord | null;
    // Call capture
    listBotsCalled: { tenantId: string; limit: number } | null;
    displayNameUpdated: string | null;
};

const createMockRepo = (): { repo: PortalDataRepo; state: MockState } => {
    const state: MockState = {
        bots: [],
        findBotReturn: null,
        taskReturn: [],
        taskCount: 0,
        taskCost: 0,
        recentTasks: [],
        botsForTenant: [],
        tasksByBotIds: [],
        subscription: null,
        invoices: [],
        orders: [],
        messages: [],
        accountReturn: null,
        tenantReturn: null,
        listBotsCalled: null,
        displayNameUpdated: null,
    };

    const repo: PortalDataRepo = {
        async listBots(tenantId, limit) {
            state.listBotsCalled = { tenantId, limit };
            return state.bots;
        },
        async findBot(_botId, _tenantId) {
            return state.findBotReturn;
        },
        async listTasksForBot(_botId, _tenantId, _limit) {
            return state.taskReturn;
        },
        async countTasks(_tenantId) {
            return state.taskCount;
        },
        async sumTaskCost(_tenantId) {
            return state.taskCost;
        },
        async listRecentTasks(_tenantId, _since) {
            return state.recentTasks;
        },
        async listBotsForTenant(_tenantId) {
            return state.botsForTenant;
        },
        async listTasksByBotIds(_tenantId) {
            return state.tasksByBotIds;
        },
        async findSubscription(_tenantId) {
            return state.subscription;
        },
        async listInvoices(_tenantId, _take) {
            return state.invoices as never;
        },
        async listOrders(_tenantId, _take) {
            return state.orders as never;
        },
        async listMessages(_tenantId, _limit) {
            return state.messages as never;
        },
        async findAccount(_accountId) {
            return state.accountReturn;
        },
        async findTenant(_tenantId) {
            return state.tenantReturn;
        },
        async updateDisplayName(_accountId, displayName) {
            state.displayNameUpdated = displayName;
            const base = state.accountReturn ?? {
                id: 'acc-1',
                email: 'user@tenant.com',
                displayName: null,
                role: 'VIEWER',
                createdAt: new Date(),
                lastLoginAt: null,
            };
            return { ...base, displayName };
        },
    };

    return { repo, state };
};

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

const MOCK_SESSION: PortalSessionData = {
    accountId: 'acc-1',
    tenantId: 'tenant-1',
    email: 'user@tenant.com',
    role: 'VIEWER',
    displayName: null,
};

const validSession =
    (): ((request: FastifyRequest, reply: FastifyReply) => Promise<PortalSessionData | null>) =>
        () =>
            Promise.resolve(MOCK_SESSION);

const noSession =
    (): ((request: FastifyRequest, reply: FastifyReply) => Promise<PortalSessionData | null>) =>
        (_req: FastifyRequest, rep: FastifyReply) => {
            void rep.code(401).send({ error: 'unauthorized' });
            return Promise.resolve(null);
        };

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

const buildApp = (
    repo: PortalDataRepo,
    requireSession: (request: FastifyRequest, reply: FastifyReply) => Promise<PortalSessionData | null> = validSession(),
) => {
    const app = Fastify();
    return {
        app,
        register: () => registerPortalDataRoutes(app, { repo, requireSession }),
    };
};

// ---------------------------------------------------------------------------
// GET /portal/data/agents
// ---------------------------------------------------------------------------

test('GET /portal/data/agents — returns agents scoped to tenantId → 200', async () => {
    const now = new Date();
    const { repo, state } = createMockRepo();
    state.bots = [
        {
            id: 'bot-1',
            role: 'developer',
            status: 'active',
            workspaceId: 'ws-1',
            createdAt: now,
            updatedAt: now,
            workspace: { name: 'Workspace One' },
        },
    ];

    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({ method: 'GET', url: '/portal/data/agents' });
    assert.equal(res.statusCode, 200);
    const body = res.json<{ agents: BotRecord[]; total: number }>();
    assert.equal(body.agents.length, 1);
    assert.equal(body.agents[0].id, 'bot-1');
    assert.equal(body.total, 1);
    // Confirm tenantId from session was used
    assert.equal(state.listBotsCalled?.tenantId, 'tenant-1');
});

test('GET /portal/data/agents — no portal session → 401', async () => {
    const { repo } = createMockRepo();
    const { app, register } = buildApp(repo, noSession());
    await register();

    const res = await app.inject({ method: 'GET', url: '/portal/data/agents' });
    assert.equal(res.statusCode, 401);
});

test('GET /portal/data/agents — limit param is respected', async () => {
    const { repo, state } = createMockRepo();
    const { app, register } = buildApp(repo);
    await register();

    await app.inject({ method: 'GET', url: '/portal/data/agents?limit=5' });
    assert.equal(state.listBotsCalled?.limit, 5);
});

test('GET /portal/data/agents — limit capped at 100', async () => {
    const { repo, state } = createMockRepo();
    const { app, register } = buildApp(repo);
    await register();

    await app.inject({ method: 'GET', url: '/portal/data/agents?limit=500' });
    assert.equal(state.listBotsCalled?.limit, 100);
});

// ---------------------------------------------------------------------------
// GET /portal/data/agents/:botId
// ---------------------------------------------------------------------------

test('GET /portal/data/agents/:botId — returns agent if belongs to tenant → 200', async () => {
    const now = new Date();
    const { repo, state } = createMockRepo();
    state.findBotReturn = {
        id: 'bot-1',
        role: 'developer',
        status: 'active',
        workspaceId: 'ws-1',
        createdAt: now,
        updatedAt: now,
        workspace: { name: 'Workspace One' },
    };

    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({ method: 'GET', url: '/portal/data/agents/bot-1' });
    assert.equal(res.statusCode, 200);
    const body = res.json<{ agent: BotRecord }>();
    assert.equal(body.agent.id, 'bot-1');
});

test('GET /portal/data/agents/:botId — 404 if bot belongs to different tenant', async () => {
    const { repo } = createMockRepo();
    // findBotReturn stays null — simulates tenantId mismatch in WHERE clause
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({ method: 'GET', url: '/portal/data/agents/bot-other' });
    assert.equal(res.statusCode, 404);
    assert.equal(res.json<{ error: string }>().error, 'not_found');
});

// ---------------------------------------------------------------------------
// GET /portal/data/usage
// ---------------------------------------------------------------------------

test('GET /portal/data/usage — returns usage summary → 200', async () => {
    const { repo, state } = createMockRepo();
    state.taskCount = 10;
    state.taskCost = 5.25;
    state.recentTasks = [
        { createdAt: new Date('2026-05-01T10:00:00Z'), outcome: 'success' },
        { createdAt: new Date('2026-05-01T12:00:00Z'), outcome: 'success' },
        { createdAt: new Date('2026-05-02T09:00:00Z'), outcome: 'failed' },
    ];

    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({ method: 'GET', url: '/portal/data/usage' });
    assert.equal(res.statusCode, 200);
    const body = res.json<{
        totalTasks: number;
        successRate: number;
        totalCostUsd: number;
        tasksByDay: Array<{ date: string; count: number }>;
    }>();
    assert.equal(body.totalTasks, 10);
    assert.equal(body.totalCostUsd, 5.25);
    // tasksByDay should group correctly
    assert.equal(body.tasksByDay.length, 2); // 2026-05-01 and 2026-05-02
    const day1 = body.tasksByDay.find((d) => d.date === '2026-05-01');
    assert.ok(day1, 'day 2026-05-01 present');
    assert.equal(day1?.count, 2);
});

test('GET /portal/data/usage — no session → 401', async () => {
    const { repo } = createMockRepo();
    const { app, register } = buildApp(repo, noSession());
    await register();

    const res = await app.inject({ method: 'GET', url: '/portal/data/usage' });
    assert.equal(res.statusCode, 401);
});

// ---------------------------------------------------------------------------
// GET /portal/data/billing/subscription
// ---------------------------------------------------------------------------

test('GET /portal/data/billing/subscription — returns subscription if exists → 200', async () => {
    const { repo, state } = createMockRepo();
    state.subscription = {
        id: 'sub-1',
        tenantId: 'tenant-1',
        planId: 'plan-starter',
        status: 'active',
        paymentProvider: 'stripe',
        startedAt: new Date('2026-01-01'),
        expiresAt: new Date('2027-01-01'),
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
    };

    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({ method: 'GET', url: '/portal/data/billing/subscription' });
    assert.equal(res.statusCode, 200);
    const body = res.json<{ subscription: SubscriptionRecord }>();
    assert.equal(body.subscription.id, 'sub-1');
    assert.equal(body.subscription.status, 'active');
});

test('GET /portal/data/billing/subscription — returns null if no subscription → 200', async () => {
    const { repo } = createMockRepo();
    // subscription stays null

    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({ method: 'GET', url: '/portal/data/billing/subscription' });
    assert.equal(res.statusCode, 200);
    const body = res.json<{ subscription: null }>();
    assert.equal(body.subscription, null);
});

// ---------------------------------------------------------------------------
// GET /portal/data/profile
// ---------------------------------------------------------------------------

test('GET /portal/data/profile — returns account and tenant info → 200', async () => {
    const { repo, state } = createMockRepo();
    state.accountReturn = {
        id: 'acc-1',
        email: 'user@tenant.com',
        displayName: 'Test User',
        role: 'VIEWER',
        createdAt: new Date('2026-01-01'),
        lastLoginAt: new Date('2026-05-10'),
    };
    state.tenantReturn = {
        id: 'tenant-1',
        name: 'Acme Corp',
        status: 'ready',
    };

    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({ method: 'GET', url: '/portal/data/profile' });
    assert.equal(res.statusCode, 200);
    const body = res.json<{ account: AccountRecord; tenant: TenantRecord }>();
    assert.equal(body.account.email, 'user@tenant.com');
    assert.equal(body.tenant.id, 'tenant-1');
    assert.equal(body.tenant.name, 'Acme Corp');
});

test('GET /portal/data/profile — account not found → 404', async () => {
    const { repo } = createMockRepo();
    // accountReturn stays null

    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({ method: 'GET', url: '/portal/data/profile' });
    assert.equal(res.statusCode, 404);
    assert.equal(res.json<{ error: string }>().error, 'account_not_found');
});

// ---------------------------------------------------------------------------
// PATCH /portal/data/profile
// ---------------------------------------------------------------------------

test('PATCH /portal/data/profile — updates displayName → 200', async () => {
    const { repo, state } = createMockRepo();
    state.accountReturn = {
        id: 'acc-1',
        email: 'user@tenant.com',
        displayName: 'Old Name',
        role: 'VIEWER',
        createdAt: new Date('2026-01-01'),
        lastLoginAt: null,
    };

    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'PATCH',
        url: '/portal/data/profile',
        body: { displayName: 'New Name' },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json<{ ok: boolean; displayName: string }>();
    assert.equal(body.ok, true);
    assert.equal(body.displayName, 'New Name');
    assert.equal(state.displayNameUpdated, 'New Name');
});

test('PATCH /portal/data/profile — empty displayName → 400', async () => {
    const { repo } = createMockRepo();
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'PATCH',
        url: '/portal/data/profile',
        body: { displayName: '' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json<{ error: string }>().error, 'invalid_display_name');
});

test('PATCH /portal/data/profile — displayName over 100 chars → 400', async () => {
    const { repo } = createMockRepo();
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'PATCH',
        url: '/portal/data/profile',
        body: { displayName: 'x'.repeat(101) },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json<{ error: string }>().error, 'invalid_display_name');
});

test('PATCH /portal/data/profile — no session → 401', async () => {
    const { repo } = createMockRepo();
    const { app, register } = buildApp(repo, noSession());
    await register();

    const res = await app.inject({
        method: 'PATCH',
        url: '/portal/data/profile',
        body: { displayName: 'Name' },
    });
    assert.equal(res.statusCode, 401);
});
