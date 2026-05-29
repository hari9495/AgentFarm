/**
 * Meeting Agent — Lesson Pipeline
 *
 * Captures missed action items, inaccurate summaries, and distribution failures
 * and converts them into structured meeting lessons stored in long-term memory.
 *
 * Lesson categories:
 *   action_item_clarity    — action items were vague, missing owners, or no due date
 *   decision_capture       — a key decision was not recorded or was misrepresented
 *   participant_engagement — wrong participants were included/excluded
 *   summary_accuracy       — summary was inaccurate, incomplete, or missed key points
 *   follow_up_tracking     — action items from last meeting were not followed up
 *   time_management        — meeting ran over time or key topics were not reached
 */

import { randomUUID } from 'node:crypto';
import type { TaskEnvelope, ProcessedTaskResult } from '../../execution-engine.js';

export type MeetingLessonCategory = 'action_item_clarity' | 'decision_capture' | 'participant_engagement' | 'summary_accuracy' | 'follow_up_tracking' | 'time_management';
export type MeetingDocTypeFilter = 'meeting_summary' | 'action_items' | 'decision_log' | 'follow_up_email' | 'any';

export interface MeetingLesson { id: string; tenantId: string; workspaceId: string; sourceTaskId: string; feedback: string; category: MeetingLessonCategory; applicableDocTypes: MeetingDocTypeFilter[]; learnedAt: string; correlationId: string; }
export interface MeetingFeedbackContext { tenantId: string; workspaceId: string; taskId: string; documentType: MeetingDocTypeFilter; actionType: string; correlationId: string; }
export interface MeetingFeedbackItem { body: string; author?: string; createdAt?: string; }

export interface IMeetingLessonStore { save(lesson: MeetingLesson): Promise<void>; findByWorkspace(workspaceId: string, filter?: { docType?: MeetingDocTypeFilter; category?: MeetingLessonCategory; limit?: number }): Promise<MeetingLesson[]>; }

export class InMemoryMeetingLessonStore implements IMeetingLessonStore {
    private readonly store = new Map<string, MeetingLesson>();
    async save(lesson: MeetingLesson): Promise<void> { this.store.set(lesson.id, { ...lesson }); }
    async findByWorkspace(workspaceId: string, filter?: { docType?: MeetingDocTypeFilter; category?: MeetingLessonCategory; limit?: number }): Promise<MeetingLesson[]> {
        let results = [...this.store.values()].filter((l) => l.workspaceId === workspaceId);
        if (filter?.category) results = results.filter((l) => l.category === filter.category);
        if (filter?.docType && filter.docType !== 'any') results = results.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
        results.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
        return filter?.limit ? results.slice(0, filter.limit) : results;
    }
}

