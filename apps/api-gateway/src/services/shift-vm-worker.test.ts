import test from 'node:test';
import assert from 'node:assert/strict';
import { runShiftVmTick } from './shift-vm-worker.js';
import type { WorkspaceVmShiftState } from '../lib/shift-vm-reconciler.js';

const NINE_TO_SIX_UTC = { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] };
const MON_NOON = new Date('2026-06-29T12:00:00Z').getTime();
const MON_NIGHT = new Date('2026-06-29T22:00:00Z').getTime();

const silentLogger = { info: () => {}, error: () => {} };

const makeRepo = (vms: WorkspaceVmShiftState[]) => {
    const statusUpdates: Array<{ workspaceId: string; status: string }> = [];
    return {
        statusUpdates,
        async listWorkspaceVmsWithShifts() {
            return vms;
        },
        async updateVmStatus(workspaceId: string, status: 'running' | 'deallocated') {
            statusUpdates.push({ workspaceId, status });
        },
    };
};

test('runShiftVmTick starts an off VM whose persona is on-shift and persists status', async () => {
    const repo = makeRepo([
        { workspaceId: 'ws1', resourceGroup: 'rg', vmName: 'vm1', status: 'deallocated', personas: [{ workingHours: NINE_TO_SIX_UTC, timezone: 'UTC' }] },
    ]);
    const powerCalls: Array<{ vmName: string; desired: string }> = [];
    const applyPower = async (_rg: string, vmName: string, desired: 'running' | 'deallocated') => {
        powerCalls.push({ vmName, desired });
        return { success: true };
    };

    const result = await runShiftVmTick({ applyPower, repo, now: () => MON_NOON, logger: silentLogger });

    assert.equal(result.started, 1);
    assert.equal(result.deallocated, 0);
    assert.deepEqual(powerCalls, [{ vmName: 'vm1', desired: 'running' }]);
    assert.deepEqual(repo.statusUpdates, [{ workspaceId: 'ws1', status: 'running' }]);
});

test('runShiftVmTick deallocates an on VM whose personas are all off-shift', async () => {
    const repo = makeRepo([
        { workspaceId: 'ws1', resourceGroup: 'rg', vmName: 'vm1', status: 'running', personas: [{ workingHours: NINE_TO_SIX_UTC, timezone: 'UTC' }] },
    ]);
    const applyPower = async () => ({ success: true });
    const result = await runShiftVmTick({ applyPower, repo, now: () => MON_NIGHT, logger: silentLogger });
    assert.equal(result.deallocated, 1);
    assert.deepEqual(repo.statusUpdates, [{ workspaceId: 'ws1', status: 'deallocated' }]);
});

test('runShiftVmTick does NOT persist status when the power call fails', async () => {
    const repo = makeRepo([
        { workspaceId: 'ws1', resourceGroup: 'rg', vmName: 'vm1', status: 'deallocated', personas: [{ workingHours: NINE_TO_SIX_UTC, timezone: 'UTC' }] },
    ]);
    const applyPower = async () => ({ success: false, errorMessage: 'ARM 500' });
    const result = await runShiftVmTick({ applyPower, repo, now: () => MON_NOON, logger: silentLogger });
    assert.equal(result.failed, 1);
    assert.equal(result.started, 0);
    assert.deepEqual(repo.statusUpdates, [], 'status must not change when Azure power call failed');
});

test('runShiftVmTick is a no-op when all VMs already match shift state', async () => {
    const repo = makeRepo([
        { workspaceId: 'ws1', resourceGroup: 'rg', vmName: 'vm1', status: 'running', personas: [{ workingHours: NINE_TO_SIX_UTC, timezone: 'UTC' }] },
    ]);
    let calls = 0;
    const applyPower = async () => { calls += 1; return { success: true }; };
    const result = await runShiftVmTick({ applyPower, repo, now: () => MON_NOON, logger: silentLogger });
    assert.equal(calls, 0);
    assert.equal(result.started + result.deallocated + result.failed, 0);
    assert.equal(result.evaluated, 1);
});
