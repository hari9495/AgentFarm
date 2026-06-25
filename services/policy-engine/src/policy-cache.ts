/**
 * policy-cache.ts — Redis-backed cache for OPA evaluations (group C3).
 *
 * The OPA call sits in the action hot path, so we cache decisions keyed by the
 * active policy *version*. Publishing a new version yields a new key namespace,
 * so stale decisions are never served; `invalidateTenant()` is also provided
 * for explicit eviction.
 *
 * Safety: fail-closed decisions (evaluator_unavailable) are NEVER cached — they
 * are transient and must be re-evaluated. Caching deterministic deny/approval
 * decisions is intentional and safe because the key is version-scoped.
 */

import type { PolicyDecision, PolicyEvaluationInput } from '@agentfarm/shared-types';

/** Minimal subset of a Redis client — keeps this package free of ioredis. */
export interface CacheClient {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<unknown>;
    del(...keys: string[]): Promise<unknown>;
    keys(pattern: string): Promise<string[]>;
}

const KEY_PREFIX = 'af:gov:eval:v1';
const DEFAULT_TTL_SECONDS = 300;

function cacheKey(input: PolicyEvaluationInput, policyVersion: number): string {
    return [
        KEY_PREFIX,
        input.tenantId,
        policyVersion,
        input.actionType,
        input.connector ?? '',
        input.tool ?? '',
        input.env ?? '',
    ].join(':');
}

export interface EvaluateWithCacheDeps {
    cache: CacheClient | null;
    /** The active policy version for this tenant/scope (0 when no policy). */
    policyVersion: number;
    /** The underlying (OPA) evaluator. */
    evaluateFn: (input: PolicyEvaluationInput) => Promise<PolicyDecision>;
    ttlSeconds?: number;
}

/**
 * Evaluates with a read-through cache. When `cache` is null (Redis unconfigured)
 * this is a transparent pass-through to `evaluateFn`.
 */
export async function evaluateWithCache(
    input: PolicyEvaluationInput,
    deps: EvaluateWithCacheDeps,
): Promise<PolicyDecision> {
    const { cache, policyVersion, evaluateFn } = deps;
    if (!cache) return evaluateFn(input);

    const key = cacheKey(input, policyVersion);

    try {
        const hit = await cache.get(key);
        if (hit) return JSON.parse(hit) as PolicyDecision;
    } catch {
        // Cache read failure must not block evaluation — fall through to OPA.
    }

    const decision = await evaluateFn(input);

    // Never cache transient fail-closed decisions.
    if (!decision.failClosed) {
        try {
            await cache.set(key, JSON.stringify(decision), 'EX', deps.ttlSeconds ?? DEFAULT_TTL_SECONDS);
        } catch {
            // best-effort cache write
        }
    }

    return decision;
}

/** Evicts all cached evaluations for a tenant (across all versions). */
export async function invalidateTenant(cache: CacheClient | null, tenantId: string): Promise<void> {
    if (!cache) return;
    const matches = await cache.keys(`${KEY_PREFIX}:${tenantId}:*`);
    if (matches.length > 0) await cache.del(...matches);
}
