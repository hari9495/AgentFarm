import test from 'node:test';
import assert from 'node:assert/strict';

import type { RoleKey } from '@agentfarm/shared-types';
import { ROLE_PROFILES } from './role-profiles/index.js';
import {
    BLOCKED_ACTIONS_BY_ROLE,
    getBlockedActionsForRole,
} from './role-action-registry.js';
import { RECRUITER_ROLE_BLOCKED_ACTIONS } from './agents/recruiter/recruiter-agent-profile.js';
import { TESTER_ROLE_BLOCKED_ACTIONS } from './agents/tester/tester-agent-profile.js';
import { TECHNICAL_WRITER_ROLE_BLOCKED_ACTIONS } from './agents/technical-writer/technical-writer-agent-profile.js';
import { CONTENT_WRITER_ROLE_BLOCKED_ACTIONS } from './agents/content-writer/content-writer-agent-profile.js';
import { DEVELOPER_BLOCKED_ACTIONS } from './agents/developer/developer-role-profile.js';

test('A1: every RoleKey has a blocked-action set in the registry', () => {
    for (const roleKey of Object.keys(ROLE_PROFILES) as RoleKey[]) {
        const set = getBlockedActionsForRole(roleKey);
        assert.ok(set instanceof Set, `expected a Set for role ${roleKey}`);
        assert.ok(
            BLOCKED_ACTIONS_BY_ROLE[roleKey] instanceof Set,
            `expected BLOCKED_ACTIONS_BY_ROLE entry for ${roleKey}`,
        );
    }
});

test('A1: previously-unwired role (recruiter) returns its curated blocklist contents', () => {
    const set = getBlockedActionsForRole('recruiter');
    for (const action of RECRUITER_ROLE_BLOCKED_ACTIONS) {
        assert.ok(set.has(action), `recruiter blocklist should contain "${action}"`);
    }
});

test('A1: unknown role resolves to an empty set (no throw)', () => {
    const set = getBlockedActionsForRole('not_a_real_role' as RoleKey);
    assert.equal(set.size, 0);
});

test('A2: developer aggregated set is a superset of legacy DEVELOPER_BLOCKED_ACTIONS', () => {
    const set = getBlockedActionsForRole('developer');
    for (const action of DEVELOPER_BLOCKED_ACTIONS) {
        assert.ok(set.has(action), `developer set should retain legacy block "${action}"`);
    }
});

test('A2: consolidated roles keep their wired *_ROLE_BLOCKED_ACTIONS (no regression)', () => {
    const cases: Array<[RoleKey, ReadonlyArray<string>]> = [
        ['tester', TESTER_ROLE_BLOCKED_ACTIONS],
        ['technical_writer', TECHNICAL_WRITER_ROLE_BLOCKED_ACTIONS],
        ['content_writer', CONTENT_WRITER_ROLE_BLOCKED_ACTIONS],
    ];
    for (const [roleKey, expected] of cases) {
        const set = getBlockedActionsForRole(roleKey);
        for (const action of expected) {
            assert.ok(set.has(action), `${roleKey} set should contain wired block "${action}"`);
        }
    }
});

test('A2: no role blocks one of its own allowed actions (self-block sanity)', () => {
    for (const roleKey of Object.keys(ROLE_PROFILES) as RoleKey[]) {
        const blocked = getBlockedActionsForRole(roleKey);
        for (const allowed of ROLE_PROFILES[roleKey].allowedActions) {
            assert.ok(
                !blocked.has(allowed),
                `${roleKey} must not block its own allowed action "${allowed}"`,
            );
        }
    }
});
