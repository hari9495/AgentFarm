/**
 * Cross-Team Aligner
 *
 * Syncs marketing initiatives with sales, product, and customer success.
 * Produces alignment summaries, shared KPIs, and action items per team.
 * Pure logic — no external API calls.
 */

export type TeamRole = 'sales' | 'product' | 'customer_success' | 'engineering' | 'leadership';

export interface TeamUpdate {
    team: TeamRole;
    updates: string[];
    blockers?: string[];
    upcoming?: string[];
}

export interface CampaignContext {
    campaignName: string;
    goal: string;
    targetAudience: string;
    launchDate?: string;
    channels?: string[];
    budget?: number;
    currency?: string;
}

export interface AlignmentInput {
    campaignContext: CampaignContext;
    teamUpdates: TeamUpdate[];
    marketingUpdates: string[];
    sharedKpiTargets?: Record<string, number | string>;
}

export interface TeamActionItem {
    team: TeamRole;
    action: string;
    owner: string;
    dueDate?: string;
    priority: 'urgent' | 'normal' | 'backlog';
}

export interface AlignmentReport {
    campaignName: string;
    generatedAt: string;
    executiveSummary: string;
    sharedKpis: Record<string, string>;
    teamActionItems: TeamActionItem[];
    marketingHandoffs: string[];
    blockers: string[];
    nextSyncDate: string;
    summary: string;
}

// ---------------------------------------------------------------------------
// Action item templates per team × campaign goal
// ---------------------------------------------------------------------------

function buildSalesActions(campaign: CampaignContext, salesUpdate: TeamUpdate | undefined): TeamActionItem[] {
    const actions: TeamActionItem[] = [
        {
            team: 'sales',
            action: `Align outbound messaging with campaign theme: "${campaign.goal}" for ${campaign.targetAudience}`,
            owner: 'Sales Lead',
            priority: 'urgent',
        },
        {
            team: 'sales',
            action: 'Share MQL-to-SQL conversion feedback (which campaign leads are converting fastest)',
            owner: 'Sales Ops',
            priority: 'normal',
        },
        {
            team: 'sales',
            action: 'Update CRM tags for campaign-sourced leads to enable attribution tracking',
            owner: 'Sales Ops',
            priority: 'normal',
        },
    ];

    if (campaign.launchDate) {
        actions.push({
            team: 'sales',
            action: `Prepare campaign-specific sales deck / one-pager by ${campaign.launchDate}`,
            owner: 'Sales Enablement',
            priority: 'urgent',
        });
    }

    if (salesUpdate?.blockers && salesUpdate.blockers.length > 0) {
        actions.push({
            team: 'sales',
            action: `Resolve blocker: ${salesUpdate.blockers[0]}`,
            owner: 'Sales Lead + Marketing',
            priority: 'urgent',
        });
    }

    return actions;
}

function buildProductActions(campaign: CampaignContext, productUpdate: TeamUpdate | undefined): TeamActionItem[] {
    return [
        {
            team: 'product',
            action: 'Confirm feature availability and GA date for any features referenced in campaign messaging',
            owner: 'Product Manager',
            priority: 'urgent',
        },
        {
            team: 'product',
            action: 'Provide product screenshots / demo environment for campaign assets',
            owner: 'Product Marketing',
            priority: 'normal',
        },
        {
            team: 'product',
            action: 'Flag any upcoming pricing or feature changes that affect campaign claims',
            owner: 'Product Manager',
            priority: 'normal',
        },
        ...(productUpdate?.upcoming && productUpdate.upcoming.length > 0 ? [{
            team: 'product' as TeamRole,
            action: `Coordinate launch timing of "${productUpdate.upcoming[0]}" with campaign launch`,
            owner: 'Product Manager',
            priority: 'normal' as const,
        }] : []),
    ];
}

