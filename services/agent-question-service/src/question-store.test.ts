/**
 * Feature #2 — Agent Question Service tests
 * Frozen 2026-05-07
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
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
    test('creates a pending question with default timeout', async () => {
        const store = new InMemoryQuestionStore();
        const q = await createQuestion(base, store);
        assert.equal(q.status, 'pending');
        assert.equal(q.taskId, 'task-1');
        assert.equal(q.timeoutMs, 4 * 60 * 60 * 1000);
        assert.equal(q.onTimeout, 'escalate');
    });

    test('respects custom timeout and onTimeout policy', async () => {
        const store = new InMemoryQuestionStore();
        const q = await createQuestion(
            { ...base, timeoutMs: 1000, onTimeout: 'abandon_task' },
            store,
        );
        assert.equal(q.timeoutMs, 1000);
        assert.equal(q.onTimeout, 'abandon_task');
    });
});

describe('answerQuestion', () => {
    test('marks question as answered', async () => {
        const store = new InMemoryQuestionStore();
        const q = await createQuestion(base, store);
        const answered = await answerQuestion(q.id, 'Use v3', 'alice', store);
        assert.equal(answered?.status, 'answered');
        assert.equal(answered?.answer, 'Use v3');
        assert.equal(answered?.answeredBy, 'alice');
    });

    test('returns null for non-existent question', async () => {
        const store = new InMemoryQuestionStore();
        const result = await answerQuestion('no-such-id', 'answer', 'alice', store);
        assert.equal(result, null);
    });

    test('returns null if already answered', async () => {
        const store = new InMemoryQuestionStore();
        const q = await createQuestion(base, store);
        await answerQuestion(q.id, 'v3', 'alice', store);
        const second = await answerQuestion(q.id, 'v2', 'bob', store);
        assert.equal(second, null);
    });
});

describe('resolveTimeout', () => {
    test('marks expired question as timed_out', async () => {
        const store = new InMemoryQuestionStore();
        const q = await createQuestion(
            { ...base, timeoutMs: 1, onTimeout: 'proceed_with_best_guess' },
            store,
        );
        // wait a tick so expiry is in the past
        await new Promise((r) => setTimeout(r, 5));
        const resolved = await resolveTimeout(q.id, store);
        assert.equal(resolved?.policy, 'proceed_with_best_guess');
        assert.equal(resolved?.record.status, 'timed_out');
    });

    test('returns null if question has not yet expired', async () => {
        const store = new InMemoryQuestionStore();
        const q = await createQuestion({ ...base, timeoutMs: 60_000 }, store);
        const resolved = await resolveTimeout(q.id, store);
        assert.equal(resolved, null);
    });
});

describe('sweepExpiredQuestions', () => {
    test('resolves all expired questions in workspace', async () => {
        const store = new InMemoryQuestionStore();
        await createQuestion({ ...base, taskId: 'A', timeoutMs: 1, onTimeout: 'escalate' }, store);
        await createQuestion({ ...base, taskId: 'B', timeoutMs: 1, onTimeout: 'abandon_task' }, store);
        await createQuestion({ ...base, taskId: 'C', timeoutMs: 60_000 }, store);
        await new Promise((r) => setTimeout(r, 5));
        const results = await sweepExpiredQuestions('w1', store);
        assert.equal(results.length, 2);
        assert.deepEqual(results.map((r) => r.policy).sort(), ['abandon_task', 'escalate']);
    });
});
