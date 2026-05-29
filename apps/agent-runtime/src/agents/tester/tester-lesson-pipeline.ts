/**
 * Tester — Lesson Pipeline
 *
 * Captures missed bugs, false positives, coverage gaps, and flaky test reports
 * and converts them into structured testing lessons stored in long-term memory.
 *
 * Lesson categories:
 *   coverage_gaps       — a code path or scenario was not tested
 *   bug_reproduction    — bug report lacked steps, environment, or was wrong
 *   edge_cases          — edge case (boundary, null, concurrent) was missed
 *   environment_setup   — test environment was wrong or not reproducible
 *   test_quality        — test was brittle, flaky, too coupled, or misleading
 *   regression_detection — a regression slipped through an existing test suite
 *   reporting           — bug report was unclear, improperly prioritised, or missing info
 */

import { randomUUID } from 'node:crypto';
import type { TaskEnvelope, ProcessedTaskResult } from '../../execution-engine.js';

export type TesterLessonCategory = 'coverage_gaps' | 'bug_reproduction' | 'edge_cases' | 'environment_setup' | 'test_quality' | 'regression_detection' | 'reporting';
export type TesterDocTypeFilter = 'test_plan' | 'test_cases' | 'bug_report' | 'regression_suite' | 'security_report' | 'any';

export interface TesterLesson { id: string; tenantId: string; workspaceId: string; sourceTaskId: string; feedback: string; category: TesterLessonCategory; applicableDocTypes: TesterDocTypeFilter[]; learnedAt: string; correlationId: string; }
export interface TesterFeedbackContext { tenantId: string; workspaceId: string; taskId: string; documentType: TesterDocTypeFilter; actionType: string; correlationId: string; }
export interface TesterFeedbackItem { body: string; author?: string; createdAt?: string; }

export interface ITesterLessonStore { save(lesson: TesterLesson): Promise<void>; findByWorkspace(workspaceId: string, filter?: { docType?: TesterDocTypeFilter; category?: TesterLessonCategory; limit?: number }): Promise<TesterLesson[]>; }

export class InMemoryTesterLessonStore implements ITesterLessonStore {
    private readonly store = new Map<string, TesterLesson>();
    async save(lesson: TesterLesson): Promise<void> { this.store.set(lesson.id, { ...lesson }); }
    async findByWorkspace(workspaceId: string, filter?: { docType?: TesterDocTypeFilter; category?: TesterLessonCategory; limit?: number }): Promise<TesterLesson[]> {
        let results = [...this.store.values()].filter((l) => l.workspaceId === workspaceId);
        if (filter?.category) results = results.filter((l) => l.category === filter.category);
        if (filter?.docType && filter.docType !== 'any') results = results.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
        results.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
        return filter?.limit ? results.slice(0, filter.limit) : results;
    }
}

