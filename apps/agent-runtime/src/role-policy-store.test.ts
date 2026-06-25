import test from 'node:test';
import assert from 'node:assert/strict';

import { getActiveRoleBlocklist, getActiveRoleBlocklistForTenant } from './role-policy-store.js';

/** Minimal fake of the Prisma surface that getActivePolicy touches. */
function fakePrisma(findFirst: (args: unknown) => Promise<unknown>): any {
    return { governancePolicy: { findFirst } };
}

const rolePolicyRow = (rules: unknown[]) => ({
    id: 'pol_1',
    tenantId: 'tenant-x',
    scope: 'role',
    scopeRef: 'sales_rep',
    version: 3,
    status: 'active',
    name: 'sales role policy',
    description: null,
    rulesJson: rules,
    createdBy: 'u1',
    updatedBy: 'u1',
    createdAt: new Date(),
    updatedAt: new Date(),
});

test('B1: returns deny-rule action types as the blocklist set', async () => {
    const prisma = fakePrisma(async () =>
        rolePolicyRow([
            { actionType: 'send_contract', effect: 'deny' },
            { actionType: 'send_email', effect: 'deny' },
            { actionType: 'create_deal', effect: 'require_approval' }, // not a hard block
            { actionType: '*', effect: 'deny' }, // wildcard excluded from the action set
        ]),
    );
    const set = await getActiveRoleBlocklist(prisma, 'tenant-x', 'sales_rep');
    assert.ok(set.has('send_contract'));
    assert.ok(set.has('send_email'));
    assert.ok(!set.has('create_deal'), 'require_approval must not become a hard block');
    assert.ok(!set.has('*'), 'wildcard must not be added to the action set');
});

test('B1: no active role policy → empty set', async () => {
    const prisma = fakePrisma(async () => null);
    const set = await getActiveRoleBlocklist(prisma, 'tenant-x', 'sales_rep');
    assert.equal(set.size, 0);
});

test('B1: DB error → empty set (fail-safe, never weakens)', async () => {
    const prisma = fakePrisma(async () => {
        throw new Error('db down');
    });
    const set = await getActiveRoleBlocklist(prisma, 'tenant-x', 'sales_rep');
    assert.equal(set.size, 0);
});

test('B1: tenant convenience fn returns empty set when no DATABASE_URL (DB disabled)', async () => {
    const prev = process.env['DATABASE_URL'];
    delete process.env['DATABASE_URL'];
    try {
        const set = await getActiveRoleBlocklistForTenant('tenant-x', 'sales_rep');
        assert.equal(set.size, 0);
    } finally {
        if (prev !== undefined) process.env['DATABASE_URL'] = prev;
    }
});
