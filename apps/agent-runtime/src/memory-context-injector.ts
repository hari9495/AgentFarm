// ============================================================================
// MEMORY CONTEXT INJECTOR
// Sprint 4 — pgvector Episodic Memory (2026-05-15)
//
// Formats retrieved EpisodicSearchResults into a system-prompt prefix that
// gives the LLM context about what the agent has done in similar tasks before.
// ============================================================================

import type { EpisodicSearchResult } from '@agentfarm/shared-types';

const SECTION_HEADER = '### Relevant past experience\n';
const SECTION_FOOTER = '\n---\n';
const MIN_RESULTS_TO_INJECT = 1;

/**
 * Build a system-prompt prefix from episodic search results.
 *
 * Returns an empty string when `memories` is empty (caller should omit prefix).
 *
 * Example output:
 * ```
 * ### Relevant past experience
 * 1. [similarity: 0.91] Refactored auth module — uses JWT. Pattern: "prefers JWT over session cookies"
 * 2. [similarity: 0.83] Fixed failing unit tests in auth.ts. Pattern: "runs tests after each file change"
 * ---
 * ```
 *
 * @param memories  Sorted (desc similarity) list of search results
 * @returns         Formatted string to prepend to the LLM system prompt
 */
export function buildMemoryContextPrefix(memories: EpisodicSearchResult[]): string {
    if (memories.length < MIN_RESULTS_TO_INJECT) {
        return '';
    }

    const lines = memories.map((result, index) => {
        const sim = result.similarity.toFixed(2);
        const summary = result.memory.summary.trim().replace(/\n/g, ' ');
        const pattern = result.memory.pattern.trim().replace(/\n/g, ' ');
        return `${index + 1}. [similarity: ${sim}] ${summary}. Pattern: "${pattern}"`;
    });

    return `${SECTION_HEADER}${lines.join('\n')}${SECTION_FOOTER}`;
}