export class GatewayMeetingLessonStore implements IMeetingLessonStore {
    constructor(private readonly gatewayBaseUrl: string, private readonly serviceToken: string) {}
    async save(lesson: MeetingLesson): Promise<void> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try { await fetch(`${base}/v1/memory/patterns`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` }, body: JSON.stringify({ tenantId: lesson.tenantId, workspaceId: lesson.workspaceId, pattern: `meeting:lesson:${lesson.category}:${lesson.workspaceId}:${lesson.id}`, summary: `[${lesson.category}] ${lesson.feedback.slice(0, 200)}`, confidence: 0.7, observedCount: 1, lastSeen: lesson.learnedAt, metadata: { lessonId: lesson.id, category: lesson.category, docTypes: lesson.applicableDocTypes, feedback: lesson.feedback, sourceTaskId: lesson.sourceTaskId, correlationId: lesson.correlationId, learnedAt: lesson.learnedAt } }), signal: AbortSignal.timeout(10_000) }); } catch (err) { console.warn(`[GatewayMeetingLessonStore] save failed: ${String(err)}`); }
    }
    async findByWorkspace(workspaceId: string, filter?: { docType?: MeetingDocTypeFilter; category?: MeetingLessonCategory; limit?: number }): Promise<MeetingLesson[]> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try {
            const res = await fetch(`${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`, { method: 'GET', headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` }, signal: AbortSignal.timeout(10_000) });
            if (!res.ok) return [];
            const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number; lastSeen?: string; metadata?: Record<string, unknown> }> };
            let lessons: MeetingLesson[] = (data.patterns ?? []).filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith('meeting:lesson:') && p.pattern.includes(`:${workspaceId}:`)).map((p): MeetingLesson | null => {
                const meta = p.metadata as Record<string, unknown> | undefined;
                const feedback = String(meta?.['feedback'] ?? p.summary ?? '').replace(/^\[[\w_]+\] /, '');
                if (!feedback) return null;
                const keyParts = (p.pattern ?? '').split(':');
                return { id: String(meta?.['lessonId'] ?? keyParts[4] ?? Math.random().toString(36).slice(2)), tenantId: '', workspaceId, sourceTaskId: String(meta?.['sourceTaskId'] ?? ''), feedback, category: (meta?.['category'] ?? keyParts[2] ?? 'summary_accuracy') as MeetingLessonCategory, applicableDocTypes: Array.isArray(meta?.['docTypes']) ? (meta['docTypes'] as MeetingDocTypeFilter[]) : ['any'], learnedAt: String(meta?.['learnedAt'] ?? p.lastSeen ?? new Date().toISOString()), correlationId: String(meta?.['correlationId'] ?? '') };
            }).filter((l): l is MeetingLesson => l !== null);
            if (filter?.category) lessons = lessons.filter((l) => l.category === filter.category);
            if (filter?.docType && filter.docType !== 'any') lessons = lessons.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
            lessons.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
            return filter?.limit ? lessons.slice(0, filter.limit) : lessons;
        } catch (err) { console.warn(`[GatewayMeetingLessonStore] findByWorkspace failed: ${String(err)}`); return []; }
    }
}

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: MeetingLessonCategory }> = [
    { pattern: /\b(action item|task|owner|due date|who is responsible|no owner|vague action|not assigned|no deadline)\b/i, category: 'action_item_clarity' },
    { pattern: /\b(decision|not captured|wrong decision|misrepresented|didn.t record|changed decision|outcome not noted)\b/i, category: 'decision_capture' },
    { pattern: /\b(wrong people|missing stakeholder|not invited|excluded|shouldn.t be in|too many people|wrong audience)\b/i, category: 'participant_engagement' },
    { pattern: /\b(summary inaccurate|wrong summary|missed key point|incomplete summary|not what was said|misquoted)\b/i, category: 'summary_accuracy' },
    { pattern: /\b(follow up|not followed up|from last meeting|carry.over|still open|action not done|ignored)\b/i, category: 'follow_up_tracking' },
    { pattern: /\b(ran over|time|didn.t finish|too long|agenda|not all topics|rushed|cut short|overtime)\b/i, category: 'time_management' },
];

export function classifyMeetingFeedback(body: string): MeetingLessonCategory {
    for (const { pattern, category } of CATEGORY_PATTERNS) { if (pattern.test(body)) return category; }
    return 'summary_accuracy';
}

export async function ingestMeetingFeedback(ctx: MeetingFeedbackContext, feedbackItems: MeetingFeedbackItem[], store: IMeetingLessonStore): Promise<MeetingLesson[]> {
    const lessons: MeetingLesson[] = [];
    for (const item of feedbackItems) {
        const body = item.body.trim();
        if (body.length < 10) continue;
        const category = classifyMeetingFeedback(body);
        const lesson: MeetingLesson = { id: randomUUID(), tenantId: ctx.tenantId, workspaceId: ctx.workspaceId, sourceTaskId: ctx.taskId, feedback: body, category, applicableDocTypes: ['any'], learnedAt: item.createdAt ?? new Date().toISOString(), correlationId: ctx.correlationId };
        await store.save(lesson);
        lessons.push(lesson);
    }
    return lessons;
}

export function formatMeetingLessonsForPrompt(lessons: MeetingLesson[]): string {
    if (lessons.length === 0) return '';
    return `Workspace meeting rules (from past summary feedback):\n${lessons.slice(0, 12).map((l) => `- [${l.category}] ${l.feedback}`).join('\n')}`;
}

function meetingOutcomeTag(result: ProcessedTaskResult): 'success' | 'fail' { return result.status === 'success' ? 'success' : 'fail'; }

export function buildMeetingEpisodicPattern(_task: TaskEnvelope, result: ProcessedTaskResult): string {
    const at = result.decision.actionType;
    const oc = meetingOutcomeTag(result);
    const prefix = at.startsWith('workspace_meeting_') ? at.replace('workspace_meeting_', 'meeting:') : `meeting:${at}`;
    return `${prefix}:${oc}`;
}

export function buildMeetingEpisodicSummary(task: TaskEnvelope, result: ProcessedTaskResult): string {
    const at = result.decision.actionType;
    const oc = meetingOutcomeTag(result);
    const title = (typeof task.payload['meetingTitle'] === 'string' ? task.payload['meetingTitle'] : typeof task.payload['title'] === 'string' ? task.payload['title'] : at).slice(0, 120);
    if (at.includes('transcri')) return `Meeting transcribed ${oc}: ${title}`;
    if (at.includes('summar')) return `Meeting summarised ${oc}: ${title}`;
    if (at.includes('distribut')) return `Meeting notes distributed ${oc}: ${title}`;
    return `Meeting action "${at}" completed with status "${oc}": ${title}`;
}
