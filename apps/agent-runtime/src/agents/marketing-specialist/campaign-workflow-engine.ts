/**
 * Campaign Workflow Engine
 *
 * Orchestrates the full marketing campaign lifecycle:
 *   research → plan → keyword research → email sequence → social calendar → brief → alignment → monitor
 *
 * Each step is composable — callers can skip steps or use partial input.
 */

import type { ProseCallerFn } from './email-automation-builder.js';
import { buildCampaignPlan } from './campaign-planner.js';
import type { CampaignBrief, CampaignPlan } from './campaign-planner.js';
import { conductMarketResearch } from './market-research-service.js';
import { researchKeywords } from './seo-keyword-researcher.js';
import { buildEmailSequence } from './email-automation-builder.js';
import { buildSocialCalendar } from './social-media-scheduler.js';
import { buildCreativeBrief } from './asset-coordinator.js';
import { buildAlignmentReport } from './cross-team-aligner.js';
import type { AlignmentInput } from './cross-team-aligner.js';

export type WorkflowStep =
    | 'market_research'
    | 'campaign_plan'
    | 'keyword_research'
    | 'email_sequence'
    | 'social_calendar'
    | 'creative_brief'
    | 'team_alignment';

export interface CampaignWorkflowInput {
    campaignName: string;
    product: string;
    audience: string;
    goal: string;
    budget: number;
    currency: string;
    startDate: string;
    endDate: string;
    brand?: string;
    industry?: string;
    seedKeywords?: string[];
    skipSteps?: WorkflowStep[];
    dataforseoLogin?: string;
    dataforseoPassword?: string;
    reviewerNames?: string[];
}

export interface WorkflowStepResult {
    step: WorkflowStep;
    ok: boolean;
    data?: unknown;
    errorMessage?: string;
    durationMs: number;
}

export interface CampaignWorkflowResult {
    ok: boolean;
    campaignName: string;
    completedSteps: WorkflowStep[];
    skippedSteps: WorkflowStep[];
    failedSteps: WorkflowStep[];
    stepResults: WorkflowStepResult[];
    summary: string;
    errorOutput?: string;
}

async function runStep<T>(
    step: WorkflowStep,
    fn: () => Promise<T>,
): Promise<WorkflowStepResult> {
    const start = Date.now();
    try {
        const data = await fn();
        return { step, ok: true, data, durationMs: Date.now() - start };
    } catch (err) {
        return { step, ok: false, errorMessage: String(err), durationMs: Date.now() - start };
    }
}

