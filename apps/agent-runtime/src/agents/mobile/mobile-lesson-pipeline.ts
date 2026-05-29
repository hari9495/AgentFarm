/**
 * Mobile Agent — Lesson Pipeline
 *
 * Captures App Store rejection reasons, crash report root causes, and UX review
 * feedback and converts them into structured mobile lessons.
 *
 * Lesson categories:
 *   platform_consistency — deviated from HIG/Material Design
 *   performance          — jank, excessive memory, slow startup, battery drain
 *   accessibility        — VoiceOver/TalkBack, dynamic type, colour contrast
 *   ux_patterns          — confusing navigation, gesture conflicts, poor affordances
 *   code_quality         — memory leaks, retain cycles, thread safety, anti-patterns
 *   testing_coverage     — missing unit/UI tests or untested edge cases
 *   api_integration      — API contract mismatch, error handling, offline behaviour
 */

import { randomUUID } from 'node:crypto';
import type { TaskEnvelope, ProcessedTaskResult } from '../../execution-engine.js';

export type MobileLessonCategory = 'platform_consistency' | 'performance' | 'accessibility' | 'ux_patterns' | 'code_quality' | 'testing_coverage' | 'api_integration';
export type MobileDocTypeFilter = 'ui_component' | 'api_client' | 'push_notification' | 'navigation' | 'any';

export interface MobileLesson { id: string; tenantId: string; workspaceId: string; sourceTaskId: string; feedback: string; category: MobileLessonCategory; applicableDocTypes: MobileDocTypeFilter[]; learnedAt: string; correlationId: string; }
export interface MobileFeedbackContext { tenantId: string; workspaceId: string; taskId: string; documentType: MobileDocTypeFilter; actionType: string; correlationId: string; }
export interface MobileFeedbackItem { body: string; author?: string; createdAt?: string; }

export interface IMobileLessonStore { save(lesson: MobileLesson): Promise<void>; findByWorkspace(workspaceId: string, filter?: { docType?: MobileDocTypeFilter; category?: MobileLessonCategory; limit?: number }): Promise<MobileLesson[]>; }

export class InMemoryMobileLessonStore implements IMobileLessonStore {
    private readonly store = new Map<string, MobileLesson>();
    async save(lesson: MobileLesson): Promise<void> { this.store.set(lesson.id, { ...lesson }); }
    async findByWorkspace(workspaceId: string, filter?: { docType?: MobileDocTypeFilter; category?: MobileLessonCategory; limit?: number }): Promise<MobileLesson[]> {
        let results = [...this.store.values()].filter((l) => l.workspaceId === workspaceId);
        if (filter?.category) results = results.filter((l) => l.category === filter.category);
        if (filter?.docType && filter.docType !== 'any') results = results.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
        results.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
        return filter?.limit ? results.slice(0, filter.limit) : results;
    }
}

