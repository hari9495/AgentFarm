/**
 * Durable task-queue store — closes the "restart drops queued tasks" gap.
 *
 * The runtime's worker queue is an in-memory array; a container restart (or
 * the known WSL2 restart-loop glitch) silently lost everything queued but not
 * yet processed. This store persists every queued task envelope on intake,
 * removes it once processing completes, and lets startup restore whatever
 * was in flight — at-least-once semantics, with the task-lease idempotency
 * machinery as the dedupe layer.
 *
 * Backend: Redis hash per bot (`af:runtime:queue:v1:{botId}`, field=taskId,
 * 7-day TTL refreshed on write) with a tmpdir file fallback when REDIS_URL
 * is unset (single-instance only) — the same pattern as the coding-loop
 * checkpoints. All operations are fail-safe: a broken backend degrades to
 * the old in-memory behavior, it never breaks intake or the worker.
 */

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type PersistedTask = {
    taskId: string;
    payload: Record<string, unknown>;
    enqueuedAt: number;
};

/** The minimal Redis surface the store needs (satisfied by ioredis). */
export type RedisLike = {
    hset(key: string, field: string, value: string): Promise<number>;
    hdel(key: string, field: string): Promise<number>;
    hgetall(key: string): Promise<Record<string, string>>;
    expire(key: string, seconds: number): Promise<number>;
};

export interface TaskQueueStore {
    persist(botId: string, task: PersistedTask): Promise<void>;
    remove(botId: string, taskId: string): Promise<void>;
    loadAll(botId: string): Promise<PersistedTask[]>;
}

const QUEUE_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_FALLBACK_DIR = join(tmpdir(), 'agentfarm-task-queue');

const queueKey = (botId: string): string => `af:runtime:queue:v1:${botId}`;

// Bot ids become directory names in the fallback — keep them path-safe.
const safeSegment = (value: string): string => value.replace(/[^a-zA-Z0-9._-]/g, '_');

const parseTask = (raw: string): PersistedTask | null => {
    try {
        const parsed = JSON.parse(raw) as PersistedTask;
        if (typeof parsed?.taskId !== 'string' || typeof parsed?.payload !== 'object' || parsed.payload === null) {
            return null;
        }
        return { taskId: parsed.taskId, payload: parsed.payload, enqueuedAt: Number(parsed.enqueuedAt) || 0 };
    } catch {
        return null;
    }
};

export function createTaskQueueStore(options?: {
    redis?: RedisLike | null;
    dir?: string;
}): TaskQueueStore {
    const redis = options?.redis ?? null;
    const fallbackDir = options?.dir ?? DEFAULT_FALLBACK_DIR;

    if (redis) {
        return {
            async persist(botId, task): Promise<void> {
                try {
                    const key = queueKey(botId);
                    await redis.hset(key, task.taskId, JSON.stringify(task));
                    await redis.expire(key, QUEUE_TTL_SECONDS);
                } catch { /* fail-safe: degrade to in-memory-only */ }
            },
            async remove(botId, taskId): Promise<void> {
                try {
                    await redis.hdel(queueKey(botId), taskId);
                } catch { /* fail-safe */ }
            },
            async loadAll(botId): Promise<PersistedTask[]> {
                try {
                    const entries = await redis.hgetall(queueKey(botId));
                    return Object.values(entries)
                        .map(parseTask)
                        .filter((t): t is PersistedTask => t !== null)
                        .sort((a, b) => a.enqueuedAt - b.enqueuedAt);
                } catch {
                    return [];
                }
            },
        };
    }

    const botDir = (botId: string): string => join(fallbackDir, safeSegment(botId));

    return {
        async persist(botId, task): Promise<void> {
            try {
                const dir = botDir(botId);
                await mkdir(dir, { recursive: true });
                await writeFile(join(dir, `${safeSegment(task.taskId)}.json`), JSON.stringify(task), 'utf-8');
            } catch { /* fail-safe */ }
        },
        async remove(botId, taskId): Promise<void> {
            try {
                await rm(join(botDir(botId), `${safeSegment(taskId)}.json`), { force: true });
            } catch { /* fail-safe */ }
        },
        async loadAll(botId): Promise<PersistedTask[]> {
            try {
                const dir = botDir(botId);
                const files = await readdir(dir).catch(() => [] as string[]);
                const tasks: PersistedTask[] = [];
                for (const file of files) {
                    if (!file.endsWith('.json')) continue;
                    const raw = await readFile(join(dir, file), 'utf-8').catch(() => null);
                    if (!raw) continue;
                    const parsed = parseTask(raw);
                    if (parsed) tasks.push(parsed);
                }
                return tasks.sort((a, b) => a.enqueuedAt - b.enqueuedAt);
            } catch {
                return [];
            }
        },
    };
}
