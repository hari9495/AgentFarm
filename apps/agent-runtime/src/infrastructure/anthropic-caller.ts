/**
 * anthropic-caller.ts
 *
 * Drop-in replacement for the scattered direct fetch('…/v1/messages') calls
 * throughout the codebase.  Every caller passes a logical tier instead of a
 * model name; this module resolves the model and retries automatically when
 * Anthropic returns 404 model_not_found.
 *
 * Retry behaviour
 * ───────────────
 * • 404 + model_not_found  → move to the next model in the tier's fallback
 *                            chain (see anthropic-model-registry.ts)
 * • Any other non-2xx      → throw immediately (rate-limits, auth errors,
 *                            server errors are not retried here — the caller
 *                            or the auto-provider failover handles those)
 * • All models exhausted   → throw AnthropicModelExhaustedError so callers
 *                            can decide whether to surface or swallow it
 */

import { resolveModelChain, type AnthropicModelTier } from './anthropic-model-registry.js';
import { traceGeneration } from '@agentfarm/llm-trace';
import { estimateCostUsd } from '../cost-calculator.js';

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_VERSION  = '2023-06-01';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnthropicMessage = {
    role: 'user' | 'assistant';
    content: string;
};

export type AnthropicContentBlock = {
    type: string;
    text?: string;
};

export type AnthropicCallResult = {
    /** Raw content blocks returned by the API — same shape as the API response. */
    content: AnthropicContentBlock[];
    /** The actual model that produced the response (may differ from the
     *  preferred model if fallback was triggered). */
    modelUsed: string;
    usage?: {
        input_tokens: number;
        output_tokens: number;
        /** Tokens written into the cache on this call (billed at 1.25× normal rate). */
        cache_creation_input_tokens?: number;
        /** Tokens read from cache (billed at 0.1× normal rate — the main saving). */
        cache_read_input_tokens?: number;
    };
};

export type AnthropicCallParams = {
    /** API key — defaults to process.env['ANTHROPIC_API_KEY'] when omitted. */
    apiKey?: string;
    /** Logical model tier; the registry resolves this to a fallback chain. */
    tier: AnthropicModelTier;
    system?: string;
    messages: AnthropicMessage[];
    maxTokens?: number;
    temperature?: number;
    signal?: AbortSignal;
    /**
     * When true, marks the system prompt with cache_control: ephemeral so
     * Anthropic caches it for 5 minutes. Requires a static (or rarely-changing)
     * system prompt — agent role prompts are ideal candidates.
     * Adds the anthropic-beta: prompt-caching-2024-07-31 header automatically.
     */
    enablePromptCache?: boolean;
};

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class AnthropicModelExhaustedError extends Error {
    constructor(public readonly tier: AnthropicModelTier, public readonly triedModels: string[]) {
        super(
            `All Anthropic models exhausted for tier '${tier}'. Tried: ${triedModels.join(', ')}. ` +
            `Set AF_ANTHROPIC_MODEL_${tier.toUpperCase()} env var to override the fallback chain.`,
        );
        this.name = 'AnthropicModelExhaustedError';
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isModelNotFound(status: number, body: unknown): boolean {
    if (status !== 404) return false;
    const err = (body as Record<string, unknown>)['error'] as Record<string, unknown> | undefined;
    if (!err) return false;
    return (
        err['type'] === 'not_found_error' ||
        String(err['message'] ?? '').toLowerCase().includes('model')
    );
}

function resolveApiKey(provided: string | undefined): string {
    const key = provided ?? process.env['ANTHROPIC_API_KEY'] ?? process.env['AF_ANTHROPIC_API_KEY'] ?? '';
    if (!key.trim()) {
        throw new Error('callAnthropic: no API key — set ANTHROPIC_API_KEY or AF_ANTHROPIC_API_KEY');
    }
    return key;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Call the Anthropic Messages API with automatic model-deprecation fallback.
 *
 * @example
 * ```typescript
 * const { content, modelUsed } = await callAnthropic({
 *     tier: 'balanced',
 *     system: 'You are a sales assistant.',
 *     messages: [{ role: 'user', content: prompt }],
 *     maxTokens: 1024,
 * });
 * const text = content.filter(b => b.type === 'text').map(b => b.text ?? '').join('');
 * ```
 */
export async function callAnthropic(params: AnthropicCallParams): Promise<AnthropicCallResult> {
    const apiKey = resolveApiKey(params.apiKey);
    const chain  = resolveModelChain(params.tier);
    const tried: string[] = [];

    for (const model of chain) {
        tried.push(model);

        const bodyObj: Record<string, unknown> = {
            model,
            max_tokens: params.maxTokens ?? 1024,
            messages: params.messages,
        };
        if (params.system) {
            bodyObj['system'] = params.enablePromptCache
                ? [{ type: 'text', text: params.system, cache_control: { type: 'ephemeral' } }]
                : params.system;
        }
        if (params.temperature !== undefined) bodyObj['temperature'] = params.temperature;

        const headers: Record<string, string> = {
            'content-type':      'application/json',
            'x-api-key':         apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
        };
        if (params.enablePromptCache) {
            headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
        }

        const response = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
            method: 'POST',
            headers,
            body: JSON.stringify(bodyObj),
            signal: params.signal,
        });

        if (response.ok) {
            const parsed = await response.json() as {
                content?: AnthropicContentBlock[];
                usage?: {
                    input_tokens: number;
                    output_tokens: number;
                    cache_creation_input_tokens?: number;
                    cache_read_input_tokens?: number;
                };
            };

            // Emit a Langfuse generation. Tenant/task/trace come from the ambient
            // context (runWithLlmTraceContext) established at the task entry point.
            const u = parsed.usage;
            const promptTokens = u
                ? (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
                : undefined;
            const completionTokens = u?.output_tokens;
            const { costUsd, modelTier } = estimateCostUsd({
                modelProvider: model,
                modelProfile: '',
                promptTokens: promptTokens ?? 0,
                completionTokens: completionTokens ?? 0,
            });
            traceGeneration({
                name: 'llm.anthropic',
                provider: 'anthropic',
                model,
                input: { system: params.system, messages: params.messages },
                output: extractText(parsed.content ?? []),
                promptTokens,
                completionTokens,
                costUsd: costUsd > 0 ? costUsd : undefined,
                modelTier,
                tags: ['anthropic-caller'],
            });

            return {
                content:   parsed.content ?? [],
                modelUsed: model,
                usage:     parsed.usage,
            };
        }

        // Clone the response so we can read the body for error classification
        // without consuming the original.
        const errBody = await response.json().catch(() => ({}));

        if (isModelNotFound(response.status, errBody)) {
            // Model retired — try the next one in the chain.
            console.warn(
                `[anthropic-caller] model '${model}' returned model_not_found ` +
                `(tier=${params.tier}); trying next fallback`,
            );
            continue;
        }

        // Any other error (rate limit, auth, server error) is not a model
        // deprecation issue — propagate immediately.
        throw new Error(`anthropic_request_failed:${response.status}`);
    }

    throw new AnthropicModelExhaustedError(params.tier, tried);
}

/**
 * Convenience helper that extracts the concatenated text from the content
 * array, covering the most common usage pattern across the codebase.
 */
export function extractText(content: AnthropicContentBlock[]): string {
    return content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
}
