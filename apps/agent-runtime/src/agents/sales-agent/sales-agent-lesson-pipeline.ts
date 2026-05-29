/**
 * Sales Agent — Lesson Pipeline
 *
 * Captures deal outcome feedback (lost reasons, rejection notes, coaching
 * comments) and converts them into structured sales lessons stored in
 * long-term memory. Before every generative action the relevant lessons are
 * retrieved and injected into the LLM prompt.
 *
 * Lesson categories:
 *   email_personalization   — outreach was too generic or missed prospect context
 *   objection_handling      — objection was not anticipated or rebutted poorly
 *   proposal_quality        — proposal lacked value prop, ROI, or was misaligned
 *   timing                  — follow-up cadence was too aggressive or too sparse
 *   closing_technique       — closing approach was wrong for the stage or persona
 *   follow_up               — follow-up content was irrelevant or poorly timed
 *   discovery               — discovery call missed key pain points or budget signals
 */

import { randomUUID } from 'node:crypto';
import type { TaskEnvelope, ProcessedTaskResult } from '../../execution-engine.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SalesLessonCategory =
    | 'email_personalization'
    | 'objection_handling'
    | 'proposal_quality'
    | 'timing'
    | 'closing_technique'
    | 'follow_up'
    | 'discovery';

export type SalesDocTypeFilter =
    | 'outreach_email'
    | 'follow_up_sequence'
    | 'proposal'
    | 'contract'
    | 'demo_script'
    | 'objection_rebuttal'
    | 'qbr'
    | 'negotiation_playbook'
    | 'any';

export interface SalesLesson {
    id: string;
    tenantId: string;
    workspaceId: string;
    sourceTaskId: string;
    sourceDealId: string;
    feedback: string;
    category: SalesLessonCategory;
    applicableDocTypes: SalesDocTypeFilter[];
    learnedAt: string;
    correlationId: string;
}

export interface SalesFeedbackContext {
    tenantId: string;
    workspaceId: string;
    taskId: string;
    dealId: string;
    documentType: SalesDocTypeFilter;
    actionType: string;
    correlationId: string;
}

export interface SalesFeedbackItem {
    body: string;
    author?: string;
    createdAt?: string;
}

// ---------------------------------------------------------------------------
// Lesson store
// ---------------------------------------------------------------------------

export interface ISalesLessonStore {
    save(lesson: SalesLesson): Promise<void>;
    findByWorkspace(
        workspaceId: string,
        filter?: { docType?: SalesDocTypeFilter; category?: SalesLessonCategory; limit?: number },
    ): Promise<SalesLesson[]>;
}

export class InMemorySalesLessonStore implements ISalesLessonStore {
    private readonly store = new Map<string, SalesLesson>();

    async save(lesson: SalesLesson): Promise<void> {
        this.store.set(lesson.id, { ...lesson });
    }

    async findByWorkspace(
        workspaceId: string,
        filter?: { docType?: SalesDocTypeFilter; category?: SalesLessonCategory; limit?: number },
    ): Promise<SalesLesson[]> {
        let results = [...this.store.values()].filter((l) => l.workspaceId === workspaceId);
        if (filter?.category) results = results.filter((l) => l.category === filter.category);
        if (filter?.docType && filter.docType !== 'any') {
            results = results.filter(
                (l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'),
            );
        }
        results.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
        return filter?.limit ? results.slice(0, filter.limit) : results;
    }
}

export class GatewaySalesLessonStore implements ISalesLessonStore {
    constructor(
        private readonly gatewayBaseUrl: string,
        private readonly serviceToken: string,
    ) {}

