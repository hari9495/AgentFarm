import { describe, it, expect, vi } from 'vitest';
import { runCampaignWorkflow } from './campaign-workflow-engine.js';
import type { CampaignWorkflowInput } from './campaign-workflow-engine.js';

const BASE_INPUT: CampaignWorkflowInput = {
    campaignName: 'Q3 Lead Gen Campaign',
    product: 'AgentFarm',
    audience: 'B2B startup founders',
    goal: 'lead_generation',
    budget: 10000,
    currency: 'USD',
    startDate: '2026-07-01',
    endDate: '2026-07-28',
    brand: 'AgentFarm',
    industry: 'SaaS',
    seedKeywords: ['ai agents', 'workflow automation'],
};

describe('runCampaignWorkflow', () => {
    it('completes all steps by default', async () => {
        const result = await runCampaignWorkflow(BASE_INPUT);
        expect(result.ok).toBe(true);
        expect(result.completedSteps.length).toBeGreaterThan(0);
        expect(result.failedSteps.length).toBe(0);
    });

    it('skips requested steps', async () => {
        const result = await runCampaignWorkflow({
            ...BASE_INPUT,
            skipSteps: ['market_research', 'keyword_research'],
        });
        expect(result.skippedSteps).toContain('market_research');
        expect(result.skippedSteps).toContain('keyword_research');
        expect(result.completedSteps).not.toContain('market_research');
    });

    it('includes campaign_plan in completed steps', async () => {
        const result = await runCampaignWorkflow(BASE_INPUT);
        expect(result.completedSteps).toContain('campaign_plan');
    });

    it('includes email_sequence in completed steps', async () => {
        const result = await runCampaignWorkflow(BASE_INPUT);
        expect(result.completedSteps).toContain('email_sequence');
    });

    it('uses LLM caller for email sequence when provided', async () => {
        const callerFn = vi.fn().mockResolvedValue('LLM email body content');
        const result = await runCampaignWorkflow(BASE_INPUT, { callerFn });
        expect(callerFn).toHaveBeenCalled();
        expect(result.ok).toBe(true);
    });

    it('includes step-level results with duration', async () => {
        const result = await runCampaignWorkflow(BASE_INPUT);
        for (const step of result.stepResults) {
            expect(step.durationMs).toBeGreaterThanOrEqual(0);
            expect(step.ok).toBe(true);
        }
    });

    it('produces a summary string', async () => {
        const result = await runCampaignWorkflow(BASE_INPUT);
        expect(result.summary).toContain('Q3 Lead Gen Campaign');
    });
});
