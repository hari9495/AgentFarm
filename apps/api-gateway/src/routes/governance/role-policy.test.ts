import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registerRolePolicyRoutes } from './role-policy.js';

// ---------------------------------------------------------------------------
// In-memory GovernancePolicy stub (supports $transaction)
// ---------------------------------------------------------------------------

const makeStore = () => {
    const policies = new Map<string, Record<string, unknown>>();
    let seq = 0;

    const model = {
        create: async ({ data }: { data: Record<string, unknown> }) => {
            const id = `pol_${++seq}`;
            const row = { id, ...data };
            policies.set(id, row);
            return row;
        },
        findMany: async ({ where }: { where: Record<string, unknown> }) => {
            return Array.from(policies.values()).filter((p) => {
                for (const [k, v] of Object.entries(where)) {
                    if (p[k] !== v) return false;
                }
                return true;
            });
        },
        findFirst: async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: { version: 'desc' | 'asc' } }) => {
            const rows = Array.from(policies.values()).filter((p) => {
                for (const [k, v] of Object.entries(where)) {
                    if (p[k] !== v) return false;
                }
                return true;
            });
            if (orderBy?.version === 'desc') rows.sort((a, b) => Number(b.version) - Number(a.version));
            return rows[0] ?? null;
        },
        findUnique: async ({ where }: { where: { id: string } }) => policies.get(where.id) ?? null,
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const existing = policies.get(where.id);
            if (!existing) throw new Error('not found');
            const updated = { ...existing, ...data };
            policies.set(where.id, updated);
            return updated;
        },
    };

    const stub: any = {
        governancePolicy: model,
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(stub),
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

const buildApp = (session: typeof mockSession | null = mockSession) => {
    const store = makeStore();
    const app = Fastify();
    registerRolePolicyRoutes(app, store as never, { getSession: () => session });
    return { app, store };
};

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe('role-policy routes — auth', () => {
    it('returns 401 when there is no session', async () => {
        const { app } = buildApp(null);
        const res = await app.inject({ method: 'GET', url: '/v1/governance/role-policies' });
        assert.equal(res.statusCode, 401);
    });
});

// ---------------------------------------------------------------------------
// POST /v1/governance/role-policies — create + publish
// ---------------------------------------------------------------------------

describe('POST /v1/governance/role-policies', () => {
    it('returns 400 when roleKey or blockedActions are missing', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'POST', url: '/v1/governance/role-policies', payload: { roleKey: 'recruiter' } });
        assert.equal(res.statusCode, 400);
    });

    it('creates an active role policy with deny rules scoped to the session tenant', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/governance/role-policies',
            payload: { roleKey: 'sales_rep', name: 'No bulk email', blockedActions: ['send_email', 'send_contract'] },
        });
        assert.equal(res.statusCode, 201);
        const { policy } = res.json();
        assert.equal(policy.tenantId, mockSession.tenantId);
        assert.equal(policy.scope, 'role');
        assert.equal(policy.scopeRef, 'sales_rep');
        assert.equal(policy.status, 'active');
        assert.equal(policy.version, 1);
        const actions = (policy.rulesJson as Array<{ actionType: string; effect: string }>).map((r) => r.actionType);
        assert.deepEqual(actions.sort(), ['send_contract', 'send_email']);
        assert.ok((policy.rulesJson as Array<{ effect: string }>).every((r) => r.effect === 'deny'));
    });

    it('publishing a new version archives the prior active version for the same role', async () => {
        const { app, store } = buildApp();
        const first = await app.inject({
            method: 'POST', url: '/v1/governance/role-policies',
            payload: { roleKey: 'sales_rep', name: 'v1', blockedActions: ['send_email'] },
        });
        const firstId = first.json().policy.id;
        const second = await app.inject({
            method: 'POST', url: '/v1/governance/role-policies',
            payload: { roleKey: 'sales_rep', name: 'v2', blockedActions: ['send_email', 'create_deal'] },
        });
        assert.equal(second.json().policy.version, 2);
        assert.equal(store._policies.get(firstId)?.status, 'archived');
    });

    it('ignores blockedActions that are not non-empty strings', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/governance/role-policies',
            payload: { roleKey: 'developer', name: 'p', blockedActions: ['ok', '', 123, '  '] },
        });
        assert.equal(res.statusCode, 201);
        const actions = (res.json().policy.rulesJson as Array<{ actionType: string }>).map((r) => r.actionType);
        assert.deepEqual(actions, ['ok']);
    });
});

// ---------------------------------------------------------------------------
// GET /v1/governance/role-policies — list
// ---------------------------------------------------------------------------

describe('GET /v1/governance/role-policies', () => {
    it('lists active role policies for the session tenant, filterable by roleKey', async () => {
        const { app } = buildApp();
        await app.inject({ method: 'POST', url: '/v1/governance/role-policies', payload: { roleKey: 'sales_rep', name: 'a', blockedActions: ['x'] } });
        await app.inject({ method: 'POST', url: '/v1/governance/role-policies', payload: { roleKey: 'recruiter', name: 'b', blockedActions: ['y'] } });

        const all = await app.inject({ method: 'GET', url: '/v1/governance/role-policies' });
        assert.equal(all.json().policyCount, 2);

        const filtered = await app.inject({ method: 'GET', url: '/v1/governance/role-policies?roleKey=recruiter' });
        assert.equal(filtered.json().policyCount, 1);
        assert.equal(filtered.json().policies[0].scopeRef, 'recruiter');
    });
});

// ---------------------------------------------------------------------------
// DELETE /v1/governance/role-policies/:id — archive
// ---------------------------------------------------------------------------

describe('DELETE /v1/governance/role-policies/:id', () => {
    it('returns 404 for unknown policy', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'DELETE', url: '/v1/governance/role-policies/nope' });
        assert.equal(res.statusCode, 404);
    });

    it('archives the policy (soft delete)', async () => {
        const { app, store } = buildApp();
        const created = await app.inject({ method: 'POST', url: '/v1/governance/role-policies', payload: { roleKey: 'developer', name: 'p', blockedActions: ['x'] } });
        const id = created.json().policy.id;
        const res = await app.inject({ method: 'DELETE', url: `/v1/governance/role-policies/${id}` });
        assert.equal(res.statusCode, 200);
        assert.equal(store._policies.get(id)?.status, 'archived');
    });

    it('returns 403 when the policy belongs to another tenant', async () => {
        const { app, store } = buildApp();
        store._policies.set('foreign', { id: 'foreign', tenantId: 'other_tenant', scope: 'role', scopeRef: 'developer', status: 'active', version: 1 });
        const res = await app.inject({ method: 'DELETE', url: '/v1/governance/role-policies/foreign' });
        assert.equal(res.statusCode, 403);
    });
});
