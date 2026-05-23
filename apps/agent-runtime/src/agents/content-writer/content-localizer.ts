/**
 * Content Localizer
 *
 * Adapts a content draft for a target locale or region using an LLM.
 * When DEEPL_API_KEY is set and adaptOnly=false, uses the DeepL API for
 * high-quality machine translation first, then applies LLM cultural adaptation.
 *
 * Modes:
 *   - adaptOnly: true  — LLM cultural adaptation only (no language change).
 *   - adaptOnly: false — DeepL translation (when API key present) or LLM
 *                        translation, plus cultural adaptation.
 *
 * Uses the same injectable fetch/caller pattern so tests never make real calls.
 */

import type { ProseCallerFn } from './llm-prose-writer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeepLFetchFn = (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export interface LocalizeRequest {
    /** The draft body to localise. */
    body: string;
    /**
     * IETF language-region tag for the target locale, e.g. 'en-GB', 'de-DE',
     * 'pt-BR', 'ja-JP', 'fr-FR'.
     */
    targetLocale: string;
    /** Optional human-readable region name to improve LLM context. */
    targetRegion?: string;
    /**
     * When true, retain the original language but adapt cultural elements.
     * When false, translate into the target locale's language.
     */
    adaptOnly: boolean;
}

export interface LocalizeResult {
    /** The localised (or culturally adapted) body. */
    body: string;
    /** The locale this content was adapted for. */
    targetLocale: string;
    /** List of specific changes the LLM reports having made. */
    changesApplied: string[];
    tokensUsed: number;
    localizedByLlm: boolean;
    /** Set to true when DeepL was used for translation. */
    translatedByDeepL?: boolean;
}


// ---------------------------------------------------------------------------

/**
 * Localise a content body for a target locale and/or region.
 *
 * Falls back to the original body (localizedByLlm: false) if the LLM is
 * unavailable.
 */
export async function localizeContent(
    req: LocalizeRequest,
    caller: ProseCallerFn,
): Promise<LocalizeResult> {
    if (!req.body.trim()) {
        return {
            body: req.body,
            targetLocale: req.targetLocale,
            changesApplied: [],
            tokensUsed: 0,
            localizedByLlm: false,
        };
    }

    const regionLabel = req.targetRegion ?? req.targetLocale;

    const systemPrompt = req.adaptOnly
        ? `You are a cultural adaptation specialist. Adapt the content for the ${regionLabel} audience ` +
        `without changing the language. Make the following adaptations where relevant:\n` +
        `1. Replace idioms or cultural references that would not resonate in ${regionLabel} with local equivalents.\n` +
        `2. Convert units of measurement to the local standard (miles→km, Fahrenheit→Celsius, etc.).\n` +
        `3. Adjust date formats to the ${regionLabel} convention.\n` +
        `4. Replace currency references with the local currency where present.\n` +
        `5. Remove or replace humour that may not translate culturally.\n` +
        `Return the adapted content, then on a new line: CHANGES: <semicolon-separated list of changes made>.\n` +
        `Output only the adapted content and the CHANGES line — no other commentary.`
        : `You are a professional translator and cultural adaptation specialist. ` +
        `Translate this content into ${req.targetLocale} (${regionLabel}). ` +
        `Also adapt cultural references, idioms, units, dates, and currency for the target market.\n` +
        `Return the translated content, then on a new line: CHANGES: <semicolon-separated list of key adaptations>.\n` +
        `Output only the translated content and the CHANGES line — no other commentary.`;

    const result = await caller(systemPrompt, `Content to adapt:\n\n${req.body}`);

    if (!result.text) {
        return {
            body: req.body,
            targetLocale: req.targetLocale,
            changesApplied: [],
            tokensUsed: 0,
            localizedByLlm: false,
        };
    }

    const changesMatch = /^CHANGES:\s*(.+)/im.exec(result.text);
    const changesApplied = changesMatch?.[1]
        ?.split(';')
        .map((c) => c.trim())
        .filter(Boolean) ?? [];

    // Strip the CHANGES line from the body
    const body = result.text.replace(/\nCHANGES:.*$/si, '').trim();

    return {
        body,
        targetLocale: req.targetLocale,
        changesApplied,
        tokensUsed: result.tokensUsed ?? 0,
        localizedByLlm: true,
    };
}

