import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAlignmentReport } from './cross-team-aligner.js';
import type { AlignmentInput } from './cross-team-aligner.js';

const BASE_INPUT: AlignmentInput = {
    campaignContext: {
        campaignName: 'Q3 2026 Lead Gen Push', goal: 'Generate 500 MQLs in 6 weeks',
        targetAudience: 'B2B startup founders', launchDate: '2026-07-01',
        channels: ['google_search', 'linkedin_ads', 'email'], budget: 15000, currency: 'USD',
    },
    teamUpdates: [
        { team: 'sales', updates: ['Outbound volume up 20% this week'], blockers: ['Need campaign-specific one-pager before Thursday'], upcoming: ['SDR training'] },
        { team: 'product', updates: ['New integration dashboard shipping June 30'], upcoming: ['Reporting v2 GA on July 5'] },
        { team: 'customer_success', updates: ['Q2 NPS at 48'] },
    ],
    marketingUpdates: ['Creatives approved', 'UTM parameters finalized'],
    sharedKpiTargets: { mql_target: 500, sql_rate: 25, pipeline_target: 250000 },
};

describe('buildAlignmentReport', () => {
    it('returns a report with action items for all teams', () => {
        const teams = new Set(buildAlignmentReport(BASE_INPUT).teamActionItems.map((a) => a.team));
        assert.ok(teams.has('sales'));
        assert.ok(teams.has('product'));
        assert.ok(teams.has('customer_success'));
    });
    it('surfaces blockers from team updates', () => {
        const r = buildAlignmentReport(BASE_INPUT);
        assert.ok(r.blockers.length > 0);
        assert.ok(r.blockers[0]!.includes('sales'));
    });
    it('includes marketing handoffs with launch date', () => {
        assert.ok(buildAlignmentReport(BASE_INPUT).marketingHandoffs.some((h) => h.includes('2026-07-01')));
    });
    it('builds shared KPIs with targets', () => {
        assert.equal(buildAlignmentReport(BASE_INPUT).sharedKpis['Marketing — MQL Volume'], '500');
    });
    it('marks blocker-related actions as urgent', () => {
        assert.ok(buildAlignmentReport(BASE_INPUT).teamActionItems.filter((a) => a.team === 'sales' && a.priority === 'urgent').length > 0);
    });
    it('sets next sync date in the future', () => {
        assert.ok(new Date(buildAlignmentReport(BASE_INPUT).nextSyncDate) > new Date());
    });
    it('handles empty team updates', () => {
        const r = buildAlignmentReport({ ...BASE_INPUT, teamUpdates: [] });
        assert.ok(r.teamActionItems.length > 0);
        assert.equal(r.blockers.length, 0);
    });
});
