/**
 * F1 — applyApprovalPolicyThreshold: the agent persona's approvalPolicy field
 * ('all' | 'medium-high' | 'high-only') bumps route to 'approval' based on
 * riskLevel. Tighten-only, mirrors applyPolicyDecision's never-downgrade rule.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyApprovalPolicyThreshold, type ActionDecision } from './execution-engine.js';

const decision = (riskLevel: ActionDecision['riskLevel'], route: ActionDecision['route'] = 'execute'): ActionDecision => ({
    actionType: 'read_task',
    confidence: 0.9,
    riskLevel,
    route,
    reason: 'base',
});

test('high-only (default): low and medium stay executed, high routes to approval', () => {
    assert.equal(applyApprovalPolicyThreshold(decision('low'), 'high-only').route, 'execute');
    assert.equal(applyApprovalPolicyThreshold(decision('medium'), 'high-only').route, 'execute');
    assert.equal(applyApprovalPolicyThreshold(decision('high'), 'high-only').route, 'approval');
});

test('medium-high: low stays executed, medium and high route to approval', () => {
    assert.equal(applyApprovalPolicyThreshold(decision('low'), 'medium-high').route, 'execute');
    assert.equal(applyApprovalPolicyThreshold(decision('medium'), 'medium-high').route, 'approval');
    assert.equal(applyApprovalPolicyThreshold(decision('high'), 'medium-high').route, 'approval');
});

test("all: every risk level routes to approval", () => {
    assert.equal(applyApprovalPolicyThreshold(decision('low'), 'all').route, 'approval');
    assert.equal(applyApprovalPolicyThreshold(decision('medium'), 'all').route, 'approval');
    assert.equal(applyApprovalPolicyThreshold(decision('high'), 'all').route, 'approval');
});

test('never downgrades an already-approval-routed decision', () => {
    const alreadyApproval = decision('low', 'approval');
    const result = applyApprovalPolicyThreshold(alreadyApproval, 'high-only');
    assert.equal(result, alreadyApproval); // unchanged reference — no-op
});

test('missing/unknown approvalPolicy value is fail-safe (no extra restriction)', () => {
    assert.equal(applyApprovalPolicyThreshold(decision('high'), null).route, 'execute');
    assert.equal(applyApprovalPolicyThreshold(decision('high'), undefined).route, 'execute');
    assert.equal(applyApprovalPolicyThreshold(decision('high'), 'not_a_real_policy').route, 'execute');
});
