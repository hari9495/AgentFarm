/**
 * Conversion Rate Optimizer
 *
 * Analyzes marketing funnel data to identify conversion bottlenecks
 * and produces prioritized CRO recommendations.
 * Pure logic — no external API calls.
 */

export interface FunnelStep {
    name: string;
    visitors: number;
    conversions: number;
    label?: string;
}

export interface ConversionFunnelData {
    funnelName: string;
    currency?: string;
    valuePerConversion?: number;
    steps: FunnelStep[];
    industryBenchmarks?: Record<string, number>;
}

export interface StepAnalysis extends FunnelStep {
    conversionRate: number;
    dropOffRate: number;
    dropOffCount: number;
    benchmark?: number;
    gap?: number;
    lostValueEstimate?: number;
}

export interface CroRecommendation {
    step: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    issue: string;
    suggestion: string;
    estimatedUplift: string;
    effortLevel: 'low' | 'medium' | 'high';
}

export interface CroReport {
    funnelName: string;
    analyzedAt: string;
    overallConversionRate: number;
    biggestDropOffStep: string;
    totalLostValueEstimate: string | null;
    steps: StepAnalysis[];
    recommendations: CroRecommendation[];
    quickWins: string[];
    summary: string;
}

// ---------------------------------------------------------------------------
// Industry benchmarks (default)
// ---------------------------------------------------------------------------

const DEFAULT_BENCHMARKS: Record<string, number> = {
    'Landing Page': 0.25,
    'Sign Up': 0.35,
    'Trial': 0.40,
    'Onboarding': 0.60,
    'Activation': 0.55,
    'Paid': 0.25,
    'Checkout': 0.45,
    'Purchase': 0.70,
};

function getBenchmark(stepName: string, custom?: Record<string, number>): number | undefined {
    const key = Object.keys({ ...DEFAULT_BENCHMARKS, ...(custom ?? {}) }).find((k) =>
        stepName.toLowerCase().includes(k.toLowerCase()),
    );
    return key ? ({ ...DEFAULT_BENCHMARKS, ...(custom ?? {}) })[key] : undefined;
}

// ---------------------------------------------------------------------------
// Recommendation templates
// ---------------------------------------------------------------------------

