/**
 * Keyword Data Adapter
 *
 * Fetches live keyword search volume and competition data from the DataForSEO
 * Google Ads Keywords Data API and enriches the SEO spec produced by
 * seo-optimizer.ts with real market signals.
 *
 * Credentials (login / password) are injected at runtime from the connector
 * config — never hardcoded.
 *
 * If credentials are absent (env vars not set and not passed in the query),
 * the adapter returns `skipped: true` so callers can degrade gracefully.
 */

import type { SeoSpec } from './seo-optimizer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KeywordDataQuery {
    /** Keywords to look up (max 1,000 per request). */
    keywords: string[];
    /**
     * DataForSEO API login (email).
     * Falls back to DATAFORSEO_LOGIN env var when not supplied.
     */
    login?: string;
    /**
     * DataForSEO API password.
     * Falls back to DATAFORSEO_PASSWORD env var when not supplied.
     */
    password?: string;
    /**
     * DataForSEO location code. Defaults to 2840 (United States).
     * See: https://api.dataforseo.com/v3/keywords_data/google_ads/locations
     */
    locationCode?: number;
    /** Language code. Defaults to "en". */
    languageCode?: string;
}

export interface KeywordMetrics {
    keyword: string;
    /** Monthly average search volume (null if not returned by API). */
    searchVolume: number | null;
    /** Competition index 0–1 (null if not returned). */
    competition: number | null;
    /** Competition level bucket. */
    competitionLevel: 'HIGH' | 'MEDIUM' | 'LOW' | null;
    /** Average cost-per-click in USD (null if not returned). */
    cpc: number | null;
}

export interface KeywordDataResult {
    keywords: KeywordMetrics[];
    fetchedAt: string;
    ok: boolean;
    errorMessage: string | null;
    /** True when credentials were absent — result is empty but not an error. */
    skipped: boolean;
}

/** Merged SEO spec with optional live keyword data. */
export interface EnrichedSeoSpec extends SeoSpec {
    /** Live keyword market data. Present when credentials were supplied. */
    keywordData: KeywordDataResult;
}

export type KeywordFetchFn = (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

// ---------------------------------------------------------------------------
// DataForSEO API shapes
// ---------------------------------------------------------------------------

interface DfsKeywordResult {
    keyword?: string;
    search_volume?: number | null;
    competition?: number | null;
    competition_level?: string | null;
    cpc?: number | null;
}

interface DfsTaskResult {
    result?: DfsKeywordResult[] | null;
}

interface DfsResponse {
    tasks?: DfsTaskResult[];
    status_code?: number;
    status_message?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DATAFORSEO_URL = 'https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live';
const DEFAULT_LOCATION = 2840; // United States
const DEFAULT_LANGUAGE = 'en';

function toCompetitionLevel(raw: string | null | undefined): 'HIGH' | 'MEDIUM' | 'LOW' | null {
    const upper = (raw ?? '').toUpperCase();
    if (upper === 'HIGH' || upper === 'MEDIUM' || upper === 'LOW') return upper;
    return null;
}

function buildEmptyResult(errorMessage: string, skipped = false): KeywordDataResult {
    return { keywords: [], fetchedAt: new Date().toISOString(), ok: false, errorMessage, skipped };
}

// ---------------------------------------------------------------------------
// Public API — keyword fetcher
// ---------------------------------------------------------------------------

/**
 * Fetch live keyword search volume and competition data from DataForSEO.
 *
 * When no credentials are available the function returns `{ skipped: true }`
 * instead of throwing, allowing callers to degrade gracefully.
 *
 * @param query   Keywords and credential / locale options.
 * @param fetchFn Injectable HTTP client — defaults to globalThis.fetch.
 */
export async function fetchKeywordData(
    query: KeywordDataQuery,
    fetchFn: KeywordFetchFn = async (url, init) => {
        const resp = await fetch(url, {
            method: init.method,
            headers: init.headers,
            body: init.body,
        });
        return { ok: resp.ok, status: resp.status, json: () => resp.json() as Promise<unknown> };
    },
): Promise<KeywordDataResult> {
    const login = query.login ?? process.env['DATAFORSEO_LOGIN'] ?? '';
    const password = query.password ?? process.env['DATAFORSEO_PASSWORD'] ?? '';

    if (!login || !password) {
        return {
            keywords: [],
            fetchedAt: new Date().toISOString(),
            ok: true,
            errorMessage: null,
            skipped: true,
        };
    }

    if (query.keywords.length === 0) {
        return { keywords: [], fetchedAt: new Date().toISOString(), ok: true, errorMessage: null, skipped: false };
    }

    const credentials = Buffer.from(`${login}:${password}`).toString('base64');
    const requestBody = JSON.stringify([
        {
            keywords: query.keywords.slice(0, 1000),
            location_code: query.locationCode ?? DEFAULT_LOCATION,
            language_code: query.languageCode ?? DEFAULT_LANGUAGE,
        },
    ]);

    let raw: unknown;
    try {
        const resp = await fetchFn(DATAFORSEO_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${credentials}`,
            },
            body: requestBody,
        });

        if (!resp.ok) {
            return buildEmptyResult(`DataForSEO API returned HTTP ${resp.status}`);
        }
        raw = await resp.json();
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return buildEmptyResult(msg);
    }

    const data = raw as DfsResponse;
    if (data.status_code && data.status_code !== 20000) {
        return buildEmptyResult(data.status_message ?? `DataForSEO error code ${data.status_code}`);
    }

    const resultRows: DfsKeywordResult[] = data.tasks?.[0]?.result ?? [];
    const keywords: KeywordMetrics[] = resultRows.map((row) => ({
        keyword: row.keyword ?? '',
        searchVolume: row.search_volume ?? null,
        competition: row.competition ?? null,
        competitionLevel: toCompetitionLevel(row.competition_level),
        cpc: row.cpc ?? null,
    }));

    return { keywords, fetchedAt: new Date().toISOString(), ok: true, errorMessage: null, skipped: false };
}

// ---------------------------------------------------------------------------
// Public API — spec enrichment
// ---------------------------------------------------------------------------

/**
 * Merge live keyword data into a static SEO spec.
 *
 * Adds keyword volume / competition data and updates `suggestions` with
 * actionable recommendations when market signals are available.
 *
 * @param spec         SEO spec produced by `optimizeForSeo()`.
 * @param keywordData  Live keyword metrics from `fetchKeywordData()`.
 */
export function enrichSeoSpec(spec: SeoSpec, keywordData: KeywordDataResult): EnrichedSeoSpec {
    const enriched: EnrichedSeoSpec = { ...spec, keywordData };

    if (!keywordData.ok || keywordData.skipped || keywordData.keywords.length === 0) {
        return enriched;
    }

    const suggestions = [...spec.suggestions];

    for (const kw of keywordData.keywords) {
        if (kw.searchVolume !== null && kw.searchVolume < 100) {
            suggestions.push(
                `"${kw.keyword}" has low search volume (${kw.searchVolume}/mo) — consider a higher-volume variant.`,
            );
        }
        if (kw.competitionLevel === 'HIGH') {
            suggestions.push(
                `"${kw.keyword}" has HIGH competition — consider a long-tail variant to rank more easily.`,
            );
        }
        if (kw.searchVolume !== null && kw.searchVolume >= 1000 && kw.competitionLevel === 'LOW') {
            suggestions.push(
                `"${kw.keyword}" has good volume (${kw.searchVolume}/mo) and LOW competition — prioritise this keyword.`,
            );
        }
    }

    return { ...enriched, suggestions };
}