export class GatewayTesterLessonStore implements ITesterLessonStore {
    constructor(private readonly gatewayBaseUrl: string, private readonly serviceToken: string) {}
    async save(lesson: TesterLesson): Promise<void> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try { await fetch(`${base}/v1/memory/patterns`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` }, body: JSON.stringify({ tenantId: lesson.tenantId, workspaceId: lesson.workspaceId, pattern: `tester:lesson:${lesson.category}:${lesson.workspaceId}:${lesson.id}`, summary: `[${lesson.category}] ${lesson.feedback.slice(0, 200)}`, confidence: 0.7, observedCount: 1, lastSeen: lesson.learnedAt, metadata: { lessonId: lesson.id, category: lesson.category, docTypes: lesson.applicableDocTypes, feedback: lesson.feedback, sourceTaskId: lesson.sourceTaskId, correlationId: lesson.correlationId, learnedAt: lesson.learnedAt } }), signal: AbortSignal.timeout(10_000) }); } catch (err) { console.warn(`[GatewayTesterLessonStore] save failed: ${String(err)}`); }
    }
    async findByWorkspace(workspaceId: string, filter?: { docType?: TesterDocTypeFilter; category?: TesterLessonCategory; limit?: number }): Promise<TesterLesson[]> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try {
            const res = await fetch(`${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`, { method: 'GET', headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` }, signal: AbortSignal.timeout(10_000) });
            if (!res.ok) return [];
            const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number; lastSeen?: string; metadata?: Record<string, unknown> }> };
            let lessons: TesterLesson[] = (data.patterns ?? []).filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith('tester:lesson:') && p.pattern.includes(`:${workspaceId}:`)).map((p): TesterLesson | null => {
                const meta = p.metadata as Record<string, unknown> | undefined;
                const feedback = String(meta?.['feedback'] ?? p.summary ?? '').replace(/^\[[\w_]+\] /, '');
                if (!feedback) return null;
                const keyParts = (p.pattern ?? '').split(':');
                return { id: String(meta?.['lessonId'] ?? keyParts[4] ?? Math.random().toString(36).slice(2)), tenantId: '', workspaceId, sourceTaskId: String(meta?.['sourceTaskId'] ?? ''), feedback, category: (meta?.['category'] ?? keyParts[2] ?? 'coverage_gaps') as TesterLessonCategory, applicableDocTypes: Array.isArray(meta?.['docTypes']) ? (meta['docTypes'] as TesterDocTypeFilter[]) : ['any'], learnedAt: String(meta?.['learnedAt'] ?? p.lastSeen ?? new Date().toISOString()), correlationId: String(meta?.['correlationId'] ?? '') };
            }).filter((l): l is TesterLesson => l !== null);
            if (filter?.category) lessons = lessons.filter((l) => l.category === filter.category);
            if (filter?.docType && filter.docType !== 'any') lessons = lessons.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
            lessons.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
            return filter?.limit ? lessons.slice(0, filter.limit) : lessons;
        } catch (err) { console.warn(`[GatewayTesterLessonStore] findByWorkspace failed: ${String(err)}`); return []; }
    }
}

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: TesterLessonCategory }> = [
    { pattern: /\b(not tested|coverage|untested|missed code path|no test for|missing scenario|coverage gap)\b/i, category: 'coverage_gaps' },
    { pattern: /\b(can.t reproduce|unclear steps|wrong environment|missing repro|steps to reproduce|reproduction|can reproduce)\b/i, category: 'bug_reproduction' },
    { pattern: /\b(edge case|boundary|null|empty|zero|max|min|concurrent|race condition|overflow|off.by.one)\b/i, category: 'edge_cases' },
    { pattern: /\b(environment|staging|local|prod|docker|database|seed|config|wrong env|different environment|not reproducible)\b/i, category: 'environment_setup' },
    { pattern: /\b(flaky|brittle|false positive|false negative|too coupled|tightly coupled|fragile|unreliable|non.deterministic)\b/i, category: 'test_quality' },
    { pattern: /\b(regression|broke|slipped through|missed regression|existing test|should have caught|test suite missed)\b/i, category: 'regression_detection' },
    { pattern: /\b(unclear report|wrong priority|Severity|P1|P2|missing info|bad bug report|no screenshot|no log|incomplete)\b/i, category: 'reporting' },
];

export function classifyTesterFeedback(body: string): TesterLessonCategory {
    for (const { pattern, category } of CATEGORY_PATTERNS) { if (pattern.test(body)) return category; }
    return 'coverage_gaps';
}

export async function ingestTesterFeedback(ctx: TesterFeedbackContext, feedbackItems: TesterFeedbackItem[], store: ITesterLessonStore): Promise<TesterLesson[]> {
    const lessons: TesterLesson[] = [];
    for (const item of feedbackItems) {
        const body = item.body.trim();
        if (body.length < 10) continue;
        const category = classifyTesterFeedback(body);
        const lesson: TesterLesson = { id: randomUUID(), tenantId: ctx.tenantId, workspaceId: ctx.workspaceId, sourceTaskId: ctx.taskId, feedback: body, category, applicableDocTypes: ['any'], learnedAt: item.createdAt ?? new Date().toISOString(), correlationId: ctx.correlationId };
        await store.save(lesson);
        lessons.push(lesson);
    }
    return lessons;
}

export function formatTesterLessonsForPrompt(lessons: TesterLesson[]): string {
    if (lessons.length === 0) return '';
    return `Workspace testing rules (from past coverage failures and bug escapes):\n${lessons.slice(0, 12).map((l) => `- [${l.category}] ${l.feedback}`).join('\n')}`;
}

function testerOutcomeTag(result: ProcessedTaskResult): 'success' | 'fail' { return result.status === 'success' ? 'success' : 'fail'; }

export function buildTesterEpisodicPattern(_task: TaskEnvelope, result: ProcessedTaskResult): string {
    const at = result.decision.actionType;
    const oc = testerOutcomeTag(result);
    const prefix = at.startsWith('workspace_tester_') ? at.replace('workspace_tester_', 'tester:') : `tester:${at}`;
    return `${prefix}:${oc}`;
}

export function buildTesterEpisodicSummary(task: TaskEnvelope, result: ProcessedTaskResult): string {
    const at = result.decision.actionType;
    const oc = testerOutcomeTag(result);
    const title = (typeof task.payload['featureOrComponent'] === 'string' ? task.payload['featureOrComponent'] : typeof task.payload['title'] === 'string' ? task.payload['title'] : at).slice(0, 120);
    if (at.includes('test_case') || at.includes('explore')) return `Test cases generated ${oc}: ${title}`;
    if (at.includes('bug') || at.includes('report')) return `Bug report filed ${oc}: ${title}`;
    if (at.includes('security')) return `Security test ${oc}: ${title}`;
    if (at.includes('regression')) return `Regression suite ${oc}: ${title}`;
    return `Tester action "${at}" completed with status "${oc}": ${title}`;
}
