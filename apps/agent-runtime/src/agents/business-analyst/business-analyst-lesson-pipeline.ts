/**
 * Business Analyst — Lesson Pipeline
 *
 * Captures stakeholder feedback (rejection reasons, edit comments, review
 * notes) and converts them into structured BA lessons stored in long-term
 * memory.  Before every future draft, the relevant lessons are retrieved and
 * injected into the LLM prompt.
 *
 * Mirrors the pattern in code-review-learning.ts exactly:
 *   ingestBaFeedback()  → classify → store lesson
 *   getRelevantBaLessons()  → retrieve by workspace + doc type
 *   formatBaLessonsForPrompt()  → inject into system prompt
 *
 * Additionally provides:
 *   buildBaEpisodicPattern()   — domain-specific episodic key (mirrors
 *                                developer-episodic-hooks.ts)
 *   buildBaEpisodicSummary()   — richer episodic summary for BA actions
 *
 * Lesson categories:
 *   scope                — the document included things out of scope, or missed things in scope
 *   clarity              — language was ambiguous, vague, or open to interpretation
 *   completeness         — a required section or AC was missing
 *   stakeholder_alignment — the document did not reflect the stakeholder's actual needs
 *   technical_accuracy   — the document contained technically incorrect statements
 *   format               — the document used the wrong format, template, or structure
 *   risk_omission        — a risk, constraint, or assumption was not documented
 */

import { randomUUID } from 'node:crypto';
import type { TaskEnvelope, ProcessedTaskResult } from '../../execution-engine.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BaLessonCategory =
    | 'scope'
    | 'clarity'
    | 'completeness'
    | 'stakeholder_alignment'
    | 'technical_accuracy'
    | 'format'
    | 'risk_omission';

export type BaDocumentTypeFilter =
    | 'brd'
    | 'user_story'
    | 'acceptance_criteria'
    | 'gap_analysis'
    | 'process_map'
    | 'impact_analysis'
    | 'uat_checklist'
    | 'any';

/** A structured lesson extracted from stakeholder feedback. */
export interface BaLesson {
    id: string;
    tenantId: string;
    workspaceId: string;
    /** The task ID that produced the document that received feedback. */
    sourceTaskId: string;
    /** The document or approval ID that was rejected / edited. */
    sourceDocumentId: string;
    /** The raw feedback text from the stakeholder. */
    feedback: string;
    /** Structured category for targeted retrieval. */
    category: BaLessonCategory;
    /** Which document types this lesson applies to. */
    applicableDocTypes: BaDocumentTypeFilter[];
    /** Whether this lesson has been applied in a subsequent draft. */
    appliedToFutureTask: boolean;
    /** ISO-8601 timestamp when this lesson was created. */
    learnedAt: string;
    correlationId: string;
}

// ---------------------------------------------------------------------------
// Feedback context
// ---------------------------------------------------------------------------

export interface BaFeedbackContext {
    tenantId: string;
    workspaceId: string;
    taskId: string;
    documentId: string;
    documentType: BaDocumentTypeFilter;
    /** The action type that produced the document (e.g. 'workspace_ba_draft_brd'). */
    actionType: string;
    correlationId: string;
}

/** A single piece of stakeholder feedback (rejection reason, review comment, edit note). */
export interface BaFeedbackItem {
    body: string;
    /** Name / email of the stakeholder who provided the feedback. */
    author?: string;
    /** ISO-8601 timestamp of the feedback. */
    createdAt?: string;
}

// ---------------------------------------------------------------------------
// Lesson store interface
// ---------------------------------------------------------------------------

export interface IBaLessonStore {
    save(lesson: BaLesson): Promise<void>;
    findByWorkspace(
        workspaceId: string,
        filter?: {
            docType?: BaDocumentTypeFilter;
            category?: BaLessonCategory;
            limit?: number;
        },
    ): Promise<BaLesson[]>;
    markApplied(lessonId: string): Promise<void>;
}

export class InMemoryBaLessonStore implements IBaLessonStore {
    private readonly store = new Map<string, BaLesson>();

    async save(lesson: BaLesson): Promise<void> {
        this.store.set(lesson.id, { ...lesson });
    }

