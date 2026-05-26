/**
 * SEO Keyword Researcher
 *
 * Researches keyword opportunities using DataForSEO or SEMrush APIs.
 * Falls back to heuristic intent classification when no API key is set.
 */

export type KeywordFetchFn = (
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type SearchIntent = 'informational' | 'navigational' | 'commercial' | 'transactional';

export interface KeywordOpportunity {
    keyword: string;
    searchVolume: number | null;
    difficulty: number | null;
    cpc: number | null;
    intent: SearchIntent;
    opportunityScore: number;
    cluster: string;
    rationale: string;
}

export interface KeywordResearchInput {
    seedKeywords: string[];
    industry: string;
    targetAudience?: string;
    dataforseoLogin?: string;
    dataforseoPassword?: string;
    locationCode?: number;
    languageCode?: string;
    maxResults?: number;
}

export interface KeywordResearchResult {
    ok: boolean;
    seedKeywords: string[];
    opportunities: KeywordOpportunity[];
    topCluster: string;
    summary: string;
    errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Intent classifier (pure heuristic — no API required)
// ---------------------------------------------------------------------------

const TRANSACTIONAL_SIGNALS = ['buy', 'price', 'pricing', 'cost', 'purchase', 'order', 'checkout', 'deal', 'discount', 'coupon', 'subscription', 'plan', 'hire'];
const COMMERCIAL_SIGNALS = ['best', 'top', 'vs', 'versus', 'alternative', 'review', 'compare', 'comparison', 'pros cons', 'which', 'recommend'];
const INFORMATIONAL_SIGNALS = ['what is', 'how to', 'how does', 'why', 'guide', 'tutorial', 'learn', 'tips', 'examples', 'definition'];

function classifyIntent(keyword: string): SearchIntent {
    const kw = keyword.toLowerCase();
    if (TRANSACTIONAL_SIGNALS.some((s) => kw.includes(s))) return 'transactional';
    if (COMMERCIAL_SIGNALS.some((s) => kw.includes(s))) return 'commercial';
    if (INFORMATIONAL_SIGNALS.some((s) => kw.includes(s))) return 'informational';
    return 'commercial';
}

function computeOpportunityScore(
    volume: number | null,
    difficulty: number | null,
    intent: SearchIntent,
): number {
    const intentMultiplier: Record<SearchIntent, number> = {
        transactional: 1.5,
        commercial: 1.3,
        informational: 1.0,
        navigational: 0.6,
    };
    const vol = volume ?? 100;
    const diff = difficulty ?? 50;
    const diffScore = Math.max(0, (100 - diff) / 100);
    const volScore = Math.min(Math.log10(Math.max(vol, 1)) / 5, 1);
    return Math.round((volScore + diffScore) * intentMultiplier[intent] * 50);
}

function clusterKeyword(keyword: string, seedKeywords: string[]): string {
    const kw = keyword.toLowerCase();
    for (const seed of seedKeywords) {
        if (kw.includes(seed.toLowerCase())) return seed;
    }
    const words = kw.split(/\s+/);
    return words.find((w) => w.length > 4) ?? words[0] ?? 'general';
}

// ---------------------------------------------------------------------------
// DataForSEO keyword overview
// ---------------------------------------------------------------------------

async function fetchDataForSeoKeywords(
    keywords: string[],
    login: string,
    password: string,
    locationCode: number,
    languageCode: string,
    fetchFn: KeywordFetchFn,
): Promise<KeywordOpportunity[]> {
    const credentials = Buffer.from(`${login}:${password}`).toString('base64');
    const url = 'https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live';
    const body = JSON.stringify([{ keywords, location_code: locationCode, language_code: languageCode }]);
    const resp = await fetchFn(url, {
        method: 'POST',
        headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' },
        body,
    });
    if (!resp.ok) throw new Error(`DataForSEO HTTP ${resp.status}`);
    const data = await resp.json() as Record<string, unknown>;
    const tasks = (data['tasks'] as unknown[]) ?? [];
    const results: KeywordOpportunity[] = [];
    for (const task of tasks) {
        const t = task as Record<string, unknown>;
        const taskResults = (t['result'] as unknown[]) ?? [];
        for (const r of taskResults) {
            const item = r as Record<string, unknown>;
            const items = (item['items'] as unknown[]) ?? [item];
            for (const kw of items) {
                const k = kw as Record<string, unknown>;
                const keyword = String(k['keyword'] ?? '');
                const volume = typeof k['search_volume'] === 'number' ? k['search_volume'] : null;
                const cpc = typeof k['cpc'] === 'number' ? k['cpc'] : null;
                const difficulty = typeof k['competition_index'] === 'number' ? k['competition_index'] : null;
                const intent = classifyIntent(keyword);
                results.push({
                    keyword,
                    searchVolume: volume,
                    difficulty,
                    cpc,
                    intent,
                    opportunityScore: computeOpportunityScore(volume, difficulty, intent),
                    cluster: clusterKeyword(keyword, keywords),
                    rationale: `${intent} keyword with ${volume ?? 'unknown'} monthly searches${difficulty !== null ? `, difficulty ${difficulty}/100` : ''}.`,
                });
            }
        }
    }
    return results;
}

// ---------------------------------------------------------------------------
// Heuristic fallback keyword expansion
// ---------------------------------------------------------------------------

function expandKeywordsHeuristic(
    seedKeywords: string[],
    industry: string,
    targetAudience: string,
): KeywordOpportunity[] {
    const modifiers = {
        informational: ['how to use', 'what is', 'guide to', 'benefits of', 'examples of'],
        commercial: ['best', 'top', 'vs', 'alternative to', 'review of'],
        transactional: ['buy', 'pricing', 'cost of', 'get started with', 'free trial'],
    };

    const results: KeywordOpportunity[] = [];

    for (const seed of seedKeywords) {
        for (const [intentStr, mods] of Object.entries(modifiers)) {
            const intent = intentStr as SearchIntent;
            for (const mod of mods.slice(0, 2)) {
                const keyword = `${mod} ${seed}`;
                results.push({
                    keyword,
                    searchVolume: null,
                    difficulty: null,
                    cpc: null,
                    intent,
                    opportunityScore: computeOpportunityScore(null, null, intent),
                    cluster: seed,
                    rationale: `Heuristic expansion of "${seed}" for ${targetAudience} in ${industry}. Validate volume with DataForSEO or SEMrush.`,
                });
            }
        }
        // Long-tail audience-specific
        if (targetAudience) {
            results.push({
                keyword: `${seed} for ${targetAudience}`,
                searchVolume: null,
                difficulty: null,
                cpc: null,
                intent: 'commercial',
                opportunityScore: computeOpportunityScore(null, 35, 'commercial'),
                cluster: seed,
                rationale: `Audience-specific long-tail for "${seed}" — typically lower difficulty with high purchase intent.`,
            });
        }
    }

    return results.sort((a, b) => b.opportunityScore - a.opportunityScore);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function researchKeywords(
    input: KeywordResearchInput,
    fetchFn?: KeywordFetchFn,
): Promise<KeywordResearchResult> {
    const maxResults = input.maxResults ?? 50;

    let opportunities: KeywordOpportunity[];

    const login = input.dataforseoLogin ?? process.env['DATAFORSEO_LOGIN'];
    const password = input.dataforseoPassword ?? process.env['DATAFORSEO_PASSWORD'];

    if (login && password) {
        try {
            const fetch: KeywordFetchFn = fetchFn ?? (async (url, init) => {
                const resp = await globalThis.fetch(url, { method: init.method, headers: init.headers, body: init.body });
                return { ok: resp.ok, status: resp.status, json: () => resp.json() as Promise<unknown> };
            });
            opportunities = await fetchDataForSeoKeywords(
                input.seedKeywords,
                login,
                password,
                input.locationCode ?? 2840,
                input.languageCode ?? 'en',
                fetch,
            );
        } catch (err) {
            return {
                ok: false,
                seedKeywords: input.seedKeywords,
                opportunities: [],
                topCluster: input.seedKeywords[0] ?? '',
                summary: '',
                errorMessage: `DataForSEO fetch failed: ${String(err)}`,
            };
        }
    } else {
        opportunities = expandKeywordsHeuristic(input.seedKeywords, input.industry, input.targetAudience ?? '');
    }

    opportunities = opportunities
        .sort((a, b) => b.opportunityScore - a.opportunityScore)
        .slice(0, maxResults);

    const clusterCounts: Record<string, number> = {};
    for (const o of opportunities) {
        clusterCounts[o.cluster] = (clusterCounts[o.cluster] ?? 0) + 1;
    }
    const topCluster = Object.entries(clusterCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? '';

    const highIntent = opportunities.filter((o) => o.intent === 'transactional' || o.intent === 'commercial').length;

    return {
        ok: true,
        seedKeywords: input.seedKeywords,
        opportunities,
        topCluster,
        summary: `Found ${opportunities.length} keyword opportunities for ${input.industry}. ${highIntent} high-intent (commercial/transactional). Top cluster: "${topCluster}".`,
    };
}
