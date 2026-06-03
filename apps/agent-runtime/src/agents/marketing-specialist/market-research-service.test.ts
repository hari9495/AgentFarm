import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { conductMarketResearch } from './market-research-service.js';

describe('conductMarketResearch', () => {
    it('returns a complete report', async () => {
        const report = await conductMarketResearch({ industry: 'SaaS', targetAudience: 'B2B startup founders' });
        assert.equal(report.industry, 'SaaS');
        assert.ok(report.trends.length > 0);
        assert.ok(report.personas.length > 0);
        assert.ok(report.keyInsights.length > 0);
    });
    it('includes SaaS-specific trends', async () => {
        const report = await conductMarketResearch({ industry: 'SaaS', targetAudience: 'CTOs' });
        const saasThemes = ['SaaS', 'usage', 'FinOps', 'pricing'];
        assert.ok(report.trends.some((t) => saasThemes.some((theme) => t.trend.toLowerCase().includes(theme.toLowerCase()))));
    });
    it('uses enterprise persona for enterprise audience', async () => {
        const report = await conductMarketResearch({ industry: 'Enterprise Software', targetAudience: 'Enterprise CIOs' });
        assert.ok(report.personas.find((p) => p.jobTitle.includes('C-Suite') || p.jobTitle.includes('SVP')));
    });
    it('estimates TAM with geography multiplier', async () => {
        const globalReport = await conductMarketResearch({ industry: 'SaaS', targetAudience: 'SMBs', geographies: ['Global'] });
        const usReport = await conductMarketResearch({ industry: 'SaaS', targetAudience: 'SMBs', geographies: ['US'] });
        assert.ok(globalReport.tamEstimate !== null);
        assert.ok(usReport.tamEstimate !== null);
    });
    it('respects researchTopics filter', async () => {
        const report = await conductMarketResearch({ industry: 'SaaS', targetAudience: 'founders', researchTopics: ['personas'] });
        assert.ok(report.personas.length > 0);
        assert.equal(report.trends.length, 0);
        assert.equal(report.tamEstimate, null);
    });
    it('includes content opportunities', async () => {
        assert.ok((await conductMarketResearch({ industry: 'Fintech', targetAudience: 'CFOs' })).contentOpportunities.length > 0);
    });
});
