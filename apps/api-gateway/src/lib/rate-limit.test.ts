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
