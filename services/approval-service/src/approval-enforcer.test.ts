/**
 * Epic B2: Approval Gate Enforcement Tests
 * Tests kill-switch activation, approval precedence, and execution blocking
 */

import { test } from 'node:test';
import * as assert from 'node:assert';
import { ApprovalEnforcer, type ActivateKillSwitchRequest } from './approval-enforcer.js';

test('B2: activateKillSwitch creates active switch record', async () => {
    const enforcer = new ApprovalEnforcer();
    const request: ActivateKillSwitchRequest = {
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        switchType: 'emergency',
        reason: 'Security incident detected',
        affectedActionTypes: ['high'],
        activatedBy: 'admin-1',
        correlationId: 'corr-1',
    };

    const killSwitch = await enforcer.activateKillSwitch(request);
    assert.equal(killSwitch.status, 'active');
    assert.ok(killSwitch.id);
    assert.equal(killSwitch.reason, 'Security incident detected');
    assert.equal(killSwitch.affectedActionTypes.length, 1);
});

test('B2: canExecute blocks execution when kill-switch is active', async () => {
    const enforcer = new ApprovalEnforcer();

    // Activate kill-switch affecting high-risk actions
    await enforcer.activateKillSwitch({
        tenantId: 'tenant-2',
        switchType: 'emergency',
        reason: 'Production issue',
        affectedActionTypes: ['high'],
        activatedBy: 'admin-1',
        correlationId: 'corr-1',
    });

    // Try to execute high-risk action
    const canExecute = await enforcer.canExecute(
        'task-1',
        'high',
        'tenant-2',
        'ws-1',
        'bot-1',
        'approved'
    );

    assert.equal(canExecute, false); // Blocked by kill-switch even with approval
});

test('B2: canExecute allows low-risk execution when kill-switch targets high only', async () => {
    const enforcer = new ApprovalEnforcer();

    // Activate kill-switch for high-risk only
    await enforcer.activateKillSwitch({
        tenantId: 'tenant-3',
        switchType: 'manual',
        reason: 'Testing',
        affectedActionTypes: ['high'],
        activatedBy: 'admin-1',
        correlationId: 'corr-1',
    });

    // Low-risk should execute
    const canExecute = await enforcer.canExecute(
        'task-2',
        'low',
        'tenant-3',
        'ws-1',
        'bot-1'
    );

    assert.equal(canExecute, true);
});

test('B2: canExecute requires approval for medium-risk actions', async () => {
    const enforcer = new ApprovalEnforcer();

    // No kill-switch, just approval requirement check
    const withoutApproval = await enforcer.canExecute(
        'task-3',
        'medium',
        'tenant-4',
        'ws-1',
        'bot-1',
        undefined
    );

    assert.equal(withoutApproval, false); // No approval provided

    const withApproval = await enforcer.canExecute(
        'task-3',
        'medium',
        'tenant-4',
        'ws-1',
        'bot-1',
        'approved'
    );

    assert.equal(withApproval, true); // Approval provided
});

test('B2: canExecute blocks when approval is rejected', async () => {
    const enforcer = new ApprovalEnforcer();

    const canExecute = await enforcer.canExecute(
        'task-4',
        'high',
        'tenant-5',
        'ws-1',
        'bot-1',
        'rejected'
    );

    assert.equal(canExecute, false);
});

test('B2: canExecute blocks when approval is timeout_rejected', async () => {
    const enforcer = new ApprovalEnforcer();

    const canExecute = await enforcer.canExecute(
        'task-5',
        'high',
        'tenant-6',
        'ws-1',
        'bot-1',
        'timeout_rejected'
    );

    assert.equal(canExecute, false);
});

test('B2: resumeAfterKillSwitch updates switch status to resolved', async () => {
    const enforcer = new ApprovalEnforcer();

    const killSwitch = await enforcer.activateKillSwitch({
        tenantId: 'tenant-7',
        switchType: 'emergency',
        reason: 'Test',
        affectedActionTypes: ['high'],
        activatedBy: 'admin-1',
        correlationId: 'corr-1',
    });

    const resumed = await enforcer.resumeAfterKillSwitch({
        killSwitchId: killSwitch.id,
        resumeApprovalId: 'approval-1',
        incidentRef: 'INC-001',
        authorizedBy: 'admin-2',
        correlationId: 'corr-2',
    });

    assert.equal(resumed.status, 'resolved');
    assert.equal(resumed.resumeRequiredApprovalId, 'approval-1');
    assert.ok(resumed.resumedAt);
});

test('B2: listActiveKillSwitches returns only active switches for tenant', async () => {
    const enforcer = new ApprovalEnforcer();

    // Activate two switches
    const switch1 = await enforcer.activateKillSwitch({
        tenantId: 'tenant-8',
        switchType: 'emergency',
        reason: 'Test 1',
        affectedActionTypes: ['high'],
        activatedBy: 'admin-1',
        correlationId: 'corr-1',
    });

    const switch2 = await enforcer.activateKillSwitch({
        tenantId: 'tenant-8',
        switchType: 'manual',
        reason: 'Test 2',
        affectedActionTypes: ['medium', 'high'],
        activatedBy: 'admin-2',
        correlationId: 'corr-2',
    });

    const active = await enforcer.listActiveKillSwitches('tenant-8');
    assert.equal(active.length, 2);

    // Resolve one
    await enforcer.resumeAfterKillSwitch({
        killSwitchId: switch1.id,
        resumeApprovalId: 'approval-1',
        incidentRef: 'INC-001',
        authorizedBy: 'admin-3',
        correlationId: 'corr-3',
    });

    const afterResume = await enforcer.listActiveKillSwitches('tenant-8');
    assert.equal(afterResume.length, 1);
    assert.equal(afterResume[0].id, switch2.id);
});

test('B2: checkEnforcement returns context with enforcement flags', async () => {
    const enforcer = new ApprovalEnforcer();

    const context = await enforcer.checkEnforcement(
        'bot-1',
        'tenant-9',
        'ws-1',
        'high',
        'task-1',
        'approved'
    );

    assert.equal(context.riskLevel, 'high');
    assert.equal(context.requiresApproval, false); // Approved
    assert.equal(context.killedBySwitch, undefined); // No switch
});
