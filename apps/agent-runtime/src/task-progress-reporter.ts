/**
 * Feature #5 — Live Task Progress Reporter
 * Frozen 2026-05-07
 *
 * Reports task milestones in real time to Jira comments, Teams/Slack threads,
 * and the dashboard activity feed — so operators see the agent working, not
 * just a binary done/failed at the end.
 *
 * Hook: call reportProgress() at each stage inside execution-engine.ts
 */

import { randomUUID } from 'node:crypto';
import type { ProgressMilestone, TaskProgressEvent } from '@agentfarm/shared-types';
import { CONTRACT_VERSIONS } from '@agentfarm/shared-types';

export type { ProgressMilestone };

export interface ProgressReporterContext {
    tenantId: string;
    workspaceId: string;
    taskId: string;
    botId: string;
    correlationId: string;
}

/**
 * Channel sink interface — implementations push to Jira, Slack/Teams, or
 * the dashboard activity stream.  Kept as an interface so tests can inject
 * a no-op sink without needing real connectors.
 */
export interface ProgressSink {
    send(event: TaskProgressEvent): Promise<void>;
}

/**
 * No-op sink used when no connectors are configured or in unit tests.
 */
export class NoopProgressSink implements ProgressSink {
    async send(_event: TaskProgressEvent): Promise<void> {
        // intentionally empty
    }
}

/**
 * In-memory sink that accumulates events — useful for testing and for
 * feeding the SSE endpoint in the dashboard gateway.
 */
export class InMemoryProgressSink implements ProgressSink {
    readonly events: TaskProgressEvent[] = [];

    async send(event: TaskProgressEvent): Promise<void> {
        this.events.push(event);
    }
}

/**
 * Fan-out sink: broadcasts to every registered child sink.
 */
export class FanOutProgressSink implements ProgressSink {
    constructor(private readonly sinks: ProgressSink[]) { }

    async send(event: TaskProgressEvent): Promise<void> {
        await Promise.allSettled(this.sinks.map((s) => s.send(event)));
    }
}

/**
 * Build a TaskProgressEvent record.
 */
export function buildProgressEvent(
    ctx: ProgressReporterContext,
    milestone: ProgressMilestone,
    detail: string,
): TaskProgressEvent {
    return {
        id: randomUUID(),
        contractVersion: CONTRACT_VERSIONS.TASK_PROGRESS,
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId,
        taskId: ctx.taskId,
        botId: ctx.botId,
        milestone,
        detail,
        occurredAt: new Date().toISOString(),
        correlationId: ctx.correlationId,
    };
}

/**
 * Main reporter: builds the event and fans it out to all sinks.
 * Never throws — errors are swallowed so a failed notification never
 * blocks task execution.
 */
export async function reportProgress(
    ctx: ProgressReporterContext,
    milestone: ProgressMilestone,
    detail: string,
    sink: ProgressSink,
): Promise<void> {
    try {
        const event = buildProgressEvent(ctx, milestone, detail);
        await sink.send(event);
    } catch {
        // Notification failure must not stop task execution
    }
}

/**
 * Convenience wrapper: wraps an async task function and automatically
 * emits 'coding_started' at entry and 'completed' / 'failed' at exit.
 */
export async function withProgressTracking<T>(
    ctx: ProgressReporterContext,
    sink: ProgressSink,
    fn: () => Promise<T>,
): Promise<T> {
    await reportProgress(ctx, 'coding_started', 'Agent began task execution.', sink);
    try {
        const result = await fn();
        await reportProgress(ctx, 'completed', 'Task completed successfully.', sink);
        return result;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await reportProgress(ctx, 'failed', `Task failed: ${msg}`, sink);
        throw err;
    }
}