    async save(lesson: SalesLesson): Promise<void> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try {
            await fetch(`${base}/v1/memory/patterns`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    Authorization: `Bearer ${this.serviceToken}`,
                },
                body: JSON.stringify({
                    tenantId: lesson.tenantId,
                    workspaceId: lesson.workspaceId,
                    pattern: `sales:lesson:${lesson.category}:${lesson.workspaceId}:${lesson.id}`,
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
                        sourceDealId: lesson.sourceDealId,
                        correlationId: lesson.correlationId,
                        learnedAt: lesson.learnedAt,
                    },
                }),
                signal: AbortSignal.timeout(10_000),
            });
        } catch (err) {
            console.warn(`[GatewaySalesLessonStore] save failed: ${String(err)}`);
        }
    }

    async findByWorkspace(
        workspaceId: string,
        filter?: { docType?: SalesDocTypeFilter; category?: SalesLessonCategory; limit?: number },
    ): Promise<SalesLesson[]> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try {
            const res = await fetch(
                `${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`,
                {
                    method: 'GET',
                    headers: {
                        'content-type': 'application/json',
                        Authorization: `Bearer ${this.serviceToken}`,
                    },
                    signal: AbortSignal.timeout(10_000),
                },
            );
            if (!res.ok) return [];
            const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number; lastSeen?: string; metadata?: Record<string, unknown> }> };
            const patterns = (data.patterns ?? []).filter(
                (p) => typeof p.pattern === 'string' && p.pattern.startsWith('sales:lesson:') && p.pattern.includes(`:${workspaceId}:`),
            );
            let lessons: SalesLesson[] = patterns.map((p): SalesLesson | null => {
                const meta = p.metadata as Record<string, unknown> | undefined;
                if (meta?.lessonId) {
                    return {
                        id: String(meta['lessonId']),
                        tenantId: '',
                        workspaceId,
                        sourceTaskId: String(meta['sourceTaskId'] ?? ''),
                        sourceDealId: String(meta['sourceDealId'] ?? ''),
                        feedback: String(meta['feedback'] ?? p.summary ?? '').replace(/^\[[\w_]+\] /, ''),
                        category: (meta['category'] as SalesLessonCategory) ?? 'discovery',
                        applicableDocTypes: Array.isArray(meta['docTypes']) ? (meta['docTypes'] as SalesDocTypeFilter[]) : ['any'],
                        learnedAt: String(meta['learnedAt'] ?? p.lastSeen ?? new Date().toISOString()),
                        correlationId: String(meta['correlationId'] ?? ''),
                    };
                }
                const keyParts = (p.pattern ?? '').split(':');
                const category = (keyParts[2] as SalesLessonCategory) ?? 'discovery';
                const feedback = (p.summary ?? '').replace(/^\[[\w_]+\] /, '');
                if (!feedback) return null;
                return {
                    id: keyParts[4] ?? Math.random().toString(36).slice(2),
                    tenantId: '',
                    workspaceId,
                    sourceTaskId: '',
                    sourceDealId: '',
                    feedback,
                    category,
                    applicableDocTypes: ['any'],
                    learnedAt: p.lastSeen ?? new Date().toISOString(),
                    correlationId: '',
                };
            }).filter((l): l is SalesLesson => l !== null);

            if (filter?.category) lessons = lessons.filter((l) => l.category === filter.category);
            if (filter?.docType && filter.docType !== 'any') {
                lessons = lessons.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
            }
            lessons.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
            return filter?.limit ? lessons.slice(0, filter.limit) : lessons;
        } catch (err) {
            console.warn(`[GatewaySalesLessonStore] findByWorkspace failed: ${String(err)}`);
            return [];
        }
    }
}

// ---------------------------------------------------------------------------
// Category classifier
// ---------------------------------------------------------------------------

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: SalesLessonCategory; docTypes: SalesDocTypeFilter[] }> = [
    {
        pattern: /\b(too generic|not personalised|no personaliz|didn.t mention|copy.paste|template feel|no research|felt generic)\b/i,
        category: 'email_personalization',
        docTypes: ['outreach_email', 'follow_up_sequence', 'any'],
    },
    {
        pattern: /\b(objection|pushback|concern|too expensive|price|budget|competitor|why not|already have|not a priority)\b/i,
        category: 'objection_handling',
        docTypes: ['objection_rebuttal', 'negotiation_playbook', 'any'],
    },
    {
        pattern: /\b(proposal|ROI|value prop|business case|didn.t show value|missing the why|no numbers|weak proposal)\b/i,
        category: 'proposal_quality',
        docTypes: ['proposal', 'qbr', 'any'],
    },
    {
        pattern: /\b(too soon|too late|too many emails|too aggressive|spam|cadence|follow.up timing|too frequent)\b/i,
        category: 'timing',
        docTypes: ['follow_up_sequence', 'outreach_email', 'any'],
    },
    {
        pattern: /\b(close|ask|trial close|next step|lost the deal at close|didn.t ask|no commitment)\b/i,
        category: 'closing_technique',
        docTypes: ['contract', 'negotiation_playbook', 'any'],
    },
    {
        pattern: /\b(follow up|follow-up|not following up|no follow|dropped the ball|ghosted|no response handling)\b/i,
        category: 'follow_up',
        docTypes: ['follow_up_sequence', 'any'],
    },
    {
        pattern: /\b(discovery|pain point|need|requirement|qualified|budget|authority|timeline|didn.t qualify|wrong fit)\b/i,
        category: 'discovery',
        docTypes: ['outreach_email', 'demo_script', 'any'],
    },
];

export function classifySalesFeedback(body: string): SalesLessonCategory {
    for (const { pattern, category } of CATEGORY_PATTERNS) {
        if (pattern.test(body)) return category;
    }
    return 'discovery';
}

export function inferSalesApplicableDocTypes(
    category: SalesLessonCategory,
    sourceDocType: SalesDocTypeFilter,
): SalesDocTypeFilter[] {
    const broadCategories: SalesLessonCategory[] = ['timing', 'discovery'];
    if (broadCategories.includes(category)) return ['any'];
    if (category === 'email_personalization') return ['outreach_email', 'follow_up_sequence'];
    if (category === 'closing_technique') return ['contract', 'negotiation_playbook'];
    if (sourceDocType === 'any') return ['any'];
    return [sourceDocType];
}

// ---------------------------------------------------------------------------
// Core pipeline
// ---------------------------------------------------------------------------

