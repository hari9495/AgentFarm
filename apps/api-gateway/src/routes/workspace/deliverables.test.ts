import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registerDeliverableRoutes } from './deliverables.js';

// ---------------------------------------------------------------------------
// In-memory stub
// ---------------------------------------------------------------------------

type ActionRecord = {
    id: string; botId: string; workspaceId: string; tenantId: string;
    actionType: string; riskLevel: string; inputSummary: string;
    outputSummary: string | null; status: string; connectorType: string | null;
    correlationId: string; createdAt: Date; completedAt: Date | null;
};

const makeStore = (records: ActionRecord[] = []) => ({
    actionRecord: {
        findMany: async ({ where, take }: { where: Record<string, unknown>; take?: number }) => {
            let results = records.filter(r =>
                r.workspaceId === where['workspaceId'] &&
                r.tenantId === where['tenantId'] &&
                (!where['status'] || r.status === where['status']) &&
                (!where['botId'] || r.botId === where['botId']),
            );
            return results.slice(0, take ?? 100);
        },
        count: async ({ where }: { where: Record<string, unknown> }) =>
            records.filter(r =>
                r.workspaceId === where['workspaceId'] &&
                r.tenantId === where['tenantId'],
            ).length,
    },
    bot: {
        findMany: async ({ where }: { where: Record<string, unknown> }) => {
            const ids = (where['id'] as { in?: string[] })?.in ?? [];
            return ids.map(id => ({ id, role: 'developer' }));
        },
    },
    $queryRaw: async () => [],
} as never);

const session = () => ({
    userId: 'u1', tenantId: 't1', workspaceIds: ['ws_1'], expiresAt: Date.now() + 60_000,
});

const makeRecord = (overrides: Partial<ActionRecord> = {}): ActionRecord => ({
    id: `rec_${Math.random().toString(36).slice(2)}`,
    botId: 'bot_1',
    workspaceId: 'ws_1',
    tenantId: 't1',
    actionType: 'file_write',
    riskLevel: 'low',
    inputSummary: 'Write to config.json',
    outputSummary: 'Done',
    status: 'completed',
    connectorType: null,
    correlationId: 'corr_1',
    createdAt: new Date(),
    completedAt: new Date(),
    ...overrides,
});

const buildApp = (records: ActionRecord[] = []) => {
    const app = Fastify();
    registerDeliverableRoutes(app, { getSession: () => session(), prisma: makeStore(records) });
    return app;
};

// ---------------------------------------------------------------------------
// GET /v1/workspaces/:workspaceId/deliverables
// ---------------------------------------------------------------------------

describe('GET /v1/workspaces/:workspaceId/deliverables', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerDeliverableRoutes(app, { getSession: () => null, prisma: makeStore() });
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/deliverables' });
        assert.equal(res.statusCode, 401);
    });

    it('returns 403 when workspace is outside session scope', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_other/deliverables' });
        assert.equal(res.statusCode, 403);
    });

    it('returns empty list when no records', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/deliverables' });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.ok(Array.isArray(body.deliverables));
        assert.equal(body.deliverables.length, 0);
        assert.equal(typeof body.total, 'number');
    });

    it('returns deliverables with correct shape', async () => {
        const app = buildApp([makeRecord()]);
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/deliverables' });
        assert.equal(res.statusCode, 200);
        const { deliverables } = res.json();
        assert.equal(deliverables.length, 1);
        const d = deliverables[0];
        assert.ok(d.id);
        assert.ok(d.bot_id);
        assert.ok(d.action_type);
        assert.ok(d.status);
        assert.ok(d.created_at);
    });

    it('filters to completed by default', async () => {
        const app = buildApp([
            makeRecord({ status: 'completed' }),
            makeRecord({ status: 'failed' }),
        ]);
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/deliverables' });
        const deliverables = res.json().deliverables as { status: string }[];
        // Default status filter = 'completed'
        assert.ok(deliverables.every(d => d.status === 'completed'));
    });

    it('respects limit parameter', async () => {
        const records = Array.from({ length: 10 }, () => makeRecord());
        const app = buildApp(records);
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/deliverables?limit=3' });
        assert.ok(res.json().deliverables.length <= 3);
    });

    it('populates bot_role from bot lookup', async () => {
        const app = buildApp([makeRecord({ botId: 'bot_1' })]);
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/deliverables' });
        const d = res.json().deliverables[0];
        assert.equal(d.bot_role, 'developer');
    });
});

// ---------------------------------------------------------------------------
// GET /v1/workspaces/:workspaceId/deliverables/action-types
// ---------------------------------------------------------------------------

describe('GET /v1/workspaces/:workspaceId/deliverables/action-types', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerDeliverableRoutes(app, { getSession: () => null, prisma: makeStore() });
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/deliverables/action-types' });
        assert.equal(res.statusCode, 401);
    });

    it('returns 403 when workspace outside scope', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_other/deliverables/action-types' });
        assert.equal(res.statusCode, 403);
    });

    it('returns action_types array', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/deliverables/action-types' });
        assert.equal(res.statusCode, 200);
        assert.ok(Array.isArray(res.json().action_types));
    });
});
