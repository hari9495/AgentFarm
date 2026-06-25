import test from 'node:test';
import assert from 'node:assert/strict';

import type { GovernanceRule } from '@agentfarm/shared-types';
import { isEnvDenied, isActionTimeDenied, getActiveGovernanceRules } from './action-governance.js';

const rule = (r: Partial<GovernanceRule>): GovernanceRule => ({ actionType: '*', effect: 'deny', ...r });

test('B1: isEnvDenied matches a deny rule whose env equals the task env', () => {
    const rules = [rule({ env: 'production' })];
    assert.ok(isEnvDenied(rules, { actionType: 'deploy', env: 'production' }));
    assert.equal(isEnvDenied(rules, { actionType: 'deploy', env: 'staging' }), null);
    assert.equal(isEnvDenied(rules, { actionType: 'deploy', env: '' }), null);
    // a rule without env is never an env-deny
    assert.equal(isEnvDenied([rule({ actionType: 'deploy' })], { actionType: 'deploy', env: 'production' }), null);
});

test('B2: env rule action/connector scoping', () => {
    const scoped = [rule({ actionType: 'deploy_production', env: 'production' })];
    assert.ok(isEnvDenied(scoped, { actionType: 'deploy_production', env: 'production' }));
    assert.equal(isEnvDenied(scoped, { actionType: 'something_else', env: 'production' }), null);

    const conn = [rule({ actionType: '*', connector: 'jira', env: 'production' })];
    assert.ok(isEnvDenied(conn, { actionType: 'merge_pr', connector: 'jira', env: 'production' }));
    assert.equal(isEnvDenied(conn, { actionType: 'merge_pr', connector: 'github', env: 'production' }), null);
});

test('B4: isActionTimeDenied — outside window for a matching action', () => {
    const outside = new Date('2026-06-26T20:00:00Z');
    const rules = [rule({ timeWindow: { start: '09:00', end: '17:00', tz: 'UTC' } })];
    assert.ok(isActionTimeDenied(rules, { actionType: 'deploy', now: outside }));
    const inside = new Date('2026-06-26T13:00:00Z');
    assert.equal(isActionTimeDenied(rules, { actionType: 'deploy', now: inside }), null);
    // scoping: time rule scoped to another action does not match
    const scoped = [rule({ actionType: 'deploy_production', timeWindow: { start: '09:00', end: '17:00', tz: 'UTC' } })];
    assert.equal(isActionTimeDenied(scoped, { actionType: 'other', now: outside }), null);
});

function fakePrisma(byScope: Record<string, unknown[]>): any {
    return {
        governancePolicy: {
            findFirst: async ({ where }: { where: any }) => {
                const rules = byScope[`${where.scope}:${where.scopeRef}`];
                if (!rules) return null;
                return { id: 'p', tenantId: where.tenantId, scope: where.scope, scopeRef: where.scopeRef, version: 1, status: 'active', name: 'n', description: null, rulesJson: rules, createdBy: 'u', updatedBy: 'u', createdAt: new Date(), updatedAt: new Date() };
            },
        },
    };
}

test('B3: getActiveGovernanceRules merges tenant + role active rules', async () => {
    const prisma = fakePrisma({
        'tenant:': [{ actionType: '*', effect: 'deny', env: 'production' }],
        'role:developer': [{ actionType: 'deploy', effect: 'deny', timeWindow: { start: '09:00', end: '17:00' } }],
    });
    const rules = await getActiveGovernanceRules(prisma, 'tenant-x', 'developer');
    assert.equal(rules.length, 2);
});

test('B3b: DB error → empty rules (fail-safe)', async () => {
    const prisma: any = { governancePolicy: { findFirst: async () => { throw new Error('db'); } } };
    const rules = await getActiveGovernanceRules(prisma, 'tenant-x', 'developer');
    assert.deepEqual(rules, []);
});