    async findByWorkspace(
        workspaceId: string,
        filter?: { docType?: BaDocumentTypeFilter; category?: BaLessonCategory; limit?: number },
    ): Promise<BaLesson[]> {
        let results = [...this.store.values()].filter((l) => l.workspaceId === workspaceId);

        if (filter?.category) {
            results = results.filter((l) => l.category === filter.category);
        }
        if (filter?.docType && filter.docType !== 'any') {
            results = results.filter(
                (l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'),
            );
        }

        // Sort by most recently learned first
        results.sort(
            (a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime(),
        );

        return filter?.limit ? results.slice(0, filter.limit) : results;
    }

    async markApplied(lessonId: string): Promise<void> {
        const lesson = this.store.get(lessonId);
        if (lesson) {
            this.store.set(lessonId, { ...lesson, appliedToFutureTask: true });
        }
    }
}

// ---------------------------------------------------------------------------
// Category classifier (heuristic — no LLM required)
// ---------------------------------------------------------------------------

const CATEGORY_PATTERNS: Array<{
    pattern: RegExp;
    category: BaLessonCategory;
    docTypes: BaDocumentTypeFilter[];
}> = [
    {
        pattern: /\b(out of scope|in scope|scope creep|not included|should not include|beyond the scope)\b/i,
        category: 'scope',
        docTypes: ['brd', 'user_story', 'any'],
    },
    {
        pattern: /\b(vague|ambiguous|unclear|open to interpretation|not specific|too generic|what does .+ mean)\b/i,
        category: 'clarity',
        docTypes: ['any'],
    },
    {
        pattern: /\b(missing|not included|forgot|left out|omitted|section is empty|no .+ criteria|lacks? .+)\b/i,
        category: 'completeness',
        docTypes: ['any'],
    },
    {
        pattern: /\b(not what we discussed|different from what|misunderstood|doesn.t reflect|wrong requirement|that.s not what)\b/i,
        category: 'stakeholder_alignment',
        docTypes: ['any'],
    },
    {
        pattern: /\b(technically incorrect|wrong|can.t do that|not how .+ works|incorrect assumption|that.s impossible)\b/i,
        category: 'technical_accuracy',
        docTypes: ['brd', 'gap_analysis', 'impact_analysis', 'any'],
    },
    {
        pattern: /\b(format|template|structure|heading|layout|section order|should use|wrong format|style guide)\b/i,
        category: 'format',
        docTypes: ['any'],
    },
    {
        pattern: /\b(risk|constraint|assumption|dependency|not documented|didn.t mention|overlooked|forgot to include the risk)\b/i,
        category: 'risk_omission',
        docTypes: ['brd', 'impact_analysis', 'gap_analysis', 'any'],
    },
];

/**
 * Classify feedback text into a BaLessonCategory using heuristic patterns.
 * Returns 'clarity' as the safe default (most common root cause).
 */
export function classifyBaFeedback(body: string): BaLessonCategory {
    for (const { pattern, category } of CATEGORY_PATTERNS) {
        if (pattern.test(body)) return category;
    }
    return 'clarity';
}

/**
 * Determine which document types a lesson applies to based on the category
 * and the source document type.
 */
export function inferApplicableDocTypes(
    category: BaLessonCategory,
    sourceDocType: BaDocumentTypeFilter,
): BaDocumentTypeFilter[] {
    // Some lessons apply broadly; others are document-specific
    const broadCategories: BaLessonCategory[] = ['scope', 'clarity', 'stakeholder_alignment'];
    if (broadCategories.includes(category)) {
        return ['any'];
    }
    // Format lessons apply to the same doc type
    if (category === 'format') {
        return [sourceDocType];
    }
    // Completeness and risk lessons apply to the same type plus BRD (the master doc)
    if (sourceDocType === 'brd') {
        return ['brd'];
    }
    return [sourceDocType, 'brd'];
}

// ---------------------------------------------------------------------------
// Core pipeline functions
// ---------------------------------------------------------------------------

/**
 * Ingest stakeholder feedback items and convert them into structured BaLessons.
 *
 * Called when:
 *   - A stakeholder rejects a BA document (with rejection reason)
 *   - A stakeholder extensively edits a draft (with comment trail)
 *   - A review pass completes with explicit notes
 *
 * Returns the lessons created.
 */
export async function ingestBaFeedback(
    ctx: BaFeedbackContext,
    feedbackItems: BaFeedbackItem[],
    store: IBaLessonStore,
): Promise<BaLesson[]> {
    const lessons: BaLesson[] = [];

    for (const item of feedbackItems) {
        const body = item.body.trim();
        if (body.length < 10) continue; // skip trivially short feedback

        const category = classifyBaFeedback(body);
        const applicableDocTypes = inferApplicableDocTypes(category, ctx.documentType);

        const lesson: BaLesson = {
            id: randomUUID(),
            tenantId: ctx.tenantId,
            workspaceId: ctx.workspaceId,
            sourceTaskId: ctx.taskId,
            sourceDocumentId: ctx.documentId,
            feedback: body,
            category,
            applicableDocTypes,
            appliedToFutureTask: false,
            learnedAt: item.createdAt ?? new Date().toISOString(),
            correlationId: ctx.correlationId,
        };

        await store.save(lesson);
        lessons.push(lesson);
    }

    return lessons;
}

/**
 * Retrieve lessons relevant to the next draft.
 *
 * Called before the BA agent writes a new document.  Returns lessons ordered
 * by recency, capped at 15 to avoid bloating the prompt.
 */
export async function getRelevantBaLessons(
    workspaceId: string,
    docType: BaDocumentTypeFilter,
    store: IBaLessonStore,
    category?: BaLessonCategory,
): Promise<BaLesson[]> {
    return store.findByWorkspace(workspaceId, { docType, category, limit: 15 });
}

/**
 * Format retrieved lessons into a prompt injection block.
 *
 * Output example:
 *   Workspace BA rules (from past stakeholder feedback):
 *   - [scope] Do not include DevOps infrastructure requirements in the BRD — those belong in a technical spec
 *   - [clarity] Define "real-time" explicitly — stakeholders disagree on whether it means < 1s or < 5min
 */
export function formatBaLessonsForPrompt(lessons: BaLesson[]): string {
    if (lessons.length === 0) return '';

    const lines = lessons
        .slice(0, 12) // cap prompt injection to keep context manageable
        .map((l) => `- [${l.category}] ${l.feedback}`);

    return `Workspace BA rules (from past stakeholder feedback):\n${lines.join('\n')}`;
}

/**
 * Persist a BA lesson as a long-term memory pattern via the gateway.
 *
 * Pattern key: 'ba:lesson:<category>:<workspaceId>'
 * This makes lessons discoverable by the RAG retriever via
 * GET /v1/workspaces/:id/memory/patterns.
 */
export async function persistLessonToMemory(
    lesson: BaLesson,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<void> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        await fetch(`${base}/v1/memory/patterns`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${serviceToken}`,
            },
            body: JSON.stringify({
                tenantId: lesson.tenantId,
                workspaceId: lesson.workspaceId,
                pattern: `ba:lesson:${lesson.category}:${lesson.workspaceId}`,
                summary: `[${lesson.category}] ${lesson.feedback.slice(0, 200)}`,
                confidence: 0.7,
                observedCount: 1,
                lastSeen: lesson.learnedAt,
            }),
            signal: AbortSignal.timeout(10_000),
        });
    } catch (err) {
        console.warn(`[ba-lesson-pipeline] Failed to persist lesson ${lesson.id}: ${String(err)}`);
    }
}

// ---------------------------------------------------------------------------
// Episodic hooks — mirrors developer-episodic-hooks.ts exactly
// ---------------------------------------------------------------------------

function baOutcomeTag(result: ProcessedTaskResult): 'success' | 'fail' {
    return result.status === 'success' ? 'success' : 'fail';
}

/**
 * Derives a BA-specific episodic pattern key.
 *
 * Examples:
 *   "ba:draft_brd:success"
 *   "ba:draft_user_story:fail"
 *   "ba:finalize_brd:approved"
 *   "ba:elicit_requirements:success"
 *   "ba:gap_analysis:success"
 */
export function buildBaEpisodicPattern(
    _task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const at = result.decision.actionType;
    const oc = baOutcomeTag(result);

    if (at === 'workspace_ba_elicit_requirements')        return `ba:elicit_requirements:${oc}`;
    if (at === 'workspace_ba_draft_user_story')           return `ba:draft_user_story:${oc}`;
    if (at === 'workspace_ba_draft_brd')                  return `ba:draft_brd:${oc}`;
    if (at === 'workspace_ba_finalize_brd') {
        // Capture the approval outcome if present in the payload
        const decision = result.executionPayload['approval_decision'];
        if (decision === 'approved') return 'ba:finalize_brd:approved';
        if (decision === 'rejected') return 'ba:finalize_brd:rejected';
        return `ba:finalize_brd:${oc}`;
    }
    if (at === 'workspace_ba_finalize_acceptance_criteria') {
        const decision = result.executionPayload['approval_decision'];
        if (decision === 'approved') return 'ba:finalize_ac:approved';
        if (decision === 'rejected') return 'ba:finalize_ac:rejected';
        return `ba:finalize_ac:${oc}`;
    }
    if (at === 'workspace_ba_process_map')                return `ba:process_map:${oc}`;
    if (at === 'workspace_ba_gap_analysis')               return `ba:gap_analysis:${oc}`;
    if (at === 'workspace_ba_impact_analysis')            return `ba:impact_analysis:${oc}`;
    if (at === 'workspace_ba_solution_eval')              return `ba:solution_eval:${oc}`;
    if (at === 'workspace_ba_uat_checklist')              return `ba:uat_checklist:${oc}`;
    if (at === 'workspace_ba_stakeholder_update')         return `ba:stakeholder_update:${oc}`;
    if (at === 'create_task')                             return `ba:create_task:${oc}`;
    if (at === 'update_task_status')                      return `ba:update_task:${oc}`;
    if (at === 'add_comment')                             return `ba:add_comment:${oc}`;

    // Fallback — namespaced under "ba:" for easy querying
    return `ba:${at}:${oc}`;
}

/**
 * Builds a richer episodic summary for the BA role.
 * Used as the `summary` field in AgentLongTermMemory writes.
 */
export function buildBaEpisodicSummary(
    task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const pattern = buildBaEpisodicPattern(task, result);
    const at = result.decision.actionType;
    const oc = baOutcomeTag(result);

    const title = typeof task.payload['title'] === 'string' ? task.payload['title'] : '';
    const description = typeof task.payload['description'] === 'string' ? task.payload['description'] : '';
    const taskLabel = (title || description || at).slice(0, 120);

    if (pattern === 'ba:draft_brd:success')            return `BRD drafted successfully: ${taskLabel}`;
    if (pattern === 'ba:draft_brd:fail')               return `BRD draft failed: ${taskLabel}`;
    if (pattern === 'ba:finalize_brd:approved')        return `BRD finalised and approved: ${taskLabel}`;
    if (pattern === 'ba:finalize_brd:rejected') {
        const reason = typeof result.executionPayload['rejection_reason'] === 'string'
            ? ` — Reason: ${result.executionPayload['rejection_reason']}`
            : '';
        return `BRD finalisation rejected${reason}: ${taskLabel}`;
    }
    if (pattern.startsWith('ba:finalize_brd'))         return `BRD finalisation ${oc}: ${taskLabel}`;

    if (pattern === 'ba:draft_user_story:success')     return `User story drafted: ${taskLabel}`;
    if (pattern === 'ba:draft_user_story:fail')        return `User story draft failed: ${taskLabel}`;

    if (pattern === 'ba:finalize_ac:approved')         return `Acceptance criteria finalised and approved: ${taskLabel}`;
    if (pattern === 'ba:finalize_ac:rejected') {
        const reason = typeof result.executionPayload['rejection_reason'] === 'string'
            ? ` — Reason: ${result.executionPayload['rejection_reason']}`
            : '';
        return `Acceptance criteria rejected${reason}: ${taskLabel}`;
    }
    if (pattern.startsWith('ba:finalize_ac'))          return `Acceptance criteria finalisation ${oc}: ${taskLabel}`;

    if (pattern.startsWith('ba:elicit_requirements')) {
        const count = result.executionPayload['requirement_count'];
        const countStr = typeof count === 'number' ? ` — ${count} requirements elicited` : '';
        return `Requirements elicitation ${oc}${countStr}: ${taskLabel}`;
    }

    if (pattern.startsWith('ba:gap_analysis'))         return `Gap analysis ${oc}: ${taskLabel}`;
    if (pattern.startsWith('ba:impact_analysis'))      return `Impact analysis ${oc}: ${taskLabel}`;
    if (pattern.startsWith('ba:solution_eval'))        return `Solution evaluation ${oc}: ${taskLabel}`;
    if (pattern.startsWith('ba:process_map'))          return `Process map ${oc}: ${taskLabel}`;
    if (pattern.startsWith('ba:uat_checklist'))        return `UAT checklist ${oc}: ${taskLabel}`;
    if (pattern.startsWith('ba:stakeholder_update'))   return `Stakeholder update ${oc}: ${taskLabel}`;
    if (pattern.startsWith('ba:create_task'))          return `Task created ${oc}: ${taskLabel}`;
    if (pattern.startsWith('ba:update_task'))          return `Task status updated ${oc}: ${taskLabel}`;

    // Fallback
    return `BA action "${at}" completed with status "${oc}": ${taskLabel}`;
}
