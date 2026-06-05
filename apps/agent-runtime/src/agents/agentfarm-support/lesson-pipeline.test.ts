/**
 * Tests for lesson-pipeline.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    classifyFeedback,
    ingestSupportFeedback,
    InMemorySupportLessonStore,
    GatewaySupportLessonStore,
    buildSupportEpisodicPattern,
    buildSupportEpisodicSummary,
    formatSupportLessonsForPrompt,
    type SupportFeedbackContext,
    type SupportLesson,
} from './lesson-pipeline.js';
import type { TaskEnvelope, ProcessedTaskResult } from '../../execution-engine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CTX: SupportFeedbackContext = {
    tenantId: 'tenant-1',
    workspaceId: 'ws-1',
    taskId: 'task-1',
    issueId: 'issue-1',
    actionType: 'agentfarm_support_config_fix',
    correlationId: 'corr-1',
};

function makeTask(payload: Record<string, unknown> = {}): TaskEnvelope {
    return { id: 'task-1', tenantId: 'tenant-1', botId: 'bot-1', actionType: 'agentfarm_support_resolve', payload, createdAt: new Date().toISOString() } as unknown as TaskEnvelope;
}

function makeResult(status: 'success' | 'fail', actionType = 'agentfarm_support_resolve'): ProcessedTaskResult {
    return { status, decision: { actionType }, output: '' } as unknown as ProcessedTaskResult;
}

// ---------------------------------------------------------------------------
// classifyFeedback
// ---------------------------------------------------------------------------

describe('classifyFeedback', () => {
    it('classifies config_error for misconfiguration keywords', () => {
        assert.equal(classifyFeedback('env var was wrong, caused the misconfiguration'), 'config_error');
    });

    it('classifies code_bug for exception/crash keywords', () => {
        assert.equal(classifyFeedback('Uncaught exception in runtime — stack trace shows null pointer'), 'code_bug');
    });

    it('classifies infra_failure for infrastructure keywords', () => {
        assert.equal(classifyFeedback('The database Redis was unreachable — network timeout'), 'infra_failure');
    });

    it('classifies billing_issue for subscription keywords', () => {
        assert.equal(classifyFeedback('subscription expired, budget hard-stop triggered'), 'billing_issue');
    });

    it('classifies connector_failure for OAuth keywords', () => {
        assert.equal(classifyFeedback('OAuth token expired for Slack connector'), 'connector_failure');
    });

    it('classifies provisioning_error for provisioning keywords', () => {
        assert.equal(classifyFeedback('provisioning job stuck after VM spin-up failed'), 'provisioning_error');
    });

    it('classifies user_error for incorrect usage keywords', () => {
        assert.equal(classifyFeedback('operator mistake — unsupported operation was attempted'), 'user_error');
    });

    it('defaults to config_error when no pattern matches', () => {
        assert.equal(classifyFeedback('something weird happened'), 'config_error');
    });
});

// ---------------------------------------------------------------------------
// InMemorySupportLessonStore
// ---------------------------------------------------------------------------

describe('InMemorySupportLessonStore', () => {
    it('saves and retrieves a lesson by workspaceId', async () => {
        const store = new InMemorySupportLessonStore();
        const lesson: SupportLesson = {
            id: 'l1', tenantId: 'tenant-1', workspaceId: 'ws-1', sourceTaskId: 'task-1', sourceIssueId: 'issue-1',
            feedback: 'Always check env vars first.', category: 'config_error', learnedAt: new Date().toISOString(), correlationId: 'c1',
        };
        await store.save(lesson);
        const results = await store.findByWorkspace('ws-1');
        assert.equal(results.length, 1);
        assert.equal(results[0]!.id, 'l1');
    });

    it('filters by category', async () => {
        const store = new InMemorySupportLessonStore();
        const base = { tenantId: 't', workspaceId: 'ws-1', sourceTaskId: 'task-1', sourceIssueId: 'i1', learnedAt: new Date().toISOString(), correlationId: '' };
        await store.save({ ...base, id: 'l1', feedback: 'Config lesson', category: 'config_error' });
        await store.save({ ...base, id: 'l2', feedback: 'Infra lesson', category: 'infra_failure' });
        const results = await store.findByWorkspace('ws-1', { category: 'config_error' });
        assert.equal(results.length, 1);
        assert.equal(results[0]!.category, 'config_error');
    });

    it('respects limit', async () => {
        const store = new InMemorySupportLessonStore();
        for (let i = 0; i < 5; i++) {
            await store.save({ id: `l${i}`, tenantId: 't', workspaceId: 'ws-1', sourceTaskId: 't', sourceIssueId: 'i', feedback: `Lesson ${i}`, category: 'config_error', learnedAt: new Date().toISOString(), correlationId: '' });
        }
        const results = await store.findByWorkspace('ws-1', { limit: 2 });
        assert.equal(results.length, 2);
    });

    it('does not return lessons from other workspaces', async () => {
        const store = new InMemorySupportLessonStore();
        await store.save({ id: 'l1', tenantId: 't', workspaceId: 'ws-other', sourceTaskId: 't', sourceIssueId: 'i', feedback: 'Other', category: 'code_bug', learnedAt: new Date().toISOString(), correlationId: '' });
        const results = await store.findByWorkspace('ws-1');
        assert.equal(results.length, 0);
    });
});

// ---------------------------------------------------------------------------
// ingestSupportFeedback
// ---------------------------------------------------------------------------

describe('ingestSupportFeedback', () => {
    it('persists one lesson per feedback item', async () => {
        const store = new InMemorySupportLessonStore();
        const lessons = await ingestSupportFeedback(CTX, [
            { body: 'env var REDIS_URL was misconfigured' },
            { body: 'OAuth token expired for GitHub connector' },
        ], store);
        assert.equal(lessons.length, 2);
        const stored = await store.findByWorkspace('ws-1');
        assert.equal(stored.length, 2);
    });

    it('skips feedback items shorter than 10 chars', async () => {
        const store = new InMemorySupportLessonStore();
        const lessons = await ingestSupportFeedback(CTX, [{ body: 'too short' }, { body: 'short' }], store);
        assert.equal(lessons.length, 1);
    });

    it('correctly classifies each feedback item', async () => {
        const store = new InMemorySupportLessonStore();
        await ingestSupportFeedback(CTX, [{ body: 'stack trace shows null pointer exception in code' }], store);
        const stored = await store.findByWorkspace('ws-1');
        assert.equal(stored[0]!.category, 'code_bug');
    });

    it('assigns provided createdAt as learnedAt', async () => {
        const store = new InMemorySupportLessonStore();
        const ts = '2025-01-15T12:00:00.000Z';
        await ingestSupportFeedback(CTX, [{ body: 'Redis was unreachable — infra failure in cloud', createdAt: ts }], store);
        const stored = await store.findByWorkspace('ws-1');
        assert.equal(stored[0]!.learnedAt, ts);
    });
});

// ---------------------------------------------------------------------------
// GatewaySupportLessonStore
// ---------------------------------------------------------------------------

describe('GatewaySupportLessonStore', () => {
    it('does not throw when save fetch fails', async () => {
        const origFetch = globalThis.fetch;
        globalThis.fetch = (async () => { throw new Error('network'); }) as unknown as typeof fetch;
        try {
            const store = new GatewaySupportLessonStore('http://gw:3000', 'token');
            await assert.doesNotReject(() =>
                store.save({ id: 'l1', tenantId: 't', workspaceId: 'ws-1', sourceTaskId: 't', sourceIssueId: 'i', feedback: 'test lesson body', category: 'config_error', learnedAt: new Date().toISOString(), correlationId: '' })
            );
        } finally {
            globalThis.fetch = origFetch;
        }
    });

    it('returns empty array when findByWorkspace fetch fails', async () => {
        const origFetch = globalThis.fetch;
        globalThis.fetch = (async () => { throw new Error('network'); }) as unknown as typeof fetch;
        try {
            const store = new GatewaySupportLessonStore('http://gw:3000', 'token');
            const results = await store.findByWorkspace('ws-1');
            assert.deepEqual(results, []);
        } finally {
            globalThis.fetch = origFetch;
        }
    });

    it('filters returned lessons by support:lesson: prefix', async () => {
        const origFetch = globalThis.fetch;
        globalThis.fetch = (async () => ({
            ok: true,
            json: async () => ({
                patterns: [
                    { pattern: 'support:lesson:config_error:ws-1:l1', summary: '[config_error] Check env vars', confidence: 0.75, lastSeen: new Date().toISOString(), metadata: { lessonId: 'l1', category: 'config_error', feedback: 'Check env vars first', sourceTaskId: 't', sourceIssueId: 'i', correlationId: '', learnedAt: new Date().toISOString() } },
                    { pattern: 'devops:lesson:reliability:ws-1:l2', summary: '[reliability] Some devops lesson', confidence: 0.7 },
                ],
            }),
        })) as unknown as typeof fetch;
        try {
            const store = new GatewaySupportLessonStore('http://gw:3000', 'token');
            const results = await store.findByWorkspace('ws-1');
            assert.equal(results.length, 1);
            assert.equal(results[0]!.category, 'config_error');
        } finally {
            globalThis.fetch = origFetch;
        }
    });
});

// ---------------------------------------------------------------------------
// formatSupportLessonsForPrompt
// ---------------------------------------------------------------------------

describe('formatSupportLessonsForPrompt', () => {
    it('returns empty string for empty lessons array', () => {
        assert.equal(formatSupportLessonsForPrompt([]), '');
    });

    it('formats lessons with category tags', () => {
        const lesson: SupportLesson = { id: 'l1', tenantId: 't', workspaceId: 'ws', sourceTaskId: 't', sourceIssueId: 'i', feedback: 'Always check env vars before escalating.', category: 'config_error', learnedAt: new Date().toISOString(), correlationId: '' };
        const result = formatSupportLessonsForPrompt([lesson]);
        assert.ok(result.includes('[config_error]'));
        assert.ok(result.includes('Always check env vars'));
    });
});

// ---------------------------------------------------------------------------
// buildSupportEpisodicPattern / Summary
// ---------------------------------------------------------------------------

describe('buildSupportEpisodicPattern', () => {
    it('strips agentfarm_support_ prefix', () => {
        const pattern = buildSupportEpisodicPattern(makeTask(), makeResult('success', 'agentfarm_support_resolve'));
        assert.ok(pattern.startsWith('support:resolve:'));
        assert.ok(pattern.endsWith(':success'));
    });

    it('appends fail for non-success status', () => {
        const pattern = buildSupportEpisodicPattern(makeTask(), makeResult('fail', 'agentfarm_support_config_fix'));
        assert.ok(pattern.endsWith(':fail'));
    });
});

describe('buildSupportEpisodicSummary', () => {
    it('includes issue context from payload', () => {
        const task = makeTask({ issueId: 'issue-123', issueDescription: 'Redis timeout' });
        const summary = buildSupportEpisodicSummary(task, makeResult('success', 'agentfarm_support_resolve'));
        assert.ok(summary.includes('issue-123'));
        assert.ok(summary.toLowerCase().includes('redis timeout'));
    });

    it('references action type when no issueDescription', () => {
        const summary = buildSupportEpisodicSummary(makeTask(), makeResult('fail', 'agentfarm_support_escalate'));
        assert.ok(summary.toLowerCase().includes('escalation'));
    });
});
