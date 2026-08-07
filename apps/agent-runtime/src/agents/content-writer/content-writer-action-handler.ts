/**
 * Content Writer Action Handler
 *
 * Bridges the LocalWorkspaceActionType dispatch switch in
 * local-workspace-executor.ts to the CW domain actions (Tier 28):
 *
 *   - workspace_cw_research_topic       — fetch background research for a topic
 *   - workspace_cw_write_prose          — LLM-generated prose from brief
 *   - workspace_cw_seo_optimize         — SEO analysis of draft
 *   - workspace_cw_publish_cms          — create CMS draft (WordPress / Contentful / HubSpot)
 *   - workspace_cw_adapt_tone           — LLM tone rewrite
 *   - workspace_cw_source_images        — image suggestions (Unsplash) + optional embed
 *   - workspace_cw_schedule_content     — calendar workflow events
 *   - workspace_cw_fact_check           — heuristic fact claim flagging
 *   - workspace_cw_revision_apply       — LLM-driven editor comment revisions
 *   - workspace_cw_brand_voice_learn    — heuristic brand voice extraction
 *   - workspace_cw_verify_facts         — LLM-based fact verification pass
 *   - workspace_cw_review_prose         — LLM self-review and refinement loop
 *   - workspace_cw_detect_plagiarism    — LLM plagiarism detection
 *   - workspace_cw_clarify_brief        — generate clarifying questions for low-confidence brief
 *   - workspace_cw_localize_content     — cultural/locale adaptation via LLM
 *   - workspace_cw_analytics_report     — fetch content performance metrics from Google Analytics (GA4)
 *
 * Pattern mirrors technical-writer-action-handler.ts.
 */

import type { LocalWorkspaceResult, LocalWorkspaceConnectorClient } from '../../local-workspace-executor.js';
import type { ProseCallerFn } from './llm-prose-writer.js';
import { researchContentTopic } from './content-research-service.js';
import { writeProse, reviewAndRefineProse } from './llm-prose-writer.js';
import type { ProseRequest } from './llm-prose-writer.js';
import { optimizeForSeo } from './seo-optimizer.js';
import { publishToCms, verifyCmsDraft, promoteToCms } from './cms-publisher.js';
import type { CmsTarget, CmsFetchFn } from './cms-publisher.js';
import { adaptTone, detectCurrentToneLlm } from './tone-adapter.js';
import type { ToneAdaptRequest } from './tone-adapter.js';
import { suggestImages, embedImagesIntoDraft } from './image-sourcer.js';
import { scheduleContentWorkflow } from './content-scheduler.js';
import type { CalendarClientFn, ContentWorkflowDates } from './content-scheduler.js';
import { checkFactualClaims, buildFactCheckSummary, verifyFactsWithLlm, researchAndCheckFacts } from './fact-checker.js';
import type { FactCheckReport } from './fact-checker.js';
import type { ResearchFetchFn } from './content-research-service.js';
import { generateRevisions } from './revision-handler.js';
import type { EditorComment } from './revision-handler.js';
import { learnBrandVoice, learnBrandVoiceSemantic } from './brand-voice-learner.js';
import type { BrandVoiceSample } from './brand-voice-learner.js';
import type { BrandVoice } from './draft-builder.js';
import type { ContentBriefSpec } from './brief-parser.js';
import { buildClarificationQuestions } from './brief-parser.js';
import { detectPlagiarismWithCopyscape } from './plagiarism-detector.js';
import type { PlagiarismFetchFn } from './plagiarism-detector.js';
import { localizeContentWithDeepL } from './content-localizer.js';
import type { LocalizeRequest, DeepLFetchFn } from './content-localizer.js';
import { fetchAnalyticsReport, fetchMixpanelReport } from './analytics-reporter.js';
import type { AnalyticsQuery, AnalyticsFetchFn, MixpanelQuery } from './analytics-reporter.js';
import { sendForReview } from './review-dispatcher.js';
import type { SendReviewRequest, ReviewChannel, ReviewFetchFn } from './review-dispatcher.js';
import { fetchKeywordData, enrichSeoSpec } from './keyword-data-adapter.js';
import type { KeywordDataQuery, KeywordFetchFn } from './keyword-data-adapter.js';
import { runContentWorkflow } from './content-workflow-engine.js';
import type { ContentWorkflowInput, WorkflowPreset } from './content-workflow-engine.js';
import {
    isContentWriterGateType,
    buildHumanGateRecord,
    buildHumanGateApprovalSummary,
    buildHumanGateImpactScope,
    buildHumanGateRiskReason,
} from './human-gate-requests.js';
import type { HumanGateInput } from './human-gate-requests.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContentWriterActionType =
    | 'workspace_cw_research_topic'
    | 'workspace_cw_write_prose'
    | 'workspace_cw_seo_optimize'
    | 'workspace_cw_publish_cms'
    | 'workspace_cw_promote_draft'
    | 'workspace_cw_scheduled_publish'
    | 'workspace_cw_adapt_tone'
    | 'workspace_cw_source_images'
    | 'workspace_cw_schedule_content'
    | 'workspace_cw_fact_check'
    | 'workspace_cw_revision_apply'
    | 'workspace_cw_brand_voice_learn'
    | 'workspace_cw_verify_facts'
    | 'workspace_cw_review_prose'
    | 'workspace_cw_detect_plagiarism'
    | 'workspace_cw_clarify_brief'
    | 'workspace_cw_localize_content'
    | 'workspace_cw_analytics_report'
    | 'workspace_cw_send_for_review'
    | 'workspace_cw_run_workflow'
    | 'workspace_cw_request_human_gate';

