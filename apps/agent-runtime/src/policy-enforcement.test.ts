/**
 * Group D — runtime policy enforcement.
 *
 * D1: applyPolicyDecision merge (max-strictness, never downgrade)
 * D2: buildPolicyEvaluationInput
 * D3: no-policy parity (engine unchanged when no evaluator injected)
 * D4: end-to-end acceptance (deny blocks, require_approval routes, allow executes,
 *     fail-closed routes to approval, evaluator throw keeps heuristic)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { PolicyDecision } from '@agentfarm/shared-types';
import {
    processDeveloperTask,
    processApprovedTask,
    applyPolicyDecision,
    buildPolicyEvaluationInput,
    type ActionDecision,
    type TaskEnvelope,
} from './execution-engine.js';

const taskEnvelope = (payload: Record<string, unknown>, taskId = 'task_pol'): TaskEnvelope => ({
    taskId,
    payload,
    enqueuedAt: Date.now(),
});

const lowExecute: ActionDecision = {
    actionType: 'read_task',
    confidence: 0.92,
    riskLevel: 'low',
    route: 'execute',
    reason: 'low-risk read',
};

const highApproval: ActionDecision = {
    actionType: 'deploy_production',
    confidence: 0.9,
    riskLevel: 'high',
    route: 'approval',
    reason: 'high-risk by policy',
};

const policy = (over: Partial<PolicyDecision>): PolicyDecision => ({
    effect: 'allow',
    requireApproval: false,
    escalate: false,
    reasonCode: 'allowed',
    reason: 'ok',
    failClosed: false,
    ...over,
});

// --- D1: merge logic ----------------------------------------------------------

test('D1: deny blocks the task (denied=true, marked high/approval)', () => {
    const { decision, denied } = applyPolicyDecision(
        lowExecute,
        policy({ effect: 'deny', reasonCode: 'policy_violation', reason: 'no prod' }),
    );
    assert.equal(denied, true);
    assert.equal(decision.route, 'approval');
    assert.equal(decision.riskLevel, 'high');
});

test('D1: require_approval bumps low/execute to medium/approval', () => {
    const { decision, denied } = applyPolicyDecision(lowExecute, policy({ effect: 'require_approval' }));
    assert.equal(denied, false);
    assert.equal(decision.route, 'approval');
    assert.equal(decision.riskLevel, 'medium');
});

test('D1: allow never downgrades an already-approval decision', () => {
    const { decision, denied } = applyPolicyDecision(highApproval, policy({ effect: 'allow' }));
    assert.equal(denied, false);
    assert.equal(decision.route, 'approval');
    assert.equal(decision.riskLevel, 'high');
});

test('D1: require_approval does not downgrade an already-high decision', () => {
    const { decision } = applyPolicyDecision(highApproval, policy({ effect: 'require_approval' }));
    assert.equal(decision.route, 'approval');
    assert.equal(decision.riskLevel, 'high');
});

// --- D2: input builder --------------------------------------------------------

test('D2: buildPolicyEvaluationInput returns null without a tenantId', () => {
    assert.equal(buildPolicyEvaluationInput({ workspaceId: 'ws' }, 'read_task'), null);
});

test('D2: buildPolicyEvaluationInput maps payload fields', () => {
    const input = buildPolicyEvaluationInput(
        { tenantId: 't1', workspaceId: 'ws1', roleKey: 'developer', env: 'production' },
        'deploy_production',
    );
    assert.ok(input);
    assert.equal(input!.tenantId, 't1');
    assert.equal(input!.workspaceId, 'ws1');
    assert.equal(input!.roleKey, 'developer');
    assert.equal(input!.actionType, 'deploy_production');
    assert.equal(input!.env, 'production');
});

// --- D3: no-policy parity -----------------------------------------------------

test('D3: no policyEvaluateFn → low-risk task executes unchanged', async () => {
    const result = await processDeveloperTask(taskEnvelope({
        action_type: 'read_task',
        summary: 'Read deployment status and post summary',
        target: 'deployments',
        tenantId: 't1',
        workspaceId: 'ws1',
    }));
    assert.equal(result.status, 'success');
    assert.equal(result.decision.route, 'execute');
    assert.equal(result.policyDecision, undefined);
});

// --- D4: end-to-end acceptance ------------------------------------------------

const acceptanceTask = () => taskEnvelope({
    action_type: 'read_task',
    summary: 'Deploy build to production cluster',
    target: 'prod',
    tenantId: 'tenant-x',
    workspaceId: 'ws1',
    roleKey: 'developer',
});

test('D4: tenant deny blocks execution with policy provenance', async () => {
    const result = await processDeveloperTask(acceptanceTask(), {
        policyEvaluateFn: async () =>
            policy({
                effect: 'deny',
                reasonCode: 'policy_violation',
                reason: 'production deploy not permitted',
                matchedPolicyId: 'pol-x',
                matchedPolicyVersion: 2,
            }),
    });
    assert.equal(result.status, 'failed');
    assert.equal(result.failureClass, 'policy_violation');
    assert.match(result.errorMessage ?? '', /POLICY_DENIED/);
    assert.match(result.errorMessage ?? '', /pol-x@v2/);
    assert.equal(result.policyDecision?.effect, 'deny');
});

test('D4: tenant allow lets a low-risk task execute', async () => {
    const result = await processDeveloperTask(acceptanceTask(), {
        policyEvaluateFn: async () => policy({ effect: 'allow' }),
    });
    assert.equal(result.status, 'success');
    assert.equal(result.decision.route, 'execute');
    assert.equal(result.policyDecision?.effect, 'allow');
});

test('D4: require_approval routes a low-risk task to approval', async () => {
    const result = await processDeveloperTask(acceptanceTask(), {
        policyEvaluateFn: async () => policy({ effect: 'require_approval', reason: 'needs sign-off' }),
    });
    assert.equal(result.status, 'approval_required');
    assert.equal(result.decision.route, 'approval');
});

test('D4: fail-closed decision routes to approval (never silently executes)', async () => {
    const result = await processDeveloperTask(acceptanceTask(), {
        policyEvaluateFn: async () =>
            policy({ effect: 'require_approval', reasonCode: 'evaluator_unavailable', failClosed: true }),
    });
    assert.equal(result.status, 'approval_required');
});

test('D4: evaluator throw keeps heuristic decision (no crash, no downgrade)', async () => {
    const result = await processDeveloperTask(acceptanceTask(), {
        policyEvaluateFn: async () => {
            throw new Error('boom');
        },
    });
    // low-risk heuristic preserved → executes; engine did not crash
    assert.equal(result.status, 'success');
});

// --- A1: deny re-check on the approved-resume path -----------------------------

const approvedTask = () => taskEnvelope({
    action_type: 'read_task',
    summary: 'Deploy build to production cluster',
    target: 'prod',
    tenantId: 'tenant-x',
    workspaceId: 'ws1',
    roleKey: 'developer',
});

test('A1: deny added after approval still blocks the approved task', async () => {
    const result = await processApprovedTask(approvedTask(), {
        policyEvaluateFn: async () =>
            policy({
                effect: 'deny',
                reasonCode: 'policy_violation',
                reason: 'production deploy revoked',
                matchedPolicyId: 'pol-x',
                matchedPolicyVersion: 5,
            }),
    });
    assert.equal(result.status, 'failed');
    assert.equal(result.failureClass, 'policy_violation');
    assert.match(result.errorMessage ?? '', /POLICY_DENIED/);
    assert.match(result.errorMessage ?? '', /pol-x@v5/);
});

test('A1: allow/require_approval do not re-block an already-approved task', async () => {
    const allowRes = await processApprovedTask(approvedTask(), {
        policyEvaluateFn: async () => policy({ effect: 'allow' }),
    });
    assert.notEqual(allowRes.status, 'failed');

    const approvalRes = await processApprovedTask(approvedTask(), {
        policyEvaluateFn: async () => policy({ effect: 'require_approval', reason: 'needs sign-off' }),
    });
    // require_approval must NOT re-block — the human already approved
    assert.notEqual(approvalRes.status, 'failed');
});

test('A1: evaluator throw does not block an approved task (fail-safe)', async () => {
    const result = await processApprovedTask(approvedTask(), {
        policyEvaluateFn: async () => { throw new Error('opa down'); },
    });
    assert.notEqual(result.status, 'failed');
});
