/**
 * Full-Stack Developer — Lesson Pipeline
 *
 * Captures code review feedback, performance regression findings, accessibility
 * audit results, and security scan outputs and converts them into structured
 * dev lessons stored in long-term memory.
 *
 * Lesson categories:
 *   code_quality     — style, naming, duplication, or readability issues
 *   performance      — component renders too slow, query is unindexed, bundle too large
 *   accessibility    — WCAG violation, missing ARIA, colour contrast failure
 *   api_design       — REST/GraphQL endpoint poorly designed or inconsistent
 *   testing_strategy — test coverage gap, wrong test type, or brittle test
 *   security         — XSS, injection, missing auth, insecure default
 *   architecture     — component boundary wrong, concerns mixed, pattern mismatch
 */

import { randomUUID } from 'node:crypto';
import type { TaskEnvelope, ProcessedTaskResult } from '../../execution-engine.js';

export type FsdLessonCategory = 'code_quality' | 'performance' | 'accessibility' | 'api_design' | 'testing_strategy' | 'security' | 'architecture';
export type FsdDocTypeFilter = 'component' | 'api_endpoint' | 'feature_implementation' | 'architecture_decision' | 'any';

export interface FsdLesson {
    id: string;
    tenantId: string;
    workspaceId: string;
    sourceTaskId: string;
    sourcePrId: string;
    feedback: string;
    category: FsdLessonCategory;
    applicableDocTypes: FsdDocTypeFilter[];
    learnedAt: string;
    correlationId: string;
}

export interface FsdFeedbackContext { tenantId: string; workspaceId: string; taskId: string; prId: string; documentType: FsdDocTypeFilter; actionType: string; correlationId: string; }
export interface FsdFeedbackItem { body: string; author?: string; createdAt?: string; }

export interface IFsdLessonStore {
    save(lesson: FsdLesson): Promise<void>;
    findByWorkspace(workspaceId: string, filter?: { docType?: FsdDocTypeFilter; category?: FsdLessonCategory; limit?: number }): Promise<FsdLesson[]>;
}

export class InMemoryFsdLessonStore implements IFsdLessonStore {
    private readonly store = new Map<string, FsdLesson>();
    async save(lesson: FsdLesson): Promise<void> { this.store.set(lesson.id, { ...lesson }); }
    async findByWorkspace(workspaceId: string, filter?: { docType?: FsdDocTypeFilter; category?: FsdLessonCategory; limit?: number }): Promise<FsdLesson[]> {
        let results = [...this.store.values()].filter((l) => l.workspaceId === workspaceId);
        if (filter?.category) results = results.filter((l) => l.category === filter.category);
        if (filter?.docType && filter.docType !== 'any') results = results.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
        results.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
        return filter?.limit ? results.slice(0, filter.limit) : results;
    }
}

