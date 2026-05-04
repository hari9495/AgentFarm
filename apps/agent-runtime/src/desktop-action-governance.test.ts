import test from 'node:test';
import assert from 'node:assert/strict';
import {
    classifyRisk,
    processApprovedTask,
    processDeveloperTask,
    type TaskEnvelope,
} from './execution-engine.js';

const makeTask = (
    actionType: string,
    extra: Record<string, unknown> = {},
    taskId = `desktop-${actionType}`,
): TaskEnvelope => ({
    taskId,
    enqueuedAt: Date.now(),
    payload: {
        action_type: actionType,
        summary: `Execute ${actionType}`,
        target: 'workspace-ui',
        ...extra,
    },
});

test('desktop/browser control actions are classified as high risk', () => {
    const browserOpen = classifyRisk('workspace_browser_open', 0.95, {});
    const appLaunch = classifyRisk('workspace_app_launch', 0.95, {});
    const meetingJoin = classifyRisk('workspace_meeting_join', 0.95, {});

    assert.equal(browserOpen.riskLevel, 'high');
    assert.equal(appLaunch.riskLevel, 'high');
    assert.equal(meetingJoin.riskLevel, 'high');
});

test('desktop/browser control actions require approval in normal developer flow', async () => {
    const browserOpen = await processDeveloperTask(makeTask('workspace_browser_open'));
    const appLaunch = await processDeveloperTask(makeTask('workspace_app_launch'));

    assert.equal(browserOpen.status, 'approval_required');
    assert.equal(browserOpen.decision.riskLevel, 'high');
    assert.equal(browserOpen.attempts, 0);

    assert.equal(appLaunch.status, 'approval_required');
    assert.equal(appLaunch.decision.riskLevel, 'high');
    assert.equal(appLaunch.attempts, 0);
});

test('approved desktop/browser action executes through approved-task path', async () => {
    const approved = await processApprovedTask(
        makeTask('workspace_browser_open', { simulate_transient_failures: 1 }),
    );

    assert.equal(approved.status, 'success');
    assert.equal(approved.decision.route, 'execute');
    assert.equal(approved.decision.riskLevel, 'high');
    assert.equal(approved.attempts, 2);
    assert.equal(approved.transientRetries, 1);
});
