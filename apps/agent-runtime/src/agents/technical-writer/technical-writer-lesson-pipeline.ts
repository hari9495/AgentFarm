/**
 * Technical Writer — Lesson Pipeline
 *
 * Captures SME review feedback, style audit results, and user confusion reports
 * and converts them into structured doc lessons stored in long-term memory.
 *
 * Lesson categories:
 *   completeness    — a required section, step, or parameter was missing
 *   accuracy        — the content contained a technical error or outdated info
 *   structure       — section hierarchy, ordering, or navigation was confusing
 *   style_compliance — deviated from the style guide (voice, formatting, naming)
 *   audience_fit    — content was too technical or too basic for the target reader
 *   code_examples   — code samples were missing, wrong, or not runnable
 *   versioning      — doc was not versioned correctly or missed a breaking change
 */

import { randomUUID } from 'node:crypto';
import type { TaskEnvelope, ProcessedTaskResult } from '../../execution-engine.js';

export type TwLessonCategory =
    | 'completeness'
    | 'accuracy'
    | 'structure'
    | 'style_compliance'
    | 'audience_fit'
    | 'code_examples'
    | 'versioning';

export type TwDocTypeFilter =
    | 'api_reference'
    | 'tutorial'
    | 'how_to_guide'
    | 'release_notes'
    | 'manual'
    | 'faq'
    | 'any';

export interface TwLesson {
    id: string;
    tenantId: string;
    workspaceId: string;
    sourceTaskId: string;
    sourceDocId: string;
    feedback: string;
    category: TwLessonCategory;
    applicableDocTypes: TwDocTypeFilter[];
    learnedAt: string;
    correlationId: string;
}

export interface TwFeedbackContext {
    tenantId: string;
    workspaceId: string;
    taskId: string;
    docId: string;
    documentType: TwDocTypeFilter;
    actionType: string;
    correlationId: string;
}

export interface TwFeedbackItem {
    body: string;
    author?: string;
    createdAt?: string;
}

// ---------------------------------------------------------------------------
// Lesson store
// ---------------------------------------------------------------------------

export interface ITwLessonStore {
    save(lesson: TwLesson): Promise<void>;
    findByWorkspace(
        workspaceId: string,
        filter?: { docType?: TwDocTypeFilter; category?: TwLessonCategory; limit?: number },
    ): Promise<TwLesson[]>;
}

export class InMemoryTwLessonStore implements ITwLessonStore {
    private readonly store = new Map<string, TwLesson>();

    async save(lesson: TwLesson): Promise<void> {
        this.store.set(lesson.id, { ...lesson });
    }

    async findByWorkspace(
        workspaceId: string,
        filter?: { docType?: TwDocTypeFilter; category?: TwLessonCategory; limit?: number },
    ): Promise<TwLesson[]> {
        let results = [...this.store.values()].filter((l) => l.workspaceId === workspaceId);
        if (filter?.category) results = results.filter((l) => l.category === filter.category);
        if (filter?.docType && filter.docType !== 'any') {
            results = results.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
        }
        results.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
        return filter?.limit ? results.slice(0, filter.limit) : results;
    }
}

export class GatewayTwLessonStore implements ITwLessonStore {
    constructor(private readonly gatewayBaseUrl: string, private readonly serviceToken: string) {}

