import test from 'node:test';
import assert from 'node:assert/strict';
import { getActivePoliciesForScopes } from './policy-store.js';

function fakePrisma(rows: any[]) {
    return {
        governancePolicy: {
            findMany: async ({ where }: any) => {
                // emulate: tenantId + status + OR[{scope,scopeRef}]
                return rows.filter(
                    (r) =>
                        r.tenantId === where.tenantId &&
                        r.status === where.status &&
                        where.OR.some((o: any) => o.scope === r.scope && o.scopeRef === r.scopeRef),
                ).sort((a, b) => b.version - a.version);
            },
        },
    } as any;
}

const row = (scope: string, scopeRef: string, version: number) => ({
    id: `${scope}:${scopeRef}:${version}`, tenantId: 't1', scope, scopeRef, version, status: 'active',
    name: 'p', description: null, rulesJson: [], createdBy: 'u', updatedBy: 'u', createdAt: new Date(), updatedAt: new Date(),
});

test('loads only the tenant default when no refs given', async () => {
    const p = fakePrisma([row('tenant', '', 1), row('role', 'developer', 1)]);
    const res = await getActivePoliciesForScopes(p, 't1', {});
    assert.deepEqual(res.map((r) => r.scope), ['tenant']);
});

test('loads tenant + workspace + role + agent, ordered broadest-first', async () => {
    const p = fakePrisma([
        row('tenant', '', 1),
        row('workspace', 'ws1', 1),
        row('role', 'developer', 1),
        row('agent', 'bot1', 1),
        row('role', 'tester', 1), // non-matching role
        row('workspace', 'ws2', 1), // non-matching workspace
    ]);
    const res = await getActivePoliciesForScopes(p, 't1', { workspaceId: 'ws1', roleKey: 'developer', agentId: 'bot1' });
    assert.deepEqual(res.map((r) => r.scope), ['tenant', 'workspace', 'role', 'agent']);
});

test('keeps only the highest version per scope', async () => {
    const p = fakePrisma([row('tenant', '', 1), row('tenant', '', 3), row('tenant', '', 2)]);
    const res = await getActivePoliciesForScopes(p, 't1', {});
    assert.equal(res.length, 1);
    assert.equal(res[0].version, 3);
});

test('tenant isolation — other tenant rows excluded', async () => {
    const p = fakePrisma([row('tenant', '', 1), { ...row('tenant', '', 9), tenantId: 'other' }]);
    const res = await getActivePoliciesForScopes(p, 't1', {});
    assert.equal(res.length, 1);
    assert.equal(res[0].version, 1);
});
