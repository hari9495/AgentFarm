import test from 'node:test';
import assert from 'node:assert/strict';
import type { GovernanceRule } from '@agentfarm/shared-types';
import { simulatePolicyAction } from './policy-simulator.js';

const deny = (r: Partial<GovernanceRule>): GovernanceRule => ({ actionType: '*', effect: 'deny', ...r });

test('deny rule on exact actionType matches', () => {
    const r = simulatePolicyAction([deny({ actionType: 'deploy_production' })], { actionType: 'deploy_production' });
    assert.equal(r.effect, 'deny');
    assert.equal(r.matchedRule?.actionType, 'deploy_production');
});

test('non-matching actionType → allow', () => {
    const r = simulatePolicyAction([deny({ actionType: 'deploy_production' })], { actionType: 'read_task' });
    assert.equal(r.effect, 'allow');
});

test('wildcard actionType denies anything in scope', () => {
    const r = simulatePolicyAction([deny({ actionType: '*', connector: 'salesforce' })], { actionType: 'whatever', connector: 'salesforce' });
    assert.equal(r.effect, 'deny');
});

test('connector scope must match', () => {
    const rules = [deny({ actionType: 'delete', connector: 'salesforce' })];
    assert.equal(simulatePolicyAction(rules, { actionType: 'delete', connector: 'salesforce' }).effect, 'deny');
    assert.equal(simulatePolicyAction(rules, { actionType: 'delete', connector: 'hubspot' }).effect, 'allow');
});

test('read_only mode denies writes, allows reads', () => {
    const rules = [deny({ actionType: '*', connector: 'salesforce', mode: 'read_only' })];
    assert.equal(simulatePolicyAction(rules, { actionType: 'x', connector: 'salesforce', isWrite: true }).effect, 'deny');
    assert.equal(simulatePolicyAction(rules, { actionType: 'x', connector: 'salesforce', isWrite: false }).effect, 'allow');
});

test('env scope must match', () => {
    const rules = [deny({ actionType: 'deploy', env: 'production' })];
    assert.equal(simulatePolicyAction(rules, { actionType: 'deploy', env: 'production' }).effect, 'deny');
    assert.equal(simulatePolicyAction(rules, { actionType: 'deploy', env: 'staging' }).effect, 'allow');
});

test('time-window rules are reported as time-dependent, not an unconditional deny', () => {
    const rules = [deny({ actionType: 'deploy', timeWindow: { start: '09:00', end: '17:00' } })];
    const r = simulatePolicyAction(rules, { actionType: 'deploy' });
    assert.equal(r.effect, 'allow');
    assert.equal(r.timeDependentRules.length, 1);
});

test('tool scope must match', () => {
    const rules = [deny({ actionType: '*', tool: 'jira.delete' })];
    assert.equal(simulatePolicyAction(rules, { actionType: 'x', tool: 'jira.delete' }).effect, 'deny');
    assert.equal(simulatePolicyAction(rules, { actionType: 'x', tool: 'jira.read' }).effect, 'allow');
});

// --- B4: require_approval rules ---------------------------------------------

test('require_approval rule matches → effect require_approval', () => {
    const r = simulatePolicyAction([{ actionType: 'send_email', effect: 'require_approval' }], { actionType: 'send_email' });
    assert.equal(r.effect, 'require_approval');
});

test('deny beats require_approval (strictest-wins)', () => {
    const rules = [
        { actionType: 'deploy_production', effect: 'require_approval' as const },
        { actionType: 'deploy_production', effect: 'deny' as const },
    ];
    assert.equal(simulatePolicyAction(rules, { actionType: 'deploy_production' }).effect, 'deny');
});

test('require_approval with no matching action → allow', () => {
    const r = simulatePolicyAction([{ actionType: 'send_email', effect: 'require_approval' }], { actionType: 'read_task' });
    assert.equal(r.effect, 'allow');
});
