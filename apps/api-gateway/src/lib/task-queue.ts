/**
 * Phase 24 — In-memory priority task queue + drain sweep.
 *
 * The queue is a module-level array kept in priority order (high → normal → low).
 * Within the same priority tier, entries are ordered FIFO.
 *
 * The drain sweep is a setInterval loop that pulls entries from the front of the
 * queue (highest priority / oldest within tier) and forwards them to agent-runtime
 * via POST /tasks/intake.
 */

import type { PrismaClient } from '@prisma/client';
import { getRedisClient } from '@agentfarm/redis-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type QueuePriority = 'high' | 'normal' | 'low';

export type QueueEntry = {
    id: string;
    tenantId: string;
    workspaceId: string;
    botId?: string;
    priority: QueuePriority;
    payload: unknown;
    enqueuedAt: number;
};

const PRIORITY_RANK: Record<QueuePriority, number> = {
    high: 0,
    normal: 1,
    low: 2,
};

// ─── Module-level queue store ─────────────────────────────────────────────────

const queue: QueueEntry[] = [];

// ─── Queue operations ─────────────────────────────────────────────────────────

/**
 * Insert entry into the queue at the correct priority position (FIFO within tier).
 */
export function enqueueTask(entry: QueueEntry): void {
    const rank = PRIORITY_RANK[entry.priority];
    const insertAt = queue.findIndex((q) => PRIORITY_RANK[q.priority] > rank);
    if (insertAt === -1) {
        queue.push(entry);
    } else {
        queue.splice(insertAt, 0, entry);
    }
}

/** Remove and return the entry at the front of the queue (highest priority / oldest). */
export function dequeueTask(): QueueEntry | undefined {
    return queue.shift();
}

/** Return a shallow copy of the current queue (does not mutate). */
export function getQueueSnapshot(): QueueEntry[] {
    return [...queue];
}

/** Number of entries currently waiting in the queue. */
export function getQueueDepth(): number {
    return queue.length;
}

/**
 * Remove an entry from the queue by id.
 * Returns true if the entry was found and removed, false otherwise.
 */
export function cancelFromQueue(id: string): boolean {
    const idx = queue.findIndex((q) => q.id === id);
    if (idx === -1) return false;
    queue.splice(idx, 1);
    return true;
}

/** Remove all entries from the queue. Used in tests. */
export function clearQueue(): void {
    queue.splice(0);
}

// ─── Drain sweep ──────────────────────────────────────────────────────────────

type DrainOpts = {
    /** Base URL of agent-runtime, e.g. http://localhost:3001 */
    agentRuntimeUrl: string;
    prisma: PrismaClient;
    /** Max concurrent entries being processed at once. Default: 3 */
    concurrency?: number;
    /** Interval between drain ticks in ms. Default: 2000 */
    intervalMs?: number;
};

let drainInterval: ReturnType<typeof setInterval> | null = null;
let draining = 0;

/**
 * Start the drain sweep. Idempotent — calling more than once is a no-op.
 * Call once after app.listen() in main.ts.
 */
export function startDrainSweep(opts: DrainOpts): void {
    if (drainInterval !== null) return;
    const concurrency = opts.concurrency ?? 3;
    const intervalMs = opts.intervalMs ?? 2_000;
    drainInterval = setInterval(() => {
        void drainOnce(opts, concurrency);
    }, intervalMs);
}

/**
 * Stop the drain sweep. Used in graceful shutdown.
 */
export function stopDrainSweep(): void {
    if (drainInterval !== null) {
        clearInterval(drainInterval);
        drainInterval = null;
    }
}

async function drainOnce(opts: DrainOpts, concurrency: number): Promise<void> {
    while (draining < concurrency && queue.length > 0) {
        const entry = dequeueTask();
        if (!entry) break;
        draining++;
        void processEntry(entry, opts).finally(() => {
            draining--;
        });
    }
}

async function processEntry(entry: QueueEntry, opts: DrainOpts): Promise<void> {
    // Redis claim deduplication — prevents duplicate pickup in multi-instance deployments
    const redis = getRedisClient();
    if (redis) {
        try {
            const claimKey = `taskqueue:claimed:${entry.id}`;
            const claimed = await redis.set(claimKey, '1', 'EX', 300, 'NX');
            if (!claimed) return; // Another instance already claimed this task
        } catch {
            // Redis unavailable — continue without claim check
        }
    }

    // Step 1 — mark running in DB; re-enqueue at front on failure
    try {
        await (opts.prisma as unknown as {
            taskQueueEntry: {
                update: (args: {
                    where: { id: string };
                    data: { status: string; startedAt: Date };
                }) => Promise<unknown>;
            };
        }).taskQueueEntry.update({
            where: { id: entry.id },
            data: { status: 'running', startedAt: new Date() },
        });
    } catch {
        queue.unshift(entry);
        return;
    }

    // Step 2 — forward to agent-runtime with 10 s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
        const res = await fetch(`${opts.agentRuntimeUrl}/tasks/intake`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-tenant-id': entry.tenantId,
            },
            body: JSON.stringify(entry.payload),
            signal: controller.signal,
        });

        const db = opts.prisma as unknown as {
            taskQueueEntry: {
                update: (args: {
                    where: { id: string };
                    data: Record<string, unknown>;
                }) => Promise<unknown>;
            };
        };

        if (res.ok) {
            await db.taskQueueEntry.update({
                where: { id: entry.id },
                data: { status: 'done', completedAt: new Date() },
            });
        } else {
            await db.taskQueueEntry.update({
                where: { id: entry.id },
                data: { status: 'failed', errorMessage: `HTTP ${res.status}` },
            });
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[task-queue] processEntry failed', msg);
        try {
            const db = opts.prisma as unknown as {
                taskQueueEntry: {
                    update: (args: {
                        where: { id: string };
                        data: Record<string, unknown>;
                    }) => Promise<unknown>;
                };
            };
            await db.taskQueueEntry.update({
                where: { id: entry.id },
                data: { status: 'failed', errorMessage: msg },
            });
        } catch {
            // ignore secondary DB failure
        }
    } finally {
        clearTimeout(timeoutId);
    }
}
