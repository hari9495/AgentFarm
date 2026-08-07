import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registerBatchDispatchRoutes } from './batch-dispatch.js';

// ---------------------------------------------------------------------------
// In-memory stub
// ---------------------------------------------------------------------------

const makeStore = () => {
    const bots = new Map<string, { id: string; workspaceId: string; tenantId: string }>();
    const runs = new Map<string, Record<string, unknown>>();
    const dispatches: Record<string, unknown>[] = [];

    const stub = {
        bot: {
            findFirst: async ({ where }: { where: Record<string, unknown> }) => {
                const id = String(where['id'] ?? '');
                const bot = bots.get(id);
                if (!bot) return null;
                const wsWhere = where['workspace'] as Record<string, unknown> | undefined;
                if (wsWhere?.['tenantId'] && wsWhere['tenantId'] !== bot.tenantId) return null;
                return { id: bot.id, workspaceId: bot.workspaceId };
            },
        },
        orchestrationRun: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
                const id = `run_${runs.size + 1}`;
                const now = new Date();
                const run = { ...data, id, startedAt: now, completedAt: null, createdAt: now };
                runs.set(id, run);
                return run;
            },
            findMany: async ({ where, take }: { where: Record<string, unknown>; take?: number }) => {
                const results = Array.from(runs.values()).filter((r) => {
                    if (r['tenantId'] !== where['tenantId']) return false;
                    if (where['workspaceId'] && r['workspaceId'] !== where['workspaceId']) return false;
                    const dispatchFilter = where['dispatches'] as { some?: { wakeSource?: string } } | undefined;
                    if (dispatchFilter?.some?.wakeSource) {
                        const ws = dispatchFilter.some.wakeSource;
                        const hasMatch = dispatches.some(d => d['orchestrationRunId'] === r['id'] && d['wakeSource'] === ws);
                        if (!hasMatch) return false;
                    }
                    return true;
                });
                results.sort((a, b) => new Date(b['createdAt'] as string).getTime() - new Date(a['createdAt'] as string).getTime());
                return results.slice(0, take ?? 20);
            },
            findFirst: async ({ where, include }: { where: Record<string, unknown>; include?: Record<string, unknown> }) => {
                const run = runs.get(String(where['id'] ?? ''));
                if (!run) return null;
                if (run['tenantId'] !== where['tenantId']) return null;
                if (include?.['dispatches']) {
                    const runDispatches = dispatches
                        .filter(d => d['orchestrationRunId'] === run['id'])
                        .sort((a, b) => Number(a['subTaskIndex'] ?? 0) - Number(b['subTaskIndex'] ?? 0));
                    return { ...run, dispatches: runDispatches };
                }
                return run;
            },
        },
        agentDispatchRecord: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
                const record = { ...data, queuedAt: new Date(), completedAt: null, result: null };
                dispatches.push(record);
                return record;
            },
        },
        _bots: bots,
    };
    return stub;
};

const session = (tenantId = 'tenant_1') => ({
    userId: 'u1', tenantId, workspaceIds: ['ws_1'], expiresAt: Date.now() + 60_000,
});

const buildApp = () => {
    const store = makeStore();
    store._bots.set('bot_1', { id: 'bot_1', workspaceId: 'ws_1', tenantId: 'tenant_1' });
    const app = Fastify();
    registerBatchDispatchRoutes(app, { getSession: () => session(), prisma: store as never });
    return { app, store };
};

const minPayload = () => ({
    to_agent_id: 'bot_1',
    workspace_id: 'ws_1',
    template: 'Research {{name}} at {{company}}.',
    rows: [{ name: 'Alice', company: 'Acme' }, { name: 'Bob', company: 'Beta' }],
});

// ---------------------------------------------------------------------------
// POST /v1/agents/batch-dispatch
// ---------------------------------------------------------------------------

