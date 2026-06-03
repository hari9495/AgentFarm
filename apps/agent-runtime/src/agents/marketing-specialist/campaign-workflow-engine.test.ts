import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCampaignWorkflow } from './campaign-workflow-engine.js';
import type { CampaignWorkflowInput } from './campaign-workflow-engine.js';

const BASE_INPUT: CampaignWorkflowInput = {
    campaignName: 'Q3 Lead Gen Campaign', product: 'AgentFarm', audience: 'B2B startup founders',
    goal: 'lead_generation', budget: 10000, currency: 'USD',
    startDate: '2026-07-01', endDate: '2026-07-28',
    brand: 'AgentFarm', industry: 'SaaS', seedKeywords: ['ai agents', 'workflow automation'],
};

describe('runCampaignWorkflow', () => {
    it('completes all steps by default', async () => {
        const result = await runCampaignWorkflow(BASE_INPUT);
        assert.equal(result.ok, true);
        assert.ok(result.completedSteps.length > 0);
        assert.equal(result.failedSteps.length, 0);
    });
    it('skips requested steps', async () => {
        const result = await runCampaignWorkflow({ ...BASE_INPUT, skipSteps: ['market_research', 'keyword_research'] });
        assert.ok(result.skippedSteps.includes('market_research'));
        assert.ok(result.skippedSteps.includes('keyword_research'));
        assert.ok(!result.completedSteps.includes('market_research'));
    });
    it('includes campaign_plan in completed steps', async () => {
        assert.ok((await runCampaignWorkflow(BASE_INPUT)).completedSteps.includes('campaign_plan'));
    });
    it('includes email_sequence in completed steps', async () => {
        assert.ok((await runCampaignWorkflow(BASE_INPUT)).completedSteps.includes('email_sequence'));
    });
    it('uses LLM caller for email sequence when provided', async () => {
        let callerCalled = 0;
        const callerFn = async (..._args: unknown[]) => { callerCalled++; return 'LLM email body content'; };
        const result = await runCampaignWorkflow(BASE_INPUT, { callerFn });
        assert.ok(callerCalled > 0, 'callerFn must have been called');
        assert.equal(result.ok, true);
    });
    it('includes step-level results with duration', async () => {
        for (const step of (await runCampaignWorkflow(BASE_INPUT)).stepResults) {
            assert.ok(step.durationMs >= 0);
            assert.equal(step.ok, true);
        }
    });
    it('produces a summary string', async () => {
        assert.ok((await runCampaignWorkflow(BASE_INPUT)).summary.includes('Q3 Lead Gen Campaign'));
    });
});
