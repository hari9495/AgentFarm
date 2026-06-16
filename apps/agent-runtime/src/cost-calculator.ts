/**
 * LLM cost estimation for task execution records.
 *
 * Pricing is hard-coded per 1M tokens (input/output) based on published rates
 * as of 2026-05-10. Update when provider pricing changes.
 */

type PricingEntry = {
    inputPerMillion: number;
    outputPerMillion: number;
    tier: string;
};

const UNKNOWN_PRICING: PricingEntry = { inputPerMillion: 0, outputPerMillion: 0, tier: 'unknown' };

// Exact normalized model-id keys. Lookup is O(1) and order-independent.
// Normalization strips provider prefixes so "anthropic/claude-haiku-4-5" and
// "claude-haiku-4-5" both resolve correctly.
export const PRICING_MAP: Record<string, PricingEntry> = {
    'claude-haiku-4-5':           { inputPerMillion: 0.80,  outputPerMillion: 4.00,  tier: 'haiku' },
    'claude-haiku-4-5-20251001':  { inputPerMillion: 0.80,  outputPerMillion: 4.00,  tier: 'haiku' },
    'claude-sonnet-4-6':          { inputPerMillion: 3.00,  outputPerMillion: 15.00, tier: 'sonnet' },
    'claude-opus-4-7':            { inputPerMillion: 15.00, outputPerMillion: 75.00, tier: 'opus' },
    'gpt-4o-mini':                { inputPerMillion: 0.15,  outputPerMillion: 0.60,  tier: 'gpt-4o-mini' },
    'gpt-4o':                     { inputPerMillion: 2.50,  outputPerMillion: 10.00, tier: 'gpt-4o' },
    'gemini-1.5-pro':             { inputPerMillion: 1.25,  outputPerMillion: 5.00,  tier: 'gemini-1.5-pro' },
    'gemini-1.5-flash':           { inputPerMillion: 0.075, outputPerMillion: 0.30,  tier: 'gemini-1.5-flash' },
    // DeepSeek pricing (cache-miss input rate). Cache-hit input is ~74% cheaper.
    'deepseek-chat':              { inputPerMillion: 0.27,  outputPerMillion: 1.10,  tier: 'deepseek-chat' },
    'deepseek-reasoner':          { inputPerMillion: 0.55,  outputPerMillion: 2.19,  tier: 'deepseek-reasoner' },
    'mock':                       { inputPerMillion: 0.00,  outputPerMillion: 0.00,  tier: 'mock' },
};

// Tier-alias map for profile keywords and short model name shorthands.
// Only used as a secondary lookup when the model ID itself is unknown.
const TIER_ALIAS: Record<string, PricingEntry> = {
    'quality_first':  PRICING_MAP['claude-opus-4-7']!,
    'speed_first':    PRICING_MAP['claude-haiku-4-5']!,
    'cost_balanced':  PRICING_MAP['claude-sonnet-4-6']!,
    // Short-name shorthands: allow e.g. "claude-haiku" to resolve correctly
    'claude-haiku':   PRICING_MAP['claude-haiku-4-5']!,
    'claude-sonnet':  PRICING_MAP['claude-sonnet-4-6']!,
    'claude-opus':    PRICING_MAP['claude-opus-4-7']!,
};

function normalizeModelId(raw: string): string {
    return raw.toLowerCase().replace(/^(anthropic|openai|azure|google|deepseek)\//, '');
}

function findPricing(modelProvider: string, modelProfile: string): PricingEntry {
    // 1. Try exact normalized model ID from either field.
    const byProvider = PRICING_MAP[normalizeModelId(modelProvider)];
    if (byProvider) return byProvider;

    const byProfile = PRICING_MAP[normalizeModelId(modelProfile)];
    if (byProfile) return byProfile;

    // 2. Try profile keyword alias (quality_first, speed_first, etc.)
    const byAlias = TIER_ALIAS[modelProfile.toLowerCase()];
    if (byAlias) return byAlias;

    return UNKNOWN_PRICING;
}

/**
 * Estimate the USD cost of a single LLM task execution.
 *
 * @param params.modelProvider  - Provider string (e.g. "openai", "anthropic", "claude-haiku")
 * @param params.modelProfile   - Profile key (e.g. "quality_first", "haiku", "sonnet")
 * @param params.promptTokens   - Number of input/prompt tokens
 * @param params.completionTokens - Number of output/completion tokens
 *
 * @returns costUsd  - Estimated cost in US dollars (0 for mock/unknown)
 *          modelTier - Matched pricing tier key, or "unknown"
 */
export function estimateCostUsd(params: {
    modelProvider: string;
    modelProfile: string;
    promptTokens: number;
    completionTokens: number;
}): { costUsd: number; modelTier: string } {
    const { modelProvider, modelProfile, promptTokens, completionTokens } = params;
    const pricing = findPricing(modelProvider, modelProfile);

    const costUsd =
        (promptTokens / 1_000_000) * pricing.inputPerMillion +
        (completionTokens / 1_000_000) * pricing.outputPerMillion;

    return { costUsd, modelTier: pricing.tier };
}
