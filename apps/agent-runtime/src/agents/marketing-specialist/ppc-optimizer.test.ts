import { describe, it, expect } from 'vitest';
import { analyzePpcPerformance } from './ppc-optimizer.js';
import type { PpcCampaignData } from './ppc-optimizer.js';

const goodCampaign: PpcCampaignData = {
    campaignId: 'c1',
    campaignName: 'Brand Keywords',
    platform: 'google_ads',
    impressions: 10000,
    clicks: 500,
    spend: 1000,
    conversions: 30,
    revenue: 6000,
    dailyBudget: 200,
};

const zeroCvCampaign: PpcCampaignData = {
    campaignId: 'c2',
    campaignName: 'Prospecting',
    platform: 'meta_ads',
    impressions: 50000,
    clicks: 200,
    spend: 800,
    conversions: 0,
    dailyBudget: 100,
};

const lowCtrCampaign: PpcCampaignData = {
    campaignId: 'c3',
    campaignName: 'Display Retargeting',
    platform: 'google_ads',
    impressions: 100000,
    clicks: 100,
    spend: 300,
    conversions: 5,
    dailyBudget: 50,
};

describe('analyzePpcPerformance', () => {
    it('returns a valid report structure', () => {
        const report = analyzePpcPerformance([goodCampaign]);
        expect(report.recommendations.length).toBe(1);
        expect(report.totalSpend).toBe(1000);
        expect(report.summary).toContain('1 campaign');
    });

    it('recommends pause for zero-conversion campaign with high spend', () => {
        const report = analyzePpcPerformance([zeroCvCampaign]);
        expect(report.recommendations[0]!.action).toBe('pause_campaign');
        expect(report.recommendations[0]!.priority).toBe('high');
    });

    it('recommends creative refresh for low CTR campaign', () => {
        const report = analyzePpcPerformance([lowCtrCampaign]);
        expect(report.recommendations[0]!.action).toBe('refresh_creative');
    });

    it('computes blended CPA correctly', () => {
        const report = analyzePpcPerformance([goodCampaign]);
        expect(report.blendedCpa).toBeCloseTo(1000 / 30, 2);
    });

    it('computes blended ROAS when revenue provided', () => {
        const report = analyzePpcPerformance([goodCampaign], 'maximize_roas');
        expect(report.blendedRoas).toBeCloseTo(6, 1);
    });

    it('recommends scale for efficient CPA with underutilized budget', () => {
        const efficient: PpcCampaignData = {
            ...goodCampaign,
            campaignId: 'c4',
            spend: 100,
            conversions: 10,
            dailyBudget: 200,
        };
        const report = analyzePpcPerformance([efficient], 'maximize_conversions');
        expect(report.recommendations[0]!.action).toBe('scale_campaign');
    });

    it('handles empty campaign list', () => {
        const report = analyzePpcPerformance([]);
        expect(report.totalSpend).toBe(0);
        expect(report.recommendations.length).toBe(0);
    });
});