describe('POST /v1/agents/batch-dispatch', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerBatchDispatchRoutes(app, { getSession: () => null });
        const res = await app.inject({ method: 'POST', url: '/v1/agents/batch-dispatch', payload: minPayload() });
        assert.equal(res.statusCode, 401);
    });

    it('returns 400 when to_agent_id is missing', async () => {
        const { app } = buildApp();
        const { to_agent_id: _, ...body } = minPayload();
        const res = await app.inject({ method: 'POST', url: '/v1/agents/batch-dispatch', payload: body });
        assert.equal(res.statusCode, 400);
    });

    it('returns 400 when workspace_id is missing', async () => {
        const { app } = buildApp();
        const { workspace_id: _, ...body } = minPayload();
        const res = await app.inject({ method: 'POST', url: '/v1/agents/batch-dispatch', payload: body });
        assert.equal(res.statusCode, 400);
    });

    it('returns 400 when template is missing', async () => {
        const { app } = buildApp();
        const { template: _, ...body } = minPayload();
        const res = await app.inject({ method: 'POST', url: '/v1/agents/batch-dispatch', payload: body });
        assert.equal(res.statusCode, 400);
    });

    it('returns 400 when rows is missing', async () => {
        const { app } = buildApp();
        const { rows: _, ...body } = minPayload();
        const res = await app.inject({ method: 'POST', url: '/v1/agents/batch-dispatch', payload: body });
        assert.equal(res.statusCode, 400);
    });

    it('returns 400 when rows is empty', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/agents/batch-dispatch',
            payload: { ...minPayload(), rows: [] },
        });
        assert.equal(res.statusCode, 400);
    });

    it('returns 400 when rows exceeds MAX_ROWS', async () => {
        const { app } = buildApp();
        const rows = Array.from({ length: 201 }, (_, i) => ({ name: `N${i}`, company: `C${i}` }));
        const res = await app.inject({
            method: 'POST', url: '/v1/agents/batch-dispatch',
            payload: { ...minPayload(), rows },
        });
        assert.equal(res.statusCode, 400);
    });

    it('returns 403 when workspace is outside session scope', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/agents/batch-dispatch',
            payload: { ...minPayload(), workspace_id: 'ws_other' },
        });
        assert.equal(res.statusCode, 403);
        assert.equal(res.json().error, 'workspace_scope_violation');
    });

    it('returns 404 when bot not found', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/agents/batch-dispatch',
            payload: { ...minPayload(), to_agent_id: 'unknown_bot' },
        });
        assert.equal(res.statusCode, 404);
    });

    it('creates batch and returns 201 with correct shape', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/agents/batch-dispatch',
            payload: minPayload(),
        });
        assert.equal(res.statusCode, 201);
        const body = res.json();
        assert.ok(body.batch_id, 'batch_id must be present');
        assert.equal(body.to_agent_id, 'bot_1');
        assert.equal(body.workspace_id, 'ws_1');
        assert.equal(body.total, 2);
        assert.equal(body.status, 'queued');
        assert.ok(Array.isArray(body.dispatches));
        assert.equal(body.dispatches.length, 2);
        assert.ok(body.dispatches[0].dispatch_id);
        assert.equal(body.dispatches[0].index, 0);
        assert.ok(body.dispatches[0].task_description.includes('Alice'));
    });

    it('extracts template variables in response', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'POST', url: '/v1/agents/batch-dispatch', payload: minPayload() });
        const body = res.json();
        assert.ok(body.variables.includes('name'));
        assert.ok(body.variables.includes('company'));
    });

    it('uses batch_name when provided', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/agents/batch-dispatch',
            payload: { ...minPayload(), batch_name: 'My Outreach Batch' },
        });
        assert.equal(res.json().batch_name, 'My Outreach Batch');
    });
});

// ---------------------------------------------------------------------------
// POST /v1/agents/batch-dispatch/preview
// ---------------------------------------------------------------------------

