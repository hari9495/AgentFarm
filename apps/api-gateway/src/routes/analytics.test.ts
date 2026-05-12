import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerAnalyticsRoutes } from './analytics.js';

const session = () => ({
    userId: 'user_1',
    tenantId: 'tenant_1',
    workspaceIds: ['ws_1'],
    role: 'viewer',
    expiresAt: Date.now() + 60_000,
});

const makePrisma = (records: any[] = [], signals: any[] = []) => ({
    taskExecutionRecord: {
        findMany: async () => records,
    },
    qualitySignalLog: {
        findMany: async () => signals,
    },
} as any);

// ---------------------------------------------------------------------------
// agent-performance
// ---------------------------------------------------------------------------

test('agent-performance: missing tenantId returns 400', async () => {
    const app = Fastify();
    await registerAnalyticsRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/analytics/agent-performance' });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json().error, 'invalid_request');
    } finally {
        await app.close();
    }
});

test('agent-performance: date range exceeds 90 days returns 400', async () => {
    const app = Fastify();
    await registerAnalyticsRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(),
    });
    try {
        const from = '2026-01-01T00:00:00.000Z';
        const to = '2026-04-15T00:00:00.000Z'; // >90 days
        const res = await app.inject({
            method: 'GET',
            url: `/v1/analytics/agent-performance?tenantId=tenant_1&from=${from}&to=${to}`,
        });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json().error, 'date_range_exceeded');
    } finally {
        await app.close();
    }
});

test('agent-performance: no records returns zeroed metrics with null rates', async () => {
    const app = Fastify();
    await registerAnalyticsRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma([], []),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/analytics/agent-performance?tenantId=tenant_1',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as Record<string, unknown>;
        assert.equal(body['taskCount'], 0);
        assert.equal(body['successRate'], null);
        assert.equal(body['avgLatencyMs'], null);
        assert.equal(body['avgCostUsd'], null);
        assert.equal(body['avgQualityScore'], null);
        assert.equal(body['totalTokens'], 0);
        assert.ok(Array.isArray(body['weeklyTrend']));
        assert.equal((body['weeklyTrend'] as unknown[]).length, 0);
    } finally {
        await app.close();
    }
});

test('agent-performance: 3 records compute successRate and avgLatencyMs', async () => {
    const now = new Date();
    const records = [
        { outcome: 'success', latencyMs: 100, estimatedCostUsd: 0, promptTokens: 10, completionTokens: 20, totalTokens: 30, modelProvider: 'anthropic', modelTier: 'standard', executedAt: now },
        { outcome: 'success', latencyMs: 200, estimatedCostUsd: 0, promptTokens: 10, completionTokens: 20, totalTokens: 30, modelProvider: 'anthropic', modelTier: 'standard', executedAt: now },
        { outcome: 'failed', latencyMs: 300, estimatedCostUsd: 0, promptTokens: 10, completionTokens: 20, totalTokens: 30, modelProvider: 'anthropic', modelTier: 'standard', executedAt: now },
    ];
    const app = Fastify();
    await registerAnalyticsRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(records, []),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/analytics/agent-performance?tenantId=tenant_1',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as Record<string, unknown>;
        assert.equal(body['taskCount'], 3);
        assert.ok(Math.abs((body['successRate'] as number) - 2 / 3) < 0.001);
        assert.equal(body['avgLatencyMs'], 200); // (100+200+300)/3 = 200
    } finally {
        await app.close();
    }
});

test('agent-performance: totalCostUsd and avgCostUsd computed correctly', async () => {
    const now = new Date();
    const records = [
        { outcome: 'success', latencyMs: 100, estimatedCostUsd: 0.01, promptTokens: 10, completionTokens: 20, totalTokens: 30, modelProvider: 'openai', modelTier: 'standard', executedAt: now },
        { outcome: 'success', latencyMs: 100, estimatedCostUsd: 0.03, promptTokens: 10, completionTokens: 20, totalTokens: 30, modelProvider: 'openai', modelTier: 'standard', executedAt: now },
    ];
    const app = Fastify();
    await registerAnalyticsRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(records, []),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/analytics/agent-performance?tenantId=tenant_1',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as Record<string, unknown>;
        assert.ok(Math.abs((body['totalCostUsd'] as number) - 0.04) < 0.0001);
        assert.ok(Math.abs((body['avgCostUsd'] as number) - 0.02) < 0.0001);
    } finally {
        await app.close();
    }
});

