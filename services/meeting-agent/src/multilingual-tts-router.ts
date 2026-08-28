/**
 * MultilingualTtsRouter — selects the cheapest capable TTS provider for a
 * given BCP-47 language code.
 *
 * Priority per language family:
 *
 *   Indian languages (hi-IN, ta-IN, te-IN, kn-IN, ml-IN, mr-IN, bn-IN, gu-IN, pa-IN)
 *     → sarvam_ai   (best quality for Indian languages, worth the per-call cost)
 *
 *   English (en-*)
 *     → kokoro      (self-hosted, zero cost, excellent quality)
 *
 *   16 XTTS-supported major languages (en, es, fr, de, it, pt, pl, tr, ru, nl, cs, ar, zh, ja, hu, ko)
 *     → xtts        (self-hosted, zero cost, good quality)
 *
 *   Everything else (1100+ languages)
 *     → mms_tts     (Meta MMS, self-hosted, zero cost, acceptable quality)
 *
 * The router returns a partial VoicePipelineConfig override that callers merge
 * into their base config before passing to VoicePipeline.synthesize().
 */

import type { TtsProvider, VoicePipelineConfig } from '@agentfarm/shared-types';

// Indian language BCP-47 prefixes handled by Sarvam AI
const INDIAN_LANG_PREFIXES = new Set([
    'hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn', 'gu', 'pa',
]);

// Languages supported by XTTS v2 (ISO-639-1 codes). NOTE: XTTS v2 does NOT
// support Hindi — its actual set is these 16; Hindi/Indian langs route to
// sarvam_ai (above) or mms_tts. Do not add 'hi' here (the server 500s on it).
const XTTS_LANGS = new Set([
    'en', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'tr', 'ru', 'nl',
    'cs', 'ar', 'zh', 'ja', 'hu', 'ko',
]);

export interface TtsRoutingDecision {
    provider: TtsProvider;
    /** Human-readable reason for the selection (useful for logging). */
    reason: string;
}

/**
 * Returns the optimal TtsProvider for a given BCP-47 language code.
 * Falls back to `mms_tts` for any unrecognised language.
 */
export function routeTtsProvider(languageCode: string | undefined): TtsRoutingDecision {
    if (!languageCode) {
        return { provider: 'kokoro', reason: 'no language specified — defaulting to kokoro (English)' };
    }
    // Normalise: 'hi-IN' → 'hi', 'zh-Hant-TW' → 'zh'
    const iso = languageCode.split('-')[0]!.toLowerCase();

    if (INDIAN_LANG_PREFIXES.has(iso)) {
        return { provider: 'sarvam_ai', reason: `Indian language "${iso}" — sarvam_ai for best quality` };
    }
    if (iso === 'en') {
        return { provider: 'kokoro', reason: 'English — kokoro (self-hosted, zero cost)' };
    }
    if (XTTS_LANGS.has(iso)) {
        return { provider: 'xtts', reason: `"${iso}" supported by XTTS v2 (self-hosted, zero cost)` };
    }
    return { provider: 'mms_tts', reason: `"${iso}" — Meta MMS-TTS (1100+ language fallback)` };
}

/**
 * Builds a VoicePipelineConfig override for the detected language.
 * Merge this into your base config:
 *
 * ```ts
 * const config = { ...baseConfig, ...buildTtsOverride(languageCode) };
 * ```
 */
export function buildTtsOverride(languageCode: string | undefined): Pick<VoicePipelineConfig, 'ttsProvider' | 'languageCode'> {
    const { provider } = routeTtsProvider(languageCode);
    return { ttsProvider: provider, languageCode };
}
