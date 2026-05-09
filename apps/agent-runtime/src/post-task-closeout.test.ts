import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    postTaskCloseOut,
    buildCloseOutComment,
    buildCloseOutSummary,
    buildPRDescription,
} from './post-task-closeout.js';

function makeTask(overrides: Record<string, unknown> = {}) {
    return {
        taskId: 'test-task-002',
        payload: {
            action_type: 'code_edit',
            summary: 'Refactor authentication middleware',
            ...overrides,
        } as Record<string, unknown>,
    };
}

function makeResult(overrides: Record<string, unknown> = {}) {
    return { status: 'success', attempts: 1, ...overrides };
}

// --- buildCloseOutComment ---

test('buildCloseOutComment includes task id and summary', () => {
    const comment = buildCloseOutComment(makeTask(), makeResult());
    assert.ok(comment.includes('test-task-002'), 'should include task id');
    assert.ok(comment.includes('Refactor authentication middleware'), 'should include summary');
    assert.ok(comment.includes('completed successfully'), 'should state outcome');
});

test('buildCloseOutComment reflects failure status', () => {
    const comment = buildCloseOutComment(makeTask(), makeResult({ status: 'failed', errorMessage: 'compile error' }));
    assert.ok(comment.includes('failed'), 'should include failed outcome');
    assert.ok(comment.includes('compile error'), 'should include error message');
});

// --- buildCloseOutSummary ---

test('buildCloseOutSummary returns a non-empty string', () => {
    const summary = buildCloseOutSummary(makeTask(), makeResult());
    assert.ok(typeof summary === 'string' && summary.length > 0);
    assert.ok(summary.includes('test-task-002'));
});

// --- buildPRDescription ---

test('buildPRDescription returns a formatted markdown string', () => {
    const desc = buildPRDescription(makeTask(), makeResult());
    assert.ok(desc.includes('## Summary'), 'should include Summary section');
    assert.ok(desc.includes('## Motivation'), 'should include Motivation section');
    assert.ok(desc.includes('## Changes'), 'should include Changes section');
    assert.ok(desc.includes('## Test Evidence'), 'should include Test Evidence section');
    assert.ok(desc.includes('test-task-002'), 'should reference task id');
});

test('buildPRDescription includes Jira key when present', () => {
    const desc = buildPRDescription(makeTask({ jira_issue_key: 'PROJ-123' }), makeResult());
    assert.ok(desc.includes('PROJ-123'), 'should include Jira key');
    assert.ok(desc.includes('Fixes: PROJ-123'), 'should use Fixes: reference format');
});

// --- postTaskCloseOut (integration: all integrations skip when not configured) ---

test('postTaskCloseOut skips Jira when no jira_issue_key is present', async () => {
    // No env vars set, no jira_issue_key — must resolve without throwing
    await assert.doesNotReject(
        () => postTaskCloseOut(makeTask(), makeResult()),
        'should not reject when Jira key is absent',
    );
});

test('postTaskCloseOut skips Slack when notify_on_complete is not true', async () => {
    await assert.doesNotReject(
        () => postTaskCloseOut(makeTask({ notify_on_complete: false }), makeResult()),
        'should not reject when notify_on_complete is false',
    );
});

test('postTaskCloseOut skips GitHub PR update when no pr_url or pr_number', async () => {
    await assert.doesNotReject(
        () => postTaskCloseOut(makeTask(), makeResult({ pr_url: undefined, pr_number: undefined })),
        'should not reject when pr_url and pr_number are absent',
    );
});

test('postTaskCloseOut resolves even when all close-out steps are no-ops', async () => {
    const result = await postTaskCloseOut(makeTask(), makeResult());
    assert.strictEqual(result, undefined, 'postTaskCloseOut should return undefined');
});
