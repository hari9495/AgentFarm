/**
 * Feature #5 — Task Progress Reporter tests
 * Frozen 2026-05-07
 */

import { describe, it, expect, vi } from 'vitest';
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
        expect(event.taskId).toBe('task-123');
        expect(event.milestone).toBe('coding_started');
        expect(event.detail).toBe('writing fix');
        expect(event.contractVersion).toBeDefined();
        expect(event.id).toBeDefined();
    });
});

describe('reportProgress', () => {
    it('sends event to sink', async () => {
        const sink = new InMemoryProgressSink();
        await reportProgress(ctx, 'tests_running', 'running pnpm test', sink);
        expect(sink.events).toHaveLength(1);
        expect(sink.events[0]!.milestone).toBe('tests_running');
    });

    it('never throws when sink throws', async () => {
        const broken: import('./task-progress-reporter.js').ProgressSink = {
            send: async () => { throw new Error('sink down'); },
        };
        await expect(reportProgress(ctx, 'pr_created', 'PR opened', broken)).resolves.toBeUndefined();
    });
});

describe('FanOutProgressSink', () => {
    it('delivers to all child sinks', async () => {
        const a = new InMemoryProgressSink();
        const b = new InMemoryProgressSink();
        const fanout = new FanOutProgressSink([a, b]);
        await fanout.send(buildProgressEvent(ctx, 'task_received', 'task arrived'));
        expect(a.events).toHaveLength(1);
        expect(b.events).toHaveLength(1);
    });

    it('continues to other sinks when one fails', async () => {
        const good = new InMemoryProgressSink();
        const bad: import('./task-progress-reporter.js').ProgressSink = {
            send: async () => { throw new Error('bad sink'); },
        };
        const fanout = new FanOutProgressSink([bad, good]);
        await fanout.send(buildProgressEvent(ctx, 'completed', 'done'));
        expect(good.events).toHaveLength(1);
    });
});

describe('withProgressTracking', () => {
    it('emits coding_started and completed on success', async () => {
        const sink = new InMemoryProgressSink();
        const result = await withProgressTracking(ctx, sink, async () => 42);
        expect(result).toBe(42);
        const milestones = sink.events.map((e) => e.milestone);
        expect(milestones).toContain('coding_started');
        expect(milestones).toContain('completed');
    });

    it('emits failed and rethrows on error', async () => {
        const sink = new InMemoryProgressSink();
        await expect(
            withProgressTracking(ctx, sink, async () => { throw new Error('boom'); }),
        ).rejects.toThrow('boom');
        expect(sink.events.at(-1)!.milestone).toBe('failed');
    });
});

describe('NoopProgressSink', () => {
    it('does not throw', async () => {
        const sink = new NoopProgressSink();
        await expect(sink.send(buildProgressEvent(ctx, 'task_received', 'test'))).resolves.toBeUndefined();
    });
});
