/**
 * Feature #5 - Task Progress Reporter tests
 * Frozen 2026-05-07
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    buildProgressEvent,
    reportProgress,
    withProgressTracking,
    InMemoryProgressSink,
    FanOutProgressSink,
    NoopProgressSink,
    type ProgressReporterContext,
} from './task-progress-reporter.js';

const ctx: ProgressReporterContext = {
    tenantId: 't1',
    workspaceId: 'w1',
    taskId: 'task-123',
    botId: 'bot-1',
    correlationId: 'corr-1',
};

describe('buildProgressEvent', () => {
    it('produces a valid event with all required fields', () => {
        const event = buildProgressEvent(ctx, 'coding_started', 'writing fix');
        assert.equal(event.taskId, 'task-123');
        assert.equal(event.milestone, 'coding_started');
        assert.equal(event.detail, 'writing fix');
        assert.ok(event.contractVersion);
        assert.ok(event.id);
    });
});

describe('reportProgress', () => {
    it('sends event to sink', async () => {
        const sink = new InMemoryProgressSink();
        await reportProgress(ctx, 'tests_running', 'running pnpm test', sink);
        assert.equal(sink.events.length, 1);
        assert.equal(sink.events[0]!.milestone, 'tests_running');
    });

    it('never throws when sink throws', async () => {
        const broken: import('./task-progress-reporter.js').ProgressSink = {
            send: async () => { throw new Error('sink down'); },
        };
        await assert.doesNotReject(() => reportProgress(ctx, 'pr_created', 'PR opened', broken));
    });
});

describe('FanOutProgressSink', () => {
    it('delivers to all child sinks', async () => {
        const a = new InMemoryProgressSink();
        const b = new InMemoryProgressSink();
        const fanout = new FanOutProgressSink([a, b]);
        await fanout.send(buildProgressEvent(ctx, 'task_received', 'task arrived'));
        assert.equal(a.events.length, 1);
        assert.equal(b.events.length, 1);
    });

    it('continues to other sinks when one fails', async () => {
        const good = new InMemoryProgressSink();
        const bad: import('./task-progress-reporter.js').ProgressSink = {
            send: async () => { throw new Error('bad sink'); },
        };
        const fanout = new FanOutProgressSink([bad, good]);
        await fanout.send(buildProgressEvent(ctx, 'completed', 'done'));
        assert.equal(good.events.length, 1);
    });
});

describe('withProgressTracking', () => {
    it('emits coding_started and completed on success', async () => {
        const sink = new InMemoryProgressSink();
        const result = await withProgressTracking(ctx, sink, async () => 42);
        assert.equal(result, 42);
        const milestones = sink.events.map((e) => e.milestone);
        assert.ok(milestones.includes('coding_started'));
        assert.ok(milestones.includes('completed'));
    });

    it('emits failed and rethrows on error', async () => {
        const sink = new InMemoryProgressSink();
        await assert.rejects(
            () => withProgressTracking(ctx, sink, async () => { throw new Error('boom'); }),
            /boom/,
        );
        assert.equal(sink.events.at(-1)!.milestone, 'failed');
    });
});

describe('NoopProgressSink', () => {
    it('does not throw', async () => {
        const sink = new NoopProgressSink();
        await assert.doesNotReject(() => sink.send(buildProgressEvent(ctx, 'task_received', 'test')));
    });
});
