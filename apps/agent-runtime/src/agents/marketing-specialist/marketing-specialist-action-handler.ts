/**
 * Marketing Specialist Action Handler (Tier 46)
 *
 * Dispatches workspace_ms_* actions to domain modules:
 *
 *   workspace_ms_plan_campaign         — build multi-channel campaign plan
 *   workspace_ms_monitor_campaign      — fetch live performance from ad platforms + GA4
 *   workspace_ms_optimize_ppc          — analyze PPC campaigns and produce recommendations
 *   workspace_ms_segment_audience      — segment and value-rank audience data
 *   workspace_ms_analyze_competitor    — competitor research + SWOT + content gaps
 *   workspace_ms_keyword_research      — SEO/SEM keyword research (DataForSEO or heuristic)
 *   workspace_ms_build_email_sequence  — build HubSpot/Mailchimp automation sequence
 *   workspace_ms_schedule_social       — plan and schedule social posts (Hootsuite)
 *   workspace_ms_generate_kpi_report   — compile KPI report for stakeholders
 *   workspace_ms_analyze_ab_test       — A/B test statistical significance analysis
 *   workspace_ms_market_research       — market research, trends, personas
 *   workspace_ms_optimize_conversion   — conversion funnel analysis and CRO recommendations
 *   workspace_ms_coordinate_assets     — produce creative brief for design/video teams
 *   workspace_ms_align_cross_team      — build cross-team alignment report
 *   workspace_ms_run_campaign_workflow — full end-to-end campaign workflow
 *   workspace_ms_request_human_gate    — route high-risk action to human approval
 */

import type { LocalWorkspaceResult } from '../../local-workspace-executor.js';
import type { ProseCallerFn } from './email-automation-builder.js';
import type { MonitorFetchFn } from './campaign-monitor.js';
import type { CompetitorFetchFn } from './competitor-analyzer.js';
import type { KeywordFetchFn } from './seo-keyword-researcher.js';
import type { SocialFetchFn } from './social-media-scheduler.js';

import { buildCampaignPlan } from './campaign-planner.js';
import type { CampaignBrief, CampaignGoal, CampaignChannel } from './campaign-planner.js';
import { fetchCampaignMetrics } from './campaign-monitor.js';
import type { CampaignMonitorQuery } from './campaign-monitor.js';
import { analyzePpcPerformance } from './ppc-optimizer.js';
import type { PpcCampaignData, OptimizationGoal } from './ppc-optimizer.js';
import { segmentAudience } from './audience-segmenter.js';
import type { AudienceSegmentInput } from './audience-segmenter.js';
import { analyzeCompetitors } from './competitor-analyzer.js';
import type { CompetitorAnalysisInput } from './competitor-analyzer.js';
import { researchKeywords } from './seo-keyword-researcher.js';
import type { KeywordResearchInput } from './seo-keyword-researcher.js';
import { buildEmailSequence } from './email-automation-builder.js';
import type { EmailSequenceSpec, SequenceType } from './email-automation-builder.js';
import { buildSocialCalendar } from './social-media-scheduler.js';
import type { SocialCalendarInput, SocialPlatform } from './social-media-scheduler.js';
import { buildKpiReport } from './kpi-report-builder.js';
import type { KpiReportInput, ChannelMetrics } from './kpi-report-builder.js';
import { analyzeAbTest } from './ab-test-analyzer.js';
import type { AbTestInput } from './ab-test-analyzer.js';
import { conductMarketResearch } from './market-research-service.js';
import type { MarketResearchInput } from './market-research-service.js';
import { analyzeConversionFunnel } from './conversion-optimizer.js';
import type { ConversionFunnelData } from './conversion-optimizer.js';
import { buildCreativeBrief } from './asset-coordinator.js';
import type { CreativeBriefInput, AssetSpec } from './asset-coordinator.js';
import { buildAlignmentReport } from './cross-team-aligner.js';
import type { AlignmentInput, TeamUpdate } from './cross-team-aligner.js';
import { runCampaignWorkflow } from './campaign-workflow-engine.js';
import type { CampaignWorkflowInput } from './campaign-workflow-engine.js';
import {
    isMarketingGateType,
    buildMarketingGateRecord,
    buildMarketingGateApprovalSummary,
    buildMarketingGateImpactScope,
    buildMarketingGateRiskReason,
} from './human-gate-requests.js';
import type { MarketingGateInput } from './human-gate-requests.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MarketingSpecialistActionType =
    | 'workspace_ms_plan_campaign'
    | 'workspace_ms_monitor_campaign'
    | 'workspace_ms_optimize_ppc'
    | 'workspace_ms_segment_audience'
    | 'workspace_ms_analyze_competitor'
    | 'workspace_ms_keyword_research'
    | 'workspace_ms_build_email_sequence'
    | 'workspace_ms_schedule_social'
    | 'workspace_ms_generate_kpi_report'
    | 'workspace_ms_analyze_ab_test'
    | 'workspace_ms_market_research'
    | 'workspace_ms_optimize_conversion'
    | 'workspace_ms_coordinate_assets'
    | 'workspace_ms_align_cross_team'
    | 'workspace_ms_run_campaign_workflow'
    | 'workspace_ms_request_human_gate';

