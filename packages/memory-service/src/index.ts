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

export {
    consolidateLessons,
    parseLessonPattern,
    buildConsolidatedSummary,
    computeConsolidatedConfidence,
    CONSOLIDATION_THRESHOLD,
}                                               from './consolidation.js';
export type { ConsolidationResult }             from './consolidation.js';

export {
    deriveMemoryConfig,
    PROFILE_CONFIGS,
}                                               from './task-profile.js';
export type {
    TaskMemoryProfile,
    MemoryRetrievalConfig,
}                                               from './task-profile.js';

export {
    writeMemoryEdge,
    readEdgesFrom,
    readEdgesTo,
    traverseMemoryGraph,
}                                               from './graph.js';
export type {
    MemoryNodeType,
    MemoryEdgeType,
    WriteEdgeParams,
    MemoryEdge,
    TraversalNode,
}                                               from './graph.js';
