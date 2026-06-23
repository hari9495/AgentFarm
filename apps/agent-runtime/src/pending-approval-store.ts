/**
 * Durable store for pending approvals.
 *
 * Tasks that route to the approval queue are held in the runtime's in-memory
 * `workerLoop.pendingApprovals`. If the runtime restarts while a task awaits a
 * human decision, that in-memory state is lost and the task is orphaned forever
 * (stuck at `approval_queued`). This store mirrors each pending approval to Redis
 * so it survives restarts: persist on enqueue, delete on resolve, and rehydrate
 * on startup or on a `/decision` cache miss.
 *
 * Fully fail-safe: every function no-ops (or returns empty) when Redis is
 * unconfigured or unreachable, so approval handling never breaks on Redis errors.
 */

import { getRedisClient } from '@agentfarm/redis-client';

type RedisLike = {
    set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<unknown>;
    get(key: string): Promise<string | null>;
    del(key: string): Promise<unknown>;
    keys(pattern: string): Promise<string[]>;
    mget(...keys: string[]): Promise<(string | null)[]>;
};

const KEY_PREFIX = 'af:pending-approval:';

/** TTL so an unresolved approval eventually expires rather than leaking forever. */
const TTL_SECONDS = (() => {
    const raw = process.env['AGENTFARM_PENDING_APPROVAL_TTL_S'];
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 7 * 24 * 60 * 60; // default 7 days
})();

const keyFor = (tenantId: string, taskId: string): string => `${KEY_PREFIX}${tenantId}:${taskId}`;
const patternFor = (tenantId: string): string => `${KEY_PREFIX}${tenantId}:*`;

const resolveClient = (client?: RedisLike | null): RedisLike | null =>
    client !== undefined ? client : (getRedisClient() as unknown as RedisLike | null);

export async function persistPendingApproval(
    tenantId: string,
    taskId: string,
    record: unknown,
    client?: RedisLike | null,
): Promise<void> {
    const redis = resolveClient(client);
    if (!redis || !tenantId || !taskId) return;
    try {
        await redis.set(keyFor(tenantId, taskId), JSON.stringify(record), 'EX', TTL_SECONDS);
    } catch (err) {
        console.warn('[pending-approval-store] persist failed:', String(err));
    }
}

export async function deletePersistedPendingApproval(
    tenantId: string,
    taskId: string,
    client?: RedisLike | null,
): Promise<void> {
    const redis = resolveClient(client);
    if (!redis || !tenantId || !taskId) return;
    try {
        await redis.del(keyFor(tenantId, taskId));
    } catch (err) {
        console.warn('[pending-approval-store] delete failed:', String(err));
    }
}

export async function loadPersistedPendingApproval<T>(
    tenantId: string,
    taskId: string,
    client?: RedisLike | null,
): Promise<T | null> {
    const redis = resolveClient(client);
    if (!redis || !tenantId || !taskId) return null;
    try {
        const raw = await redis.get(keyFor(tenantId, taskId));
        return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
        console.warn('[pending-approval-store] load failed:', String(err));
        return null;
    }
}

export async function loadAllPersistedPendingApprovals<T>(
    tenantId: string,
    client?: RedisLike | null,
): Promise<T[]> {
    const redis = resolveClient(client);
    if (!redis || !tenantId) return [];
    try {
        const keys = await redis.keys(patternFor(tenantId));
        if (keys.length === 0) return [];
        const values = await redis.mget(...keys);
        return values
            .filter((v): v is string => typeof v === 'string' && v.length > 0)
            .map((v) => {
                try {
                    return JSON.parse(v) as T;
                } catch {
                    return null;
                }
            })
            .filter((v): v is T => v !== null);
    } catch (err) {
        console.warn('[pending-approval-store] loadAll failed:', String(err));
        return [];
    }
}
