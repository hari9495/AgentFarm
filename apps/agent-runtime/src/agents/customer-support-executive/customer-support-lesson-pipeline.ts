/**
 * Customer Support Executive — Lesson Pipeline
 *
 * Captures CSAT failures, SLA breaches, escalation patterns, and supervisor
 * coaching notes and converts them into structured support lessons.
 *
 * Lesson categories:
 *   resolution_quality  — resolution was incorrect, incomplete, or didn't fix the issue
 *   escalation_timing   — should have escalated sooner (or delayed unnecessarily)
 *   empathy             — tone was robotic, dismissive, or lacked empathy
 *   product_accuracy    — gave wrong product info, feature description, or pricing
 *   sla_compliance      — response or resolution time exceeded SLA thresholds
 *   de_escalation       — failed to calm an angry customer before escalating
 *   follow_through      — promised action was not completed or tracked
 */

import { randomUUID } from 'node:crypto';
import type { TaskEnvelope, ProcessedTaskResult } from '../../execution-engine.js';

export type SupportLessonCategory = 'resolution_quality' | 'escalation_timing' | 'empathy' | 'product_accuracy' | 'sla_compliance' | 'de_escalation' | 'follow_through';
export type SupportDocTypeFilter = 'ticket_response' | 'escalation_summary' | 'refund_decision' | 'call_script' | 'any';

export interface SupportLesson {
    id: string;
    tenantId: string;
    workspaceId: string;
    sourceTaskId: string;
    sourceTicketId: string;
    feedback: string;
    category: SupportLessonCategory;
    applicableDocTypes: SupportDocTypeFilter[];
    learnedAt: string;
    correlationId: string;
}

export interface SupportFeedbackContext { tenantId: string; workspaceId: string; taskId: string; ticketId: string; documentType: SupportDocTypeFilter; actionType: string; correlationId: string; }
export interface SupportFeedbackItem { body: string; author?: string; createdAt?: string; }

export interface ISupportLessonStore {
    save(lesson: SupportLesson): Promise<void>;
    findByWorkspace(workspaceId: string, filter?: { docType?: SupportDocTypeFilter; category?: SupportLessonCategory; limit?: number }): Promise<SupportLesson[]>;
}

export class InMemorySupportLessonStore implements ISupportLessonStore {
    private readonly store = new Map<string, SupportLesson>();
    async save(lesson: SupportLesson): Promise<void> { this.store.set(lesson.id, { ...lesson }); }
    async findByWorkspace(workspaceId: string, filter?: { docType?: SupportDocTypeFilter; category?: SupportLessonCategory; limit?: number }): Promise<SupportLesson[]> {
        let results = [...this.store.values()].filter((l) => l.workspaceId === workspaceId);
        if (filter?.category) results = results.filter((l) => l.category === filter.category);
        if (filter?.docType && filter.docType !== 'any') results = results.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
        results.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
        return filter?.limit ? results.slice(0, filter.limit) : results;
    }
}

