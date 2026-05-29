/**
 * Content Writer — Lesson Pipeline
 *
 * Captures editor feedback, SEO audit results, and performance data and
 * converts them into structured editorial lessons stored in long-term memory.
 *
 * Lesson categories:
 *   brand_voice      — content deviated from brand tone, style, or persona
 *   seo_optimization — missed keywords, poor meta, thin content, or link gaps
 *   factual_accuracy — claims were wrong, outdated, or unsourced
 *   structure        — heading hierarchy, paragraph length, or flow was poor
 *   engagement       — content failed to engage (high bounce, low time-on-page)
 *   tone             — tone was too formal, casual, promotional, or off-brand
 *   clarity          — content was confusing, jargon-heavy, or hard to follow
 */

import { randomUUID } from 'node:crypto';
import type { TaskEnvelope, ProcessedTaskResult } from '../../execution-engine.js';

export type ContentLessonCategory =
    | 'brand_voice'
    | 'seo_optimization'
    | 'factual_accuracy'
    | 'structure'
    | 'engagement'
    | 'tone'
    | 'clarity';

export type ContentDocTypeFilter =
    | 'blog_post'
    | 'landing_page'
    | 'email_copy'
    | 'social_post'
    | 'product_description'
    | 'whitepaper'
    | 'case_study'
    | 'any';

export interface ContentLesson {
    id: string;
    tenantId: string;
    workspaceId: string;
    sourceTaskId: string;
    sourceContentId: string;
    feedback: string;
    category: ContentLessonCategory;
    applicableDocTypes: ContentDocTypeFilter[];
    learnedAt: string;
    correlationId: string;
}

export interface ContentFeedbackContext {
    tenantId: string;
    workspaceId: string;
    taskId: string;
    contentId: string;
    documentType: ContentDocTypeFilter;
    actionType: string;
    correlationId: string;
}

export interface ContentFeedbackItem {
    body: string;
    author?: string;
    createdAt?: string;
}

// ---------------------------------------------------------------------------
// Lesson store
// ---------------------------------------------------------------------------

export interface IContentLessonStore {
    save(lesson: ContentLesson): Promise<void>;
    findByWorkspace(
        workspaceId: string,
        filter?: { docType?: ContentDocTypeFilter; category?: ContentLessonCategory; limit?: number },
    ): Promise<ContentLesson[]>;
}

export class InMemoryContentLessonStore implements IContentLessonStore {
    private readonly store = new Map<string, ContentLesson>();

    async save(lesson: ContentLesson): Promise<void> {
        this.store.set(lesson.id, { ...lesson });
    }

    async findByWorkspace(
        workspaceId: string,
        filter?: { docType?: ContentDocTypeFilter; category?: ContentLessonCategory; limit?: number },
    ): Promise<ContentLesson[]> {
        let results = [...this.store.values()].filter((l) => l.workspaceId === workspaceId);
        if (filter?.category) results = results.filter((l) => l.category === filter.category);
        if (filter?.docType && filter.docType !== 'any') {
            results = results.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
        }
        results.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
        return filter?.limit ? results.slice(0, filter.limit) : results;
    }
}

export class GatewayContentLessonStore implements IContentLessonStore {
    constructor(
        private readonly gatewayBaseUrl: string,
        private readonly serviceToken: string,
    ) {}

