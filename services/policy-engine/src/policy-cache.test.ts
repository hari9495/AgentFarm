import test from 'node:test';
import assert from 'node:assert/strict';
import type { PolicyDecision, PolicyEvaluationInput } from '@agentfarm/shared-types';
import { evaluateWithCache, invalidateTenant, type CacheClient } from './policy-cache.js';

/** In-memory CacheClient honoring the Redis subset used by the cache. */
function fakeCache(): CacheClient & { store: Map<string, string> } {
    const store = new Map<string, string>();
    return {
        store,
        async get(k) {
            return store.get(k) ?? null;
        },
        async set(k, v) {
            store.set(k, v);
            return 'OK';
        },
        async del(...keys) {
            let n = 0;
            for (const k of keys) if (store.delete(k)) n++;
            return n;
        },
        async keys(pattern) {
            const prefix = pattern.replace(/\*$/, '');
            return [...store.keys()].filter((k) => k.startsWith(prefix));
        },
    };
}

const input: PolicyEvaluationInput = {
    tenantId: 'tenant-1',
    workspaceId: 'ws-1',
    roleKey: 'developer',
    actionType: 'deploy_production',
    time: '2026-06-25T12:00:00.000Z',
};

const denyDecision: PolicyDecision = {
    effect: 'deny',
    requireApproval: false,
    escalate: false,
    reasonCode: 'policy_violation',
    reason: 'blocked',
    failClosed: false,
};

test('C3: second call with same version is served from cache (OPA hit once)', async () => {
    const cache = fakeCache();
    let calls = 0;
    const evaluateFn = async () => {
        calls++;
        return denyDecision;
    };
    const deps = { cache, policyVersion: 1, evaluateFn };

    const a = await evaluateWithCache(input, deps);
    const b = await evaluateWithCache(input, deps);
    assert.equal(a.effect, 'deny');
    assert.equal(b.effect, 'deny');
    assert.equal(calls, 1, 'OPA evaluated once, second served from cache');
});

test('C3: a new policy version bypasses the old cached entry', async () => {
    const cache = fakeCache();
    let calls = 0;
    const evaluateFn = async () => {
        calls++;
        return denyDecision;
    };

    await evaluateWithCache(input, { cache, policyVersion: 1, evaluateFn });
    await evaluateWithCache(input, { cache, policyVersion: 2, evaluateFn });
    assert.equal(calls, 2, 'version bump produces a new key namespace');
});

test('C3: invalidateTenant evicts cached entries (forces re-eval)', async () => {
    const cache = fakeCache();
    let calls = 0;
    const evaluateFn = async () => {
        calls++;
        return denyDecision;
    };
    const deps = { cache, policyVersion: 1, evaluateFn };

    await evaluateWithCache(input, deps);
    await invalidateTenant(cache, 'tenant-1');
    await evaluateWithCache(input, deps);
    assert.equal(calls, 2, 're-evaluated after invalidation');
});

test('C3: fail-closed decisions are never cached', async () => {
    const cache = fakeCache();
    let calls = 0;
    const evaluateFn = async () => {
        calls++;
        return { ...denyDecision, effect: 'require_approval' as const, failClosed: true };
    };
    const deps = { cache, policyVersion: 1, evaluateFn };

    await evaluateWithCache(input, deps);
    await evaluateWithCache(input, deps);
    assert.equal(calls, 2, 'transient fail-closed result must be re-evaluated');
    assert.equal(cache.store.size, 0, 'nothing cached');
});

test('C3: null cache is a transparent pass-through', async () => {
    let calls = 0;
    const evaluateFn = async () => {
        calls++;
        return denyDecision;
    };
    const a = await evaluateWithCache(input, { cache: null, policyVersion: 1, evaluateFn });
    const b = await evaluateWithCache(input, { cache: null, policyVersion: 1, evaluateFn });
    assert.equal(a.effect, 'deny');
    assert.equal(b.effect, 'deny');
    assert.equal(calls, 2, 'no cache means every call evaluates');
});
