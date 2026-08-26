import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleFsdAction, type FsdActionParams } from './fsd-action-handler.js';

type SubResult = { ok: boolean; output: string; errorOutput?: string };

function params(over: Partial<FsdActionParams> = {}): FsdActionParams {
    return {
        actionType: 'workspace_fsd_standup_report',
        tenantId: 't1', botId: 'b1', taskId: 'task-1',
        workspaceDir: '/tmp',
        payload: { recent_memory: ['Shipped the checkout UI', 'Fixed LCP regression'], bot_name: 'FSD', team_name: 'Web' },
        executeAction: async () => ({ ok: true, output: '{}' }) as SubResult,
        ...over,
    };
}

describe('workspace_fsd_standup_report — post to channel', () => {
    it('returns the report as a draft by default (no post)', async () => {
        const actions: string[] = [];
        const result = await handleFsdAction(params({
            executeAction: async (a) => { actions.push(a); return { ok: true, output: '{}' }; },
        }));
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['posted'], undefined);
        assert.ok(typeof parsed['spoken_text'] === 'string');
        assert.ok(!actions.includes('workspace_slack_notify'), 'must not post without post=true');
    });

    it('posts the standup to Slack when post=true with a channel', async () => {
        const calls: Array<{ action: string; payload: Record<string, unknown> }> = [];
        const result = await handleFsdAction(params({
            executeAction: async (action, payload) => { calls.push({ action, payload }); return { ok: true, output: '{"sent":true}' }; },
            payload: { recent_memory: ['Shipped checkout UI'], bot_name: 'FSD', team_name: 'Web', post: true, channel: '#web-standup' },
        }));
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['posted'], true);
        assert.equal(parsed['channel'], '#web-standup');
        const slack = calls.find((c) => c.action === 'workspace_slack_notify');
        assert.ok(slack, 'a slack_notify call was made');
        assert.equal(slack!.payload['channel'], '#web-standup');
        assert.ok(typeof slack!.payload['message'] === 'string' && (slack!.payload['message'] as string).length > 0);
    });

    it('returns the report with a reason when post=true but no channel', async () => {
        const result = await handleFsdAction(params({
            payload: { recent_memory: ['x'], post: true },
        }));
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['posted'], false);
        assert.ok(String(parsed['reason']).includes('channel'));
    });

    it('fails safe to the report when the post fails', async () => {
        const result = await handleFsdAction(params({
            executeAction: async () => ({ ok: false, output: '', errorOutput: 'slack connector not configured' }),
            payload: { recent_memory: ['x'], post: true, channel: '#web-standup' },
        }));
        assert.equal(result.ok, true, 'post failure must not lose the report');
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['posted'], false);
        assert.ok(typeof parsed['spoken_text'] === 'string');
    });
});
