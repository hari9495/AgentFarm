// ============================================================================
// EPISODIC MEMORY — Shared Contract Types
// Sprint 4 — pgvector Episodic Memory (2026-05-15)
// ============================================================================

/**
 * A stored episodic memory record — mirrors AgentLongTermMemory with vector fields.
 */
export interface EpisodicMemoryRecord {
    id: string;
    tenantId: string;
    botId: string;
    workspaceId: string;
    /** Distilled behavioral pattern (e.g. "writes tests before implementation") */
    pattern: string;
    /** Plaintext task summary that was embedded */
    summary: string;
    /** Azure OpenAI embedding deployment used (e.g. text-embedding-3-small) */
    embeddingModel: string;
    confidence: number;
    observedCount: number;
    lastSeen: string; // ISO-8601
    createdAt: string; // ISO-8601
}

/**
 * A memory record returned by semantic search, includes cosine similarity score.
 */
export interface EpisodicSearchResult {
    memory: EpisodicMemoryRecord;
    /** Cosine similarity in [0, 1] — higher is more relevant */
    similarity: number;
}

/**
 * Request to write an episodic memory after task completion.
 */
export interface EpisodicWriteRequest {
    tenantId: string;
    botId: string;
    workspaceId: string;
    /** Plaintext task summary to embed and persist */
    summary: string;
    /** Distilled behavioral pattern observed during this task */
    pattern: string;
    confidence: number;
    taskId: string;
}

/**
 * Request to search for semantically similar past memories at task start.
 */
export interface EpisodicSearchRequest {
    tenantId: string;
    botId: string;
    workspaceId: string;
    /** Incoming task description — embedded and compared against stored memories */
    queryText: string;
    /** Maximum number of results to return (default: 5) */
    topK?: number;
    /** Minimum cosine similarity threshold in [0, 1] (default: 0.7) */
    minSimilarity?: number;
}