test('agent-performance: by_provider groups and averages correctly', async () => {
    const now = new Date();
    const records = [
        { outcome: 'success', latencyMs: 100, estimatedCostUsd: 0.01, promptTokens: 10, completionTokens: 20, totalTokens: 30, modelProvider: 'anthropic', modelTier: 'standard', executedAt: now },
        { outcome: 'success', latencyMs: 200, estimatedCostUsd: 0.02, promptTokens: 10, completionTokens: 20, totalTokens: 30, modelProvider: 'anthropic', modelTier: 'standard', executedAt: now },
        { outcome: 'failed', latencyMs: 300, estimatedCostUsd: 0.05, promptTokens: 10, completionTokens: 20, totalTokens: 30, modelProvider: 'openai', modelTier: 'standard', executedAt: now },
    ];
    const app = Fastify();
    await registerAnalyticsRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(records, []),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/analytics/agent-performance?tenantId=tenant_1',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { byProvider: Record<string, { taskCount: number; totalCostUsd: number; avgLatencyMs: number }> };
        assert.equal(body.byProvider['anthropic']?.taskCount, 2);
        assert.equal(body.byProvider['anthropic']?.avgLatencyMs, 150); // (100+200)/2
        assert.ok(Math.abs((body.byProvider['anthropic']?.totalCostUsd ?? 0) - 0.03) < 0.0001);
        assert.equal(body.byProvider['openai']?.taskCount, 1);
        assert.equal(body.byProvider['openai']?.avgLatencyMs, 300);
    } finally {
        await app.close();
    }
});

test('agent-performance: weekly_trend groups by Monday week start', async () => {
    // 2026-05-04 = Monday, 2026-05-05 = Tuesday (same week), 2026-05-11 = Monday (next week)
    const records = [
        { outcome: 'success', latencyMs: 100, estimatedCostUsd: 0.01, promptTokens: 10, completionTokens: 20, totalTokens: 30, modelProvider: 'anthropic', modelTier: 'standard', executedAt: new Date('2026-05-04T12:00:00.000Z') },
        { outcome: 'success', latencyMs: 100, estimatedCostUsd: 0.01, promptTokens: 10, completionTokens: 20, totalTokens: 30, modelProvider: 'anthropic', modelTier: 'standard', executedAt: new Date('2026-05-05T12:00:00.000Z') },
        { outcome: 'failed', latencyMs: 100, estimatedCostUsd: 0.01, promptTokens: 10, completionTokens: 20, totalTokens: 30, modelProvider: 'anthropic', modelTier: 'standard', executedAt: new Date('2026-05-11T12:00:00.000Z') },
    ];
    const app = Fastify();
    await registerAnalyticsRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(records, []),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/analytics/agent-performance?tenantId=tenant_1',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { weeklyTrend: Array<{ weekStart: string; taskCount: number; successCount: number }> };
        // Two distinct weeks
        assert.equal(body.weeklyTrend.length, 2);
        // First week (sorted): has 2 tasks (both success)
        assert.equal(body.weeklyTrend[0]?.taskCount, 2);
        assert.equal(body.weeklyTrend[0]?.successCount, 2);
        // Second week: has 1 task (failed)
        assert.equal(body.weeklyTrend[1]?.taskCount, 1);
        assert.equal(body.weeklyTrend[1]?.successCount, 0);
    } finally {
        await app.close();
    }
});

test('agent-performance: avgQualityScore computed from non-null signals', async () => {
    const signals = [
        { score: 0.8, signalType: 'lint' },
        { score: 0.9, signalType: 'test' },
        { score: null, signalType: 'custom' }, // null excluded
    ];
    const app = Fastify();
    await registerAnalyticsRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma([], signals),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/analytics/agent-performance?tenantId=tenant_1',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as Record<string, unknown>;
        assert.ok(Math.abs((body['avgQualityScore'] as number) - 0.85) < 0.0001);
    } finally {
        await app.close();
    }
});

