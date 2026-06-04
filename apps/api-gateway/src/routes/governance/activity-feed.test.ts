import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registerActivityFeedRoutes } from './activity-feed.js';

// ---------------------------------------------------------------------------
// In-memory stub
// ---------------------------------------------------------------------------

type AeRow = { id: string; workspaceId: string; category: string; title: string; body: string | null; payload: unknown; status: string; createdAt: Date };
type DispatchRow = { id: string; workspaceId: string; fromAgentId: string; toAgentId: string; taskDescription: string; status: string; queuedAt: Date; completedAt: Date | null; errorMessage: string | null };
type ApprovalRow = { id: string; workspaceId: string; botId: string; actionSummary: string; riskLevel: string; decision: string; requestedBy: string; approverId: string | null; createdAt: Date; decidedAt: Date | null; decisionReason: string | null };

const makeStore = () => {
    const ae: AeRow[] = [];
    const disp: DispatchRow[] = [];
    const appr: ApprovalRow[] = [];

    const stub = {
        activityEvent: {
            findMany: async ({ where }: { where: Record<string, unknown> }) =>
                ae.filter(e => e.workspaceId === where['workspaceId']),
        },
        agentDispatchRecord: {
            findMany: async ({ where }: { where: Record<string, unknown> }) =>
                disp.filter(d => d.workspaceId === where['workspaceId'] && (!where['toAgentId'] || d.toAgentId === where['toAgentId'])),
        },
        approval: {
            findMany: async ({ where }: { where: Record<string, unknown> }) =>
                appr.filter(a => a.workspaceId === where['workspaceId'] && (!where['botId'] || a.botId === where['botId'])),
        },
        _ae: ae, _disp: disp, _appr: appr,
    };
    return stub;
};

const session = () => ({ userId: 'u1', tenantId: 't1', workspaceIds: ['ws_1'], expiresAt: Date.now() + 60_000 });

const buildApp = () => {
    const store = makeStore();
    const app = Fastify();
    registerActivityFeedRoutes(app, { getSession: () => session(), prisma: store as never });
    return { app, store };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /v1/workspaces/:workspaceId/activity-feed', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerActivityFeedRoutes(app, { getSession: () => null });
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/activity-feed' });
        assert.equal(res.statusCode, 401);
    });

    it('returns 403 when workspace is outside session scope', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_other/activity-feed' });
        assert.equal(res.statusCode, 403);
    });

    it('returns empty feed for workspace with no data', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/activity-feed' });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.ok(Array.isArray(body.items));
        assert.equal(body.items.length, 0);
        assert.equal(body.total, 0);
    });

    it('includes activity events in feed with source=activity_event', async () => {
        const { app, store } = buildApp();
        store._ae.push({
            id: 'ev1', workspaceId: 'ws_1', category: 'runtime', title: 'Task completed',
            body: null, payload: null, status: 'read', createdAt: new Date(),
        });
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/activity-feed' });
        assert.equal(res.statusCode, 200);
        const items = res.json().items as { id: string; source: string }[];
        assert.equal(items.length, 1);
        assert.equal(items[0]!.id, 'ae-ev1');
        assert.equal(items[0]!.source, 'activity_event');
    });

    it('maps "Task completed" title to success status', async () => {
        const { app, store } = buildApp();
        store._ae.push({
            id: 'ev2', workspaceId: 'ws_1', category: 'runtime', title: 'Task completed',
            body: null, payload: null, status: 'read', createdAt: new Date(),
        });
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/activity-feed' });
        const item = res.json().items[0] as { status: string };
        assert.equal(item.status, 'success');
    });

    it('forces security category events to warning status', async () => {
        const { app, store } = buildApp();
        store._ae.push({
            id: 'sec1', workspaceId: 'ws_1', category: 'security', title: 'Suspicious activity',
            body: null, payload: null, status: 'unread', createdAt: new Date(),
        });
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/activity-feed' });
        const item = res.json().items[0] as { status: string };
        assert.equal(item.status, 'warning');
    });

    it('includes dispatches in feed with source=dispatch', async () => {
        const { app, store } = buildApp();
        store._disp.push({
            id: 'd1', workspaceId: 'ws_1', fromAgentId: 'agent_a', toAgentId: 'agent_b',
            taskDescription: 'Do the thing', status: 'completed', queuedAt: new Date(),
            completedAt: null, errorMessage: null,
        });
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/activity-feed' });
        const items = res.json().items as { id: string; source: string }[];
        const dispatch = items.find(i => i.id === 'dispatch-d1');
        assert.ok(dispatch);
        assert.equal(dispatch.source, 'dispatch');
    });

    it('includes approvals in feed with source=approval', async () => {
        const { app, store } = buildApp();
        store._appr.push({
            id: 'app1', workspaceId: 'ws_1', botId: 'bot_1', actionSummary: 'delete files',
            riskLevel: 'high', decision: 'approved', requestedBy: 'u1', approverId: 'u2',
            createdAt: new Date(), decidedAt: null, decisionReason: null,
        });
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/activity-feed' });
        const items = res.json().items as { id: string; source: string }[];
        const approval = items.find(i => i.id === 'approval-app1');
        assert.ok(approval);
        assert.equal(approval.source, 'approval');
    });

    it('merges and counts all three sources', async () => {
        const { app, store } = buildApp();
        const now = new Date();
        store._ae.push({ id: 'e1', workspaceId: 'ws_1', category: 'runtime', title: 'Done', body: null, payload: null, status: 'read', createdAt: now });
        store._disp.push({ id: 'd1', workspaceId: 'ws_1', fromAgentId: 'a', toAgentId: 'b', taskDescription: 'x', status: 'queued', queuedAt: now, completedAt: null, errorMessage: null });
        store._appr.push({ id: 'a1', workspaceId: 'ws_1', botId: 'b', actionSummary: 'y', riskLevel: 'low', decision: 'pending', requestedBy: 'u', approverId: null, createdAt: now, decidedAt: null, decisionReason: null });
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/activity-feed' });
        assert.equal(res.json().total, 3);
    });

    it('applies category filter client-side', async () => {
        const { app, store } = buildApp();
        const now = new Date();
        store._ae.push(
            { id: 'r1', workspaceId: 'ws_1', category: 'runtime', title: 'A', body: null, payload: null, status: 'read', createdAt: now },
            { id: 'c1', workspaceId: 'ws_1', category: 'ci', title: 'B', body: null, payload: null, status: 'read', createdAt: now },
        );
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/activity-feed?category=runtime' });
        const items = res.json().items as { category: string }[];
        assert.ok(items.length >= 1);
        assert.ok(items.every(i => i.category === 'runtime'));
    });

    it('applies agentId filter to dispatches and approvals', async () => {
        const { app, store } = buildApp();
        const now = new Date();
        store._disp.push(
            { id: 'd1', workspaceId: 'ws_1', fromAgentId: 'a', toAgentId: 'target_bot', taskDescription: 'task', status: 'queued', queuedAt: now, completedAt: null, errorMessage: null },
            { id: 'd2', workspaceId: 'ws_1', fromAgentId: 'a', toAgentId: 'other_bot', taskDescription: 'task', status: 'queued', queuedAt: now, completedAt: null, errorMessage: null },
        );
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/activity-feed?agentId=target_bot' });
        const items = res.json().items as { id: string }[];
        assert.ok(items.some(i => i.id === 'dispatch-d1'));
        assert.ok(!items.some(i => i.id === 'dispatch-d2'));
    });
});
