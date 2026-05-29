/**
 * Project Manager — Lesson Pipeline
 *
 * Captures delivery failure feedback, retro insights, and stakeholder
 * escalations and converts them into structured PM lessons stored in
 * long-term memory.
 *
 * Lesson categories:
 *   scope_management           — scope crept or was undefined, causing overruns
 *   estimation                 — estimates were wildly off (over or under)
 *   risk_identification        — a risk was missed or misjudged in the register
 *   stakeholder_communication  — stakeholder was surprised by status or decision
 *   delivery_predictability    — sprint velocity or milestone forecasts were wrong
 *   resource_allocation        — team was over/under-utilised or mis-assigned
 *   retrospective_insights     — recurring team friction or process failure
 */

import { randomUUID } from 'node:crypto';
import type { TaskEnvelope, ProcessedTaskResult } from '../../execution-engine.js';

export type PmLessonCategory =
    | 'scope_management'
    | 'estimation'
    | 'risk_identification'
    | 'stakeholder_communication'
    | 'delivery_predictability'
    | 'resource_allocation'
    | 'retrospective_insights';

export type PmDocTypeFilter =
    | 'project_charter'
    | 'status_report'
    | 'risk_register'
    | 'sprint_plan'
    | 'retrospective'
    | 'milestone_plan'
    | 'any';

export interface PmLesson {
    id: string;
    tenantId: string;
    workspaceId: string;
    sourceTaskId: string;
    sourceProjectId: string;
    feedback: string;
    category: PmLessonCategory;
    applicableDocTypes: PmDocTypeFilter[];
    learnedAt: string;
    correlationId: string;
}

export interface PmFeedbackContext {
    tenantId: string;
    workspaceId: string;
    taskId: string;
    projectId: string;
    documentType: PmDocTypeFilter;
    actionType: string;
    correlationId: string;
}

export interface PmFeedbackItem {
    body: string;
    author?: string;
    createdAt?: string;
}

// ---------------------------------------------------------------------------
// Lesson store
// ---------------------------------------------------------------------------

export interface IPmLessonStore {
    save(lesson: PmLesson): Promise<void>;
    findByWorkspace(workspaceId: string, filter?: { docType?: PmDocTypeFilter; category?: PmLessonCategory; limit?: number }): Promise<PmLesson[]>;
}

export class InMemoryPmLessonStore implements IPmLessonStore {
    private readonly store = new Map<string, PmLesson>();
    async save(lesson: PmLesson): Promise<void> { this.store.set(lesson.id, { ...lesson }); }
    async findByWorkspace(workspaceId: string, filter?: { docType?: PmDocTypeFilter; category?: PmLessonCategory; limit?: number }): Promise<PmLesson[]> {
        let results = [...this.store.values()].filter((l) => l.workspaceId === workspaceId);
        if (filter?.category) results = results.filter((l) => l.category === filter.category);
        if (filter?.docType && filter.docType !== 'any') results = results.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
        results.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
        return filter?.limit ? results.slice(0, filter.limit) : results;
    }
}

export class GatewayPmLessonStore implements IPmLessonStore {
    constructor(private readonly gatewayBaseUrl: string, private readonly serviceToken: string) {}