    async save(lesson: TwLesson): Promise<void> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try {
            await fetch(`${base}/v1/memory/patterns`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` },
                body: JSON.stringify({
                    tenantId: lesson.tenantId,
                    workspaceId: lesson.workspaceId,
                    pattern: `tw:lesson:${lesson.category}:${lesson.workspaceId}:${lesson.id}`,
                    summary: `[${lesson.category}] ${lesson.feedback.slice(0, 200)}`,
                    confidence: 0.7,
                    observedCount: 1,
                    lastSeen: lesson.learnedAt,
                    metadata: { lessonId: lesson.id, category: lesson.category, docTypes: lesson.applicableDocTypes, feedback: lesson.feedback, sourceTaskId: lesson.sourceTaskId, sourceDocId: lesson.sourceDocId, correlationId: lesson.correlationId, learnedAt: lesson.learnedAt },
                }),
                signal: AbortSignal.timeout(10_000),
            });
        } catch (err) {
            console.warn(`[GatewayTwLessonStore] save failed: ${String(err)}`);
        }
    }

    async findByWorkspace(
        workspaceId: string,
        filter?: { docType?: TwDocTypeFilter; category?: TwLessonCategory; limit?: number },
    ): Promise<TwLesson[]> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try {
            const res = await fetch(
                `${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`,
                { method: 'GET', headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` }, signal: AbortSignal.timeout(10_000) },
            );
            if (!res.ok) return [];
            const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number; lastSeen?: string; metadata?: Record<string, unknown> }> };
            let lessons: TwLesson[] = (data.patterns ?? [])
                .filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith('tw:lesson:') && p.pattern.includes(`:${workspaceId}:`))
                .map((p): TwLesson | null => {
                    const meta = p.metadata as Record<string, unknown> | undefined;
                    const feedback = String(meta?.['feedback'] ?? p.summary ?? '').replace(/^\[[\w_]+\] /, '');
                    if (!feedback) return null;
                    const keyParts = (p.pattern ?? '').split(':');
                    return {
                        id: String(meta?.['lessonId'] ?? keyParts[4] ?? Math.random().toString(36).slice(2)),
                        tenantId: '',
                        workspaceId,
                        sourceTaskId: String(meta?.['sourceTaskId'] ?? ''),
                        sourceDocId: String(meta?.['sourceDocId'] ?? ''),
                        feedback,
                        category: (meta?.['category'] ?? keyParts[2] ?? 'completeness') as TwLessonCategory,
                        applicableDocTypes: Array.isArray(meta?.['docTypes']) ? (meta['docTypes'] as TwDocTypeFilter[]) : ['any'],
                        learnedAt: String(meta?.['learnedAt'] ?? p.lastSeen ?? new Date().toISOString()),
                        correlationId: String(meta?.['correlationId'] ?? ''),
                    };
                }).filter((l): l is TwLesson => l !== null);

            if (filter?.category) lessons = lessons.filter((l) => l.category === filter.category);
            if (filter?.docType && filter.docType !== 'any') lessons = lessons.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
            lessons.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
            return filter?.limit ? lessons.slice(0, filter.limit) : lessons;
        } catch (err) {
            console.warn(`[GatewayTwLessonStore] findByWorkspace failed: ${String(err)}`);
            return [];
        }
    }
}

// ---------------------------------------------------------------------------
// Category classifier
// ---------------------------------------------------------------------------

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: TwLessonCategory; docTypes: TwDocTypeFilter[] }> = [
    { pattern: /\b(missing|not included|omitted|no section|lacks?|forgot|incomplete|didn.t cover)\b/i, category: 'completeness', docTypes: ['any'] },
    { pattern: /\b(wrong|incorrect|outdated|deprecated|stale|inaccurate|wrong version|doesn.t work|error in code)\b/i, category: 'accuracy', docTypes: ['any'] },
    { pattern: /\b(structure|heading|navigation|hard to find|confusing layout|section order|too long|needs reorganiz)\b/i, category: 'structure', docTypes: ['any'] },
    { pattern: /\b(style guide|formatting|naming convention|capitalization|voice|tone|passive voice|off.brand|jargon|Oxford comma)\b/i, category: 'style_compliance', docTypes: ['any'] },
    { pattern: /\b(too technical|too basic|not for our audience|assumed knowledge|over.explained|simplified|wrong level)\b/i, category: 'audience_fit', docTypes: ['any'] },
    { pattern: /\b(code example|sample|snippet|runnable|copy.paste|doesn.t run|no example|more examples|broken code)\b/i, category: 'code_examples', docTypes: ['api_reference', 'tutorial', 'how_to_guide', 'any'] },
    { pattern: /\b(version|breaking change|changelog|migration|v\d|release|upgrade|deprecated|backwards compat)\b/i, category: 'versioning', docTypes: ['release_notes', 'api_reference', 'any'] },
];