test('agent-performance: tenantId mismatch with session returns 403', async () => {
    const app = Fastify();
    await registerAnalyticsRoutes(app, {
        getSession: () => session(), // session tenantId = 'tenant_1'
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/analytics/agent-performance?tenantId=tenant_other',
        });
        assert.equal(res.statusCode, 403);
        assert.equal(res.json().error, 'forbidden');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// cost-summary
// ---------------------------------------------------------------------------

test('cost-summary: returns real successRate and byProvider array', async () => {
    const now = new Date();
    const records = [
        { outcome: 'success', latencyMs: 100, estimatedCostUsd: 0.01, promptTokens: 100, completionTokens: 200, totalTokens: 300, modelProvider: 'anthropic', modelTier: 'standard', executedAt: now },
        { outcome: 'failed', latencyMs: 200, estimatedCostUsd: 0.02, promptTokens: 50, completionTokens: 100, totalTokens: 150, modelProvider: 'openai', modelTier: 'standard', executedAt: now },
    ];
    const app = Fastify();
    await registerAnalyticsRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(records, []),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/analytics/cost-summary?tenantId=tenant_1',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { successRate: number; byProvider: Array<{ provider: string; taskCount: number }> };
        assert.equal(body.successRate, 0.5);
        assert.ok(Array.isArray(body.byProvider));
        assert.equal(body.byProvider.length, 2);
        const anthropic = body.byProvider.find((p) => p.provider === 'anthropic');
        assert.ok(anthropic);
        assert.equal(anthropic.taskCount, 1);
    } finally {
        await app.close();
    }
});

test('cost-summary: totalPromptTokens and totalCompletionTokens summed correctly', async () => {
    const now = new Date();
    const records = [
        { outcome: 'success', latencyMs: 100, estimatedCostUsd: 0, promptTokens: 100, completionTokens: 200, totalTokens: 300, modelProvider: 'anthropic', modelTier: 'standard', executedAt: now },
        { outcome: 'success', latencyMs: 100, estimatedCostUsd: 0, promptTokens: 50, completionTokens: 75, totalTokens: 125, modelProvider: 'anthropic', modelTier: 'standard', executedAt: now },
    ];
    const app = Fastify();
    await registerAnalyticsRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(records, []),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/analytics/cost-summary?tenantId=tenant_1',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as Record<string, unknown>;
        assert.equal(body['totalPromptTokens'], 150);
        assert.equal(body['totalCompletionTokens'], 275);
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// tasks
// ---------------------------------------------------------------------------

const makeTasksPrisma = (records: any[] = [], countResult?: number) => ({
    taskExecutionRecord: {
        findMany: async () => records,
        count: async () => countResult ?? records.length,
    },
    qualitySignalLog: {
        findMany: async () => [],
    },
} as any);

const makeTaskRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'task_1',
    taskId: 'tid_1',
    botId: 'bot_1',
    workspaceId: 'ws_1',
    modelProvider: 'openai',
    modelProfile: 'gpt-4',
    modelTier: 'standard',
    promptTokens: 100,
    completionTokens: 200,
    totalTokens: 300,
    estimatedCostUsd: 0.01,
    latencyMs: 150,
    outcome: 'success',
    executedAt: new Date('2026-05-01T10:00:00.000Z'),
    ...overrides,
});

test('tasks: returns 401 when no session', async () => {
    const app = Fastify();
    await registerAnalyticsRoutes(app, {
        getSession: () => null,
        prisma: makeTasksPrisma(),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/analytics/tasks?tenantId=tenant_1' });
        assert.equal(res.statusCode, 401);
        assert.equal(res.json().error, 'unauthorized');
    } finally {
        await app.close();
    }
});

test('tasks: returns 400 when outcome param is invalid', async () => {
    const app = Fastify();
    await registerAnalyticsRoutes(app, {
        getSession: () => session(),
        prisma: makeTasksPrisma(),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/analytics/tasks?tenantId=tenant_1&outcome=not_a_valid_outcome',
        });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json().error, 'invalid_request');
    } finally {
        await app.close();
    }
});

