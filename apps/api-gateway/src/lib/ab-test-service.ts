/**
 * Phase 21 — A/B Test Service
 *
 * Provides three operations:
 *   assignVariant     — deterministically assign an incoming task to variant A or B
 *   getAbTestResults  — aggregate QualitySignalLog scores per variant
 *   concludeAbTest    — mark test as concluded with an optional note
 *
 * Notes on available data:
 *   QualitySignalLog only stores `score`, `signalType`, and `source`.
 *   There are no `outcome` or `latencyMs` columns, so successCount/failureCount
 *   and avgLatencyMs cannot be derived and are returned as null.
 */

import type { PrismaClient } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AbTestRecord = {
    id: string;
    tenantId: string;
    botId: string;
    name: string;
    versionAId: string;
    versionBId: string;
    trafficSplit: number;
    status: string;
    conclusionNote: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export type AbTestAssignmentRecord = {
    id: string;
    abTestId: string;
    tenantId: string;
    taskId: string;
    versionId: string;
    variant: string;
    createdAt: Date;
};

export type VariantStats = {
    variant: 'A' | 'B';
    versionId: string;
    assignmentCount: number;
    avgScore: number | null;
    successCount: null;   // QualitySignalLog has no outcome column
    failureCount: null;   // QualitySignalLog has no outcome column
    avgLatencyMs: null;   // QualitySignalLog has no latencyMs column
};

export type AbTestResults = {
    abTestId: string;
    name: string;
    status: string;
    a: VariantStats;
    b: VariantStats;
};

// ─────────────────────────────────────────────────────────────────────────────
// assignVariant
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assign a task to variant A or B based on the test's trafficSplit.
 * Uses a deterministic modulo hash derived from the abTestId + taskId so that
 * repeated calls for the same task always produce the same assignment.
 *
 * Returns null if the abTest does not exist, belongs to a different tenant,
 * or is not in "active" status.
 *
 * Returns the existing assignment if the taskId was already assigned.
 */
export async function assignVariant(
    db: PrismaClient,
    abTestId: string,
    tenantId: string,
    taskId: string,
): Promise<AbTestAssignmentRecord | null> {
    // Check for an existing assignment first (idempotent)
    const existing = await db.abTestAssignment.findUnique({ where: { taskId } });
    if (existing) {
        return existing as AbTestAssignmentRecord;
    }

    // Validate the test
    const abTest = await db.abTest.findUnique({ where: { id: abTestId } });
    if (!abTest || abTest.tenantId !== tenantId || abTest.status !== 'active') {
        return null;
    }

    // Deterministic variant selection: hash the composite key and compare to split
    const raw = `${abTestId}:${taskId}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
        hash = (hash * 31 + raw.charCodeAt(i)) >>> 0; // keep 32-bit unsigned
    }
    // Map hash to [0, 1) and compare to trafficSplit (fraction routed to B)
    const normalized = hash / 0xffffffff;
    const variant: 'A' | 'B' = normalized < abTest.trafficSplit ? 'B' : 'A';
    const versionId = variant === 'B' ? abTest.versionBId : abTest.versionAId;

    const assignment = await db.abTestAssignment.create({
        data: {
            abTestId,
            tenantId,
            taskId,
            versionId,
            variant,
        },
    });

    return assignment as AbTestAssignmentRecord;
}

// ─────────────────────────────────────────────────────────────────────────────
// getAbTestResults
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aggregate per-variant assignment counts and mean QualitySignalLog scores.
 *
 * Returns null if the test does not exist or belongs to a different tenant.
 */
export async function getAbTestResults(
    db: PrismaClient,
    abTestId: string,
    tenantId: string,
): Promise<AbTestResults | null> {
    const abTest = await db.abTest.findUnique({ where: { id: abTestId } });
    if (!abTest || abTest.tenantId !== tenantId) return null;

    // All assignments for this test
    const assignments = await db.abTestAssignment.findMany({
        where: { abTestId },
        select: { taskId: true, variant: true, versionId: true },
    }) as Array<{ taskId: string; variant: string; versionId: string }>;

    const aAssignments = assignments.filter((a) => a.variant === 'A');
    const bAssignments = assignments.filter((a) => a.variant === 'B');

    const aTaskIds = aAssignments.map((a) => a.taskId);
    const bTaskIds = bAssignments.map((a) => a.taskId);

    // Fetch quality scores for each variant's tasks
    const [aSignals, bSignals] = await Promise.all([
        aTaskIds.length > 0
            ? db.qualitySignalLog.findMany({
                where: { tenantId, taskId: { in: aTaskIds } },
                select: { score: true },
            }) as Promise<Array<{ score: number | null }>>
            : Promise.resolve([]),
        bTaskIds.length > 0
            ? db.qualitySignalLog.findMany({
                where: { tenantId, taskId: { in: bTaskIds } },
                select: { score: true },
            }) as Promise<Array<{ score: number | null }>>
            : Promise.resolve([]),
    ]);

    const avgScore = (signals: Array<{ score: number | null }>): number | null => {
        const scored = signals.filter((s) => s.score !== null);
        if (scored.length === 0) return null;
        return scored.reduce((acc, s) => acc + (s.score ?? 0), 0) / scored.length;
    };

    return {
        abTestId,
        name: abTest.name,
        status: abTest.status,
        a: {
            variant: 'A',
            versionId: abTest.versionAId,
            assignmentCount: aAssignments.length,
            avgScore: avgScore(aSignals),
            successCount: null,
            failureCount: null,
            avgLatencyMs: null,
        },
        b: {
            variant: 'B',
            versionId: abTest.versionBId,
            assignmentCount: bAssignments.length,
            avgScore: avgScore(bSignals),
            successCount: null,
            failureCount: null,
            avgLatencyMs: null,
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// concludeAbTest
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mark an A/B test as concluded with an optional conclusion note.
 *
 * Returns null if the test does not exist or belongs to a different tenant.
 * Returns the updated AbTest record on success.
 */
export async function concludeAbTest(
    db: PrismaClient,
    abTestId: string,
    tenantId: string,
    conclusionNote?: string,
): Promise<AbTestRecord | null> {
    const abTest = await db.abTest.findUnique({ where: { id: abTestId } });
    if (!abTest || abTest.tenantId !== tenantId) return null;

    const updated = await db.abTest.update({
        where: { id: abTestId },
        data: {
            status: 'concluded',
            ...(conclusionNote !== undefined ? { conclusionNote } : {}),
        },
    });

    return updated as AbTestRecord;
}
