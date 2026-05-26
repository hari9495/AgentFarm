import { describe, it, expect } from 'vitest';
import { buildKpiReport } from './kpi-report-builder.js';
import type { KpiReportInput } from './kpi-report-builder.js';

const currentMetrics = [
    { channel: 'google_ads', impressions: 50000, clicks: 1500, spend: 3000, conversions: 60, revenue: 12000 },
    { channel: 'meta_ads', impressions: 80000, clicks: 800, spend: 2000, conversions: 25, revenue: 5000 },
];

const previousMetrics = [
    { channel: 'google_ads', impressions: 40000, clicks: 1000, spend: 2500, conversions: 40, revenue: 8000 },
    { channel: 'meta_ads', impressions: 60000, clicks: 600, spend: 1800, conversions: 20, revenue: 4000 },
];

const BASE_INPUT: KpiReportInput = {
    reportName: 'May 2026 Campaign Report',
    brand: 'AgentFarm',
    currentPeriod: { from: '2026-05-01', to: '2026-05-31' },
    previousPeriod: { from: '2026-04-01', to: '2026-04-30' },
    currentMetrics,
    previousMetrics,
    targets: { leads: 100, cpa: 60, roas: 4 },
    currency: 'USD',
};

describe('buildKpiReport', () => {
    it('builds a report with topline KPIs', () => {
        const report = buildKpiReport(BASE_INPUT);
        expect(report.toplineKpis.length).toBeGreaterThan(0);
        const conversionsKpi = report.toplineKpis.find((k) => k.name.includes('Conversion'));
        expect(conversionsKpi).toBeDefined();
        expect(conversionsKpi!.value).toBe(85);
    });

    it('computes period-over-period change correctly', () => {
        const report = buildKpiReport(BASE_INPUT);
        const conversions = report.toplineKpis.find((k) => k.name.includes('Conversion'))!;
        // (85 - 60) / 60 * 100 = 41.7%
        expect(conversions.changePercent).toBeCloseTo(41.7, 0);
        expect(conversions.changeDirection).toBe('up');
    });

    it('computes blended CPA', () => {
        const report = buildKpiReport(BASE_INPUT);
        const cpaKpi = report.toplineKpis.find((k) => k.name.includes('CPA'));
        expect(cpaKpi).toBeDefined();
        // spend: 5000, conversions: 85
        expect(cpaKpi!.value).toBeCloseTo(5000 / 85, 1);
    });

    it('computes ROAS', () => {
        const report = buildKpiReport(BASE_INPUT);
        const roasKpi = report.toplineKpis.find((k) => k.name === 'ROAS');
        expect(roasKpi).toBeDefined();
        // revenue: 17000, spend: 5000
        expect(roasKpi!.value).toBeCloseTo(3.4, 1);
    });

    it('sets target status correctly', () => {
        const report = buildKpiReport(BASE_INPUT);
        const conversions = report.toplineKpis.find((k) => k.name.includes('Conversion'))!;
        expect(conversions.targetStatus).toBe('behind'); // 85 < 100
    });

    it('builds channel breakdown with CTR', () => {
        const report = buildKpiReport(BASE_INPUT);
        expect(report.channelBreakdown.length).toBe(2);
        for (const ch of report.channelBreakdown) {
            expect(ch.ctr).toBeGreaterThanOrEqual(0);
        }
    });

    it('generates recommendations', () => {
        const report = buildKpiReport(BASE_INPUT);
        expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it('handles missing previous period gracefully', () => {
        const report = buildKpiReport({ ...BASE_INPUT, previousMetrics: undefined, previousPeriod: undefined });
        const impressions = report.toplineKpis.find((k) => k.name === 'Impressions')!;
        expect(impressions.changePercent).toBeUndefined();
    });
});
