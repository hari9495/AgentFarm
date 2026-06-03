import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { researchKeywords } from './seo-keyword-researcher.js';
import type { KeywordFetchFn } from './seo-keyword-researcher.js';

function mockDataForSeoFetch(keywords: string[]): KeywordFetchFn {
    return async () => ({
        ok: true, status: 200,
        json: () => Promise.resolve({ tasks: [{ result: [{ items: keywords.map((kw) => ({ keyword: kw, search_volume: 1000, cpc: 2.5, competition_index: 40 })) }] }] }),
    } as Response & { json: () => Promise<unknown> });
}

describe('researchKeywords', () => {
    it('uses heuristic expansion when no API credentials provided', async () => {
        const result = await researchKeywords({ seedKeywords: ['ai agents', 'automation software'], industry: 'SaaS', targetAudience: 'startup founders' });
        assert.equal(result.ok, true);
        assert.ok(result.opportunities.length > 0);
    });
    it('generates audience-specific long-tail keywords', async () => {
        const result = await researchKeywords({ seedKeywords: ['ai agents'], industry: 'SaaS', targetAudience: 'enterprise CTOs' });
        assert.ok(result.opportunities.find((o) => o.keyword.includes('enterprise CTOs')));
    });
    it('fetches from DataForSEO when credentials provided', async () => {
        const result = await researchKeywords({
            seedKeywords: ['ai agents', 'automate workflow'], industry: 'SaaS',
            dataforseoLogin: 'user@test.com', dataforseoPassword: 'pass',
        }, mockDataForSeoFetch(['ai agents best practices', 'automate workflow']));
        assert.equal(result.ok, true);
        assert.equal(result.opportunities.length, 2);
        assert.equal(result.opportunities[0]!.searchVolume, 1000);
    });
    it('returns error on DataForSEO API failure', async () => {
        const failFetch: KeywordFetchFn = async () => ({ ok: false, status: 401, json: () => Promise.resolve({}) } as Response & { json: () => Promise<unknown> });
        const result = await researchKeywords({ seedKeywords: ['test'], industry: 'SaaS', dataforseoLogin: 'user', dataforseoPassword: 'pass' }, failFetch);
        assert.equal(result.ok, false);
        assert.ok(result.errorMessage !== undefined);
    });
    it('classifies intent correctly', async () => {
        const result = await researchKeywords({ seedKeywords: ['automation software'], industry: 'SaaS' });
        assert.ok(result.opportunities.find((o) => o.intent === 'transactional'));
        assert.ok(result.opportunities.find((o) => o.intent === 'informational'));
    });
    it('respects maxResults limit', async () => {
        const result = await researchKeywords({ seedKeywords: ['a', 'b', 'c', 'd', 'e'], industry: 'SaaS', maxResults: 5 });
        assert.ok(result.opportunities.length <= 5);
    });
});
