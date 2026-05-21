// =============================================================================
// EPISODIC MEMORY TEXT FALLBACK
// Sprint 14 — Developer Agent Gap: durable episodic memory without embeddings
//
// When EPISODIC_EMBEDDING_ENDPOINT / EPISODIC_EMBEDDING_API_KEY are not
// configured, episodicEmbed is null.  Without this fallback the agent silently
// drops every task memory and starts each session with zero context.
//
// This module provides text-search-based write/read that persists to
// AgentLongTermMemory with a NULL vector.  Recall uses recency + optional
// ILIKE text matching.  Similarity score is always 0.5 (fixed, non-semantic).
// =============================================================================

import type { EpisodicWriteRequest, EpisodicSearchRequest, EpisodicSearchResult, EpisodicMemoryRecord } from '@agentfarm/shared-types';

type PrismaLike = {
    $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
    $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

type EpisodicRow = {
    id: string;
    tenantId: string;
    workspaceId: string;
    botId: string | null;
    pattern: string;
    summary: string | null;
    embeddingModel: string | null;
    confidence: number;
    observedCount: number;
    lastSeen: Date;
    createdAt: Date;
};

const TEXT_FALLBACK_MODEL = 'none:text-search-fallback';
const DEFAULT_TOP_K = 5;
// Fixed similarity score reported when using text fallback (no real cosine computed)
const TEXT_FALLBACK_SIMILARITY = 0.5;

/**
 * Write an episodic memory record WITHOUT a vector embedding.
 *
 * The embedding column is left NULL so the row is excluded from cosine-distance
 * queries but is still retrievable via searchEpisodicMemoryNoEmbed.
 *
 * Upserts on (tenantId, pattern): increments observedCount on repeat.
 */
export async function writeEpisodicMemoryNoEmbed(
    request: EpisodicWriteRequest,
    prisma: PrismaLike,
): Promise<EpisodicMemoryRecord> {
    const { tenantId, botId, workspaceId, summary, pattern, confidence, taskId } = request;
    const now = new Date();

    const rows = await prisma.$queryRaw<EpisodicRow[]>`
    INSERT INTO "AgentLongTermMemory" (
      "tenantId", "workspaceId", "botId",
      pattern, summary, "embeddingModel",
      confidence, "observedCount", "lastSeen",
      "createdAt", "taskId"
    )
    VALUES (
      ${tenantId}, ${workspaceId}, ${botId},
      ${pattern}, ${summary}, ${TEXT_FALLBACK_MODEL},
      ${confidence}, 1, ${now},
      ${now}, ${taskId}
    )
    ON CONFLICT ("tenantId", pattern)
    DO UPDATE SET
      summary       = EXCLUDED.summary,
      confidence    = EXCLUDED.confidence,
      "observedCount" = "AgentLongTermMemory"."observedCount" + 1,
      "lastSeen"    = EXCLUDED."lastSeen"
    RETURNING
      id, "tenantId", "workspaceId", "botId",
      pattern, summary, "embeddingModel",
      confidence, "observedCount", "lastSeen", "createdAt"
  `;

    const row = rows[0];
    if (!row) {
        throw new Error('[episodic-text-fallback] writeEpisodicMemoryNoEmbed: no row returned from upsert');
    }

    return {
        id: row.id,
        tenantId: row.tenantId,
        botId: row.botId ?? botId,
        workspaceId: row.workspaceId,
        pattern: row.pattern,
        summary: row.summary ?? '',
        embeddingModel: row.embeddingModel ?? TEXT_FALLBACK_MODEL,
        confidence: row.confidence,
        observedCount: row.observedCount,
        lastSeen: row.lastSeen.toISOString(),
        createdAt: row.createdAt.toISOString(),
    };
}

/**
 * Search episodic memories WITHOUT a vector embedding.
 *
 * Returns the most recently observed records, optionally filtered by a
 * case-insensitive text match on summary or pattern.
 *
 * Returns at most `request.topK` results (default 5) with a fixed
 * similarity score of 0.5.
 */
export async function searchEpisodicMemoryNoEmbed(
    request: EpisodicSearchRequest,
    prisma: PrismaLike,
): Promise<EpisodicSearchResult[]> {
    const { tenantId, botId, workspaceId, queryText } = request;
    const topK = request.topK ?? DEFAULT_TOP_K;

    // Build a keyword pattern from the query (take first 3 words, spaces → %)
    const keywordPattern = '%' + queryText.trim().slice(0, 100).replace(/\s+/g, '%') + '%';

    const rows = await prisma.$queryRaw<EpisodicRow[]>`
    SELECT
      id, "tenantId", "workspaceId", "botId",
      pattern, summary, "embeddingModel",
      confidence, "observedCount", "lastSeen", "createdAt"
    FROM "AgentLongTermMemory"
    WHERE
      "tenantId"    = ${tenantId}
      AND "botId"   = ${botId}
      AND "workspaceId" = ${workspaceId}
      AND (
        summary ILIKE ${keywordPattern}
        OR pattern ILIKE ${keywordPattern}
      )
    ORDER BY "lastSeen" DESC
    LIMIT ${topK}
  `;

    return rows.map(
        (row): EpisodicSearchResult => ({
            memory: {
                id: row.id,
                tenantId: row.tenantId,
                botId: row.botId ?? botId,
                workspaceId: row.workspaceId,
                pattern: row.pattern,
                summary: row.summary ?? '',
                embeddingModel: row.embeddingModel ?? TEXT_FALLBACK_MODEL,
                confidence: row.confidence,
                observedCount: row.observedCount,
                lastSeen: row.lastSeen.toISOString(),
                createdAt: row.createdAt.toISOString(),
            },
            similarity: TEXT_FALLBACK_SIMILARITY,
        }),
    );
}