    async save(lesson: PmLesson): Promise<void> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try {
            await fetch(`${base}/v1/memory/patterns`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` },
                body: JSON.stringify({
                    tenantId: lesson.tenantId, workspaceId: lesson.workspaceId,
                    pattern: `pm:lesson:${lesson.category}:${lesson.workspaceId}:${lesson.id}`,
                    summary: `[${lesson.category}] ${lesson.feedback.slice(0, 200)}`,
                    confidence: 0.7, observedCount: 1, lastSeen: lesson.learnedAt,
                    metadata: { lessonId: lesson.id, category: lesson.category, docTypes: lesson.applicableDocTypes, feedback: lesson.feedback, sourceTaskId: lesson.sourceTaskId, sourceProjectId: lesson.sourceProjectId, correlationId: lesson.correlationId, learnedAt: lesson.learnedAt },
                }),
                signal: AbortSignal.timeout(10_000),
            });
        } catch (err) { console.warn(`[GatewayPmLessonStore] save failed: ${String(err)}`); }
    }

    async findByWorkspace(workspaceId: string, filter?: { docType?: PmDocTypeFilter; category?: PmLessonCategory; limit?: number }): Promise<PmLesson[]> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try {
            const res = await fetch(`${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`, { method: 'GET', headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` }, signal: AbortSignal.timeout(10_000) });
            if (!res.ok) return [];
            const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number; lastSeen?: string; metadata?: Record<string, unknown> }> };
            let lessons: PmLesson[] = (data.patterns ?? [])
                .filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith('pm:lesson:') && p.pattern.includes(`:${workspaceId}:`))
                .map((p): PmLesson | null => {
                    const meta = p.metadata as Record<string, unknown> | undefined;
                    const feedback = String(meta?.['feedback'] ?? p.summary ?? '').replace(/^\[[\w_]+\] /, '');
                    if (!feedback) return null;
                    const keyParts = (p.pattern ?? '').split(':');
                    return { id: String(meta?.['lessonId'] ?? keyParts[4] ?? Math.random().toString(36).slice(2)), tenantId: '', workspaceId, sourceTaskId: String(meta?.['sourceTaskId'] ?? ''), sourceProjectId: String(meta?.['sourceProjectId'] ?? ''), feedback, category: (meta?.['category'] ?? keyParts[2] ?? 'scope_management') as PmLessonCategory, applicableDocTypes: Array.isArray(meta?.['docTypes']) ? (meta['docTypes'] as PmDocTypeFilter[]) : ['any'], learnedAt: String(meta?.['learnedAt'] ?? p.lastSeen ?? new Date().toISOString()), correlationId: String(meta?.['correlationId'] ?? '') };
                }).filter((l): l is PmLesson => l !== null);
            if (filter?.category) lessons = lessons.filter((l) => l.category === filter.category);
            if (filter?.docType && filter.docType !== 'any') lessons = lessons.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
            lessons.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
            return filter?.limit ? lessons.slice(0, filter.limit) : lessons;
        } catch (err) { console.warn(`[GatewayPmLessonStore] findByWorkspace failed: ${String(err)}`); return []; }
    }
}

// ---------------------------------------------------------------------------
// Category classifier
// ---------------------------------------------------------------------------

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: PmLessonCategory }> = [
    { pattern: /\b(scope creep|scope change|out of scope|undefined scope|requirements keep changing|gold plating|feature bloat)\b/i, category: 'scope_management' },
    { pattern: /\b(estimate|story point|velocity|underestimated|overestimated|took longer|wrong estimate|missed deadline|late delivery)\b/i, category: 'estimation' },
    { pattern: /\b(risk|blocker|dependency|missed risk|didn.t anticipate|surprise|unexpected|issue log|not in risk register)\b/i, category: 'risk_identification' },
    { pattern: /\b(stakeholder|executive|sponsor|surprised|not informed|no status update|escalated|communication breakdown|didn.t know)\b/i, category: 'stakeholder_communication' },
    { pattern: /\b(forecast|burndown|burnup|predictable|on track|slipping|milestone missed|delivery date|sprint goal not met)\b/i, category: 'delivery_predictability' },
    { pattern: /\b(resource|capacity|over-allocated|under-utilised|wrong person|skill gap|staffing|team size|bottleneck|shared resource)\b/i, category: 'resource_allocation' },
    { pattern: /\b(retro|retrospective|recurring|keeps happening|same mistake|team friction|process|ceremony|standup|blocked repeatedly)\b/i, category: 'retrospective_insights' },
];

export function classifyPmFeedback(body: string): PmLessonCategory {
    for (const { pattern, category } of CATEGORY_PATTERNS) {
        if (pattern.test(body)) return category;
    }
    return 'scope_management';
}

export function inferPmApplicableDocTypes(category: PmLessonCategory, sourceDocType: PmDocTypeFilter): PmDocTypeFilter[] {
    if (category === 'stakeholder_communication') return ['status_report', 'project_charter'];
    if (category === 'risk_identification') return ['risk_register', 'project_charter'];
    if (category === 'retrospective_insights') return ['retrospective', 'any'];
    if (category === 'estimation' || category === 'delivery_predictability') return ['sprint_plan', 'milestone_plan', 'velocity_report' as PmDocTypeFilter];
    if (sourceDocType === 'any') return ['any'];
    return [sourceDocType];
}

