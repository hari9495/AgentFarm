import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registerAgentsRoutes } from './agents.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Bot = {
    id: string; workspaceId: string; role: string; status: string;
    createdAt: Date; updatedAt: Date;
};

const makeBot = (overrides: Partial<Bot> = {}): Bot => ({
    id: `bot_${Math.random().toString(36).slice(2)}`,
    workspaceId: 'ws_1',
    role: 'developer',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
});

const makeStore = (initialBots: Bot[] = []) => {
    const bots = [...initialBots];
    return {
        bot: {
            findMany: async ({ where, include }: Record<string, any>) => {
                const wsFilter = (where?.workspace ?? {}) as { tenantId?: string; id?: string };
                const results = bots.filter(b => {
                    if (wsFilter.id && b.workspaceId !== wsFilter.id) return false;
                    return true;
                });
                if (include?.workspace) {
                    return results.map(b => ({
                        ...b, workspace: { id: b.workspaceId, name: 'Test WS', tenantId: 't1' },
                    }));
                }
                return results;
            },
            findFirst: async ({ where }: Record<string, any>) => {
                return bots.find(b => {
                    if (where.id !== undefined && b.id !== where.id) return false;
                    if (where.workspaceId !== undefined && b.workspaceId !== where.workspaceId) return false;
                    return true;
                }) ?? null;
            },
            create: async ({ data }: Record<string, any>) => {
                const b = makeBot(data);
                bots.push(b);
                return b;
            },
        },
        workspace: {
            findFirst: async ({ where }: Record<string, any>) => {
                if (where.id === 'ws_1' && where.tenantId === 't1') {
                    return { id: 'ws_1', name: 'Test WS', tenantId: 't1' };
                }
                return null;
            },
        },
        botCapabilitySnapshot: {
            create: async () => ({ id: 'snap_1' }),
        },
        taskExecutionRecord: {
            findMany: async () => [],
            groupBy: async () => [],
        },
    } as never;
};

const session = (role = 'operator') => ({
    userId: 'u1', tenantId: 't1', workspaceIds: ['ws_1'], role, expiresAt: Date.now() + 60_000,
});

const buildApp = (bots: Bot[] = [], role = 'operator') => {
    const app = Fastify();
    registerAgentsRoutes(app, { getSession: () => session(role), prisma: makeStore(bots) });
    return app;
};

// ---------------------------------------------------------------------------
// GET /v1/agents
// ---------------------------------------------------------------------------

describe('GET /v1/agents', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerAgentsRoutes(app, { getSession: () => null, prisma: makeStore() });
        const res = await app.inject({ method: 'GET', url: '/v1/agents' });
        assert.equal(res.statusCode, 401);
    });

    it('returns 403 when role is below viewer', async () => {
        const app = buildApp([], 'unknown_role');
        const res = await app.inject({ method: 'GET', url: '/v1/agents' });
        assert.equal(res.statusCode, 403);
    });

    it('returns empty bots array when no bots exist', async () => {
        const app = buildApp([], 'viewer');
        const res = await app.inject({ method: 'GET', url: '/v1/agents' });
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json().bots, []);
    });

    it('returns bots for the tenant', async () => {
        const app = buildApp([makeBot(), makeBot()], 'viewer');
        const res = await app.inject({ method: 'GET', url: '/v1/agents' });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().bots.length, 2);
    });

    it('filters bots by workspaceId query param', async () => {
        const app = buildApp([makeBot({ workspaceId: 'ws_1' }), makeBot({ workspaceId: 'ws_2' })], 'viewer');
        const res = await app.inject({ method: 'GET', url: '/v1/agents?workspaceId=ws_1' });
        assert.equal(res.statusCode, 200);
        const bots = res.json().bots as { workspaceId: string }[];
        assert.ok(bots.every(b => b.workspaceId === 'ws_1'));
    });
});

// ---------------------------------------------------------------------------
// POST /v1/agents
// ---------------------------------------------------------------------------

