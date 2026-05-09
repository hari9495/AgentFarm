import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    postTaskCloseOut,
    postTaskCloseOutV2,
    buildCloseOutComment,
    buildCloseOutSummary,
    buildPRDescription,
    type ConnectorAuthMetadata,
    type CloseOutExecutor,
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

// ---------------------------------------------------------------------------
// postTaskCloseOutV2 – connector-metadata-driven dispatch
// ---------------------------------------------------------------------------

function makeConnectorMeta(overrides: Partial<ConnectorAuthMetadata> = {}): ConnectorAuthMetadata {
    return {
        connectorId: 'conn-001',
        tenantId: 'tenant-abc',
        provider: 'jira',
        status: 'active',
        secretRef: 'vault-ref-001',
        ...overrides,
    };
}

function makeExecutor(results: Record<string, { ok: boolean; resultSummary: string }> = {}): {
    executor: CloseOutExecutor;
    calls: Array<{ connectorType: string; actionType: string; payload: Record<string, unknown> }>;
} {
    const calls: Array<{ connectorType: string; actionType: string; payload: Record<string, unknown> }> = [];
    const executor: CloseOutExecutor = async (input) => {
        calls.push({ connectorType: input.connectorType, actionType: input.actionType, payload: input.payload });
        return results[input.connectorType] ?? { ok: true, resultSummary: 'ok' };
    };
    return { executor, calls };
}

// --- Positive: connector path dispatches Jira comment ---

test('postTaskCloseOutV2 dispatches Jira create_comment when jira_issue_key is present', async () => {
    const { executor, calls } = makeExecutor();
    await postTaskCloseOutV2(
        makeTask({ jira_issue_key: 'PROJ-42' }),
        makeResult(),
        [makeConnectorMeta({ provider: 'jira' })],
        executor,
    );
    const jiraCall = calls.find((c) => c.connectorType === 'jira');
    assert.ok(jiraCall, 'should have called executor for jira');
    assert.strictEqual(jiraCall.actionType, 'create_comment');
    assert.strictEqual(jiraCall.payload['issue_key'], 'PROJ-42');
    assert.ok(typeof jiraCall.payload['body'] === 'string' && (jiraCall.payload['body'] as string).includes('PROJ-42') === false, 'body is a comment string');
    assert.ok(typeof jiraCall.payload['body'] === 'string' && (jiraCall.payload['body'] as string).length > 0);
});

// --- Positive: connector path dispatches Teams message ---

test('postTaskCloseOutV2 dispatches Teams send_message when notify_on_complete is true', async () => {
    const { executor, calls } = makeExecutor();
    await postTaskCloseOutV2(
        makeTask({ notify_on_complete: true, teams_team_id: 'team-1', teams_channel_id: 'chan-1' }),
        makeResult(),
        [makeConnectorMeta({ provider: 'teams' })],
        executor,
    );
    const teamsCall = calls.find((c) => c.connectorType === 'teams');
    assert.ok(teamsCall, 'should have called executor for teams');
    assert.strictEqual(teamsCall.actionType, 'send_message');
    assert.strictEqual(teamsCall.payload['team_id'], 'team-1');
    assert.strictEqual(teamsCall.payload['channel_id'], 'chan-1');
});

// --- Positive: connector path dispatches GitHub PR comment ---

test('postTaskCloseOutV2 dispatches GitHub create_pr_comment when pr_number is set', async () => {
    const { executor, calls } = makeExecutor();
    await postTaskCloseOutV2(
        makeTask({ github_owner: 'acme', github_repo: 'farm' }),
        makeResult({ pr_number: 7, pr_url: 'https://github.com/acme/farm/pull/7' }),
        [makeConnectorMeta({ provider: 'github' })],
        executor,
    );
    const ghCall = calls.find((c) => c.connectorType === 'github');
    assert.ok(ghCall, 'should have called executor for github');
    assert.strictEqual(ghCall.actionType, 'create_pr_comment');
    assert.strictEqual(ghCall.payload['pull_number'], 7);
    assert.strictEqual(ghCall.payload['owner'], 'acme');
    assert.strictEqual(ghCall.payload['repo'], 'farm');
});

// --- Negative: Jira step skipped when no jira_issue_key ---

test('postTaskCloseOutV2 skips Jira dispatch when jira_issue_key is absent', async () => {
    const { executor, calls } = makeExecutor();
    await postTaskCloseOutV2(
        makeTask(),
        makeResult(),
        [makeConnectorMeta({ provider: 'jira' })],
        executor,
    );
    const jiraCall = calls.find((c) => c.connectorType === 'jira');
    assert.ok(!jiraCall, 'should NOT call executor for jira when key is absent');
});

// --- Negative: Teams step skipped when notify_on_complete is not true ---

test('postTaskCloseOutV2 skips Teams dispatch when notify_on_complete is absent', async () => {
    const { executor, calls } = makeExecutor();
    await postTaskCloseOutV2(
        makeTask({ notify_on_complete: false }),
        makeResult(),
        [makeConnectorMeta({ provider: 'teams' })],
        executor,
    );
    const teamsCall = calls.find((c) => c.connectorType === 'teams');
    assert.ok(!teamsCall, 'should NOT call executor for teams when notify_on_complete is false');
});

// --- Negative: falls back to env-var path when connectorMeta is absent ---

test('postTaskCloseOutV2 falls back to env-var path when connectorMeta is absent', async () => {
    const { executor, calls } = makeExecutor();
    // No env vars set — fallback path should be no-ops and resolve cleanly
    await assert.doesNotReject(
        () => postTaskCloseOutV2(makeTask(), makeResult(), undefined, executor),
        'should not reject when falling back to env-var path',
    );
    assert.strictEqual(calls.length, 0, 'executor should not be called on env-var fallback path');
});

// --- Negative: falls back to env-var path when executor is absent ---

test('postTaskCloseOutV2 falls back to env-var path when executor is absent', async () => {
    await assert.doesNotReject(
        () => postTaskCloseOutV2(
            makeTask({ jira_issue_key: 'PROJ-99' }),
            makeResult(),
            [makeConnectorMeta({ provider: 'jira' })],
            undefined,
        ),
        'should not reject when executor is absent',
    );
});

// --- Negative: executor failure is swallowed ---

test('postTaskCloseOutV2 swallows executor errors and resolves', async () => {
    const throwingExecutor: CloseOutExecutor = async () => {
        throw new Error('executor exploded');
    };
    const result = await postTaskCloseOutV2(
        makeTask({ jira_issue_key: 'PROJ-42' }),
        makeResult(),
        [makeConnectorMeta({ provider: 'jira' })],
        throwingExecutor,
    );
    assert.ok(result !== null && result !== undefined, 'should resolve even when executor throws');
    assert.equal(result?.resolvedLanguage, 'en');
});
