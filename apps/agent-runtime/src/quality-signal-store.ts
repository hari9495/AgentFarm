import type { PrismaClient } from '@prisma/client';
import type { QualitySignalEvent } from './llm-quality-tracker.js';

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
