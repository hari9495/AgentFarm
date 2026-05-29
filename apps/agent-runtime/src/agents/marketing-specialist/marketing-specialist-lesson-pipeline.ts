/**
 * Marketing Specialist — Lesson Pipeline
 *
 * Captures campaign failure feedback, A/B test results, and PPC audit findings
 * and converts them into structured marketing lessons stored in long-term memory.
 *
 * Lesson categories:
 *   targeting_accuracy     — audience segment was wrong or too broad/narrow
 *   creative_quality       — creative (copy, image, CTA) was weak or off-brand
 *   channel_selection      — wrong channel mix for the goal or audience
 *   budget_allocation      — budget was wasted on low-performing channels
 *   timing                 — launch timing missed peak windows or seasonal trends
 *   message_clarity        — core message was confusing, weak, or uncompelling
 *   conversion_optimization — landing page, funnel, or CTA caused drop-off
 */

import { randomUUID } from 'node:crypto';
import type { TaskEnvelope, ProcessedTaskResult } from '../../execution-engine.js';

export type MarketingLessonCategory =
    | 'targeting_accuracy'
    | 'creative_quality'
    | 'channel_selection'
    | 'budget_allocation'
    | 'timing'
    | 'message_clarity'
    | 'conversion_optimization';

export type MarketingDocTypeFilter =
    | 'campaign_plan'
    | 'email_sequence'
    | 'kpi_report'
    | 'creative_brief'
    | 'ab_test_analysis'
    | 'any';

export interface MarketingLesson {
    id: string;
    tenantId: string;
    workspaceId: string;
    sourceTaskId: string;
    sourceCampaignId: string;
    feedback: string;
    category: MarketingLessonCategory;
    applicableDocTypes: MarketingDocTypeFilter[];
    learnedAt: string;
    correlationId: string;
}

export interface MarketingFeedbackContext {
    tenantId: string;
    workspaceId: string;
    taskId: string;
    campaignId: string;
    documentType: MarketingDocTypeFilter;
    actionType: string;
    correlationId: string;
}

export interface MarketingFeedbackItem {
    body: string;
    author?: string;
    createdAt?: string;
}

export interface IMarketingLessonStore {
    save(lesson: MarketingLesson): Promise<void>;
    findByWorkspace(workspaceId: string, filter?: { docType?: MarketingDocTypeFilter; category?: MarketingLessonCategory; limit?: number }): Promise<MarketingLesson[]>;
}

export class InMemoryMarketingLessonStore implements IMarketingLessonStore {
    private readonly store = new Map<string, MarketingLesson>();
    async save(lesson: MarketingLesson): Promise<void> { this.store.set(lesson.id, { ...lesson }); }
    async findByWorkspace(workspaceId: string, filter?: { docType?: MarketingDocTypeFilter; category?: MarketingLessonCategory; limit?: number }): Promise<MarketingLesson[]> {
        let results = [...this.store.values()].filter((l) => l.workspaceId === workspaceId);
        if (filter?.category) results = results.filter((l) => l.category === filter.category);
        if (filter?.docType && filter.docType !== 'any') results = results.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
        results.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
        return filter?.limit ? results.slice(0, filter.limit) : results;
    }
}

