import { describe, it, expect } from 'vitest';
import { analyzeConversionFunnel } from './conversion-optimizer.js';
import type { ConversionFunnelData } from './conversion-optimizer.js';

const funnel: ConversionFunnelData = {
    funnelName: 'SaaS Free Trial Funnel',
    currency: 'USD',
    valuePerConversion: 100,
    steps: [
        { name: 'Landing Page', visitors: 10000, conversions: 2500 },
        { name: 'Sign Up', visitors: 2500, conversions: 1200 },
        { name: 'Activation', visitors: 1200, conversions: 600 },
        { name: 'Trial', visitors: 600, conversions: 120 },
        { name: 'Paid', visitors: 120, conversions: 40 },
    ],
};

describe('analyzeConversionFunnel', () => {
    it('computes overall conversion rate', () => {
        const report = analyzeConversionFunnel(funnel);
        // 40 / 10000 = 0.004
        expect(report.overallConversionRate).toBeCloseTo(0.004, 3);
    });

    it('identifies biggest drop-off step', () => {
        const report = analyzeConversionFunnel(funnel);
        expect(report.biggestDropOffStep).toBeTruthy();
    });

    it('computes step-level drop-off rates', () => {
        const report = analyzeConversionFunnel(funnel);
        const landingStep = report.steps.find((s) => s.name === 'Landing Page')!;
        // (10000 - 2500) / 10000 = 0.75
        expect(landingStep.dropOffRate).toBeCloseTo(0.75, 2);
    });

    it('estimates lost value when valuePerConversion provided', () => {
        const report = analyzeConversionFunnel(funnel);
        expect(report.totalLostValueEstimate).toBeTruthy();
        expect(report.steps[0]!.lostValueEstimate).toBeGreaterThan(0);
    });

    it('produces prioritized recommendations', () => {
        const report = analyzeConversionFunnel(funnel);
        expect(report.recommendations.length).toBeGreaterThan(0);
        for (const rec of report.recommendations) {
            expect(['critical', 'high', 'medium', 'low']).toContain(rec.priority);
        }
    });

    it('produces quick wins', () => {
        const report = analyzeConversionFunnel(funnel);
        expect(report.quickWins.length).toBeGreaterThan(0);
    });

    it('handles single-step funnel', () => {
        const report = analyzeConversionFunnel({
            funnelName: 'Single Step',
            steps: [{ name: 'Sign Up', visitors: 1000, conversions: 200 }],
        });
        expect(report.overallConversionRate).toBeCloseTo(0.2, 2);
    });
});
