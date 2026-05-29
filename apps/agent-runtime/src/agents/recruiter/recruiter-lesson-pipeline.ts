/**
 * Recruiter — Lesson Pipeline
 *
 * Captures hiring outcome feedback (offer rejections, bad hires, interviewer
 * notes, bias flags) and converts them into structured lessons stored in
 * long-term memory.
 *
 * Lesson categories:
 *   jd_quality            — job description was unclear, biased, or inaccurate
 *   screening_accuracy    — resume screen missed strong candidates or passed weak ones
 *   interview_process     — interview structure, questions, or scoring was flawed
 *   offer_strategy        — offer was poorly structured, timed, or non-competitive
 *   candidate_experience  — candidate feedback was negative about process or comms
 *   compliance            — legal/regulatory requirement was missed or handled poorly
 *   diversity             — process showed bias or lacked DEI considerations
 */

import { randomUUID } from 'node:crypto';
import type { TaskEnvelope, ProcessedTaskResult } from '../../execution-engine.js';

export type RecruiterLessonCategory =
    | 'jd_quality'
    | 'screening_accuracy'
    | 'interview_process'
    | 'offer_strategy'
    | 'candidate_experience'
    | 'compliance'
    | 'diversity';

export type RecruiterDocTypeFilter =
    | 'job_description'
    | 'outreach_email'
    | 'offer_letter'
    | 'interview_guide'
    | 'phone_screen_script'
    | 'rejection_email'
    | 'any';

export interface RecruiterLesson {
    id: string;
    tenantId: string;
    workspaceId: string;
    sourceTaskId: string;
    sourceRoleId: string;
    feedback: string;
    category: RecruiterLessonCategory;
    applicableDocTypes: RecruiterDocTypeFilter[];
    learnedAt: string;
    correlationId: string;
}

export interface RecruiterFeedbackContext {
    tenantId: string;
    workspaceId: string;
    taskId: string;
    roleId: string;
    documentType: RecruiterDocTypeFilter;
    actionType: string;
    correlationId: string;
}

export interface RecruiterFeedbackItem {
    body: string;
    author?: string;
    createdAt?: string;
}

// ---------------------------------------------------------------------------
// Lesson store
// ---------------------------------------------------------------------------

export interface IRecruiterLessonStore {
    save(lesson: RecruiterLesson): Promise<void>;
    findByWorkspace(
        workspaceId: string,
        filter?: { docType?: RecruiterDocTypeFilter; category?: RecruiterLessonCategory; limit?: number },
    ): Promise<RecruiterLesson[]>;
}

export class InMemoryRecruiterLessonStore implements IRecruiterLessonStore {
    private readonly store = new Map<string, RecruiterLesson>();

    async save(lesson: RecruiterLesson): Promise<void> {
        this.store.set(lesson.id, { ...lesson });
    }

    async findByWorkspace(
        workspaceId: string,
        filter?: { docType?: RecruiterDocTypeFilter; category?: RecruiterLessonCategory; limit?: number },
    ): Promise<RecruiterLesson[]> {
        let results = [...this.store.values()].filter((l) => l.workspaceId === workspaceId);
        if (filter?.category) results = results.filter((l) => l.category === filter.category);
        if (filter?.docType && filter.docType !== 'any') {
            results = results.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
        }
        results.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
        return filter?.limit ? results.slice(0, filter.limit) : results;
    }
}

export class GatewayRecruiterLessonStore implements IRecruiterLessonStore {
    constructor(
        private readonly gatewayBaseUrl: string,
        private readonly serviceToken: string,
    ) {}

