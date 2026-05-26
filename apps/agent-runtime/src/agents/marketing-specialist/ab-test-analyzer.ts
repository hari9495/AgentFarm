/**
 * A/B Test Analyzer
 *
 * Analyzes A/B test results using chi-squared statistical significance testing.
 * Recommends a winner and provides confidence intervals for conversion rates.
 */

export interface AbTestVariant {
    name: string;
    impressions: number;
    conversions: number;
    spend?: number;
    label?: string;
}

export interface AbTestInput {
    testName: string;
    metric: string;
    variants: AbTestVariant[];
    confidenceLevel?: 0.90 | 0.95 | 0.99;
    minimumDetectableEffect?: number;
}

export interface VariantResult extends AbTestVariant {
    conversionRate: number;
    confidenceInterval: { lower: number; upper: number };
    cpa?: number;
    relativeUplift?: number;
}

export interface AbTestResult {
    testName: string;
    metric: string;
    analyzedAt: string;
    confidenceLevel: number;
    isStatisticallySignificant: boolean;
    chiSquaredStatistic: number;
    pValue: number;
    winner: string | null;
    winnerUplift: number | null;
    variants: VariantResult[];
    recommendation: string;
    nextSteps: string[];
}

// ---------------------------------------------------------------------------
// Chi-squared test
// ---------------------------------------------------------------------------

function chiSquared(variants: AbTestVariant[]): { chi2: number; pValue: number } {
    const totalImpressions = variants.reduce((s, v) => s + v.impressions, 0);
    const totalConversions = variants.reduce((s, v) => s + v.conversions, 0);

    if (totalImpressions === 0 || totalConversions === 0) return { chi2: 0, pValue: 1 };

    const overallRate = totalConversions / totalImpressions;
    let chi2 = 0;

    for (const v of variants) {
        const expectedConv = v.impressions * overallRate;
        const expectedNonConv = v.impressions * (1 - overallRate);
        const observedConv = v.conversions;
        const observedNonConv = v.impressions - v.conversions;
        if (expectedConv > 0) chi2 += Math.pow(observedConv - expectedConv, 2) / expectedConv;
        if (expectedNonConv > 0) chi2 += Math.pow(observedNonConv - expectedNonConv, 2) / expectedNonConv;
    }

    // p-value approximation for df=1 (chi-squared CDF approximation)
    const pValue = Math.exp(-chi2 / 2);
    return { chi2: Math.round(chi2 * 1000) / 1000, pValue: Math.round(pValue * 10000) / 10000 };
}

// ---------------------------------------------------------------------------
// Wilson score confidence interval
// ---------------------------------------------------------------------------

function wilsonInterval(
    conversions: number,
    impressions: number,
    z: number,
): { lower: number; upper: number } {
    if (impressions === 0) return { lower: 0, upper: 0 };
    const p = conversions / impressions;
    const n = impressions;
    const denom = 1 + (z * z) / n;
    const center = (p + (z * z) / (2 * n)) / denom;
    const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
    return {
        lower: Math.max(0, Math.round((center - margin) * 10000) / 10000),
        upper: Math.min(1, Math.round((center + margin) * 10000) / 10000),
    };
}

const Z_SCORES: Record<number, number> = { 0.90: 1.645, 0.95: 1.96, 0.99: 2.576 };
const CHI2_THRESHOLDS: Record<number, number> = { 0.90: 2.706, 0.95: 3.841, 0.99: 6.635 };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function analyzeAbTest(input: AbTestInput): AbTestResult {
    const confidenceLevel = input.confidenceLevel ?? 0.95;
    const z = Z_SCORES[confidenceLevel] ?? 1.96;
    const chi2Threshold = CHI2_THRESHOLDS[confidenceLevel] ?? 3.841;

    const { chi2, pValue } = chiSquared(input.variants);
    const isStatisticallySignificant = chi2 >= chi2Threshold;

    const variantResults: VariantResult[] = input.variants.map((v) => ({
        ...v,
        conversionRate: v.impressions > 0 ? Math.round((v.conversions / v.impressions) * 100000) / 100000 : 0,
        confidenceInterval: wilsonInterval(v.conversions, v.impressions, z),
        cpa: v.spend != null && v.conversions > 0 ? Math.round((v.spend / v.conversions) * 100) / 100 : undefined,
    }));

    // Find winner (highest conversion rate)
    const sorted = [...variantResults].sort((a, b) => b.conversionRate - a.conversionRate);
    const best = sorted[0]!;
    const control = variantResults[0]!;

    // Compute relative uplift vs control
    for (const v of variantResults) {
        v.relativeUplift = control.conversionRate > 0
            ? Math.round(((v.conversionRate - control.conversionRate) / control.conversionRate) * 1000) / 10
            : 0;
    }

    const winner = isStatisticallySignificant ? best.name : null;
    const winnerUplift = isStatisticallySignificant && best !== control
        ? best.relativeUplift ?? null
        : null;

    // Recommendation
    let recommendation: string;
    let nextSteps: string[];

    if (!isStatisticallySignificant) {
        const totalSamples = input.variants.reduce((s, v) => s + v.impressions, 0);
        const minSamplesEstimate = Math.ceil(
            (z * z * 2 * (control.conversionRate * (1 - control.conversionRate))) /
            Math.pow((input.minimumDetectableEffect ?? 0.05) * control.conversionRate, 2),
        );
        recommendation = `Test is not yet statistically significant at ${confidenceLevel * 100}% confidence (chi² = ${chi2}, p = ${pValue}). ${totalSamples.toLocaleString()} samples collected; estimated ${minSamplesEstimate.toLocaleString()} needed for ${input.minimumDetectableEffect ?? 5}% MDE.`;
        nextSteps = [
            'Continue running the test — do not declare a winner early',
            `Collect approximately ${Math.max(0, minSamplesEstimate - totalSamples).toLocaleString()} more samples`,
            'Check for sample ratio mismatch (SRM) if one variant has significantly more traffic',
        ];
    } else if (winner === control.name) {
        recommendation = `Control variant "${control.name}" is the winner with ${(control.conversionRate * 100).toFixed(2)}% conversion rate (statistically significant at ${confidenceLevel * 100}%).`;
        nextSteps = [
            'Keep control as the production variant',
            'Document learnings — what hypothesis was disproved?',
            'Iterate with a new test hypothesis based on these results',
        ];
    } else {
        recommendation = `Challenger "${winner}" wins with ${(best.conversionRate * 100).toFixed(2)}% conversion rate — ${Math.abs(winnerUplift ?? 0).toFixed(1)}% relative uplift over control (statistically significant at ${confidenceLevel * 100}%).`;
        nextSteps = [
            `Roll out "${winner}" to 100% of traffic`,
            'Archive losing variant creative/copy with test metadata for future reference',
            'Calculate projected revenue impact based on traffic volume and conversion lift',
            'Design the next A/B test to further optimize this element',
        ];
    }

    return {
        testName: input.testName,
        metric: input.metric,
        analyzedAt: new Date().toISOString(),
        confidenceLevel,
        isStatisticallySignificant,
        chiSquaredStatistic: chi2,
        pValue,
        winner,
        winnerUplift,
        variants: variantResults,
        recommendation,
        nextSteps,
    };
}
