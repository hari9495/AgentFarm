import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGoal } from '../natural-language-parser.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const firstActionName = (input: string): string =>
    parseGoal(input).actions[0]?.name ?? '';

// ── Status and shape ──────────────────────────────────────────────────────────

test('parseGoal returns a GoalPlan with status pending', () => {
    const plan = parseGoal('fix the login bug');
    assert.equal(plan.status, 'pending');
});

test('returned GoalPlan always has actions array with at least 1 item', () => {
    const inputs = [
        'fix the login bug',
        'write tests for auth module',
        'deploy to production',
        'notify team on slack',
        '',
        'the weather is nice',
    ];
    for (const input of inputs) {
        const plan = parseGoal(input);
        assert.ok(Array.isArray(plan.actions), `actions should be an array for "${input}"`);
        assert.ok(plan.actions.length >= 1, `actions should have at least 1 item for "${input}"`);
    }
});

test('worldState targetState.desired always starts with "Complete:"', () => {
    const inputs = [
        'fix the login bug',
        'write tests for auth module',
        'deploy to production',
        '',
        'random unrelated text',
    ];
    for (const input of inputs) {
        const plan = parseGoal(input);
        const desired = plan.targetState['desired'];
        assert.ok(
            typeof desired === 'string' && desired.startsWith('Complete:'),
            `targetState.desired should start with "Complete:" for "${input}", got: ${String(desired)}`,
        );
    }
});

test('GoalPlan has required contractVersion and non-empty id', () => {
    const plan = parseGoal('deploy to production');
    assert.equal(plan.contractVersion, '1.0.0');
    assert.ok(typeof plan.id === 'string' && plan.id.length > 0, 'id should be non-empty');
});

// ── Keyword → action type mappings ───────────────────────────────────────────

test('"fix the login bug" maps to update_status (bug resolution)', () => {
    const name = firstActionName('fix the login bug');
    assert.equal(name, 'update_status');
});

test('"found a broken error in auth" maps to update_status (error/broken keywords)', () => {
    const name = firstActionName('found a broken error in auth');
    assert.equal(name, 'update_status');
});

test('"write tests for auth module" maps to read_task (test-related type)', () => {
    const name = firstActionName('write tests for auth module');
    assert.equal(name, 'read_task');
});

test('"add spec coverage for login" maps to read_task (spec keyword)', () => {
    const name = firstActionName('add spec coverage for login');
    assert.equal(name, 'read_task');
});

test('"deploy to production" maps to update_status (deploy-related type)', () => {
    const name = firstActionName('deploy to production');
    assert.equal(name, 'update_status');
});

test('"release v2 and ship it" maps to update_status (release keyword)', () => {
    const name = firstActionName('release v2 and ship it');
    assert.equal(name, 'update_status');
});

test('"notify team on slack" maps to send_message (slack/notify)', () => {
    const name = firstActionName('notify team on slack');
    assert.equal(name, 'send_message');
});

test('"send a message in chat" maps to send_message (message/chat)', () => {
    const name = firstActionName('send a message in chat');
    assert.equal(name, 'send_message');
});

test('"review the pull request" maps to create_pr_comment (PR/review)', () => {
    const name = firstActionName('review the pull request');
    assert.equal(name, 'create_pr_comment');
});

test('"create a pr comment" maps to create_pr_comment (pr keyword)', () => {
    const name = firstActionName('create a pr comment');
    assert.equal(name, 'create_pr_comment');
});

test('"update the jira ticket" maps to read_task (jira/ticket)', () => {
    const name = firstActionName('update the jira ticket');
    assert.equal(name, 'read_task');
});

test('"create github issue" maps to read_task (issue keyword)', () => {
    const name = firstActionName('create github issue');
    assert.equal(name, 'read_task');
});

test('"push a commit to github" maps to update_status (github/commit/push)', () => {
    const name = firstActionName('push a commit to github');
    assert.equal(name, 'update_status');
});

test('"add documentation to readme" maps to create_comment (document/docs/readme)', () => {
    const name = firstActionName('add documentation to readme');
    assert.equal(name, 'create_comment');
});

// ── Unknown / fallback ────────────────────────────────────────────────────────

test('empty string returns status pending with actionType unknown', () => {
    const plan = parseGoal('');
    assert.equal(plan.status, 'pending');
    assert.equal(plan.actions[0]?.name, 'unknown');
});

test('completely unrelated input "the weather is nice" returns unknown', () => {
    const name = firstActionName('the weather is nice');
    assert.equal(name, 'unknown');
});

test('input with no matching keywords returns unknown', () => {
    const name = firstActionName('water the plants tomorrow');
    assert.equal(name, 'unknown');
});

// ── GoalPlan field integrity ──────────────────────────────────────────────────

test('currentState.current equals the input', () => {
    const input = 'fix the login bug';
    const plan = parseGoal(input);
    assert.equal(plan.currentState['current'], input);
});

test('goalDescription equals the input', () => {
    const input = 'deploy to production';
    const plan = parseGoal(input);
    assert.equal(plan.goalDescription, input);
});

test('GoalPlan has GoalAction with cost=1 and non-empty id', () => {
    const plan = parseGoal('fix the login bug');
    const action = plan.actions[0]!;
    assert.equal(action.cost, 1);
    assert.ok(typeof action.id === 'string' && action.id.length > 0);
});

test('GoalAction effects contains completed=true', () => {
    const plan = parseGoal('notify team on slack');
    assert.equal(plan.actions[0]!.effects['completed'], true);
});