export class GatewayMarketingLessonStore implements IMarketingLessonStore {
    constructor(private readonly gatewayBaseUrl: string, private readonly serviceToken: string) {}
    async save(lesson: MarketingLesson): Promise<void> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try {
            await fetch(`${base}/v1/memory/patterns`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` }, body: JSON.stringify({ tenantId: lesson.tenantId, workspaceId: lesson.workspaceId, pattern: `ms:lesson:${lesson.category}:${lesson.workspaceId}:${lesson.id}`, summary: `[${lesson.category}] ${lesson.feedback.slice(0, 200)}`, confidence: 0.7, observedCount: 1, lastSeen: lesson.learnedAt, metadata: { lessonId: lesson.id, category: lesson.category, docTypes: lesson.applicableDocTypes, feedback: lesson.feedback, sourceTaskId: lesson.sourceTaskId, sourceCampaignId: lesson.sourceCampaignId, correlationId: lesson.correlationId, learnedAt: lesson.learnedAt } }), signal: AbortSignal.timeout(10_000) });
        } catch (err) { console.warn(`[GatewayMarketingLessonStore] save failed: ${String(err)}`); }
    }
    async findByWorkspace(workspaceId: string, filter?: { docType?: MarketingDocTypeFilter; category?: MarketingLessonCategory; limit?: number }): Promise<MarketingLesson[]> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try {
            const res = await fetch(`${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`, { method: 'GET', headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` }, signal: AbortSignal.timeout(10_000) });
            if (!res.ok) return [];
            const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number; lastSeen?: string; metadata?: Record<string, unknown> }> };
            let lessons: MarketingLesson[] = (data.patterns ?? []).filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith('ms:lesson:') && p.pattern.includes(`:${workspaceId}:`)).map((p): MarketingLesson | null => {
                const meta = p.metadata as Record<string, unknown> | undefined;
                const feedback = String(meta?.['feedback'] ?? p.summary ?? '').replace(/^\[[\w_]+\] /, '');
                if (!feedback) return null;
                const keyParts = (p.pattern ?? '').split(':');
                return { id: String(meta?.['lessonId'] ?? keyParts[4] ?? Math.random().toString(36).slice(2)), tenantId: '', workspaceId, sourceTaskId: String(meta?.['sourceTaskId'] ?? ''), sourceCampaignId: String(meta?.['sourceCampaignId'] ?? ''), feedback, category: (meta?.['category'] ?? keyParts[2] ?? 'message_clarity') as MarketingLessonCategory, applicableDocTypes: Array.isArray(meta?.['docTypes']) ? (meta['docTypes'] as MarketingDocTypeFilter[]) : ['any'], learnedAt: String(meta?.['learnedAt'] ?? p.lastSeen ?? new Date().toISOString()), correlationId: String(meta?.['correlationId'] ?? '') };
            }).filter((l): l is MarketingLesson => l !== null);
            if (filter?.category) lessons = lessons.filter((l) => l.category === filter.category);
            if (filter?.docType && filter.docType !== 'any') lessons = lessons.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
            lessons.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
            return filter?.limit ? lessons.slice(0, filter.limit) : lessons;
        } catch (err) { console.warn(`[GatewayMarketingLessonStore] findByWorkspace failed: ${String(err)}`); return []; }
    }
}

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: MarketingLessonCategory }> = [
    { pattern: /\b(wrong audience|too broad|too narrow|segment|ICP|persona|not our target|bad targeting|reach)\b/i, category: 'targeting_accuracy' },
    { pattern: /\b(creative|copy|headline|CTA|image|video|ad creative|weak copy|off.brand|boring|clickbait|no CTA)\b/i, category: 'creative_quality' },
    { pattern: /\b(channel|platform|LinkedIn|Facebook|Google|email|PPC|SEO|wrong channel|channel mix|wasted spend)\b/i, category: 'channel_selection' },
    { pattern: /\b(budget|overspend|ROAS|ROI|CPL|CPC|CPM|waste|underfunded|bid|allocation|too much spent)\b/i, category: 'budget_allocation' },
    { pattern: /\b(timing|seasonal|launch date|peak|missed window|too early|too late|Q4|holiday|date)\b/i, category: 'timing' },
    { pattern: /\b(message|value proposition|confusing|unclear|too complex|no hook|weak headline|didn.t resonate|bland)\b/i, category: 'message_clarity' },
    { pattern: /\b(conversion|landing page|form|funnel|drop.off|bounce|cart abandonment|CTA|checkout|sign.up|friction)\b/i, category: 'conversion_optimization' },
];

