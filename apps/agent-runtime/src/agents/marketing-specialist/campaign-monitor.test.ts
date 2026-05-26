import { describe, it, expect, vi } from 'vitest';
import { fetchCampaignMetrics } from './campaign-monitor.js';
import type { MonitorFetchFn } from './campaign-monitor.js';

function mockFetch(body: unknown, ok = true, status = 200): MonitorFetchFn {
    return vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(body) });
}

describe('fetchCampaignMetrics', () => {
    it('returns error when no credentials provided', async () => {
        const result = await fetchCampaignMetrics({ dateFrom: '2026-05-01', dateTo: '2026-05-31' });
        expect(result.ok).toBe(false);
        expect(result.errorMessage).toContain('No platform credentials');
    });

    it('fetches GA4 metrics', async () => {
        const fetch = mockFetch({
            rows: [{ metricValues: [{ value: '1000' }, { value: '800' }, { value: '50' }] }],
        });
        const result = await fetchCampaignMetrics({
            dateFrom: '2026-05-01',
            dateTo: '2026-05-31',
            ga4PropertyId: '123456',
            ga4AccessToken: 'tok',
        }, fetch);
        expect(result.ok).toBe(true);
        const ga4 = result.platforms.find((p) => p.platform === 'google_analytics');
        expect(ga4).toBeDefined();
        expect(ga4!.conversions).toBe(50);
    });

    it('handles GA4 API error gracefully', async () => {
        const fetch = mockFetch({}, false, 403);
        const result = await fetchCampaignMetrics({
            dateFrom: '2026-05-01',
            dateTo: '2026-05-31',
            ga4PropertyId: '123456',
            ga4AccessToken: 'tok',
        }, fetch);
        expect(result.ok).toBe(true);
        const ga4 = result.platforms.find((p) => p.platform === 'google_analytics');
        expect(ga4?.error).toBeDefined();
    });

    it('aggregates metrics across platforms', async () => {
        const fetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true, status: 200,
                json: () => Promise.resolve({ rows: [{ metricValues: [{ value: '500' }, { value: '400' }, { value: '20' }] }] }),
            })
            .mockResolvedValueOnce({
                ok: true, status: 200,
                json: () => Promise.resolve([{ results: [{ metrics: { impressions: 1000, clicks: 80, cost_micros: 5000000, conversions: 10 } }] }]),
            }) as MonitorFetchFn;

        const result = await fetchCampaignMetrics({
            dateFrom: '2026-05-01',
            dateTo: '2026-05-31',
            ga4PropertyId: '123456',
            ga4AccessToken: 'tok1',
            googleAdsCustomerId: 'cust1',
            googleAdsAccessToken: 'tok2',
        }, fetch);

        expect(result.ok).toBe(true);
        expect(result.platforms.length).toBe(2);
        expect(result.aggregate.totalSpend).toBeGreaterThanOrEqual(0);
    });
});
