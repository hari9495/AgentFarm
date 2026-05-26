/**
 * Marketing Specialist Human Gate Requests
 *
 * Builds structured approval requests for high-risk marketing actions.
 * Used by workspace_ms_request_human_gate to route decisions to humans.
 *
 * Gate types:
 *   live_campaign_activation  — activating a paid campaign (HIGH)
 *   budget_commitment         — committing budget > threshold (HIGH)
 *   bulk_email_send           — sending to > 1000 recipients (HIGH)
 *   campaign_pause            — pausing an active campaign (MEDIUM)
 *   ab_test_winner_apply      — applying A/B winner to main traffic (MEDIUM)
 *   content_publish_external  — publishing to a public external channel (MEDIUM)
 */

export type MarketingGateType =
    | 'live_campaign_activation'
    | 'budget_commitment'
    | 'bulk_email_send'
    | 'campaign_pause'
    | 'ab_test_winner_apply'
    | 'content_publish_external';

export function isMarketingGateType(v: string): v is MarketingGateType {
    return [
        'live_campaign_activation',
        'budget_commitment',
        'bulk_email_send',
        'campaign_pause',
        'ab_test_winner_apply',
        'content_publish_external',
    ].includes(v);
}

export interface MarketingGateInput {
    gateType: MarketingGateType;
    campaignName: string;
    detail?: string;
    budgetAmount?: number;
    currency?: string;
    recipientCount?: number;
    channel?: string;
}

export interface MarketingGateRecord {
    gateType: MarketingGateType;
    category: 'budget' | 'audience_reach' | 'brand_safety' | 'campaign_ops';
    riskLevel: 'high' | 'medium';
    label: string;
    question: string;
    campaignName: string;
    detail?: string;
    budgetAmount?: number;
    currency?: string;
    recipientCount?: number;
    channel?: string;
}

const GATE_META: Record<MarketingGateType, { category: MarketingGateRecord['category']; riskLevel: MarketingGateRecord['riskLevel']; label: string; questionTemplate: string }> = {
    live_campaign_activation: {
        category: 'campaign_ops',
        riskLevel: 'high',
        label: 'Activate Live Paid Campaign',
        questionTemplate: 'Approve activating the paid campaign "{campaignName}"? This will begin spending the allocated budget immediately.',
    },
    budget_commitment: {
        category: 'budget',
        riskLevel: 'high',
        label: 'Commit Marketing Budget',
        questionTemplate: 'Approve committing {currency}{budgetAmount} for campaign "{campaignName}"? This is a financial commitment.',
    },
    bulk_email_send: {
        category: 'audience_reach',
        riskLevel: 'high',
        label: 'Bulk Email Send',
        questionTemplate: 'Approve sending to {recipientCount} recipients for campaign "{campaignName}"? Verify list hygiene and unsubscribe compliance.',
    },
    campaign_pause: {
        category: 'campaign_ops',
        riskLevel: 'medium',
        label: 'Pause Active Campaign',
        questionTemplate: 'Approve pausing campaign "{campaignName}"? This will stop all spend immediately. Reason: {detail}',
    },
    ab_test_winner_apply: {
        category: 'campaign_ops',
        riskLevel: 'medium',
        label: 'Apply A/B Test Winner',
        questionTemplate: 'Approve applying the A/B test winner to 100% traffic for "{campaignName}"? {detail}',
    },
    content_publish_external: {
        category: 'brand_safety',
        riskLevel: 'medium',
        label: 'Publish Content to External Channel',
        questionTemplate: 'Approve publishing "{campaignName}" to {channel}? Confirm brand safety and legal review completed.',
    },
};

function fillQuestion(template: string, input: MarketingGateInput): string {
    return template
        .replace('{campaignName}', input.campaignName)
        .replace('{currency}', input.currency ?? '$')
        .replace('{budgetAmount}', input.budgetAmount?.toLocaleString() ?? 'N/A')
        .replace('{recipientCount}', input.recipientCount?.toLocaleString() ?? 'N/A')
        .replace('{channel}', input.channel ?? 'external channel')
        .replace('{detail}', input.detail ?? 'No additional detail provided');
}

export function buildMarketingGateRecord(input: MarketingGateInput): MarketingGateRecord {
    const meta = GATE_META[input.gateType];
    return {
        gateType: input.gateType,
        category: meta.category,
        riskLevel: meta.riskLevel,
        label: meta.label,
        question: fillQuestion(meta.questionTemplate, input),
        campaignName: input.campaignName,
        detail: input.detail,
        budgetAmount: input.budgetAmount,
        currency: input.currency,
        recipientCount: input.recipientCount,
        channel: input.channel,
    };
}

export function buildMarketingGateApprovalSummary(gate: MarketingGateRecord): string {
    switch (gate.gateType) {
        case 'live_campaign_activation':
            return `Marketing agent requests approval to activate live paid campaign "${gate.campaignName}". Budget spend will begin immediately upon approval.`;
        case 'budget_commitment':
            return `Marketing agent requests approval to commit ${gate.currency ?? '$'}${gate.budgetAmount?.toLocaleString() ?? 'N/A'} for campaign "${gate.campaignName}".`;
        case 'bulk_email_send':
            return `Marketing agent requests approval to send email campaign "${gate.campaignName}" to ${gate.recipientCount?.toLocaleString() ?? 'N/A'} recipients.`;
        case 'campaign_pause':
            return `Marketing agent requests approval to pause active campaign "${gate.campaignName}". Reason: ${gate.detail ?? 'not specified'}.`;
        case 'ab_test_winner_apply':
            return `Marketing agent requests approval to apply A/B test winner to 100% traffic for "${gate.campaignName}". ${gate.detail ?? ''}`;
        case 'content_publish_external':
            return `Marketing agent requests approval to publish "${gate.campaignName}" to ${gate.channel ?? 'external channel'}.`;
    }
}

export function buildMarketingGateImpactScope(gate: MarketingGateRecord): string {
    switch (gate.gateType) {
        case 'live_campaign_activation':
        case 'budget_commitment':
            return `Financial: ${gate.currency ?? '$'}${gate.budgetAmount?.toLocaleString() ?? 'allocated budget'}`;
        case 'bulk_email_send':
            return `Audience: ${gate.recipientCount?.toLocaleString() ?? 'N/A'} external email recipients`;
        case 'campaign_pause':
            return `Campaign operations: "${gate.campaignName}" — immediate spend stop`;
        case 'ab_test_winner_apply':
            return `Traffic allocation: 100% of campaign traffic for "${gate.campaignName}"`;
        case 'content_publish_external':
            return `Brand / public channel: ${gate.channel ?? 'external channel'}`;
    }
}

export function buildMarketingGateRiskReason(gate: MarketingGateRecord): string {
    switch (gate.gateType) {
        case 'live_campaign_activation':
            return 'Activating a paid campaign creates an immediate financial commitment and public-facing brand presence.';
        case 'budget_commitment':
            return 'Financial commitment above approval threshold requires human sign-off per procurement policy.';
        case 'bulk_email_send':
            return 'Mass email to external recipients carries legal risk (CAN-SPAM, GDPR) and brand reputation risk if list quality is poor.';
        case 'campaign_pause':
            return 'Pausing an active campaign mid-flight can affect lead pipeline and budget pacing — requires context.';
        case 'ab_test_winner_apply':
            return 'Applying an A/B winner to 100% traffic is an irreversible traffic shift with conversion rate implications.';
        case 'content_publish_external':
            return 'Publishing to a public channel represents brand-level communication requiring brand safety and legal review.';
    }
}