export function classifyTwFeedback(body: string): TwLessonCategory {
    for (const { pattern, category } of CATEGORY_PATTERNS) {
        if (pattern.test(body)) return category;
    }
    return 'completeness';
}

export function inferTwApplicableDocTypes(category: TwLessonCategory, sourceDocType: TwDocTypeFilter): TwDocTypeFilter[] {
    if (category === 'style_compliance' || category === 'audience_fit') return ['any'];
    if (category === 'code_examples') return ['api_reference', 'tutorial', 'how_to_guide'];
    if (category === 'versioning') return ['release_notes', 'api_reference'];
    if (sourceDocType === 'any') return ['any'];
    return [sourceDocType];
}

// ---------------------------------------------------------------------------
// Core pipeline
// ---------------------------------------------------------------------------

export async function ingestTwFeedback(
    ctx: TwFeedbackContext,
    feedbackItems: TwFeedbackItem[],
    store: ITwLessonStore,
): Promise<TwLesson[]> {
    const lessons: TwLesson[] = [];
    for (const item of feedbackItems) {
        const body = item.body.trim();
        if (body.length < 10) continue;
        const category = classifyTwFeedback(body);
        const lesson: TwLesson = {
            id: randomUUID(),
            tenantId: ctx.tenantId,
            workspaceId: ctx.workspaceId,
            sourceTaskId: ctx.taskId,
            sourceDocId: ctx.docId,
            feedback: body,
            category,
            applicableDocTypes: inferTwApplicableDocTypes(category, ctx.documentType),
            learnedAt: item.createdAt ?? new Date().toISOString(),
            correlationId: ctx.correlationId,
        };
        await store.save(lesson);
        lessons.push(lesson);
    }
    return lessons;
}

export function formatTwLessonsForPrompt(lessons: TwLesson[]): string {
    if (lessons.length === 0) return '';
    const lines = lessons.slice(0, 12).map((l) => `- [${l.category}] ${l.feedback}`);
    return `Workspace documentation rules (from past SME review feedback):\n${lines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// Episodic hooks
// ---------------------------------------------------------------------------

function twOutcomeTag(result: ProcessedTaskResult): 'success' | 'fail' {
    return result.status === 'success' ? 'success' : 'fail';
}

export function buildTwEpisodicPattern(_task: TaskEnvelope, result: ProcessedTaskResult): string {
    const at = result.decision.actionType;
    const oc = twOutcomeTag(result);
    if (at === 'workspace_tw_doc_diff')        return `tw:doc_diff:${oc}`;
    if (at === 'workspace_tw_api_doc_openapi') return `tw:api_doc_openapi:${oc}`;
    if (at === 'workspace_tw_api_doc_code')    return `tw:api_doc_code:${oc}`;
    if (at === 'workspace_tw_release_notes')   return `tw:release_notes:${oc}`;
    if (at === 'workspace_tw_style_check')     return `tw:style_check:${oc}`;
    if (at === 'workspace_tw_standup_report')  return `tw:standup_report:${oc}`;
    return `tw:${at}:${oc}`;
}

export function buildTwEpisodicSummary(task: TaskEnvelope, result: ProcessedTaskResult): string {
    const pattern = buildTwEpisodicPattern(task, result);
    const at = result.decision.actionType;
    const oc = twOutcomeTag(result);
    const title = (typeof task.payload['title'] === 'string' ? task.payload['title'] : at).slice(0, 120);
    if (pattern.startsWith('tw:api_doc_openapi')) return `OpenAPI docs generated ${oc}: ${title}`;
    if (pattern.startsWith('tw:api_doc_code'))    return `Code-based API docs generated ${oc}: ${title}`;
    if (pattern.startsWith('tw:release_notes'))   return `Release notes generated ${oc}: ${title}`;
    if (pattern.startsWith('tw:style_check'))     return `Style check ${oc}: ${title}`;
    if (pattern.startsWith('tw:doc_diff'))        return `Doc diff update ${oc}: ${title}`;
    return `Technical writer action "${at}" completed with status "${oc}": ${title}`;
}
