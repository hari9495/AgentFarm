import { describe, it, expect } from 'vitest';
import { buildAlignmentReport } from './cross-team-aligner.js';
import type { AlignmentInput } from './cross-team-aligner.js';

const BASE_INPUT: AlignmentInput = {
    campaignContext: {
        campaignName: 'Q3 2026 Lead Gen Push',
        goal: 'Generate 500 MQLs in 6 weeks',
        targetAudience: 'B2B startup founders',
        launchDate: '2026-07-01',
        channels: ['google_search', 'linkedin_ads', 'email'],
        budget: 15000,
        currency: 'USD',
    },
    teamUpdates: [
        {
            team: 'sales',
            updates: ['Outbound volume up 20% this week'],
            blockers: ['Need campaign-specific one-pager before Thursday'],
            upcoming: ['SDR training on new messaging next Monday'],
        },
        {
            team: 'product',
            updates: ['New integration dashboard shipping June 30'],
            upcoming: ['Reporting v2 GA on July 5'],
        },
        {
            team: 'customer_success',
            updates: ['Q2 NPS at 48'],
        },
    ],
    marketingUpdates: ['Creatives approved', 'UTM parameters finalized'],
    sharedKpiTargets: { mql_target: 500, sql_rate: 25, pipeline_target: 250000 },
};

describe('buildAlignmentReport', () => {
    it('returns a report with action items for all teams', () => {
        const report = buildAlignmentReport(BASE_INPUT);
        const teams = new Set(report.teamActionItems.map((a) => a.team));
        expect(teams.has('sales')).toBe(true);
        expect(teams.has('product')).toBe(true);
        expect(teams.has('customer_success')).toBe(true);
    });

    it('surfaces blockers from team updates', () => {
        const report = buildAlignmentReport(BASE_INPUT);
        expect(report.blockers.length).toBeGreaterThan(0);
        expect(report.blockers[0]).toContain('sales');
    });

    it('includes marketing handoffs with launch date', () => {
        const report = buildAlignmentReport(BASE_INPUT);
        const hasLaunchDate = report.marketingHandoffs.some((h) => h.includes('2026-07-01'));
        expect(hasLaunchDate).toBe(true);
    });

    it('builds shared KPIs with targets', () => {
        const report = buildAlignmentReport(BASE_INPUT);
        expect(report.sharedKpis['Marketing — MQL Volume']).toBe('500');
    });

    it('marks blocker-related actions as urgent', () => {
        const report = buildAlignmentReport(BASE_INPUT);
        const urgentSales = report.teamActionItems.filter((a) => a.team === 'sales' && a.priority === 'urgent');
        expect(urgentSales.length).toBeGreaterThan(0);
    });

    it('sets next sync date in the future', () => {
        const report = buildAlignmentReport(BASE_INPUT);
        expect(new Date(report.nextSyncDate) > new Date()).toBe(true);
    });

    it('handles empty team updates', () => {
        const report = buildAlignmentReport({ ...BASE_INPUT, teamUpdates: [] });
        expect(report.teamActionItems.length).toBeGreaterThan(0);
        expect(report.blockers.length).toBe(0);
    });
});
