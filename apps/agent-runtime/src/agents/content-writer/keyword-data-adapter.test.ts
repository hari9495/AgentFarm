import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { fetchKeywordData, enrichSeoSpec } from './keyword-data-adapter.js';
import type { KeywordDataQuery, KeywordFetchFn } from './keyword-data-adapter.js';
import type { SeoSpec } from './seo-optimizer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuery(overrides: Partial<KeywordDataQuery> = {}): KeywordDataQuery {
    return {
        keywords: ['typescript tutorial'],
        login: 'user@example.com',
        password: 'dfs-secret',
        ...overrides,
    };
}

function makeDfsResponse(results: { keyword: string; search_volume: number; competition: number; competition_level: string; cpc: number }[]): unknown {
    return {
        status_code: 20000,
        tasks: [
            {
                result: results.map((r) => ({
                    keyword: r.keyword,
                    search_volume: r.search_volume,
                    competition: r.competition,
                    competition_level: r.competition_level,
                    cpc: r.cpc,
                })),
            },
        ],
    };
}

function stubFetch(response: unknown, httpStatus = 200): KeywordFetchFn {
    return async () => ({
        ok: httpStatus >= 200 && httpStatus < 300,
        status: httpStatus,
        json: async () => response,
    });
}

function makeBaseSeoSpec(overrides: Partial<SeoSpec> = {}): SeoSpec {
    return {
        focusKeyword: 'typescript tutorial',
        metaTitle: 'TypeScript Tutorial',
        metaDescription: 'Learn TypeScript step by step.',
        keywordDensityPercent: 1.5,
        keywordInFirstParagraph: true,
        keywordInHeadings: true,
        avgSentenceLength: 12,
        readabilityGrade: 'easy',
        fleschReadingEase: 65,
        wordCount: 500,
        internalLinkCount: 1,
        externalLinkCount: 2,
        suggestions: ['Add at least one internal link to a related page.'],
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests — fetchKeywordData
// ---------------------------------------------------------------------------

describe('fetchKeywordData', () => {

    test('returns skipped=true when no credentials are provided', async () => {
        // No login/password in query, and env vars not set
        delete process.env['DATAFORSEO_LOGIN'];
        delete process.env['DATAFORSEO_PASSWORD'];

        const result = await fetchKeywordData({ keywords: ['test keyword'] });

        assert.equal(result.skipped, true);
        assert.equal(result.ok, true);
        assert.equal(result.errorMessage, null);
        assert.equal(result.keywords.length, 0);
    });

    test('returns structured keyword metrics when API responds successfully', async () => {
        const dfsResponse = makeDfsResponse([
            { keyword: 'typescript tutorial', search_volume: 22200, competition: 0.75, competition_level: 'HIGH', cpc: 2.50 },
        ]);

        const result = await fetchKeywordData(makeQuery(), stubFetch(dfsResponse));

        assert.equal(result.ok, true);
        assert.equal(result.skipped, false);
        assert.equal(result.errorMessage, null);
        assert.equal(result.keywords.length, 1);

        const kw = result.keywords[0]!;
        assert.equal(kw.keyword, 'typescript tutorial');
        assert.equal(kw.searchVolume, 22200);
        assert.ok(Math.abs(kw.competition! - 0.75) < 0.001);
        assert.equal(kw.competitionLevel, 'HIGH');
        assert.ok(Math.abs(kw.cpc! - 2.50) < 0.001);
    });

    test('returns multiple keyword metrics when multiple keywords provided', async () => {
        const dfsResponse = makeDfsResponse([
            { keyword: 'typescript tutorial', search_volume: 22200, competition: 0.75, competition_level: 'HIGH', cpc: 2.50 },
            { keyword: 'learn typescript', search_volume: 8100, competition: 0.45, competition_level: 'MEDIUM', cpc: 1.80 },
        ]);

        const result = await fetchKeywordData(
            makeQuery({ keywords: ['typescript tutorial', 'learn typescript'] }),
            stubFetch(dfsResponse),
        );

        assert.equal(result.keywords.length, 2);
        assert.ok(result.keywords.some((k) => k.keyword === 'learn typescript'));
    });

    test('returns ok=false with errorMessage when API returns HTTP error', async () => {
        const result = await fetchKeywordData(makeQuery(), stubFetch({}, 401));

        assert.equal(result.ok, false);
        assert.ok(result.errorMessage?.includes('401'));
        assert.equal(result.keywords.length, 0);
    });

    test('returns ok=false with errorMessage when fetch throws', async () => {
        const throwingFetch: KeywordFetchFn = async () => { throw new Error('ECONNREFUSED'); };
        const result = await fetchKeywordData(makeQuery(), throwingFetch);

        assert.equal(result.ok, false);
        assert.ok(result.errorMessage?.includes('ECONNREFUSED'));
    });

    test('returns ok=false when DataForSEO status_code indicates an error', async () => {
        const errorResponse = { status_code: 40004, status_message: 'Insufficient credits' };
        const result = await fetchKeywordData(makeQuery(), stubFetch(errorResponse, 200));

        assert.equal(result.ok, false);
        assert.ok(result.errorMessage?.includes('Insufficient credits'));
    });

    test('sends Basic auth header using login:password', async () => {
        let capturedHeaders: Record<string, string> = {};
        const captureFetch: KeywordFetchFn = async (_url, init) => {
            capturedHeaders = init.headers;
            return { ok: true, status: 200, json: async () => makeDfsResponse([]) };
        };

        await fetchKeywordData(makeQuery({ login: 'api@example.com', password: 'my-dfs-pass' }), captureFetch);

        const expected = Buffer.from('api@example.com:my-dfs-pass').toString('base64');
        assert.equal(capturedHeaders['Authorization'], `Basic ${expected}`);
    });

    test('password does not appear in the returned result', async () => {
        const dfsResponse = makeDfsResponse([
            { keyword: 'typescript', search_volume: 100, competition: 0.5, competition_level: 'MEDIUM', cpc: 1.0 },
        ]);
        const result = await fetchKeywordData(makeQuery({ password: 'super-secret-dfs' }), stubFetch(dfsResponse));
        const resultStr = JSON.stringify(result);
        assert.ok(!resultStr.includes('super-secret-dfs'), 'password must not appear in result');
    });

    test('returns empty keywords array without error for empty keywords input', async () => {
        const result = await fetchKeywordData(makeQuery({ keywords: [] }), stubFetch({}));
        assert.equal(result.ok, true);
        assert.equal(result.keywords.length, 0);
    });

    test('result includes fetchedAt ISO timestamp', async () => {
        const result = await fetchKeywordData(makeQuery(), stubFetch(makeDfsResponse([])));
        assert.ok(typeof result.fetchedAt === 'string');
        assert.ok(!isNaN(Date.parse(result.fetchedAt)), 'fetchedAt must be a valid ISO date string');
    });

    test('reads credentials from env vars when not passed in query', async () => {
        process.env['DATAFORSEO_LOGIN'] = 'env-user@example.com';
        process.env['DATAFORSEO_PASSWORD'] = 'env-pass';
        let capturedHeaders: Record<string, string> = {};
        const captureFetch: KeywordFetchFn = async (_url, init) => {
            capturedHeaders = init.headers;
            return { ok: true, status: 200, json: async () => makeDfsResponse([]) };
        };

        await fetchKeywordData({ keywords: ['test'] }, captureFetch);

        const expected = Buffer.from('env-user@example.com:env-pass').toString('base64');
        assert.equal(capturedHeaders['Authorization'], `Basic ${expected}`);

        delete process.env['DATAFORSEO_LOGIN'];
        delete process.env['DATAFORSEO_PASSWORD'];
    });
});

// ---------------------------------------------------------------------------
// Tests — enrichSeoSpec
// ---------------------------------------------------------------------------

describe('enrichSeoSpec', () => {

    test('attaches keywordData to the spec', () => {
        const spec = makeBaseSeoSpec();
        const kd = { keywords: [], fetchedAt: new Date().toISOString(), ok: true, errorMessage: null, skipped: false };
        const enriched = enrichSeoSpec(spec, kd);
        assert.deepEqual(enriched.keywordData, kd);
    });

    test('preserves all original spec fields', () => {
        const spec = makeBaseSeoSpec();
        const kd = { keywords: [], fetchedAt: new Date().toISOString(), ok: true, errorMessage: null, skipped: false };
        const enriched = enrichSeoSpec(spec, kd);
        assert.equal(enriched.focusKeyword, spec.focusKeyword);
        assert.equal(enriched.wordCount, spec.wordCount);
        assert.equal(enriched.metaTitle, spec.metaTitle);
    });

    test('adds low-volume suggestion when search volume is below 100', () => {
        const spec = makeBaseSeoSpec({ suggestions: [] });
        const kd = {
            keywords: [{ keyword: 'typescript tutorial', searchVolume: 50, competition: 0.3, competitionLevel: null, cpc: null } as const],
            fetchedAt: new Date().toISOString(),
            ok: true,
            errorMessage: null,
            skipped: false,
        };
        const enriched = enrichSeoSpec(spec, kd);
        assert.ok(
            enriched.suggestions.some((s) => s.includes('low search volume')),
            'should add low volume suggestion',
        );
    });

    test('adds HIGH competition suggestion when competition level is HIGH', () => {
        const spec = makeBaseSeoSpec({ suggestions: [] });
        const kd = {
            keywords: [{ keyword: 'typescript tutorial', searchVolume: 5000, competition: 0.9, competitionLevel: 'HIGH' as const, cpc: 3.0 }],
            fetchedAt: new Date().toISOString(),
            ok: true,
            errorMessage: null,
            skipped: false,
        };
        const enriched = enrichSeoSpec(spec, kd);
        assert.ok(
            enriched.suggestions.some((s) => s.includes('HIGH competition')),
            'should add HIGH competition suggestion',
        );
    });

    test('adds opportunity suggestion when volume is high and competition is LOW', () => {
        const spec = makeBaseSeoSpec({ suggestions: [] });
        const kd = {
            keywords: [{ keyword: 'typescript tutorial', searchVolume: 5000, competition: 0.1, competitionLevel: 'LOW' as const, cpc: 0.5 }],
            fetchedAt: new Date().toISOString(),
            ok: true,
            errorMessage: null,
            skipped: false,
        };
        const enriched = enrichSeoSpec(spec, kd);
        assert.ok(
            enriched.suggestions.some((s) => s.includes('LOW competition')),
            'should add low-competition opportunity suggestion',
        );
    });

    test('does not add keyword suggestions when keywordData is skipped', () => {
        const spec = makeBaseSeoSpec({ suggestions: [] });
        const kd = { keywords: [], fetchedAt: new Date().toISOString(), ok: true, errorMessage: null, skipped: true };
        const enriched = enrichSeoSpec(spec, kd);
        // Should have no extra suggestions beyond whatever the original spec had
        assert.equal(enriched.suggestions.length, 0);
    });

    test('preserves existing suggestions and appends new ones', () => {
        const spec = makeBaseSeoSpec({ suggestions: ['Existing suggestion.'] });
        const kd = {
            keywords: [{ keyword: 'typescript tutorial', searchVolume: 30, competition: 0.3, competitionLevel: null as null, cpc: null }],
            fetchedAt: new Date().toISOString(),
            ok: true,
            errorMessage: null,
            skipped: false,
        };
        const enriched = enrichSeoSpec(spec, kd);
        assert.ok(enriched.suggestions.some((s) => s === 'Existing suggestion.'), 'original suggestions preserved');
        assert.ok(enriched.suggestions.length > 1, 'new suggestions appended');
    });
});
