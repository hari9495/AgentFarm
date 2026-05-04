import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import test from 'node:test';
import {
    getSkillEntitlements,
    listSkillEntitlements,
    upsertSkillEntitlements,
} from './marketplace-entitlements';

const withTempStateDir = async (run: () => Promise<void> | void) => {
    const previous = process.env.AF_DASHBOARD_STATE_DIR;
    const sandbox = mkdtempSync(join(tmpdir(), 'agentfarm-dashboard-test-'));
    process.env.AF_DASHBOARD_STATE_DIR = sandbox;

    try {
        await run();
    } finally {
        if (previous === undefined) {
            delete process.env.AF_DASHBOARD_STATE_DIR;
        } else {
            process.env.AF_DASHBOARD_STATE_DIR = previous;
        }
        rmSync(sandbox, { recursive: true, force: true });
    }
};

test('getSkillEntitlements returns empty defaults when record is absent', async () => {
    await withTempStateDir(() => {
        const entitlement = getSkillEntitlements('ws_1', 'bot_1');
        assert.equal(entitlement.workspace_id, 'ws_1');
        assert.equal(entitlement.bot_id, 'bot_1');
        assert.deepEqual(entitlement.skill_ids, []);
    });
});

test('upsertSkillEntitlements stores normalized and unique skill ids', async () => {
    await withTempStateDir(() => {
        const saved = upsertSkillEntitlements('ws_1', 'bot_1', ['skill-b', 'skill-a', ' skill-a ']);

        assert.equal(saved.workspace_id, 'ws_1');
        assert.equal(saved.bot_id, 'bot_1');
        assert.deepEqual(saved.skill_ids, ['skill-a', 'skill-b']);

        const listed = listSkillEntitlements();
        assert.equal(listed.length, 1);
        assert.deepEqual(listed[0]?.skill_ids, ['skill-a', 'skill-b']);
    });
});
