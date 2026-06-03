import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCampaignPlan } from './campaign-planner.js';
import type { CampaignBrief } from './campaign-planner.js';

const BASE_BRIEF: CampaignBrief = {
    goal: 'lead_generation', product: 'AgentFarm Platform', audience: 'B2B SaaS founders',
    budget: 10000, currency: 'USD', startDate: '2026-06-01', endDate: '2026-06-28',
};

describe('buildCampaignPlan', () => {
    it('returns a plan with all required fields', () => {
        const plan = buildCampaignPlan(BASE_BRIEF);
        assert.equal(plan.goal, 'lead_generation');
        assert.equal(plan.totalBudget, 10000);
        assert.ok(plan.channels.length > 0);
        assert.ok(plan.milestones.length > 0);
        assert.ok(plan.kpis.length > 0);
        assert.ok(plan.summary.includes('lead generation'));
    });
    it('allocates 100% of budget across channels', () => {
        assert.equal(buildCampaignPlan(BASE_BRIEF).channels.reduce((s, c) => s + c.allocatedPct, 0), 100);
    });
    it('respects channel filter when provided', () => {
        const names = buildCampaignPlan({ ...BASE_BRIEF, channels: ['google_search', 'email'] }).channels.map((c) => c.channel);
        assert.ok(names.includes('google_search'));
        assert.ok(names.includes('email'));
        assert.ok(!names.includes('meta_ads'));
    });
    it('generates brand_awareness plan with display channels', () => {
        assert.ok(buildCampaignPlan({ ...BASE_BRIEF, goal: 'brand_awareness' }).channels.map((c) => c.channel).includes('google_display'));
    });
    it('builds milestones for multi-week campaign', () => {
        const plan = buildCampaignPlan(BASE_BRIEF);
        assert.equal(plan.milestones[0]!.week, 1);
        assert.ok(plan.milestones[plan.milestones.length - 1]!.label.includes('Close'));
    });
    it('includes key actions for each channel', () => {
        for (const ch of buildCampaignPlan(BASE_BRIEF).channels) {
            assert.ok(ch.keyActions.length > 0);
            assert.ok(ch.rationale.length > 0);
        }
    });
    it('handles invalid dates gracefully', () => {
        assert.ok(buildCampaignPlan({ ...BASE_BRIEF, startDate: 'bad', endDate: 'bad' }).milestones.length > 0);
    });
});
