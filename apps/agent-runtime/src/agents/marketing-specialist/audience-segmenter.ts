/**
 * Audience Segmenter
 *
 * Segments audiences based on demographic, behavioral, and conversion data.
 * Ranks segments by value and recommends tailored messaging per segment.
 * Pure logic — no external API calls.
 */

export interface AudienceSegmentInput {
    segments: RawSegmentData[];
    totalBudget?: number;
}

export interface RawSegmentData {
    segmentId: string;
    label: string;
    size: number;
    conversions: number;
    revenue?: number;
    avgSessionDuration?: number;
    bounceRate?: number;
    demographics?: {
        ageRange?: string;
        gender?: string;
        location?: string;
        industry?: string;
        jobTitle?: string;
    };
}

export interface AudienceSegment {
    segmentId: string;
    label: string;
    size: number;
    conversionRate: number;
    valueScore: number;
    tier: 'champion' | 'high_value' | 'growth' | 'low_priority';
    recommendedMessaging: string;
    recommendedChannels: string[];
    budgetAllocationPct: number;
}

export interface AudienceSegmentResult {
    analyzedAt: string;
    totalAudienceSize: number;
    segments: AudienceSegment[];
    summary: string;
}

function conversionRate(s: RawSegmentData): number {
    return s.size > 0 ? s.conversions / s.size : 0;
}

function computeValueScore(s: RawSegmentData): number {
    const cr = conversionRate(s);
    const revPerConv = s.revenue != null && s.conversions > 0 ? s.revenue / s.conversions : 0;
    const engagementBonus = s.avgSessionDuration != null ? Math.min(s.avgSessionDuration / 300, 1) : 0;
    const bouncepenalty = s.bounceRate != null ? (1 - s.bounceRate) : 0.5;
    return (cr * 50) + (revPerConv / 100) + (engagementBonus * 10) + (bouncepenalty * 5);
}

function tierFromScore(score: number, maxScore: number): AudienceSegment['tier'] {
    const pct = maxScore > 0 ? score / maxScore : 0;
    if (pct >= 0.7) return 'champion';
    if (pct >= 0.4) return 'high_value';
    if (pct >= 0.2) return 'growth';
    return 'low_priority';
}

function recommendedMessaging(tier: AudienceSegment['tier'], label: string): string {
    switch (tier) {
        case 'champion':
            return `Exclusive offers, loyalty recognition, and upsell/cross-sell for "${label}" — your highest-converting segment. Lead with ROI proof points and social proof.`;
        case 'high_value':
            return `Value-focused messaging for "${label}": highlight time savings, cost reduction, and success stories. Offer demos and trials to accelerate conversion.`;
        case 'growth':
            return `Education-first approach for "${label}": awareness content, how-to guides, and comparison content to move prospects down the funnel.`;
        case 'low_priority':
            return `Minimal investment for "${label}": retargeting only with evergreen brand content. Re-evaluate if segment shows engagement improvement.`;
    }
}

function recommendedChannels(tier: AudienceSegment['tier'], demographics?: RawSegmentData['demographics']): string[] {
    const isB2b = demographics?.industry != null || demographics?.jobTitle != null;
    switch (tier) {
        case 'champion':
            return isB2b
                ? ['email', 'linkedin_ads', 'account_based_marketing']
                : ['email', 'meta_retargeting', 'google_search'];
        case 'high_value':
            return isB2b
                ? ['linkedin_ads', 'google_search', 'email']
                : ['meta_ads', 'google_search', 'email'];
        case 'growth':
            return ['seo_content', 'social_organic', 'google_display'];
        case 'low_priority':
            return ['social_organic', 'email_nurture'];
    }
}

export function segmentAudience(input: AudienceSegmentInput): AudienceSegmentResult {
    const scores = input.segments.map((s) => ({ s, score: computeValueScore(s) }));
    const maxScore = Math.max(...scores.map((x) => x.score), 1);

    const totalScore = scores.reduce((sum, x) => sum + Math.max(x.score, 0.01), 0);

    const segments: AudienceSegment[] = scores.map(({ s, score }) => {
        const tier = tierFromScore(score, maxScore);
        const normScore = Math.max(score, 0.01);
        return {
            segmentId: s.segmentId,
            label: s.label,
            size: s.size,
            conversionRate: conversionRate(s),
            valueScore: Math.round(score * 100) / 100,
            tier,
            recommendedMessaging: recommendedMessaging(tier, s.label),
            recommendedChannels: recommendedChannels(tier, s.demographics),
            budgetAllocationPct: Math.round((normScore / totalScore) * 100),
        };
    });

    segments.sort((a, b) => b.valueScore - a.valueScore);

    const champions = segments.filter((s) => s.tier === 'champion').length;
    const totalSize = input.segments.reduce((sum, s) => sum + s.size, 0);

    return {
        analyzedAt: new Date().toISOString(),
        totalAudienceSize: totalSize,
        segments,
        summary: `Analyzed ${segments.length} segment(s) across ${totalSize.toLocaleString()} users. ${champions} champion segment(s) identified for priority investment.`,
    };
}
