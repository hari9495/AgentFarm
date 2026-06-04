import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registerAgentBudgetRoutes } from './agent-budget.js';

// ---------------------------------------------------------------------------
// In-memory store + raw-SQL stub
// ---------------------------------------------------------------------------

type BudgetRow = {
    id: string; tenantId: string; workspaceId: string; botId: string;
    dailyLimitUsd: number | null; monthlyLimitUsd: number | null; enabled: boolean;
    createdAt: Date; updatedAt: Date;
};

const makeStore = () => {
    const bots = new Map<string, { id: string; workspaceId: string }>();
    const configs = new Map<string, BudgetRow>();

    function applyUpdate(sql: string, botId: string, tenantId: string): void {
        const key = `${botId}::${tenantId}`;
        const cfg = configs.get(key);
        if (!cfg) return;
        const setMatch = sql.match(/SET (.+) WHERE/s);
        if (!setMatch) return;
        const parts = setMatch[1]!.split(/,\s*(?=")/);
        for (const part of parts) {
            const m = part.trim().match(/^"(\w+)"\s*=\s*(.+)$/);
            if (!m) continue;
            const [, col, rawVal] = m;
            if (rawVal === 'NULL') { (cfg as Record<string, unknown>)[col!] = null; }
            else if (rawVal === 'NOW()') { (cfg as Record<string, unknown>)[col!] = new Date(); }
            else if (rawVal === 'true') { (cfg as Record<string, unknown>)[col!] = true; }
            else if (rawVal === 'false') { (cfg as Record<string, unknown>)[col!] = false; }
            else if (!isNaN(Number(rawVal))) { (cfg as Record<string, unknown>)[col!] = Number(rawVal); }
        }
    }

    const stub = {
        bot: {
            findFirst: async ({ where }: { where: Record<string, unknown> }) => {
                const bot = bots.get(String(where['id'] ?? ''));
                if (!bot) return null;
                const wsWhere = where['workspace'] as Record<string, unknown> | undefined;
                if (wsWhere?.['tenantId'] && wsWhere['tenantId'] !== 'tenant_1') return null;
                return bot;
            },
        },
        $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> => {
            const sql = strings.join('?');
            if (sql.includes('AgentBudgetConfig')) {
                const botId = String(values[0]);
                const tenantId = String(values[1]);
                const key = `${botId}::${tenantId}`;
                const cfg = configs.get(key);
                if (sql.includes('SUM(')) {
                    return [{ totalCost: 0 }];
                }
                return cfg ? [cfg] : [];
            }
            return [];
        },
        $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
            const sql = strings.join('?');
            if (sql.includes('INSERT INTO "AgentBudgetConfig"')) {
                const [id, tenantId, workspaceId, botId, dailyLimit, monthlyLimit, enabled, now] = values;
                const key = `${String(botId)}::${String(tenantId)}`;
                configs.set(key, {
                    id: String(id),
                    tenantId: String(tenantId),
                    workspaceId: String(workspaceId),
                    botId: String(botId),
                    dailyLimitUsd: dailyLimit === null ? null : Number(dailyLimit),
                    monthlyLimitUsd: monthlyLimit === null ? null : Number(monthlyLimit),
                    enabled: Boolean(enabled),
                    createdAt: now as Date,
                    updatedAt: now as Date,
                });
            } else if (sql.includes('DELETE FROM "AgentBudgetConfig"')) {
                const [botId, tenantId] = values;
                configs.delete(`${String(botId)}::${String(tenantId)}`);
            }
        },
        $executeRawUnsafe: async (sql: string, ...values: unknown[]) => {
            if (sql.includes('AgentBudgetConfig')) {
                applyUpdate(sql, String(values[0]), String(values[1]));
            }
        },
        _bots: bots,
        _configs: configs,
    };
    return stub;
};

const session = (tenantId = 'tenant_1') => ({
    userId: 'user_1', tenantId, workspaceIds: ['ws_1'], expiresAt: Date.now() + 60_000,
});

const buildApp = () => {
    const store = makeStore();
    store._bots.set('bot_1', { id: 'bot_1', workspaceId: 'ws_1' });
    const app = Fastify();
    registerAgentBudgetRoutes(app, {
        getSession: () => session(),
        prisma: store as never,
    });
    return { app, store };
};

// ---------------------------------------------------------------------------
// GET /v1/agents/:botId/budget
// ---------------------------------------------------------------------------

describe('GET /v1/agents/:botId/budget', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerAgentBudgetRoutes(app, { getSession: () => null });
        const res = await app.inject({ method: 'GET', url: '/v1/agents/bot_1/budget' });
        assert.equal(res.statusCode, 401);
    });

    it('returns 404 when bot not found in tenant', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/agents/unknown_bot/budget' });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json().error, 'bot_not_found');
    });

    it('returns budget info with null config when no config exists', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/agents/bot_1/budget' });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.equal(body.bot_id, 'bot_1');
        assert.equal(body.config, null);
        assert.equal(typeof body.spend.month_to_date_usd, 'number');
        assert.equal(typeof body.spend.day_to_date_usd, 'number');
    });

    it('returns config when one exists', async () => {
        const { app } = buildApp();
        await app.inject({
            method: 'PUT', url: '/v1/agents/bot_1/budget',
            payload: { daily_limit_usd: 10, monthly_limit_usd: 200, enabled: true },
        });
        const res = await app.inject({ method: 'GET', url: '/v1/agents/bot_1/budget' });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.ok(body.config, 'config must not be null');
        assert.equal(body.config.daily_limit_usd, 10);
        assert.equal(body.config.monthly_limit_usd, 200);
        assert.equal(body.config.enabled, true);
    });
});

