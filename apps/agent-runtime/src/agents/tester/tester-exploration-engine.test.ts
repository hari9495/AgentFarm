import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildExplorationCharter,
    pickNextHeuristicAction,
    mapActionToExecutableSteps,
    buildExplorationSessionLog,
    type ExplorationAction,
    type ExplorationCharter,
} from './tester-exploration-engine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Record<string, unknown> = {}) {
    return {
        taskId: 'test-task',
        enqueuedAt: Date.now(),
        payload: {
            area: 'checkout flow',
            timebox_minutes: 30,
            ...overrides,
        },
    } as Parameters<typeof buildExplorationCharter>[0];
}

// ---------------------------------------------------------------------------
// buildExplorationCharter
// ---------------------------------------------------------------------------

test('buildExplorationCharter: default dimensions are structure/function/data/platform', () => {
    const charter = buildExplorationCharter(makeTask());
    assert.deepEqual(charter.dimensions, ['structure', 'function', 'data', 'platform']);
});

test('buildExplorationCharter: respects payload dimensions override', () => {
    const charter = buildExplorationCharter(makeTask({ dimensions: ['time', 'operations'] }));
    assert.deepEqual(charter.dimensions, ['time', 'operations']);
});

test('buildExplorationCharter: ignores unknown dimensions', () => {
    const charter = buildExplorationCharter(makeTask({ dimensions: ['function', 'unknown_dim'] }));
    assert.deepEqual(charter.dimensions, ['function']);
});

test('buildExplorationCharter: all actions start as pending', () => {
    const charter = buildExplorationCharter(makeTask());
    assert.ok(charter.actions.length > 0);
    assert.ok(charter.actions.every((a) => a.status === 'pending'));
});

test('buildExplorationCharter: timebox clamps to 15-120 range', () => {
    const low = buildExplorationCharter(makeTask({ timebox_minutes: 5 }));
    const high = buildExplorationCharter(makeTask({ timebox_minutes: 200 }));
    assert.equal(low.timeboxMinutes, 15);
    assert.equal(high.timeboxMinutes, 120);
});

test('buildExplorationCharter: mission string references area', () => {
    const charter = buildExplorationCharter(makeTask({ area: 'login page' }));
    assert.ok(charter.mission.includes('login page'));
});

// ---------------------------------------------------------------------------
// pickNextHeuristicAction
// ---------------------------------------------------------------------------

test('pickNextHeuristicAction: returns first pending action', () => {
    const charter = buildExplorationCharter(makeTask({ dimensions: ['function'] }));
    const next = pickNextHeuristicAction(charter);
    assert.ok(next !== null);
    assert.equal(next!.status, 'pending');
});

test('pickNextHeuristicAction: prioritises failed actions over pending', () => {
    const charter = buildExplorationCharter(makeTask({ dimensions: ['function'] }));
    // Mark first as passed, second as failed, third as pending
    charter.actions[0]!.status = 'passed';
    charter.actions[1]!.status = 'failed';
    const next = pickNextHeuristicAction(charter);
    assert.equal(next!.status, 'failed');
});

test('pickNextHeuristicAction: returns null when all done', () => {
    const charter = buildExplorationCharter(makeTask({ dimensions: ['structure'] }));
    for (const a of charter.actions) a.status = 'passed';
    assert.equal(pickNextHeuristicAction(charter), null);
});

// ---------------------------------------------------------------------------
// mapActionToExecutableSteps — Gap 1 fix
// ---------------------------------------------------------------------------

test('mapActionToExecutableSteps: navigate_screenshot action returns two steps', () => {
    const action: ExplorationAction = {
        dimension: 'structure',
        description: 'Verify every nav link resolves without 404',
        status: 'pending',
    };
    const { steps, skipReason } = mapActionToExecutableSteps(action, 'https://example.com');
    assert.equal(skipReason, undefined);
    assert.equal(steps.length, 2);
    assert.equal(steps[0]!.actionType, 'workspace_web_navigate');
    assert.equal(steps[1]!.actionType, 'workspace_screenshot');
});

test('mapActionToExecutableSteps: screenshot_only action returns one step', () => {
    const action: ExplorationAction = {
        dimension: 'structure',
        description: 'Check all form fields render with correct input types',
        status: 'pending',
    };
    const { steps, skipReason } = mapActionToExecutableSteps(action, 'https://example.com');
    assert.equal(skipReason, undefined);
    assert.equal(steps.length, 1);
    assert.equal(steps[0]!.actionType, 'workspace_screenshot');
});

test('mapActionToExecutableSteps: navigate_screenshot without appUrl returns only screenshot', () => {
    const action: ExplorationAction = {
        dimension: 'structure',
        description: 'Verify every nav link resolves without 404',
        status: 'pending',
    };
    const { steps } = mapActionToExecutableSteps(action, '');
    // No appUrl → no navigate step, just screenshot
    assert.equal(steps.length, 1);
    assert.equal(steps[0]!.actionType, 'workspace_screenshot');
});

test('mapActionToExecutableSteps: multi-browser action is skipped', () => {
    const action: ExplorationAction = {
        dimension: 'platform',
        description: 'Test on Chrome, Firefox, and Edge',
        status: 'pending',
    };
    const { steps, skipReason } = mapActionToExecutableSteps(action, 'https://example.com');
    assert.equal(steps.length, 0);
    assert.ok(typeof skipReason === 'string' && skipReason.length > 0);
});

test('mapActionToExecutableSteps: clock manipulation action is skipped', () => {
    const action: ExplorationAction = {
        dimension: 'time',
        description: 'Set system clock to year-end boundary (Dec 31) and verify date pickers',
        status: 'pending',
    };
    const { steps, skipReason } = mapActionToExecutableSteps(action, 'https://example.com');
    assert.equal(steps.length, 0);
    assert.ok((skipReason ?? '').includes('clock'));
});

test('mapActionToExecutableSteps: unknown description returns skip', () => {
    const action: ExplorationAction = {
        dimension: 'function',
        description: 'Some entirely unknown heuristic step',
        status: 'pending',
    };
    const { steps, skipReason } = mapActionToExecutableSteps(action, 'https://example.com');
    assert.equal(steps.length, 0);
    assert.ok(typeof skipReason === 'string');
});

// ---------------------------------------------------------------------------
// buildExplorationSessionLog
// ---------------------------------------------------------------------------

test('buildExplorationSessionLog: clean session pattern when no failures', () => {
    const charter = buildExplorationCharter(makeTask({ dimensions: ['function'] }));
    for (const a of charter.actions) a.status = 'passed';
    const { pattern } = buildExplorationSessionLog(charter, []);
    assert.equal(pattern, 'tester:exploratory:clean');
});

test('buildExplorationSessionLog: critical pattern when critical findings', () => {
    const charter = buildExplorationCharter(makeTask({ dimensions: ['function'] }));
    const { pattern } = buildExplorationSessionLog(charter, [
        { type: 'functional', description: 'crash on submit', severity: 'critical' },
    ]);
    assert.equal(pattern, 'tester:exploratory:critical_findings');
});

test('buildExplorationSessionLog: summary mentions area and dimensions', () => {
    const charter = buildExplorationCharter(makeTask({ area: 'profile edit', dimensions: ['data'] }));
    const { summary } = buildExplorationSessionLog(charter, []);
    assert.ok(summary.includes('profile edit'));
    assert.ok(summary.includes('data'));
});
