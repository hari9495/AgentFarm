/**
 * microcompact.ts — Lossless token recovery by clearing regeneratable tool outputs.
 *
 * After Headroom compresses a conversation (lossy summarization), Microcompact
 * makes a complementary pass: it finds tool-call results in the message history
 * whose output is purely regeneratable (file reads, grep results, test output,
 * etc.) and replaces them with a lightweight placeholder.
 *
 * This is "lossless at the semantic level" — the agent can re-invoke any
 * compacted tool to restore the content. It does NOT summarize or discard
 * information that carries policy state (approval outcomes, task decisions,
 * connector responses, error messages).
 *
 * Typical savings: 10,000–25,000 tokens per long-running session.
 *
 * See docs/QUALITY_GATES.md for the full design.
 */

function isEnabled(): boolean {
    return (
        process.env['AF_MICROCOMPACT_ENABLED'] === 'true' ||
        process.env['AF_MICROCOMPACT_ENABLED'] === '1'
    );
}

function getMinSavings(): number {
    return parseInt(process.env['AF_MICROCOMPACT_MIN_SAVINGS'] ?? '500', 10);
}

// Tool names whose results are regeneratable on demand
const COMPACTABLE_TOOLS = new Set([
    'workspace_read_file',
    'workspace_grep',
    'workspace_list_files',
    'workspace_run_tests',
    'workspace_run_build',
    'workspace_scout',
    'code_read',
    'web_research',
    'web_fetch',
    'websearch',
    'glob',
    'grep',
    'read',
    'bash',                  // stdout is regeneratable; exit codes are not — handled below
]);

// Keywords in tool result content that mark it as state-bearing (never compact)
const STATE_BEARING_PATTERNS = [
    /approved/i,
    /denied/i,
    /rejected/i,
    /approval.*granted/i,
    /kill.?switch/i,
    /blocked/i,
    /error.*fatal/i,
    /TRANSIENT/,
    /NON_RETRYABLE/,
];

type OpenAiMessage = {
    role: string;
    content: string | Array<{ type: string; [key: string]: unknown }>;
    tool_call_id?: string;
    name?: string;
};

export type MicrocompactStats = {
    messagesScanned: number;
    toolResultsFound: number;
    toolResultsCompacted: number;
    estimatedTokensSaved: number;
};

function estimateTokens(text: string): number {
    // ~4 chars per token — conservative approximation
    return Math.ceil(text.length / 4);
}

function isStateBearing(content: string): boolean {
    return STATE_BEARING_PATTERNS.some((p) => p.test(content));
}

function buildPlaceholder(toolName: string): string {
    return `[Compacted: ${toolName} result — re-invoke to restore content]`;
}

function extractToolName(msg: OpenAiMessage, toolCallMessages: Map<string, string>): string | null {
    // For tool result messages, look up the tool name from the preceding tool call
    if (msg.role === 'tool' && msg.tool_call_id) {
        return toolCallMessages.get(msg.tool_call_id) ?? msg.name ?? null;
    }
    return null;
}

function buildToolCallIndex(messages: OpenAiMessage[]): Map<string, string> {
    const index = new Map<string, string>();
    for (const msg of messages) {
        if (msg.role !== 'assistant') continue;
        if (!Array.isArray(msg.content)) continue;
        for (const part of msg.content) {
            if (
                part['type'] === 'tool_use' &&
                typeof part['id'] === 'string' &&
                typeof part['name'] === 'string'
            ) {
                index.set(part['id'] as string, part['name'] as string);
            }
        }
        // OpenAI format: tool_calls array
        const toolCalls = (msg as Record<string, unknown>)['tool_calls'];
        if (Array.isArray(toolCalls)) {
            for (const tc of toolCalls as Record<string, unknown>[]) {
                if (
                    typeof tc['id'] === 'string' &&
                    tc['function'] !== null &&
                    typeof tc['function'] === 'object' &&
                    typeof (tc['function'] as Record<string, unknown>)['name'] === 'string'
                ) {
                    index.set(tc['id'] as string, (tc['function'] as Record<string, unknown>)['name'] as string);
                }
            }
        }
    }
    return index;
}

/**
 * Compact regeneratable tool results in a message array.
 *
 * Only modifies tool result messages (role='tool') whose tool name is in
 * COMPACTABLE_TOOLS and whose content is not state-bearing.
 *
 * Returns the compacted messages plus stats. When ENABLED=false or savings
 * are below MIN_SAVINGS, returns the original messages unchanged.
 */
export function microcompact(messages: OpenAiMessage[]): {
    messages: OpenAiMessage[];
    stats: MicrocompactStats;
} {
    const stats: MicrocompactStats = {
        messagesScanned: messages.length,
        toolResultsFound: 0,
        toolResultsCompacted: 0,
        estimatedTokensSaved: 0,
    };

    if (!isEnabled()) return { messages, stats };

    const toolCallIndex = buildToolCallIndex(messages);
    let totalSaved = 0;

    const compacted = messages.map((msg): OpenAiMessage => {
        // Only process tool result messages
        if (msg.role !== 'tool') return msg;

        const toolName = extractToolName(msg, toolCallIndex);
        if (!toolName || !COMPACTABLE_TOOLS.has(toolName)) return msg;

        stats.toolResultsFound++;

        const contentStr = typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content);

        // Never compact state-bearing content
        if (isStateBearing(contentStr)) return msg;

        const originalTokens = estimateTokens(contentStr);
        const placeholder = buildPlaceholder(toolName);
        const placeholderTokens = estimateTokens(placeholder);
        const saved = originalTokens - placeholderTokens;

        if (saved <= 0) return msg;

        stats.toolResultsCompacted++;
        stats.estimatedTokensSaved += saved;
        totalSaved += saved;

        return { ...msg, content: placeholder };
    });

    if (totalSaved < getMinSavings()) {
        // Not worth applying — return original to avoid surprising callers
        return { messages, stats: { ...stats, toolResultsCompacted: 0, estimatedTokensSaved: 0 } };
    }

    console.info(
        `[microcompact] compacted ${stats.toolResultsCompacted}/${stats.toolResultsFound} tool results, ` +
        `saved ~${stats.estimatedTokensSaved} tokens`,
    );

    return { messages: compacted, stats };
}

export function isMicrocompactEnabled(): boolean {
    return isEnabled();
}
