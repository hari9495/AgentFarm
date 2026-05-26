/**
 * PPC Optimizer
 *
 * Analyzes paid search and social campaign performance and produces
 * data-driven optimization recommendations: bid adjustments, budget reallocation,
 * audience/keyword pruning, and creative refresh signals.
 *
 * Pure logic — no external API calls.
 */

export type OptimizationGoal = 'maximize_conversions' | 'target_cpa' | 'maximize_roas' | 'maximize_clicks';

export interface PpcCampaignData {
    campaignId: string;
    campaignName: string;
    platform: 'google_ads' | 'meta_ads' | 'linkedin_ads';
    impressions: number;
    clicks: number;
    spend: number;
    conversions: number;
    revenue?: number;
    dailyBudget: number;
    currentBidStrategy?: string;
}

export type RecommendationAction =
    | 'increase_budget'
    | 'decrease_budget'
    | 'increase_bid'
    | 'decrease_bid'
    | 'pause_campaign'
    | 'scale_campaign'
    | 'refresh_creative'
    | 'expand_audience'
    | 'narrow_audience'
    | 'no_action';

export interface PpcRecommendation {
    campaignId: string;
    campaignName: string;
    platform: string;
    action: RecommendationAction;
    rationale: string;
    estimatedImpact: string;
    priority: 'high' | 'medium' | 'low';
}

export interface PpcOptimizationReport {
    goal: OptimizationGoal;
    analyzedAt: string;
    totalSpend: number;
    totalConversions: number;
    blendedCpa: number | null;
    blendedRoas: number | null;
    recommendations: PpcRecommendation[];
    summary: string;
}

function ctr(data: PpcCampaignData): number {
    return data.impressions > 0 ? data.clicks / data.impressions : 0;
}

function cpa(data: PpcCampaignData): number | null {
    return data.conversions > 0 ? data.spend / data.conversions : null;
}

function roas(data: PpcCampaignData): number | null {
    return data.revenue != null && data.spend > 0 ? data.revenue / data.spend : null;
}

function budgetUtilization(data: PpcCampaignData): number {
    return data.dailyBudget > 0 ? data.spend / data.dailyBudget : 0;
}