// ---------------------------------------------------------------------------
// PUT /v1/agents/:botId/budget
// ---------------------------------------------------------------------------

describe('PUT /v1/agents/:botId/budget', () => {
    it('returns 400 when no fields provided', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'PUT', url: '/v1/agents/bot_1/budget',
            payload: {},
        });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json().error, 'invalid_request');
    });

    it('returns 404 for unknown bot', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'PUT', url: '/v1/agents/unknown_bot/budget',
            payload: { enabled: true },
        });
        assert.equal(res.statusCode, 404);
    });

    it('creates a new budget config and returns it', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'PUT', url: '/v1/agents/bot_1/budget',
            payload: { daily_limit_usd: 5, monthly_limit_usd: 100, enabled: true },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.equal(body.bot_id, 'bot_1');
        assert.ok(body.config, 'config must be present');
        assert.equal(body.config.daily_limit_usd, 5);
        assert.equal(body.config.monthly_limit_usd, 100);
        assert.equal(body.config.enabled, true);
    });

    it('updates an existing budget config', async () => {
        const { app } = buildApp();
        await app.inject({ method: 'PUT', url: '/v1/agents/bot_1/budget', payload: { daily_limit_usd: 5 } });
        const res = await app.inject({
            method: 'PUT', url: '/v1/agents/bot_1/budget',
            payload: { daily_limit_usd: 20, enabled: false },
        });
        assert.equal(res.statusCode, 200);
    });

    it('accepts null to clear a limit', async () => {
        const { app } = buildApp();
        await app.inject({ method: 'PUT', url: '/v1/agents/bot_1/budget', payload: { daily_limit_usd: 10 } });
        const res = await app.inject({
            method: 'PUT', url: '/v1/agents/bot_1/budget',
            payload: { daily_limit_usd: null },
        });
        assert.equal(res.statusCode, 200);
    });
});

// ---------------------------------------------------------------------------
// DELETE /v1/agents/:botId/budget
// ---------------------------------------------------------------------------

describe('DELETE /v1/agents/:botId/budget', () => {
    it('returns 404 for unknown bot', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'DELETE', url: '/v1/agents/unknown_bot/budget' });
        assert.equal(res.statusCode, 404);
    });

    it('removes budget config and returns 204', async () => {
        const { app, store } = buildApp();
        await app.inject({ method: 'PUT', url: '/v1/agents/bot_1/budget', payload: { daily_limit_usd: 5 } });
        assert.ok(store._configs.has('bot_1::tenant_1'), 'config should exist before delete');
        const res = await app.inject({ method: 'DELETE', url: '/v1/agents/bot_1/budget' });
        assert.equal(res.statusCode, 204);
        assert.ok(!store._configs.has('bot_1::tenant_1'), 'config should be removed after delete');
    });
});
