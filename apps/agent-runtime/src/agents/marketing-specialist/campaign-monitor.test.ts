import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchCampaignMetrics } from './campaign-monitor.js';
import type { MonitorFetchFn } from './campaign-monitor.js';

function mockFetch(body: unknown, ok = true, status = 200): MonitorFetchFn {
    return async () => ({ ok, status, json: () => Promise.resolve(body) } as Response & { json: () => Promise<unknown> });
}

describe('fetchCampaignMetrics', () => {
    it('returns error when no credentials provided', async () => {
        const result = await fetchCampaignMetrics({ dateFrom: '2026-05-01', dateTo: '2026-05-31' });
        assert.equal(result.ok, false);
        assert.ok(result.errorMessage!.includes('No platform credentials'));
    });

    it('fetches GA4 metrics', async () => {
        const fetch = mockFetch({ rows: [{ metricValues: [{ value: '1000' }, { value: '800' }, { value: '50' }] }] });
        const result = await fetchCampaignMetrics({
            dateFrom: '2026-05-01', dateTo: '2026-05-31',
            ga4PropertyId: '123456', ga4AccessToken: 'tok',
        }, fetch);
        assert.equal(result.ok, true);
        const ga4 = result.platforms.find((p) => p.platform === 'google_analytics')!;
        assert.ok(ga4);
        assert.equal(ga4.conversions, 50);
    });

    it('handles GA4 API error gracefully', async () => {
        const fetch = mockFetch({}, false, 403);
        const result = await fetchCampaignMetrics({
            dateFrom: '2026-05-01', dateTo: '2026-05-31',
            ga4PropertyId: '123456', ga4AccessToken: 'tok',
        }, fetch);
        assert.equal(result.ok, true);
        const ga4 = result.platforms.find((p) => p.platform === 'google_analytics')!;
        assert.ok(ga4?.error);
    });

    it('aggregates metrics across platforms', async () => {
        let callCount = 0;
        const fetch: MonitorFetchFn = async () => {
            callCount++;
            if (callCount === 1) return { ok: true, status: 200, json: () => Promise.resolve({ rows: [{ metricValues: [{ value: '500' }, { value: '400' }, { value: '20' }] }] }) } as Response & { json: () => Promise<unknown> };
            return { ok: true, status: 200, json: () => Promise.resolve([{ results: [{ metrics: { impressions: 1000, clicks: 80, cost_micros: 5000000, conversions: 10 } }] }]) } as Response & { json: () => Promise<unknown> };
        };
        const result = await fetchCampaignMetrics({
            dateFrom: '2026-05-01', dateTo: '2026-05-31',
            ga4PropertyId: '123456', ga4AccessToken: 'tok1',
            googleAdsCustomerId: 'cust1', googleAdsAccessToken: 'tok2',
        }, fetch);
        assert.equal(result.ok, true);
        assert.equal(result.platforms.length, 2);
        assert.ok(result.aggregate.totalSpend >= 0);
    });
});