describe('POST /v1/agents/batch-dispatch/preview', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerBatchDispatchRoutes(app, { getSession: () => null });
        const res = await app.inject({
            method: 'POST', url: '/v1/agents/batch-dispatch/preview',
            payload: { template: 'Hi {{name}}', rows: [{ name: 'Alice' }] },
        });
        assert.equal(res.statusCode, 401);
    });

    it('returns 400 when template is missing', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/agents/batch-dispatch/preview',
            payload: { rows: [{ name: 'A' }] },
        });
        assert.equal(res.statusCode, 400);
    });

    it('returns expanded preview up to 5 rows', async () => {
        const { app } = buildApp();
        const rows = Array.from({ length: 10 }, (_, i) => ({ name: `N${i}` }));
        const res = await app.inject({
            method: 'POST', url: '/v1/agents/batch-dispatch/preview',
            payload: { template: 'Hello {{name}}', rows },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.equal(body.preview.length, 5);
        assert.equal(body.total, 10);
        assert.ok(body.variables.includes('name'));
        assert.equal(body.preview[0].task_description, 'Hello N0');
    });
});

// ---------------------------------------------------------------------------
// GET /v1/agents/batch-dispatch (list)
// ---------------------------------------------------------------------------

describe('GET /v1/agents/batch-dispatch', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerBatchDispatchRoutes(app, { getSession: () => null });
        const res = await app.inject({ method: 'GET', url: '/v1/agents/batch-dispatch' });
        assert.equal(res.statusCode, 401);
    });

    it('returns empty batches list when no batches exist', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/agents/batch-dispatch' });
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json().batches, []);
    });

    it('returns batches after creation', async () => {
        const { app } = buildApp();
        await app.inject({ method: 'POST', url: '/v1/agents/batch-dispatch', payload: minPayload() });
        const res = await app.inject({ method: 'GET', url: '/v1/agents/batch-dispatch' });
        assert.equal(res.statusCode, 200);
        const batches = res.json().batches;
        assert.equal(batches.length, 1);
        // Must match the dashboard client's BatchResult shape (batch_id/dispatched_at/etc),
        // not raw OrchestrationRun field names (id/startedAt) — regression test for a bug
        // where the list endpoint returned unmapped Prisma fields and the UI showed "Invalid Date".
        assert.ok(typeof batches[0].batch_id === 'string', 'batch_id must be present');
        assert.ok(typeof batches[0].dispatched_at === 'string' && !Number.isNaN(Date.parse(batches[0].dispatched_at)), 'dispatched_at must be a valid ISO date string');
        assert.ok(typeof batches[0].batch_name === 'string', 'batch_name must be present');
        assert.ok(typeof batches[0].total === 'number', 'total must be present');
    });

    it('returns 403 when filtering by out-of-scope workspace', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/agents/batch-dispatch?workspace_id=ws_other' });
        assert.equal(res.statusCode, 403);
    });
});

// ---------------------------------------------------------------------------
// GET /v1/agents/batch-dispatch/:batchId
// ---------------------------------------------------------------------------

describe('GET /v1/agents/batch-dispatch/:batchId', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerBatchDispatchRoutes(app, { getSession: () => null });
        const res = await app.inject({ method: 'GET', url: '/v1/agents/batch-dispatch/run_1' });
        assert.equal(res.statusCode, 401);
    });

    it('returns 404 for unknown batch', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/agents/batch-dispatch/nonexistent' });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json().error, 'batch_not_found');
    });

    it('returns batch detail with tasks after creation', async () => {
        const { app } = buildApp();
        const createRes = await app.inject({
            method: 'POST', url: '/v1/agents/batch-dispatch', payload: minPayload(),
        });
        const { batch_id } = createRes.json();
        const res = await app.inject({ method: 'GET', url: `/v1/agents/batch-dispatch/${batch_id}` });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.equal(body.batch_id, batch_id);
        assert.equal(body.total, 2);
        assert.ok(Array.isArray(body.tasks));
        assert.equal(body.tasks.length, 2);
        assert.equal(body.tasks[0].index, 0);
        assert.equal(body.tasks[1].index, 1);
    });
});
