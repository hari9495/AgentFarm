import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registerGovernancePolicyRoutes } from './policy.js';

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
        findMany: async ({ where }: { where: Record<string, unknown> }) =>
            [...policies.values()].filter((p) => Object.entries(where).every(([k, v]) => p[k] === v)),
        findFirst: async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: { version: 'desc' } }) => {
            const rows = [...policies.values()].filter((p) => Object.entries(where).every(([k, v]) => p[k] === v));
            if (orderBy?.version === 'desc') rows.sort((a, b) => Number(b.version) - Number(a.version));
            return rows[0] ?? null;
        },
        findUnique: async ({ where }: { where: { id: string } }) => policies.get(where.id) ?? null,
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const ex = policies.get(where.id);
            if (!ex) throw new Error('not found');
            const up = { ...ex, ...data };
            policies.set(where.id, up);
            return up;
        },
    };
    const stub: any = {
        governancePolicy: model,
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(stub),
        _policies: policies,
    };
    return stub;
};

const mockSession = { userId: 'u1', tenantId: 'tenant_test', workspaceIds: ['ws'], scope: 'customer' as const, expiresAt: Date.now() + 3_600_000 };
const buildApp = (session: typeof mockSession | null = mockSession) => {
    const store = makeStore();
    const app = Fastify();
    registerGovernancePolicyRoutes(app, store as never, { getSession: () => session });
    return { app, store };
};

describe('governance policy routes — auth & validation', () => {
    it('401 without session', async () => {
        const { app } = buildApp(null);
        const res = await app.inject({ method: 'GET', url: '/v1/governance/policies?scope=role&roleKey=developer' });
        assert.equal(res.statusCode, 401);
    });

    it('400 when scope=role without roleKey', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'POST', url: '/v1/governance/policies', payload: { scope: 'role', blockedActions: ['x'] } });
        assert.equal(res.statusCode, 400);
    });

    it('400 when no rules at all', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'POST', url: '/v1/governance/policies', payload: { scope: 'tenant' } });
        assert.equal(res.statusCode, 400);
    });
});

describe('POST /v1/governance/policies — combined rule document', () => {
    it('publishes blocked actions + connector verbs + read-only + denied tools as one document (role scope)', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/governance/policies',
            payload: {
                scope: 'role', roleKey: 'developer', name: 'dev guardrails',
                blockedActions: ['deploy_production'],
                connectors: [
                    { connector: 'salesforce', readOnly: true },
                    { connector: 'jira', deniedVerbs: ['merge_pr'] },
                ],
                deniedTools: ['jira.delete'],
            },
        });
        assert.equal(res.statusCode, 201);
        const { policy } = res.json();
        assert.equal(policy.scope, 'role');
        assert.equal(policy.scopeRef, 'developer');
        assert.equal(policy.status, 'active');
        const rules = policy.rulesJson as Array<Record<string, unknown>>;
        assert.ok(rules.some((r) => r.actionType === 'deploy_production' && r.effect === 'deny' && !r.connector));
        assert.ok(rules.some((r) => r.connector === 'salesforce' && r.mode === 'read_only'));
        assert.ok(rules.some((r) => r.connector === 'jira' && r.actionType === 'merge_pr'));
        assert.ok(rules.some((r) => r.tool === 'jira.delete'));
    });

    it('publishes env, time, and webhook-domain rules into the document (Phase 4)', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/governance/policies',
            payload: {
                scope: 'tenant',
                envRules: [{ env: 'production', actionType: 'deploy_production' }],
                timeRules: [{ start: '09:00', end: '17:00', tz: 'UTC', days: [1, 2, 3, 4, 5] }],
                webhookDomains: { mode: 'deny', domains: ['evil.com'] },
            },
        });
        assert.equal(res.statusCode, 201);
        const rules = res.json().policy.rulesJson as Array<Record<string, unknown>>;
        assert.ok(rules.some((r) => r.env === 'production' && r.actionType === 'deploy_production'));
        assert.ok(rules.some((r) => r.timeWindow && (r.timeWindow as any).start === '09:00'));
        assert.ok(rules.some((r) => r.connector === 'webhook' && r.domain === 'evil.com' && r.effect === 'deny'));
    });

    it('tenant scope uses empty scopeRef', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/governance/policies',
            payload: { scope: 'tenant', connectors: [{ connector: 'github', readOnly: true }] },
        });
        assert.equal(res.statusCode, 201);
        assert.equal(res.json().policy.scopeRef, '');
    });

    it('publishing a new version archives the prior active for the same scope', async () => {
        const { app, store } = buildApp();
        const a = await app.inject({ method: 'POST', url: '/v1/governance/policies', payload: { scope: 'role', roleKey: 'developer', blockedActions: ['x'] } });
        const aId = a.json().policy.id;
        const b = await app.inject({ method: 'POST', url: '/v1/governance/policies', payload: { scope: 'role', roleKey: 'developer', blockedActions: ['y'] } });
        assert.equal(b.json().policy.version, 2);
        assert.equal(store._policies.get(aId)?.status, 'archived');
    });
});

describe('GET /v1/governance/policies — load active for a scope', () => {
    it('returns the active policy for a role scope, or null', async () => {
        const { app } = buildApp();
        const none = await app.inject({ method: 'GET', url: '/v1/governance/policies?scope=role&roleKey=developer' });
        assert.equal(none.json().policy, null);
        await app.inject({ method: 'POST', url: '/v1/governance/policies', payload: { scope: 'role', roleKey: 'developer', blockedActions: ['x'] } });
        const got = await app.inject({ method: 'GET', url: '/v1/governance/policies?scope=role&roleKey=developer' });
        assert.equal(got.json().policy.scopeRef, 'developer');
    });
});

describe('DELETE /v1/governance/policies/:id — archive', () => {
    it('404 unknown; 403 other tenant; archives own', async () => {
        const { app, store } = buildApp();
        assert.equal((await app.inject({ method: 'DELETE', url: '/v1/governance/policies/nope' })).statusCode, 404);
        store._policies.set('foreign', { id: 'foreign', tenantId: 'other', scope: 'role', scopeRef: 'developer', status: 'active', version: 1 });
        assert.equal((await app.inject({ method: 'DELETE', url: '/v1/governance/policies/foreign' })).statusCode, 403);
        const created = await app.inject({ method: 'POST', url: '/v1/governance/policies', payload: { scope: 'role', roleKey: 'developer', blockedActions: ['x'] } });
        const id = created.json().policy.id;
        assert.equal((await app.inject({ method: 'DELETE', url: `/v1/governance/policies/${id}` })).statusCode, 200);
        assert.equal(store._policies.get(id)?.status, 'archived');
    });
});
