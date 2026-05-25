import type { PrismaClient } from '@prisma/client';
import type { QualitySignalEvent } from './llm-quality-tracker.js';
import { recordQualitySignal } from './llm-quality-tracker.js';

/**
 * Write a quality signal event to the QualitySignalLog table.
 * Called fire-and-forget alongside the in-memory recordQualitySignal so the
 * 7-day rolling window survives process restarts.
 */
export async function persistQualitySignal(
    prisma: PrismaClient,
    event: QualitySignalEvent,
    context: { tenantId: string; workspaceId: string },
): Promise<void> {
    await prisma.qualitySignalLog.create({
        data: {
            tenantId: context.tenantId,
            workspaceId: context.workspaceId,
            taskId: event.taskId ?? null,
            signalType: event.signal ?? null,
            source: event.source,
            score: event.score,
            metadata: {
                provider: event.provider,
                actionType: event.actionType,
                model: event.model ?? null,
                weight: event.weight ?? null,
                reason: event.reason ?? null,
                correlationId: event.correlationId ?? null,
                ...(event.metadata ?? {}),
            },
        },
    });
}

/**
 * Seed the in-memory quality tracker from QualitySignalLog on process startup.
 *
 * The in-memory qualityStore in llm-quality-tracker.ts resets to empty on every
 * restart — so getProviderQualityPenalty() returns the neutral 0.5 for all providers
 * until enough live traffic has accumulated again. This function loads up to 50
 * recent records per provider+actionType from the DB and replays them into the
 * in-memory tracker so the first task after a cold start already benefits from
 * historical quality signals.
 */
export async function seedQualityStoreFromDb(prisma: PrismaClient): Promise<void> {
    try {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000); // last 7 days
        const rows = await prisma.qualitySignalLog.findMany({
            where: { recordedAt: { gte: since }, score: { not: null } },
            select: { score: true, source: true, metadata: true, recordedAt: true },
            orderBy: { recordedAt: 'asc' },
            take: 500,
        });

        for (const row of rows) {
            if (row.score === null) continue;
            const m = row.metadata as Record<string, unknown> | null;
            const provider = typeof m?.provider === 'string' ? m.provider : '';
            const actionType = typeof m?.actionType === 'string' ? m.actionType : '';
            if (!provider || !actionType) continue;

            recordQualitySignal({
                provider,
                actionType,
                score: row.score,
                source: (row.source ?? 'runtime_outcome') as 'runtime_outcome' | 'user_feedback' | 'evaluator' | 'manual',
                recordedAtMs: row.recordedAt.getTime(),
            });
        }
    } catch {
        // Non-fatal — proceed without warm cache if DB is unavailable at startup
    }
}

/**
 * Load quality scores recorded in the past `windowDays` days for a given
 * provider+actionType pair. Used to warm the in-memory quality tracker on
 * startup so a fresh process starts with historical context.
 */
export async function loadRecentQualityScores(
    prisma: PrismaClient,
    provider: string,
    actionType: string,
    windowDays = 7,
): Promise<Array<{ score: number; recordedAt: Date }>> {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1_000);
    const rows = await prisma.qualitySignalLog.findMany({
        where: { recordedAt: { gte: since } },
        select: { score: true, recordedAt: true, metadata: true },
        orderBy: { recordedAt: 'asc' },
        take: 500,
    });

    const normProvider = provider.trim().toLowerCase();
    const normAction = actionType.trim().toLowerCase();

    return rows
        .filter((r) => {
            if (r.score === null) return false;
            const m = r.metadata as Record<string, unknown> | null;
            return (
                typeof m?.provider === 'string' && m.provider === normProvider
                && typeof m?.actionType === 'string' && m.actionType === normAction
            );
        })
        .map((r) => ({ score: r.score as number, recordedAt: r.recordedAt }));
}