    async save(lesson: RecruiterLesson): Promise<void> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try {
            await fetch(`${base}/v1/memory/patterns`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` },
                body: JSON.stringify({
                    tenantId: lesson.tenantId,
                    workspaceId: lesson.workspaceId,
                    pattern: `rec:lesson:${lesson.category}:${lesson.workspaceId}:${lesson.id}`,
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
                        sourceRoleId: lesson.sourceRoleId,
                        correlationId: lesson.correlationId,
                        learnedAt: lesson.learnedAt,
                    },
                }),
                signal: AbortSignal.timeout(10_000),
            });
        } catch (err) {
            console.warn(`[GatewayRecruiterLessonStore] save failed: ${String(err)}`);
        }
    }

    async findByWorkspace(
        workspaceId: string,
        filter?: { docType?: RecruiterDocTypeFilter; category?: RecruiterLessonCategory; limit?: number },
    ): Promise<RecruiterLesson[]> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try {
            const res = await fetch(
                `${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`,
                { method: 'GET', headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` }, signal: AbortSignal.timeout(10_000) },
            );
            if (!res.ok) return [];
            const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number; lastSeen?: string; metadata?: Record<string, unknown> }> };
            const patterns = (data.patterns ?? []).filter(
                (p) => typeof p.pattern === 'string' && p.pattern.startsWith('rec:lesson:') && p.pattern.includes(`:${workspaceId}:`),
            );
            let lessons: RecruiterLesson[] = patterns.map((p): RecruiterLesson | null => {
                const meta = p.metadata as Record<string, unknown> | undefined;
                if (meta?.lessonId) {
                    return {
                        id: String(meta['lessonId']),
                        tenantId: '',
                        workspaceId,
                        sourceTaskId: String(meta['sourceTaskId'] ?? ''),
                        sourceRoleId: String(meta['sourceRoleId'] ?? ''),
                        feedback: String(meta['feedback'] ?? p.summary ?? '').replace(/^\[[\w_]+\] /, ''),
                        category: (meta['category'] as RecruiterLessonCategory) ?? 'jd_quality',
                        applicableDocTypes: Array.isArray(meta['docTypes']) ? (meta['docTypes'] as RecruiterDocTypeFilter[]) : ['any'],
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
                    sourceRoleId: '',
                    feedback,
                    category: (keyParts[2] as RecruiterLessonCategory) ?? 'jd_quality',
                    applicableDocTypes: ['any'],
                    learnedAt: p.lastSeen ?? new Date().toISOString(),
                    correlationId: '',
                };
            }).filter((l): l is RecruiterLesson => l !== null);

            if (filter?.category) lessons = lessons.filter((l) => l.category === filter.category);
            if (filter?.docType && filter.docType !== 'any') {
                lessons = lessons.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
            }
            lessons.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
            return filter?.limit ? lessons.slice(0, filter.limit) : lessons;
        } catch (err) {
            console.warn(`[GatewayRecruiterLessonStore] findByWorkspace failed: ${String(err)}`);
            return [];
        }
    }
}

// ---------------------------------------------------------------------------
// Category classifier
// ---------------------------------------------------------------------------

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: RecruiterLessonCategory; docTypes: RecruiterDocTypeFilter[] }> = [
    {
        pattern: /\b(job description|JD|requirements|qualifications|must have|nice to have|role clarity|unclear role|wrong skills listed)\b/i,
        category: 'jd_quality',
        docTypes: ['job_description', 'any'],
    },
    {
        pattern: /\b(missed|false positive|false negative|screened out|shouldn.t have passed|wrong candidate|resume screen|ATS|skills mismatch)\b/i,
        category: 'screening_accuracy',
        docTypes: ['phone_screen_script', 'interview_guide', 'any'],
    },
    {
        pattern: /\b(interview|question|scorecard|rubric|panel|debrief|structured|unstructured|bias in interview|bad questions)\b/i,
        category: 'interview_process',
        docTypes: ['interview_guide', 'phone_screen_script', 'any'],
    },
    {
        pattern: /\b(offer|salary|compensation|equity|benefits|counter.offer|rejected offer|too low|declined|negotiate)\b/i,
        category: 'offer_strategy',
        docTypes: ['offer_letter', 'any'],
    },
    {
        pattern: /\b(candidate experience|communication|slow response|ghosted|unprofessional|feedback|no update|left us|withdrew)\b/i,
        category: 'candidate_experience',
        docTypes: ['outreach_email', 'rejection_email', 'any'],
    },
    {
        pattern: /\b(EEOC|FCRA|GDPR|IR35|right to work|legal|compliance|disclosure|background check|unlawful|protected class)\b/i,
        category: 'compliance',
        docTypes: ['job_description', 'rejection_email', 'offer_letter', 'any'],
    },
    {
        pattern: /\b(bias|diversity|inclusion|DEI|gender|race|age|disability|underrepresented|inclusive language|discriminatory)\b/i,
        category: 'diversity',
        docTypes: ['job_description', 'outreach_email', 'any'],
    },
];

export function classifyRecruiterFeedback(body: string): RecruiterLessonCategory {
    for (const { pattern, category } of CATEGORY_PATTERNS) {
        if (pattern.test(body)) return category;
    }
    return 'jd_quality';
}

export function inferRecruiterApplicableDocTypes(
    category: RecruiterLessonCategory,
    sourceDocType: RecruiterDocTypeFilter,
): RecruiterDocTypeFilter[] {
    if (category === 'compliance' || category === 'diversity') return ['any'];
    if (category === 'candidate_experience') return ['outreach_email', 'rejection_email'];
    if (category === 'interview_process') return ['interview_guide', 'phone_screen_script'];
    if (sourceDocType === 'any') return ['any'];
    return [sourceDocType];
}

// ---------------------------------------------------------------------------
// Core pipeline
// ---------------------------------------------------------------------------

