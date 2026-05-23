import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerDealsRoutes } from './deals.js';
import type { closeDealLost } from '@agentfarm/agent-runtime/sales/deal-closer.js';
import type { sendContractInvite } from '@agentfarm/agent-runtime/sales/contract-sender.js';

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
    salesDeal: {
        findUnique: (args: { where: { id: string }; include?: Row }) => Promise<Row | null>;
        findMany: (args: { where: Row; include?: Row; skip?: number; take?: number; orderBy?: Row }) => Promise<Row[]>;
        update: (args: { where: { id: string }; data: Row }) => Promise<Row>;
        count: (args: { where: Row }) => Promise<number>;
    };
    salesActivity: {
        create: (args: { data: Row }) => Promise<{ id: string }>;
        findMany: (args: { where: Row; skip?: number; take?: number; orderBy?: Row }) => Promise<Row[]>;
        count: (args: { where: Row }) => Promise<number>;
    };
    salesAgentConfig: {
        findFirst: (args: { where: Row }) => Promise<Row | null>;
    };
    winLossEvent: {
        findMany: (args: { where: Row }) => Promise<Row[]>;
    };
    prospect: {
        update: (args: { where: { id: string }; data: Row }) => Promise<Row>;
    };
    _updates: Row[];
}

function makePrismaStub(
    deal: Row | null = null,
    config: Row | null = null,
    deals: Row[] = [],
    activities: Row[] = [],
    winLossEvents: Row[] = [],
): PrismaStub {
    const updates: Row[] = [];
    return {
        salesDeal: {
            async findUnique() { return deal; },
            async findMany() { return deals; },
            async update({ data }: { where: { id: string }; data: Row }) {
                updates.push(data);
                return { ...deal, ...data };
            },
            async count() { return deals.length; },
        },
        salesActivity: {
            async create() { return { id: 'sa-1' }; },
            async findMany() { return activities; },
            async count() { return activities.length; },
        },
        salesAgentConfig: {
            async findFirst() { return config; },
        },
        winLossEvent: {
            async findMany() { return winLossEvents; },
        },
        prospect: {
            async update({ data }: { where: { id: string }; data: Row }) {
                updates.push(data);
                return data;
            },
        },
        _updates: updates,
    };
}

function makeApp(
    prisma: PrismaStub,
    session: SessionContext | null,
    closeDealLostFn?: typeof closeDealLost,
    sendContractInviteFn?: typeof sendContractInvite,
) {
    const app = Fastify({ logger: false });
    void registerDealsRoutes(app, {
        getSession: () => session,
        prisma: prisma as never,
        closeDealLostFn,
        sendContractInviteFn,
    });
    return app;
}

const SESSION: SessionContext = {
    userId: 'u1',
    tenantId: 't1',
    workspaceIds: [],
    expiresAt: Date.now() + 3600_000,
};

const DEAL: Row = {
    id: 'deal-1',
    tenantId: 't1',
    botId: 'bot-1',
    prospectId: 'p-1',
    stage: 'proposal',
    title: 'Big Sale',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /v1/sales/deals/:id/close-lost', () => {
    test('returns 401 when not authenticated', async () => {
        const app = makeApp(makePrismaStub(DEAL), null);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/sales/deals/deal-1/close-lost',
            payload: { botId: 'bot-1' },
        });
        assert.equal(res.statusCode, 401);
    });

    test('calls closeDealLost and returns 200', async () => {
        let lostCalled = false;
        const closeDealLostFn = (async () => { lostCalled = true; return { closed: true, outcome: 'lost' as const }; }) as typeof closeDealLost;

        const app = makeApp(makePrismaStub(DEAL), SESSION, closeDealLostFn);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/sales/deals/deal-1/close-lost',
            payload: { botId: 'bot-1', reason: 'Budget cut' },
        });
        assert.equal(res.statusCode, 200);
        assert.ok(lostCalled, 'closeDealLost should be called');
    });
});

describe('PATCH /v1/sales/deals/:id/stage', () => {
    test('returns 422 for invalid stage transition', async () => {
        const app = makeApp(makePrismaStub(DEAL), SESSION);
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/sales/deals/deal-1/stage',
            payload: { stage: 'closed_won', botId: 'bot-1' },
        });
        assert.equal(res.statusCode, 422);
    });

    test('advances stage from proposal to negotiation', async () => {
        const prisma = makePrismaStub(DEAL);
        const app = makeApp(prisma, SESSION);
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/sales/deals/deal-1/stage',
            payload: { stage: 'negotiation', botId: 'bot-1' },
        });
        assert.equal(res.statusCode, 200);
        assert.ok(prisma._updates.some(u => String(u['stage']) === 'negotiation'));
    });
});

