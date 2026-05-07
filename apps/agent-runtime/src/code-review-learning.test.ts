/**
 * Feature #7 — Code Review Learning tests
 * Frozen 2026-05-07
 */

import { describe, it, expect } from 'vitest';
import {
    classifyFeedback,
    ingestReviewFeedback,
    getRelevantLessons,
    formatLessonsForPrompt,
    InMemoryLessonStore,
    type IngestContext,
    type GitHubReviewComment,
} from './code-review-learning.js';

const ctx: IngestContext = {
    tenantId: 't1',
    workspaceId: 'w1',
    taskId: 'task-99',
    prUrl: 'https://github.com/org/repo/pull/42',
    correlationId: 'corr-1',
};

const comment = (body: string, id = 1): GitHubReviewComment => ({
    id,
    body,
    user: { login: 'reviewer' },
    created_at: new Date().toISOString(),
    html_url: 'https://github.com/org/repo/pull/42#discussion_r1',
});

describe('classifyFeedback', () => {
    it('classifies style feedback', () => {
        expect(classifyFeedback('please use const instead of var')).toBe('style');
    });
    it('classifies security feedback', () => {
        expect(classifyFeedback('validate inbound payload to prevent sql injection')).toBe('security');
    });
    it('classifies testing feedback', () => {
        expect(classifyFeedback('add a test for this edge case')).toBe('testing');
    });
    it('defaults to style for unknown', () => {
        expect(classifyFeedback('please fix this')).toBe('style');
    });
});

describe('ingestReviewFeedback', () => {
    it('creates lessons from review comments', async () => {
        const store = new InMemoryLessonStore();
        const lessons = await ingestReviewFeedback(
            ctx,
            [comment('use const instead of var', 1), comment('add error handling here', 2)],
            store,
        );
        expect(lessons).toHaveLength(2);
        expect(lessons[0]!.sourcePrUrl).toBe(ctx.prUrl);
        expect(lessons[0]!.workspaceId).toBe('w1');
        expect(lessons[0]!.appliedToFutureTask).toBe(false);
    });

    it('skips trivially short comments', async () => {
        const store = new InMemoryLessonStore();
        const lessons = await ingestReviewFeedback(ctx, [comment('ok', 1), comment('nit', 2)], store);
        expect(lessons).toHaveLength(0);
    });
});

describe('getRelevantLessons', () => {
    it('returns lessons for workspace', async () => {
        const store = new InMemoryLessonStore();
        await ingestReviewFeedback(
            ctx,
            [comment('always use const not var', 1)],
            store,
        );
        const lessons = await getRelevantLessons('w1', '.ts', store);
        expect(lessons).toHaveLength(1);
    });

    it('returns empty for different workspace', async () => {
        const store = new InMemoryLessonStore();
        await ingestReviewFeedback(ctx, [comment('add validation here please', 1)], store);
        const lessons = await getRelevantLessons('other-workspace', '.ts', store);
        expect(lessons).toHaveLength(0);
    });
});

describe('formatLessonsForPrompt', () => {
    it('returns empty string when no lessons', () => {
        expect(formatLessonsForPrompt([])).toBe('');
    });

    it('formats lessons as bullet list', async () => {
        const store = new InMemoryLessonStore();
        const lessons = await ingestReviewFeedback(
            ctx,
            [comment('use const instead of var', 1)],
            store,
        );
        const prompt = formatLessonsForPrompt(lessons);
        expect(prompt).toContain('Workspace coding rules');
        expect(prompt).toContain('[style]');
        expect(prompt).toContain('use const instead of var');
    });
});
