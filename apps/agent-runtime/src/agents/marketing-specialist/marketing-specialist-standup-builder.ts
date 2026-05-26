/**
 * Marketing Specialist Standup Builder
 *
 * Builds a daily standup report for a marketing specialist agent.
 * Mirrors the human morning routine: dashboards → PPC tweaks → plan.
 */

import type { TaskEnvelope, ProcessedTaskResult } from '../../execution-engine.js';

export interface MarketingStandupContext {
    botId: string;
    tenantId: string;
    workspaceId?: string;
    recentTasks: Array<{ actionType: string; status: string; taskId: string; summary?: string }>;
    activeCampaigns?: Array<{ name: string; spend: number; conversions: number; currency: string }>;
    pendingApprovals?: number;
}

export interface MarketingStandupReport {
    generatedAt: string;
    botId: string;
    morningChecklist: string[];
    completedYesterday: string[];
    inProgressToday: string[];
    blockers: string[];
    activeCampaignsSummary: string[];
    pendingApprovals: number;
    fullText: string;
}

export function buildMarketingStandupReport(ctx: MarketingStandupContext): MarketingStandupReport {
    const now = new Date();
    const generatedAt = now.toISOString();

    const morningChecklist = [
        'Review previous day campaign performance (impressions, clicks, conversions, spend)',
        'Check PPC bid pacing and adjust for budget delivery issues',
        'Scan social media mentions and engagement notifications',
        'Review email campaign open rates from overnight sends',
        'Check for any failed automations or webhook errors in HubSpot/Mailchimp',
    ];

    const completedYesterday = ctx.recentTasks
        .filter((t) => t.status === 'success')
        .slice(0, 5)
        .map((t) => t.summary ?? `Completed: ${t.actionType.replace(/workspace_ms_/g, '').replace(/_/g, ' ')}`);

    const inProgressToday = ctx.recentTasks
        .filter((t) => t.status === 'pending' || t.status === 'in_progress')
        .slice(0, 3)
        .map((t) => `In progress: ${t.actionType.replace(/workspace_ms_/g, '').replace(/_/g, ' ')}`);

    if (inProgressToday.length === 0) {
        inProgressToday.push('Monitor live campaign performance and adjust PPC bids');
        inProgressToday.push('Draft this week\'s email campaign content');
    }

    const blockers = ctx.pendingApprovals && ctx.pendingApprovals > 0
        ? [`${ctx.pendingApprovals} action(s) awaiting human approval before campaign can proceed`]
        : [];

    const activeCampaignsSummary = (ctx.activeCampaigns ?? []).map((c) =>
        `${c.name}: ${c.currency}${c.spend.toFixed(2)} spent, ${c.conversions} conversions`,
    );

    if (activeCampaignsSummary.length === 0) {
        activeCampaignsSummary.push('No active campaigns tracked — run workspace_ms_monitor_campaign to refresh');
    }

    const sections = [
        '**Marketing Specialist Daily Standup**',
        `Generated: ${generatedAt}`,
        '',
        '**Morning Checklist**',
        ...morningChecklist.map((item) => `- ${item}`),
        '',
        '**Completed Yesterday**',
        completedYesterday.length > 0
            ? completedYesterday.map((item) => `- ${item}`).join('\n')
            : '- No completed tasks recorded',
        '',
        '**In Progress Today**',
        ...inProgressToday.map((item) => `- ${item}`),
        '',
        '**Active Campaigns**',
        ...activeCampaignsSummary.map((item) => `- ${item}`),
        '',
        blockers.length > 0 ? `**Blockers**\n${blockers.map((b) => `- ${b}`).join('\n')}` : '**Blockers**: None',
    ];

    return {
        generatedAt,
        botId: ctx.botId,
        morningChecklist,
        completedYesterday,
        inProgressToday,
        blockers,
        activeCampaignsSummary,
        pendingApprovals: ctx.pendingApprovals ?? 0,
        fullText: sections.join('\n'),
    };
}

// ---------------------------------------------------------------------------
// Episodic integration helpers
// ---------------------------------------------------------------------------

export function buildMarketingStandupFromTask(
    task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const status = result.status === 'success' ? '✅' : '❌';
    const at = result.decision.actionType;
    const label = at.replace(/workspace_ms_/g, '').replace(/_/g, ' ');
    return `${status} ${label}`;
}
