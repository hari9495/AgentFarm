import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registerRetentionPolicyRoutes } from './retention-policy.js';

// ---------------------------------------------------------------------------
// In-memory Prisma stub
// ---------------------------------------------------------------------------

const makeStore = () => {
    const policies = new Map<string, Record<string, unknown>>();
    let seq = 0;

    const stub = {
        retentionPolicy: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
                const id = `pol_${++seq}`;
                const row = { id, ...data };
                policies.set(id, row);
                return row;
            },
            findMany: async ({ where }: { where: Record<string, unknown> }) => {
                return Array.from(policies.values()).filter(p => {
                    if (p.tenantId !== where['tenantId']) return false;
                    if (where['workspaceId'] && p.workspaceId !== where['workspaceId']) return false;
                    if (where['roleKey'] && p.roleKey !== where['roleKey']) return false;
                    const statusFilter = where['status'] as string | undefined;
                    if (statusFilter && p.status !== statusFilter) return false;
                    return true;
                });
            },
            findUnique: async ({ where }: { where: { id: string } }) => {
                return policies.get(where.id) ?? null;
            },
            update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
                const existing = policies.get(where.id);
                if (!existing) throw new Error('not found');
                const updated = { ...existing, ...data };
                policies.set(where.id, updated);
                return updated;
            },
            delete: async ({ where }: { where: { id: string } }) => {
                const existing = policies.get(where.id);
                policies.delete(where.id);
                return existing;
            },
        },
        agentSession: {
            count: async ({ where }: { where: Record<string, unknown> }) => {
                return where['retentionExpiresAt'] ? 2 : 5;
            },
        },
        _policies: policies,
    };
    return stub;
};

const mockSession = {
    userId: 'user_test',
    tenantId: 'tenant_test',
    workspaceIds: ['ws_test'],
    scope: 'customer' as const,
    expiresAt: Date.now() + 3_600_000,
};
const getSession = () => mockSession;

const buildApp = () => {
    const store = makeStore();
    const app = Fastify();
    registerRetentionPolicyRoutes(app, store as never, { getSession });
    return { app, store };
};

// ---------------------------------------------------------------------------
// POST /v1/retention-policies — create
// ---------------------------------------------------------------------------

describe('POST /v1/retention-policies', () => {
    it('returns 400 when required fields (name, scope, action) are missing', async () => {
        const { app } = buildApp();
        // tenantId is now taken from the session — only other required fields matter
        const res = await app.inject({
            method: 'POST',
            url: '/v1/retention-policies',
            payload: {},
        });
        assert.equal(res.statusCode, 400);
        assert.ok(res.json().error);
    });

    it('returns 400 when action is auto_delete_after_days but retentionDays is missing', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/retention-policies',
            payload: { name: 'p1', scope: 'workspace', action: 'auto_delete_after_days' },
        });
        assert.equal(res.statusCode, 400);
    });

    it('creates a policy and returns 201 scoped to the session tenant', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/retention-policies',
            payload: { name: 'Retain 30 days', scope: 'workspace', action: 'retain' },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json();
        assert.ok(body.policy.id);
        // tenantId must come from the session, not from the request body
        assert.equal(body.policy.tenantId, mockSession.tenantId);
        assert.equal(body.policy.name, 'Retain 30 days');
    });

    it('also registers under /api/v1 (deprecated alias)', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/retention-policies',
            payload: { name: 'p2', scope: 'tenant', action: 'retain' },
        });
        assert.equal(res.statusCode, 201);
    });
});

// ---------------------------------------------------------------------------
// GET /v1/retention-policies — list
// ---------------------------------------------------------------------------

describe('GET /v1/retention-policies', () => {
    it('returns 200 empty list when no policies exist for session tenant', async () => {
        const { app } = buildApp();
        // tenantId is now always from the session — no query param needed
        const res = await app.inject({ method: 'GET', url: '/v1/retention-policies' });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().policyCount, 0);
    });

    it('returns only policies belonging to the session tenant', async () => {
        const { app } = buildApp();
        // Both policies are created under the session tenant (mockSession.tenantId)
        await app.inject({
            method: 'POST', url: '/v1/retention-policies',
            payload: { name: 'p1', scope: 'workspace', action: 'retain' },
        });
        await app.inject({
            method: 'POST', url: '/v1/retention-policies',
            payload: { name: 'p2', scope: 'workspace', action: 'retain' },
        });
        const res = await app.inject({ method: 'GET', url: '/v1/retention-policies' });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.equal(body.tenantId, mockSession.tenantId);
        assert.equal(body.policyCount, 2);
    });
});

// ---------------------------------------------------------------------------
// GET /v1/retention-policies/:policyId
// ---------------------------------------------------------------------------

describe('GET /v1/retention-policies/:policyId', () => {
    it('returns 404 for unknown policyId', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/retention-policies/nonexistent' });
        assert.equal(res.statusCode, 404);
    });

    it('returns the policy for a known policyId', async () => {
        const { app } = buildApp();
        const createRes = await app.inject({
            method: 'POST', url: '/v1/retention-policies',
            payload: { name: 'p1', scope: 'workspace', action: 'retain' },
        });
        const { policy } = createRes.json();
        const res = await app.inject({ method: 'GET', url: `/v1/retention-policies/${policy.id}` });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().policy.id, policy.id);
    });
});

