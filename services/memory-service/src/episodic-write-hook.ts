// ============================================================================
// EPISODIC WRITE HOOK
// Sprint 4 — pgvector Episodic Memory (2026-05-15)
//
// Called after task completion. Embeds the task summary and upserts the
// record into AgentLongTermMemory with the vector stored via $executeRaw.
// ============================================================================

import type { EmbedFn } from './embedding-service.js';
import type { EpisodicMemoryRecord, EpisodicWriteRequest } from '@agentfarm/shared-types';

type PrismaLike = {
    $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
    $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

/**
 * Write an episodic memory after a task closes.
 *
 * - Embeds `request.summary` via the provided embed function.
 * - Upserts into AgentLongTermMemory on (tenantId, pattern):
 *   - INSERT on first observation
 *   - UPDATE embedding + confidence + observedCount on repeat
 *
 * @param request   Write request (tenantId, botId, workspaceId, summary, pattern, confidence)
 * @param embed     Embedding function (from createEmbedFn or a test stub)
 * @param prisma    Prisma client with $executeRaw / $queryRaw
 * @param deployment  Embedding model deployment name (recorded as embeddingModel)
 * @returns         The persisted EpisodicMemoryRecord
 */
export async function writeEpisodicMemory(
    request: EpisodicWriteRequest,
    embed: EmbedFn,
    prisma: PrismaLike,
    deployment: string
): Promise<EpisodicMemoryRecord> {
    const { tenantId, botId, workspaceId, summary, pattern, confidence } = request;

    const vector = await embed(summary);
    const vectorLiteral = `[${vector.join(',')}]`;
    const now = new Date();

    // Upsert: if (tenantId, pattern) exists, update; otherwise insert.
    const rows = await prisma.$queryRaw<Array<{
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
    }>>`
    INSERT INTO "AgentLongTermMemory" (
      "tenantId", "workspaceId", "botId",
      pattern, summary, "embeddingModel",
      confidence, "observedCount", "lastSeen",
      embedding
    ) VALUES (
      ${tenantId}, ${workspaceId}, ${botId},
      ${pattern}, ${summary}, ${deployment},
      ${confidence}, 1, ${now},
      ${vectorLiteral}::vector
    )
    ON CONFLICT ("tenantId", pattern) DO UPDATE SET
      "botId"          = EXCLUDED."botId",
      summary          = EXCLUDED.summary,
      "embeddingModel" = EXCLUDED."embeddingModel",
      confidence       = GREATEST("AgentLongTermMemory".confidence, EXCLUDED.confidence),
      "observedCount"  = "AgentLongTermMemory"."observedCount" + 1,
      "lastSeen"       = EXCLUDED."lastSeen",
      embedding        = EXCLUDED.embedding
    RETURNING
      id, "tenantId", "workspaceId", "botId", pattern, summary,
      "embeddingModel", confidence, "observedCount", "lastSeen", "createdAt"
  `;

    const row = rows[0];
    if (!row) {
        throw new Error('writeEpisodicMemory: upsert returned no rows');
    }

    return {
        id: row.id,
        tenantId: row.tenantId,
        botId: row.botId ?? botId,
        workspaceId: row.workspaceId,
        pattern: row.pattern,
        summary: row.summary ?? summary,
        embeddingModel: row.embeddingModel ?? deployment,
        confidence: row.confidence,
        observedCount: row.observedCount,
        lastSeen: row.lastSeen.toISOString(),
        createdAt: row.createdAt.toISOString(),
    };
}
