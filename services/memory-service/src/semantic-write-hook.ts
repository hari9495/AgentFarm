// ============================================================================
// SEMANTIC WRITE HOOK
// Sprint 9 — Semantic Memory / Company Knowledge RAG (2026-05-22)
//
// Ingest a knowledge chunk (document passage, API response, manual text)
// into AgentKnowledgeBase with its embedding so it can be retrieved at
// task time via cosine similarity search.
//
// Unlike the episodic write hook this does NOT upsert — each call produces
// a new chunk row.  Callers are responsible for chunking larger documents
// before calling this function.
// ============================================================================

import { randomUUID } from 'node:crypto';
import type { EmbedFn } from './embedding-service.js';
import type { SemanticMemoryRecord, SemanticWriteRequest } from '@agentfarm/shared-types';

type PrismaLike = {
    $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

/**
 * Embed a knowledge chunk and persist it to AgentKnowledgeBase.
 *
 * @param request     Chunk to ingest (tenantId, botId?, content, sourceUrl?, sourceType)
 * @param embed       Embedding function (from createEmbedFn or a test stub)
 * @param prisma      Prisma client with $queryRaw
 * @param deployment  Embedding model deployment name recorded with the row
 * @returns           The persisted SemanticMemoryRecord
 */
export async function writeSemanticMemory(
    request: SemanticWriteRequest,
    embed: EmbedFn,
    prisma: PrismaLike,
    deployment: string,
): Promise<SemanticMemoryRecord> {
    const { tenantId, botId = null, content, sourceUrl = null, sourceType } = request;

    const vector = await embed(content);
    const vectorLiteral = `[${vector.join(',')}]`;
    const id = randomUUID();
    const now = new Date();

    const rows = await prisma.$queryRaw<Array<{
        id: string;
        tenantId: string;
        botId: string | null;
        content: string;
        sourceUrl: string | null;
        sourceType: string;
        embeddingModel: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>>`
    INSERT INTO "AgentKnowledgeBase" (
      id, "tenantId", "botId",
      content, "sourceUrl", "sourceType", "embeddingModel",
      embedding, "createdAt", "updatedAt"
    ) VALUES (
      ${id}, ${tenantId}, ${botId},
      ${content}, ${sourceUrl}, ${sourceType}, ${deployment},
      ${vectorLiteral}::vector, ${now}, ${now}
    )
    RETURNING
      id, "tenantId", "botId",
      content, "sourceUrl", "sourceType", "embeddingModel",
      "createdAt", "updatedAt"
  `;

    const row = rows[0];
    if (!row) {
        throw new Error('writeSemanticMemory: insert returned no rows');
    }

    return {
        id: row.id,
        tenantId: row.tenantId,
        botId: row.botId,
        content: row.content,
        sourceUrl: row.sourceUrl,
        sourceType: row.sourceType,
        embeddingModel: row.embeddingModel,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}
