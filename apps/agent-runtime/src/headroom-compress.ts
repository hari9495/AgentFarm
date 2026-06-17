import { compress } from 'headroom-ai';

const ENABLED = process.env['HEADROOM_ENABLED'] === '1' || process.env['HEADROOM_ENABLED'] === 'true';
const BASE_URL = process.env['HEADROOM_BASE_URL'] || undefined;
const API_KEY = process.env['HEADROOM_API_KEY'] || undefined;
const TOKEN_BUDGET = process.env['HEADROOM_TOKEN_BUDGET']
    ? parseInt(process.env['HEADROOM_TOKEN_BUDGET'], 10)
    : undefined;

export type HeadroomStats = {
    tokensSaved: number;
    compressionRatio: number;
};

type OpenAiMessage = { role: string; content: string };

type AnthropicSystemBlock = { type: string; text: string; cache_control?: { type: string } };

export async function compressOpenAiMessages(
    messages: OpenAiMessage[],
    model: string,
): Promise<{ messages: OpenAiMessage[]; stats: HeadroomStats | null }> {
    if (!ENABLED) return { messages, stats: null };

    try {
        const result = await compress(messages, {
            model,
            ...(BASE_URL ? { baseUrl: BASE_URL } : {}),
            ...(API_KEY ? { apiKey: API_KEY } : {}),
            ...(TOKEN_BUDGET ? { tokenBudget: TOKEN_BUDGET } : {}),
            fallback: true,
        });
        const stats: HeadroomStats = {
            tokensSaved: result.tokensSaved,
            compressionRatio: result.compressionRatio,
        };
        if (stats.tokensSaved > 0) {
            console.info(
                `[headroom] compressed ${stats.tokensSaved} tokens (${(stats.compressionRatio * 100).toFixed(1)}%) model=${model}`,
            );
        }
        return { messages: result.messages as OpenAiMessage[], stats };
    } catch {
        return { messages, stats: null };
    }
}

export async function compressAnthropicPayload(
    systemBlocks: AnthropicSystemBlock[],
    messages: OpenAiMessage[],
    model: string,
): Promise<{
    systemBlocks: AnthropicSystemBlock[];
    messages: OpenAiMessage[];
    stats: HeadroomStats | null;
}> {
    if (!ENABLED) return { systemBlocks, messages, stats: null };

    try {
        const combined: OpenAiMessage[] = [
            { role: 'system', content: systemBlocks.map((b) => b.text).join('\n') },
            ...messages,
        ];

        const result = await compress(combined, {
            model,
            ...(BASE_URL ? { baseUrl: BASE_URL } : {}),
            ...(API_KEY ? { apiKey: API_KEY } : {}),
            ...(TOKEN_BUDGET ? { tokenBudget: TOKEN_BUDGET } : {}),
            fallback: true,
        });

        const compressed = result.messages as OpenAiMessage[];
        const systemMsg = compressed.find((m) => m.role === 'system');
        const userMsgs = compressed.filter((m) => m.role !== 'system');

        const newSystemBlocks: AnthropicSystemBlock[] = systemMsg
            ? [{ type: 'text', text: systemMsg.content, cache_control: { type: 'ephemeral' } }]
            : systemBlocks;

        const stats: HeadroomStats = {
            tokensSaved: result.tokensSaved,
            compressionRatio: result.compressionRatio,
        };
        if (stats.tokensSaved > 0) {
            console.info(
                `[headroom] compressed ${stats.tokensSaved} tokens (${(stats.compressionRatio * 100).toFixed(1)}%) model=${model} provider=anthropic`,
            );
        }
        return { systemBlocks: newSystemBlocks, messages: userMsgs, stats };
    } catch {
        return { systemBlocks, messages, stats: null };
    }
}

export async function compressGeminiContent(
    text: string,
    model: string,
): Promise<{ text: string; stats: HeadroomStats | null }> {
    if (!ENABLED) return { text, stats: null };

    try {
        const messages: OpenAiMessage[] = [{ role: 'user', content: text }];
        const result = await compress(messages, {
            model,
            ...(BASE_URL ? { baseUrl: BASE_URL } : {}),
            ...(API_KEY ? { apiKey: API_KEY } : {}),
            ...(TOKEN_BUDGET ? { tokenBudget: TOKEN_BUDGET } : {}),
            fallback: true,
        });
        const compressed = result.messages as OpenAiMessage[];
        const stats: HeadroomStats = {
            tokensSaved: result.tokensSaved,
            compressionRatio: result.compressionRatio,
        };
        if (stats.tokensSaved > 0) {
            console.info(
                `[headroom] compressed ${stats.tokensSaved} tokens (${(stats.compressionRatio * 100).toFixed(1)}%) model=${model} provider=google`,
            );
        }
        return { text: compressed[0]?.content ?? text, stats };
    } catch {
        return { text, stats: null };
    }
}

export function isHeadroomEnabled(): boolean {
    return ENABLED;
}