export function classifyMarketingFeedback(body: string): MarketingLessonCategory {
    for (const { pattern, category } of CATEGORY_PATTERNS) {
        if (pattern.test(body)) return category;
    }
    return 'message_clarity';
}

export async function ingestMarketingFeedback(ctx: MarketingFeedbackContext, feedbackItems: MarketingFeedbackItem[], store: IMarketingLessonStore): Promise<MarketingLesson[]> {
    const lessons: MarketingLesson[] = [];
    for (const item of feedbackItems) {
        const body = item.body.trim();
        if (body.length < 10) continue;
        const category = classifyMarketingFeedback(body);
        const lesson: MarketingLesson = { id: randomUUID(), tenantId: ctx.tenantId, workspaceId: ctx.workspaceId, sourceTaskId: ctx.taskId, sourceCampaignId: ctx.campaignId, feedback: body, category, applicableDocTypes: ['any'], learnedAt: item.createdAt ?? new Date().toISOString(), correlationId: ctx.correlationId };
        await store.save(lesson);
        lessons.push(lesson);
    }
    return lessons;
}

export function formatMarketingLessonsForPrompt(lessons: MarketingLesson[]): string {
    if (lessons.length === 0) return '';
    return `Workspace marketing rules (from past campaign feedback):\n${lessons.slice(0, 12).map((l) => `- [${l.category}] ${l.feedback}`).join('\n')}`;
}

function msOutcomeTag(result: ProcessedTaskResult): 'success' | 'fail' { return result.status === 'success' ? 'success' : 'fail'; }

export function buildMarketingEpisodicPattern(_task: TaskEnvelope, result: ProcessedTaskResult): string {
    const at = result.decision.actionType;
    const oc = msOutcomeTag(result);
    const map: Record<string, string> = { workspace_ms_plan_campaign: 'ms:plan_campaign', workspace_ms_monitor_campaign: 'ms:monitor_campaign', workspace_ms_optimize_ppc: 'ms:optimize_ppc', workspace_ms_segment_audience: 'ms:segment_audience', workspace_ms_analyze_competitor: 'ms:analyze_competitor', workspace_ms_keyword_research: 'ms:keyword_research', workspace_ms_build_email_sequence: 'ms:build_email_sequence', workspace_ms_schedule_social: 'ms:schedule_social', workspace_ms_generate_kpi_report: 'ms:generate_kpi_report', workspace_ms_analyze_ab_test: 'ms:analyze_ab_test', workspace_ms_market_research: 'ms:market_research', workspace_ms_optimize_conversion: 'ms:optimize_conversion', workspace_ms_coordinate_assets: 'ms:coordinate_assets' };
    return `${map[at] ?? `ms:${at}`}:${oc}`;
}

export function buildMarketingEpisodicSummary(task: TaskEnvelope, result: ProcessedTaskResult): string {
    const pattern = buildMarketingEpisodicPattern(task, result);
    const at = result.decision.actionType;
    const oc = msOutcomeTag(result);
    const title = (typeof task.payload['campaignTitle'] === 'string' ? task.payload['campaignTitle'] : typeof task.payload['title'] === 'string' ? task.payload['title'] : at).slice(0, 120);
    if (pattern.startsWith('ms:plan_campaign'))       return `Campaign planned ${oc}: ${title}`;
    if (pattern.startsWith('ms:build_email_sequence')) return `Email sequence built ${oc}: ${title}`;
    if (pattern.startsWith('ms:generate_kpi_report')) return `KPI report generated ${oc}: ${title}`;
    if (pattern.startsWith('ms:analyze_ab_test'))     return `A/B test analysed ${oc}: ${title}`;
    if (pattern.startsWith('ms:optimize_ppc'))        return `PPC optimised ${oc}: ${title}`;
    return `Marketing action "${at}" completed with status "${oc}": ${title}`;
}