export async function ingestPmFeedback(ctx: PmFeedbackContext, feedbackItems: PmFeedbackItem[], store: IPmLessonStore): Promise<PmLesson[]> {
    const lessons: PmLesson[] = [];
    for (const item of feedbackItems) {
        const body = item.body.trim();
        if (body.length < 10) continue;
        const category = classifyPmFeedback(body);
        const lesson: PmLesson = { id: randomUUID(), tenantId: ctx.tenantId, workspaceId: ctx.workspaceId, sourceTaskId: ctx.taskId, sourceProjectId: ctx.projectId, feedback: body, category, applicableDocTypes: inferPmApplicableDocTypes(category, ctx.documentType), learnedAt: item.createdAt ?? new Date().toISOString(), correlationId: ctx.correlationId };
        await store.save(lesson);
        lessons.push(lesson);
    }
    return lessons;
}

export function formatPmLessonsForPrompt(lessons: PmLesson[]): string {
    if (lessons.length === 0) return '';
    return `Workspace project management rules (from past delivery feedback):\n${lessons.slice(0, 12).map((l) => `- [${l.category}] ${l.feedback}`).join('\n')}`;
}

// ---------------------------------------------------------------------------
// Episodic hooks
// ---------------------------------------------------------------------------

function pmOutcomeTag(result: ProcessedTaskResult): 'success' | 'fail' {
    return result.status === 'success' ? 'success' : 'fail';
}

export function buildPmLessonEpisodicPattern(_task: TaskEnvelope, result: ProcessedTaskResult): string {
    const at = result.decision.actionType;
    const oc = pmOutcomeTag(result);
    const map: Record<string, string> = {
        workspace_pm_project_charter: 'pm:project_charter',
        workspace_pm_status_report: 'pm:status_report',
        workspace_pm_risk_register: 'pm:risk_register',
        workspace_pm_dependency_map: 'pm:dependency_map',
        workspace_pm_change_request: 'pm:change_request',
        workspace_pm_milestone_plan: 'pm:milestone_plan',
        workspace_pm_budget_forecast: 'pm:budget_forecast',
        workspace_pm_sprint_plan: 'pm:sprint_plan',
        workspace_pm_backlog_groom: 'pm:backlog_groom',
        workspace_pm_velocity_report: 'pm:velocity_report',
        workspace_pm_standup_summary: 'pm:standup_summary',
        workspace_pm_retrospective: 'pm:retrospective',
        workspace_pm_impediment_log: 'pm:impediment_log',
        workspace_pm_ceremony_agenda: 'pm:ceremony_agenda',
    };
    return `${map[at] ?? `pm:${at}`}:${oc}`;
}

export function buildPmLessonEpisodicSummary(task: TaskEnvelope, result: ProcessedTaskResult): string {
    const pattern = buildPmLessonEpisodicPattern(task, result);
    const at = result.decision.actionType;
    const oc = pmOutcomeTag(result);
    const title = (typeof task.payload['projectTitle'] === 'string' ? task.payload['projectTitle'] : typeof task.payload['title'] === 'string' ? task.payload['title'] : at).slice(0, 120);
    if (pattern.startsWith('pm:project_charter'))  return `Project charter ${oc}: ${title}`;
    if (pattern.startsWith('pm:status_report'))    return `Status report ${oc}: ${title}`;
    if (pattern.startsWith('pm:risk_register'))    return `Risk register ${oc}: ${title}`;
    if (pattern.startsWith('pm:sprint_plan'))      return `Sprint plan ${oc}: ${title}`;
    if (pattern.startsWith('pm:retrospective'))    return `Retrospective ${oc}: ${title}`;
    if (pattern.startsWith('pm:velocity_report'))  return `Velocity report ${oc}: ${title}`;
    if (pattern.startsWith('pm:milestone_plan'))   return `Milestone plan ${oc}: ${title}`;
    return `PM action "${at}" completed with status "${oc}": ${title}`;
}