export class GatewayMobileLessonStore implements IMobileLessonStore {
    constructor(private readonly gatewayBaseUrl: string, private readonly serviceToken: string) {}
    async save(lesson: MobileLesson): Promise<void> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try { await fetch(`${base}/v1/memory/patterns`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` }, body: JSON.stringify({ tenantId: lesson.tenantId, workspaceId: lesson.workspaceId, pattern: `mobile:lesson:${lesson.category}:${lesson.workspaceId}:${lesson.id}`, summary: `[${lesson.category}] ${lesson.feedback.slice(0, 200)}`, confidence: 0.7, observedCount: 1, lastSeen: lesson.learnedAt, metadata: { lessonId: lesson.id, category: lesson.category, docTypes: lesson.applicableDocTypes, feedback: lesson.feedback, sourceTaskId: lesson.sourceTaskId, correlationId: lesson.correlationId, learnedAt: lesson.learnedAt } }), signal: AbortSignal.timeout(10_000) }); } catch (err) { console.warn(`[GatewayMobileLessonStore] save failed: ${String(err)}`); }
    }
    async findByWorkspace(workspaceId: string, filter?: { docType?: MobileDocTypeFilter; category?: MobileLessonCategory; limit?: number }): Promise<MobileLesson[]> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try {
            const res = await fetch(`${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`, { method: 'GET', headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` }, signal: AbortSignal.timeout(10_000) });
            if (!res.ok) return [];
            const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number; lastSeen?: string; metadata?: Record<string, unknown> }> };
            let lessons: MobileLesson[] = (data.patterns ?? []).filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith('mobile:lesson:') && p.pattern.includes(`:${workspaceId}:`)).map((p): MobileLesson | null => {
                const meta = p.metadata as Record<string, unknown> | undefined;
                const feedback = String(meta?.['feedback'] ?? p.summary ?? '').replace(/^\[[\w_]+\] /, '');
                if (!feedback) return null;
                const keyParts = (p.pattern ?? '').split(':');
                return { id: String(meta?.['lessonId'] ?? keyParts[4] ?? Math.random().toString(36).slice(2)), tenantId: '', workspaceId, sourceTaskId: String(meta?.['sourceTaskId'] ?? ''), feedback, category: (meta?.['category'] ?? keyParts[2] ?? 'code_quality') as MobileLessonCategory, applicableDocTypes: Array.isArray(meta?.['docTypes']) ? (meta['docTypes'] as MobileDocTypeFilter[]) : ['any'], learnedAt: String(meta?.['learnedAt'] ?? p.lastSeen ?? new Date().toISOString()), correlationId: String(meta?.['correlationId'] ?? '') };
            }).filter((l): l is MobileLesson => l !== null);
            if (filter?.category) lessons = lessons.filter((l) => l.category === filter.category);
            if (filter?.docType && filter.docType !== 'any') lessons = lessons.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
            lessons.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
            return filter?.limit ? lessons.slice(0, filter.limit) : lessons;
        } catch (err) { console.warn(`[GatewayMobileLessonStore] findByWorkspace failed: ${String(err)}`); return []; }
    }
}

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: MobileLessonCategory }> = [
    { pattern: /\b(HIG|Material Design|platform guideline|off.platform|custom UI|Apple|App Store rejection|not native|looks wrong)\b/i, category: 'platform_consistency' },
    { pattern: /\b(slow|jank|lag|FPS|memory|battery|startup time|scroll performance|background|ANR|freeze)\b/i, category: 'performance' },
    { pattern: /\b(VoiceOver|TalkBack|accessibility|a11y|dynamic type|colour contrast|screen reader|label|focus order)\b/i, category: 'accessibility' },
    { pattern: /\b(confusing|navigation|gesture|back button|swipe|tab bar|modal|UX|affordance|discoverability|user flow)\b/i, category: 'ux_patterns' },
    { pattern: /\b(retain cycle|memory leak|thread|async|main thread|crash|force unwrap|anti.pattern|code smell|coupling)\b/i, category: 'code_quality' },
    { pattern: /\b(test|unit test|UI test|XCTest|Espresso|no test|coverage|missing test|untested|snapshot|flaky)\b/i, category: 'testing_coverage' },
    { pattern: /\b(API|endpoint|offline|network|error handling|retry|timeout|contract|response|401|404|parsing)\b/i, category: 'api_integration' },
];

export function classifyMobileFeedback(body: string): MobileLessonCategory {
    for (const { pattern, category } of CATEGORY_PATTERNS) { if (pattern.test(body)) return category; }
    return 'code_quality';
}

export async function ingestMobileFeedback(ctx: MobileFeedbackContext, feedbackItems: MobileFeedbackItem[], store: IMobileLessonStore): Promise<MobileLesson[]> {
    const lessons: MobileLesson[] = [];
    for (const item of feedbackItems) {
        const body = item.body.trim();
        if (body.length < 10) continue;
        const category = classifyMobileFeedback(body);
        const lesson: MobileLesson = { id: randomUUID(), tenantId: ctx.tenantId, workspaceId: ctx.workspaceId, sourceTaskId: ctx.taskId, feedback: body, category, applicableDocTypes: ['any'], learnedAt: item.createdAt ?? new Date().toISOString(), correlationId: ctx.correlationId };
        await store.save(lesson);
        lessons.push(lesson);
    }
    return lessons;
}

export function formatMobileLessonsForPrompt(lessons: MobileLesson[]): string {
    if (lessons.length === 0) return '';
    return `Workspace mobile rules (from past review feedback and crash reports):\n${lessons.slice(0, 12).map((l) => `- [${l.category}] ${l.feedback}`).join('\n')}`;
}

function mobileOutcomeTag(result: ProcessedTaskResult): 'success' | 'fail' { return result.status === 'success' ? 'success' : 'fail'; }

export function buildMobileEpisodicPattern(_task: TaskEnvelope, result: ProcessedTaskResult): string {
    const at = result.decision.actionType;
    const oc = mobileOutcomeTag(result);
    const prefix = at.startsWith('workspace_mobile_') ? at.replace('workspace_mobile_', 'mobile:') : `mobile:${at}`;
    return `${prefix}:${oc}`;
}

export function buildMobileEpisodicSummary(task: TaskEnvelope, result: ProcessedTaskResult): string {
    const at = result.decision.actionType;
    const oc = mobileOutcomeTag(result);
    const title = (typeof task.payload['componentTitle'] === 'string' ? task.payload['componentTitle'] : typeof task.payload['title'] === 'string' ? task.payload['title'] : at).slice(0, 120);
    if (at.includes('component') || at.includes('ui')) return `UI component built ${oc}: ${title}`;
    if (at.includes('api_client')) return `API client generated ${oc}: ${title}`;
    if (at.includes('push')) return `Push notification ${oc}: ${title}`;
    if (at.includes('deep_link')) return `Deep link handler ${oc}: ${title}`;
    return `Mobile action "${at}" completed with status "${oc}": ${title}`;
}