export async function ingestSalesFeedback(
    ctx: SalesFeedbackContext,
    feedbackItems: SalesFeedbackItem[],
    store: ISalesLessonStore,
): Promise<SalesLesson[]> {
    const lessons: SalesLesson[] = [];
    for (const item of feedbackItems) {
        const body = item.body.trim();
        if (body.length < 10) continue;
        const category = classifySalesFeedback(body);
        const applicableDocTypes = inferSalesApplicableDocTypes(category, ctx.documentType);
        const lesson: SalesLesson = {
            id: randomUUID(),
            tenantId: ctx.tenantId,
            workspaceId: ctx.workspaceId,
            sourceTaskId: ctx.taskId,
            sourceDealId: ctx.dealId,
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

export function formatSalesLessonsForPrompt(lessons: SalesLesson[]): string {
    if (lessons.length === 0) return '';
    const lines = lessons
        .slice(0, 12)
        .map((l) => `- [${l.category}] ${l.feedback}`);
    return `Workspace sales rules (from past deal feedback):\n${lines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// Episodic hooks
// ---------------------------------------------------------------------------

function salesOutcomeTag(result: ProcessedTaskResult): 'success' | 'fail' {
    return result.status === 'success' ? 'success' : 'fail';
}

export function buildSalesEpisodicPattern(
    _task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const at = result.decision.actionType;
    const oc = salesOutcomeTag(result);

    if (at === 'workspace_prospect_research')    return `sales:prospect_research:${oc}`;
    if (at === 'workspace_icp_score')            return `sales:icp_score:${oc}`;
    if (at === 'workspace_email_personalize')    return `sales:email_personalize:${oc}`;
    if (at === 'workspace_outreach_send')        return `sales:outreach_send:${oc}`;
    if (at === 'workspace_sequence_create')      return `sales:sequence_create:${oc}`;
    if (at === 'workspace_reply_classify')       return `sales:reply_classify:${oc}`;
    if (at === 'workspace_pre_meeting_research') return `sales:pre_meeting_research:${oc}`;
    if (at === 'workspace_proposal_generate')    return `sales:proposal_generate:${oc}`;
    if (at === 'workspace_objection_rebuttal')   return `sales:objection_rebuttal:${oc}`;
    if (at === 'workspace_negotiation_offer')    return `sales:negotiation_offer:${oc}`;
    if (at === 'workspace_contract_generate')    return `sales:contract_generate:${oc}`;
    if (at === 'workspace_deal_close') {
        const outcome = result.executionPayload['deal_outcome'];
        if (outcome === 'won') return 'sales:deal_close:won';
        if (outcome === 'lost') return 'sales:deal_close:lost';
        return `sales:deal_close:${oc}`;
    }
    if (at === 'workspace_qbr_prepare')         return `sales:qbr_prepare:${oc}`;
    if (at === 'workspace_upsell')              return `sales:upsell:${oc}`;
    if (at === 'workspace_nps_send')            return `sales:nps_send:${oc}`;
    if (at === 'workspace_demo_script_generate') return `sales:demo_script_generate:${oc}`;
    if (at === 'workspace_demo_present')        return `sales:demo_present:${oc}`;
    if (at === 'workspace_market_research')     return `sales:market_research:${oc}`;
    if (at === 'workspace_cold_call')           return `sales:cold_call:${oc}`;
    if (at === 'workspace_linkedin_outreach')   return `sales:linkedin_outreach:${oc}`;

    return `sales:${at}:${oc}`;
}

export function buildSalesEpisodicSummary(
    task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const pattern = buildSalesEpisodicPattern(task, result);
    const at = result.decision.actionType;
    const oc = salesOutcomeTag(result);

    const title = typeof task.payload['prospectName'] === 'string'
        ? task.payload['prospectName']
        : typeof task.payload['title'] === 'string'
            ? task.payload['title']
            : at;
    const taskLabel = title.slice(0, 120);

    if (pattern === 'sales:deal_close:won')  return `Deal won: ${taskLabel}`;
    if (pattern === 'sales:deal_close:lost') {
        const reason = typeof result.executionPayload['lost_reason'] === 'string'
            ? ` — Reason: ${result.executionPayload['lost_reason']}`
            : '';
        return `Deal lost${reason}: ${taskLabel}`;
    }
    if (pattern.startsWith('sales:proposal_generate'))  return `Proposal generated ${oc}: ${taskLabel}`;
    if (pattern.startsWith('sales:objection_rebuttal')) return `Objection rebuttal ${oc}: ${taskLabel}`;
    if (pattern.startsWith('sales:email_personalize'))  return `Email personalised ${oc}: ${taskLabel}`;
    if (pattern.startsWith('sales:outreach_send'))      return `Outreach sent ${oc}: ${taskLabel}`;
    if (pattern.startsWith('sales:negotiation_offer'))  return `Negotiation offer handled ${oc}: ${taskLabel}`;
    if (pattern.startsWith('sales:qbr_prepare'))        return `QBR prepared ${oc}: ${taskLabel}`;
    if (pattern.startsWith('sales:upsell'))             return `Upsell attempt ${oc}: ${taskLabel}`;

    return `Sales action "${at}" completed with status "${oc}": ${taskLabel}`;
}