export async function ingestRecruiterFeedback(
    ctx: RecruiterFeedbackContext,
    feedbackItems: RecruiterFeedbackItem[],
    store: IRecruiterLessonStore,
): Promise<RecruiterLesson[]> {
    const lessons: RecruiterLesson[] = [];
    for (const item of feedbackItems) {
        const body = item.body.trim();
        if (body.length < 10) continue;
        const category = classifyRecruiterFeedback(body);
        const applicableDocTypes = inferRecruiterApplicableDocTypes(category, ctx.documentType);
        const lesson: RecruiterLesson = {
            id: randomUUID(),
            tenantId: ctx.tenantId,
            workspaceId: ctx.workspaceId,
            sourceTaskId: ctx.taskId,
            sourceRoleId: ctx.roleId,
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

export function formatRecruiterLessonsForPrompt(lessons: RecruiterLesson[]): string {
    if (lessons.length === 0) return '';
    const lines = lessons.slice(0, 12).map((l) => `- [${l.category}] ${l.feedback}`);
    return `Workspace hiring rules (from past hiring feedback):\n${lines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// Episodic hooks
// ---------------------------------------------------------------------------

function recOutcomeTag(result: ProcessedTaskResult): 'success' | 'fail' {
    return result.status === 'success' ? 'success' : 'fail';
}

export function buildRecruiterEpisodicPattern(
    _task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const at = result.decision.actionType;
    const oc = recOutcomeTag(result);

    if (at === 'workspace_rec_build_jd')             return `rec:build_jd:${oc}`;
    if (at === 'workspace_rec_post_job')             return `rec:post_job:${oc}`;
    if (at === 'workspace_rec_source_candidates')    return `rec:source_candidates:${oc}`;
    if (at === 'workspace_rec_screen_resume')        return `rec:screen_resume:${oc}`;
    if (at === 'workspace_rec_send_outreach')        return `rec:send_outreach:${oc}`;
    if (at === 'workspace_rec_schedule_interview')   return `rec:schedule_interview:${oc}`;
    if (at === 'workspace_rec_conduct_phone_screen') return `rec:phone_screen:${oc}`;
    if (at === 'workspace_rec_gather_feedback')      return `rec:gather_feedback:${oc}`;
    if (at === 'workspace_rec_generate_offer') {
        const decision = result.executionPayload['offer_outcome'];
        if (decision === 'accepted') return 'rec:generate_offer:accepted';
        if (decision === 'rejected') return 'rec:generate_offer:rejected';
        return `rec:generate_offer:${oc}`;
    }
    if (at === 'workspace_rec_compose_rejection')    return `rec:compose_rejection:${oc}`;
    if (at === 'workspace_rec_negotiate_offer')      return `rec:negotiate_offer:${oc}`;
    if (at === 'workspace_rec_scan_jd_bias')         return `rec:scan_jd_bias:${oc}`;
    if (at === 'workspace_rec_validate_credentials') return `rec:validate_credentials:${oc}`;
    if (at === 'workspace_rec_check_bgc')            return `rec:check_bgc:${oc}`;
    if (at === 'workspace_rec_run_reference_check')  return `rec:run_reference_check:${oc}`;
    if (at === 'workspace_rec_manage_talent_pool')   return `rec:manage_talent_pool:${oc}`;
    if (at === 'workspace_rec_onboarding_handoff')   return `rec:onboarding_handoff:${oc}`;
    if (at === 'workspace_rec_run_assessment')       return `rec:run_assessment:${oc}`;
    if (at === 'workspace_rec_market_intelligence')  return `rec:market_intelligence:${oc}`;
    if (at === 'workspace_rec_international')        return `rec:international:${oc}`;
    if (at === 'workspace_rec_campus_recruiting')    return `rec:campus_recruiting:${oc}`;

    return `rec:${at}:${oc}`;
}

export function buildRecruiterEpisodicSummary(
    task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const pattern = buildRecruiterEpisodicPattern(task, result);
    const at = result.decision.actionType;
    const oc = recOutcomeTag(result);

    const roleTitle = typeof task.payload['roleTitle'] === 'string'
        ? task.payload['roleTitle']
        : typeof task.payload['title'] === 'string'
            ? task.payload['title']
            : at;
    const taskLabel = roleTitle.slice(0, 120);

    if (pattern === 'rec:generate_offer:accepted') return `Offer accepted for: ${taskLabel}`;
    if (pattern === 'rec:generate_offer:rejected') {
        const reason = typeof result.executionPayload['rejection_reason'] === 'string'
            ? ` — Reason: ${result.executionPayload['rejection_reason']}`
            : '';
        return `Offer rejected${reason}: ${taskLabel}`;
    }
    if (pattern.startsWith('rec:build_jd'))           return `Job description built ${oc}: ${taskLabel}`;
    if (pattern.startsWith('rec:screen_resume'))      return `Resume screened ${oc}: ${taskLabel}`;
    if (pattern.startsWith('rec:send_outreach'))      return `Candidate outreach sent ${oc}: ${taskLabel}`;
    if (pattern.startsWith('rec:schedule_interview')) return `Interview scheduled ${oc}: ${taskLabel}`;
    if (pattern.startsWith('rec:phone_screen'))       return `Phone screen completed ${oc}: ${taskLabel}`;
    if (pattern.startsWith('rec:scan_jd_bias'))       return `JD bias scan ${oc}: ${taskLabel}`;
    if (pattern.startsWith('rec:negotiate_offer'))    return `Offer negotiation ${oc}: ${taskLabel}`;
    if (pattern.startsWith('rec:onboarding_handoff')) return `Onboarding handoff ${oc}: ${taskLabel}`;

    return `Recruiter action "${at}" completed with status "${oc}": ${taskLabel}`;
}
