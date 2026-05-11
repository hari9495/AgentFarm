import test from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit, rateLimitTenant } from './rate-limit.js';

// Each test uses a unique key to avoid state bleed from the shared module store.

test('rateLimitTenant allows requests under limit', () => {
    const tenantId = `t_under_${Date.now()}`;
    const opts = { limit: 5, windowMs: 60_000 };
    for (let i = 0; i < 4; i++) {
        const result = rateLimitTenant(tenantId, opts);
        assert.ok(result.allowed, `request ${i + 1} should be allowed`);
        assert.ok(result.remaining >= 0);
    }
});

test('rateLimitTenant blocks at limit with allowed: false', () => {
    const tenantId = `t_block_${Date.now()}`;
    const opts = { limit: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i++) {
        const r = rateLimitTenant(tenantId, opts);
        assert.ok(r.allowed, `request ${i + 1} should be allowed`);
    }
    const blocked = rateLimitTenant(tenantId, opts);
    assert.equal(blocked.allowed, false, '4th request should be blocked');
    assert.equal(blocked.remaining, 0);
});

test('rateLimitTenant resets after window expires', async () => {
    const tenantId = `t_reset_${Date.now()}`;
    const opts = { limit: 1, windowMs: 5 };

    const first = rateLimitTenant(tenantId, opts);
    assert.ok(first.allowed);

    const blocked = rateLimitTenant(tenantId, opts);
    assert.equal(blocked.allowed, false);

    // Wait for the window to expire
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const after = rateLimitTenant(tenantId, opts);
    assert.ok(after.allowed, 'should be allowed after window reset');
});

test('IP and tenant limits are independent', () => {
    const ipKey = `ip-indep-${Date.now()}`;
    const tenantId = `t_indep_${Date.now()}`;
    const singleOpts = { limit: 1, windowMs: 60_000 };

    // Fill up the IP bucket
    rateLimit(ipKey, singleOpts); // 1st — allowed
    const ipBlocked = rateLimit(ipKey, singleOpts); // 2nd — blocked
    assert.equal(ipBlocked.allowed, false, 'IP bucket should be exhausted');

    // Tenant bucket must still be fresh
    const tenantResult = rateLimitTenant(tenantId, singleOpts);
    assert.ok(tenantResult.allowed, 'tenant bucket should be independent of IP bucket');
});

test('tenant: prefix is used in the key', () => {
    // If rateLimitTenant uses key 'tenant:<id>', filling it up must not
    // affect a direct rateLimit call using the raw id as key (and vice versa).
    const id = `pfxcheck_${Date.now()}`;

    // Exhaust the tenant-prefixed bucket
    rateLimitTenant(id, { limit: 1, windowMs: 60_000 }); // allowed
    const tenantBlocked = rateLimitTenant(id, { limit: 1, windowMs: 60_000 }); // blocked
    assert.equal(tenantBlocked.allowed, false, 'tenant bucket should be exhausted');

    // Direct rateLimit with the raw id should be a separate bucket
    const rawResult = rateLimit(id, { limit: 1, windowMs: 60_000 });
    assert.ok(rawResult.allowed, 'raw key must be a different bucket from tenant:<id>');
});

// ---------------------------------------------------------------------------
// Phase 22 — rateLimitAgent tests
// ---------------------------------------------------------------------------
import { rateLimitAgent, getAgentRateLimitConfig, invalidateAgentRateLimitCache } from './agent-rate-limit.js';

test('rateLimitAgent allows requests under per-agent limit', () => {
    const botId = `bot_allow_${Date.now()}`;
    const result = rateLimitAgent(botId, { limit: 5, windowMs: 60_000 });
    assert.ok(result.allowed, 'first request should be allowed');
    assert.equal(result.remaining, 4, 'remaining should be limit-1');
});

test('rateLimitAgent blocks when limit is exceeded', () => {
    const botId = `bot_block_${Date.now()}`;
    rateLimitAgent(botId, { limit: 2, windowMs: 60_000 }); // 1
    rateLimitAgent(botId, { limit: 2, windowMs: 60_000 }); // 2 — at limit
    const result = rateLimitAgent(botId, { limit: 2, windowMs: 60_000 }); // over
    assert.equal(result.allowed, false, 'request over limit should be blocked');
    assert.equal(result.remaining, 0);
});

test('rateLimitAgent resets after window expires', async () => {
    const botId = `bot_reset_${Date.now()}`;
    rateLimitAgent(botId, { limit: 1, windowMs: 5 }); // consume
    const blocked = rateLimitAgent(botId, { limit: 1, windowMs: 5 }); // blocked
    assert.equal(blocked.allowed, false);
    await new Promise((resolve) => setTimeout(resolve, 10)); // wait for window
    const after = rateLimitAgent(botId, { limit: 1, windowMs: 5 });
    assert.ok(after.allowed, 'should be allowed after window expires');
});

test('rateLimitAgent key is independent from rateLimitTenant key', () => {
    const id = `indep_${Date.now()}`;
    // Exhaust agent bucket
    rateLimitAgent(id, { limit: 1, windowMs: 60_000 });
    const agentBlocked = rateLimitAgent(id, { limit: 1, windowMs: 60_000 });
    assert.equal(agentBlocked.allowed, false, 'agent bucket should be exhausted');
    // Tenant bucket with same id string must be a separate key
    const tenantResult = rateLimitTenant(id, { limit: 1, windowMs: 60_000 });
    assert.ok(tenantResult.allowed, 'tenant bucket should be independent from agent bucket');
});

test('getAgentRateLimitConfig returns null when no DB row exists', async () => {
    const mockPrisma = {
        agentRateLimit: {
            findUnique: async () => null,
        },
    } as any;
    invalidateAgentRateLimitCache('bot_noop', 'tenant_1');
    const result = await getAgentRateLimitConfig('bot_noop', 'tenant_1', mockPrisma);
    assert.equal(result, null);
});

test('getAgentRateLimitConfig cache: second call within 60 s skips DB', async () => {
    let callCount = 0;
    const mockPrisma = {
        agentRateLimit: {
            findUnique: async () => {
                callCount++;
                return { botId: 'bot_cached', tenantId: 'tenant_1', requestsPerMinute: 30, burstLimit: 5, enabled: true };
            },
        },
    } as any;
    invalidateAgentRateLimitCache('bot_cached', 'tenant_1');
    await getAgentRateLimitConfig('bot_cached', 'tenant_1', mockPrisma);
    await getAgentRateLimitConfig('bot_cached', 'tenant_1', mockPrisma); // should hit cache
    assert.equal(callCount, 1, 'DB should be queried only once within the cache TTL');
});