function buildCsActions(campaign: CampaignContext): TeamActionItem[] {
    return [
        {
            team: 'customer_success',
            action: 'Identify 2–3 customers from the target segment willing to provide a testimonial or case study',
            owner: 'CS Lead',
            priority: 'normal',
        },
        {
            team: 'customer_success',
            action: 'Brief support team on expected inbound volume increase during campaign launch period',
            owner: 'CS Manager',
            priority: 'normal',
        },
        {
            team: 'customer_success',
            action: 'Collect NPS data from campaign-sourced customers 30 days post-conversion for attribution quality',
            owner: 'CS Ops',
            priority: 'backlog',
        },
    ];
}

function buildMarketingHandoffs(campaign: CampaignContext, teamUpdates: TeamUpdate[]): string[] {
    const handoffs = [
        `Campaign brief shared with all teams — ${campaign.campaignName}`,
        `Target audience profile: ${campaign.targetAudience}`,
        `Campaign channels: ${(campaign.channels ?? ['TBD']).join(', ')}`,
    ];

    if (campaign.budget) {
        handoffs.push(`Budget allocation: ${campaign.currency ?? 'USD'}${campaign.budget.toLocaleString()} total`);
    }
    if (campaign.launchDate) {
        handoffs.push(`Campaign launch date: ${campaign.launchDate}`);
    }

    const salesTeam = teamUpdates.find((t) => t.team === 'sales');
    if (salesTeam) {
        handoffs.push('UTM parameters and lead routing rules shared with Sales Ops for CRM setup');
    }

    return handoffs;
}

function buildSharedKpis(campaign: CampaignContext, targets?: Record<string, number | string>): Record<string, string> {
    const baseKpis: Record<string, string> = {
        'Marketing — MQL Volume': targets?.['mql_target'] ? String(targets['mql_target']) : 'TBD',
        'Sales — SQL Conversion Rate': targets?.['sql_rate'] ? `${targets['sql_rate']}%` : '>20%',
        'Sales — Pipeline Influenced': targets?.['pipeline_target'] ? `${campaign.currency ?? 'USD'}${targets['pipeline_target']}` : 'TBD',
        'CS — Campaign Retention Rate': targets?.['retention_rate'] ? `${targets['retention_rate']}%` : '>85% at 90 days',
        'Product — Feature Adoption': targets?.['feature_adoption'] ? `${targets['feature_adoption']}%` : '>40% of campaign-sourced users',
    };
    return baseKpis;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildAlignmentReport(input: AlignmentInput): AlignmentReport {
    const { campaignContext, teamUpdates } = input;

    const salesUpdate = teamUpdates.find((t) => t.team === 'sales');
    const productUpdate = teamUpdates.find((t) => t.team === 'product');
    const csUpdate = teamUpdates.find((t) => t.team === 'customer_success');

    const teamActionItems: TeamActionItem[] = [
        ...buildSalesActions(campaignContext, salesUpdate),
        ...buildProductActions(campaignContext, productUpdate),
        ...buildCsActions(campaignContext),
    ];

    const allBlockers = teamUpdates.flatMap((t) => (t.blockers ?? []).map((b) => `[${t.team}] ${b}`));

    const marketingHandoffs = buildMarketingHandoffs(campaignContext, teamUpdates);
    const sharedKpis = buildSharedKpis(campaignContext, input.sharedKpiTargets);

    const nextSyncDate = (() => {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        return d.toISOString().split('T')[0]!;
    })();

    const urgentCount = teamActionItems.filter((a) => a.priority === 'urgent').length;

    const executiveSummary =
        `Cross-team alignment for "${campaignContext.campaignName}" — ${campaignContext.goal}. ` +
        `${teamActionItems.length} action items across ${new Set(teamActionItems.map((a) => a.team)).size} teams. ` +
        `${urgentCount} urgent item(s). ` +
        (allBlockers.length > 0 ? `${allBlockers.length} blocker(s) to resolve before launch.` : 'No blockers reported.');

    return {
        campaignName: campaignContext.campaignName,
        generatedAt: new Date().toISOString(),
        executiveSummary,
        sharedKpis,
        teamActionItems,
        marketingHandoffs,
        blockers: allBlockers,
        nextSyncDate,
        summary: `Alignment report for "${campaignContext.campaignName}". Next sync: ${nextSyncDate}.`,
    };
}
