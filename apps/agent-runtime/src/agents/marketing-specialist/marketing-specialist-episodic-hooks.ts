/**
 * Marketing Specialist Episodic Hooks
 *
 * Derives domain-specific episodic pattern keys and summaries for
 * AgentLongTermMemory writes. Provides richer context than the generic
 * runtime action type string.
 */

import type { TaskEnvelope, ProcessedTaskResult } from '../../execution-engine.js';

function outcomeTag(result: ProcessedTaskResult): 'success' | 'fail' {
    return result.status === 'success' ? 'success' : 'fail';
}

/**
 * Derives a marketing-specific episodic pattern key.
 *
 * Pattern examples:
 *   "ms:campaign:planned"
 *   "ms:campaign:monitored"
 *   "ms:ppc:optimized:success"
 *   "ms:kpi:reported:success"
 *   "ms:ab_test:winner_declared"
 *   "ms:email:sequence:built"
 *   "ms:competitor:analyzed"
 */
export function buildMarketingEpisodicPattern(
    _task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const at = result.decision.actionType;
    const oc = outcomeTag(result);

    if (at === 'workspace_ms_plan_campaign') return `ms:campaign:planned:${oc}`;
    if (at === 'workspace_ms_monitor_campaign') return `ms:campaign:monitored:${oc}`;
    if (at === 'workspace_ms_optimize_ppc') return `ms:ppc:optimized:${oc}`;
    if (at === 'workspace_ms_segment_audience') return `ms:audience:segmented:${oc}`;
    if (at === 'workspace_ms_analyze_competitor') return `ms:competitor:analyzed:${oc}`;
    if (at === 'workspace_ms_keyword_research') return `ms:keywords:researched:${oc}`;
    if (at === 'workspace_ms_build_email_sequence') return `ms:email:sequence:built:${oc}`;
    if (at === 'workspace_ms_schedule_social') return `ms:social:scheduled:${oc}`;
    if (at === 'workspace_ms_generate_kpi_report') return `ms:kpi:reported:${oc}`;
    if (at === 'workspace_ms_analyze_ab_test') {
        const significant = result.executionPayload['isStatisticallySignificant'] === true;
        return significant ? 'ms:ab_test:winner_declared' : `ms:ab_test:inconclusive:${oc}`;
    }
    if (at === 'workspace_ms_market_research') return `ms:market:researched:${oc}`;
    if (at === 'workspace_ms_optimize_conversion') return `ms:cro:analyzed:${oc}`;
    if (at === 'workspace_ms_coordinate_assets') return `ms:assets:briefed:${oc}`;
    if (at === 'workspace_ms_align_cross_team') return `ms:alignment:reported:${oc}`;
    if (at === 'workspace_ms_run_campaign_workflow') return `ms:workflow:${oc}`;
    if (at === 'workspace_ms_request_human_gate') return `ms:gate:requested`;

    return `ms:action:${oc}`;
}

/**
 * Builds a richer episodic summary for the marketing specialist role.
 */
export function buildMarketingEpisodicSummary(
    task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const pattern = buildMarketingEpisodicPattern(task, result);
    const at = result.decision.actionType;

    const campaignName =
        typeof task.payload['campaignName'] === 'string' ? task.payload['campaignName'] :
        typeof task.payload['title'] === 'string' ? task.payload['title'] :
        typeof task.payload['description'] === 'string' ? task.payload['description'] : at;

    if (pattern.startsWith('ms:campaign:planned')) {
        return `Campaign plan built: ${campaignName}`;
    }
    if (pattern.startsWith('ms:campaign:monitored')) {
        const platforms = typeof task.payload['platforms'] === 'string' ? task.payload['platforms'] : '';
        return `Campaign monitored${platforms ? ` (${platforms})` : ''}: ${campaignName}`;
    }
    if (pattern.startsWith('ms:ppc:optimized')) {
        const count = typeof result.executionPayload['campaignCount'] === 'number' ? result.executionPayload['campaignCount'] : '?';
        return `PPC optimization: ${count} campaign(s) analyzed for ${campaignName}`;
    }
    if (pattern.startsWith('ms:audience:segmented')) {
        const count = typeof result.executionPayload['segmentCount'] === 'number' ? result.executionPayload['segmentCount'] : '?';
        return `Audience segmentation: ${count} segment(s) identified for ${campaignName}`;
    }
    if (pattern.startsWith('ms:competitor:analyzed')) {
        return `Competitor analysis completed: ${campaignName}`;
    }
    if (pattern.startsWith('ms:keywords:researched')) {
        const count = typeof result.executionPayload['keywordCount'] === 'number' ? result.executionPayload['keywordCount'] : '?';
        return `Keyword research: ${count} opportunities found for ${campaignName}`;
    }
    if (pattern.startsWith('ms:email:sequence:built')) {
        const type = typeof task.payload['sequenceType'] === 'string' ? task.payload['sequenceType'] : 'nurture';
        return `Email sequence built (${type}): ${campaignName}`;
    }
    if (pattern.startsWith('ms:social:scheduled')) {
        const count = typeof result.executionPayload['totalPosts'] === 'number' ? result.executionPayload['totalPosts'] : '?';
        return `Social calendar: ${count} posts scheduled for ${campaignName}`;
    }
    if (pattern.startsWith('ms:kpi:reported')) {
        return `KPI report generated: ${campaignName}`;
    }
    if (pattern === 'ms:ab_test:winner_declared') {
        const winner = typeof result.executionPayload['winner'] === 'string' ? result.executionPayload['winner'] : 'unknown';
        return `A/B test winner declared: "${winner}" for ${campaignName}`;
    }
    if (pattern.startsWith('ms:ab_test:inconclusive')) {
        return `A/B test inconclusive — more data needed: ${campaignName}`;
    }
    if (pattern.startsWith('ms:market:researched')) {
        return `Market research completed: ${campaignName}`;
    }
    if (pattern.startsWith('ms:cro:analyzed')) {
        return `Conversion funnel analyzed: ${campaignName}`;
    }
    if (pattern.startsWith('ms:assets:briefed')) {
        return `Creative brief generated: ${campaignName}`;
    }
    if (pattern.startsWith('ms:alignment:reported')) {
        return `Cross-team alignment report: ${campaignName}`;
    }
    if (pattern.startsWith('ms:workflow')) {
        const completed = typeof result.executionPayload['completedSteps'] === 'number' ? result.executionPayload['completedSteps'] : '?';
        return `Campaign workflow: ${completed} step(s) completed for ${campaignName}`;
    }
    if (pattern === 'ms:gate:requested') {
        const gateType = typeof task.payload['gateType'] === 'string' ? task.payload['gateType'] : 'unknown';
        return `Human approval gate requested (${gateType}): ${campaignName}`;
    }

    return `Marketing specialist task completed (${at}): ${campaignName}`;
}
