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
function fakePrisma(byScope: Record<string, unknown[]>): any {
    return {
        governancePolicy: {
            findFirst: async ({ where }: { where: any }) => {
                const key = `${where.scope}:${where.scopeRef}`;
                const rules = byScope[key];
                if (!rules) return null;
                return {
                    id: `pol_${key}`,
                    tenantId: where.tenantId,
                    scope: where.scope,
                    scopeRef: where.scopeRef,
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
    const prisma: any = { governancePolicy: { findFirst: async () => { throw new Error('db down'); } } };
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