function buildRecommendation(step: StepAnalysis, index: number, totalSteps: number): CroRecommendation {
    const stepLower = step.name.toLowerCase();

    if (stepLower.includes('landing') || stepLower.includes('page')) {
        return {
            step: step.name,
            priority: step.dropOffRate > 0.7 ? 'critical' : 'high',
            issue: `${(step.dropOffRate * 100).toFixed(1)}% of visitors leave the landing page without converting`,
            suggestion: 'Run A/B tests on: headline clarity, hero image relevance, primary CTA copy, and social proof placement. Ensure page load time < 2.5s.',
            estimatedUplift: '10–30% conversion rate improvement from headline + CTA optimization',
            effortLevel: 'medium',
        };
    }
    if (stepLower.includes('sign') || stepLower.includes('register') || stepLower.includes('form')) {
        return {
            step: step.name,
            priority: step.dropOffRate > 0.6 ? 'critical' : 'high',
            issue: `${(step.dropOffRate * 100).toFixed(1)}% of visitors abandon the sign-up form`,
            suggestion: 'Reduce form fields to minimum required (name, email, password). Add social login (Google/GitHub). Show security badges. Add progress indicator for multi-step forms.',
            estimatedUplift: '15–25% lift from reducing form fields and adding social login',
            effortLevel: 'low',
        };
    }
    if (stepLower.includes('checkout') || stepLower.includes('payment')) {
        return {
            step: step.name,
            priority: 'critical',
            issue: `${(step.dropOffRate * 100).toFixed(1)}% cart/checkout abandonment`,
            suggestion: 'Enable guest checkout. Add trust seals and payment logos. Show order summary. Send cart abandonment emails within 1 hour. Offer buy-now-pay-later options.',
            estimatedUplift: '20–35% recovery via cart abandonment email sequence',
            effortLevel: 'medium',
        };
    }
    if (stepLower.includes('activation') || stepLower.includes('onboard')) {
        return {
            step: step.name,
            priority: step.dropOffRate > 0.5 ? 'high' : 'medium',
            issue: `${(step.dropOffRate * 100).toFixed(1)}% of sign-ups don't reach the activation moment`,
            suggestion: 'Define a single "aha moment" and design onboarding to reach it in < 5 minutes. Add progress checklists. Send behavior-triggered emails for stuck users. Offer in-app guided tours.',
            estimatedUplift: '10–20% improvement in trial-to-paid conversion from better onboarding',
            effortLevel: 'high',
        };
    }
    if (stepLower.includes('trial') || stepLower.includes('demo')) {
        return {
            step: step.name,
            priority: 'high',
            issue: `${(step.dropOffRate * 100).toFixed(1)}% of trials don't convert to paid`,
            suggestion: 'Add an in-app upgrade prompt at the moment of value. Trigger a human outreach (email or call) when trial users hit usage limits. Create urgency with trial countdown notifications.',
            estimatedUplift: '5–15% trial-to-paid lift from timely upgrade prompts',
            effortLevel: 'medium',
        };
    }

    return {
        step: step.name,
        priority: step.dropOffRate > 0.6 ? 'high' : 'medium',
        issue: `${(step.dropOffRate * 100).toFixed(1)}% drop-off at step ${index + 1} of ${totalSteps}`,
        suggestion: 'Analyze session recordings (Hotjar / FullStory) and exit-intent surveys to identify the primary friction point. Run usability tests with 5 representative users.',
        estimatedUplift: 'Qualitative research typically surfaces 3–5 high-impact quick wins',
        effortLevel: 'low',
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function analyzeConversionFunnel(input: ConversionFunnelData): CroReport {
    const steps: StepAnalysis[] = input.steps.map((step, i) => {
        const prevStep = input.steps[i - 1];
        const baseVisitors = i === 0 ? step.visitors : (prevStep?.visitors ?? step.visitors);
        const dropOffCount = baseVisitors - step.conversions;
        const dropOffRate = baseVisitors > 0 ? dropOffCount / baseVisitors : 0;
        const conversionRate = baseVisitors > 0 ? step.conversions / baseVisitors : 0;
        const benchmark = getBenchmark(step.name, input.industryBenchmarks);
        const gap = benchmark != null ? conversionRate - benchmark : undefined;
        const lostValue = input.valuePerConversion != null
            ? dropOffCount * input.valuePerConversion
            : undefined;
        return {
            ...step,
            conversionRate: Math.round(conversionRate * 10000) / 10000,
            dropOffRate: Math.round(dropOffRate * 10000) / 10000,
            dropOffCount,
            benchmark,
            gap: gap != null ? Math.round(gap * 10000) / 10000 : undefined,
            lostValueEstimate: lostValue,
        };
    });

    const biggestDropOff = [...steps].sort((a, b) => b.dropOffRate - a.dropOffRate)[0]!;
    const firstStep = input.steps[0];
    const lastStep = input.steps[input.steps.length - 1];
    const overallRate = firstStep && firstStep.visitors > 0 && lastStep
        ? lastStep.conversions / firstStep.visitors
        : 0;

    const totalLostValue = steps.reduce((s, step) => s + (step.lostValueEstimate ?? 0), 0);
    const currency = input.currency ?? 'USD';

    const topDropSteps = [...steps]
        .sort((a, b) => b.dropOffRate - a.dropOffRate)
        .slice(0, 3);

    const recommendations: CroRecommendation[] = topDropSteps.map((step, i) =>
        buildRecommendation(step, steps.indexOf(step), steps.length),
    );

    const quickWins = [
        'Add a progress indicator to multi-step forms — reduces abandonment by ~15%',
        'A/B test the primary CTA button copy (e.g., "Start free trial" vs "Get started free")',
        'Enable Google/GitHub SSO to remove password friction from sign-up',
        `Send a re-engagement email to users who dropped off at "${biggestDropOff.name}" within 24 hours`,
        'Add a live chat widget on high-traffic landing pages during business hours',
    ];

    const summary =
        `${input.funnelName} overall conversion rate: ${(overallRate * 100).toFixed(2)}%. ` +
        `Biggest drop-off: "${biggestDropOff.name}" (${(biggestDropOff.dropOffRate * 100).toFixed(1)}% leave). ` +
        (totalLostValue > 0 ? `Estimated lost value: ${currency}${totalLostValue.toLocaleString()}. ` : '') +
        `${recommendations.filter((r) => r.priority === 'critical').length} critical issue(s) require immediate attention.`;

    return {
        funnelName: input.funnelName,
        analyzedAt: new Date().toISOString(),
        overallConversionRate: Math.round(overallRate * 10000) / 10000,
        biggestDropOffStep: biggestDropOff.name,
        totalLostValueEstimate: totalLostValue > 0 ? `${currency}${Math.round(totalLostValue).toLocaleString()}` : null,
        steps,
        recommendations,
        quickWins,
        summary,
    };
}
