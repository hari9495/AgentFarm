// ============================================================================
// SEMANTIC MEMORY
//
// Write and search AgentKnowledgeBase (pgvector-backed company knowledge RAG).
// Mirrors the episodic memory API shape for consistency.
// ============================================================================

import type { PrismaClient } from '@prisma/client';
import type {
    SemanticWriteRequest,
    SemanticSearchRequest,
    SemanticSearchResult,
    SemanticMemoryRecord,
} from '@agentfarm/shared-types';
import type { EmbedFn } from './embed.js';

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Persist a knowledge chunk with a pgvector embedding to AgentKnowledgeBase.
 * Idempotent: duplicate (tenantId, content) rows are inserted as new chunks
 * because the same content might be re-ingested at different times.
 */
export async function writeSemanticMemory(
    request:    SemanticWriteRequest,
    embedFn:    EmbedFn,
    prisma:     PrismaClient,
    deployment: string,
): Promise<void> {
    const vector    = await embedFn(request.content);
    const vectorStr = `[${vector.join(',')}]`;

    await prisma.$executeRaw`
        INSERT INTO "AgentKnowledgeBase"
            ("id", "tenantId", "botId", "content", "sourceUrl", "sourceType",
             "embeddingModel", "embedding", "createdAt", "updatedAt")
        VALUES (
            gen_random_uuid()::text,
            ${request.tenantId},
            ${request.botId ?? null},
            ${request.content},
            ${request.sourceUrl ?? null},
            ${request.sourceType},
            ${deployment},
            ${vectorStr}::vector,
            NOW(),
            NOW()
        )
    `;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

interface RawSemanticRow {
    id:             string;
    tenantId:       string;
    botId:          string | null;
    content:        string;
    sourceUrl:      string | null;
    sourceType:     string;
    embeddingModel: string | null;
    createdAt:      Date;
    updatedAt:      Date;
    similarity:     number;
}

/**
 * Retrieve the most relevant knowledge chunks for the given query.
 * Results include tenant-wide chunks (botId IS NULL) and bot-scoped chunks.
 */
export async function searchSemanticMemory(
    request: SemanticSearchRequest,
    embedFn: EmbedFn,
    prisma:  PrismaClient,
): Promise<SemanticSearchResult[]> {
    const vector    = await embedFn(request.queryText);
    const vectorStr = `[${vector.join(',')}]`;
    const topK      = request.topK         ?? 5;
    const minSim    = request.minSimilarity ?? 0.7;

    const rows = await prisma.$queryRaw<RawSemanticRow[]>`
        SELECT
            id, "tenantId", "botId", content, "sourceUrl", "sourceType",
            "embeddingModel", "createdAt", "updatedAt",
            1 - (embedding <=> ${vectorStr}::vector) AS similarity
        FROM "AgentKnowledgeBase"
        WHERE "tenantId" = ${request.tenantId}
          AND ("botId" IS NULL OR "botId" = ${request.botId ?? null})
          AND embedding IS NOT NULL
          AND 1 - (embedding <=> ${vectorStr}::vector) >= ${minSim}
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT ${topK}
    `;

    return rows.map((row) => ({
        memory:     rowToRecord(row),
        similarity: Number(row.similarity),
    }));
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

function rowToRecord(row: RawSemanticRow): SemanticMemoryRecord {  // explicit — no implicit any
    return {
        id:             row.id,
        tenantId:       row.tenantId,
        botId:          row.botId,
        content:        row.content,
        sourceUrl:      row.sourceUrl,
        sourceType:     row.sourceType,
        embeddingModel: row.embeddingModel,
        createdAt:      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
        updatedAt:      row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    };
}
