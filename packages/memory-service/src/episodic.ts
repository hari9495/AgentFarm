// ============================================================================
// EPISODIC MEMORY
//
// Write and search AgentLongTermMemory (pgvector-backed episodic memory).
//
// Two variants:
//   - embed path  : generates an Azure OpenAI vector, stores it, uses
//                   cosine similarity (<=> operator) for recall.
//   - no-embed path : falls back to a plain SQL ILIKE text search when no
//                     embedding key is configured.
// ============================================================================

import type { PrismaClient } from '@prisma/client';
import type {
    EpisodicWriteRequest,
    EpisodicSearchRequest,
    EpisodicSearchResult,
    EpisodicMemoryRecord,
} from '@agentfarm/shared-types';
import type { EmbedFn } from './embed.js';

// ---------------------------------------------------------------------------
// Write — with embedding
// ---------------------------------------------------------------------------

/**
 * Persist an episodic memory record with a pgvector embedding.
 * Upserts on (tenantId, pattern) so repeated observations increment observedCount.
 */
export async function writeEpisodicMemory(
    request:    EpisodicWriteRequest,
    embedFn:    EmbedFn,
    prisma:     PrismaClient,
    deployment: string,
): Promise<void> {
    const vector = await embedFn(request.summary);
    const vectorStr = `[${vector.join(',')}]`;

    // Prisma doesn't support pgvector natively — use $executeRaw
    await prisma.$executeRaw`
        INSERT INTO "AgentLongTermMemory"
            ("id", "tenantId", "botId", "workspaceId", "pattern", "summary",
             "confidence", "observedCount", "lastSeen", "createdAt",
             "embeddingModel", "embedding")
        VALUES (
            gen_random_uuid()::text,
            ${request.tenantId},
            ${request.botId},
            ${request.workspaceId},
            ${request.pattern},
            ${request.summary},
            ${request.confidence},
            1,
            NOW(),
            NOW(),
            ${deployment},
            ${vectorStr}::vector
        )
        ON CONFLICT ("tenantId", "pattern") DO UPDATE SET
            "summary"        = EXCLUDED."summary",
            "confidence"     = GREATEST("AgentLongTermMemory"."confidence", EXCLUDED."confidence"),
            "observedCount"  = "AgentLongTermMemory"."observedCount" + 1,
            "lastSeen"       = NOW(),
            "embeddingModel" = EXCLUDED."embeddingModel",
            "embedding"      = EXCLUDED."embedding"
    `;
}

// ---------------------------------------------------------------------------
// Write — no embedding (text only, upsert)
// ---------------------------------------------------------------------------

export async function writeEpisodicMemoryNoEmbed(
    request: EpisodicWriteRequest,
    prisma:  PrismaClient,
): Promise<void> {
    await prisma.$executeRaw`
        INSERT INTO "AgentLongTermMemory"
            ("id", "tenantId", "botId", "workspaceId", "pattern", "summary",
             "confidence", "observedCount", "lastSeen", "createdAt")
        VALUES (
            gen_random_uuid()::text,
            ${request.tenantId},
            ${request.botId},
            ${request.workspaceId},
            ${request.pattern},
            ${request.summary},
            ${request.confidence},
            1,
            NOW(),
            NOW()
        )
        ON CONFLICT ("tenantId", "pattern") DO UPDATE SET
            "summary"       = EXCLUDED."summary",
            "confidence"    = GREATEST("AgentLongTermMemory"."confidence", EXCLUDED."confidence"),
            "observedCount" = "AgentLongTermMemory"."observedCount" + 1,
            "lastSeen"      = NOW()
    `;
}

// ---------------------------------------------------------------------------
// Search — with embedding (cosine similarity via pgvector <=>)
// ---------------------------------------------------------------------------

interface RawEpisodicRow {
    id:             string;
    tenantId:       string;
    botId:          string | null;
    workspaceId:    string;
    pattern:        string;
    summary:        string | null;
    embeddingModel: string | null;
    confidence:     number;
    observedCount:  number;
    lastSeen:       Date;
    createdAt:      Date;
    similarity:     number;
}

export async function searchEpisodicMemory(
    request: EpisodicSearchRequest,
    embedFn: EmbedFn,
    prisma:  PrismaClient,
): Promise<EpisodicSearchResult[]> {
    const vector = await embedFn(request.queryText);
    const vectorStr  = `[${vector.join(',')}]`;
    const topK       = request.topK       ?? 5;
    const minSim     = request.minSimilarity ?? 0.7;

    const rows = await prisma.$queryRaw<RawEpisodicRow[]>`
        SELECT
            id, "tenantId", "botId", "workspaceId", pattern, summary,
            "embeddingModel", confidence, "observedCount", "lastSeen", "createdAt",
            1 - (embedding <=> ${vectorStr}::vector) AS similarity
        FROM "AgentLongTermMemory"
        WHERE "tenantId" = ${request.tenantId}
          AND "botId"    = ${request.botId}
          AND "workspaceId" = ${request.workspaceId}
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
// Search — no embedding (ILIKE text fallback)
// ---------------------------------------------------------------------------

export async function searchEpisodicMemoryNoEmbed(
    request: EpisodicSearchRequest,
    prisma:  PrismaClient,
): Promise<EpisodicSearchResult[]> {
    const topK  = request.topK ?? 5;
    const query = `%${request.queryText.slice(0, 200)}%`;

    const rows = await prisma.$queryRaw<RawEpisodicRow[]>`
        SELECT
            id, "tenantId", "botId", "workspaceId", pattern, summary,
            "embeddingModel", confidence, "observedCount", "lastSeen", "createdAt",
            0.5::float AS similarity
        FROM "AgentLongTermMemory"
        WHERE "tenantId"    = ${request.tenantId}
          AND "botId"       = ${request.botId}
          AND "workspaceId" = ${request.workspaceId}
          AND (
              summary ILIKE ${query}
              OR pattern ILIKE ${query}
          )
        ORDER BY "lastSeen" DESC
        LIMIT ${topK}
    `;

    return rows.map((row) => ({
        memory:     rowToRecord(row),
        similarity: 0.5,   // sentinel: text match, not vector match
    }));
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

function rowToRecord(row: RawEpisodicRow): EpisodicMemoryRecord {
    return {
        id:             row.id,
        tenantId:       row.tenantId,
        botId:          row.botId ?? '',
        workspaceId:    row.workspaceId,
        pattern:        row.pattern,
        summary:        row.summary ?? '',
        embeddingModel: row.embeddingModel ?? '',
        confidence:     Number(row.confidence),
        observedCount:  Number(row.observedCount),
        lastSeen:       row.lastSeen instanceof Date ? row.lastSeen.toISOString() : String(row.lastSeen),
        createdAt:      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    };
}
