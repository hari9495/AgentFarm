/**
 * Shift gate — centralized working-hours check for the agent-runtime worker
 * loop. Runs once per dequeued task (dequeueNextProcessableTask in
 * runtime-server.ts), so it covers every intake path — webhook, email/Slack,
 * scheduled routines, and direct API — not just the trigger-service
 * tracker-poller path, which previously had its own standalone check
 * (apps/trigger-service/src/shift-enforcer.ts).
 *
 * Off-shift tasks are parked as DeferredTask (same table/shape trigger-service
 * uses) and released via a fresh POST /tasks/intake once deferred-task-sweep
 * finds them due.
 */

import { PrismaClient } from '@prisma/client';
import { evaluateShift } from '@agentfarm/shared-types';

export type ShiftGateResult =
    | { available: true }
    | { available: false; deferredTaskId: string | null };

/** Marker so deferred-task-sweep knows to replay via /tasks/intake instead of /run-task. */
export const SHIFT_GATE_DEFERRED_KIND = 'runtime_intake' as const;

/** Pure, testable core — takes prisma as a parameter. Fail-open on any DB error. */
export async function checkAgentShiftWithPrisma(
    prisma: { agentPersona: { findUnique: (args: unknown) => Promise<unknown> }; deferredTask: { create: (args: unknown) => Promise<unknown> } },
    agentId: string | null | undefined,
    tenantId: string,
    taskId: string,
    payload: Record<string, unknown>,
): Promise<ShiftGateResult> {
    if (!agentId) return { available: true };

    type PersonaShift = { timezone: string; workingHours: unknown };
    let persona: PersonaShift | null;
    try {
        persona = (await prisma.agentPersona.findUnique({
            where: { botId: agentId },
            select: { timezone: true, workingHours: true },
        })) as PersonaShift | null;
    } catch {
        return { available: true }; // fail-open: lookup failure must not block work
    }
    if (!persona) return { available: true };

    const status = evaluateShift({ workingHours: persona.workingHours, timezone: persona.timezone, now: new Date() });
    if (status.available) return { available: true };

    const runAfter = status.nextWindowStart ? new Date(status.nextWindowStart) : new Date(Date.now() + 60 * 60 * 1000);
    try {
        const row = (await prisma.deferredTask.create({
            data: {
                tenantId,
                agentId,
                payload: { __deferredKind: SHIFT_GATE_DEFERRED_KIND, task_id: taskId, payload },
                runAfter,
                reason: 'shift_closed',
            },
        })) as { id: string };
        return { available: false, deferredTaskId: row.id };
    } catch {
        return { available: false, deferredTaskId: null };
    }
}

// ---------------------------------------------------------------------------
// Runtime convenience: cached Prisma (mirrors action-governance.ts).
// ---------------------------------------------------------------------------

let _prisma: PrismaClient | null | undefined;

function getCachedPrisma(): PrismaClient | null {
    if (_prisma !== undefined) return _prisma;
    if (!process.env['DATABASE_URL']?.trim()) {
        _prisma = null;
        return null;
    }
    try {
        _prisma = new PrismaClient();
    } catch {
        _prisma = null;
    }
    return _prisma;
}

/** Runtime entry: cached-prisma shift check, fail-safe (no DB → always available). */
export async function checkAgentShift(
    agentId: string | null | undefined,
    tenantId: string,
    taskId: string,
    payload: Record<string, unknown>,
): Promise<ShiftGateResult> {
    const prisma = getCachedPrisma();
    if (!prisma) return { available: true };
    return checkAgentShiftWithPrisma(prisma as any, agentId, tenantId, taskId, payload);
}
