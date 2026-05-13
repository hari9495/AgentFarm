import { getRedisClient } from '@agentfarm/redis-client';

export type RateLimitResult = {
    allowed: boolean;
    remaining: number;
    resetIn: number;
};

export type RateLimitOptions = {
    limit?: number;
    windowMs?: number;
};

type WindowEntry = {
    count: number;
    resetAt: number;
};

const store = new Map<string, WindowEntry>();

if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [key, value] of store) {
            if (now >= value.resetAt) {
                store.delete(key);
            }
        }
    }, 5 * 60_000).unref?.();
}

export const rateLimit = (key: string, options: RateLimitOptions = {}): RateLimitResult => {
    const { limit = 120, windowMs = 60_000 } = options;
    const now = Date.now();

    const existing = store.get(key);
    if (!existing || now >= existing.resetAt) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: limit - 1, resetIn: windowMs };
    }

    existing.count += 1;
    const remaining = Math.max(0, limit - existing.count);
    return {
        allowed: existing.count <= limit,
        remaining,
        resetIn: Math.max(0, existing.resetAt - now),
    };
};

export const rateLimitTenant = (
    tenantId: string,
    opts: { limit: number; windowMs: number },
): RateLimitResult => rateLimit(`tenant:${tenantId}`, opts);

/**
 * Async rate limiter — uses Redis when REDIS_URL is set for cross-instance accuracy,
 * falls back to the in-process Map when Redis is unavailable.
 */
export const rateLimitAsync = async (
    key: string,
    options: RateLimitOptions = {},
): Promise<RateLimitResult> => {
    const { limit = 120, windowMs = 60_000 } = options;
    const redis = getRedisClient();
    if (redis) {
        try {
            const windowBucket = Math.floor(Date.now() / windowMs);
            const redisKey = `ratelimit:${key}:${windowBucket}`;
            const count = await redis.incr(redisKey);
            if (count === 1) {
                await redis.expire(redisKey, Math.ceil(windowMs / 1000));
            }
            const remaining = Math.max(0, limit - count);
            return {
                allowed: count <= limit,
                remaining,
                resetIn: windowMs - (Date.now() % windowMs),
            };
        } catch {
            // Redis unavailable — fall through to in-process store
        }
    }
    return rateLimit(key, options);
};

export const rateLimitTenantAsync = (
    tenantId: string,
    opts: { limit: number; windowMs: number },
): Promise<RateLimitResult> => rateLimitAsync(`tenant:${tenantId}`, opts);
