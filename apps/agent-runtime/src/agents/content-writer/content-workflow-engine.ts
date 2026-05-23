/**
 * Content Writer Workflow Engine
 *
 * Chains multiple Content Writer domain actions into a single orchestrated
 * pipeline. Each step result is passed as context to the next step so the
 * agent behaves like a human writer moving from research through to review.
 *
 * Preset pipelines:
 *   full_pipeline       — research → write → SEO → fact_check → review → send_for_review
 *   write_and_review    — write → SEO → review → send_for_review
 *   research_and_draft  — research → write → SEO
 *
 * The engine is a pure orchestrator — it calls the same domain functions used
 * by content-writer-action-handler.ts so no logic is duplicated.
 */

import { researchContentTopic } from './content-research-service.js';
import type { ContentResearchResult, ResearchFetchFn } from './content-research-service.js';
import { writeProse, reviewAndRefineProse } from './llm-prose-writer.js';
import type { ProseCallerFn, ProseRequest } from './llm-prose-writer.js';
import type { ContentBriefSpec, ContentFormat } from './brief-parser.js';
import type { BrandVoice } from './draft-builder.js';
import { optimizeForSeo } from './seo-optimizer.js';
import type { SeoSpec } from './seo-optimizer.js';
import { checkFactualClaims, verifyFactsWithLlm } from './fact-checker.js';
import type { FactCheckReport } from './fact-checker.js';
import { sendForReview } from './review-dispatcher.js';
import type { SendReviewRequest, ReviewFetchFn } from './review-dispatcher.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkflowPreset = 'full_pipeline' | 'write_and_review' | 'research_and_draft';

export type WorkflowStepName =
    | 'research'
    | 'write_prose'
    | 'seo_optimize'
    | 'fact_check'
    | 'review_prose'
    | 'send_for_review';

/**
 * Input required to run a content workflow.
 * Maps directly to what a human writer would receive in a brief.
 */
export interface ContentWorkflowInput {
    /** Article/post title. */
    title: string;
    /** Research topic (used for the research step). */
    topic: string;
    /** Target audience description, e.g. "SaaS marketing managers". */
    audience?: string;
    /** Output format. Defaults to 'blog_post'. */
    format?: ContentFormat;
    /** Writing tone, e.g. "professional" or "casual". */
    tone?: string;
    /** Target keywords to weave into the draft. */
    keywords?: string[];
    /** Approximate word count target. */
    wordCount?: number;
    /** Brand voice profile — defaults to neutral professional style. */
    brandVoice?: BrandVoice;
    /** Preset pipeline to run. Defaults to 'full_pipeline'. */
    preset?: WorkflowPreset;
    /** Steps to skip even if they appear in the preset sequence. */
    skipSteps?: WorkflowStepName[];
    /** Reviewer webhook/slack/email URL for the send_for_review step. */
    reviewerUrl?: string;
    /** Display name of the reviewer (for the notification payload). */
    reviewerDisplayName?: string;
    /** Channel for review notification. Defaults to 'webhook'. */
    reviewChannel?: 'slack' | 'webhook' | 'email';
    /** Display name of the agent sending the review. */
    agentName?: string;
}

/** Result record for a single workflow step. */
export interface WorkflowStepResult {
    step: WorkflowStepName;
    ok: boolean;
    output: string;
    skipped: boolean;
    durationMs: number;
    errorOutput?: string;
}

/** Full result returned by runContentWorkflow. */
export interface WorkflowRunResult {
    ok: boolean;
    preset: WorkflowPreset;
    steps: WorkflowStepResult[];
    /** Final draft body after all write/review passes. */
    finalDraft?: string;
    /** SEO analysis report, present when seo_optimize step ran. */
    seoReport?: SeoSpec;
    /** Fact-check report, present when fact_check step ran. */
    factCheckReport?: FactCheckReport;
    /** Review ID returned by the dispatcher when send_for_review ran. */
    reviewId?: string;
    totalDurationMs: number;
    /** Aggregated error message when ok=false. */
    errorOutput?: string;
}

/**
 * Injectable dependency functions.
 * All are optional — steps that require missing deps are marked failed (not skipped).
 */
