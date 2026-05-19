/**
 * usage-meter.ts — Sprint 7: Billing Metering
 *
 * Computes a MeteringPeriodSummary for a given tenant and date range by
 * aggregating TaskExecutionRecord rows.  The summary separates the AgentFarm
 * per-task platform fee ($0.10 per successful task) from underlying LLM
 * inference costs.
 */

import type { PrismaClient } from '@prisma/client';
import {
    PER_TASK_PLATFORM_FEE_USD,
    type MeteringPeriodSummary,
} from '@agentfarm/shared-types';

export type { MeteringPeriodSummary };

/**
 * Compute the metering period summary for a tenant.
 *
 * @param prisma       - Prisma client instance
 * @param tenantId     - Target tenant
 * @param periodStart  - Inclusive period start (UTC Date)
 * @param periodEnd    - Inclusive period end (UTC Date)
 */
export async function computeMeteringPeriodSummary(
    prisma: PrismaClient,
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
    botId?: string,
): Promise<MeteringPeriodSummary> {
    const baseWhere = botId
        ? { tenantId, botId, executedAt: { gte: periodStart, lte: periodEnd } }
        : { tenantId, executedAt: { gte: periodStart, lte: periodEnd } };

    // Aggregate all tasks in the period
    const [allResult, successResult] = await Promise.all([
        (prisma.taskExecutionRecord as unknown as {
            aggregate: (args: Record<string, unknown>) => Promise<{
                _count: { id: number };
                _sum: { estimatedCostUsd: number | null; platformFeeUsd: number | null };
            }>;
        }).aggregate({
            where: baseWhere,
            _count: { id: true },
            _sum: { estimatedCostUsd: true, platformFeeUsd: true },
        }),

        // Count only successful tasks for billable task count
        (prisma.taskExecutionRecord as unknown as {
            count: (args: Record<string, unknown>) => Promise<number>;
        }).count({
            where: { ...baseWhere, outcome: 'success' },
        }),
    ]);

    const taskCount = allResult._count.id;
    const llmCostUsd = allResult._sum.estimatedCostUsd ?? 0;

    // Use persisted platformFeeUsd sum when available; fall back to deriving
    // from successful task count (covers rows written before this sprint).
    const persistedPlatformFee = allResult._sum.platformFeeUsd;
    const platformFeeUsd =
        persistedPlatformFee != null
            ? persistedPlatformFee
            : successResult * PER_TASK_PLATFORM_FEE_USD;

    return {
        tenantId,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        taskCount,
        billableTaskCount: successResult,
        platformFeeUsd: Math.round(platformFeeUsd * 100) / 100,
        llmCostUsd: Math.round(llmCostUsd * 10_000) / 10_000,
        totalChargeUsd: Math.round((platformFeeUsd + llmCostUsd) * 10_000) / 10_000,
    };
}
