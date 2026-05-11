/**
 * Phase 23 — Circuit breaker state machine.
 *
 * Protects outbound calls (agent-runtime dispatch, webhook delivery) from
 * cascading failures. Uses the same module-level Map pattern as rate-limit.ts.
 *
 * Three states:
 *   closed   — normal operation; failures accumulate toward FAILURE_THRESHOLD
 *   open     — fast-fail for OPEN_DURATION_MS; no outbound calls attempted
 *   half-open — one probe is allowed through; SUCCESS_THRESHOLD consecutive
 *               successes close the circuit; one failure re-opens it
 *
 * No classes — plain object store + exported functions.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CircuitState = 'closed' | 'open' | 'half-open';

export type CircuitEntry = {
    state: CircuitState;
    failureCount: number;
    successCount: number;          // successes accumulated in half-open
    openedAt: number | null;       // Date.now() when transitioned to open
    nextRetryAt: number | null;    // Date.now() + openDurationMs
};

export type CircuitBreakerOpts = {
    failureThreshold?: number;     // failures before opening (default 5)
    successThreshold?: number;     // half-open successes before closing (default 2)
    openDurationMs?: number;       // ms to stay open before probing (default 30_000)
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const FAILURE_THRESHOLD = 5;
const SUCCESS_THRESHOLD = 2;
const OPEN_DURATION_MS = 30_000;

// ---------------------------------------------------------------------------
// In-memory store (module-level singleton, same pattern as rate-limit.ts)
// ---------------------------------------------------------------------------

const circuits = new Map<string, CircuitEntry>();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getOrCreate(key: string): CircuitEntry {
    const existing = circuits.get(key);
    if (existing) return existing;
    const fresh: CircuitEntry = {
        state: 'closed',
        failureCount: 0,
        successCount: 0,
        openedAt: null,
        nextRetryAt: null,
    };
    circuits.set(key, fresh);
    return fresh;
}

function resolveOpts(opts?: CircuitBreakerOpts): Required<CircuitBreakerOpts> {
    return {
        failureThreshold: opts?.failureThreshold ?? FAILURE_THRESHOLD,
        successThreshold: opts?.successThreshold ?? SUCCESS_THRESHOLD,
        openDurationMs: opts?.openDurationMs ?? OPEN_DURATION_MS,
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether a call to the target keyed by `key` is allowed.
 * Returns false if the circuit is open and the retry window has not elapsed.
 * Transitions open → half-open automatically when the window expires.
 */
export function isAllowed(key: string, opts?: CircuitBreakerOpts): boolean {
    const { openDurationMs } = resolveOpts(opts);
    const entry = getOrCreate(key);

    if (entry.state === 'closed') {
        return true;
    }

    if (entry.state === 'open') {
        const now = Date.now();
        if (entry.nextRetryAt !== null && now >= entry.nextRetryAt) {
            // Transition to half-open — allow one probe through
            entry.state = 'half-open';
            entry.successCount = 0;
            return true;
        }
        // Still within the open window — fast fail
        return false;
    }

    // state === 'half-open' — allow probes through
    return true;
}

/**
 * Record a successful call outcome.
 * In half-open: accumulates successes; closes the circuit after successThreshold.
 * In closed: resets the failure counter.
 */
export function recordSuccess(key: string, opts?: CircuitBreakerOpts): void {
    const { successThreshold } = resolveOpts(opts);
    const entry = getOrCreate(key);

    if (entry.state === 'half-open') {
        entry.successCount += 1;
        if (entry.successCount >= successThreshold) {
            // Close the circuit
            entry.state = 'closed';
            entry.failureCount = 0;
            entry.successCount = 0;
            entry.openedAt = null;
            entry.nextRetryAt = null;
        }
        return;
    }

    if (entry.state === 'closed') {
        // Success in closed state resets the failure accumulator
        entry.failureCount = 0;
    }
}

/**
 * Record a failed call outcome.
 * In half-open: immediately re-opens the circuit.
 * In closed: increments failure count; opens circuit when threshold reached.
 */
export function recordFailure(key: string, opts?: CircuitBreakerOpts): void {
    const { failureThreshold, openDurationMs } = resolveOpts(opts);
    const entry = getOrCreate(key);

    entry.failureCount += 1;

    if (entry.state === 'half-open') {
        // One failure in half-open → re-open immediately
        const now = Date.now();
        entry.state = 'open';
        entry.openedAt = now;
        entry.nextRetryAt = now + openDurationMs;
        return;
    }

    if (entry.state === 'closed' && entry.failureCount >= failureThreshold) {
        const now = Date.now();
        entry.state = 'open';
        entry.openedAt = now;
        entry.nextRetryAt = now + openDurationMs;
    }
}

/**
 * Manually reset a circuit to closed (deletes the entry; next call starts fresh).
 */
export function resetCircuit(key: string): void {
    circuits.delete(key);
}

/**
 * Get the current state snapshot for a key. Returns null if not in the map.
 */
export function getCircuitState(key: string): CircuitEntry | null {
    return circuits.get(key) ?? null;
}

/**
 * Return the full circuits map (for observability / list endpoint).
 */
export function getAllCircuitStates(): Map<string, CircuitEntry> {
    return circuits;
}