export function isMarketingSpecialistActionType(t: string): t is MarketingSpecialistActionType {
    return (
        t === 'workspace_ms_plan_campaign' ||
        t === 'workspace_ms_monitor_campaign' ||
        t === 'workspace_ms_optimize_ppc' ||
        t === 'workspace_ms_segment_audience' ||
        t === 'workspace_ms_analyze_competitor' ||
        t === 'workspace_ms_keyword_research' ||
        t === 'workspace_ms_build_email_sequence' ||
        t === 'workspace_ms_schedule_social' ||
        t === 'workspace_ms_generate_kpi_report' ||
        t === 'workspace_ms_analyze_ab_test' ||
        t === 'workspace_ms_market_research' ||
        t === 'workspace_ms_optimize_conversion' ||
        t === 'workspace_ms_coordinate_assets' ||
        t === 'workspace_ms_align_cross_team' ||
        t === 'workspace_ms_run_campaign_workflow' ||
        t === 'workspace_ms_request_human_gate'
    );
}

export interface MarketingSpecialistActionInput {
    actionType: MarketingSpecialistActionType;
    tenantId: string;
    botId: string;
    taskId: string;
    payload: Record<string, unknown>;
    workspaceDir: string;
    callerFn?: ProseCallerFn;
    monitorFetchFn?: MonitorFetchFn;
    competitorFetchFn?: CompetitorFetchFn;
    keywordFetchFn?: KeywordFetchFn;
    socialFetchFn?: SocialFetchFn;
    /** Optional — when provided, RAG context is fetched and prepended to every LLM call. */
    gatewayBaseUrl?: string;
    serviceToken?: string;
    workspaceId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(output: string): LocalWorkspaceResult { return { ok: true, output }; }
function fail(msg: string): LocalWorkspaceResult { return { ok: false, output: msg }; }
function jsonOut(v: unknown): LocalWorkspaceResult { return ok(JSON.stringify(v, null, 2)); }
function str(v: unknown): string { return typeof v === 'string' ? v : String(v ?? ''); }
function num(v: unknown, fallback: number): number { return typeof v === 'number' ? v : fallback; }
function strArr(v: unknown): string[] { return Array.isArray(v) ? v.map(str) : typeof v === 'string' ? [v] : []; }

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function handleMarketingSpecialistAction(
    input: MarketingSpecialistActionInput,
): Promise<LocalWorkspaceResult> {
    const { actionType, payload, callerFn: rawCallerFn, gatewayBaseUrl, serviceToken, workspaceId, tenantId, botId } = input;

    // RAG pre-flight — wrap callerFn with campaign and channel context
    let callerFn = rawCallerFn;
    if (rawCallerFn && gatewayBaseUrl && serviceToken && workspaceId) {
        try {
            const { buildMarketingRagContext } = await import('./marketing-specialist-rag-retriever.js');
            const ragCtx = await buildMarketingRagContext(
                {
                    tenantId, botId,
                    campaignTitle: String(payload['campaign_name'] ?? payload['title'] ?? actionType),
                    campaignDescription: String(payload['description'] ?? payload['goal'] ?? ''),
                    documentType: 'campaign_plan',
                },
                gatewayBaseUrl, serviceToken, workspaceId,
            );
            if (ragCtx.contextBlock) {
                callerFn = (prompt: string): Promise<string> => rawCallerFn(`${ragCtx.contextBlock}\n\n${prompt}`);
            }
        } catch { /* non-fatal */ }
    }

    switch (actionType) {
        // ----------------------------------------------------------------
        // workspace_ms_plan_campaign
        // payload: { goal, product, audience, budget, currency, startDate, endDate, region?, channels? }
        // ----------------------------------------------------------------
        case 'workspace_ms_plan_campaign': {
            const goal = str(payload['goal'] ?? 'lead_generation') as CampaignGoal;
            const product = str(payload['product']);
            const audience = str(payload['audience']);
            const budget = num(payload['budget'], 0);
            if (!product) return fail('payload.product is required');
            if (!audience) return fail('payload.audience is required');
            if (budget <= 0) return fail('payload.budget must be a positive number');
            const brief: CampaignBrief = {
                goal,
                product,
                audience,
                budget,
                currency: str(payload['currency'] ?? 'USD'),
                startDate: str(payload['startDate'] ?? new Date().toISOString().split('T')[0]),
                endDate: str(payload['endDate'] ?? ''),
                region: typeof payload['region'] === 'string' ? payload['region'] : undefined,
                channels: Array.isArray(payload['channels']) ? payload['channels'] as CampaignChannel[] : undefined,
            };
            return jsonOut(buildCampaignPlan(brief));
        }

        // ----------------------------------------------------------------
        // workspace_ms_monitor_campaign
        // payload: CampaignMonitorQuery fields
        // ----------------------------------------------------------------
        case 'workspace_ms_monitor_campaign': {
            const query: CampaignMonitorQuery = {
                dateFrom: str(payload['dateFrom'] ?? payload['startDate']),
                dateTo: str(payload['dateTo'] ?? payload['endDate']),
                ga4PropertyId: typeof payload['ga4PropertyId'] === 'string' ? payload['ga4PropertyId'] : undefined,
                ga4AccessToken: typeof payload['ga4AccessToken'] === 'string' ? payload['ga4AccessToken'] : undefined,
                googleAdsCampaignIds: Array.isArray(payload['googleAdsCampaignIds']) ? strArr(payload['googleAdsCampaignIds']) : undefined,
                googleAdsCustomerId: typeof payload['googleAdsCustomerId'] === 'string' ? payload['googleAdsCustomerId'] : undefined,
                googleAdsAccessToken: typeof payload['googleAdsAccessToken'] === 'string' ? payload['googleAdsAccessToken'] : undefined,
                metaAdAccountId: typeof payload['metaAdAccountId'] === 'string' ? payload['metaAdAccountId'] : undefined,
                metaAdCampaignIds: Array.isArray(payload['metaAdCampaignIds']) ? strArr(payload['metaAdCampaignIds']) : undefined,
                metaAccessToken: typeof payload['metaAccessToken'] === 'string' ? payload['metaAccessToken'] : undefined,
                linkedInAccountId: typeof payload['linkedInAccountId'] === 'string' ? payload['linkedInAccountId'] : undefined,
                linkedInCampaignIds: Array.isArray(payload['linkedInCampaignIds']) ? strArr(payload['linkedInCampaignIds']) : undefined,
                linkedInAccessToken: typeof payload['linkedInAccessToken'] === 'string' ? payload['linkedInAccessToken'] : undefined,
                currency: typeof payload['currency'] === 'string' ? payload['currency'] : undefined,
            };
            if (!query.dateFrom) return fail('payload.dateFrom is required');
            if (!query.dateTo) return fail('payload.dateTo is required');
            const result = await fetchCampaignMetrics(query, input.monitorFetchFn);
            return result.ok ? jsonOut(result) : fail(result.errorMessage ?? 'Campaign monitor fetch failed');
        }

        // ----------------------------------------------------------------
        // workspace_ms_optimize_ppc
        // payload: { campaigns: PpcCampaignData[], goal?: OptimizationGoal }
        // ----------------------------------------------------------------
        case 'workspace_ms_optimize_ppc': {
            const campaigns = payload['campaigns'] as PpcCampaignData[] | undefined;
            if (!campaigns || campaigns.length === 0) return fail('payload.campaigns array is required');
            const goal = str(payload['goal'] ?? 'maximize_conversions') as OptimizationGoal;
            return jsonOut(analyzePpcPerformance(campaigns, goal));
        }

        // ----------------------------------------------------------------
        // workspace_ms_segment_audience
        // payload: AudienceSegmentInput
        // ----------------------------------------------------------------
        case 'workspace_ms_segment_audience': {
            const segmentInput = payload as unknown as AudienceSegmentInput;
            if (!segmentInput.segments || !Array.isArray(segmentInput.segments)) {
                return fail('payload.segments array is required');
            }
            return jsonOut(segmentAudience(segmentInput));
        }

        // ----------------------------------------------------------------
        // workspace_ms_analyze_competitor
        // payload: CompetitorAnalysisInput
        // ----------------------------------------------------------------
        case 'workspace_ms_analyze_competitor': {
            const ownBrand = str(payload['ownBrand']);
            const ownDomain = str(payload['ownDomain']);
            const competitors = payload['competitors'] as CompetitorAnalysisInput['competitors'] | undefined;
            if (!ownBrand) return fail('payload.ownBrand is required');
            if (!competitors || competitors.length === 0) return fail('payload.competitors array is required');
            const analysisInput: CompetitorAnalysisInput = {
                ownBrand,
                ownDomain: ownDomain || ownBrand.toLowerCase().replace(/\s+/g, '') + '.io',
                competitors,
                targetKeywords: Array.isArray(payload['targetKeywords']) ? strArr(payload['targetKeywords']) : [],
                semrushApiKey: typeof payload['semrushApiKey'] === 'string' ? payload['semrushApiKey'] : undefined,
            };
            const result = await analyzeCompetitors(analysisInput, input.competitorFetchFn);
            return result.ok ? jsonOut(result) : fail(result.errorMessage ?? 'Competitor analysis failed');
        }

        // ----------------------------------------------------------------
        // workspace_ms_keyword_research
        // payload: KeywordResearchInput
        // ----------------------------------------------------------------
        case 'workspace_ms_keyword_research': {
            const seedKeywords = strArr(payload['seedKeywords']);
            if (seedKeywords.length === 0) return fail('payload.seedKeywords array is required');
            const kwInput: KeywordResearchInput = {
                seedKeywords,
                industry: str(payload['industry'] ?? 'Technology'),
                targetAudience: typeof payload['targetAudience'] === 'string' ? payload['targetAudience'] : undefined,
                dataforseoLogin: typeof payload['dataforseoLogin'] === 'string' ? payload['dataforseoLogin'] : undefined,
                dataforseoPassword: typeof payload['dataforseoPassword'] === 'string' ? payload['dataforseoPassword'] : undefined,
                locationCode: typeof payload['locationCode'] === 'number' ? payload['locationCode'] : undefined,
                languageCode: typeof payload['languageCode'] === 'string' ? payload['languageCode'] : undefined,
                maxResults: typeof payload['maxResults'] === 'number' ? payload['maxResults'] : undefined,
            };
            const result = await researchKeywords(kwInput, input.keywordFetchFn);
            return result.ok ? jsonOut(result) : fail(result.errorMessage ?? 'Keyword research failed');
        }

        // ----------------------------------------------------------------
        // workspace_ms_build_email_sequence
        // payload: EmailSequenceSpec
        // ----------------------------------------------------------------
        case 'workspace_ms_build_email_sequence': {
            const product = str(payload['product']);
            const audience = str(payload['audience']);
            if (!product) return fail('payload.product is required');
            if (!audience) return fail('payload.audience is required');
            const spec: EmailSequenceSpec = {
                sequenceType: str(payload['sequenceType'] ?? 'lead_nurture') as SequenceType,
                product,
                audience,
                goal: str(payload['goal'] ?? 'convert to paid'),
                fromName: typeof payload['fromName'] === 'string' ? payload['fromName'] : undefined,
                brand: typeof payload['brand'] === 'string' ? payload['brand'] : undefined,
                numEmails: typeof payload['numEmails'] === 'number' ? payload['numEmails'] : undefined,
                keyBenefit: typeof payload['keyBenefit'] === 'string' ? payload['keyBenefit'] : undefined,
                cta: typeof payload['cta'] === 'string' ? payload['cta'] : undefined,
            };
            const result = await buildEmailSequence(spec, callerFn);
            return jsonOut(result);
        }

        // ----------------------------------------------------------------
        // workspace_ms_schedule_social
        // payload: SocialCalendarInput
        // ----------------------------------------------------------------
        case 'workspace_ms_schedule_social': {
            const contentItems = payload['contentItems'] as SocialCalendarInput['contentItems'] | undefined;
            if (!contentItems || contentItems.length === 0) return fail('payload.contentItems array is required');
            const platforms = Array.isArray(payload['platforms'])
                ? payload['platforms'] as SocialPlatform[]
                : ['linkedin', 'twitter'] as SocialPlatform[];
            const startDate = str(payload['startDate']);
            if (!startDate) return fail('payload.startDate is required');
            const calInput: SocialCalendarInput = {
                contentItems,
                platforms,
                startDate,
                endDate: typeof payload['endDate'] === 'string' ? payload['endDate'] : undefined,
                postsPerWeek: typeof payload['postsPerWeek'] === 'number' ? payload['postsPerWeek'] : undefined,
                brand: typeof payload['brand'] === 'string' ? payload['brand'] : undefined,
                hootsuiteAccessToken: typeof payload['hootsuiteAccessToken'] === 'string' ? payload['hootsuiteAccessToken'] : undefined,
                hootsuiteProfileIds: typeof payload['hootsuiteProfileIds'] === 'object' && payload['hootsuiteProfileIds'] !== null
                    ? payload['hootsuiteProfileIds'] as Record<SocialPlatform, string>
                    : undefined,
            };
            const result = await buildSocialCalendar(calInput, input.socialFetchFn);
            return result.ok ? jsonOut(result) : fail(result.errorMessage ?? 'Social calendar build failed');
        }

        // ----------------------------------------------------------------
        // workspace_ms_generate_kpi_report
        // payload: KpiReportInput
        // ----------------------------------------------------------------
        case 'workspace_ms_generate_kpi_report': {
            const reportName = str(payload['reportName'] ?? 'Campaign KPI Report');
            const brand = str(payload['brand']);
            const currentMetrics = payload['currentMetrics'] as ChannelMetrics[] | undefined;
            if (!brand) return fail('payload.brand is required');
            if (!currentMetrics || currentMetrics.length === 0) return fail('payload.currentMetrics array is required');
            const currentPeriod = payload['currentPeriod'] as KpiReportInput['currentPeriod'] | undefined;
            if (!currentPeriod) return fail('payload.currentPeriod is required');
            const kpiInput: KpiReportInput = {
                reportName,
                brand,
                currentPeriod,
                previousPeriod: payload['previousPeriod'] as KpiReportInput['previousPeriod'] | undefined,
                currentMetrics,
                previousMetrics: payload['previousMetrics'] as ChannelMetrics[] | undefined,
                targets: payload['targets'] as KpiReportInput['targets'] | undefined,
                currency: typeof payload['currency'] === 'string' ? payload['currency'] : undefined,
            };
            return jsonOut(buildKpiReport(kpiInput));
        }

        // ----------------------------------------------------------------
        // workspace_ms_analyze_ab_test
        // payload: AbTestInput
        // ----------------------------------------------------------------
        case 'workspace_ms_analyze_ab_test': {
            const testName = str(payload['testName']);
            const metric = str(payload['metric']);
            const variants = payload['variants'] as AbTestInput['variants'] | undefined;
            if (!testName) return fail('payload.testName is required');
            if (!metric) return fail('payload.metric is required');
            if (!variants || variants.length < 2) return fail('payload.variants must have at least 2 entries');
            const abInput: AbTestInput = {
                testName,
                metric,
                variants,
                confidenceLevel: typeof payload['confidenceLevel'] === 'number'
                    ? payload['confidenceLevel'] as AbTestInput['confidenceLevel']
                    : undefined,
                minimumDetectableEffect: typeof payload['minimumDetectableEffect'] === 'number'
                    ? payload['minimumDetectableEffect']
                    : undefined,
            };
            return jsonOut(analyzeAbTest(abInput));
        }

        // ----------------------------------------------------------------
        // workspace_ms_market_research
        // payload: MarketResearchInput
        // ----------------------------------------------------------------
        case 'workspace_ms_market_research': {
            const industry = str(payload['industry']);
            const targetAudience = str(payload['targetAudience']);
            if (!industry) return fail('payload.industry is required');
            if (!targetAudience) return fail('payload.targetAudience is required');
            const mrInput: MarketResearchInput = {
                industry,
                targetAudience,
                geographies: Array.isArray(payload['geographies']) ? strArr(payload['geographies']) : undefined,
                researchTopics: Array.isArray(payload['researchTopics'])
                    ? payload['researchTopics'] as MarketResearchInput['researchTopics']
                    : undefined,
            };
            const result = await conductMarketResearch(mrInput);
            return jsonOut(result);
        }

        // ----------------------------------------------------------------
        // workspace_ms_optimize_conversion
        // payload: ConversionFunnelData
        // ----------------------------------------------------------------
        case 'workspace_ms_optimize_conversion': {
            const funnelName = str(payload['funnelName'] ?? 'Conversion Funnel');
            const steps = payload['steps'] as ConversionFunnelData['steps'] | undefined;
            if (!steps || steps.length === 0) return fail('payload.steps array is required');
            const funnelData: ConversionFunnelData = {
                funnelName,
                currency: typeof payload['currency'] === 'string' ? payload['currency'] : undefined,
                valuePerConversion: typeof payload['valuePerConversion'] === 'number' ? payload['valuePerConversion'] : undefined,
                steps,
                industryBenchmarks: typeof payload['industryBenchmarks'] === 'object' && payload['industryBenchmarks'] !== null
                    ? payload['industryBenchmarks'] as Record<string, number>
                    : undefined,
            };
            return jsonOut(analyzeConversionFunnel(funnelData));
        }

        // ----------------------------------------------------------------
        // workspace_ms_coordinate_assets
        // payload: CreativeBriefInput
        // ----------------------------------------------------------------
        case 'workspace_ms_coordinate_assets': {
            const campaignName = str(payload['campaignName']);
            const brand = str(payload['brand']);
            if (!campaignName) return fail('payload.campaignName is required');
            if (!brand) return fail('payload.brand is required');
            const assets = payload['assets'] as AssetSpec[] | undefined;
            if (!assets || assets.length === 0) return fail('payload.assets array is required');
            const deadline = str(payload['deadline']);
            if (!deadline) return fail('payload.deadline is required');
            const briefInput: CreativeBriefInput = {
                campaignName,
                brand,
                goal: str(payload['goal'] ?? 'awareness'),
                targetAudience: str(payload['targetAudience'] ?? ''),
                keyMessage: str(payload['keyMessage'] ?? ''),
                cta: str(payload['cta'] ?? 'Learn more'),
                assets,
                deadline,
                brandGuidelines: payload['brandGuidelines'] as CreativeBriefInput['brandGuidelines'],
                referenceExamples: Array.isArray(payload['referenceExamples']) ? strArr(payload['referenceExamples']) : undefined,
                reviewerNames: Array.isArray(payload['reviewerNames']) ? strArr(payload['reviewerNames']) : undefined,
            };
            return jsonOut(buildCreativeBrief(briefInput));
        }

        // ----------------------------------------------------------------
        // workspace_ms_align_cross_team
        // payload: AlignmentInput
        // ----------------------------------------------------------------
        case 'workspace_ms_align_cross_team': {
            const campaignContext = payload['campaignContext'] as AlignmentInput['campaignContext'] | undefined;
            if (!campaignContext) return fail('payload.campaignContext is required');
            const alignInput: AlignmentInput = {
                campaignContext,
                teamUpdates: (payload['teamUpdates'] as TeamUpdate[] | undefined) ?? [],
                marketingUpdates: Array.isArray(payload['marketingUpdates']) ? strArr(payload['marketingUpdates']) : [],
                sharedKpiTargets: payload['sharedKpiTargets'] as AlignmentInput['sharedKpiTargets'],
            };
            return jsonOut(buildAlignmentReport(alignInput));
        }

        // ----------------------------------------------------------------
        // workspace_ms_run_campaign_workflow
        // payload: CampaignWorkflowInput
        // HIGH-RISK — requires approval before executing live campaign steps
        // ----------------------------------------------------------------
        case 'workspace_ms_run_campaign_workflow': {
            const campaignName = str(payload['campaignName']);
            const product = str(payload['product']);
            const audience = str(payload['audience']);
            if (!campaignName) return fail('payload.campaignName is required');
            if (!product) return fail('payload.product is required');
            if (!audience) return fail('payload.audience is required');
            const wfInput: CampaignWorkflowInput = {
                campaignName,
                product,
                audience,
                goal: str(payload['goal'] ?? 'lead_generation'),
                budget: num(payload['budget'], 0),
                currency: str(payload['currency'] ?? 'USD'),
                startDate: str(payload['startDate'] ?? new Date().toISOString().split('T')[0]),
                endDate: str(payload['endDate'] ?? ''),
                brand: typeof payload['brand'] === 'string' ? payload['brand'] : undefined,
                industry: typeof payload['industry'] === 'string' ? payload['industry'] : undefined,
                seedKeywords: Array.isArray(payload['seedKeywords']) ? strArr(payload['seedKeywords']) : undefined,
                skipSteps: Array.isArray(payload['skipSteps']) ? payload['skipSteps'] as CampaignWorkflowInput['skipSteps'] : undefined,
                dataforseoLogin: typeof payload['dataforseoLogin'] === 'string' ? payload['dataforseoLogin'] : undefined,
                dataforseoPassword: typeof payload['dataforseoPassword'] === 'string' ? payload['dataforseoPassword'] : undefined,
                reviewerNames: Array.isArray(payload['reviewerNames']) ? strArr(payload['reviewerNames']) : undefined,
            };
            const result = await runCampaignWorkflow(wfInput, { callerFn });
            return result.ok
                ? jsonOut(result)
                : { ok: false, output: JSON.stringify(result, null, 2), errorOutput: result.errorOutput ?? 'Workflow failed' };
        }

        // ----------------------------------------------------------------
        // workspace_ms_request_human_gate
        // payload: MarketingGateInput
        // ----------------------------------------------------------------
        case 'workspace_ms_request_human_gate': {
            const rawGateType = str(payload['gateType']);
            const campaignName = str(payload['campaignName']);
            if (!rawGateType) return fail('payload.gateType is required');
            if (!isMarketingGateType(rawGateType)) return fail(`Unknown gateType: ${rawGateType}`);
            if (!campaignName) return fail('payload.campaignName is required');
            const gateInput: MarketingGateInput = {
                gateType: rawGateType,
                campaignName,
                detail: typeof payload['detail'] === 'string' ? payload['detail'] : undefined,
                budgetAmount: typeof payload['budgetAmount'] === 'number' ? payload['budgetAmount'] : undefined,
                currency: typeof payload['currency'] === 'string' ? payload['currency'] : undefined,
                recipientCount: typeof payload['recipientCount'] === 'number' ? payload['recipientCount'] : undefined,
                channel: typeof payload['channel'] === 'string' ? payload['channel'] : undefined,
            };
            const gate = buildMarketingGateRecord(gateInput);
            return jsonOut({
                gateType: gate.gateType,
                category: gate.category,
                riskLevel: gate.riskLevel,
                label: gate.label,
                question: gate.question,
                campaignName: gate.campaignName,
                approval_summary: buildMarketingGateApprovalSummary(gate),
                impacted_scope: buildMarketingGateImpactScope(gate),
                risk_reason: buildMarketingGateRiskReason(gate),
            });
        }

        default: {
            const exhaustive: never = actionType;
            return fail(`Unknown marketing specialist action type: ${String(exhaustive)}`);
        }
    }
}

// ---------------------------------------------------------------------------
// Post-decision hooks
// ---------------------------------------------------------------------------

export async function onMarketingCampaignApproved(params: {
    tenantId: string; botId?: string; workspaceId: string; taskId: string;
    campaignTitle: string; documentType: import('./marketing-specialist-rag-retriever.js').MarketingDocumentType;
    content: string; sourceUrl?: string;
    gatewayBaseUrl: string; serviceToken: string;
}): Promise<void> {
    try {
        const { ingestApprovedCampaign } = await import('./marketing-specialist-rag-retriever.js');
        await ingestApprovedCampaign({ ...params });
    } catch { /* non-fatal */ }
}

export async function onMarketingFeedbackReceived(params: {
    tenantId: string; workspaceId: string; taskId: string; campaignId: string;
    feedbackReasons: string[];
    gatewayBaseUrl: string; serviceToken: string;
}): Promise<void> {
    try {
        const { ingestMarketingFeedback, GatewayMarketingLessonStore } = await import('./marketing-specialist-lesson-pipeline.js');
        const store = new GatewayMarketingLessonStore(params.gatewayBaseUrl, params.serviceToken);
        await ingestMarketingFeedback(
            { tenantId: params.tenantId, workspaceId: params.workspaceId, taskId: params.taskId, campaignId: params.campaignId, documentType: 'any', actionType: 'feedback', correlationId: params.taskId },
            params.feedbackReasons.map((body) => ({ body })),
            store,
        );
    } catch { /* non-fatal */ }
}
