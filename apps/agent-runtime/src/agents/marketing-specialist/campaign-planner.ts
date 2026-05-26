/**
 * Campaign Planner
 *
 * Builds structured multi-channel campaign plans from a brief.
 * Allocates budget across channels, defines KPIs, and produces milestones.
 * Pure logic — no external API calls.
 */

export type CampaignChannel =
    | 'google_search'
    | 'google_display'
    | 'meta_ads'
    | 'linkedin_ads'
    | 'email'
    | 'seo_content'
    | 'social_organic';

export type CampaignGoal =
    | 'brand_awareness'
    | 'lead_generation'
    | 'pipeline_acceleration'
    | 'customer_retention'
    | 'product_launch'
    | 'event_promotion';

export interface CampaignBrief {
    goal: CampaignGoal;
    product: string;
    audience: string;
    budget: number;
    currency: string;
    startDate: string;
    endDate: string;
    region?: string;
    channels?: CampaignChannel[];
}

export interface ChannelAllocation {
    channel: CampaignChannel;
    allocatedBudget: number;
    allocatedPct: number;
    rationale: string;
    keyActions: string[];
}

export interface Milestone {
    week: number;
    label: string;
    deliverables: string[];
}

export interface CampaignKpi {
    metric: string;
    target: string;
    measurement: string;
}

export interface CampaignPlan {
    goal: CampaignGoal;
    product: string;
    audience: string;
    totalBudget: number;
    currency: string;
    startDate: string;
    endDate: string;
    channels: ChannelAllocation[];
    milestones: Milestone[];
    kpis: CampaignKpi[];
    summary: string;
}

// Default channel mix by goal (budget percentages)
const GOAL_CHANNEL_MIX: Record<CampaignGoal, Partial<Record<CampaignChannel, number>>> = {
    brand_awareness: {
        google_display: 30,
        meta_ads: 30,
        linkedin_ads: 20,
        social_organic: 10,
        seo_content: 10,
    },
    lead_generation: {
        google_search: 35,
        meta_ads: 25,
        linkedin_ads: 20,
        email: 15,
        seo_content: 5,
    },
    pipeline_acceleration: {
        google_search: 25,
        linkedin_ads: 30,
        email: 30,
        meta_ads: 15,
    },
    customer_retention: {
        email: 50,
        social_organic: 20,
        meta_ads: 20,
        seo_content: 10,
    },
    product_launch: {
        google_search: 25,
        meta_ads: 25,
        linkedin_ads: 20,
        email: 20,
        social_organic: 10,
    },
    event_promotion: {
        google_search: 20,
        meta_ads: 30,
        linkedin_ads: 25,
        email: 20,
        social_organic: 5,
    },
};

const CHANNEL_RATIONALE: Record<CampaignChannel, string> = {
    google_search: 'Captures high-intent search demand at the moment of need',
    google_display: 'Broad reach for top-of-funnel brand exposure across the Google network',
    meta_ads: 'Precise demographic and interest targeting across Facebook and Instagram',
    linkedin_ads: 'Reaches professional decision-makers with job title and company targeting',
    email: 'High-ROI owned channel for nurturing and re-engaging existing contacts',
    seo_content: 'Builds sustainable organic traffic and authority over time',
    social_organic: 'Community building and brand voice on owned social channels',
};

const CHANNEL_KEY_ACTIONS: Record<CampaignChannel, string[]> = {
    google_search: ['Keyword research and ad group structure', 'Ad copy A/B testing', 'Bid strategy optimization', 'Negative keyword pruning'],
    google_display: ['Audience list creation', 'Creative asset production', 'Placement exclusions', 'Frequency capping'],
    meta_ads: ['Audience segmentation (lookalike, interest, retargeting)', 'Creative A/B testing', 'Pixel event verification', 'Campaign budget optimization'],
    linkedin_ads: ['Job title / seniority targeting', 'Sponsored content + InMail mix', 'Lead gen form setup', 'Matched audience upload'],
    email: ['List segmentation', 'Subject line A/B test', 'Automation sequence setup', 'Deliverability monitoring'],
    seo_content: ['Keyword cluster mapping', 'Content calendar creation', 'On-page optimization', 'Internal linking strategy'],
    social_organic: ['Content calendar planning', 'Engagement monitoring', 'Hashtag strategy', 'Community management'],
};