describe('GET /v1/sales/deals', () => {
    test('returns 401 when not authenticated', async () => {
        const app = makeApp(makePrismaStub(null, null, [DEAL]), null);
        const res = await app.inject({ method: 'GET', url: '/v1/sales/deals' });
        assert.equal(res.statusCode, 401);
    });

    test('returns paginated deals list', async () => {
        const app = makeApp(makePrismaStub(null, null, [DEAL]), SESSION);
        const res = await app.inject({ method: 'GET', url: '/v1/sales/deals' });
        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.body) as { deals: Row[]; total: number };
        assert.equal(body.deals.length, 1);
        assert.equal(body.total, 1);
    });
});

describe('GET /v1/sales/deals/:id', () => {
    test('returns 404 when deal not found', async () => {
        const app = makeApp(makePrismaStub(null), SESSION);
        const res = await app.inject({ method: 'GET', url: '/v1/sales/deals/not-found' });
        assert.equal(res.statusCode, 404);
    });
});

describe('GET /v1/sales/activities', () => {
    test('returns 401 when not authenticated', async () => {
        const app = makeApp(makePrismaStub(), null);
        const res = await app.inject({ method: 'GET', url: '/v1/sales/activities' });
        assert.equal(res.statusCode, 401);
    });

    test('returns paginated activities', async () => {
        const ACTIVITY: Row = { id: 'act-1', tenantId: 't1', activityType: 'note', subject: 'Test', createdAt: new Date().toISOString() };
        const app = makeApp(makePrismaStub(null, null, [], [ACTIVITY]), SESSION);
        const res = await app.inject({ method: 'GET', url: '/v1/sales/activities' });
        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.body) as { activities: Row[]; total: number; page: number };
        assert.equal(body.activities.length, 1);
        assert.equal(body.total, 1);
        assert.equal(body.page, 1);
    });
});

describe('GET /v1/sales/stats', () => {
    test('returns 401 when not authenticated', async () => {
        const app = makeApp(makePrismaStub(), null);
        const res = await app.inject({ method: 'GET', url: '/v1/sales/stats' });
        assert.equal(res.statusCode, 401);
    });

    test('returns win/loss stats', async () => {
        const deals: Row[] = [
            { id: 'd1', tenantId: 't1', stage: 'closed_won', value: 5000 },
            { id: 'd2', tenantId: 't1', stage: 'closed_lost', value: 2000 },
            { id: 'd3', tenantId: 't1', stage: 'proposal', value: 3000 },
        ];
        const events: Row[] = [
            { id: 'e1', tenantId: 't1', outcome: 'won', daysToClose: 20 },
            { id: 'e2', tenantId: 't1', outcome: 'won', daysToClose: 30 },
        ];
        const app = makeApp(makePrismaStub(null, null, deals, [], events), SESSION);
        const res = await app.inject({ method: 'GET', url: '/v1/sales/stats' });
        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.body) as { totalWon: number; totalLost: number; totalPipelineValue: number; wonValue: number; avgDaysToClose: number };
        assert.equal(body.totalWon, 1);
        assert.equal(body.totalLost, 1);
        assert.equal(body.totalPipelineValue, 3000);
        assert.equal(body.wonValue, 5000);
        assert.equal(body.avgDaysToClose, 25);
    });
});

describe('PATCH /v1/sales/deals/:id/reopen', () => {
    test('returns 400 when deal is not closed_lost', async () => {
        const app = makeApp(makePrismaStub(DEAL), SESSION); // DEAL.stage = 'proposal'
        const res = await app.inject({ method: 'PATCH', url: '/v1/sales/deals/deal-1/reopen' });
        assert.equal(res.statusCode, 400);
    });

    test('reopens closed_lost deal successfully', async () => {
        const LOST_DEAL: Row = { ...DEAL, stage: 'closed_lost', closedAt: new Date().toISOString() };
        const prisma = makePrismaStub(LOST_DEAL);
        const app = makeApp(prisma, SESSION);
        const res = await app.inject({ method: 'PATCH', url: '/v1/sales/deals/deal-1/reopen' });
        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.body) as { reopened: boolean };
        assert.ok(body.reopened);
        assert.ok(prisma._updates.some(u => String(u['stage']) === 'discovery'));
    });
});
