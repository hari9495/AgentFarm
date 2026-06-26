import test from 'node:test';
import assert from 'node:assert/strict';
import type { RoleKey } from '@agentfarm/shared-types';
import { BASELINE_BLOCKED_ACTIONS_BY_ROLE } from '@agentfarm/shared-types';
import { BLOCKED_ACTIONS_BY_ROLE, getBlockedActionsForRole } from './role-action-registry.js';

/**
 * Drift guard: the shared-types baseline snapshot (used by the dashboard to show
 * built-in role blocks read-only) MUST match the live role-action-registry. If a
 * role's hard-block set changes, this test fails until the snapshot is updated.
 */
test('shared baseline snapshot matches the live role-action registry for every role', () => {
    const registryRoles = Object.keys(BLOCKED_ACTIONS_BY_ROLE) as RoleKey[];
    const snapshotRoles = Object.keys(BASELINE_BLOCKED_ACTIONS_BY_ROLE);

    // same set of roles
    assert.deepEqual(
        snapshotRoles.sort(),
        [...registryRoles].sort(),
        'baseline snapshot roles differ from the registry roles',
    );

    for (const role of registryRoles) {
        const live = [...getBlockedActionsForRole(role)].sort();
        const snap = [...(BASELINE_BLOCKED_ACTIONS_BY_ROLE[role] ?? [])].sort();
        assert.deepEqual(
            snap,
            live,
            `baseline snapshot for '${role}' is stale — regenerate role-baseline-blocks.ts`,
        );
    }
});
