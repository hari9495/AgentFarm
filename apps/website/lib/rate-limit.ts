// In-memory sliding-window rate limiter for per-user API throttling.
// State is process-local; resets on server restart (acceptable for dev + single-process prod).

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 60; // requests per user per window

type Timestamps = number[];
const windows = new Map<string, Timestamps>();

export type RateLimitResult =
    | { allowed: true }
    | { allowed: false; retryAfterMs: number };

/**
 * Check whether a user has exceeded their per-minute request budget.
 * Call before the main handler logic and return 429 if not allowed.
 *
 * @param userId - stable user identifier (e.g. session user id)
 */
export function checkRateLimit(userId: string): RateLimitResult {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;

    const existing = windows.get(userId);
    const fresh: Timestamps = existing ? existing.filter((ts) => ts > cutoff) : [];

    if (fresh.length >= MAX_REQUESTS) {
        // The oldest timestamp in the window determines when the user can retry.
        const oldest = fresh[0];
        return { allowed: false, retryAfterMs: oldest + WINDOW_MS - now };
    }

    fresh.push(now);
    windows.set(userId, fresh);
    return { allowed: true };
}

/** Flush state — for testing only. */
export function _resetRateLimitState(): void {
    windows.clear();
}
