/**
 * Feature #7 - Code Review Learning tests
 * Frozen 2026-05-07
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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
        assert.equal(classifyFeedback('please use const instead of var'), 'style');
    });
    it('classifies security feedback', () => {
        assert.equal(classifyFeedback('validate inbound payload to prevent sql injection'), 'security');
    });
    it('classifies testing feedback', () => {
        assert.equal(classifyFeedback('add a test for this edge case'), 'testing');
    });
    it('defaults to style for unknown', () => {
        assert.equal(classifyFeedback('please fix this'), 'style');
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
        assert.equal(lessons.length, 2);
        assert.equal(lessons[0]!.sourcePrUrl, ctx.prUrl);
        assert.equal(lessons[0]!.workspaceId, 'w1');
        assert.equal(lessons[0]!.appliedToFutureTask, false);
    });

    it('skips trivially short comments', async () => {
        const store = new InMemoryLessonStore();
        const lessons = await ingestReviewFeedback(ctx, [comment('ok', 1), comment('nit', 2)], store);
        assert.equal(lessons.length, 0);
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
        assert.equal(lessons.length, 1);
    });

    it('returns empty for different workspace', async () => {
        const store = new InMemoryLessonStore();
        await ingestReviewFeedback(ctx, [comment('add validation here please', 1)], store);
        const lessons = await getRelevantLessons('other-workspace', '.ts', store);
        assert.equal(lessons.length, 0);
    });
});

describe('formatLessonsForPrompt', () => {
    it('returns empty string when no lessons', () => {
        assert.equal(formatLessonsForPrompt([]), '');
    });

    it('formats lessons as bullet list', async () => {
        const store = new InMemoryLessonStore();
        const lessons = await ingestReviewFeedback(
            ctx,
            [comment('use const instead of var', 1)],
            store,
        );
        const prompt = formatLessonsForPrompt(lessons);
        assert.match(prompt, /Workspace coding rules/);
        assert.match(prompt, /\[style\]/);
        assert.match(prompt, /use const instead of var/);
    });
});
