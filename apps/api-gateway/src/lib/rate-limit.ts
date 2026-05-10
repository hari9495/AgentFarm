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
