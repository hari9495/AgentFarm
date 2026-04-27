import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildDecision,
    classifyRisk,
    normalizeActionType,
    processApprovedTask,
    processDeveloperTask,
    scoreConfidence,
    type TaskEnvelope,
} from './execution-engine.js';

const taskEnvelope = (payload: Record<string, unknown>, taskId = 'task_1'): TaskEnvelope => ({
    taskId,
    payload,
    enqueuedAt: Date.now(),
});

test('normalizeActionType prefers action_type and falls back to normalized intent', () => {
    assert.equal(normalizeActionType({ action_type: 'Create_Comment' }), 'create_comment');
    assert.equal(normalizeActionType({ intent: 'Code Review' }), 'code_review');
    assert.equal(normalizeActionType({}), 'read_task');
});

test('scoreConfidence returns high confidence for complete payload and lower confidence for ambiguous input', () => {
    const high = scoreConfidence({
        summary: 'Review API response contract for deployment endpoint',
        target: 'api-gateway',
        complexity: 'low',
        ambiguous: false,
    });

    const low = scoreConfidence({
        summary: 'todo',
        complexity: 'high',
        ambiguous: true,
    });

    assert.ok(high >= 0.8);
    assert.ok(low <= 0.5);
});

test('classifyRisk maps action policy and confidence to low/medium/high risk levels', () => {
    const high = classifyRisk('merge_release', 0.91, {});
    assert.equal(high.riskLevel, 'high');

    const medium = classifyRisk('create_comment', 0.9, {});
    assert.equal(medium.riskLevel, 'medium');

    const confidenceMedium = classifyRisk('read_task', 0.4, {});
    assert.equal(confidenceMedium.riskLevel, 'medium');

    const low = classifyRisk('read_task', 0.9, {});
    assert.equal(low.riskLevel, 'low');
});

test('buildDecision supports developer intents for code review and test planning as executable work', () => {
    const codeReview = buildDecision(taskEnvelope({
        intent: 'Code Review',
        summary: 'Review PR #41 for security and quality checks',
        target: 'PR-41',
    }));

    const testPlan = buildDecision(taskEnvelope({
        intent: 'test planning',
        summary: 'Generate positive and negative test scenarios for provisioning retries',
        target: 'provisioning-service',
    }));

    assert.equal(codeReview.actionType, 'code_review');
    assert.equal(codeReview.riskLevel, 'low');
    assert.equal(codeReview.route, 'execute');

    assert.equal(testPlan.actionType, 'test_planning');
    assert.equal(testPlan.riskLevel, 'low');
    assert.equal(testPlan.route, 'execute');
});

test('processDeveloperTask executes low-risk task with transient retries and succeeds', async () => {
    const result = await processDeveloperTask(taskEnvelope({
        action_type: 'read_task',
        summary: 'Read deployment status and post summary',
        target: 'deployments',
        simulate_transient_failures: 2,
    }));

    assert.equal(result.status, 'success');
    assert.equal(result.attempts, 3);
    assert.equal(result.transientRetries, 2);
    assert.equal(result.decision.route, 'execute');
});

test('processDeveloperTask queues medium/high-risk tasks for approval instead of direct execution', async () => {
    const mediumRisk = await processDeveloperTask(taskEnvelope({
        action_type: 'create_comment',
        summary: 'Create status comment on issue',
        target: 'JIRA-55',
    }));

    const highRisk = await processDeveloperTask(taskEnvelope({
        action_type: 'merge_release',
        summary: 'Merge release branch into main',
        target: 'main',
    }));

    assert.equal(mediumRisk.status, 'approval_required');
    assert.equal(mediumRisk.decision.riskLevel, 'medium');
    assert.equal(mediumRisk.attempts, 0);

    assert.equal(highRisk.status, 'approval_required');
    assert.equal(highRisk.decision.riskLevel, 'high');
    assert.equal(highRisk.attempts, 0);
});

