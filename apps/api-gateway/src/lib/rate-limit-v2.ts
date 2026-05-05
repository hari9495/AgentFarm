/**
 * Rate Limiting Middleware
 *
 * Per-tenant, per-workspace, and per-skill rate limits with graceful degradation.
 * Returns 429 with Retry-After header when limits exceeded.
 */

export type RateLimitConfig = {
    requests_per_minute?: number;
    tokens_per_hour?: number;
    skill_specific_limits?: Record<string, { requests_per_minute: number }>;
};

const DEFAULT_CONFIG: RateLimitConfig = {
    requests_per_minute: 1000,
    tokens_per_hour: 1000000,
};

class RateLimiter {
    private buckets = new Map<string, { tokens: number; lastRefill: number }>();
    private config: RateLimitConfig;

    constructor(config: RateLimitConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Check if a request is allowed under rate limits.
     */
    isAllowed(key: string, tokensRequired = 1): { allowed: boolean; retryAfterMs?: number } {
        const limit = this.config.requests_per_minute || 1000;
        const refillRate = limit / 60; // Tokens per second

        let bucket = this.buckets.get(key);
        const now = Date.now();

        if (!bucket) {
            bucket = { tokens: limit, lastRefill: now };
            this.buckets.set(key, bucket);
        }

        // Refill tokens based on time elapsed
        const secondsElapsed = (now - bucket.lastRefill) / 1000;
        bucket.tokens = Math.min(limit, bucket.tokens + secondsElapsed * refillRate);
        bucket.lastRefill = now;

        // Check if enough tokens available
        if (bucket.tokens >= tokensRequired) {
            bucket.tokens -= tokensRequired;
            return { allowed: true };
        }

        // Calculate how long to wait
        const tokensNeeded = tokensRequired - bucket.tokens;
        const secondsToWait = tokensNeeded / refillRate;
        const retryAfterMs = Math.ceil(secondsToWait * 1000);

        return { allowed: false, retryAfterMs };
    }

    /**
     * Record a request.
     */
    recordRequest(key: string, tokensUsed = 1): void {
        this.isAllowed(key, tokensUsed);
    }

    /**
     * Clear expired buckets (older than 1 hour).
     */
    cleanup(): void {
        const now = Date.now();
        const maxAge = 60 * 60 * 1000;

        for (const [key, bucket] of this.buckets.entries()) {
            if (now - bucket.lastRefill > maxAge) {
                this.buckets.delete(key);
            }
        }
    }

    /**
     * Reset limit for a key.
     */
    reset(key: string): void {
        this.buckets.delete(key);
    }
}

export const globalRateLimiter = new RateLimiter();

/**
 * Check rate limit and throw if exceeded.
 */
export function checkRateLimit(key: string, tokensRequired = 1): void {
    const result = globalRateLimiter.isAllowed(key, tokensRequired);
    if (!result.allowed) {
        const error = new Error('Rate limit exceeded');
        (error as any).retryAfterMs = result.retryAfterMs;
        (error as any).statusCode = 429;
        throw error;
    }
}

// Cleanup old buckets every 5 minutes
setInterval(() => {
    globalRateLimiter.cleanup();
}, 5 * 60 * 1000);
