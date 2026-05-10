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

// Keys are checked case-insensitively against modelProvider and modelProfile.
// Order matters: haiku before sonnet before opus; gpt-4o-mini before gpt-4o.
const PRICING_TABLE: Array<{ key: string } & PricingEntry> = [
    { key: 'haiku', inputPerMillion: 0.80, outputPerMillion: 4.00, tier: 'haiku' },
    { key: 'sonnet', inputPerMillion: 3.00, outputPerMillion: 15.00, tier: 'sonnet' },
    { key: 'opus', inputPerMillion: 15.00, outputPerMillion: 75.00, tier: 'opus' },
    { key: 'gpt-4o-mini', inputPerMillion: 0.15, outputPerMillion: 0.60, tier: 'gpt-4o-mini' },
    { key: 'gpt-4o', inputPerMillion: 2.50, outputPerMillion: 10.00, tier: 'gpt-4o' },
    { key: 'gemini-1.5-pro', inputPerMillion: 1.25, outputPerMillion: 5.00, tier: 'gemini-1.5-pro' },
    { key: 'gemini-1.5-flash', inputPerMillion: 0.075, outputPerMillion: 0.30, tier: 'gemini-1.5-flash' },
    { key: 'mock', inputPerMillion: 0.00, outputPerMillion: 0.00, tier: 'mock' },
];

function findPricing(modelProvider: string, modelProfile: string): PricingEntry & { tier: string } {
    const haystack = `${modelProvider} ${modelProfile}`.toLowerCase();
    for (const entry of PRICING_TABLE) {
        if (haystack.includes(entry.key)) {
            return entry;
        }
    }
    return { inputPerMillion: 0.00, outputPerMillion: 0.00, tier: 'unknown' };
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
