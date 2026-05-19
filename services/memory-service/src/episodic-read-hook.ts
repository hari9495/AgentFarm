// ============================================================================
// EPISODIC READ HOOK
// Sprint 4 — pgvector Episodic Memory (2026-05-15)
//
// Called at task start. Embeds the incoming task description and runs a
// cosine-similarity search against stored AgentLongTermMemory vectors.
// Returns the top-K most relevant past memories above the similarity threshold.
// ============================================================================

import type { EmbedFn } from './embedding-service.js';
import type { EpisodicSearchRequest, EpisodicSearchResult } from '@agentfarm/shared-types';

type PrismaLike = {
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
    similarity: number;
};

const DEFAULT_TOP_K = 5;
const DEFAULT_MIN_SIMILARITY = 0.7;

/**
 * Search for semantically similar past memories at task start.
 *
 * Uses pgvector's cosine distance operator (`<=>`) via raw SQL.
 * Only rows with a non-NULL embedding are considered.
 *
 * @param request   Search request (tenantId, botId, workspaceId, queryText, topK, minSimilarity)
 * @param embed     Embedding function (from createEmbedFn or a test stub)
 * @param prisma    Prisma client with $queryRaw
 * @returns         Up to topK EpisodicSearchResult sorted by descending similarity
 */
export async function searchEpisodicMemory(
    request: EpisodicSearchRequest,
    embed: EmbedFn,
    prisma: PrismaLike
): Promise<EpisodicSearchResult[]> {
    const { tenantId, botId, workspaceId, queryText } = request;
    const topK = request.topK ?? DEFAULT_TOP_K;
    const minSimilarity = request.minSimilarity ?? DEFAULT_MIN_SIMILARITY;

    const queryVector = await embed(queryText);
    const vectorLiteral = `[${queryVector.join(',')}]`;

    // cosine similarity = 1 - cosine_distance
    const rows = await prisma.$queryRaw<EpisodicRow[]>`
    SELECT
      id, "tenantId", "workspaceId", "botId",
      pattern, summary, "embeddingModel",
      confidence, "observedCount", "lastSeen", "createdAt",
      CAST(1 - (embedding <=> ${vectorLiteral}::vector) AS FLOAT8) AS similarity
    FROM "AgentLongTermMemory"
    WHERE
      "tenantId"   = ${tenantId}
      AND "botId"      = ${botId}
      AND "workspaceId" = ${workspaceId}
      AND embedding IS NOT NULL
      AND CAST(1 - (embedding <=> ${vectorLiteral}::vector) AS FLOAT8) >= ${minSimilarity}
    ORDER BY similarity DESC
    LIMIT ${topK}
  `;

    return rows.map((row) => ({
        memory: {
            id: row.id,
            tenantId: row.tenantId,
            botId: row.botId ?? botId,
            workspaceId: row.workspaceId,
            pattern: row.pattern,
            summary: row.summary ?? '',
            embeddingModel: row.embeddingModel ?? '',
            confidence: row.confidence,
            observedCount: row.observedCount,
            lastSeen: row.lastSeen.toISOString(),
            createdAt: row.createdAt.toISOString(),
        },
        similarity: row.similarity,
    }));
}
