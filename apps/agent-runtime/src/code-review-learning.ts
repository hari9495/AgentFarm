/**
 * Feature #7 — Code Review Learning Service
 * Frozen 2026-05-07
 *
 * Ingests PR review comments via GitHub webhook, stores them as ReviewLessons
 * in long-term memory, and injects relevant lessons into the LLM prompt before
 * the agent writes new code.
 *
 * Loop:
 *   Agent creates PR
 *   → reviewer leaves comments
 *   → GitHub webhook fires → ingestReviewFeedback()
 *   → lessons stored in LongTermMemory (via memory-service)
 *   → next task: getRelevantLessons() called before LLM prompt
 *   → lessons injected as: "Remember: this workspace prefers const over var"
 *   → agent writes better code from day one
 */

import { randomUUID } from 'node:crypto';
import type { ReviewLesson, ReviewLessonCategory } from '@agentfarm/shared-types';
import { CONTRACT_VERSIONS } from '@agentfarm/shared-types';

export type { ReviewLesson, ReviewLessonCategory };

// ── GitHub review comment (minimal surface; add fields as needed) ─────────────

export interface GitHubReviewComment {
    id: number;
    body: string;
    path?: string;
    line?: number;
    user: { login: string };
    created_at: string;
    html_url: string;
}

// ── Lesson store interface ────────────────────────────────────────────────────

export interface ILessonStore {
    save(lesson: ReviewLesson): Promise<void>;
    findByWorkspace(
        workspaceId: string,
        filter?: { fileType?: string; category?: ReviewLessonCategory },
    ): Promise<ReviewLesson[]>;
    markApplied(lessonId: string): Promise<void>;
}

export class InMemoryLessonStore implements ILessonStore {
    private readonly store = new Map<string, ReviewLesson>();

    async save(lesson: ReviewLesson): Promise<void> {
        this.store.set(lesson.id, { ...lesson });
    }

    async findByWorkspace(
        workspaceId: string,
        filter?: { fileType?: string; category?: ReviewLessonCategory },
    ): Promise<ReviewLesson[]> {
        let results = [...this.store.values()].filter(
            (l) => l.workspaceId === workspaceId,
        );
        if (filter?.category) {
            results = results.filter((l) => l.category === filter.category);
        }
        return results;
    }

    async markApplied(lessonId: string): Promise<void> {
        const lesson = this.store.get(lessonId);
        if (lesson) {
            this.store.set(lessonId, { ...lesson, appliedToFutureTask: true });
        }
    }
}

// ── Category classifier ───────────────────────────────────────────────────────
// Lightweight heuristic classifier — no LLM required for basic categorisation.

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: ReviewLessonCategory }> = [
    { pattern: /\b(const|var|let|semicolon|indent|format|style|naming|camelCase|snake_case)\b/i, category: 'style' },
    { pattern: /\b(sql injection|xss|auth|sanitize|validate|escape|csp|token|secret|password|encrypt)\b/i, category: 'security' },
    { pattern: /\b(performance|slow|memory leak|O\(n\)|cache|memoize|debounce|throttle)\b/i, category: 'performance' },
    { pattern: /\b(architecture|coupling|dependency|interface|abstraction|pattern|design|solid)\b/i, category: 'architecture' },
    { pattern: /\b(test|spec|coverage|mock|stub|assert|expect|vitest|jest)\b/i, category: 'testing' },
    { pattern: /\b(name|rename|variable|function|class|method|identifier)\b/i, category: 'naming' },
];

export function classifyFeedback(body: string): ReviewLessonCategory {
    for (const { pattern, category } of CATEGORY_PATTERNS) {
        if (pattern.test(body)) return category;
    }
    return 'style'; // default
}

// ── Core service functions ────────────────────────────────────────────────────

export interface IngestContext {
    tenantId: string;
    workspaceId: string;
    taskId: string;
    prUrl: string;
    correlationId: string;
}

/**
 * Called by the GitHub webhook handler when PR review comments arrive.
 * Converts each non-trivial comment into a ReviewLesson and persists it.
 */
export async function ingestReviewFeedback(
    ctx: IngestContext,
    comments: GitHubReviewComment[],
    store: ILessonStore,
): Promise<ReviewLesson[]> {
    const lessons: ReviewLesson[] = [];

    for (const comment of comments) {
        const body = comment.body.trim();
        if (body.length < 10) continue; // skip trivial/blank comments

        const lesson: ReviewLesson = {
            id: randomUUID(),
            contractVersion: CONTRACT_VERSIONS.REVIEW_LESSON,
            tenantId: ctx.tenantId,
            workspaceId: ctx.workspaceId,
            sourceTaskId: ctx.taskId,
            sourcePrUrl: ctx.prUrl,
            feedback: body,
            category: classifyFeedback(body),
            appliedToFutureTask: false,
            learnedAt: new Date().toISOString(),
            correlationId: ctx.correlationId,
        };

        await store.save(lesson);
        lessons.push(lesson);
    }

    return lessons;
}

/**
 * Called before the agent writes new code.
 * Returns lessons to inject into the LLM prompt as workspace-level coding rules.
 */
export async function getRelevantLessons(
    workspaceId: string,
    fileType: string,
    store: ILessonStore,
    category?: ReviewLessonCategory,
): Promise<ReviewLesson[]> {
    return store.findByWorkspace(workspaceId, { fileType, category });
}

/**
 * Formats lessons as a prompt injection block.
 * Example output:
 *   "Workspace coding rules (from past PR reviews):\n
 *    - [style] don't use var, use const\n
 *    - [security] always validate inbound payloads at service boundaries"
 */
export function formatLessonsForPrompt(lessons: ReviewLesson[]): string {
    if (lessons.length === 0) return '';
    const lines = lessons
        .slice(0, 10) // cap injection length
        .map((l) => `- [${l.category}] ${l.feedback}`);
    return `Workspace coding rules (from past PR reviews):\n${lines.join('\n')}`;
}