test('tasks: returns empty tasks array when no records exist', async () => {
    const app = Fastify();
    await registerAnalyticsRoutes(app, {
        getSession: () => session(),
        prisma: makeTasksPrisma([]),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/analytics/tasks?tenantId=tenant_1' });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { tasks: unknown[]; total: number; hasMore: boolean; nextCursor: null };
        assert.ok(Array.isArray(body.tasks));
        assert.equal(body.tasks.length, 0);
        assert.equal(body.total, 0);
        assert.equal(body.hasMore, false);
        assert.equal(body.nextCursor, null);
    } finally {
        await app.close();
    }
});

test('tasks: returns tasks for session tenantId and blocks cross-tenant request', async () => {
    const records = [makeTaskRecord()];
    const app = Fastify();
    await registerAnalyticsRoutes(app, {
        getSession: () => session(),
        prisma: makeTasksPrisma(records),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/analytics/tasks?tenantId=tenant_1' });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { tasks: Array<{ id: string }> };
        assert.equal(body.tasks.length, 1);
        assert.equal(body.tasks[0]?.id, 'task_1');

        const res2 = await app.inject({ method: 'GET', url: '/v1/analytics/tasks?tenantId=tenant_other' });
        assert.equal(res2.statusCode, 403);
        assert.equal(res2.json().error, 'forbidden');
    } finally {
        await app.close();
    }
});

test('tasks: filters by outcome=success — returns matching records', async () => {
    const records = [makeTaskRecord({ id: 'task_s', outcome: 'success' })];
    const app = Fastify();
    await registerAnalyticsRoutes(app, {
        getSession: () => session(),
        prisma: makeTasksPrisma(records, 1),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/analytics/tasks?tenantId=tenant_1&outcome=success',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { tasks: Array<{ outcome: string }>; total: number };
        assert.equal(body.tasks[0]?.outcome, 'success');
        assert.equal(body.total, 1);
    } finally {
        await app.close();
    }
});

test('tasks: filters by botId — returns matching record', async () => {
    const records = [makeTaskRecord({ botId: 'bot_target' })];
    const app = Fastify();
    await registerAnalyticsRoutes(app, {
        getSession: () => session(),
        prisma: makeTasksPrisma(records, 1),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/analytics/tasks?tenantId=tenant_1&botId=bot_target',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { tasks: Array<{ botId: string }> };
        assert.equal(body.tasks[0]?.botId, 'bot_target');
    } finally {
        await app.close();
    }
});

test('tasks: hasMore is true when result count equals limit', async () => {
    const records = Array.from({ length: 50 }, (_, i) =>
        makeTaskRecord({ id: `task_${i}`, executedAt: new Date(Date.now() - i * 1000) }),
    );
    const app = Fastify();
    await registerAnalyticsRoutes(app, {
        getSession: () => session(),
        prisma: makeTasksPrisma(records, 200),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/analytics/tasks?tenantId=tenant_1' });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { hasMore: boolean; tasks: unknown[] };
        assert.equal(body.tasks.length, 50);
        assert.equal(body.hasMore, true);
    } finally {
        await app.close();
    }
});

test('tasks: nextCursor is ISO string of last task executedAt', async () => {
    const executedAt = new Date('2026-05-01T10:00:00.000Z');
    const records = [makeTaskRecord({ id: 'last_task', executedAt })];
    const app = Fastify();
    await registerAnalyticsRoutes(app, {
        getSession: () => session(),
        prisma: makeTasksPrisma(records, 1),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/analytics/tasks?tenantId=tenant_1' });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { nextCursor: string };
        assert.ok(typeof body.nextCursor === 'string');
        assert.equal(new Date(body.nextCursor).toISOString(), executedAt.toISOString());
    } finally {
        await app.close();
    }
});

test('tasks: filters by workspaceId — returns matching record', async () => {
    const records = [makeTaskRecord({ workspaceId: 'ws_target' })];
    const app = Fastify();
    await registerAnalyticsRoutes(app, {
        getSession: () => session(),
        prisma: makeTasksPrisma(records, 1),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/analytics/tasks?tenantId=tenant_1&workspaceId=ws_target',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { tasks: Array<{ workspaceId: string }> };
        assert.equal(body.tasks[0]?.workspaceId, 'ws_target');
    } finally {
        await app.close();
    }
});

test('tasks: respects from/to date range params and returns 200', async () => {
    const app = Fastify();
    await registerAnalyticsRoutes(app, {
        getSession: () => session(),
        prisma: makeTasksPrisma([]),
    });
    try {
        const from = '2026-04-01T00:00:00.000Z';
        const to = '2026-04-30T23:59:59.000Z';
        const res = await app.inject({
            method: 'GET',
            url: `/v1/analytics/tasks?tenantId=tenant_1&from=${from}&to=${to}`,
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { tasks: unknown[]; total: number };
        assert.ok(Array.isArray(body.tasks));
        assert.equal(body.total, 0);
    } finally {
        await app.close();
    }
});
