import test from 'node:test';
import assert from 'node:assert/strict';
import {
    hasBudgetLimitChanges,
    formatUsd,
    getBudgetStatusBadgeClass,
    getBudgetStatusLabel,
    getUsagePercent,
    normalizeBudgetLimitScope,
    parseBudgetLimitInput,
} from './workspace-budget-panel-utils';

test('getUsagePercent returns clamped usage percentage', () => {
    assert.equal(getUsagePercent(50, 100), 50);
    assert.equal(getUsagePercent(99.95, 100), 100);
    assert.equal(getUsagePercent(120, 100), 100);
    assert.equal(getUsagePercent(-20, 100), 0);
    assert.equal(getUsagePercent(20, 0), 0);
});

test('getBudgetStatusLabel prioritizes hard-stop and computes threshold status', () => {
    assert.equal(getBudgetStatusLabel({ dailyPercent: 10, monthlyPercent: 20, isHardStopActive: true }), 'hard-stop active');
    assert.equal(getBudgetStatusLabel({ dailyPercent: 100, monthlyPercent: 50, isHardStopActive: false }), 'critical');
    assert.equal(getBudgetStatusLabel({ dailyPercent: 82, monthlyPercent: 40, isHardStopActive: false }), 'warning');
    assert.equal(getBudgetStatusLabel({ dailyPercent: 55, monthlyPercent: 42, isHardStopActive: false }), 'healthy');
});

test('getBudgetStatusBadgeClass maps status to dashboard badge classes', () => {
    assert.equal(getBudgetStatusBadgeClass('hard-stop active'), 'high');
    assert.equal(getBudgetStatusBadgeClass('critical'), 'high');
    assert.equal(getBudgetStatusBadgeClass('warning'), 'warn');
    assert.equal(getBudgetStatusBadgeClass('healthy'), 'ok');
});

test('formatUsd returns normalized currency values', () => {
    assert.equal(formatUsd(12.3), '$12.30');
    assert.equal(formatUsd(Number.NaN), '$0.00');
});

test('normalizeBudgetLimitScope defaults unknown values to workspace scope', () => {
    assert.equal(normalizeBudgetLimitScope('tenant'), 'tenant');
    assert.equal(normalizeBudgetLimitScope('workspace'), 'workspace');
    assert.equal(normalizeBudgetLimitScope('unexpected'), 'workspace');
});

test('parseBudgetLimitInput accepts positive numeric values and rejects invalid input', () => {
    assert.equal(parseBudgetLimitInput('125'), 125);
    assert.equal(parseBudgetLimitInput('12.345'), 12.35);
    assert.equal(parseBudgetLimitInput('0'), null);
    assert.equal(parseBudgetLimitInput('-5'), null);
    assert.equal(parseBudgetLimitInput('abc'), null);
    assert.equal(parseBudgetLimitInput('   '), null);
});

test('hasBudgetLimitChanges compares scope and numeric limit changes', () => {
    const baseline = { scope: 'workspace' as const, dailyLimit: 100, monthlyLimit: 1000 };

    assert.equal(hasBudgetLimitChanges(baseline, baseline), false);
    assert.equal(hasBudgetLimitChanges(baseline, { ...baseline, scope: 'tenant' }), true);
    assert.equal(hasBudgetLimitChanges(baseline, { ...baseline, dailyLimit: 150 }), true);
    assert.equal(hasBudgetLimitChanges(baseline, { ...baseline, monthlyLimit: 1200 }), true);
});
