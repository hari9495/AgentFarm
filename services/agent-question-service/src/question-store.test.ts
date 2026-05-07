/**
 * Feature #2 — Agent Question Service tests
 * Frozen 2026-05-07
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    createQuestion,
    answerQuestion,
    resolveTimeout,
    sweepExpiredQuestions,
    InMemoryQuestionStore,
    type CreateQuestionInput,
} from './question-store.js';

const base: CreateQuestionInput = {
    tenantId: 't1',
    workspaceId: 'w1',
    taskId: 'task-1',
    botId: 'bot-1',
    question: 'Should we use v2 or v3 API?',
    context: 'About to call the payment endpoint',
    askedVia: 'dashboard',
    correlationId: 'corr-1',
};

describe('createQuestion', () => {
    it('creates a pending question with default timeout', async () => {
        const store = new InMemoryQuestionStore();
        const q = await createQuestion(base, store);
        expect(q.status).toBe('pending');
        expect(q.taskId).toBe('task-1');
        expect(q.timeoutMs).toBe(4 * 60 * 60 * 1000);
        expect(q.onTimeout).toBe('escalate');
    });

    it('respects custom timeout and onTimeout policy', async () => {
        const store = new InMemoryQuestionStore();
        const q = await createQuestion(
            { ...base, timeoutMs: 1000, onTimeout: 'abandon_task' },
            store,
        );
        expect(q.timeoutMs).toBe(1000);
        expect(q.onTimeout).toBe('abandon_task');
    });
});

describe('answerQuestion', () => {
    it('marks question as answered', async () => {
        const store = new InMemoryQuestionStore();
        const q = await createQuestion(base, store);
        const answered = await answerQuestion(q.id, 'Use v3', 'alice', store);
        expect(answered?.status).toBe('answered');
        expect(answered?.answer).toBe('Use v3');
        expect(answered?.answeredBy).toBe('alice');
    });

    it('returns null for non-existent question', async () => {
        const store = new InMemoryQuestionStore();
        const result = await answerQuestion('no-such-id', 'answer', 'alice', store);
        expect(result).toBeNull();
    });

    it('returns null if already answered', async () => {
        const store = new InMemoryQuestionStore();
        const q = await createQuestion(base, store);
        await answerQuestion(q.id, 'v3', 'alice', store);
        const second = await answerQuestion(q.id, 'v2', 'bob', store);
        expect(second).toBeNull();
    });
});

describe('resolveTimeout', () => {
    it('marks expired question as timed_out', async () => {
        const store = new InMemoryQuestionStore();
        const q = await createQuestion(
            { ...base, timeoutMs: 1, onTimeout: 'proceed_with_best_guess' },
            store,
        );
        // wait a tick so expiry is in the past
        await new Promise((r) => setTimeout(r, 5));
        const resolved = await resolveTimeout(q.id, store);
        expect(resolved?.policy).toBe('proceed_with_best_guess');
        expect(resolved?.record.status).toBe('timed_out');
    });

    it('returns null if question has not yet expired', async () => {
        const store = new InMemoryQuestionStore();
        const q = await createQuestion({ ...base, timeoutMs: 60_000 }, store);
        const resolved = await resolveTimeout(q.id, store);
        expect(resolved).toBeNull();
    });
});

describe('sweepExpiredQuestions', () => {
    it('resolves all expired questions in workspace', async () => {
        const store = new InMemoryQuestionStore();
        await createQuestion({ ...base, taskId: 'A', timeoutMs: 1, onTimeout: 'escalate' }, store);
        await createQuestion({ ...base, taskId: 'B', timeoutMs: 1, onTimeout: 'abandon_task' }, store);
        await createQuestion({ ...base, taskId: 'C', timeoutMs: 60_000 }, store);
        await new Promise((r) => setTimeout(r, 5));
        const results = await sweepExpiredQuestions('w1', store);
        expect(results).toHaveLength(2);
        expect(results.map((r) => r.policy).sort()).toEqual(['abandon_task', 'escalate']);
    });
});
