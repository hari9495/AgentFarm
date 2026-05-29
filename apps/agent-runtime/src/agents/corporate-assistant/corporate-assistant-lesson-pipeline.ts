/**
 * Corporate Assistant — Lesson Pipeline
 *
 * Captures communication failures, misdirected emails, and escalation mistakes
 * and converts them into structured lessons stored in long-term memory.
 *
 * Lesson categories:
 *   tone                 — email was too informal, aggressive, or condescending
 *   completeness         — a key piece of information was missing
 *   urgency_detection    — urgency was misjudged (treated routine item as critical or vice versa)
 *   stakeholder_awareness — sent to wrong person or CC'd inappropriately
 *   formatting           — formatting was wrong for the audience or channel
 *   confidentiality      — sensitive info was shared with wrong audience
 *   escalation_timing    — should have escalated sooner or differently
 */

import { randomUUID } from 'node:crypto';
import type { TaskEnvelope, ProcessedTaskResult } from '../../execution-engine.js';

export type CorporateLessonCategory = 'tone' | 'completeness' | 'urgency_detection' | 'stakeholder_awareness' | 'formatting' | 'confidentiality' | 'escalation_timing';
export type CorporateDocTypeFilter = 'email' | 'memo' | 'escalation_brief' | 'meeting_summary' | 'any';

export interface CorporateLesson { id: string; tenantId: string; workspaceId: string; sourceTaskId: string; feedback: string; category: CorporateLessonCategory; applicableDocTypes: CorporateDocTypeFilter[]; learnedAt: string; correlationId: string; }
export interface CorporateFeedbackContext { tenantId: string; workspaceId: string; taskId: string; documentType: CorporateDocTypeFilter; actionType: string; correlationId: string; }
export interface CorporateFeedbackItem { body: string; author?: string; createdAt?: string; }

export interface ICorporateLessonStore {
    save(lesson: CorporateLesson): Promise<void>;
    findByWorkspace(workspaceId: string, filter?: { docType?: CorporateDocTypeFilter; category?: CorporateLessonCategory; limit?: number }): Promise<CorporateLesson[]>;
}

export class InMemoryCorporateLessonStore implements ICorporateLessonStore {
    private readonly store = new Map<string, CorporateLesson>();
    async save(lesson: CorporateLesson): Promise<void> { this.store.set(lesson.id, { ...lesson }); }
    async findByWorkspace(workspaceId: string, filter?: { docType?: CorporateDocTypeFilter; category?: CorporateLessonCategory; limit?: number }): Promise<CorporateLesson[]> {
        let results = [...this.store.values()].filter((l) => l.workspaceId === workspaceId);
        if (filter?.category) results = results.filter((l) => l.category === filter.category);
        if (filter?.docType && filter.docType !== 'any') results = results.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
        results.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
        return filter?.limit ? results.slice(0, filter.limit) : results;
    }
}

