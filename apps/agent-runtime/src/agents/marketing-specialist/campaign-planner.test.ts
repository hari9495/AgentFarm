import { describe, it, expect } from 'vitest';
import { buildCampaignPlan } from './campaign-planner.js';
import type { CampaignBrief } from './campaign-planner.js';

const BASE_BRIEF: CampaignBrief = {
    goal: 'lead_generation',
    product: 'AgentFarm Platform',
    audience: 'B2B SaaS founders',
    budget: 10000,
    currency: 'USD',
    startDate: '2026-06-01',
    endDate: '2026-06-28',
};

describe('buildCampaignPlan', () => {
    it('returns a plan with all required fields', () => {
        const plan = buildCampaignPlan(BASE_BRIEF);
        expect(plan.goal).toBe('lead_generation');
        expect(plan.totalBudget).toBe(10000);
        expect(plan.channels.length).toBeGreaterThan(0);
        expect(plan.milestones.length).toBeGreaterThan(0);
        expect(plan.kpis.length).toBeGreaterThan(0);
        expect(plan.summary).toContain('lead generation');
    });

    it('allocates 100% of budget across channels', () => {
        const plan = buildCampaignPlan(BASE_BRIEF);
        const totalPct = plan.channels.reduce((sum, c) => sum + c.allocatedPct, 0);
        expect(totalPct).toBe(100);
    });

    it('respects channel filter when provided', () => {
        const filtered = buildCampaignPlan({ ...BASE_BRIEF, channels: ['google_search', 'email'] });
        const channelNames = filtered.channels.map((c) => c.channel);
        expect(channelNames).toContain('google_search');
        expect(channelNames).toContain('email');
        expect(channelNames).not.toContain('meta_ads');
    });

    it('generates brand_awareness plan with display channels', () => {
        const plan = buildCampaignPlan({ ...BASE_BRIEF, goal: 'brand_awareness' });
        const channels = plan.channels.map((c) => c.channel);
        expect(channels).toContain('google_display');
    });

    it('builds milestones for multi-week campaign', () => {
        const plan = buildCampaignPlan(BASE_BRIEF);
        expect(plan.milestones[0].week).toBe(1);
        expect(plan.milestones[plan.milestones.length - 1].label).toContain('Close');
    });

    it('includes key actions for each channel', () => {
        const plan = buildCampaignPlan(BASE_BRIEF);
        for (const ch of plan.channels) {
            expect(ch.keyActions.length).toBeGreaterThan(0);
            expect(ch.rationale.length).toBeGreaterThan(0);
        }
    });

    it('handles invalid dates gracefully', () => {
        const plan = buildCampaignPlan({ ...BASE_BRIEF, startDate: 'bad', endDate: 'bad' });
        expect(plan.milestones.length).toBeGreaterThan(0);
    });
});