function classifyRecommendation(
    data: PpcCampaignData,
    goal: OptimizationGoal,
): PpcRecommendation {
    const campaignCtr = ctr(data);
    const campaignCpa = cpa(data);
    const campaignRoas = roas(data);
    const util = budgetUtilization(data);

    // Zero conversions with meaningful spend — highest priority signal
    if (data.conversions === 0 && data.spend > data.dailyBudget * 3) {
        return {
            campaignId: data.campaignId,
            campaignName: data.campaignName,
            platform: data.platform,
            action: 'pause_campaign',
            rationale: `Zero conversions after spending ${data.spend.toFixed(2)} (>${3}x daily budget). Audience or offer mismatch likely.`,
            estimatedImpact: 'Pause to audit landing page, audience targeting, and offer relevance before reactivating.',
            priority: 'high',
        };
    }

    // Low CTR signal → creative fatigue
    if (campaignCtr < 0.005 && data.impressions > 5000) {
        return {
            campaignId: data.campaignId,
            campaignName: data.campaignName,
            platform: data.platform,
            action: 'refresh_creative',
            rationale: `CTR of ${(campaignCtr * 100).toFixed(2)}% is below 0.5% threshold after ${data.impressions.toLocaleString()} impressions — likely creative fatigue.`,
            estimatedImpact: 'New creatives typically recover 15–40% CTR lift within 7 days.',
            priority: 'high',
        };
    }

    if (goal === 'maximize_roas') {
        if (campaignRoas !== null && campaignRoas >= 4 && util < 0.9) {
            return {
                campaignId: data.campaignId,
                campaignName: data.campaignName,
                platform: data.platform,
                action: 'increase_budget',
                rationale: `ROAS of ${campaignRoas.toFixed(2)}x is strong and budget is not fully utilized (${(util * 100).toFixed(0)}%). Scale to capture more return.`,
                estimatedImpact: `Estimated +${Math.round((1 - util) * data.dailyBudget)} additional daily budget at current ROAS.`,
                priority: 'high',
            };
        }
        if (campaignRoas !== null && campaignRoas < 1.5) {
            return {
                campaignId: data.campaignId,
                campaignName: data.campaignName,
                platform: data.platform,
                action: 'decrease_budget',
                rationale: `ROAS of ${campaignRoas.toFixed(2)}x is below breakeven. Reduce spend and focus on higher-converting segments.`,
                estimatedImpact: 'Cutting budget 30–50% will reduce losses while you optimize targeting and bids.',
                priority: 'high',
            };
        }
    }

    if (goal === 'target_cpa' || goal === 'maximize_conversions') {
        if (campaignCpa !== null && campaignCpa > 0) {
            // Good CPA + budget underutilized → scale
            if (campaignCpa < 50 && util < 0.85) {
                return {
                    campaignId: data.campaignId,
                    campaignName: data.campaignName,
                    platform: data.platform,
                    action: 'scale_campaign',
                    rationale: `CPA of ${campaignCpa.toFixed(2)} is efficient and budget is ${(util * 100).toFixed(0)}% utilized. Room to scale.`,
                    estimatedImpact: `Increase budget by 20–30% to capture additional volume at current CPA.`,
                    priority: 'medium',
                };
            }
            // High CPA → bid down or narrow audience
            if (campaignCpa > 200) {
                return {
                    campaignId: data.campaignId,
                    campaignName: data.campaignName,
                    platform: data.platform,
                    action: 'narrow_audience',
                    rationale: `CPA of ${campaignCpa.toFixed(2)} is high. Narrow targeting to highest-converting segments to reduce wasted spend.`,
                    estimatedImpact: 'Audience narrowing typically reduces CPA 15–25% within 2 weeks.',
                    priority: 'high',
                };
            }
        }
    }

    if (goal === 'maximize_clicks') {
        if (util > 0.95 && campaignCtr > 0.02) {
            return {
                campaignId: data.campaignId,
                campaignName: data.campaignName,
                platform: data.platform,
                action: 'increase_budget',
                rationale: `Budget fully utilized (${(util * 100).toFixed(0)}%) with strong CTR of ${(campaignCtr * 100).toFixed(2)}%. Increase budget to capture more traffic.`,
                estimatedImpact: `Estimated +${Math.round(data.clicks * 0.2)} additional clicks per day with 20% budget increase.`,
                priority: 'medium',
            };
        }
        if (campaignCtr < 0.01) {
            return {
                campaignId: data.campaignId,
                campaignName: data.campaignName,
                platform: data.platform,
                action: 'increase_bid',
                rationale: `Low CTR of ${(campaignCtr * 100).toFixed(2)}% suggests ad rank is too low. Increase bids to improve position.`,
                estimatedImpact: 'Bid increase of 15–20% typically improves ad position and CTR within 48 hours.',
                priority: 'medium',
            };
        }
    }

    return {
        campaignId: data.campaignId,
        campaignName: data.campaignName,
        platform: data.platform,
        action: 'no_action',
        rationale: 'Campaign is performing within acceptable thresholds. Continue monitoring.',
        estimatedImpact: 'Maintain current settings and review again after 7 days.',
        priority: 'low',
    };
}

export function analyzePpcPerformance(
    campaigns: PpcCampaignData[],
    goal: OptimizationGoal = 'maximize_conversions',
): PpcOptimizationReport {
    const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
    const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
    const totalRevenue = campaigns.reduce((s, c) => s + (c.revenue ?? 0), 0);

    const recommendations = campaigns.map((c) => classifyRecommendation(c, goal));
    const highPriority = recommendations.filter((r) => r.priority === 'high').length;

    const blendedCpa = totalConversions > 0 ? totalSpend / totalConversions : null;
    const blendedRoas = totalRevenue > 0 && totalSpend > 0 ? totalRevenue / totalSpend : null;

    const summary =
        `Analyzed ${campaigns.length} campaign(s) for goal: ${goal.replace(/_/g, ' ')}. ` +
        `Total spend: $${totalSpend.toFixed(2)}, total conversions: ${totalConversions}` +
        (blendedCpa ? `, blended CPA: $${blendedCpa.toFixed(2)}` : '') +
        (blendedRoas ? `, blended ROAS: ${blendedRoas.toFixed(2)}x` : '') +
        `. ${highPriority} high-priority recommendation(s) require immediate attention.`;

    return {
        goal,
        analyzedAt: new Date().toISOString(),
        totalSpend,
        totalConversions,
        blendedCpa,
        blendedRoas,
        recommendations,
        summary,
    };
}
