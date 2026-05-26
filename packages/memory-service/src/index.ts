// ============================================================================
// @agentfarm/memory-service — Public API
//
// Provides pgvector-backed episodic memory (AgentLongTermMemory) and semantic
// memory / company knowledge RAG (AgentKnowledgeBase).
//
// Usage:
//   import { createEmbedFn, writeEpisodicMemory, searchEpisodicMemory } from '@agentfarm/memory-service';
// ============================================================================

export { createEmbedFn }                        from './embed.js';
export type { EmbedFn }                         from './embed.js';

export {
    writeEpisodicMemory,
    writeEpisodicMemoryNoEmbed,
    searchEpisodicMemory,
    searchEpisodicMemoryNoEmbed,
}                                               from './episodic.js';

export {
    writeSemanticMemory,
    searchSemanticMemory,
}                                               from './semantic.js';