export class GatewayFsdLessonStore implements IFsdLessonStore {
    constructor(private readonly gatewayBaseUrl: string, private readonly serviceToken: string) {}
    async save(lesson: FsdLesson): Promise<void> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try { await fetch(`${base}/v1/memory/patterns`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` }, body: JSON.stringify({ tenantId: lesson.tenantId, workspaceId: lesson.workspaceId, pattern: `fsd:lesson:${lesson.category}:${lesson.workspaceId}:${lesson.id}`, summary: `[${lesson.category}] ${lesson.feedback.slice(0, 200)}`, confidence: 0.7, observedCount: 1, lastSeen: lesson.learnedAt, metadata: { lessonId: lesson.id, category: lesson.category, docTypes: lesson.applicableDocTypes, feedback: lesson.feedback, sourceTaskId: lesson.sourceTaskId, sourcePrId: lesson.sourcePrId, correlationId: lesson.correlationId, learnedAt: lesson.learnedAt } }), signal: AbortSignal.timeout(10_000) }); } catch (err) { console.warn(`[GatewayFsdLessonStore] save failed: ${String(err)}`); }
    }
    async findByWorkspace(workspaceId: string, filter?: { docType?: FsdDocTypeFilter; category?: FsdLessonCategory; limit?: number }): Promise<FsdLesson[]> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try {
            const res = await fetch(`${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`, { method: 'GET', headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` }, signal: AbortSignal.timeout(10_000) });
            if (!res.ok) return [];
            const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number; lastSeen?: string; metadata?: Record<string, unknown> }> };
            let lessons: FsdLesson[] = (data.patterns ?? []).filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith('fsd:lesson:') && p.pattern.includes(`:${workspaceId}:`)).map((p): FsdLesson | null => {
                const meta = p.metadata as Record<string, unknown> | undefined;
                const feedback = String(meta?.['feedback'] ?? p.summary ?? '').replace(/^\[[\w_]+\] /, '');
                if (!feedback) return null;
                const keyParts = (p.pattern ?? '').split(':');
                return { id: String(meta?.['lessonId'] ?? keyParts[4] ?? Math.random().toString(36).slice(2)), tenantId: '', workspaceId, sourceTaskId: String(meta?.['sourceTaskId'] ?? ''), sourcePrId: String(meta?.['sourcePrId'] ?? ''), feedback, category: (meta?.['category'] ?? keyParts[2] ?? 'code_quality') as FsdLessonCategory, applicableDocTypes: Array.isArray(meta?.['docTypes']) ? (meta['docTypes'] as FsdDocTypeFilter[]) : ['any'], learnedAt: String(meta?.['learnedAt'] ?? p.lastSeen ?? new Date().toISOString()), correlationId: String(meta?.['correlationId'] ?? '') };
            }).filter((l): l is FsdLesson => l !== null);
            if (filter?.category) lessons = lessons.filter((l) => l.category === filter.category);
            if (filter?.docType && filter.docType !== 'any') lessons = lessons.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
            lessons.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
            return filter?.limit ? lessons.slice(0, filter.limit) : lessons;
        } catch (err) { console.warn(`[GatewayFsdLessonStore] findByWorkspace failed: ${String(err)}`); return []; }
    }
}

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: FsdLessonCategory }> = [
    { pattern: /\b(naming|readability|duplication|DRY|magic number|comment|function too long|complex|linting|code smell)\b/i, category: 'code_quality' },
    { pattern: /\b(slow|performance|N\+1|unindexed|bundle size|render|lazy load|cache|timeout|memory leak|LCP|CLS|FID)\b/i, category: 'performance' },
    { pattern: /\b(accessibility|WCAG|ARIA|alt text|colour contrast|keyboard navigation|screen reader|focus|a11y|tab order)\b/i, category: 'accessibility' },
    { pattern: /\b(REST|GraphQL|endpoint|API|HTTP method|status code|versioning|response shape|idempotent|pagination|rate limit)\b/i, category: 'api_design' },
    { pattern: /\b(test|coverage|unit|integration|e2e|brittle|mock|fixture|no test|untested|snapshot|flaky)\b/i, category: 'testing_strategy' },
    { pattern: /\b(XSS|injection|CSRF|auth|authorization|sanitize|escape|exposed|secret|token|vulnerability|OWASP)\b/i, category: 'security' },
    { pattern: /\b(architecture|pattern|boundary|separation of concerns|coupling|abstraction|layer|design|ADR|structure)\b/i, category: 'architecture' },
];

export function classifyFsdFeedback(body: string): FsdLessonCategory {
    for (const { pattern, category } of CATEGORY_PATTERNS) { if (pattern.test(body)) return category; }
    return 'code_quality';
}

export async function ingestFsdFeedback(ctx: FsdFeedbackContext, feedbackItems: FsdFeedbackItem[], store: IFsdLessonStore): Promise<FsdLesson[]> {
    const lessons: FsdLesson[] = [];
    for (const item of feedbackItems) {
        const body = item.body.trim();
        if (body.length < 10) continue;
        const category = classifyFsdFeedback(body);
        const lesson: FsdLesson = { id: randomUUID(), tenantId: ctx.tenantId, workspaceId: ctx.workspaceId, sourceTaskId: ctx.taskId, sourcePrId: ctx.prId, feedback: body, category, applicableDocTypes: ['any'], learnedAt: item.createdAt ?? new Date().toISOString(), correlationId: ctx.correlationId };
        await store.save(lesson);
        lessons.push(lesson);
    }
    return lessons;
}

export function formatFsdLessonsForPrompt(lessons: FsdLesson[]): string {
    if (lessons.length === 0) return '';
    return `Workspace dev rules (from past code review feedback):\n${lessons.slice(0, 12).map((l) => `- [${l.category}] ${l.feedback}`).join('\n')}`;
}

function fsdOutcomeTag(result: ProcessedTaskResult): 'success' | 'fail' { return result.status === 'success' ? 'success' : 'fail'; }

export function buildFsdEpisodicPattern(_task: TaskEnvelope, result: ProcessedTaskResult): string {
    const at = result.decision.actionType;
    const oc = fsdOutcomeTag(result);
    const prefix = at.startsWith('workspace_fsd_') ? at.replace('workspace_fsd_', 'fsd:') : `fsd:${at}`;
    return `${prefix}:${oc}`;
}

export function buildFsdEpisodicSummary(task: TaskEnvelope, result: ProcessedTaskResult): string {
    const at = result.decision.actionType;
    const oc = fsdOutcomeTag(result);
    const title = (typeof task.payload['featureTitle'] === 'string' ? task.payload['featureTitle'] : typeof task.payload['title'] === 'string' ? task.payload['title'] : at).slice(0, 120);
    if (at.includes('component')) return `Component built ${oc}: ${title}`;
    if (at.includes('api')) return `API endpoint built ${oc}: ${title}`;
    if (at.includes('design')) return `Design implementation ${oc}: ${title}`;
    if (at.includes('performance')) return `Performance audit ${oc}: ${title}`;
    if (at.includes('accessibility')) return `Accessibility audit ${oc}: ${title}`;
    return `FSD action "${at}" completed with status "${oc}": ${title}`;
}
