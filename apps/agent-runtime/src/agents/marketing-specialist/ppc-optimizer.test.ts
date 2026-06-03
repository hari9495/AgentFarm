import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzePpcPerformance } from './ppc-optimizer.js';
import type { PpcCampaignData } from './ppc-optimizer.js';

const closeTo = (a: number, b: number, d = 2) => Math.abs(a - b) < Math.pow(10, -d) / 2;

const goodCampaign: PpcCampaignData = { campaignId: 'c1', campaignName: 'Brand Keywords', platform: 'google_ads', impressions: 10000, clicks: 500, spend: 1000, conversions: 30, revenue: 6000, dailyBudget: 200 };
const zeroCvCampaign: PpcCampaignData = { campaignId: 'c2', campaignName: 'Prospecting', platform: 'meta_ads', impressions: 50000, clicks: 200, spend: 800, conversions: 0, dailyBudget: 100 };
const lowCtrCampaign: PpcCampaignData = { campaignId: 'c3', campaignName: 'Display Retargeting', platform: 'google_ads', impressions: 100000, clicks: 100, spend: 300, conversions: 5, dailyBudget: 50 };

describe('analyzePpcPerformance', () => {
    it('returns a valid report structure', () => {
        const r = analyzePpcPerformance([goodCampaign]);
        assert.equal(r.recommendations.length, 1);
        assert.equal(r.totalSpend, 1000);
        assert.ok(r.summary.includes('1 campaign'));
    });
    it('recommends pause for zero-conversion campaign with high spend', () => {
        const r = analyzePpcPerformance([zeroCvCampaign]);
        assert.equal(r.recommendations[0]!.action, 'pause_campaign');
        assert.equal(r.recommendations[0]!.priority, 'high');
    });
    it('recommends creative refresh for low CTR campaign', () => {
        assert.equal(analyzePpcPerformance([lowCtrCampaign]).recommendations[0]!.action, 'refresh_creative');
    });
    it('computes blended CPA correctly', () => {
        assert.ok(closeTo(analyzePpcPerformance([goodCampaign]).blendedCpa!, 1000 / 30, 2));
    });
    it('computes blended ROAS when revenue provided', () => {
        assert.ok(closeTo(analyzePpcPerformance([goodCampaign], 'maximize_roas').blendedRoas!, 6, 1));
    });
    it('recommends scale for efficient CPA with underutilized budget', () => {
        const efficient: PpcCampaignData = { ...goodCampaign, campaignId: 'c4', spend: 100, conversions: 10, dailyBudget: 200 };
        assert.equal(analyzePpcPerformance([efficient], 'maximize_conversions').recommendations[0]!.action, 'scale_campaign');
    });
    it('handles empty campaign list', () => {
        const r = analyzePpcPerformance([]);
        assert.equal(r.totalSpend, 0);
        assert.equal(r.recommendations.length, 0);
    });
});
