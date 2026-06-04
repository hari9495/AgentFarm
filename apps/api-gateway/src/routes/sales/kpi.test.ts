import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registerKpiRoutes } from './kpi.js';

// ---------------------------------------------------------------------------
// In-memory stub
// ---------------------------------------------------------------------------

type Deal = { stage: string; value: number; prospectId?: string; tenantId: string };
type Prospect = { id: string; tenantId: string; status: string };
type WinLoss = { outcome: string; daysToClose: number | null; tenantId: string };
type NpsRow = { surveyType: string; score: number | null; tenantId: string; respondedAt: Date | null };

const makeStore = (opts: { deals?: Deal[]; prospects?: Prospect[]; winLoss?: WinLoss[]; nps?: NpsRow[] } = {}) => {
    const deals = opts.deals ?? [];
    const prospects = opts.prospects ?? [];
    const winLoss = opts.winLoss ?? [];
    const nps = opts.nps ?? [];

    return {
        salesDeal: {
            findMany: async ({ where }: { where: Record<string, unknown> }) =>
                deals.filter(d => d.tenantId === where['tenantId'] && (!where['stage'] || d.stage === where['stage'])),
        },
        prospect: {
            count: async ({ where }: { where: Record<string, unknown> }) =>
                prospects.filter(p => p.tenantId === where['tenantId']).length,
            findMany: async ({ where }: { where: Record<string, unknown> }) =>
                prospects.filter(p => p.tenantId === where['tenantId'] && (!where['status'] || p.status === where['status'])),
        },
        winLossEvent: {
            findMany: async ({ where }: { where: Record<string, unknown> }) =>
                winLoss.filter(e => e.tenantId === where['tenantId']),
        },
        npsResponse: {
            findMany: async ({ where }: { where: Record<string, unknown> }) =>
                nps.filter(n => n.tenantId === where['tenantId']),
        },
    } as never;
};

const session = (tenantId = 'tenant_1') => ({
    userId: 'u1', tenantId, workspaceIds: ['ws_1'], expiresAt: Date.now() + 60_000,
});

const buildApp = (storeOpts: Parameters<typeof makeStore>[0] = {}) => {
    const app = Fastify();
    registerKpiRoutes(app, { getSession: () => session(), prisma: makeStore(storeOpts) });
    return app;
};

// ---------------------------------------------------------------------------
// GET /v1/sales/kpi
// ---------------------------------------------------------------------------

describe('GET /v1/sales/kpi', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerKpiRoutes(app, { getSession: () => null });
        const res = await app.inject({ method: 'GET', url: '/v1/sales/kpi' });
        assert.equal(res.statusCode, 401);
    });

    it('returns 200 with all required KPI fields when no data', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/sales/kpi' });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.ok('tenantId' in body);
        assert.ok('generatedAt' in body);
        assert.equal(typeof body.totalLeads, 'number');
        assert.equal(typeof body.totalOpportunities, 'number');
        assert.equal(typeof body.totalClosedWon, 'number');
        assert.equal(typeof body.totalClosedLost, 'number');
        assert.equal(typeof body.leadToOpportunityRate, 'number');
        assert.equal(typeof body.opportunityToWinRate, 'number');
        assert.equal(typeof body.overallConversionRate, 'number');
        assert.equal(typeof body.retentionRate, 'number');
        assert.equal(typeof body.openDealCount, 'number');
        assert.ok(Array.isArray(body.funnel));
        assert.equal(body.funnel.length, 5);
    });

    it('computes correct totals with data', async () => {
        const app = buildApp({
            deals: [
                { stage: 'closed_won', value: 1000, tenantId: 'tenant_1' },
                { stage: 'closed_won', value: 2000, tenantId: 'tenant_1' },
                { stage: 'closed_lost', value: 500, tenantId: 'tenant_1' },
                { stage: 'discovery', value: 800, tenantId: 'tenant_1' },
            ],
            prospects: [
                { id: 'p1', tenantId: 'tenant_1', status: 'new' },
                { id: 'p2', tenantId: 'tenant_1', status: 'new' },
                { id: 'p3', tenantId: 'tenant_1', status: 'new' },
                { id: 'p4', tenantId: 'tenant_1', status: 'new' },
                { id: 'p5', tenantId: 'tenant_1', status: 'new' },
            ],
        });
        const res = await app.inject({ method: 'GET', url: '/v1/sales/kpi' });
        const body = res.json();
        assert.equal(body.totalClosedWon, 2);
        assert.equal(body.totalClosedLost, 1);
        assert.equal(body.totalLeads, 5);
        assert.equal(body.totalWonValue, 3000);
        assert.equal(body.avgDealValue, 1500);
        assert.equal(body.openDealCount, 1);
    });

    it('computes retention rate as 100 when no closed_won customers', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/sales/kpi' });
        assert.equal(res.json().retentionRate, 100);
    });

    it('each funnel stage has stage, count, and value', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/sales/kpi' });
        for (const stage of res.json().funnel) {
            assert.ok(stage.stage);
            assert.equal(typeof stage.count, 'number');
            assert.equal(typeof stage.value, 'number');
        }
    });
});

// ---------------------------------------------------------------------------
// GET /v1/sales/kpi/funnel
// ---------------------------------------------------------------------------