const GOAL_KPIS: Record<CampaignGoal, CampaignKpi[]> = {
    brand_awareness: [
        { metric: 'Impressions', target: 'Based on budget × avg CPM', measurement: 'Ad platform dashboards' },
        { metric: 'Reach', target: '20% of target audience', measurement: 'Facebook/LinkedIn reach metric' },
        { metric: 'Brand search volume lift', target: '+15%', measurement: 'Google Search Console' },
    ],
    lead_generation: [
        { metric: 'Marketing Qualified Leads (MQLs)', target: 'Based on budget ÷ target CPL', measurement: 'CRM' },
        { metric: 'Cost Per Lead (CPL)', target: 'Industry benchmark', measurement: 'Ad platforms + CRM' },
        { metric: 'Lead-to-Opportunity Rate', target: '>20%', measurement: 'CRM pipeline' },
    ],
    pipeline_acceleration: [
        { metric: 'Opportunities influenced', target: '30% of open pipeline', measurement: 'CRM attribution' },
        { metric: 'Pipeline velocity (days)', target: '-10% vs baseline', measurement: 'CRM deal stages' },
        { metric: 'Influenced deal win rate', target: '+5pp vs control', measurement: 'CRM' },
    ],
    customer_retention: [
        { metric: 'Email open rate', target: '>25%', measurement: 'Mailchimp / HubSpot' },
        { metric: 'Churn rate', target: '<5% monthly', measurement: 'CRM / billing system' },
        { metric: 'NPS', target: '>40', measurement: 'Survey tool' },
    ],
    product_launch: [
        { metric: 'Launch day sign-ups / purchases', target: 'Based on capacity', measurement: 'Product analytics' },
        { metric: 'Press mentions', target: '>10 tier-1 outlets', measurement: 'Media monitoring' },
        { metric: 'Social share of voice', target: '>30% in category', measurement: 'Hootsuite Insights' },
    ],
    event_promotion: [
        { metric: 'Registrations', target: 'Based on event capacity', measurement: 'Event platform' },
        { metric: 'Cost Per Registration', target: 'Budget ÷ target seats', measurement: 'Ad platforms' },
        { metric: 'Show rate', target: '>60%', measurement: 'Event platform' },
    ],
};

function deriveDurationWeeks(startDate: string, endDate: string): number {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    if (isNaN(start) || isNaN(end) || end <= start) return 4;
    return Math.max(1, Math.round((end - start) / (7 * 24 * 60 * 60 * 1000)));
}

function buildMilestones(durationWeeks: number): Milestone[] {
    const milestones: Milestone[] = [];
    milestones.push({
        week: 1,
        label: 'Campaign Setup & Launch',
        deliverables: ['Audience targeting configured', 'Ad creatives approved', 'Tracking pixels verified', 'Email sequences activated'],
    });
    if (durationWeeks >= 3) {
        const midWeek = Math.ceil(durationWeeks / 2);
        milestones.push({
            week: midWeek,
            label: 'Mid-Campaign Review',
            deliverables: ['Performance vs KPI check', 'Budget pacing review', 'Creative refresh if CTR < 1%', 'A/B test winner selection'],
        });
    }
    if (durationWeeks >= 5) {
        milestones.push({
            week: Math.floor(durationWeeks * 0.75),
            label: 'Optimization Sprint',
            deliverables: ['Bid adjustments based on CPA data', 'Audience pruning', 'Landing page CRO analysis', 'Email resend to non-openers'],
        });
    }
    milestones.push({
        week: durationWeeks,
        label: 'Campaign Close & Reporting',
        deliverables: ['Final KPI report', 'Learnings documented', 'Retargeting list export', 'Next-campaign recommendations'],
    });
    return milestones;
}

export function buildCampaignPlan(brief: CampaignBrief): CampaignPlan {
    const channelFilter = brief.channels && brief.channels.length > 0
        ? new Set(brief.channels)
        : null;

    const rawMix = GOAL_CHANNEL_MIX[brief.goal] ?? GOAL_CHANNEL_MIX.lead_generation;
    const eligibleEntries = Object.entries(rawMix).filter(
        ([ch]) => channelFilter === null || channelFilter.has(ch as CampaignChannel),
    );

    const totalWeight = eligibleEntries.reduce((sum, [, pct]) => sum + (pct ?? 0), 0);

    const channels: ChannelAllocation[] = eligibleEntries.map(([ch, pct]) => {
        const allocatedPct = totalWeight > 0 ? Math.round(((pct ?? 0) / totalWeight) * 100) : 0;
        const allocatedBudget = Math.round((brief.budget * allocatedPct) / 100);
        const channel = ch as CampaignChannel;
        return {
            channel,
            allocatedBudget,
            allocatedPct,
            rationale: CHANNEL_RATIONALE[channel] ?? '',
            keyActions: CHANNEL_KEY_ACTIONS[channel] ?? [],
        };
    });

    const durationWeeks = deriveDurationWeeks(brief.startDate, brief.endDate);
    const milestones = buildMilestones(durationWeeks);
    const kpis = GOAL_KPIS[brief.goal] ?? [];

    const topChannels = channels
        .sort((a, b) => b.allocatedBudget - a.allocatedBudget)
        .slice(0, 3)
        .map((c) => c.channel.replace(/_/g, ' '))
        .join(', ');

    const summary =
        `${brief.goal.replace(/_/g, ' ')} campaign for "${brief.product}" targeting ${brief.audience}. ` +
        `Total budget: ${brief.currency}${brief.budget.toLocaleString()} over ${durationWeeks} weeks. ` +
        `Primary channels: ${topChannels}.`;

    return {
        goal: brief.goal,
        product: brief.product,
        audience: brief.audience,
        totalBudget: brief.budget,
        currency: brief.currency,
        startDate: brief.startDate,
        endDate: brief.endDate,
        channels,
        milestones,
        kpis,
        summary,
    };
}
