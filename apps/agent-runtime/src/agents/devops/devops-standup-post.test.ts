import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDevopsAction } from './devops-action-handler.js';

const baseParams = {
    tenantId: 't1', botId: 'bot1', taskId: 'task1', workspaceDir: '/ws',
    executeAction: async () => ({ ok: true, output: '' }),
};

test('standup_report drafts by default (no post)', async () => {
    let called = false;
    const result = await handleDevopsAction({
        ...baseParams,
        actionType: 'workspace_devops_standup_report',
        executeAction: async () => { called = true; return { ok: true, output: '' }; },
        payload: { recent_deployments: ['api v1.2 → prod'], incidents: [] },
    });
    assert.equal(result.ok, true);
    const parsed = JSON.parse(result.output) as Record<string, unknown>;
    assert.equal(parsed['posted'], undefined);
    assert.ok(typeof parsed['spoken_text'] === 'string');
    assert.equal(called, false);
});

test('standup_report posts to the channel on post=true', async () => {
    const calls: Array<{ action: string; channel: unknown }> = [];
    const result = await handleDevopsAction({
        ...baseParams,
        actionType: 'workspace_devops_standup_report',
        executeAction: async (action: string, payload: Record<string, unknown>) => { calls.push({ action, channel: payload['channel'] }); return { ok: true, output: '' }; },
        payload: { recent_deployments: ['api v1.2 → prod'], post: true, channel: '#ops' },
    });
    const parsed = JSON.parse(result.output) as Record<string, unknown>;
    assert.deepEqual(parsed['posted'], { posted: true, channel: '#ops' });
    assert.deepEqual(calls, [{ action: 'workspace_slack_notify', channel: '#ops' }]);
});

test('standup_report reports missing channel', async () => {
    const result = await handleDevopsAction({
        ...baseParams,
        actionType: 'workspace_devops_standup_report',
        payload: { recent_deployments: [], post: true },
    });
    const parsed = JSON.parse(result.output) as Record<string, unknown>;
    assert.equal((parsed['posted'] as Record<string, unknown>)['posted'], false);
});
