// ============================================================================
// SEMANTIC SEARCH HOOK
// Sprint 9 — Semantic Memory / Company Knowledge RAG (2026-05-22)
//
// Called at task start to retrieve the most relevant company knowledge
// chunks for the current task description.  Uses pgvector cosine distance
// against AgentKnowledgeBase.
//
// Scoping logic:
//   - Always includes tenant-wide chunks (botId IS NULL).
//   - If request.botId is provided, also includes chunks for that bot.
// ============================================================================

import type { EmbedFn } from './embedding-service.js';
import type { SemanticSearchRequest, SemanticSearchResult } from '@agentfarm/shared-types';

type PrismaLike = {
    $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

type SemanticRow = {
    id: string;
    tenantId: string;
    botId: string | null;
    content: string;
    sourceUrl: string | null;
    sourceType: string;
    embeddingModel: string | null;
    createdAt: Date;
    updatedAt: Date;
    similarity: number;
};

const DEFAULT_TOP_K = 5;
const DEFAULT_MIN_SIMILARITY = 0.70;

/**
 * Retrieve the top-K most relevant knowledge chunks for a query.
 *
 * @param request   Search parameters (tenantId, botId?, queryText, topK?, minSimilarity?)
 * @param embed     Embedding function
 * @param prisma    Prisma client with $queryRaw
 * @returns         Up to topK SemanticSearchResult sorted by descending similarity
 */
export async function searchSemanticMemory(
    request: SemanticSearchRequest,
    embed: EmbedFn,
    prisma: PrismaLike,
): Promise<SemanticSearchResult[]> {
    const { tenantId, botId, queryText } = request;
    const topK = request.topK ?? DEFAULT_TOP_K;
    const minSimilarity = request.minSimilarity ?? DEFAULT_MIN_SIMILARITY;

    const queryVector = await embed(queryText);
    const vectorLiteral = `[${queryVector.join(',')}]`;

    // Include tenant-wide chunks (botId IS NULL) and bot-scoped chunks if botId given.
    const rows = botId
        ? await prisma.$queryRaw<SemanticRow[]>`
        SELECT
          id, "tenantId", "botId",
          content, "sourceUrl", "sourceType", "embeddingModel",
          "createdAt", "updatedAt",
          CAST(1 - (embedding <=> ${vectorLiteral}::vector) AS FLOAT8) AS similarity
        FROM "AgentKnowledgeBase"
        WHERE
          "tenantId" = ${tenantId}
          AND ("botId" IS NULL OR "botId" = ${botId})
          AND embedding IS NOT NULL
          AND CAST(1 - (embedding <=> ${vectorLiteral}::vector) AS FLOAT8) >= ${minSimilarity}
        ORDER BY similarity DESC
        LIMIT ${topK}
      `
        : await prisma.$queryRaw<SemanticRow[]>`
        SELECT
          id, "tenantId", "botId",
          content, "sourceUrl", "sourceType", "embeddingModel",
          "createdAt", "updatedAt",
          CAST(1 - (embedding <=> ${vectorLiteral}::vector) AS FLOAT8) AS similarity
        FROM "AgentKnowledgeBase"
        WHERE
          "tenantId" = ${tenantId}
          AND "botId" IS NULL
          AND embedding IS NOT NULL
          AND CAST(1 - (embedding <=> ${vectorLiteral}::vector) AS FLOAT8) >= ${minSimilarity}
        ORDER BY similarity DESC
        LIMIT ${topK}
      `;

    return rows.map((row) => ({
        memory: {
            id: row.id,
            tenantId: row.tenantId,
            botId: row.botId,
            content: row.content,
            sourceUrl: row.sourceUrl,
            sourceType: row.sourceType,
            embeddingModel: row.embeddingModel,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
        },
        similarity: row.similarity,
    }));
}