test('processDeveloperTask marks non-retryable executor failures as runtime_exception', async () => {
    const failed = await processDeveloperTask(taskEnvelope({
        action_type: 'read_task',
        summary: 'Read status',
        target: 'deployments',
        force_failure: true,
    }));

    assert.equal(failed.status, 'failed');
    assert.equal(failed.failureClass, 'runtime_exception');
    assert.equal(failed.attempts, 1);
    assert.equal(failed.transientRetries, 0);
});

test('processDeveloperTask marks exhausted transient retries as transient_error', async () => {
    const failed = await processDeveloperTask(taskEnvelope({
        action_type: 'read_task',
        summary: 'Read status and notify owner',
        target: 'deployments',
        simulate_transient_failures: 3,
    }), {
        maxAttempts: 3,
    });

    assert.equal(failed.status, 'failed');
    assert.equal(failed.failureClass, 'transient_error');
    assert.equal(failed.attempts, 3);
    assert.equal(failed.transientRetries, 2);
});

test('processApprovedTask executes approved risky action through retry flow', async () => {
    const approved = await processApprovedTask(taskEnvelope({
        action_type: 'merge_release',
        summary: 'Merge release after human approval',
        target: 'main',
        simulate_transient_failures: 1,
    }));

    assert.equal(approved.status, 'success');
    assert.equal(approved.decision.route, 'execute');
    assert.equal(approved.attempts, 2);
    assert.equal(approved.transientRetries, 1);
});

// --- Edge-case hardening ---

test('normalizeActionType treats whitespace-only action_type as missing and falls back to intent', () => {
    assert.equal(normalizeActionType({ action_type: '   ' }), 'read_task');
    assert.equal(normalizeActionType({ action_type: '   ', intent: 'Code Review' }), 'code_review');
});

test('normalizeActionType treats non-string action_type as missing and falls back to intent', () => {
    assert.equal(normalizeActionType({ action_type: 42 }), 'read_task');
    assert.equal(normalizeActionType({ action_type: null, intent: 'test planning' }), 'test_planning');
});

test('scoreConfidence reduces score for any truthy ambiguous value, not only boolean true', () => {
    const booleanTrue = scoreConfidence({
        summary: 'A complete and clear task description',
        target: 'main',
        ambiguous: true,
    });
    const truthyNumber = scoreConfidence({
        summary: 'A complete and clear task description',
        target: 'main',
        ambiguous: 1,
    });
    const nonAmbiguous = scoreConfidence({
        summary: 'A complete and clear task description',
        target: 'main',
        ambiguous: false,
    });

    // Both truthy values should reduce confidence equally
    assert.equal(booleanTrue, truthyNumber);
    // Non-ambiguous should score higher
    assert.ok(nonAmbiguous > booleanTrue);
});

test('classifyRisk risk_hint=low explicitly overrides confidence-based medium risk', () => {
    // Confidence below threshold would normally produce medium, but risk_hint=low forces low
    const result = classifyRisk('read_task', 0.4, { risk_hint: 'low' });
    assert.equal(result.riskLevel, 'low');
    assert.match(result.reason, /explicitly overrides/);
});

test('classifyRisk unknown risk_hint values do not affect classification', () => {
    const result = classifyRisk('read_task', 0.9, { risk_hint: 'critical' });
    assert.equal(result.riskLevel, 'low');
});

test('scoreConfidence reaches minimum score when all penalty conditions are applied simultaneously', () => {
    const score = scoreConfidence({
        summary: 'x',           // too short: -0.18
        complexity: 'high',     // -0.16
        ambiguous: true,        // -0.20
        // no target:           // -0.10
    });
    // 0.92 - 0.18 - 0.16 - 0.20 - 0.10 = 0.28, clamped to 0.28 (never goes negative)
    assert.equal(score, 0.28);
    assert.ok(score >= 0, 'confidence must never go below 0');
});

test('buildDecision routes risk_hint=high payload to approval even for normally-low action', () => {
    const decision = buildDecision(taskEnvelope({
        action_type: 'read_task',
        summary: 'Read and summarize the backlog item',
        target: 'JIRA-1',
        risk_hint: 'high',
    }));

    assert.equal(decision.riskLevel, 'high');
    assert.equal(decision.route, 'approval');
});
