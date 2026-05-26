import { describe, it, expect } from 'vitest';
import {
    handleMarketingSpecialistAction,
    isMarketingSpecialistActionType,
    type MarketingSpecialistActionType,
} from './marketing-specialist-action-handler.js';

const BASE = {
    tenantId: 'tenant-1',
    botId: 'bot-1',
    taskId: 'task-1',
    workspaceDir: 'ws-1',
};

describe('isMarketingSpecialistActionType', () => {
    it('returns true for all 16 MS actions', () => {
        const actions: MarketingSpecialistActionType[] = [
            'workspace_ms_plan_campaign',
            'workspace_ms_monitor_campaign',
            'workspace_ms_optimize_ppc',
            'workspace_ms_segment_audience',
            'workspace_ms_analyze_competitor',
            'workspace_ms_keyword_research',
            'workspace_ms_build_email_sequence',
            'workspace_ms_schedule_social',
            'workspace_ms_generate_kpi_report',
            'workspace_ms_analyze_ab_test',
            'workspace_ms_market_research',
            'workspace_ms_optimize_conversion',
            'workspace_ms_coordinate_assets',
            'workspace_ms_align_cross_team',
            'workspace_ms_run_campaign_workflow',
            'workspace_ms_request_human_gate',
        ];
        for (const a of actions) {
            expect(isMarketingSpecialistActionType(a)).toBe(true);
        }
    });

    it('returns false for non-MS action types', () => {
        expect(isMarketingSpecialistActionType('workspace_ba_draft_brd')).toBe(false);
        expect(isMarketingSpecialistActionType('workspace_cw_write_blog_post')).toBe(false);
        expect(isMarketingSpecialistActionType('')).toBe(false);
    });
});

describe('handleMarketingSpecialistAction — workspace_ms_plan_campaign', () => {
    it('returns ok with a campaign plan', async () => {
        const result = await handleMarketingSpecialistAction({
            ...BASE,
            actionType: 'workspace_ms_plan_campaign',
            payload: {
                product: 'AgentFarm',
                audience: 'B2B founders',
                goal: 'lead_generation',
                budget: 20000,
                currency: 'USD',
                startDate: '2026-07-01',
                endDate: '2026-07-31',
            },
        });
        expect(result.ok).toBe(true);
        expect(result.output).toContain('lead_generation');
    });

    it('returns error when product is missing', async () => {
        const result = await handleMarketingSpecialistAction({
            ...BASE,
            actionType: 'workspace_ms_plan_campaign',
            payload: { goal: 'lead_generation', budget: 5000, audience: 'SMBs' },
        });
        expect(result.ok).toBe(false);
    });
});

describe('handleMarketingSpecialistAction — workspace_ms_optimize_ppc', () => {
    it('returns ppc recommendations', async () => {
        const result = await handleMarketingSpecialistAction({
            ...BASE,
            actionType: 'workspace_ms_optimize_ppc',
            payload: {
                campaigns: [
                    { id: 'c1', name: 'Brand Search', platform: 'google', impressions: 10000, clicks: 500, conversions: 10, spend: 1000, revenue: 5000 },
                    { id: 'c2', name: 'Competitor KW', platform: 'google', impressions: 8000, clicks: 40, conversions: 0, spend: 800, revenue: 0 },
                ],
            },
        });
        expect(result.ok).toBe(true);
        expect(result.output).toBeTruthy();
    });
});

describe('handleMarketingSpecialistAction — workspace_ms_market_research', () => {
    it('returns market research report', async () => {
        const result = await handleMarketingSpecialistAction({
            ...BASE,
            actionType: 'workspace_ms_market_research',
            payload: {
                industry: 'SaaS',
                targetAudience: 'B2B startup founders',
            },
        });
        expect(result.ok).toBe(true);
        expect(result.output).toContain('SaaS');
    });

    it('returns error when targetAudience is missing', async () => {
        const result = await handleMarketingSpecialistAction({
            ...BASE,
            actionType: 'workspace_ms_market_research',
            payload: { industry: 'SaaS' },
        });
        expect(result.ok).toBe(false);
    });
});

describe('handleMarketingSpecialistAction — workspace_ms_analyze_ab_test', () => {
    it('declares a winner for a significant test', async () => {
        const result = await handleMarketingSpecialistAction({
            ...BASE,
            actionType: 'workspace_ms_analyze_ab_test',
            payload: {
                testName: 'CTA Button Colour',
                metric: 'conversion_rate',
                variants: [
                    { name: 'Blue', visitors: 5000, conversions: 250 },
                    { name: 'Green', visitors: 5000, conversions: 325 },
                ],
                confidenceLevel: 95,
            },
        });
        expect(result.ok).toBe(true);
        expect(result.output).toContain('winner');
    });

    it('returns error when metric is missing', async () => {
        const result = await handleMarketingSpecialistAction({
            ...BASE,
            actionType: 'workspace_ms_analyze_ab_test',
            payload: {
                testName: 'Button Test',
                variants: [
                    { name: 'A', visitors: 100, conversions: 5 },
                    { name: 'B', visitors: 100, conversions: 8 },
                ],
            },
        });
        expect(result.ok).toBe(false);
    });
});

