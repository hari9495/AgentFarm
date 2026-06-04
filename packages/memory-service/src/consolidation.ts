// ============================================================================
// LESSON CONSOLIDATION
//
// Implements FluxMem Phase 1: aggregate scattered per-rejection lessons of the
// same (agent, category, workspace) into a single high-confidence pattern.
//
// Why: Without consolidation, 50 rejection lessons for "ba:lesson:scope:ws-1:*"
// all get retrieved and injected into the LLM prompt — diluting signal, bloating
// tokens, and burying the most authoritative lessons under noise.
//
// After consolidation, the RAG retriever finds one entry per (agent, category)
// with a ranked summary, elevated confidence, and a combined observedCount.
//
// Consolidated pattern key format:
//   <agent>:lesson:<category>:<workspaceId>:consolidated
// e.g. ba:lesson:scope:ws_abc123:consolidated
//
// The existing WHERE pattern LIKE '%:lesson:%' filters in these keys, so all
// 15 RAG retrievers pick up consolidated patterns automatically — no changes
// needed in the retrieval layer.
// ============================================================================

import type { PrismaClient } from '@prisma/client';

export const CONSOLIDATION_THRESHOLD = 5;

// Matches <agent>:lesson:<category>:<workspaceId>[:<lessonId>]
// Excludes already-consolidated entries via negative lookahead on suffix.
const LESSON_KEY_RE = /^([a-z_]+):lesson:([a-z_]+):([^:]+)(?::(?!consolidated$)[^:]+)?$/;

interface LessonRow {
    id: string;
    tenantId: string;
    workspaceId: string;
    pattern: string;
    summary: string | null;
    confidence: number;
    observedCount: number;
    lastSeen: Date;
}

interface GroupKey {
    tenantId: string;
    workspaceId: string;
    agentPrefix: string;
    category: string;
}

export interface ConsolidationResult {
    groupsScanned: number;
    groupsConsolidated: number;
    patternsWritten: number;
}

export function parseLessonPattern(pattern: string): { agentPrefix: string; category: string } | null {
    const m = pattern.match(LESSON_KEY_RE);
    if (!m) return null;
    return { agentPrefix: m[1]!, category: m[2]! };
}

export function buildConsolidatedSummary(category: string, lessons: LessonRow[]): string {
    const count = lessons.length;

    const seen = new Set<string>();
    const summaries: string[] = [];

    for (const l of lessons) {
        const raw = (l.summary ?? '')
            .replace(/^\[[^\]]+\]\s*/, '')
            .replace(/^Consolidated \(\d+ instances\):\s*\d+\.\s*/, '')
            .trim();
        const dedupeKey = raw.slice(0, 50);
        if (raw.length > 15 && !seen.has(dedupeKey)) {
            seen.add(dedupeKey);
            summaries.push(raw);
        }
        if (summaries.length >= 4) break;
    }

    if (summaries.length === 0) {
        return `[${category}] Consolidated pattern (${count} instances)`;
    }

    const points = summaries.map((s, i) => `${i + 1}. ${s}`).join(' ');
    return `[${category}] Consolidated (${count} instances): ${points}`;
}

export function computeConsolidatedConfidence(lessons: LessonRow[]): number {
    const avg = lessons.reduce((sum, l) => sum + l.confidence, 0) / lessons.length;
    return Math.min(0.95, avg + 0.05 * Math.log(lessons.length + 1));
}

/**
 * Scan AgentLongTermMemory for lesson groups that have accumulated enough
 * individual entries to warrant consolidation, then write (or update) a single
 * `:consolidated` pattern per group.
 *
 * Safe to run repeatedly — the upsert is idempotent.
 *
 * @param prisma  Prisma client (injected for testability)
 * @param options Optional filters and threshold override
 */
export async function consolidateLessons(
    prisma: PrismaClient,
    options?: {
        tenantId?: string;
        workspaceId?: string;
        threshold?: number;
    },
): Promise<ConsolidationResult> {
    const threshold = options?.threshold ?? CONSOLIDATION_THRESHOLD;

    // Fetch all non-consolidated lesson rows. The DB WHERE keeps the result set
    // small; in-process filtering handles optional tenantId/workspaceId to avoid
    // building dynamic SQL.
    const rows = await (prisma.$queryRaw as (...args: unknown[]) => Promise<LessonRow[]>)`
        SELECT id, "tenantId", "workspaceId", pattern, summary,
               confidence, "observedCount", "lastSeen"
        FROM "AgentLongTermMemory"
        WHERE pattern LIKE '%:lesson:%'
          AND pattern NOT LIKE '%:consolidated'
    `;

    const filteredRows = rows.filter((r) => {
        if (options?.tenantId && r.tenantId !== options.tenantId) return false;
        if (options?.workspaceId && r.workspaceId !== options.workspaceId) return false;
        return true;
    });

    // Group by (tenantId, workspaceId, agentPrefix, category)
    const groups = new Map<string, { key: GroupKey; rows: LessonRow[] }>();

    for (const row of filteredRows) {
        const parsed = parseLessonPattern(row.pattern);
        if (!parsed) continue;

        const { agentPrefix, category } = parsed;
        const gKey = `${row.tenantId}::${row.workspaceId}::${agentPrefix}::${category}`;

        if (!groups.has(gKey)) {
            groups.set(gKey, {
                key: { tenantId: row.tenantId, workspaceId: row.workspaceId, agentPrefix, category },
                rows: [],
            });
        }
        groups.get(gKey)!.rows.push(row);
    }

    let groupsConsolidated = 0;
    let patternsWritten = 0;

    for (const { key, rows: lessonRows } of groups.values()) {
        if (lessonRows.length < threshold) continue;

        // Highest confidence first, then most recently seen — drives summary ranking
        lessonRows.sort((a, b) => {
            const cd = b.confidence - a.confidence;
            if (Math.abs(cd) > 0.01) return cd;
            return b.lastSeen.getTime() - a.lastSeen.getTime();
        });

        const summary = buildConsolidatedSummary(key.category, lessonRows);
        const confidence = computeConsolidatedConfidence(lessonRows);
        const totalObservedCount = lessonRows.reduce((s, r) => s + r.observedCount, 0);
        const consolidatedPattern = `${key.agentPrefix}:lesson:${key.category}:${key.workspaceId}:consolidated`;

        await (prisma.$executeRaw as (...args: unknown[]) => Promise<number>)`
            INSERT INTO "AgentLongTermMemory"
                ("id", "tenantId", "workspaceId", "pattern", "summary",
                 "confidence", "observedCount", "lastSeen", "createdAt")
            VALUES (
                gen_random_uuid()::text,
                ${key.tenantId},
                ${key.workspaceId},
                ${consolidatedPattern},
                ${summary},
                ${confidence},
                ${totalObservedCount},
                NOW(),
                NOW()
            )
            ON CONFLICT ("tenantId", "pattern") DO UPDATE SET
                "summary"       = EXCLUDED."summary",
                "confidence"    = EXCLUDED."confidence",
                "observedCount" = EXCLUDED."observedCount",
                "lastSeen"      = NOW()
        `;

        groupsConsolidated++;
        patternsWritten++;
    }

    return { groupsScanned: groups.size, groupsConsolidated, patternsWritten };
}
