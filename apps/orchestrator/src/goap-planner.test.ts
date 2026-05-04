import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GoalAction, GoalWorldState } from '@agentfarm/shared-types';
import { GoapPlanner, planGoal } from './goap-planner.js';

// ── Shared test fixtures ──────────────────────────────────────────────────────

const actions: GoalAction[] = [
    {
        id: 'chop-wood',
        name: 'ChopWood',
        preconditions: { hasAxe: true, hasWood: false },
        effects: { hasWood: true },
        cost: 1,
    },
    {
        id: 'get-axe',
        name: 'GetAxe',
        preconditions: { hasAxe: false },
        effects: { hasAxe: true },
        cost: 1,
    },
    {
        id: 'build-fire',
        name: 'BuildFire',
        preconditions: { hasWood: true, fireStarted: false },
        effects: { fireStarted: true },
        cost: 1,
    },
];

const planner = new GoapPlanner({
    tenantId: 't1',
    workspaceId: 'ws1',
    botId: 'bot1',
    availableActions: actions,
});

// ── planGoal (pure function) ──────────────────────────────────────────────────

describe('planGoal — direct path', () => {
    it('finds a single-step plan when preconditions already met', () => {
        const current: GoalWorldState = { hasAxe: true, hasWood: false, fireStarted: false };
        const target: GoalWorldState = { hasWood: true };
        const result = planGoal(current, target, actions);
        assert.ok(result.actions, 'expected a plan');
        assert.equal(result.actions!.length, 1);
        assert.equal(result.actions![0].id, 'chop-wood');
        assert.equal(result.totalCost, 1);
    });

    it('finds a two-step plan (GetAxe → ChopWood)', () => {
        const current: GoalWorldState = { hasAxe: false, hasWood: false, fireStarted: false };
        const target: GoalWorldState = { hasWood: true };
        const result = planGoal(current, target, actions);
        assert.ok(result.actions);
        assert.equal(result.actions!.length, 2);
        assert.equal(result.actions![0].id, 'get-axe');
        assert.equal(result.actions![1].id, 'chop-wood');
    });

    it('finds a three-step plan (GetAxe → ChopWood → BuildFire)', () => {
        const current: GoalWorldState = { hasAxe: false, hasWood: false, fireStarted: false };
        const target: GoalWorldState = { fireStarted: true };
        const result = planGoal(current, target, actions);
        assert.ok(result.actions);
        assert.equal(result.actions!.length, 3);
        assert.equal(result.actions![2].id, 'build-fire');
    });

    it('returns empty plan when goal already reached', () => {
        const current: GoalWorldState = { hasWood: true };
        const target: GoalWorldState = { hasWood: true };
        const result = planGoal(current, target, actions);
        assert.ok(result.actions);
        assert.equal(result.actions!.length, 0);
        assert.equal(result.totalCost, 0);
    });

    it('returns null actions when goal is unreachable', () => {
        const current: GoalWorldState = { hasAxe: false };
        const target: GoalWorldState = { flyingCar: true }; // no action produces this
        const result = planGoal(current, target, actions);
        assert.equal(result.actions, null);
    });
});

describe('planGoal — cost optimisation', () => {
    it('picks the lower-cost path when two paths exist', () => {
        const cheapAction: GoalAction = {
            id: 'find-wood',
            name: 'FindWood',
            preconditions: {},
            effects: { hasWood: true },
            cost: 0.5,
        };
        const result = planGoal(
            { hasAxe: true, hasWood: false, fireStarted: false },
            { hasWood: true },
            [actions[0], cheapAction], // chop-wood (cost 1) vs find-wood (cost 0.5)
        );
        assert.ok(result.actions);
        assert.equal(result.actions![0].id, 'find-wood');
        assert.equal(result.totalCost, 0.5);
    });
});

// ── GoapPlanner class ─────────────────────────────────────────────────────────

describe('GoapPlanner.createPlan', () => {
    it('returns a GoalPlan with status executing when plan found', () => {
        const plan = planner.createPlan(
            'Start a fire',
            { hasAxe: false, hasWood: false, fireStarted: false },
            { fireStarted: true },
        );
        assert.equal(plan.status, 'executing');
        assert.equal(plan.actions.length, 3);
        assert.equal(plan.replanCount, 0);
        assert.equal(plan.currentActionIndex, 0);
        assert.equal(plan.tenantId, 't1');
    });

    it('returns a GoalPlan with status failed when no path exists', () => {
        const plan = planner.createPlan('Impossible', {}, { impossibleKey: true });
        assert.equal(plan.status, 'failed');
        assert.equal(plan.actions.length, 0);
    });
});

describe('GoapPlanner.advanceAction', () => {
    it('increments currentActionIndex', () => {
        const plan = planner.createPlan(
            'Chop wood',
            { hasAxe: true, hasWood: false, fireStarted: false },
            { hasWood: true },
        );
        const advanced = planner.advanceAction(plan);
        assert.equal(advanced.currentActionIndex, 1);
        assert.equal(advanced.status, 'completed');
    });
});

describe('GoapPlanner.replan', () => {
    it('increments replanCount and records failedActionId', () => {
        const plan = planner.createPlan(
            'Start a fire',
            { hasAxe: false, hasWood: false, fireStarted: false },
            { fireStarted: true },
        );
        // Simulate get-axe succeeded, then chop-wood failed; current state has axe but no wood
        const newState: GoalWorldState = { hasAxe: true, hasWood: false, fireStarted: false };
        const replanned = planner.replan({ ...plan, currentActionIndex: 1 }, newState);
        assert.equal(replanned.replanCount, 1);
        assert.ok(replanned.failedActionId);
    });

    it('returns failed status when replan finds no path', () => {
        const plan = planner.createPlan(
            'Impossible from middle',
            { hasAxe: false, hasWood: false, fireStarted: false },
            { fireStarted: true },
        );
        // Corrupt world state so nothing is achievable
        const impossible: GoalWorldState = { flyingCar: false };
        const replanned = planner.replan(plan, impossible);
        assert.equal(replanned.status, 'failed');
    });
});