// ---------------------------------------------------------------------------
// PATCH /v1/retention-policies/:policyId
// ---------------------------------------------------------------------------

describe('PATCH /v1/retention-policies/:policyId', () => {
    it('returns 404 for unknown policy', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'PATCH', url: '/v1/retention-policies/nope',
            payload: { name: 'new name' },
        });
        assert.equal(res.statusCode, 404);
    });

    it('returns 400 when trying to modify tenantId', async () => {
        const { app } = buildApp();
        const createRes = await app.inject({
            method: 'POST', url: '/v1/retention-policies',
            payload: { name: 'p1', scope: 'workspace', action: 'retain' },
        });
        const id = createRes.json().policy.id;
        const res = await app.inject({
            method: 'PATCH', url: `/v1/retention-policies/${id}`,
            payload: { tenantId: 't2' },
        });
        assert.equal(res.statusCode, 400);
    });

    it('updates name and returns updated policy', async () => {
        const { app } = buildApp();
        const createRes = await app.inject({
            method: 'POST', url: '/v1/retention-policies',
            payload: { name: 'Old Name', scope: 'workspace', action: 'retain' },
        });
        const id = createRes.json().policy.id;
        const res = await app.inject({
            method: 'PATCH', url: `/v1/retention-policies/${id}`,
            payload: { name: 'New Name' },
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().policy.name, 'New Name');
    });
});

// ---------------------------------------------------------------------------
// DELETE /v1/retention-policies/:policyId
// ---------------------------------------------------------------------------

describe('DELETE /v1/retention-policies/:policyId', () => {
    it('returns 404 for unknown policy', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'DELETE', url: '/v1/retention-policies/nope' });
        assert.equal(res.statusCode, 404);
    });

    it('soft-deletes (archives) policy by default', async () => {
        const { app, store } = buildApp();
        const createRes = await app.inject({
            method: 'POST', url: '/v1/retention-policies',
            payload: { name: 'p1', scope: 'workspace', action: 'retain' },
        });
        const id = createRes.json().policy.id;
        const res = await app.inject({ method: 'DELETE', url: `/v1/retention-policies/${id}` });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().policyId, id);
        // Policy is archived, not deleted
        assert.ok(store._policies.has(id), 'soft-delete should not remove from store');
        assert.equal(store._policies.get(id)?.status, 'archived');
    });

    it('hard-deletes when ?mode=hard', async () => {
        const { app, store } = buildApp();
        const createRes = await app.inject({
            method: 'POST', url: '/v1/retention-policies',
            payload: { name: 'p1', scope: 'workspace', action: 'retain' },
        });
        const id = createRes.json().policy.id;
        const res = await app.inject({ method: 'DELETE', url: `/v1/retention-policies/${id}?mode=hard` });
        assert.equal(res.statusCode, 200);
        assert.ok(!store._policies.has(id), 'hard-delete should remove from store');
    });
});

// ---------------------------------------------------------------------------
// POST /v1/retention-policies/:policyId/set-default
// ---------------------------------------------------------------------------

describe('POST /v1/retention-policies/:policyId/set-default', () => {
    it('returns 404 for unknown policy', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/retention-policies/nope/set-default',
            payload: {},
        });
        assert.equal(res.statusCode, 404);
    });

    it('returns 200 when policy belongs to the session tenant', async () => {
        const { app } = buildApp();
        // tenantId is now always taken from session — no need to pass it in the body
        const createRes = await app.inject({
            method: 'POST', url: '/v1/retention-policies',
            payload: { name: 'p1', scope: 'workspace', action: 'retain' },
        });
        const id = createRes.json().policy.id;
        const res = await app.inject({
            method: 'POST', url: `/v1/retention-policies/${id}/set-default`,
            payload: {},
        });
        assert.equal(res.statusCode, 200);
        assert.ok(res.json().message.includes(id));
    });
});

// ---------------------------------------------------------------------------
// GET /v1/retention-policies/:policyId/stats
// ---------------------------------------------------------------------------

describe('GET /v1/retention-policies/:policyId/stats', () => {
    it('returns 404 for unknown policy', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/retention-policies/nope/stats' });
        assert.equal(res.statusCode, 404);
    });

    it('returns session stats for known policy', async () => {
        const { app } = buildApp();
        const createRes = await app.inject({
            method: 'POST', url: '/v1/retention-policies',
            payload: { tenantId: 't1', name: 'p1', scope: 'workspace', action: 'retain' },
        });
        const id = createRes.json().policy.id;
        const res = await app.inject({ method: 'GET', url: `/v1/retention-policies/${id}/stats` });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.equal(body.policyId, id);
        assert.ok(typeof body.sessionsManaged === 'number');
        assert.ok(typeof body.sessionsExpired === 'number');
    });
});