export async function runCampaignWorkflow(
    input: CampaignWorkflowInput,
    deps: { callerFn?: ProseCallerFn } = {},
): Promise<CampaignWorkflowResult> {
    const skip = new Set(input.skipSteps ?? []);
    const stepResults: WorkflowStepResult[] = [];
    const completedSteps: WorkflowStep[] = [];
    const skippedSteps: WorkflowStep[] = [];
    const failedSteps: WorkflowStep[] = [];

    // ---------------------------------------------------------------------------
    // Step 1: Market Research
    // ---------------------------------------------------------------------------
    if (!skip.has('market_research')) {
        const result = await runStep('market_research', () =>
            conductMarketResearch({
                industry: input.industry ?? 'Technology',
                targetAudience: input.audience,
            }),
        );
        stepResults.push(result);
        if (result.ok) completedSteps.push('market_research');
        else failedSteps.push('market_research');
    } else {
        skippedSteps.push('market_research');
    }

    // ---------------------------------------------------------------------------
    // Step 2: Campaign Plan
    // ---------------------------------------------------------------------------
    let campaignPlan: CampaignPlan | null = null;
    if (!skip.has('campaign_plan')) {
        const brief: CampaignBrief = {
            goal: input.goal as CampaignBrief['goal'],
            product: input.product,
            audience: input.audience,
            budget: input.budget,
            currency: input.currency,
            startDate: input.startDate,
            endDate: input.endDate,
        };
        const built = buildCampaignPlan(brief);
        campaignPlan = built;
        const result = await runStep('campaign_plan', () => Promise.resolve(built));
        stepResults.push(result);
        if (result.ok) completedSteps.push('campaign_plan');
        else failedSteps.push('campaign_plan');
    } else {
        skippedSteps.push('campaign_plan');
    }

    // ---------------------------------------------------------------------------
    // Step 3: Keyword Research
    // ---------------------------------------------------------------------------
    if (!skip.has('keyword_research')) {
        const result = await runStep('keyword_research', () =>
            researchKeywords({
                seedKeywords: input.seedKeywords ?? [input.product, input.goal],
                industry: input.industry ?? 'Technology',
                targetAudience: input.audience,
                dataforseoLogin: input.dataforseoLogin,
                dataforseoPassword: input.dataforseoPassword,
                maxResults: 20,
            }),
        );
        stepResults.push(result);
        if (result.ok) completedSteps.push('keyword_research');
        else failedSteps.push('keyword_research');
    } else {
        skippedSteps.push('keyword_research');
    }

    // ---------------------------------------------------------------------------
    // Step 4: Email Sequence
    // ---------------------------------------------------------------------------
    if (!skip.has('email_sequence')) {
        const result = await runStep('email_sequence', () =>
            buildEmailSequence(
                {
                    sequenceType: 'lead_nurture',
                    product: input.product,
                    audience: input.audience,
                    goal: input.goal,
                    brand: input.brand,
                    numEmails: 4,
                },
                deps.callerFn,
            ),
        );
        stepResults.push(result);
        if (result.ok) completedSteps.push('email_sequence');
        else failedSteps.push('email_sequence');
    } else {
        skippedSteps.push('email_sequence');
    }

    // ---------------------------------------------------------------------------
    // Step 5: Social Calendar
    // ---------------------------------------------------------------------------
    if (!skip.has('social_calendar')) {
        const result = await runStep('social_calendar', () =>
            buildSocialCalendar({
                contentItems: [
                    {
                        title: `${input.product} — ${input.goal}`,
                        body: `Discover how ${input.product} helps ${input.audience} achieve ${input.goal}.`,
                        hashtags: [input.product.replace(/\s+/g, ''), 'marketing', input.goal.replace(/\s+/g, '')],
                    },
                ],
                platforms: ['linkedin', 'twitter'],
                startDate: input.startDate,
                endDate: input.endDate,
                postsPerWeek: 3,
                brand: input.brand,
            }),
        );
        stepResults.push(result);
        if (result.ok) completedSteps.push('social_calendar');
        else failedSteps.push('social_calendar');
    } else {
        skippedSteps.push('social_calendar');
    }

    // ---------------------------------------------------------------------------
    // Step 6: Creative Brief
    // ---------------------------------------------------------------------------
    if (!skip.has('creative_brief')) {
        const result = await runStep('creative_brief', () =>
            Promise.resolve(buildCreativeBrief({
                campaignName: input.campaignName,
                brand: input.brand ?? input.product,
                goal: input.goal,
                targetAudience: input.audience,
                keyMessage: `${input.product} helps ${input.audience} achieve ${input.goal}.`,
                cta: 'Start your free trial',
                deadline: input.endDate,
                assets: [
                    { assetType: 'hero_banner' },
                    { assetType: 'social_image', platform: 'LinkedIn', quantity: 2 },
                    { assetType: 'email_header' },
                ],
                reviewerNames: input.reviewerNames,
            })),
        );
        stepResults.push(result);
        if (result.ok) completedSteps.push('creative_brief');
        else failedSteps.push('creative_brief');
    } else {
        skippedSteps.push('creative_brief');
    }

    // ---------------------------------------------------------------------------
    // Step 7: Team Alignment
    // ---------------------------------------------------------------------------
    if (!skip.has('team_alignment')) {
        const alignmentInput: AlignmentInput = {
            campaignContext: {
                campaignName: input.campaignName,
                goal: input.goal,
                targetAudience: input.audience,
                launchDate: input.startDate,
                budget: input.budget,
                currency: input.currency,
                channels: campaignPlan?.channels.map((c) => c.channel) ?? [],
            },
            teamUpdates: [],
            marketingUpdates: completedSteps.map((s) => `${s.replace(/_/g, ' ')} completed`),
        };
        const result = await runStep('team_alignment', () =>
            Promise.resolve(buildAlignmentReport(alignmentInput)),
        );
        stepResults.push(result);
        if (result.ok) completedSteps.push('team_alignment');
        else failedSteps.push('team_alignment');
    } else {
        skippedSteps.push('team_alignment');
    }

    const ok = failedSteps.length === 0;
    const summary =
        `Campaign workflow "${input.campaignName}": ` +
        `${completedSteps.length} step(s) completed, ${skippedSteps.length} skipped, ${failedSteps.length} failed.` +
        (failedSteps.length > 0 ? ` Failed: ${failedSteps.join(', ')}.` : '');

    return {
        ok,
        campaignName: input.campaignName,
        completedSteps,
        skippedSteps,
        failedSteps,
        stepResults,
        summary,
        errorOutput: failedSteps.length > 0 ? `Workflow had ${failedSteps.length} failure(s)` : undefined,
    };
}
