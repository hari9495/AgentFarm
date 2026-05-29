/**
 * anthropic-model-registry.ts
 *
 * Single source of truth for every Anthropic model name used across the
 * runtime.  Instead of scattering model strings through individual files
 * (where a single deprecation silently breaks one agent), all callers
 * reference a logical tier.  The registry resolves that tier to an ordered
 * fallback chain at call time.
 *
 * How deprecation is handled at runtime
 * ──────────────────────────────────────
 * The companion anthropic-caller.ts walks the chain and retries automatically
 * when the API returns a 404 model_not_found.  No code change is needed when
 * Anthropic retires a model — the runtime falls through to the next entry.
 *
 * How to update without a code deploy
 * ────────────────────────────────────
 * Set an env var with a comma-separated list of models (first wins):
 *
 *   AF_ANTHROPIC_MODEL_BALANCED=claude-sonnet-4-7,claude-sonnet-4-6
 *   AF_ANTHROPIC_MODEL_QUALITY=claude-opus-4-8,claude-opus-4-7
 *   AF_ANTHROPIC_MODEL_SPEED=claude-haiku-4-6,claude-haiku-4-5
 *
 * This completely replaces the built-in chain for that tier.
 */

/** The three logical tiers used across the codebase. */
export type AnthropicModelTier = 'quality' | 'balanced' | 'speed';

// ---------------------------------------------------------------------------
// Built-in fallback chains — ordered from best to fallback.
//
// Use only stable non-date-stamped aliases.  Dated strings (e.g.
// claude-sonnet-4-20250514) are retired on Anthropic's own schedule and break
// without warning; aliases track the current stable snapshot automatically.
// ---------------------------------------------------------------------------

const BUILTIN_CHAINS: Record<AnthropicModelTier, string[]> = {
    quality:  ['claude-opus-4-7',  'claude-opus-4-5',  'claude-sonnet-4-6'],
    balanced: ['claude-sonnet-4-6', 'claude-haiku-4-5'],
    speed:    ['claude-haiku-4-5',  'claude-sonnet-4-6'],
};

const ENV_KEYS: Record<AnthropicModelTier, string> = {
    quality:  'AF_ANTHROPIC_MODEL_QUALITY',
    balanced: 'AF_ANTHROPIC_MODEL_BALANCED',
    speed:    'AF_ANTHROPIC_MODEL_SPEED',
};

/**
 * Returns the ordered fallback chain for a tier.
 *
 * If the env var for the tier is set to a comma-separated list, that list is
 * used verbatim (first model wins, rest are fallbacks).  Otherwise the
 * built-in chain is returned.
 */
export function resolveModelChain(tier: AnthropicModelTier): string[] {
    const override = process.env[ENV_KEYS[tier]]?.trim();
    if (override) {
        const parsed = override.split(',').map((m) => m.trim()).filter(Boolean);
        if (parsed.length > 0) return parsed;
    }
    return BUILTIN_CHAINS[tier];
}

/** Returns the primary (preferred) model for a tier — the first in the chain. */
export function resolveModel(tier: AnthropicModelTier): string {
    return resolveModelChain(tier)[0]!;
}
