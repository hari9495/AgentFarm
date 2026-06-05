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
import { chunkText, type ChunkOptions } from './chunker.js';

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
// Chunked write
// ---------------------------------------------------------------------------

/**
 * Split `content` into overlapping paragraph-boundary chunks and persist each
 * chunk as a separate embedding row in AgentKnowledgeBase.
 *
 * This prevents the 8192-char silent truncation that the embeddings API
 * imposes when whole documents are stored as a single vector.
 *
 * @returns The number of chunks written.
 */
export async function writeSemanticMemoryChunked(
    request: SemanticWriteRequest,
    embedFn: EmbedFn,
    prisma: PrismaClient,
    deployment: string,
    chunkOptions?: ChunkOptions,
): Promise<{ chunkCount: number }> {
    const chunks = chunkText(request.content, chunkOptions);
    if (chunks.length === 0) return { chunkCount: 0 };

    const multiChunk = chunks.length > 1;
    await Promise.all(
        chunks.map((chunk, i) =>
            writeSemanticMemory(
                {
                    ...request,
                    content: chunk,
                    sourceUrl: multiChunk && request.sourceUrl
                        ? `${request.sourceUrl}#chunk-${i}`
                        : request.sourceUrl,
                },
                embedFn,
                prisma,
                deployment,
            ),
        ),
    );

    return { chunkCount: chunks.length };
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

// ---------------------------------------------------------------------------
// Re-ranking helpers
// ---------------------------------------------------------------------------

const RERANK_RECENCY_BOOST  = 0.05; // +5% for chunks ingested within 30 days
const RERANK_APPROVED_BOOST = 0.03; // +3% for approved-artifact sourceTypes
const RERANK_RECENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000; // 30 days

function rerankScore(row: RawSemanticRow, now: number): number {
    let score = Number(row.similarity);

    const age = now - (row.createdAt instanceof Date ? row.createdAt.getTime() : new Date(row.createdAt).getTime());
    if (age < RERANK_RECENCY_WINDOW_MS) score += RERANK_RECENCY_BOOST;

    if (row.sourceType.includes('approved')) score += RERANK_APPROVED_BOOST;

    return score;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Retrieve the most relevant knowledge chunks for the given query.
 * Results include tenant-wide chunks (botId IS NULL) and bot-scoped chunks.
 *
 * Re-ranking: fetches 3× topK candidates from the DB (capped at 50) and
 * applies lightweight score boosts for recency and approved sourceTypes
 * before slicing to the final topK. This improves result quality without
 * needing a cross-encoder inference call.
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
    // Fetch extra candidates so re-ranking has room to promote better results
    const fetchLimit = Math.min(topK * 3, 50);

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
        LIMIT ${fetchLimit}
    `;

    const now = Date.now();
    return rows
        .map((row: RawSemanticRow) => ({ row, score: rerankScore(row, now) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(({ row }) => ({
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