export class GatewaySupportLessonStore implements ISupportLessonStore {
    constructor(private readonly gatewayBaseUrl: string, private readonly serviceToken: string) {}
    async save(lesson: SupportLesson): Promise<void> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try { await fetch(`${base}/v1/memory/patterns`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` }, body: JSON.stringify({ tenantId: lesson.tenantId, workspaceId: lesson.workspaceId, pattern: `cs:lesson:${lesson.category}:${lesson.workspaceId}:${lesson.id}`, summary: `[${lesson.category}] ${lesson.feedback.slice(0, 200)}`, confidence: 0.7, observedCount: 1, lastSeen: lesson.learnedAt, metadata: { lessonId: lesson.id, category: lesson.category, docTypes: lesson.applicableDocTypes, feedback: lesson.feedback, sourceTaskId: lesson.sourceTaskId, sourceTicketId: lesson.sourceTicketId, correlationId: lesson.correlationId, learnedAt: lesson.learnedAt } }), signal: AbortSignal.timeout(10_000) }); } catch (err) { console.warn(`[GatewaySupportLessonStore] save failed: ${String(err)}`); }
    }
    async findByWorkspace(workspaceId: string, filter?: { docType?: SupportDocTypeFilter; category?: SupportLessonCategory; limit?: number }): Promise<SupportLesson[]> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try {
            const res = await fetch(`${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`, { method: 'GET', headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` }, signal: AbortSignal.timeout(10_000) });
            if (!res.ok) return [];
            const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number; lastSeen?: string; metadata?: Record<string, unknown> }> };
            let lessons: SupportLesson[] = (data.patterns ?? []).filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith('cs:lesson:') && p.pattern.includes(`:${workspaceId}:`)).map((p): SupportLesson | null => {
                const meta = p.metadata as Record<string, unknown> | undefined;
                const feedback = String(meta?.['feedback'] ?? p.summary ?? '').replace(/^\[[\w_]+\] /, '');
                if (!feedback) return null;
                const keyParts = (p.pattern ?? '').split(':');
                return { id: String(meta?.['lessonId'] ?? keyParts[4] ?? Math.random().toString(36).slice(2)), tenantId: '', workspaceId, sourceTaskId: String(meta?.['sourceTaskId'] ?? ''), sourceTicketId: String(meta?.['sourceTicketId'] ?? ''), feedback, category: (meta?.['category'] ?? keyParts[2] ?? 'resolution_quality') as SupportLessonCategory, applicableDocTypes: Array.isArray(meta?.['docTypes']) ? (meta['docTypes'] as SupportDocTypeFilter[]) : ['any'], learnedAt: String(meta?.['learnedAt'] ?? p.lastSeen ?? new Date().toISOString()), correlationId: String(meta?.['correlationId'] ?? '') };
            }).filter((l): l is SupportLesson => l !== null);
            if (filter?.category) lessons = lessons.filter((l) => l.category === filter.category);
            if (filter?.docType && filter.docType !== 'any') lessons = lessons.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
            lessons.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
            return filter?.limit ? lessons.slice(0, filter.limit) : lessons;
        } catch (err) { console.warn(`[GatewaySupportLessonStore] findByWorkspace failed: ${String(err)}`); return []; }
    }
}

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: SupportLessonCategory }> = [
    { pattern: /\b(wrong solution|didn.t fix|reopen|same issue again|resolution incorrect|partial fix|workaround failed)\b/i, category: 'resolution_quality' },
    { pattern: /\b(escalate|tier 2|tier 3|manager|should have escalated|too late|escalation delayed|passed to)\b/i, category: 'escalation_timing' },
    { pattern: /\b(robotic|cold|dismissive|no empathy|didn.t listen|felt unheard|mechanical|scripted|not human)\b/i, category: 'empathy' },
    { pattern: /\b(wrong info|incorrect product|wrong feature|pricing error|misinformation|outdated docs|bad answer)\b/i, category: 'product_accuracy' },
    { pattern: /\b(SLA|response time|too slow|missed deadline|waited too long|no reply|overdue|breach|first reply)\b/i, category: 'sla_compliance' },
    { pattern: /\b(de-escalate|calm|angry customer|upset|diffuse|didn.t calm|made it worse|complaint escalated)\b/i, category: 'de_escalation' },
    { pattern: /\b(follow up|promise|didn.t follow through|forgot|no update|said would and didn.t|dropped|closed too early)\b/i, category: 'follow_through' },
];

export function classifySupportFeedback(body: string): SupportLessonCategory {
    for (const { pattern, category } of CATEGORY_PATTERNS) { if (pattern.test(body)) return category; }
    return 'resolution_quality';
}

export async function ingestSupportFeedback(ctx: SupportFeedbackContext, feedbackItems: SupportFeedbackItem[], store: ISupportLessonStore): Promise<SupportLesson[]> {
    const lessons: SupportLesson[] = [];
    for (const item of feedbackItems) {
        const body = item.body.trim();
        if (body.length < 10) continue;
        const category = classifySupportFeedback(body);
        const lesson: SupportLesson = { id: randomUUID(), tenantId: ctx.tenantId, workspaceId: ctx.workspaceId, sourceTaskId: ctx.taskId, sourceTicketId: ctx.ticketId, feedback: body, category, applicableDocTypes: ['any'], learnedAt: item.createdAt ?? new Date().toISOString(), correlationId: ctx.correlationId };
        await store.save(lesson);
        lessons.push(lesson);
    }
    return lessons;
}

export function formatSupportLessonsForPrompt(lessons: SupportLesson[]): string {
    if (lessons.length === 0) return '';
    return `Workspace support rules (from past CSAT failures and supervisor feedback):\n${lessons.slice(0, 12).map((l) => `- [${l.category}] ${l.feedback}`).join('\n')}`;
}

function csOutcomeTag(result: ProcessedTaskResult): 'success' | 'fail' { return result.status === 'success' ? 'success' : 'fail'; }

export function buildSupportEpisodicPattern(_task: TaskEnvelope, result: ProcessedTaskResult): string {
    const at = result.decision.actionType;
    const oc = csOutcomeTag(result);
    const prefix = at.startsWith('workspace_cs_') ? at.replace('workspace_cs_', 'cs:') : `cs:${at}`;
    return `${prefix}:${oc}`;
}

export function buildSupportEpisodicSummary(task: TaskEnvelope, result: ProcessedTaskResult): string {
    const at = result.decision.actionType;
    const oc = csOutcomeTag(result);
    const title = (typeof task.payload['issueTitle'] === 'string' ? task.payload['issueTitle'] : typeof task.payload['title'] === 'string' ? task.payload['title'] : at).slice(0, 120);
    if (at.includes('ticket')) return `Ticket ${at.includes('escalat') ? 'escalated' : 'resolved'} ${oc}: ${title}`;
    if (at.includes('refund')) return `Refund decision ${oc}: ${title}`;
    if (at.includes('call')) return `Call handled ${oc}: ${title}`;
    return `Support action "${at}" completed with status "${oc}": ${title}`;
}