    async save(lesson: ContentLesson): Promise<void> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try {
            await fetch(`${base}/v1/memory/patterns`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` },
                body: JSON.stringify({
                    tenantId: lesson.tenantId,
                    workspaceId: lesson.workspaceId,
                    pattern: `cw:lesson:${lesson.category}:${lesson.workspaceId}:${lesson.id}`,
                    summary: `[${lesson.category}] ${lesson.feedback.slice(0, 200)}`,
                    confidence: 0.7,
                    observedCount: 1,
                    lastSeen: lesson.learnedAt,
                    metadata: {
                        lessonId: lesson.id,
                        category: lesson.category,
                        docTypes: lesson.applicableDocTypes,
                        feedback: lesson.feedback,
                        sourceTaskId: lesson.sourceTaskId,
                        sourceContentId: lesson.sourceContentId,
                        correlationId: lesson.correlationId,
                        learnedAt: lesson.learnedAt,
                    },
                }),
                signal: AbortSignal.timeout(10_000),
            });
        } catch (err) {
            console.warn(`[GatewayContentLessonStore] save failed: ${String(err)}`);
        }
    }

    async findByWorkspace(
        workspaceId: string,
        filter?: { docType?: ContentDocTypeFilter; category?: ContentLessonCategory; limit?: number },
    ): Promise<ContentLesson[]> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try {
            const res = await fetch(
                `${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`,
                { method: 'GET', headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` }, signal: AbortSignal.timeout(10_000) },
            );
            if (!res.ok) return [];
            const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number; lastSeen?: string; metadata?: Record<string, unknown> }> };
            const patterns = (data.patterns ?? []).filter(
                (p) => typeof p.pattern === 'string' && p.pattern.startsWith('cw:lesson:') && p.pattern.includes(`:${workspaceId}:`),
            );
            let lessons: ContentLesson[] = patterns.map((p): ContentLesson | null => {
                const meta = p.metadata as Record<string, unknown> | undefined;
                if (meta?.lessonId) {
                    return {
                        id: String(meta['lessonId']),
                        tenantId: '',
                        workspaceId,
                        sourceTaskId: String(meta['sourceTaskId'] ?? ''),
                        sourceContentId: String(meta['sourceContentId'] ?? ''),
                        feedback: String(meta['feedback'] ?? p.summary ?? '').replace(/^\[[\w_]+\] /, ''),
                        category: (meta['category'] as ContentLessonCategory) ?? 'clarity',
                        applicableDocTypes: Array.isArray(meta['docTypes']) ? (meta['docTypes'] as ContentDocTypeFilter[]) : ['any'],
                        learnedAt: String(meta['learnedAt'] ?? p.lastSeen ?? new Date().toISOString()),
                        correlationId: String(meta['correlationId'] ?? ''),
                    };
                }
                const keyParts = (p.pattern ?? '').split(':');
                const feedback = (p.summary ?? '').replace(/^\[[\w_]+\] /, '');
                if (!feedback) return null;
                return {
                    id: keyParts[4] ?? Math.random().toString(36).slice(2),
                    tenantId: '',
                    workspaceId,
                    sourceTaskId: '',
                    sourceContentId: '',
                    feedback,
                    category: (keyParts[2] as ContentLessonCategory) ?? 'clarity',
                    applicableDocTypes: ['any'],
                    learnedAt: p.lastSeen ?? new Date().toISOString(),
                    correlationId: '',
                };
            }).filter((l): l is ContentLesson => l !== null);

            if (filter?.category) lessons = lessons.filter((l) => l.category === filter.category);
            if (filter?.docType && filter.docType !== 'any') {
                lessons = lessons.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
            }
            lessons.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
            return filter?.limit ? lessons.slice(0, filter.limit) : lessons;
        } catch (err) {
            console.warn(`[GatewayContentLessonStore] findByWorkspace failed: ${String(err)}`);
            return [];
        }
    }
}

// ---------------------------------------------------------------------------
// Category classifier
// ---------------------------------------------------------------------------

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: ContentLessonCategory; docTypes: ContentDocTypeFilter[] }> = [
    {
        pattern: /\b(brand voice|off.brand|doesn.t sound like us|tone of voice|persona|brand guidelines|style guide violation)\b/i,
        category: 'brand_voice',
        docTypes: ['any'],
    },
    {
        pattern: /\b(SEO|keyword|meta description|title tag|search ranking|organic|thin content|backlink|H1|H2|alt text)\b/i,
        category: 'seo_optimization',
        docTypes: ['blog_post', 'landing_page', 'product_description', 'any'],
    },
    {
        pattern: /\b(wrong|incorrect|outdated|no source|citation|fact.check|inaccurate|misleading|needs verification)\b/i,
        category: 'factual_accuracy',
        docTypes: ['any'],
    },
    {
        pattern: /\b(structure|heading|paragraph|too long|too short|flow|layout|introduction|conclusion|transitions)\b/i,
        category: 'structure',
        docTypes: ['any'],
    },
    {
        pattern: /\b(bounce rate|time on page|engagement|click.through|CTA|call to action|didn.t convert|weak CTA|boring)\b/i,
        category: 'engagement',
        docTypes: ['landing_page', 'email_copy', 'blog_post', 'any'],
    },
    {
        pattern: /\b(too formal|too casual|too salesy|promotional|pushy|stiff|conversational|doesn.t match|wrong register)\b/i,
        category: 'tone',
        docTypes: ['any'],
    },
    {
        pattern: /\b(confusing|unclear|jargon|hard to follow|ambiguous|verbose|too complex|simplify|reader won.t understand)\b/i,
        category: 'clarity',
        docTypes: ['any'],
    },
];

export function classifyContentFeedback(body: string): ContentLessonCategory {
    for (const { pattern, category } of CATEGORY_PATTERNS) {
        if (pattern.test(body)) return category;
    }
    return 'clarity';
}

export function inferContentApplicableDocTypes(
    category: ContentLessonCategory,
    sourceDocType: ContentDocTypeFilter,
): ContentDocTypeFilter[] {
    if (category === 'brand_voice' || category === 'tone' || category === 'clarity') return ['any'];
    if (category === 'seo_optimization') return ['blog_post', 'landing_page', 'product_description'];
    if (category === 'engagement') return ['landing_page', 'email_copy', 'blog_post'];
    if (sourceDocType === 'any') return ['any'];
    return [sourceDocType];
}

