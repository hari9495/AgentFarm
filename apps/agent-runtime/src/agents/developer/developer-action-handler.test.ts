import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { handleDeveloperAction, type DeveloperActionParams } from './developer-action-handler.js';

type SubResult = { ok: boolean; output: string; errorOutput?: string };

function baseParams(over: Partial<DeveloperActionParams> = {}): DeveloperActionParams {
    return {
        actionType: 'workspace_dev_standup_report',
        tenantId: 't-1',
        botId: 'b-1',
        taskId: 'task-1',
        payload: {},
        workspaceDir: 'task-1',
        executeAction: async () => ({ ok: true, output: '{}' }) as SubResult,
        ...over,
    };
}

describe('workspace_dev_standup_report — post to channel', () => {
    const MEMORY = { recent_memory: ['Merged PR #12 (auth fix)', 'Reviewing #14'], bot_name: 'Dev', team_name: 'Platform' };

    it('returns the summary as a draft by default (no post)', async () => {
        let called = false;
        const result = await handleDeveloperAction(baseParams({
            executeAction: async () => { called = true; return { ok: true, output: '{}' }; },
            payload: { ...MEMORY },
        }));
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['posted'], undefined);
        assert.equal(typeof parsed['summary'], 'object');
        assert.equal(called, false);
    });

    it('posts the standup to Slack when post=true with a channel', async () => {
        const calls: Array<{ action: string; payload: Record<string, unknown> }> = [];
        const result = await handleDeveloperAction(baseParams({
            executeAction: async (action, payload) => { calls.push({ action, payload }); return { ok: true, output: '{"sent":true}' }; },
            payload: { ...MEMORY, post: true, channel: '#standup' },
        }));
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['posted'], true);
        assert.equal(parsed['channel'], '#standup');
        assert.equal(calls.length, 1);
        assert.equal(calls[0]!.action, 'workspace_slack_notify');
        assert.equal(calls[0]!.payload['channel'], '#standup');
        assert.ok(typeof calls[0]!.payload['message'] === 'string');
    });

    it('returns the summary with a reason when post=true but no channel', async () => {
        const result = await handleDeveloperAction(baseParams({
            payload: { ...MEMORY, post: true },
        }));
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['posted'], false);
        assert.ok(String(parsed['reason']).includes('channel'));
    });

    it('fails safe to the summary when the post fails', async () => {
        const result = await handleDeveloperAction(baseParams({
            executeAction: async () => ({ ok: false, output: '', errorOutput: 'slack connector not configured' }),
            payload: { ...MEMORY, post: true, channel: '#standup' },
        }));
        assert.equal(result.ok, true, 'post failure must not lose the summary');
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['posted'], false);
        assert.ok(String(parsed['reason']).includes('slack connector'));
        assert.equal(typeof parsed['summary'], 'object');
    });
});
