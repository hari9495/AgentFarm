import { describe, it, expect } from 'vitest';
import { conductMarketResearch } from './market-research-service.js';

describe('conductMarketResearch', () => {
    it('returns a complete report', async () => {
        const report = await conductMarketResearch({
            industry: 'SaaS',
            targetAudience: 'B2B startup founders',
        });
        expect(report.industry).toBe('SaaS');
        expect(report.trends.length).toBeGreaterThan(0);
        expect(report.personas.length).toBeGreaterThan(0);
        expect(report.keyInsights.length).toBeGreaterThan(0);
    });

    it('includes SaaS-specific trends', async () => {
        const report = await conductMarketResearch({ industry: 'SaaS', targetAudience: 'CTOs' });
        const saasThemes = ['SaaS', 'usage', 'FinOps', 'pricing'];
        const hasSaasTrend = report.trends.some((t) =>
            saasThemes.some((theme) => t.trend.toLowerCase().includes(theme.toLowerCase())),
        );
        expect(hasSaasTrend).toBe(true);
    });

    it('uses enterprise persona for enterprise audience', async () => {
        const report = await conductMarketResearch({
            industry: 'Enterprise Software',
            targetAudience: 'Enterprise CIOs',
        });
        const enterprisePersona = report.personas.find((p) => p.jobTitle.includes('C-Suite') || p.jobTitle.includes('SVP'));
        expect(enterprisePersona).toBeDefined();
    });

    it('estimates TAM with geography multiplier', async () => {
        const globalReport = await conductMarketResearch({
            industry: 'SaaS',
            targetAudience: 'SMBs',
            geographies: ['Global'],
        });
        const usReport = await conductMarketResearch({
            industry: 'SaaS',
            targetAudience: 'SMBs',
            geographies: ['US'],
        });
        expect(globalReport.tamEstimate).not.toBeNull();
        expect(usReport.tamEstimate).not.toBeNull();
    });

    it('respects researchTopics filter', async () => {
        const report = await conductMarketResearch({
            industry: 'SaaS',
            targetAudience: 'founders',
            researchTopics: ['personas'],
        });
        expect(report.personas.length).toBeGreaterThan(0);
        expect(report.trends.length).toBe(0);
        expect(report.tamEstimate).toBeNull();
    });

    it('includes content opportunities', async () => {
        const report = await conductMarketResearch({ industry: 'Fintech', targetAudience: 'CFOs' });
        expect(report.contentOpportunities.length).toBeGreaterThan(0);
    });
});
