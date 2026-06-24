import test from 'node:test';
import assert from 'node:assert/strict';
import {
    decideVmAction,
    computeWorkspaceVmActions,
    type WorkspaceVmShiftState,
} from './shift-vm-reconciler.js';

// 09:00–18:00 Mon–Fri in UTC.
const NINE_TO_SIX_UTC = { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] };

const vm = (over: Partial<WorkspaceVmShiftState>): WorkspaceVmShiftState => ({
    workspaceId: 'ws1',
    resourceGroup: 'rg1',
    vmName: 'vm1',
    status: 'running',
    personas: [],
    ...over,
});

// Monday 12:00 UTC (within shift) and Monday 22:00 UTC (outside shift).
const MON_NOON = new Date('2026-06-29T12:00:00Z');
const MON_NIGHT = new Date('2026-06-29T22:00:00Z');
const SUNDAY = new Date('2026-06-28T12:00:00Z');

test('starts a deallocated VM when a persona is within shift', () => {
    const a = decideVmAction(
        vm({ status: 'deallocated', personas: [{ workingHours: NINE_TO_SIX_UTC, timezone: 'UTC' }] }),
        MON_NOON,
    );
    assert.equal(a.action, 'start');
    assert.equal(a.desired, 'running');
});

test('deallocates a running VM when all personas are off-shift', () => {
    const a = decideVmAction(
        vm({ status: 'running', personas: [{ workingHours: NINE_TO_SIX_UTC, timezone: 'UTC' }] }),
        MON_NIGHT,
    );
    assert.equal(a.action, 'deallocate');
    assert.equal(a.desired, 'deallocated');
});

test('no-op when power already matches shift state', () => {
    const onShift = decideVmAction(
        vm({ status: 'running', personas: [{ workingHours: NINE_TO_SIX_UTC, timezone: 'UTC' }] }),
        MON_NOON,
    );
    assert.equal(onShift.action, 'none');

    const offShift = decideVmAction(
        vm({ status: 'deallocated', personas: [{ workingHours: NINE_TO_SIX_UTC, timezone: 'UTC' }] }),
        MON_NIGHT,
    );
    assert.equal(offShift.action, 'none');
});

test('a persona with no workingHours keeps the VM always-on', () => {
    const a = decideVmAction(
        vm({ status: 'deallocated', personas: [{ workingHours: null, timezone: 'UTC' }] }),
        SUNDAY,
    );
    assert.equal(a.action, 'start');
    assert.equal(a.desired, 'running');
});

test('union semantics: VM stays on if ANY persona is on-shift', () => {
    const a = decideVmAction(
        vm({
            status: 'deallocated',
            personas: [
                { workingHours: NINE_TO_SIX_UTC, timezone: 'UTC' },
                { workingHours: { start: '00:00', end: '06:00', days: [0] }, timezone: 'UTC' }, // off now
            ],
        }),
        MON_NOON,
    );
    assert.equal(a.action, 'start');
});

test('timezone is respected: IST shift open while UTC clock is "night"', () => {
    // 22:00 UTC == 03:30 next-day IST. An IST 09:00–18:00 shift is OFF; a UTC same-window is OFF too.
    // Use 06:00 UTC == 11:30 IST → IST shift ON, but a UTC-labelled identical window is also ON.
    const sixUtcMon = new Date('2026-06-29T06:00:00Z');
    const ist = decideVmAction(
        vm({ status: 'deallocated', personas: [{ workingHours: NINE_TO_SIX_UTC, timezone: 'Asia/Kolkata' }] }),
        sixUtcMon,
    );
    assert.equal(ist.action, 'start', '11:30 IST is within 09:00–18:00 IST');
});

test('workspace with no personas is left untouched', () => {
    const a = decideVmAction(vm({ status: 'running', personas: [] }), MON_NIGHT);
    assert.equal(a.action, 'none');
});

test('computeWorkspaceVmActions filters no-ops by default', () => {
    const actions = computeWorkspaceVmActions(
        [
            vm({ workspaceId: 'on', status: 'deallocated', personas: [{ workingHours: NINE_TO_SIX_UTC, timezone: 'UTC' }] }),
            vm({ workspaceId: 'stable', status: 'running', personas: [{ workingHours: NINE_TO_SIX_UTC, timezone: 'UTC' }] }),
        ],
        MON_NOON,
    );
    assert.equal(actions.length, 1);
    assert.equal(actions[0]?.workspaceId, 'on');

    const withNoop = computeWorkspaceVmActions(
        [vm({ status: 'running', personas: [{ workingHours: NINE_TO_SIX_UTC, timezone: 'UTC' }] })],
        MON_NOON,
        true,
    );
    assert.equal(withNoop.length, 1);
    assert.equal(withNoop[0]?.action, 'none');
});