export function isContentWriterActionType(t: string): t is ContentWriterActionType {
    return (
        t === 'workspace_cw_research_topic' ||
        t === 'workspace_cw_write_prose' ||
        t === 'workspace_cw_seo_optimize' ||
        t === 'workspace_cw_publish_cms' ||
        t === 'workspace_cw_promote_draft' ||
        t === 'workspace_cw_scheduled_publish' ||
        t === 'workspace_cw_adapt_tone' ||
        t === 'workspace_cw_source_images' ||
        t === 'workspace_cw_schedule_content' ||
        t === 'workspace_cw_fact_check' ||
        t === 'workspace_cw_revision_apply' ||
        t === 'workspace_cw_brand_voice_learn' ||
        t === 'workspace_cw_verify_facts' ||
        t === 'workspace_cw_review_prose' ||
        t === 'workspace_cw_detect_plagiarism' ||
        t === 'workspace_cw_clarify_brief' ||
        t === 'workspace_cw_localize_content' ||
        t === 'workspace_cw_analytics_report' ||
        t === 'workspace_cw_send_for_review' ||
        t === 'workspace_cw_run_workflow' ||
        t === 'workspace_cw_request_human_gate'
    );
}

export interface ContentWriterActionInput {
    actionType: ContentWriterActionType;
    tenantId: string;
    botId: string;
    taskId: string;
    /** Parsed JSON payload from the task. */
    payload: Record<string, unknown>;
    workspaceDir: string;
    /** Optional — when provided, RAG context is fetched and prepended to every LLM call. */
    gatewayBaseUrl?: string;
    serviceToken?: string;
    workspaceId?: string;
    /**
     * Injectable LLM caller. Provided by the runtime when a live LLM is
     * available; may be omitted in tests that cover non-LLM actions.
     */
    callerFn?: ProseCallerFn;
    /**
     * Injectable HTTP fetch function. Defaults to global fetch.
     * Provided by tests to avoid real API calls.
     */
    fetchFn?: CmsFetchFn;
    /**
     * Native connector dispatch client. When present and the CMS target is
     * WordPress, workspace_cw_publish_cms routes through the workspace's
     * connected WordPress connector (credentials from the token store) instead
     * of the raw-fetch path that needs credentials supplied in the payload.
     */
    connectorActionExecuteClient?: LocalWorkspaceConnectorClient;
    /**
     * Injectable research fetch function (Wikipedia / HN / Reddit).
     * Used by workspace_cw_fact_check auto-research. Defaults to globalThis.fetch.
     */
    researchFetchFn?: ResearchFetchFn;
    /**
     * Injectable fetch function for Copyscape API calls.
     * Used by workspace_cw_detect_plagiarism. Defaults to globalThis.fetch.
     * Required in tests to avoid real API calls.
     */
    plagiarismFetchFn?: PlagiarismFetchFn;
    /**
     * Injectable fetch function for DeepL API calls.
     * Used by workspace_cw_localize_content when DEEPL_API_KEY is set.
     * Required in tests to avoid real API calls.
     */
    deeplFetchFn?: DeepLFetchFn;
    /**
     * Injectable calendar client for scheduling actions.
     */
    calendarClient?: CalendarClientFn;
    /**
     * Injectable GA4 / Mixpanel fetch function for analytics actions. Defaults to
     * globalThis.fetch. Provided by tests to avoid real API calls.
     */
    analyticsFetchFn?: AnalyticsFetchFn;
    /**
     * Injectable fetch function for send-for-review notifications. Defaults to
     * globalThis.fetch. Provided by tests to avoid real HTTP calls.
     */
    reviewFetchFn?: ReviewFetchFn;
    /**
     * Injectable fetch function for keyword data API calls. Defaults to
     * globalThis.fetch. Provided by tests to avoid real HTTP calls.
     */
    keywordFetchFn?: KeywordFetchFn;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function ok(output: string): LocalWorkspaceResult {
    return { ok: true, output };
}

function fail(message: string): LocalWorkspaceResult {
    return { ok: false, output: message };
}

function jsonOut(value: unknown): LocalWorkspaceResult {
    return ok(JSON.stringify(value, null, 2));
}

function str(v: unknown): string {
    return typeof v === 'string' ? v : String(v ?? '');
}

function strArr(v: unknown): string[] {
    return Array.isArray(v) ? v.map(str) : [];
}

function noLlm(): LocalWorkspaceResult {
    return fail('LLM caller not available for this action. Provide callerFn.');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Dispatch a content writer domain action.
 */
export async function handleContentWriterAction(
    input: ContentWriterActionInput,
): Promise<LocalWorkspaceResult> {
    const { actionType, payload, callerFn: rawCallerFn, gatewayBaseUrl, serviceToken, workspaceId, tenantId, botId } = input;

    // RAG pre-flight — wrap callerFn with brand voice, prior articles, and editorial lessons
    let callerFn = rawCallerFn;
    if (rawCallerFn && gatewayBaseUrl && serviceToken && workspaceId) {
        try {
            const { buildContentWriterRagContext } = await import('./content-writer-rag-retriever.js');
            const { deriveMemoryConfig } = await import('@agentfarm/memory-service');
            const ragCtx = await buildContentWriterRagContext(
                {
                    tenantId, botId,
                    contentTitle: String(payload['title'] ?? payload['topic'] ?? actionType),
                    contentDescription: String(payload['description'] ?? payload['brief'] ?? ''),
                    documentType: 'blog_post',
                },
                gatewayBaseUrl, serviceToken, workspaceId, deriveMemoryConfig(actionType),
            );
            if (ragCtx.contextBlock) {
                callerFn = (systemPrompt: string, userPrompt: string) => rawCallerFn(`${ragCtx.contextBlock}\n\n${systemPrompt}`, userPrompt);
            }
        } catch { /* non-fatal */ }
    }

    switch (actionType) {
        // ----------------------------------------------------------------
        // workspace_cw_research_topic
        // payload: { topic: string }
        // ----------------------------------------------------------------
        case 'workspace_cw_research_topic': {
            const topic = str(payload['topic']);
            if (!topic) return fail('payload.topic is required for workspace_cw_research_topic');
            const result = await researchContentTopic(topic);
            return jsonOut(result);
        }

        // ----------------------------------------------------------------
        // workspace_cw_write_prose
        // payload: { spec: ContentBriefSpec, brandVoice?: BrandVoice, research?: ContentResearchResult }
        // ----------------------------------------------------------------
        case 'workspace_cw_write_prose': {
            if (!callerFn) return noLlm();
            const specPayload = (payload['spec'] as ContentBriefSpec | undefined) ?? {
                audience: str(payload['audience']) || null,
                tone: str(payload['tone']) || null,
                format: (str(payload['format']) as ContentBriefSpec['format']) || null,
                wordCount: typeof payload['wordCount'] === 'number' ? payload['wordCount'] : 500,
                keyMessages: strArr(payload['keyMessages']),
                callToAction: typeof payload['callToAction'] === 'string' ? payload['callToAction'] : null,
                deadline: null,
            };
            const req: ProseRequest = {
                spec: specPayload,
                brandVoice:
                    payload['brandVoice'] != null
                        ? (payload['brandVoice'] as BrandVoice)
                        : { style: 'professional', doNotUse: [], signaturePhrase: null },
                research: payload['research'] != null ? (payload['research'] as ProseRequest['research']) : null,
            };
            const result = await writeProse(req, callerFn);
            return jsonOut(result);
        }

        // ----------------------------------------------------------------
        // workspace_cw_seo_optimize
        // payload: { draftBody: string, keyMessages: string[], audience?: string, format?: string,
        //            dataforseoLogin?: string, dataforseoPassword?: string,
        //            locationCode?: number, languageCode?: string }
        // ----------------------------------------------------------------
        case 'workspace_cw_seo_optimize': {
            const draftBody = str(payload['draftBody'] ?? payload['body']);
            if (!draftBody) return fail('payload.draftBody is required for workspace_cw_seo_optimize');
            const spec = optimizeForSeo({
                draftBody,
                keyMessages: strArr(payload['keyMessages']),
                audience: typeof payload['audience'] === 'string' ? payload['audience'] : null,
                format: typeof payload['format'] === 'string' ? payload['format'] : null,
            });

            // Optionally enrich with live keyword data when DataForSEO credentials are provided.
            const dataforseoLogin = typeof payload['dataforseoLogin'] === 'string' ? payload['dataforseoLogin'] : undefined;
            const dataforseoPassword = typeof payload['dataforseoPassword'] === 'string' ? payload['dataforseoPassword'] : undefined;
            if (spec.focusKeyword && (dataforseoLogin ?? process.env['DATAFORSEO_LOGIN'])) {
                const kwQuery: KeywordDataQuery = {
                    keywords: [spec.focusKeyword],
                    login: dataforseoLogin,
                    password: dataforseoPassword,
                    locationCode: typeof payload['locationCode'] === 'number' ? payload['locationCode'] : undefined,
                    languageCode: typeof payload['languageCode'] === 'string' ? payload['languageCode'] : undefined,
                };
                const kwData = await fetchKeywordData(kwQuery, input.keywordFetchFn);
                return jsonOut(enrichSeoSpec(spec, kwData));
            }

            return jsonOut(spec);
        }

        // ----------------------------------------------------------------
        // workspace_cw_publish_cms
        // payload: { target: CmsTarget, title, body, metaDescription?, focusKeyword?, tags? }
        // ----------------------------------------------------------------
        case 'workspace_cw_publish_cms': {
            const target = payload['target'] as CmsTarget | undefined;
            if (!target) return fail('payload.target is required for workspace_cw_publish_cms');

            // Preferred path: the workspace's connected WordPress connector, so
            // credentials come from the token store rather than the payload.
            // WordPress is the only CMS platform with a native publish_content
            // executor; the others fall through to the raw-fetch path below.
            // status='draft' preserves the draft-first safety publishToCms enforces —
            // promotion to live remains the separate HIGH-risk workspace_cw_promote_draft.
            if (target.platform === 'wordpress' && input.connectorActionExecuteClient) {
                const title = str(payload['title']);
                const body = str(payload['body']);
                if (!title || !body) return fail('payload.title and payload.body are required for workspace_cw_publish_cms');
                const conn = await input.connectorActionExecuteClient({
                    connectorType: 'wordpress',
                    actionType: 'publish_content',
                    payload: { title, content: body, status: 'draft' },
                });
                return conn.ok
                    ? jsonOut({ published: true, via: 'wordpress', status: 'draft', statusCode: conn.statusCode })
                    : fail(conn.errorMessage ?? `WordPress connector failed with status ${conn.statusCode}`);
            }

            const result = await publishToCms(
                {
                    title: str(payload['title']),
                    body: str(payload['body']),
                    metaDescription: typeof payload['metaDescription'] === 'string' ? payload['metaDescription'] : undefined,
                    focusKeyword: typeof payload['focusKeyword'] === 'string' ? payload['focusKeyword'] : undefined,
                    tags: Array.isArray(payload['tags']) ? strArr(payload['tags']) : undefined,
                },
                target,
                input.fetchFn ?? (async (url, init) => {
                    const resp = await fetch(url, {
                        method: init.method,
                        headers: init.headers,
                        body: init.body,
                    });
                    return { ok: resp.ok, status: resp.status, json: () => resp.json() as Promise<unknown> };
                }),
            );
            return result.ok ? jsonOut(result) : fail(result.errorMessage ?? 'CMS publish failed');
        }

        // ----------------------------------------------------------------
        // ----------------------------------------------------------------
        // workspace_cw_promote_draft
        // payload: { draftId: string, target: CmsTarget }
        // HIGH-RISK — the runtime must route this through the approval gate
        // (riskLevel: 'high') before dispatch. The agent never self-approves.
        // ----------------------------------------------------------------
        case 'workspace_cw_promote_draft': {
            const draftId = str(payload['draftId']);
            const target = payload['target'] as CmsTarget | undefined;
            if (!draftId) return fail('payload.draftId is required for workspace_cw_promote_draft');
            if (!target) return fail('payload.target is required for workspace_cw_promote_draft');
            const result = await promoteToCms(
                draftId,
                target,
                input.fetchFn ?? (async (url, init) => {
                    const resp = await fetch(url, {
                        method: init.method,
                        headers: init.headers,
                        body: init.body,
                    });
                    return { ok: resp.ok, status: resp.status, json: () => resp.json() as Promise<unknown> };
                }),
            );
            return result.ok ? jsonOut(result) : fail(result.errorMessage ?? 'CMS promotion failed');
        }

        // ----------------------------------------------------------------
        // workspace_cw_scheduled_publish
        // payload: { draftId: string, target: CmsTarget, scheduledAt: string }
        // Invoked by the trigger service when the publish date arrives.
        // HIGH-RISK — routes through the approval gate before dispatch.
        // ----------------------------------------------------------------
        case 'workspace_cw_scheduled_publish': {
            const draftId = str(payload['draftId']);
            const target = payload['target'] as CmsTarget | undefined;
            const scheduledAt = str(payload['scheduledAt']);
            if (!draftId) return fail('payload.draftId is required for workspace_cw_scheduled_publish');
            if (!target) return fail('payload.target is required for workspace_cw_scheduled_publish');
            if (!scheduledAt) return fail('payload.scheduledAt is required for workspace_cw_scheduled_publish');

            const scheduledDate = new Date(scheduledAt);
            if (isNaN(scheduledDate.getTime()))
                return fail(`payload.scheduledAt is not a valid date: ${scheduledAt}`);

            const now = new Date();
            if (now < scheduledDate) {
                return jsonOut({
                    due: false,
                    scheduledAt,
                    message: `Not yet due \u2014 scheduled for ${scheduledAt}`,
                });
            }

            const result = await promoteToCms(
                draftId,
                target,
                input.fetchFn ?? (async (url, init) => {
                    const resp = await fetch(url, {
                        method: init.method,
                        headers: init.headers,
                        body: init.body,
                    });
                    return { ok: resp.ok, status: resp.status, json: () => resp.json() as Promise<unknown> };
                }),
            );
            return result.ok ? jsonOut({ due: true, ...result }) : fail(result.errorMessage ?? 'CMS promotion failed');
        }

        // ----------------------------------------------------------------
        // workspace_cw_adapt_tone
        // payload: { body: string, targetTone: ToneStyle, preserveStructure?: boolean }
        // ----------------------------------------------------------------
        case 'workspace_cw_adapt_tone': {
            if (!callerFn) return noLlm();
            const req: ToneAdaptRequest = {
                body: str(payload['body']),
                targetTone: (payload['targetTone'] as ToneAdaptRequest['targetTone']) ?? 'professional',
                preserveStructure: payload['preserveStructure'] === true,
            };
            const result = await adaptTone(req, callerFn);
            return jsonOut(result);
        }

        // ----------------------------------------------------------------
        // workspace_cw_source_images
        // payload: { body: string, keyMessages?: string[], embed?: boolean }
        // Image auto-embed requires AGENT_IMAGE_EMBED=true env var (opt-in).
        // ----------------------------------------------------------------
        case 'workspace_cw_source_images': {
            const body = str(payload['body']);
            const keyMessages = strArr(payload['keyMessages']);
            const suggestions = await suggestImages(body, keyMessages);
            if (payload['embed'] === true) {
                if (process.env['AGENT_IMAGE_EMBED'] !== 'true') {
                    return jsonOut({
                        suggestions,
                        embeddedBody: null,
                        embedSkipped: true,
                        embedSkipReason: 'Image auto-embed requires AGENT_IMAGE_EMBED=true env var.',
                    });
                }
                const embeddedBody = embedImagesIntoDraft(body, suggestions);
                return jsonOut({ suggestions, embeddedBody });
            }
            return jsonOut(suggestions);
        }

        // ----------------------------------------------------------------
        // workspace_cw_schedule_content
        // payload: { title: string, dates: ContentWorkflowDates, connector?: string,
        //            cmsPublishTarget?: { draftId: string, target: CmsTarget } }
        // ----------------------------------------------------------------
        case 'workspace_cw_schedule_content': {
            const calendarClient = input.calendarClient;
            if (!calendarClient) return fail('calendarClient not provided for workspace_cw_schedule_content');
            const dates = payload['dates'] as ContentWorkflowDates;
            if (!dates) return fail('payload.dates is required for workspace_cw_schedule_content');
            const connector = str(payload['connector'] || 'google_calendar');
            const cmsPublishTarget = payload['cmsPublishTarget'] as
                | { draftId: string; target: CmsTarget }
                | undefined;
            const result = await scheduleContentWorkflow(
                str(payload['title']),
                dates,
                connector,
                calendarClient,
                cmsPublishTarget,
            );
            return result.ok ? jsonOut(result) : fail(result.errorMessage ?? 'Scheduling failed');
        }

        // ----------------------------------------------------------------
        // workspace_cw_fact_check
        // payload: { body: string, researchResult?: ContentResearchResult }
        // ----------------------------------------------------------------
        case 'workspace_cw_fact_check': {
            const body = str(payload['body']);
            if (!body) return fail('payload.body is required for workspace_cw_fact_check');
            const sourcesConfig = payload['researchResult'] != null
                ? (payload['researchResult'] as Parameters<typeof checkFactualClaims>[1])
                : null;

            let report: FactCheckReport;
            let researchedEntities: string[] | undefined;

            if (sourcesConfig === null) {
                // Auto-research path: live cross-reference via Wikipedia/HN/Reddit
                const researchFetch: ResearchFetchFn = input.researchFetchFn ??
                    ((url: string) =>
                        (globalThis.fetch as (u: string) => Promise<Response>)(url).then((r) => ({
                            ok: r.ok,
                            status: r.status,
                            text: () => r.text(),
                        }))
                    );
                const enriched = await researchAndCheckFacts(body, researchFetch);
                report = enriched;
                researchedEntities = enriched.researchedEntities;
            } else {
                report = checkFactualClaims(body, sourcesConfig);
            }

            const summary = buildFactCheckSummary(report);
            return jsonOut({ report, summary, ...(researchedEntities !== undefined ? { researchedEntities } : {}) });
        }

        // ----------------------------------------------------------------
        // workspace_cw_revision_apply
        // payload: { body: string, comments: EditorComment[] }
        // ----------------------------------------------------------------
        case 'workspace_cw_revision_apply': {
            if (!callerFn) return noLlm();
            const body = str(payload['body']);
            const comments = (payload['comments'] as EditorComment[]) ?? [];
            const result = await generateRevisions(body, comments, callerFn);
            return jsonOut(result);
        }

        // ----------------------------------------------------------------
        // workspace_cw_brand_voice_learn
        // payload: { samples: BrandVoiceSample[], baseBrandVoice: BrandVoice, semantic?: boolean }
        // ----------------------------------------------------------------
        case 'workspace_cw_brand_voice_learn': {
            const samples = (payload['samples'] as BrandVoiceSample[]) ?? [];
            const base = (payload['baseBrandVoice'] as BrandVoice) ?? {
                style: 'professional',
                doNotUse: [],
                signaturePhrase: null,
            };
            if (payload['semantic'] === true && callerFn) {
                const learned = await learnBrandVoiceSemantic(samples, base, callerFn);
                return jsonOut(learned);
            }
            const learned = learnBrandVoice(samples, base);
            return jsonOut(learned);
        }

        // ----------------------------------------------------------------
        // workspace_cw_verify_facts
        // payload: { report: FactCheckReport, researchResult?: ContentResearchResult }
        // ----------------------------------------------------------------
        case 'workspace_cw_verify_facts': {
            if (!callerFn) return noLlm();
            const report = payload['report'] as Parameters<typeof verifyFactsWithLlm>[0] | undefined;
            if (!report) return fail('payload.report is required for workspace_cw_verify_facts');
            const sourcesConfig = payload['researchResult'] != null
                ? (payload['researchResult'] as Parameters<typeof verifyFactsWithLlm>[1])
                : null;
            const verified = await verifyFactsWithLlm(report, sourcesConfig, callerFn);
            return jsonOut(verified);
        }

        // ----------------------------------------------------------------
        // workspace_cw_review_prose
        // payload: { body: string, spec: ContentBriefSpec }
        // ----------------------------------------------------------------
        case 'workspace_cw_review_prose': {
            if (!callerFn) return noLlm();
            const body = str(payload['body']);
            if (!body) return fail('payload.body is required for workspace_cw_review_prose');
            const spec = (payload['spec'] as ContentBriefSpec | undefined) ?? {
                audience: null, tone: null, format: null,
                wordCount: null, keyMessages: [], callToAction: null, deadline: null,
            };
            const result = await reviewAndRefineProse(body, spec, callerFn);
            return jsonOut(result);
        }

        // ----------------------------------------------------------------
        // workspace_cw_detect_plagiarism
        // payload: { body: string }
        // ----------------------------------------------------------------
        case 'workspace_cw_detect_plagiarism': {
            if (!callerFn) return noLlm();
            const body = str(payload['body']);
            if (!body) return fail('payload.body is required for workspace_cw_detect_plagiarism');
            const report = await detectPlagiarismWithCopyscape(body, callerFn, input.plagiarismFetchFn);
            return jsonOut(report);
        }

        // ----------------------------------------------------------------
        // workspace_cw_clarify_brief
        // payload: { parsedBrief: ParsedBrief }
        // ----------------------------------------------------------------
        case 'workspace_cw_clarify_brief': {
            const parsed = payload['parsedBrief'] as Parameters<typeof buildClarificationQuestions>[0] | undefined;
            if (!parsed) return fail('payload.parsedBrief is required for workspace_cw_clarify_brief');
            const questions = buildClarificationQuestions(parsed);
            return jsonOut({ questions });
        }

        // ----------------------------------------------------------------
        // workspace_cw_localize_content
        // payload: { body: string, targetLocale: string, targetRegion?: string, adaptOnly?: boolean }
        // ----------------------------------------------------------------
        case 'workspace_cw_localize_content': {
            if (!callerFn) return noLlm();
            const req: LocalizeRequest = {
                body: str(payload['body']),
                targetLocale: str(payload['targetLocale'] ?? 'en-US'),
                targetRegion: typeof payload['targetRegion'] === 'string' ? payload['targetRegion'] : undefined,
                adaptOnly: payload['adaptOnly'] !== false,
            };
            if (!req.body) return fail('payload.body is required for workspace_cw_localize_content');
            const result = await localizeContentWithDeepL(req, callerFn, input.deeplFetchFn);
            return jsonOut(result);
        }

        // ----------------------------------------------------------------
        // workspace_cw_analytics_report
        // payload: { platform?: 'ga4' | 'mixpanel',
        //   GA4:      propertyId, startDate, endDate, accessToken, pagePath?
        //   Mixpanel: projectId, fromDate, toDate, serviceAccountUsername, serviceAccountSecret, events?
        // }
        // ----------------------------------------------------------------
        case 'workspace_cw_analytics_report': {
            const platform = typeof payload['platform'] === 'string' ? payload['platform'] : 'ga4';

            if (platform === 'mixpanel') {
                const projectId = str(payload['projectId']);
                const fromDate = str(payload['fromDate']);
                const toDate = str(payload['toDate']);
                const serviceAccountUsername = str(payload['serviceAccountUsername']);
                const serviceAccountSecret = str(payload['serviceAccountSecret']);
                if (!projectId) return fail('payload.projectId is required for Mixpanel analytics');
                if (!fromDate) return fail('payload.fromDate is required for Mixpanel analytics');
                if (!toDate) return fail('payload.toDate is required for Mixpanel analytics');
                if (!serviceAccountUsername) return fail('payload.serviceAccountUsername is required for Mixpanel analytics');
                if (!serviceAccountSecret) return fail('payload.serviceAccountSecret is required for Mixpanel analytics');
                const mixQuery: MixpanelQuery = {
                    projectId,
                    fromDate,
                    toDate,
                    serviceAccountUsername,
                    serviceAccountSecret,
                    events: Array.isArray(payload['events']) ? payload['events'] as string[] : undefined,
                };
                const report = await fetchMixpanelReport(mixQuery, input.analyticsFetchFn);
                return report.ok ? jsonOut(report) : fail(report.errorMessage ?? 'Mixpanel fetch failed');
            }

            // Default: GA4
            const propertyId = str(payload['propertyId']);
            const startDate = str(payload['startDate']);
            const endDate = str(payload['endDate']);
            const accessToken = str(payload['accessToken']);
            if (!propertyId) return fail('payload.propertyId is required for workspace_cw_analytics_report');
            if (!startDate) return fail('payload.startDate is required for workspace_cw_analytics_report');
            if (!endDate) return fail('payload.endDate is required for workspace_cw_analytics_report');
            if (!accessToken) return fail('payload.accessToken is required for workspace_cw_analytics_report');

            const query: AnalyticsQuery = {
                propertyId,
                startDate,
                endDate,
                accessToken,
                pagePath: typeof payload['pagePath'] === 'string' ? payload['pagePath'] : undefined,
            };
            const report = await fetchAnalyticsReport(query, input.analyticsFetchFn);
            return report.ok ? jsonOut(report) : fail(report.errorMessage ?? 'Analytics fetch failed');
        }

        // workspace_cw_send_for_review
        // payload: {
        //   title: string,               — draft title
        //   draftBody: string,           — full draft body
        //   wordCount?: number,          — optional; computed from body if absent
        //   reviewerUrl: string,         — Slack/webhook/email API endpoint (from connector config)
        //   reviewerDisplayName: string, — display name or email of the reviewer
        //   channel: 'slack'|'webhook'|'email', — notification channel
        //   agentName?: string,          — agent display name (persona)
        //   notes?: string,              — agent-to-reviewer notes
        // }
        // ----------------------------------------------------------------
        case 'workspace_cw_send_for_review': {
            const title = str(payload['title']);
            const draftBody = str(payload['draftBody']);
            const reviewerUrl = str(payload['reviewerUrl']);
            const reviewerDisplayName = str(payload['reviewerDisplayName']);
            const channel = str(payload['channel']);
            if (!title) return fail('payload.title is required for workspace_cw_send_for_review');
            if (!draftBody) return fail('payload.draftBody is required for workspace_cw_send_for_review');
            if (!reviewerUrl) return fail('payload.reviewerUrl is required for workspace_cw_send_for_review');
            if (!reviewerDisplayName) return fail('payload.reviewerDisplayName is required for workspace_cw_send_for_review');
            const validChannels: ReviewChannel[] = ['slack', 'webhook', 'email'];
            if (!validChannels.includes(channel as ReviewChannel)) {
                return fail(`payload.channel must be one of: ${validChannels.join(', ')}`);
            }

            const reviewReq: SendReviewRequest = {
                title,
                draftBody,
                wordCount: typeof payload['wordCount'] === 'number' ? payload['wordCount'] : undefined,
                reviewerUrl,
                reviewerDisplayName,
                channel: channel as ReviewChannel,
                agentName: typeof payload['agentName'] === 'string' ? payload['agentName'] : undefined,
                notes: typeof payload['notes'] === 'string' ? payload['notes'] : undefined,
            };
            const result = await sendForReview(reviewReq, input.reviewFetchFn);
            return result.ok ? jsonOut(result) : fail(result.errorMessage ?? 'Review dispatch failed');
        }

        // ----------------------------------------------------------------
        // workspace_cw_run_workflow  — multi-step chained pipeline
        // payload: ContentWorkflowInput
        // ----------------------------------------------------------------
        case 'workspace_cw_run_workflow': {
            const title = str(payload['title']);
            const topic = str(payload['topic']) ?? str(payload['title']);
            if (!title) return fail('payload.title is required for workspace_cw_run_workflow');
            if (!topic) return fail('payload.topic is required for workspace_cw_run_workflow');

            const rawPreset = str(payload['preset']);
            const validPresets: WorkflowPreset[] = ['full_pipeline', 'write_and_review', 'research_and_draft'];
            const preset: WorkflowPreset = validPresets.includes(rawPreset as WorkflowPreset)
                ? (rawPreset as WorkflowPreset)
                : 'full_pipeline';

            const skipStepsRaw = payload['skipSteps'];
            const skipSteps = Array.isArray(skipStepsRaw)
                ? skipStepsRaw.filter((s): s is string => typeof s === 'string') as ContentWorkflowInput['skipSteps']
                : undefined;

            const cwInput: ContentWorkflowInput = {
                title,
                topic,
                audience: str(payload['audience']) ?? undefined,
                format: (['blog_post', 'email_campaign', 'social_post', 'internal_announcement'] as const)
                    .find((f) => f === str(payload['format'])) ?? undefined,
                tone: str(payload['tone']) ?? undefined,
                keywords: Array.isArray(payload['keywords'])
                    ? payload['keywords'].filter((k): k is string => typeof k === 'string')
                    : undefined,
                wordCount: typeof payload['wordCount'] === 'number' ? payload['wordCount'] : undefined,
                brandVoice: typeof payload['brandVoice'] === 'object' && payload['brandVoice'] !== null
                    ? (payload['brandVoice'] as ContentWorkflowInput['brandVoice'])
                    : undefined,
                preset,
                skipSteps,
                reviewerUrl: str(payload['reviewerUrl']) ?? undefined,
                reviewerDisplayName: str(payload['reviewerDisplayName']) ?? undefined,
                reviewChannel: (['slack', 'webhook', 'email'] as const).find(
                    (c) => c === str(payload['reviewChannel']),
                ) ?? undefined,
                agentName: str(payload['agentName']) ?? undefined,
            };

            const workflowResult = await runContentWorkflow(cwInput, {
                callerFn: input.callerFn,
                reviewFetchFn: input.reviewFetchFn,
            });

            if (!workflowResult.ok) {
                return {
                    ok: false,
                    output: JSON.stringify(workflowResult, null, 2),
                    errorOutput: workflowResult.errorOutput ?? 'Workflow run failed',
                };
            }
            return jsonOut(workflowResult);
        }

        // ----------------------------------------------------------------
        // workspace_cw_request_human_gate  — human validation gate
        // Builds a structured approval request for a CW capability gap.
        // The action always routes to the approval queue (NEVER_AUTO_APPROVE);
        // the executor returns ok:true so the task waits for human decision.
        //
        // payload:
        //   gateType        : ContentWriterGateType  (required)
        //   title           : string                 (required)
        //   topic           : string                 (required)
        //   wordCount?      : number
        //   publishTarget?  : string
        // ----------------------------------------------------------------
        case 'workspace_cw_request_human_gate': {
            const rawGateType = str(payload['gateType']);
            const title = str(payload['title']);
            const topic = str(payload['topic']) ?? str(payload['title']);

            if (!rawGateType) return fail('payload.gateType is required for workspace_cw_request_human_gate');
            if (!isContentWriterGateType(rawGateType)) {
                return fail(`Unknown gateType '${rawGateType}' for workspace_cw_request_human_gate`);
            }
            if (!title) return fail('payload.title is required for workspace_cw_request_human_gate');
            if (!topic) return fail('payload.topic is required for workspace_cw_request_human_gate');

            const gateInput: HumanGateInput = {
                gateType: rawGateType,
                title,
                topic,
                wordCount: typeof payload['wordCount'] === 'number' ? payload['wordCount'] : undefined,
                publishTarget: str(payload['publishTarget']) ?? undefined,
            };

            const gateRecord = buildHumanGateRecord(gateInput);

            return jsonOut({
                gateType: gateRecord.gateType,
                category: gateRecord.category,
                riskLevel: gateRecord.riskLevel,
                label: gateRecord.label,
                question: gateRecord.question,
                safeTitle: gateRecord.safeTitle,
                safeTopic: gateRecord.safeTopic,
                wordCount: gateRecord.wordCount,
                publishTarget: gateRecord.publishTarget,
                // Fields consumed by runtime-server to populate the approval packet:
                approval_summary: buildHumanGateApprovalSummary(gateRecord),
                impacted_scope: buildHumanGateImpactScope(gateRecord),
                risk_reason: buildHumanGateRiskReason(gateRecord),
            });
        }

        default: {
            const exhaustive: never = actionType;
            return fail(`Unknown content writer action type: ${String(exhaustive)}`);
        }
    }
}

// ---------------------------------------------------------------------------
// Post-decision hooks
// ---------------------------------------------------------------------------

export async function onContentPublished(params: {
    tenantId: string; botId?: string; workspaceId: string; taskId: string;
    contentTitle: string; documentType: import('./content-writer-rag-retriever.js').ContentDocumentType;
    content: string; sourceUrl?: string;
    gatewayBaseUrl: string; serviceToken: string;
}): Promise<void> {
    try {
        const { ingestPublishedContent } = await import('./content-writer-rag-retriever.js');
        await ingestPublishedContent({ ...params });
    } catch { /* non-fatal */ }
}

/** Alias following the onAgent*Approved naming convention used by all other agents. */
export const onContentApproved = onContentPublished;

export async function onContentFeedbackReceived(params: {
    tenantId: string; workspaceId: string; taskId: string; contentId: string;
    feedbackReasons: string[];
    gatewayBaseUrl: string; serviceToken: string;
}): Promise<void> {
    try {
        const { ingestContentFeedback, GatewayContentLessonStore } = await import('./content-writer-lesson-pipeline.js');
        const store = new GatewayContentLessonStore(params.gatewayBaseUrl, params.serviceToken);
        await ingestContentFeedback(
            { tenantId: params.tenantId, workspaceId: params.workspaceId, taskId: params.taskId, contentId: params.contentId, documentType: 'any', actionType: 'feedback', correlationId: params.taskId },
            params.feedbackReasons.map((body) => ({ body })),
            store,
        );
    } catch { /* non-fatal */ }
}