export class GatewayCorporateLessonStore implements ICorporateLessonStore {
    constructor(private readonly gatewayBaseUrl: string, private readonly serviceToken: string) {}
    async save(lesson: CorporateLesson): Promise<void> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try { await fetch(`${base}/v1/memory/patterns`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` }, body: JSON.stringify({ tenantId: lesson.tenantId, workspaceId: lesson.workspaceId, pattern: `ca:lesson:${lesson.category}:${lesson.workspaceId}:${lesson.id}`, summary: `[${lesson.category}] ${lesson.feedback.slice(0, 200)}`, confidence: 0.7, observedCount: 1, lastSeen: lesson.learnedAt, metadata: { lessonId: lesson.id, category: lesson.category, docTypes: lesson.applicableDocTypes, feedback: lesson.feedback, sourceTaskId: lesson.sourceTaskId, correlationId: lesson.correlationId, learnedAt: lesson.learnedAt } }), signal: AbortSignal.timeout(10_000) }); } catch (err) { console.warn(`[GatewayCorporateLessonStore] save failed: ${String(err)}`); }
    }
    async findByWorkspace(workspaceId: string, filter?: { docType?: CorporateDocTypeFilter; category?: CorporateLessonCategory; limit?: number }): Promise<CorporateLesson[]> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try {
            const res = await fetch(`${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`, { method: 'GET', headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` }, signal: AbortSignal.timeout(10_000) });
            if (!res.ok) return [];
            const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number; lastSeen?: string; metadata?: Record<string, unknown> }> };
            let lessons: CorporateLesson[] = (data.patterns ?? []).filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith('ca:lesson:') && p.pattern.includes(`:${workspaceId}:`)).map((p): CorporateLesson | null => {
                const meta = p.metadata as Record<string, unknown> | undefined;
                const feedback = String(meta?.['feedback'] ?? p.summary ?? '').replace(/^\[[\w_]+\] /, '');
                if (!feedback) return null;
                const keyParts = (p.pattern ?? '').split(':');
                return { id: String(meta?.['lessonId'] ?? keyParts[4] ?? Math.random().toString(36).slice(2)), tenantId: '', workspaceId, sourceTaskId: String(meta?.['sourceTaskId'] ?? ''), feedback, category: (meta?.['category'] ?? keyParts[2] ?? 'tone') as CorporateLessonCategory, applicableDocTypes: Array.isArray(meta?.['docTypes']) ? (meta['docTypes'] as CorporateDocTypeFilter[]) : ['any'], learnedAt: String(meta?.['learnedAt'] ?? p.lastSeen ?? new Date().toISOString()), correlationId: String(meta?.['correlationId'] ?? '') };
            }).filter((l): l is CorporateLesson => l !== null);
            if (filter?.category) lessons = lessons.filter((l) => l.category === filter.category);
            if (filter?.docType && filter.docType !== 'any') lessons = lessons.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
            lessons.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
            return filter?.limit ? lessons.slice(0, filter.limit) : lessons;
        } catch (err) { console.warn(`[GatewayCorporateLessonStore] findByWorkspace failed: ${String(err)}`); return []; }
    }
}

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: CorporateLessonCategory }> = [
    { pattern: /\b(tone|too informal|too aggressive|condescending|unprofessional|rude|passive.aggressive|abrupt|cold|warm)\b/i, category: 'tone' },
    { pattern: /\b(missing|not included|forgot|incomplete|left out|no mention|didn.t include|omitted)\b/i, category: 'completeness' },
    { pattern: /\b(urgency|not urgent|treated as urgent|priority|P0|P1|missed deadline|false alarm|wrong priority)\b/i, category: 'urgency_detection' },
    { pattern: /\b(wrong person|CC|BCC|reply.all|misdirected|sent to wrong|should have included|excluded|audience)\b/i, category: 'stakeholder_awareness' },
    { pattern: /\b(format|layout|bullet|table|attachment|subject line|signature|structure|heading|template)\b/i, category: 'formatting' },
    { pattern: /\b(confidential|sensitive|NDA|GDPR|private|shared with wrong|data breach|not for external|classified)\b/i, category: 'confidentiality' },
    { pattern: /\b(escalate|should have escalated|too late|didn.t route|manager|chain of command|bypass|missed escalation)\b/i, category: 'escalation_timing' },
];

export function classifyCorporateFeedback(body: string): CorporateLessonCategory {
    for (const { pattern, category } of CATEGORY_PATTERNS) { if (pattern.test(body)) return category; }
    return 'tone';
}

export async function ingestCorporateFeedback(ctx: CorporateFeedbackContext, feedbackItems: CorporateFeedbackItem[], store: ICorporateLessonStore): Promise<CorporateLesson[]> {
    const lessons: CorporateLesson[] = [];
    for (const item of feedbackItems) {
        const body = item.body.trim();
        if (body.length < 10) continue;
        const category = classifyCorporateFeedback(body);
        const lesson: CorporateLesson = { id: randomUUID(), tenantId: ctx.tenantId, workspaceId: ctx.workspaceId, sourceTaskId: ctx.taskId, feedback: body, category, applicableDocTypes: ['any'], learnedAt: item.createdAt ?? new Date().toISOString(), correlationId: ctx.correlationId };
        await store.save(lesson);
        lessons.push(lesson);
    }
    return lessons;
}

export function formatCorporateLessonsForPrompt(lessons: CorporateLesson[]): string {
    if (lessons.length === 0) return '';
    return `Workspace communication rules (from past feedback):\n${lessons.slice(0, 12).map((l) => `- [${l.category}] ${l.feedback}`).join('\n')}`;
}

function caOutcomeTag(result: ProcessedTaskResult): 'success' | 'fail' { return result.status === 'success' ? 'success' : 'fail'; }

export function buildCorporateEpisodicPattern(_task: TaskEnvelope, result: ProcessedTaskResult): string {
    const at = result.decision.actionType;
    const oc = caOutcomeTag(result);
    const prefix = at.startsWith('workspace_ca_') ? at.replace('workspace_ca_', 'ca:') : `ca:${at}`;
    return `${prefix}:${oc}`;
}

export function buildCorporateEpisodicSummary(task: TaskEnvelope, result: ProcessedTaskResult): string {
    const at = result.decision.actionType;
    const oc = caOutcomeTag(result);
    const title = (typeof task.payload['subject'] === 'string' ? task.payload['subject'] : typeof task.payload['title'] === 'string' ? task.payload['title'] : at).slice(0, 120);
    if (at.includes('email')) return `Email composed ${oc}: ${title}`;
    if (at.includes('calendar') || at.includes('schedule')) return `Calendar action ${oc}: ${title}`;
    if (at.includes('document')) return `Document prepared ${oc}: ${title}`;
    if (at.includes('escalat')) return `Escalation routed ${oc}: ${title}`;
    return `Corporate assistant action "${at}" completed with status "${oc}": ${title}`;
}
