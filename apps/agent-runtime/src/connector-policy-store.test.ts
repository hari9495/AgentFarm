import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getActiveConnectorPolicy,
    isConnectorActionDenied,
    type ConnectorPolicy,
} from './connector-policy-store.js';

/**
 * Fake prisma whose governancePolicy.findFirst returns a row keyed by the
 * (scope, scopeRef) in the where clause — lets us model a tenant policy and a
 * role policy independently.
 */
// getActivePoliciesForScopes (policy-engine) queries with findMany + an OR of
// {scope, scopeRef} selectors, so the fake models that. Keyed by "scope:scopeRef".
function fakePrisma(byScope: Record<string, unknown[]>): any {
    const rowFor = (scope: string, scopeRef: string, tenantId: string, rules: unknown[]) => {
        const key = `${scope}:${scopeRef}`;
        return {
            id: `pol_${key}`,
            tenantId,
            scope,
            scopeRef,
            version: 1,
            status: 'active',
            name: key,
            description: null,
            rulesJson: rules,
            createdBy: 'u',
            updatedBy: 'u',
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    };
    return {
        governancePolicy: {
            findMany: async ({ where }: { where: any }) => {
                const selectors = Array.isArray(where.OR)
                    ? where.OR
                    : [{ scope: where.scope, scopeRef: where.scopeRef }];
                const rows: unknown[] = [];
                for (const sel of selectors) {
                    const rules = byScope[`${sel.scope}:${sel.scopeRef}`];
                    if (rules) rows.push(rowFor(sel.scope, sel.scopeRef, where.tenantId, rules));
                }
                return rows;
            },
        },
    };
}

test('B1: merges deny verbs for a connector across tenant + role scope', async () => {
    const prisma = fakePrisma({
        'tenant:': [{ connector: 'jira', actionType: 'merge_pr', effect: 'deny' }],
        'role:developer': [{ connector: 'jira', actionType: 'create_pr', effect: 'deny' }],
    });
    const policy = await getActiveConnectorPolicy(prisma, 'tenant-x', 'developer');
    const jira = policy.perConnector.get('jira')!;
    assert.ok(jira.deniedVerbs.has('merge_pr'));
    assert.ok(jira.deniedVerbs.has('create_pr'));
});

test('B2: readOnly is true if EITHER scope sets mode read_only', async () => {
    const prisma = fakePrisma({
        'role:developer': [{ connector: 'salesforce', effect: 'deny', mode: 'read_only' }],
    });
    const policy = await getActiveConnectorPolicy(prisma, 'tenant-x', 'developer');
    assert.equal(policy.perConnector.get('salesforce')!.readOnly, true);
});

test('B3: deniedTools unions MCP tool rules across both scopes', async () => {
    const prisma = fakePrisma({
        'tenant:': [{ actionType: '*', effect: 'deny', tool: 'jira.delete' }],
        'role:developer': [{ actionType: '*', effect: 'deny', tool: 'github.force_push' }],
    });
    const policy = await getActiveConnectorPolicy(prisma, 'tenant-x', 'developer');
    assert.ok(policy.deniedTools.has('jira.delete'));
    assert.ok(policy.deniedTools.has('github.force_push'));
});

test('B4: no active policy → empty policy (fail-safe)', async () => {
    const prisma = fakePrisma({});
    const policy = await getActiveConnectorPolicy(prisma, 'tenant-x', 'developer');
    assert.equal(policy.perConnector.size, 0);
    assert.equal(policy.deniedTools.size, 0);
});

test('B4b: prisma error → empty policy (never weakens)', async () => {
    const prisma: any = { governancePolicy: { findMany: async () => { throw new Error('db down'); } } };
    const policy = await getActiveConnectorPolicy(prisma, 'tenant-x', 'developer');
    assert.equal(policy.perConnector.size, 0);
});

test('B5: isConnectorActionDenied — explicit verb, read-only write, read-only read', () => {
    const policy: ConnectorPolicy = {
        perConnector: new Map([
            ['jira', { deniedVerbs: new Set(['merge_pr']), readOnly: false }],
            ['salesforce', { deniedVerbs: new Set(), readOnly: true }],
        ]),
        deniedTools: new Set(),
    };
    // explicit verb deny
    assert.equal(isConnectorActionDenied(policy, 'jira', 'merge_pr'), true);
    assert.equal(isConnectorActionDenied(policy, 'jira', 'list_prs'), false);
    // read-only blocks a write, allows a read
    assert.equal(isConnectorActionDenied(policy, 'salesforce', 'send_email'), true);
    assert.equal(isConnectorActionDenied(policy, 'salesforce', 'read_task'), false);
    // connector with no policy → not denied
    assert.equal(isConnectorActionDenied(policy, 'github', 'merge_pr'), false);
});
