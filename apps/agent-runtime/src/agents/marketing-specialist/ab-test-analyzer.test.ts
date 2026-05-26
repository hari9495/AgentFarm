import { describe, it, expect } from 'vitest';
import { analyzeAbTest } from './ab-test-analyzer.js';

describe('analyzeAbTest', () => {
    it('declares significant winner when sample is large enough', () => {
        const result = analyzeAbTest({
            testName: 'CTA Button Color',
            metric: 'click-through rate',
            variants: [
                { name: 'Control (Blue)', impressions: 10000, conversions: 200 },
                { name: 'Challenger (Green)', impressions: 10000, conversions: 350 },
            ],
        });
        expect(result.isStatisticallySignificant).toBe(true);
        expect(result.winner).toBe('Challenger (Green)');
        expect(result.winnerUplift).toBeGreaterThan(0);
    });

    it('does not declare winner when test is underpowered', () => {
        const result = analyzeAbTest({
            testName: 'Headline Test',
            metric: 'conversion rate',
            variants: [
                { name: 'Control', impressions: 100, conversions: 10 },
                { name: 'Variant B', impressions: 100, conversions: 12 },
            ],
        });
        expect(result.isStatisticallySignificant).toBe(false);
        expect(result.winner).toBeNull();
    });

    it('computes correct conversion rates', () => {
        const result = analyzeAbTest({
            testName: 'Test',
            metric: 'CVR',
            variants: [
                { name: 'A', impressions: 1000, conversions: 50 },
                { name: 'B', impressions: 1000, conversions: 80 },
            ],
        });
        const a = result.variants.find((v) => v.name === 'A')!;
        const b = result.variants.find((v) => v.name === 'B')!;
        expect(a.conversionRate).toBeCloseTo(0.05, 3);
        expect(b.conversionRate).toBeCloseTo(0.08, 3);
    });

    it('provides Wilson confidence intervals', () => {
        const result = analyzeAbTest({
            testName: 'Test',
            metric: 'CVR',
            variants: [
                { name: 'A', impressions: 1000, conversions: 50 },
            ],
        });
        const a = result.variants[0]!;
        expect(a.confidenceInterval.lower).toBeGreaterThan(0);
        expect(a.confidenceInterval.upper).toBeLessThan(1);
        expect(a.confidenceInterval.lower).toBeLessThan(a.conversionRate);
        expect(a.confidenceInterval.upper).toBeGreaterThan(a.conversionRate);
    });

    it('uses 99% confidence when specified', () => {
        const result = analyzeAbTest({
            testName: 'High Stakes Test',
            metric: 'CVR',
            confidenceLevel: 0.99,
            variants: [
                { name: 'A', impressions: 10000, conversions: 200 },
                { name: 'B', impressions: 10000, conversions: 350 },
            ],
        });
        expect(result.confidenceLevel).toBe(0.99);
    });

    it('computes CPA when spend is provided', () => {
        const result = analyzeAbTest({
            testName: 'Ad Copy Test',
            metric: 'CPA',
            variants: [
                { name: 'A', impressions: 5000, conversions: 100, spend: 1000 },
                { name: 'B', impressions: 5000, conversions: 120, spend: 1000 },
            ],
        });
        const a = result.variants.find((v) => v.name === 'A')!;
        expect(a.cpa).toBeCloseTo(10, 1);
    });

    it('handles zero conversions gracefully', () => {
        const result = analyzeAbTest({
            testName: 'Zero Conv Test',
            metric: 'CVR',
            variants: [
                { name: 'A', impressions: 1000, conversions: 0 },
                { name: 'B', impressions: 1000, conversions: 0 },
            ],
        });
        expect(result.isStatisticallySignificant).toBe(false);
    });
});