describe('handleMarketingSpecialistAction — workspace_ms_generate_kpi_report', () => {
    it('returns a KPI report', async () => {
        const result = await handleMarketingSpecialistAction({
            ...BASE,
            actionType: 'workspace_ms_generate_kpi_report',
            payload: {
                reportName: 'Q2 KPI Report',
                brand: 'AgentFarm',
                currentPeriod: { start: '2026-04-01', end: '2026-06-30', label: 'Q2 2026' },
                currentMetrics: [
                    { channel: 'google_ads', impressions: 100000, clicks: 4000, conversions: 200, spend: 8000, revenue: 40000 },
                    { channel: 'meta_ads', impressions: 80000, clicks: 2400, conversions: 120, spend: 4000, revenue: 18000 },
                ],
            },
        });
        expect(result.ok).toBe(true);
        expect(result.output).toContain('AgentFarm');
    });

    it('returns error when brand is missing', async () => {
        const result = await handleMarketingSpecialistAction({
            ...BASE,
            actionType: 'workspace_ms_generate_kpi_report',
            payload: {
                currentPeriod: { start: '2026-04-01', end: '2026-06-30' },
                currentMetrics: [{ channel: 'google_ads', impressions: 1000, clicks: 50, conversions: 5, spend: 200, revenue: 1000 }],
            },
        });
        expect(result.ok).toBe(false);
    });
});

describe('handleMarketingSpecialistAction — workspace_ms_request_human_gate', () => {
    it('builds an approval gate record for budget_commitment', async () => {
        const result = await handleMarketingSpecialistAction({
            ...BASE,
            actionType: 'workspace_ms_request_human_gate',
            payload: {
                gateType: 'budget_commitment',
                campaignName: 'Big Spend Q3',
                detail: 'Need approval for $50k budget',
            },
        });
        expect(result.ok).toBe(true);
        expect(result.output).toContain('budget_commitment');
    });

    it('returns error for unknown gate type', async () => {
        const result = await handleMarketingSpecialistAction({
            ...BASE,
            actionType: 'workspace_ms_request_human_gate',
            payload: {
                gateType: 'not_a_real_gate',
                campaignName: 'Test',
            },
        });
        expect(result.ok).toBe(false);
    });
});

describe('handleMarketingSpecialistAction — workspace_ms_segment_audience', () => {
    it('returns segmented audience groups', async () => {
        const result = await handleMarketingSpecialistAction({
            ...BASE,
            actionType: 'workspace_ms_segment_audience',
            payload: {
                segments: [
                    { id: 's1', name: 'Enterprise', size: 500, conversionRate: 0.12, avgOrderValue: 5000, engagementScore: 0.8, bounceRate: 0.2 },
                    { id: 's2', name: 'SMB', size: 3000, conversionRate: 0.04, avgOrderValue: 400, engagementScore: 0.5, bounceRate: 0.45 },
                ],
            },
        });
        expect(result.ok).toBe(true);
        expect(result.output).toContain('segments');
    });
});

describe('handleMarketingSpecialistAction — workspace_ms_optimize_conversion', () => {
    it('returns CRO recommendations', async () => {
        const result = await handleMarketingSpecialistAction({
            ...BASE,
            actionType: 'workspace_ms_optimize_conversion',
            payload: {
                steps: [
                    { name: 'landing_page', visitors: 10000, conversions: 3000 },
                    { name: 'sign_up', visitors: 3000, conversions: 900 },
                    { name: 'checkout', visitors: 900, conversions: 180 },
                ],
                avgOrderValue: 99,
                currency: 'USD',
            },
        });
        expect(result.ok).toBe(true);
    });
});

describe('handleMarketingSpecialistAction — workspace_ms_align_cross_team', () => {
    it('returns cross-team alignment report', async () => {
        const result = await handleMarketingSpecialistAction({
            ...BASE,
            actionType: 'workspace_ms_align_cross_team',
            payload: {
                campaignContext: {
                    campaignName: 'Launch Day',
                    goal: 'lead_generation',
                    targetAudience: 'B2B founders',
                    launchDate: '2026-07-01',
                    budget: 50000,
                    currency: 'USD',
                    channels: ['google_ads', 'linkedin_ads'],
                },
                teamUpdates: [],
                marketingUpdates: ['Campaign plan finalized', 'Creative brief sent'],
            },
        });
        expect(result.ok).toBe(true);
        expect(result.output).toContain('Launch Day');
    });

    it('returns error when campaignContext is missing', async () => {
        const result = await handleMarketingSpecialistAction({
            ...BASE,
            actionType: 'workspace_ms_align_cross_team',
            payload: { marketingUpdates: ['something'] },
        });
        expect(result.ok).toBe(false);
    });
});