// ---------------------------------------------------------------------------
// DeepL translation adapter
// ---------------------------------------------------------------------------

const DEEPL_API_FREE_URL = 'https://api-free.deepl.com/v2/translate';
const DEEPL_API_PRO_URL = 'https://api.deepl.com/v2/translate';

/** Map an IETF locale tag to a DeepL target_lang code (uppercase language-only). */
function toDeepLLang(locale: string): string {
    // DeepL uses uppercase language code, e.g. 'DE', 'FR', 'PT-BR', 'ZH'
    const [lang, region] = locale.split('-');
    const upper = (lang ?? '').toUpperCase();
    // Special cases where DeepL uses region-qualified codes
    if (upper === 'PT' && region && region.toUpperCase() === 'BR') return 'PT-BR';
    if (upper === 'PT') return 'PT-PT';
    if (upper === 'ZH') return 'ZH';
    if (upper === 'EN' && region && region.toUpperCase() === 'US') return 'EN-US';
    if (upper === 'EN') return 'EN-GB';
    return upper;
}

interface DeepLResponse {
    translations?: Array<{ detected_source_language: string; text: string }>;
    message?: string;
}

/**
 * Translate text using the DeepL API.
 *
 * Requires `DEEPL_API_KEY` env var to be set.
 * Returns `null` when the env var is absent or the call fails, so callers can
 * fall back to LLM translation without throwing.
 *
 * Uses the free-tier endpoint by default; set `DEEPL_API_PRO=true` to use pro.
 *
 * @param text     The content to translate.
 * @param targetLocale  IETF locale tag (e.g. 'de-DE', 'pt-BR').
 * @param fetchFn  Injectable fetch function — defaults to globalThis.fetch.
 */
export async function translateWithDeepL(
    text: string,
    targetLocale: string,
    fetchFn: DeepLFetchFn = (url, init) =>
        (globalThis.fetch as (u: string, i?: RequestInit) => Promise<Response>)(url, {
            method: init?.method,
            headers: init?.headers as Record<string, string>,
            body: init?.body,
        }).then((r) => ({ ok: r.ok, status: r.status, text: () => r.text() })),
): Promise<string | null> {
    const apiKey = process.env['DEEPL_API_KEY'];
    if (!apiKey) return null;

    const apiUrl =
        process.env['DEEPL_API_PRO'] === 'true' ? DEEPL_API_PRO_URL : DEEPL_API_FREE_URL;

    const params = new URLSearchParams({
        auth_key: apiKey,
        text,
        target_lang: toDeepLLang(targetLocale),
    });

    try {
        const response = await fetchFn(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });
        if (!response.ok) return null;

        const json = JSON.parse(await response.text()) as DeepLResponse;
        return json.translations?.[0]?.text ?? null;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Combined: DeepL translation + LLM cultural adaptation
// ---------------------------------------------------------------------------

/**
 * Localise content with DeepL when `DEEPL_API_KEY` is set and
 * `req.adaptOnly` is false. Falls back to pure LLM if DeepL is unavailable.
 */
export async function localizeContentWithDeepL(
    req: LocalizeRequest,
    caller: ProseCallerFn,
    deeplFetchFn?: DeepLFetchFn,
): Promise<LocalizeResult> {
    if (req.adaptOnly || !process.env['DEEPL_API_KEY']) {
        // No DeepL path — delegate entirely to LLM.
        return localizeContent(req, caller);
    }

    const translatedText = await translateWithDeepL(req.body, req.targetLocale, deeplFetchFn);
    if (!translatedText) {
        // DeepL failed — fall back to LLM.
        return localizeContent(req, caller);
    }

    // DeepL handled translation; now ask the LLM to apply cultural adaptation only.
    const adaptReq: LocalizeRequest = {
        ...req,
        body: translatedText,
        adaptOnly: true,
    };
    const adapted = await localizeContent(adaptReq, caller);

    return {
        ...adapted,
        translatedByDeepL: true,
    };
}
