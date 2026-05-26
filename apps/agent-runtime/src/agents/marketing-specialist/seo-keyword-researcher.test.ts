import { describe, it, expect, vi } from 'vitest';
import { researchKeywords } from './seo-keyword-researcher.js';
import type { KeywordFetchFn } from './seo-keyword-researcher.js';

function mockDataForSeoFetch(keywords: string[]): KeywordFetchFn {
    return vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
            tasks: [{
                result: [{
                    items: keywords.map((kw) => ({
                        keyword: kw,
                        search_volume: 1000,
                        cpc: 2.5,
                        competition_index: 40,
                    })),
                }],
            }],
        }),
    });
}

describe('researchKeywords', () => {
    it('uses heuristic expansion when no API credentials provided', async () => {
        const result = await researchKeywords({
            seedKeywords: ['ai agents', 'automation software'],
            industry: 'SaaS',
            targetAudience: 'startup founders',
        });
        expect(result.ok).toBe(true);
        expect(result.opportunities.length).toBeGreaterThan(0);
    });

    it('generates audience-specific long-tail keywords', async () => {
        const result = await researchKeywords({
            seedKeywords: ['ai agents'],
            industry: 'SaaS',
            targetAudience: 'enterprise CTOs',
        });
        const longTail = result.opportunities.find((o) => o.keyword.includes('enterprise CTOs'));
        expect(longTail).toBeDefined();
    });

    it('fetches from DataForSEO when credentials provided', async () => {
        const fetch = mockDataForSeoFetch(['ai agents best practices', 'automate workflow']);
        const result = await researchKeywords({
            seedKeywords: ['ai agents', 'automate workflow'],
            industry: 'SaaS',
            dataforseoLogin: 'user@test.com',
            dataforseoPassword: 'pass',
        }, fetch);
        expect(result.ok).toBe(true);
        expect(result.opportunities.length).toBe(2);
        expect(result.opportunities[0]!.searchVolume).toBe(1000);
    });

    it('returns error on DataForSEO API failure', async () => {
        const failFetch: KeywordFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) });
        const result = await researchKeywords({
            seedKeywords: ['test'],
            industry: 'SaaS',
            dataforseoLogin: 'user',
            dataforseoPassword: 'pass',
        }, failFetch);
        expect(result.ok).toBe(false);
        expect(result.errorMessage).toBeDefined();
    });

    it('classifies intent correctly', async () => {
        const result = await researchKeywords({
            seedKeywords: ['automation software'],
            industry: 'SaaS',
        });
        const transactional = result.opportunities.find((o) => o.intent === 'transactional');
        const informational = result.opportunities.find((o) => o.intent === 'informational');
        expect(transactional).toBeDefined();
        expect(informational).toBeDefined();
    });

    it('respects maxResults limit', async () => {
        const result = await researchKeywords({
            seedKeywords: ['a', 'b', 'c', 'd', 'e'],
            industry: 'SaaS',
            maxResults: 5,
        });
        expect(result.opportunities.length).toBeLessThanOrEqual(5);
    });
});
