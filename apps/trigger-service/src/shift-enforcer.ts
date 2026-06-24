// ============================================================================
// Shift enforcer (C5) — gate autonomous tasks by the agent persona's shift.
//
// Before dispatching a pulled/scheduled task to the runtime, check whether the
// target agent is within its working hours (AgentPersona.workingHours +
// timezone). If outside the shift, the task is parked as a DeferredTask and
// released at the next shift open by deferred-task-sweep — so an agent does the
// work "on shift" like a human teammate, and nothing is dropped.
// ============================================================================

import type { PrismaClient } from '@prisma/client';
import { evaluateShift, type ShiftStatus } from '@agentfarm/shared-types';

export type ShiftDecision = {
    /** True when the task should run now. */
    available: boolean;
    /** When deferred, the instant to release the task. */
    runAfter?: Date;
    status: ShiftStatus;
};

/**
 * Resolve the agent's shift status. No agentId or no persona/workingHours →
 * always available (back-compat: 24/7).
 */
export async function evaluateAgentShift(
    prisma: PrismaClient,
    agentId: string | null | undefined,
    now: Date = new Date(),
): Promise<ShiftDecision> {
    const alwaysOn: ShiftStatus = {
        available: true,
        nextWindowStart: null,
        timezone: 'UTC',
        workingHours: null,
    };
    if (!agentId) return { available: true, status: alwaysOn };

    type PersonaShift = { timezone: string; workingHours: unknown };
    let persona: PersonaShift | null = null;
    try {
        persona = (await (prisma as any).agentPersona.findUnique({
            where: { botId: agentId },
            select: { timezone: true, workingHours: true },
        })) as PersonaShift | null;
    } catch (err) {
        // Fail-open: a lookup failure must not block work.
        console.error('[shift-enforcer] persona lookup failed:', err);
        return { available: true, status: alwaysOn };
    }

    if (!persona) return { available: true, status: alwaysOn };

    const status = evaluateShift({
        workingHours: persona.workingHours,
        timezone: persona.timezone,
        now,
    });
    if (status.available) return { available: true, status };

    const runAfter = status.nextWindowStart ? new Date(status.nextWindowStart) : undefined;
    return { available: false, runAfter, status };
}

/**
 * Park an off-shift task. Returns the DeferredTask id (or null on failure — the
 * caller should then proceed to dispatch rather than silently drop the task).
 */
export async function deferTask(
    prisma: PrismaClient,
    input: {
        tenantId: string;
        agentId?: string | null;
        payload: Record<string, unknown>;
        runAfter: Date;
        reason?: string;
    },
): Promise<string | null> {
    try {
        const row = await (prisma as any).deferredTask.create({
            data: {
                tenantId: input.tenantId,
                agentId: input.agentId ?? null,
                payload: input.payload as any,
                runAfter: input.runAfter,
                reason: input.reason ?? 'shift_closed',
            },
        });
        return row.id as string;
    } catch (err) {
        console.error('[shift-enforcer] failed to persist deferred task:', err);
        return null;
    }
}
