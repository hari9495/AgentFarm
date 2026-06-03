import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildKpiReport } from './kpi-report-builder.js';
import type { KpiReportInput } from './kpi-report-builder.js';

const closeTo = (a: number, b: number, d = 1) => Math.abs(a - b) < Math.pow(10, -d) / 2;

const currentMetrics = [
    { channel: 'google_ads', impressions: 50000, clicks: 1500, spend: 3000, conversions: 60, revenue: 12000 },
    { channel: 'meta_ads', impressions: 80000, clicks: 800, spend: 2000, conversions: 25, revenue: 5000 },
];
const previousMetrics = [
    { channel: 'google_ads', impressions: 40000, clicks: 1000, spend: 2500, conversions: 40, revenue: 8000 },
    { channel: 'meta_ads', impressions: 60000, clicks: 600, spend: 1800, conversions: 20, revenue: 4000 },
];
const BASE_INPUT: KpiReportInput = {
    reportName: 'May 2026 Campaign Report', brand: 'AgentFarm',
    currentPeriod: { from: '2026-05-01', to: '2026-05-31' },
    previousPeriod: { from: '2026-04-01', to: '2026-04-30' },
    currentMetrics, previousMetrics,
    targets: { leads: 100, cpa: 60, roas: 4 }, currency: 'USD',
};

describe('buildKpiReport', () => {
    it('builds a report with topline KPIs', () => {
        const report = buildKpiReport(BASE_INPUT);
        assert.ok(report.toplineKpis.length > 0);
        const conv = report.toplineKpis.find((k) => k.name.includes('Conversion'))!;
        assert.ok(conv);
        assert.equal(conv.value, 85);
    });
    it('computes period-over-period change correctly', () => {
        const conv = buildKpiReport(BASE_INPUT).toplineKpis.find((k) => k.name.includes('Conversion'))!;
        assert.ok(closeTo(conv.changePercent!, 41.7, 0));
        assert.equal(conv.changeDirection, 'up');
    });
    it('computes blended CPA', () => {
        const cpaKpi = buildKpiReport(BASE_INPUT).toplineKpis.find((k) => k.name.includes('CPA'))!;
        assert.ok(cpaKpi);
        assert.ok(closeTo(cpaKpi.value, 5000 / 85, 1));
    });
    it('computes ROAS', () => {
        const roasKpi = buildKpiReport(BASE_INPUT).toplineKpis.find((k) => k.name === 'ROAS')!;
        assert.ok(roasKpi);
        assert.ok(closeTo(roasKpi.value, 3.4, 1));
    });
    it('sets target status correctly', () => {
        const conv = buildKpiReport(BASE_INPUT).toplineKpis.find((k) => k.name.includes('Conversion'))!;
        assert.equal(conv.targetStatus, 'behind');
    });
    it('builds channel breakdown with CTR', () => {
        const r = buildKpiReport(BASE_INPUT);
        assert.equal(r.channelBreakdown.length, 2);
        for (const ch of r.channelBreakdown) assert.ok(ch.ctr >= 0);
    });
    it('generates recommendations', () => {
        assert.ok(buildKpiReport(BASE_INPUT).recommendations.length > 0);
    });
    it('handles missing previous period gracefully', () => {
        const impressions = buildKpiReport({ ...BASE_INPUT, previousMetrics: undefined, previousPeriod: undefined }).toplineKpis.find((k) => k.name === 'Impressions')!;
        assert.equal(impressions.changePercent, undefined);
    });
});