export interface WorkflowDeps {
    callerFn?: ProseCallerFn;
    researchFetchFn?: ResearchFetchFn;
    reviewFetchFn?: ReviewFetchFn;
}

// ---------------------------------------------------------------------------
// Preset step sequences
// ---------------------------------------------------------------------------

const PRESET_STEPS: Record<WorkflowPreset, WorkflowStepName[]> = {
    full_pipeline: ['research', 'write_prose', 'seo_optimize', 'fact_check', 'review_prose', 'send_for_review'],
    write_and_review: ['write_prose', 'seo_optimize', 'review_prose', 'send_for_review'],
    research_and_draft: ['research', 'write_prose', 'seo_optimize'],
};

// ---------------------------------------------------------------------------
// Neutral default brand voice
// ---------------------------------------------------------------------------

const NEUTRAL_BRAND_VOICE: BrandVoice = {
    style: 'professional',
    doNotUse: [],
    signaturePhrase: null,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run a multi-step content workflow.
 *
 * Steps execute in the preset-defined order. Research results feed into the
 * prose writer; the generated draft flows into SEO, fact-check, and review.
 * Missing optional deps cause a step to fail without halting the entire run
 * (except for write_prose failures, which abort the remaining dependent steps).
 */
export async function runContentWorkflow(
    input: ContentWorkflowInput,
    deps?: WorkflowDeps,
): Promise<WorkflowRunResult> {
    const preset = input.preset ?? 'full_pipeline';
    const stepsToRun = PRESET_STEPS[preset];
    const skipSet = new Set<WorkflowStepName>(input.skipSteps ?? []);

    const stepResults: WorkflowStepResult[] = [];
    const overallStart = Date.now();

    // Build a ContentBriefSpec from the workflow input
    const spec: ContentBriefSpec = {
        audience: input.audience ?? null,
        tone: input.tone ?? null,
        format: input.format ?? 'blog_post',
        wordCount: input.wordCount ?? null,
        keyMessages: input.keywords ?? [],
        callToAction: null,
        deadline: null,
    };

    const brandVoice: BrandVoice = input.brandVoice ?? NEUTRAL_BRAND_VOICE;

    // Mutable context passed between steps
    let research: ContentResearchResult | null = null;
    let currentDraft = '';
    let seoReport: SeoSpec | undefined;
    let factCheckReport: FactCheckReport | undefined;
    let reviewId: string | undefined;
    let writeProseFailed = false;

    for (const step of stepsToRun) {
        // Skip explicitly excluded steps
        if (skipSet.has(step)) {
            stepResults.push({ step, ok: true, output: 'Skipped by caller', skipped: true, durationMs: 0 });
            continue;
        }

        // Skip write-dependent steps when write_prose failed
        const writeDependentSteps: WorkflowStepName[] = ['seo_optimize', 'fact_check', 'review_prose', 'send_for_review'];
        if (writeProseFailed && writeDependentSteps.includes(step)) {
            stepResults.push({
                step, ok: false, output: '', skipped: false, durationMs: 0,
                errorOutput: 'Skipped — write_prose step failed',
            });
            continue;
        }

        const stepStart = Date.now();
        let stepOk = true;
        let stepOutput = '';
        let stepError: string | undefined;

        try {
            switch (step) {
                case 'research': {
                    const result = await researchContentTopic(input.topic, deps?.researchFetchFn);
                    research = result;
                    const sources = [...new Set(result.snippets.map((s) => s.source))].join(', ');
                    stepOutput = `Research complete: ${result.snippets.length} snippet(s) from [${sources || 'none'}]`;
                    break;
                }

                case 'write_prose': {
                    if (!deps?.callerFn) {
                        stepOk = false;
                        stepError = 'LLM callerFn not provided — cannot generate prose';
                        writeProseFailed = true;
                        break;
                    }
                    const req: ProseRequest = { spec, brandVoice, research };
                    const proseResult = await writeProse(req, deps.callerFn);
                    currentDraft = proseResult.body;
                    const wordCount = proseResult.body.split(/\s+/).filter(Boolean).length;
                    stepOutput = `Draft generated: ${wordCount} words (LLM: ${proseResult.generatedByLlm})`;
                    if (!proseResult.generatedByLlm) {
                        // Placeholder returned — treat as soft failure so downstream steps
                        // still run with the fallback body rather than crashing
                        stepError = 'LLM unavailable — draft contains placeholder text';
                    }
                    break;
                }

                case 'seo_optimize': {
                    const seoInput = {
                        draftBody: currentDraft,
                        keyMessages: input.keywords ?? [],
                        audience: input.audience ?? null,
                        format: input.format ?? null,
                    };
                    seoReport = optimizeForSeo(seoInput);
                    stepOutput =
                        `SEO: readability=${seoReport.readabilityGrade}, ` +
                        `words=${seoReport.wordCount}, ` +
                        `density=${seoReport.keywordDensityPercent}%, ` +
                        `suggestions=${seoReport.suggestions.length}`;
                    break;
                }

                case 'fact_check': {
                    const flags = checkFactualClaims(currentDraft, research);
                    if (deps?.callerFn && flags.flagged.length > 0) {
                        factCheckReport = await verifyFactsWithLlm(flags, research, deps.callerFn);
                    } else {
                        factCheckReport = flags;
                    }
                    const blocked = factCheckReport.flagged.filter((f) => f.severity === 'block').length;
                    stepOutput =
                        `Fact check: ${factCheckReport.totalClaims} claim(s), ` +
                        `${factCheckReport.flagged.length} flagged ` +
                        `(${blocked} blocking)`;
                    break;
                }

                case 'review_prose': {
                    if (!deps?.callerFn) {
                        stepOk = false;
                        stepError = 'LLM callerFn not provided — cannot run prose review';
                        break;
                    }
                    const reviewResult = await reviewAndRefineProse(currentDraft, spec, deps.callerFn);
                    // reviewAndRefineProse returns the refined body or original body on LLM failure
                    const improved = reviewResult.generatedByLlm;
                    currentDraft = reviewResult.body;
                    stepOutput = improved
                        ? 'Prose review pass complete — draft refined by LLM editor'
                        : 'Prose review pass complete — LLM unavailable, original draft retained';
                    break;
                }

                case 'send_for_review': {
                    // Gracefully skip when reviewer details are absent
                    if (!input.reviewerUrl || !input.reviewerDisplayName) {
                        stepResults.push({
                            step,
                            ok: true,
                            output: 'Skipped — no reviewerUrl/reviewerDisplayName provided',
                            skipped: true,
                            durationMs: 0,
                        });
                        continue;
                    }
                    const reviewReq: SendReviewRequest = {
                        title: input.title,
                        draftBody: currentDraft || 'No draft generated',
                        reviewerUrl: input.reviewerUrl,
                        reviewerDisplayName: input.reviewerDisplayName,
                        channel: input.reviewChannel ?? 'webhook',
                        agentName: input.agentName ?? 'Content Writer Agent',
                    };
                    const dispatchResult = await sendForReview(reviewReq, deps?.reviewFetchFn);
                    reviewId = dispatchResult.reviewId;
                    stepOk = dispatchResult.ok;
                    stepOutput = dispatchResult.ok
                        ? `Review sent to ${dispatchResult.deliveredTo} (ID: ${dispatchResult.reviewId}, risk: ${dispatchResult.riskLevel})`
                        : `Review dispatch failed: ${dispatchResult.errorMessage}`;
                    if (!dispatchResult.ok) {
                        stepError = dispatchResult.errorMessage ?? 'Review dispatch failed';
                    }
                    break;
                }
            }
        } catch (err) {
            stepOk = false;
            stepError = String(err);
            if (step === 'write_prose') {
                writeProseFailed = true;
            }
        }

        stepResults.push({
            step,
            ok: stepOk,
            output: stepOutput,
            skipped: false,
            durationMs: Date.now() - stepStart,
            errorOutput: stepError,
        });
    }

    const totalDurationMs = Date.now() - overallStart;
    const failedSteps = stepResults.filter((s) => !s.ok && !s.skipped);
    const overallOk = failedSteps.length === 0;

    return {
        ok: overallOk,
        preset,
        steps: stepResults,
        finalDraft: currentDraft || undefined,
        seoReport,
        factCheckReport,
        reviewId,
        totalDurationMs,
        errorOutput: overallOk
            ? undefined
            : failedSteps.map((s) => `${s.step}: ${s.errorOutput ?? 'failed'}`).join('; '),
    };
}
