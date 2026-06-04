/**
 * RAG context budget limiter.
 *
 * All 15 agent RAG retrievers call applyRagContextBudget() on the assembled
 * context block before returning it. When the block exceeds the budget, it is
 * trimmed at the nearest section boundary (---) so the LLM never receives a
 * partial section header without content.
 *
 * Default: 8 000 chars ≈ 2 000 tokens — well within the system-prompt budget
 * while still surfacing 3-5 high-similarity chunks per retrieval.
 */

export const DEFAULT_RAG_CONTEXT_MAX_CHARS = 8_000;

/**
 * Trim a formatted RAG context block to at most `maxChars` characters.
 *
 * Trimming strategy:
 *   1. If the block is within budget, return unchanged.
 *   2. Truncate at `maxChars`, then backtrack to the last `\n---\n` section
 *      boundary so the LLM always receives complete sections.
 *   3. If no boundary exists in the first half of the budget (degenerate
 *      single-section block), hard-truncate at the character limit.
 */
export function applyRagContextBudget(
    contextBlock: string,
    maxChars: number = DEFAULT_RAG_CONTEXT_MAX_CHARS,
): string {
    if (contextBlock.length <= maxChars) return contextBlock;

    const truncated = contextBlock.slice(0, maxChars);
    const boundary = truncated.lastIndexOf('\n---\n');
    const cutAt = boundary > maxChars / 2 ? boundary : maxChars;
    return contextBlock.slice(0, cutAt) + '\n\n*(additional context trimmed for token budget)*';
}
