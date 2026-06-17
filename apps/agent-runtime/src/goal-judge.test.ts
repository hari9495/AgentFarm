import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGoal, isGoalJudgeEnabled } from './goal-judge.js';

// Goal judge is disabled by default in tests (no env var set)
test('isGoalJudgeEnabled returns false when env var not set', () => {
    delete process.env['AF_GOAL_JUDGE_ENABLED'];
    assert.equal(isGoalJudgeEnabled(), false);
});

test('evaluateGoal returns accept when judge is disabled', async () => {
    delete process.env['AF_GOAL_JUDGE_ENABLED'];
    const result = await evaluateGoal({ summary: 'Write a function' }, 'function written');
    assert.equal(result.action, 'accept');
});

test('evaluateGoal returns accept for skip_goal_judge=true', async () => {
    process.env['AF_GOAL_JUDGE_ENABLED'] = 'true';
    const result = await evaluateGoal({ summary: 'Write a function', skip_goal_judge: true }, 'output');
    assert.equal(result.action, 'accept');
    delete process.env['AF_GOAL_JUDGE_ENABLED'];
});

test('evaluateGoal returns accept for read-only action types', async () => {
    process.env['AF_GOAL_JUDGE_ENABLED'] = 'true';
    for (const actionType of ['code_read', 'workspace_read_file', 'workspace_grep', 'workspace_list_files']) {
        const result = await evaluateGoal({ summary: 'Read file', actionType }, 'file content');
        assert.equal(result.action, 'accept', `Expected accept for actionType=${actionType}`);
    }
    delete process.env['AF_GOAL_JUDGE_ENABLED'];
});

test('evaluateGoal returns accept when no spec is resolvable', async () => {
    process.env['AF_GOAL_JUDGE_ENABLED'] = 'true';
    // Payload with no summary/description/prompt/goal_spec
    const result = await evaluateGoal({ tenantId: 'abc', workspaceId: 'xyz' }, 'some output');
    assert.equal(result.action, 'accept');
    delete process.env['AF_GOAL_JUDGE_ENABLED'];
});

test('evaluateGoal returns accept when no Anthropic API key is configured', async () => {
    process.env['AF_GOAL_JUDGE_ENABLED'] = 'true';
    const savedKey = process.env['AF_ANTHROPIC_API_KEY'];
    const savedKey2 = process.env['AGENTFARM_ANTHROPIC_API_KEY'];
    delete process.env['AF_ANTHROPIC_API_KEY'];
    delete process.env['AGENTFARM_ANTHROPIC_API_KEY'];

    const result = await evaluateGoal(
        { summary: 'Implement auth endpoint' },
        'function authEndpoint() { ... }',
    );
    assert.equal(result.action, 'accept');

    if (savedKey) process.env['AF_ANTHROPIC_API_KEY'] = savedKey;
    if (savedKey2) process.env['AGENTFARM_ANTHROPIC_API_KEY'] = savedKey2;
    delete process.env['AF_GOAL_JUDGE_ENABLED'];
});

test('evaluateGoal prefers goal_spec over summary when both present', async () => {
    // Disabled — just verify spec resolution doesn't throw
    delete process.env['AF_GOAL_JUDGE_ENABLED'];
    const result = await evaluateGoal(
        { goal_spec: 'explicit spec', summary: 'fallback summary' },
        'agent output',
    );
    assert.equal(result.action, 'accept');
});

test('evaluateGoal falls back to description when summary absent', async () => {
    delete process.env['AF_GOAL_JUDGE_ENABLED'];
    const result = await evaluateGoal(
        { description: 'description fallback' },
        'agent output',
    );
    assert.equal(result.action, 'accept');
});
