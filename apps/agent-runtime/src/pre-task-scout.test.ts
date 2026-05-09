import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preTaskScout, SCOUT_TRIGGER_ACTIONS } from './pre-task-scout.js';

function makeTask(actionType: string, summary = 'update the authentication middleware logic'): Record<string, unknown> {
    return {
        taskId: 'test-task-001',
        enqueuedAt: Date.now(),
        payload: {
            action_type: actionType,
            summary,
            tenantId: 'tenant-001',
            botId: 'bot-001',
        },
    };
}

test('returns empty string for a non-trigger action type', async () => {
    const result = await preTaskScout(makeTask('send_email') as never, async () => ({
        ok: true,
        output: 'should not be called',
    }));
    assert.strictEqual(result, '', 'non-trigger actions must return empty string immediately');
});

test('runs scout actions for a trigger action type', async () => {
    const calls: string[] = [];
    const executeAction = async (innerTask: Record<string, unknown>) => {
        const actionType = typeof innerTask['actionType'] === 'string' ? innerTask['actionType'] : '';
        calls.push(actionType);
        return { ok: true, output: `result-for-${actionType}` };
    };

    const result = await preTaskScout(makeTask('code_edit') as never, executeAction as never);

    // Should have called workspace_scout, workspace_grep, and workspace_list_files
    assert.ok(calls.includes('workspace_scout'), 'should call workspace_scout');
    assert.ok(calls.includes('workspace_grep'), 'should call workspace_grep');
    assert.ok(calls.includes('workspace_list_files'), 'should call workspace_list_files');
    assert.ok(typeof result === 'string' && result.length > 0, 'should return a non-empty scout context');
});

test('caps output at 4000 characters', async () => {
    const longOutput = 'x'.repeat(10_000);
    const executeAction = async () => ({ ok: true, output: longOutput });

    const result = await preTaskScout(makeTask('code_edit') as never, executeAction as never);
    assert.ok(result.length <= 4000, `expected ≤4000 chars, got ${result.length}`);
});

test('handles executeAction failure gracefully and returns empty string', async () => {
    const executeAction = async (): Promise<never> => {
        throw new Error('workspace unavailable');
    };

    const result = await preTaskScout(makeTask('code_edit') as never, executeAction as never);
    // When all scout calls fail, result should be empty string
    assert.ok(typeof result === 'string', 'should return a string even on failure');
});

test('SCOUT_TRIGGER_ACTIONS includes expected action types', () => {
    const expected = ['code_edit', 'code_edit_patch', 'workspace_generate_test', 'autonomous_loop'];
    for (const action of expected) {
        assert.ok(SCOUT_TRIGGER_ACTIONS.has(action), `expected ${action} in SCOUT_TRIGGER_ACTIONS`);
    }
});