// ---------------------------------------------------------------------------
// Core pipeline
// ---------------------------------------------------------------------------

export async function ingestContentFeedback(
    ctx: ContentFeedbackContext,
    feedbackItems: ContentFeedbackItem[],
    store: IContentLessonStore,
): Promise<ContentLesson[]> {
    const lessons: ContentLesson[] = [];
    for (const item of feedbackItems) {
        const body = item.body.trim();
        if (body.length < 10) continue;
        const category = classifyContentFeedback(body);
        const applicableDocTypes = inferContentApplicableDocTypes(category, ctx.documentType);
        const lesson: ContentLesson = {
            id: randomUUID(),
            tenantId: ctx.tenantId,
            workspaceId: ctx.workspaceId,
            sourceTaskId: ctx.taskId,
            sourceContentId: ctx.contentId,
            feedback: body,
            category,
            applicableDocTypes,
            learnedAt: item.createdAt ?? new Date().toISOString(),
            correlationId: ctx.correlationId,
        };
        await store.save(lesson);
        lessons.push(lesson);
    }
    return lessons;
}

export function formatContentLessonsForPrompt(lessons: ContentLesson[]): string {
    if (lessons.length === 0) return '';
    const lines = lessons.slice(0, 12).map((l) => `- [${l.category}] ${l.feedback}`);
    return `Workspace editorial rules (from past editor feedback):\n${lines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// Episodic hooks
// ---------------------------------------------------------------------------

function cwOutcomeTag(result: ProcessedTaskResult): 'success' | 'fail' {
    return result.status === 'success' ? 'success' : 'fail';
}

export function buildContentWriterEpisodicPattern(
    _task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const at = result.decision.actionType;
    const oc = cwOutcomeTag(result);

    if (at === 'workspace_cw_research_topic')    return `cw:research_topic:${oc}`;
    if (at === 'workspace_cw_write_prose')        return `cw:write_prose:${oc}`;
    if (at === 'workspace_cw_seo_optimize')       return `cw:seo_optimize:${oc}`;
    if (at === 'workspace_cw_publish_cms')        return `cw:publish_cms:${oc}`;
    if (at === 'workspace_cw_adapt_tone')         return `cw:adapt_tone:${oc}`;
    if (at === 'workspace_cw_fact_check')         return `cw:fact_check:${oc}`;
    if (at === 'workspace_cw_revision_apply')     return `cw:revision_apply:${oc}`;
    if (at === 'workspace_cw_brand_voice_learn')  return `cw:brand_voice_learn:${oc}`;
    if (at === 'workspace_cw_verify_facts')       return `cw:verify_facts:${oc}`;
    if (at === 'workspace_cw_review_prose')       return `cw:review_prose:${oc}`;
    if (at === 'workspace_cw_detect_plagiarism')  return `cw:detect_plagiarism:${oc}`;
    if (at === 'workspace_cw_localize_content')   return `cw:localize_content:${oc}`;
    if (at === 'workspace_cw_analytics_report')   return `cw:analytics_report:${oc}`;
    if (at === 'workspace_cw_source_images')      return `cw:source_images:${oc}`;
    if (at === 'workspace_cw_schedule_content')   return `cw:schedule_content:${oc}`;

    return `cw:${at}:${oc}`;
}

export function buildContentWriterEpisodicSummary(
    task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const pattern = buildContentWriterEpisodicPattern(task, result);
    const at = result.decision.actionType;
    const oc = cwOutcomeTag(result);

    const title = typeof task.payload['title'] === 'string'
        ? task.payload['title']
        : typeof task.payload['topic'] === 'string'
            ? task.payload['topic']
            : at;
    const taskLabel = title.slice(0, 120);

    if (pattern.startsWith('cw:write_prose'))       return `Prose written ${oc}: ${taskLabel}`;
    if (pattern.startsWith('cw:seo_optimize'))      return `SEO optimisation ${oc}: ${taskLabel}`;
    if (pattern.startsWith('cw:publish_cms'))       return `CMS publish ${oc}: ${taskLabel}`;
    if (pattern.startsWith('cw:revision_apply'))    return `Revision applied ${oc}: ${taskLabel}`;
    if (pattern.startsWith('cw:brand_voice_learn')) return `Brand voice learned ${oc}: ${taskLabel}`;
    if (pattern.startsWith('cw:fact_check'))        return `Fact check ${oc}: ${taskLabel}`;
    if (pattern.startsWith('cw:localize_content'))  return `Content localised ${oc}: ${taskLabel}`;
    if (pattern.startsWith('cw:analytics_report'))  return `Analytics report ${oc}: ${taskLabel}`;

    return `Content writer action "${at}" completed with status "${oc}": ${taskLabel}`;
}
