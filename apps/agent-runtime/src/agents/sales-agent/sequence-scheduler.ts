import type { PrismaClient } from '@prisma/client';
import type {
    SalesAgentConfigRecord,
    SalesSequenceEntryRecord,
} from '@agentfarm/shared-types';

export interface ScheduleSequenceParams {
    tenantId: string;
    botId: string;
    prospectId: string;
    config: SalesAgentConfigRecord;
    startFrom?: Date;
}

export interface ScheduleSequenceResult {
    scheduled: SalesSequenceEntryRecord[];
}

/**
 * scheduleFollowUps — creates SalesSequenceEntry rows
 * for all remaining follow-up steps for a prospect.
 * Uses config.followUpDays to calculate scheduledFor dates.
 * Step 1 = first outreach (already sent — skip if sentAt exists)
 * Steps 2,3... = follow-ups on days config.followUpDays[0],
 *   config.followUpDays[1], etc.
 *
 * Does NOT send emails. Only creates schedule entries.
 * Idempotent — if entries already exist for this prospect,
 * returns existing ones without creating duplicates.
 */
export async function scheduleFollowUps(
    params: ScheduleSequenceParams,
    prisma: PrismaClient,
): Promise<ScheduleSequenceResult> {
    // Check if entries already exist
    const existing = await (prisma as unknown as PrismaWithSeq).salesSequenceEntry.findMany({
        where: {
            prospectId: params.prospectId,
            tenantId: params.tenantId,
        },
        orderBy: { sequenceStep: 'asc' },
    });

    if (existing.length > 0) {
        return { scheduled: existing.map(toRecord) };
    }

    const base = params.startFrom ?? new Date();
    const followUpDays = params.config.followUpDays as number[];
    const entries: RawEntry[] = [];

    for (let i = 0; i < followUpDays.length; i++) {
        const daysOffset = followUpDays
            .slice(0, i + 1)
            .reduce((a, b) => a + b, 0);
        const scheduledFor = new Date(
            base.getTime() + daysOffset * 24 * 60 * 60 * 1000,
        );

        const entry = await (prisma as unknown as PrismaWithSeq).salesSequenceEntry.create({
            data: {
                tenantId: params.tenantId,
                botId: params.botId,
                prospectId: params.prospectId,
                sequenceStep: i + 2, // step 1 = initial, 2+ = follow-ups
                scheduledFor,
            },
        });

        entries.push(entry);
    }

    return { scheduled: entries.map(toRecord) };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface RawEntry {
    id: string;
    tenantId: string;
    botId: string;
    prospectId: string;
    sequenceStep: number;
    scheduledFor: Date | string;
    sentAt?: Date | string | null;
    skipped: boolean;
    skipReason?: string | null;
    subject?: string | null;
    activityId?: string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
}

type PrismaWithSeq = {
    salesSequenceEntry: {
        findMany: (args: {
            where: Record<string, unknown>;
            orderBy?: Record<string, unknown>;
        }) => Promise<RawEntry[]>;
        create: (args: { data: Record<string, unknown> }) => Promise<RawEntry>;
    };
};

function toRecord(e: RawEntry): SalesSequenceEntryRecord {
    return {
        id: e.id,
        tenantId: e.tenantId,
        botId: e.botId,
        prospectId: e.prospectId,
        sequenceStep: e.sequenceStep,
        scheduledFor:
            e.scheduledFor instanceof Date
                ? e.scheduledFor.toISOString()
                : e.scheduledFor,
        sentAt:
            e.sentAt instanceof Date
                ? e.sentAt.toISOString()
                : e.sentAt ?? undefined,
        skipped: e.skipped,
        skipReason: e.skipReason ?? undefined,
        subject: e.subject ?? undefined,
        activityId: e.activityId ?? undefined,
        createdAt:
            e.createdAt instanceof Date
                ? e.createdAt.toISOString()
                : e.createdAt,
        updatedAt:
            e.updatedAt instanceof Date
                ? e.updatedAt.toISOString()
                : e.updatedAt,
    };
}
