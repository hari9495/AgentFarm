import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeConversionFunnel } from './conversion-optimizer.js';
import type { ConversionFunnelData } from './conversion-optimizer.js';

const closeTo = (a: number, b: number, d = 2) => Math.abs(a - b) < Math.pow(10, -d) / 2;

const funnel: ConversionFunnelData = {
    funnelName: 'SaaS Free Trial Funnel', currency: 'USD', valuePerConversion: 100,
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
        assert.ok(closeTo(analyzeConversionFunnel(funnel).overallConversionRate, 0.004, 3));
    });
    it('identifies biggest drop-off step', () => {
        assert.ok(analyzeConversionFunnel(funnel).biggestDropOffStep);
    });
    it('computes step-level drop-off rates', () => {
        const landing = analyzeConversionFunnel(funnel).steps.find((s) => s.name === 'Landing Page')!;
        assert.ok(closeTo(landing.dropOffRate, 0.75, 2));
    });
    it('estimates lost value when valuePerConversion provided', () => {
        const r = analyzeConversionFunnel(funnel);
        assert.ok(r.totalLostValueEstimate);
        assert.ok(r.steps[0]!.lostValueEstimate! > 0);
    });
    it('produces prioritized recommendations', () => {
        const r = analyzeConversionFunnel(funnel);
        assert.ok(r.recommendations.length > 0);
        for (const rec of r.recommendations) {
            assert.ok(['critical', 'high', 'medium', 'low'].includes(rec.priority));
        }
    });
    it('produces quick wins', () => { assert.ok(analyzeConversionFunnel(funnel).quickWins.length > 0); });
    it('handles single-step funnel', () => {
        assert.ok(closeTo(analyzeConversionFunnel({ funnelName: 'X', steps: [{ name: 'S', visitors: 1000, conversions: 200 }] }).overallConversionRate, 0.2, 2));
    });
});
