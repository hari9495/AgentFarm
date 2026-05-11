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
