/**
 * RAG context budget limiter.
 *
 * All 16 agent RAG retrievers call applyRagContextBudget() on the assembled
 * context block before returning it. When the block exceeds the budget, it is
 * trimmed at the nearest section boundary (---) so the LLM never receives a
 * partial section header without content.
 *
 * Default: 8 000 chars ≈ 2 000 tokens — well within the system-prompt budget
 * while still surfacing 3-5 high-similarity chunks per retrieval.
 *
 * Override: AF_RAG_CONTEXT_MAX_CHARS env var.
 *
 * See docs/QUALITY_GATES.md §4 for the full design.
 */

export const DEFAULT_RAG_CONTEXT_MAX_CHARS = 8_000;

export type RagBudgetStats = {
    wasTrimmed: boolean;
    originalChars: number;
    finalChars: number;
};

function getMaxChars(override?: number): number {
    if (override !== undefined) return override;
    const env = process.env['AF_RAG_CONTEXT_MAX_CHARS'];
    if (env) {
        const parsed = parseInt(env, 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return DEFAULT_RAG_CONTEXT_MAX_CHARS;
}

function trimTobudget(contextBlock: string, maxChars: number): string {
    if (contextBlock.length <= maxChars) return contextBlock;

    const truncated = contextBlock.slice(0, maxChars);
    const boundary = truncated.lastIndexOf('\n---\n');
    const cutAt = boundary > maxChars / 2 ? boundary : maxChars;
    return contextBlock.slice(0, cutAt) + '\n\n*(additional context trimmed for token budget)*';
}

/**
 * Trim a formatted RAG context block to at most `maxChars` characters.
 *
 * Trimming strategy:
 *   1. If the block is within budget, return unchanged.
 *   2. Truncate at `maxChars`, then backtrack to the last `\n---\n` section
 *      boundary so the LLM always receives complete sections.
 *   3. If no boundary exists in the first half of the budget (degenerate
 *      single-section block), hard-truncate at the character limit.
 *
 * Budget is read from AF_RAG_CONTEXT_MAX_CHARS env var, falling back to
 * DEFAULT_RAG_CONTEXT_MAX_CHARS (8 000). Pass `maxChars` explicitly to override.
 */
export function applyRagContextBudget(
    contextBlock: string,
    maxChars?: number,
): string {
    return trimTobudget(contextBlock, getMaxChars(maxChars));
}

/**
 * Same as applyRagContextBudget but also returns trimming stats for
 * observability (log how much was dropped without changing callers).
 */
export function applyRagContextBudgetWithStats(
    contextBlock: string,
    maxChars?: number,
): { contextBlock: string } & RagBudgetStats {
    const limit = getMaxChars(maxChars);
    const originalChars = contextBlock.length;
    const trimmed = trimTobudget(contextBlock, limit);
    return {
        contextBlock: trimmed,
        wasTrimmed: trimmed.length < originalChars,
        originalChars,
        finalChars: trimmed.length,
    };
}
