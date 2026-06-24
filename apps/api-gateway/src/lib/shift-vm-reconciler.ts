/**
 * Shift-driven VM power reconciler (H1) — pure decision logic.
 *
 * A workspace VM should be powered ON while any agent (persona) in that workspace is within
 * its working shift, and deallocated otherwise — so a "digital employee" VM starts at shift
 * open and releases compute billing at shift close (the partner to C5 shift enforcement).
 *
 * This module is pure: it takes the current VM + persona-shift state and returns the actions
 * to apply. The Azure calls and DB I/O live in the worker that consumes these decisions, so
 * the policy is fully unit-testable without cloud/database access.
 */

import { isWithinShift } from '@agentfarm/shared-types';

export type PersonaShift = {
    /** Raw AgentPersona.workingHours (JSON) — null/invalid means always-on (24/7). */
    workingHours: unknown;
    /** IANA timezone, e.g. "Asia/Kolkata". Falls back to UTC when empty. */
    timezone: string;
};

export type WorkspaceVmShiftState = {
    workspaceId: string;
    resourceGroup: string;
    vmName: string;
    /** Current persisted power state — 'running' means powered on. */
    status: string;
    /** Personas (agents) hosted on this workspace VM. */
    personas: PersonaShift[];
};

export type VmPowerAction = {
    workspaceId: string;
    resourceGroup: string;
    vmName: string;
    action: 'start' | 'deallocate' | 'none';
    desired: 'running' | 'deallocated';
    reason: string;
};

const isPoweredOn = (status: string): boolean => {
    const s = status.trim().toLowerCase();
    // Treat transitional/healthy states as "on"; everything else (deallocated, stopped,
    // deallocating) as "off". Unknown statuses default to off so we err toward starting.
    return s === 'running' || s === 'starting' || s === 'provisioning';
};

/**
 * Decide the desired power state for one workspace VM from its personas' shifts.
 * - No personas at all → leave as-is (we don't manage VMs with nothing to run yet).
 * - Any persona within shift (or always-on) → desired ON.
 * - All personas off-shift → desired OFF (deallocate).
 */
export const decideVmAction = (vm: WorkspaceVmShiftState, now: Date): VmPowerAction => {
    const base = {
        workspaceId: vm.workspaceId,
        resourceGroup: vm.resourceGroup,
        vmName: vm.vmName,
    };

    if (vm.personas.length === 0) {
        return { ...base, action: 'none', desired: isPoweredOn(vm.status) ? 'running' : 'deallocated', reason: 'no personas on workspace' };
    }

    const anyOnShift = vm.personas.some((p) => isWithinShift(p.workingHours, p.timezone || 'UTC', now));
    const desired: 'running' | 'deallocated' = anyOnShift ? 'running' : 'deallocated';
    const currentlyOn = isPoweredOn(vm.status);

    if (desired === 'running' && !currentlyOn) {
        return { ...base, action: 'start', desired, reason: 'a persona is within shift but VM is off' };
    }
    if (desired === 'deallocated' && currentlyOn) {
        return { ...base, action: 'deallocate', desired, reason: 'all personas off-shift but VM is on' };
    }
    return { ...base, action: 'none', desired, reason: 'VM power already matches shift state' };
};

/**
 * Reconcile a batch of workspace VMs. Returns only the VMs that need a power change,
 * unless `includeNoop` is set (useful for diagnostics/tests).
 */
export const computeWorkspaceVmActions = (
    vms: WorkspaceVmShiftState[],
    now: Date = new Date(),
    includeNoop = false,
): VmPowerAction[] => {
    const actions = vms.map((vm) => decideVmAction(vm, now));
    return includeNoop ? actions : actions.filter((a) => a.action !== 'none');
};
