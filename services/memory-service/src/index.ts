// ============================================================================
// AGENT MEMORY SERVICE — Public API
// ============================================================================

export type {
  IMemoryStore,
  MemoryReadResponse,
  MemoryWriteRequest,
  LongTermMemoryWriteRequest,
} from './memory-types.js';
export {
  calculateRejectionRate,
  extractCommonConnectors,
} from './memory-types.js';
export {
  MemoryStore,
  InMemoryMemoryStore,
} from './memory-store.js';
export type { InMemoryAuditEvent } from './memory-store.js';
// Sprint 4 — pgvector Episodic Memory
export { createEmbedFn } from './embedding-service.js';
export type { EmbeddingServiceConfig, EmbedFn } from './embedding-service.js';
export { writeEpisodicMemory } from './episodic-write-hook.js';
export { searchEpisodicMemory } from './episodic-read-hook.js';
// Sprint 9 — Semantic Memory / Company Knowledge RAG
export { writeSemanticMemory } from './semantic-write-hook.js';
export { searchSemanticMemory } from './semantic-search-hook.js';
// Sprint 14 — Episodic Memory Text Fallback (no embedding required)
export { writeEpisodicMemoryNoEmbed, searchEpisodicMemoryNoEmbed } from './episodic-text-fallback.js';