describe('POST /v1/agents', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerAgentsRoutes(app, { getSession: () => null, prisma: makeStore() });
        const res = await app.inject({
            method: 'POST', url: '/v1/agents',
            payload: { workspaceId: 'ws_1', role: 'developer' },
        });
        assert.equal(res.statusCode, 401);
    });

    it('returns 403 when role is below operator', async () => {
        const app = buildApp([], 'viewer');
        const res = await app.inject({
            method: 'POST', url: '/v1/agents',
            payload: { workspaceId: 'ws_1', role: 'developer' },
        });
        assert.equal(res.statusCode, 403);
    });

    it('returns 400 when workspaceId is missing', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/agents',
            payload: { role: 'developer' },
        });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json().error, 'missing_fields');
    });

    it('returns 400 for invalid role', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/agents',
            payload: { workspaceId: 'ws_1', role: 'wizard' },
        });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json().error, 'invalid_role');
    });

    it('returns 404 when workspace not found', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/agents',
            payload: { workspaceId: 'ws_unknown', role: 'developer' },
        });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json().error, 'workspace_not_found');
    });

    it('allows a second bot in a workspace that already has one (multi-agent teams)', async () => {
        const app = buildApp([makeBot({ workspaceId: 'ws_1', role: 'developer' })]);
        const res = await app.inject({
            method: 'POST', url: '/v1/agents',
            payload: { workspaceId: 'ws_1', role: 'recruiter' },
        });
        assert.equal(res.statusCode, 201);
        assert.equal(res.json().bot.role, 'recruiter');
    });

    it('creates a bot and returns 201', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/agents',
            payload: { workspaceId: 'ws_1', role: 'developer' },
        });
        assert.equal(res.statusCode, 201);
        assert.ok(res.json().bot.id, 'bot.id must be present');
        assert.equal(res.json().bot.role, 'developer');
    });
});

// ---------------------------------------------------------------------------
// GET /v1/agents/health
// ---------------------------------------------------------------------------

describe('GET /v1/agents/health', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerAgentsRoutes(app, { getSession: () => null, prisma: makeStore() });
        const res = await app.inject({ method: 'GET', url: '/v1/agents/health' });
        assert.equal(res.statusCode, 401);
    });

    it('returns empty agents and zero summary when no bots', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/agents/health' });
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json().agents, []);
        assert.equal(res.json().summary.active, 0);
    });

    it('returns agent health summary for existing bots', async () => {
        const app = buildApp([makeBot({ status: 'active' }), makeBot({ status: 'paused' })]);
        const res = await app.inject({ method: 'GET', url: '/v1/agents/health' });
        assert.equal(res.statusCode, 200);
        const { agents, summary } = res.json();
        assert.equal(agents.length, 2);
        assert.equal(summary.active, 1);
        assert.equal(summary.paused, 1);
    });

    it('each agent entry has expected shape', async () => {
        const app = buildApp([makeBot()]);
        const res = await app.inject({ method: 'GET', url: '/v1/agents/health' });
        const agent = res.json().agents[0];
        assert.ok(agent.id);
        assert.ok(agent.role);
        assert.ok(agent.status);
        assert.ok(agent.workspaceId);
        assert.ok('tasks24h' in agent);
        assert.ok('lastTaskAt' in agent);
    });
});

// ---------------------------------------------------------------------------
// GET /v1/agents/:botId
// ---------------------------------------------------------------------------

describe('GET /v1/agents/:botId', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerAgentsRoutes(app, { getSession: () => null, prisma: makeStore() });
        const res = await app.inject({ method: 'GET', url: '/v1/agents/bot_123' });
        assert.equal(res.statusCode, 401);
    });

    it('returns 403 when role is below viewer', async () => {
        const app = buildApp([], 'unknown_role');
        const res = await app.inject({ method: 'GET', url: '/v1/agents/bot_123' });
        assert.equal(res.statusCode, 403);
    });

    it('returns 404 for unknown botId', async () => {
        const app = buildApp([], 'viewer');
        const res = await app.inject({ method: 'GET', url: '/v1/agents/bot_nonexistent' });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json().error, 'bot_not_found');
    });

    it('returns bot for known botId', async () => {
        const bot = makeBot({ id: 'bot_known' });
        const app = buildApp([bot], 'viewer');
        const res = await app.inject({ method: 'GET', url: '/v1/agents/bot_known' });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().bot.id, 'bot_known');
    });
});
