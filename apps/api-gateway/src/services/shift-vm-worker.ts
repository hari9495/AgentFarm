/**
 * Shift-driven VM power worker (H1).
 *
 * Periodically reconciles each workspace VM's power state with its agents' shifts:
 * starts the VM when an agent comes on-shift, deallocates it when all agents are off-shift.
 * Decision logic lives in shift-vm-reconciler.ts (pure); this worker handles the DB lookup,
 * the Azure power call, and persisting the resulting status.
 *
 * Fail-safe: per-VM errors are logged and skipped; the sweep never throws.
 * Only meaningful when Azure is configured (AZURE_SUBSCRIPTION_ID) — otherwise the
 * worker-manager does not start it.
 */

import { prisma } from '../lib/db.js';
import {
    computeWorkspaceVmActions,
    type WorkspaceVmShiftState,
} from '../lib/shift-vm-reconciler.js';

type WorkerLogger = {
    info: (message: string) => void;
    error: (message: string, error?: unknown) => void;
};

type ApplyPowerFn = (
    resourceGroup: string,
    vmName: string,
    desired: 'running' | 'deallocated',
) => Promise<{ success: boolean; errorMessage?: string }>;

type ShiftVmWorkerRepo = {
    listWorkspaceVmsWithShifts(): Promise<WorkspaceVmShiftState[]>;
    updateVmStatus(workspaceId: string, status: 'running' | 'deallocated'): Promise<void>;
};

const SWEEP_INTERVAL_MS = 5 * 60_000; // re-evaluate every 5 minutes

const defaultLogger: WorkerLogger = {
    info: (message) => console.log(`[shift-vm-worker] ${message}`),
    error: (message, error) => console.error(`[shift-vm-worker] ${message}`, error),
};

const defaultRepo: ShiftVmWorkerRepo = {
    async listWorkspaceVmsWithShifts() {
        // Workspace VMs joined to their bots' personas (workingHours + timezone).
        const vms = await (prisma as never as {
            workspaceVm: {
                findMany: (args: unknown) => Promise<
                    Array<{ workspaceId: string; resourceGroup: string; vmName: string; status: string }>
                >;
            };
        }).workspaceVm.findMany({
            select: { workspaceId: true, resourceGroup: true, vmName: true, status: true },
        });

        const result: WorkspaceVmShiftState[] = [];
        for (const vm of vms) {
            const personas = await (prisma as never as {
                agentPersona: {
                    findMany: (args: unknown) => Promise<Array<{ workingHours: unknown; timezone: string }>>;
                };
            }).agentPersona.findMany({
                where: { bot: { workspaceId: vm.workspaceId } },
                select: { workingHours: true, timezone: true },
            });
            result.push({
                workspaceId: vm.workspaceId,
                resourceGroup: vm.resourceGroup,
                vmName: vm.vmName,
                status: vm.status,
                personas: personas.map((p) => ({ workingHours: p.workingHours, timezone: p.timezone })),
            });
        }
        return result;
    },
    async updateVmStatus(workspaceId, status) {
        await (prisma as never as {
            workspaceVm: { update: (args: unknown) => Promise<unknown> };
        }).workspaceVm.update({
            where: { workspaceId },
            data: { status },
        });
    },
};

export const runShiftVmTick = async (input: {
    applyPower: ApplyPowerFn;
    repo?: ShiftVmWorkerRepo;
    now?: () => number;
    logger?: WorkerLogger;
}): Promise<{ evaluated: number; started: number; deallocated: number; failed: number }> => {
    const repo = input.repo ?? defaultRepo;
    const logger = input.logger ?? defaultLogger;
    const now = new Date(input.now ? input.now() : Date.now());

    const vms = await repo.listWorkspaceVmsWithShifts();
    const actions = computeWorkspaceVmActions(vms, now);

    let started = 0;
    let deallocated = 0;
    let failed = 0;

    for (const action of actions) {
        try {
            const res = await input.applyPower(action.resourceGroup, action.vmName, action.desired);
            if (!res.success) {
                failed += 1;
                logger.error(`power ${action.desired} failed for ${action.vmName}: ${res.errorMessage ?? 'unknown'}`);
                continue;
            }
            await repo.updateVmStatus(action.workspaceId, action.desired);
            if (action.action === 'start') started += 1;
            else deallocated += 1;
            logger.info(`workspace ${action.workspaceId}: ${action.action} (${action.reason})`);
        } catch (err) {
            failed += 1;
            logger.error(`power action failed for ${action.vmName}`, err);
        }
    }

    return { evaluated: vms.length, started, deallocated, failed };
};

let workerTimer: NodeJS.Timeout | null = null;
let stopping = false;
let inProgress = false;

const defaultApplyPower: ApplyPowerFn = async (resourceGroup, vmName, desired) => {
    const { setWorkspaceVmPower } = await import('./azure-provisioning-steps.js');
    const res = await setWorkspaceVmPower(resourceGroup, vmName, desired);
    return { success: res.success, errorMessage: res.errorMessage };
};

const scheduleNext = (logger: WorkerLogger, applyPower: ApplyPowerFn, delayMs: number): void => {
    if (stopping) return;
    workerTimer = setTimeout(async () => {
        if (stopping || inProgress) {
            scheduleNext(logger, applyPower, SWEEP_INTERVAL_MS);
            return;
        }
        inProgress = true;
        try {
            const r = await runShiftVmTick({ applyPower, logger });
            if (r.started || r.deallocated || r.failed) {
                logger.info(`tick: ${r.started} started, ${r.deallocated} deallocated, ${r.failed} failed (of ${r.evaluated})`);
            }
        } catch (err) {
            logger.error('shift VM tick failed', err);
        } finally {
            inProgress = false;
            scheduleNext(logger, applyPower, SWEEP_INTERVAL_MS);
        }
    }, delayMs);
};

export const startShiftVmWorker = (
    logger: WorkerLogger = defaultLogger,
    applyPower: ApplyPowerFn = defaultApplyPower,
): void => {
    if (workerTimer) {
        logger.info('shift VM worker already running');
        return;
    }
    stopping = false;
    scheduleNext(logger, applyPower, 5_000);
    logger.info('shift VM worker started');
};

export const stopShiftVmWorker = (): void => {
    stopping = true;
    if (workerTimer) {
        clearTimeout(workerTimer);
        workerTimer = null;
    }
};
