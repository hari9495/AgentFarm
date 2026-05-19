/**
 * semantic-memory.ts — Sprint 9: Semantic Memory / Company Knowledge RAG
 *
 * Shared contracts for reading from and writing to AgentKnowledgeBase.
 * Mirrors the structure of episodic-memory.ts so callers can treat both
 * memory tiers with the same pattern.
 */

/** A single knowledge chunk persisted in AgentKnowledgeBase. */
export interface SemanticMemoryRecord {
    /** Database primary key (cuid). */
    id: string;
    /** Tenant this chunk belongs to. */
    tenantId: string;
    /** Optionally scope the chunk to a specific bot; null = tenant-wide. */
    botId: string | null;
    /** The knowledge text (one chunk / passage). */
    content: string;
    /** Where the chunk was ingested from (URL, file path, etc.). */
    sourceUrl: string | null;
    /** Category: 'document' | 'webpage' | 'manual' | 'api_response' | … */
    sourceType: string;
    /** Embedding model name used to produce the vector. */
    embeddingModel: string | null;
    createdAt: string;
    updatedAt: string;
}

/** A search result including the matched chunk and its similarity score. */
export interface SemanticSearchResult {
    memory: SemanticMemoryRecord;
    /** Cosine similarity in [0, 1]. */
    similarity: number;
}

/** Payload for writing a new knowledge chunk. */
export interface SemanticWriteRequest {
    tenantId: string;
    /** Restrict chunk to a specific bot. Omit for tenant-wide knowledge. */
    botId?: string;
    /** The knowledge text to embed and store. */
    content: string;
    sourceUrl?: string;
    sourceType: string;
}

/** Payload for semantic similarity search. */
export interface SemanticSearchRequest {
    tenantId: string;
    /** If provided, restrict results to chunks scoped to this bot OR tenant-wide chunks. */
    botId?: string;
    /** Free-text query that will be embedded for similarity search. */
    queryText: string;
    /** Maximum number of chunks to return. Defaults to 5. */
    topK?: number;
    /** Minimum cosine similarity threshold. Defaults to 0.70. */
    minSimilarity?: number;
}
