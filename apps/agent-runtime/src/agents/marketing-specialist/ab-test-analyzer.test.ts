import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAbTest } from './ab-test-analyzer.js';

const closeTo = (a: number, b: number, d = 2) => Math.abs(a - b) < Math.pow(10, -d) / 2;

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
        assert.equal(result.isStatisticallySignificant, true);
        assert.equal(result.winner, 'Challenger (Green)');
        assert.ok((result.winnerUplift ?? 0) > 0);
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
        assert.equal(result.isStatisticallySignificant, false);
        assert.equal(result.winner, null);
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
        assert.ok(closeTo(a.conversionRate, 0.05, 3), `Expected ~0.05, got ${a.conversionRate}`);
        assert.ok(closeTo(b.conversionRate, 0.08, 3), `Expected ~0.08, got ${b.conversionRate}`);
    });

    it('provides Wilson confidence intervals', () => {
        const result = analyzeAbTest({
            testName: 'Test',
            metric: 'CVR',
            variants: [{ name: 'A', impressions: 1000, conversions: 50 }],
        });
        const a = result.variants[0]!;
        assert.ok(a.confidenceInterval.lower > 0);
        assert.ok(a.confidenceInterval.upper < 1);
        assert.ok(a.confidenceInterval.lower < a.conversionRate);
        assert.ok(a.confidenceInterval.upper > a.conversionRate);
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
        assert.equal(result.confidenceLevel, 0.99);
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
        assert.ok(closeTo(a.cpa!, 10, 1), `Expected ~10, got ${a.cpa}`);
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
        assert.equal(result.isStatisticallySignificant, false);
    });
});