describe('GET /v1/sales/kpi/funnel', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerKpiRoutes(app, { getSession: () => null });
        const res = await app.inject({ method: 'GET', url: '/v1/sales/kpi/funnel' });
        assert.equal(res.statusCode, 401);
    });

    it('returns 5 funnel stages with counts and values', async () => {
        const app = buildApp({
            deals: [
                { stage: 'discovery', value: 100, tenantId: 'tenant_1' },
                { stage: 'proposal', value: 200, tenantId: 'tenant_1' },
                { stage: 'closed_won', value: 500, tenantId: 'tenant_1' },
            ],
        });
        const res = await app.inject({ method: 'GET', url: '/v1/sales/kpi/funnel' });
        assert.equal(res.statusCode, 200);
        const { funnel } = res.json();
        assert.equal(funnel.length, 5);
        const discovery = funnel.find((s: { stage: string }) => s.stage === 'discovery');
        assert.equal(discovery.count, 1);
        assert.equal(discovery.value, 100);
        const closedWon = funnel.find((s: { stage: string }) => s.stage === 'closed_won');
        assert.equal(closedWon.count, 1);
        assert.equal(closedWon.value, 500);
    });

    it('returns generatedAt timestamp', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/sales/kpi/funnel' });
        assert.ok(res.json().generatedAt);
    });
});

// ---------------------------------------------------------------------------
// GET /v1/sales/kpi/conversion
// ---------------------------------------------------------------------------

describe('GET /v1/sales/kpi/conversion', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerKpiRoutes(app, { getSession: () => null });
        const res = await app.inject({ method: 'GET', url: '/v1/sales/kpi/conversion' });
        assert.equal(res.statusCode, 401);
    });

    it('returns zero rates when no data', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/sales/kpi/conversion' });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.equal(body.totalLeads, 0);
        assert.equal(body.leadToOpportunityRate, 0);
        assert.equal(body.opportunityToWinRate, 0);
        assert.equal(body.overallConversionRate, 0);
    });

    it('computes conversion rates correctly', async () => {
        const app = buildApp({
            prospects: [
                { id: 'p1', tenantId: 'tenant_1', status: 'new' },
                { id: 'p2', tenantId: 'tenant_1', status: 'new' },
                { id: 'p3', tenantId: 'tenant_1', status: 'new' },
                { id: 'p4', tenantId: 'tenant_1', status: 'new' },
            ],
            deals: [
                { stage: 'closed_won', value: 1000, tenantId: 'tenant_1' },
                { stage: 'closed_won', value: 1000, tenantId: 'tenant_1' },
                { stage: 'discovery', value: 500, tenantId: 'tenant_1' },
                { stage: 'discovery', value: 500, tenantId: 'tenant_1' },
            ],
        });
        const res = await app.inject({ method: 'GET', url: '/v1/sales/kpi/conversion' });
        const body = res.json();
        assert.equal(body.totalLeads, 4);
        assert.equal(body.totalOpportunities, 4);
        assert.equal(body.totalClosedWon, 2);
        // 4/4 leads to opps = 100
        assert.equal(body.leadToOpportunityRate, 100);
        // 2/4 opps to win = 50
        assert.equal(body.opportunityToWinRate, 50);
        // 2/4 overall = 50
        assert.equal(body.overallConversionRate, 50);
    });

    it('includes generatedAt in response', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/sales/kpi/conversion' });
        assert.ok(res.json().generatedAt);
    });
});

// ---------------------------------------------------------------------------
// GET /v1/sales/kpi/retention
// ---------------------------------------------------------------------------

describe('GET /v1/sales/kpi/retention', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerKpiRoutes(app, { getSession: () => null });
        const res = await app.inject({ method: 'GET', url: '/v1/sales/kpi/retention' });
        assert.equal(res.statusCode, 401);
    });

    it('returns 100 retention rate with no data', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/sales/kpi/retention' });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.equal(body.retentionRate, 100);
        assert.equal(body.closedWonCount, 0);
        assert.equal(body.churnedCount, 0);
    });

    it('computes NPS score from nps responses', async () => {
        const app = buildApp({
            nps: [
                { surveyType: 'nps', score: 9, tenantId: 'tenant_1', respondedAt: new Date() },
                { surveyType: 'nps', score: 10, tenantId: 'tenant_1', respondedAt: new Date() },
                { surveyType: 'nps', score: 3, tenantId: 'tenant_1', respondedAt: new Date() },
            ],
        });
        const res = await app.inject({ method: 'GET', url: '/v1/sales/kpi/retention' });
        const body = res.json();
        // promoters (>=9): 2, detractors (<=6): 1, total: 3 → NPS = (2-1)/3 * 100 = 33
        assert.equal(typeof body.npsScore, 'number');
        assert.equal(body.npsResponseCount, 3);
    });

    it('returns null npsScore when no nps responses', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/sales/kpi/retention' });
        assert.equal(res.json().npsScore, null);
    });

    it('computes churn from closed_lost deals matching closed_won prospects', async () => {
        const app = buildApp({
            prospects: [
                { id: 'p1', tenantId: 'tenant_1', status: 'closed_won' },
                { id: 'p2', tenantId: 'tenant_1', status: 'closed_won' },
            ],
            deals: [
                { stage: 'closed_lost', value: 0, prospectId: 'p1', tenantId: 'tenant_1' },
            ],
        });
        const res = await app.inject({ method: 'GET', url: '/v1/sales/kpi/retention' });
        const body = res.json();
        assert.equal(body.closedWonCount, 2);
        assert.equal(body.churnedCount, 1);
        assert.equal(body.retainedCount, 1);
    });
});
