import test from 'node:test';
import assert from 'node:assert/strict';
import { generateApiKey, hashApiKey, getKeyPrefix, validateApiKey } from './api-key-auth.js';

// ── generateApiKey ────────────────────────────────────────────────────────────

test('generateApiKey starts with "af_"', () => {
    const key = generateApiKey();
    assert.ok(key.startsWith('af_'), `Expected key to start with "af_", got: ${key}`);
});

test('generateApiKey produces a 67-character string', () => {
    const key = generateApiKey();
    assert.equal(key.length, 67, `Expected 67 chars ("af_" + 64 hex), got: ${key.length}`);
});

test('generateApiKey produces different keys on successive calls', () => {
    const k1 = generateApiKey();
    const k2 = generateApiKey();
    assert.notEqual(k1, k2);
});

// ── hashApiKey ────────────────────────────────────────────────────────────────

test('hashApiKey returns the same hash for the same input', () => {
    const key = generateApiKey();
    assert.equal(hashApiKey(key), hashApiKey(key));
});

test('hashApiKey returns different hashes for different inputs', () => {
    const k1 = generateApiKey();
    const k2 = generateApiKey();
    assert.notEqual(hashApiKey(k1), hashApiKey(k2));
});

// ── getKeyPrefix ──────────────────────────────────────────────────────────────

test('getKeyPrefix returns the first 11 characters', () => {
    const key = generateApiKey();
    assert.equal(getKeyPrefix(key), key.slice(0, 11));
    assert.equal(getKeyPrefix(key).length, 11);
});

// ── validateApiKey ────────────────────────────────────────────────────────────

test('validateApiKey returns null for keys that do not start with "af_"', async () => {
    const fakePrisma = {} as any;
    const result = await validateApiKey('Bearer sk_somekey', fakePrisma);
    assert.equal(result, null);
});

test('validateApiKey returns null when the database record is not found', async () => {
    const fakePrisma = {
        apiKey: {
            findUnique: async () => null,
        },
    } as any;

    const result = await validateApiKey(generateApiKey(), fakePrisma);
    assert.equal(result, null);
});

test('validateApiKey returns null when the key is disabled', async () => {
    const rawKey = generateApiKey();
    const fakePrisma = {
        apiKey: {
            findUnique: async () => ({
                id: 'key_1',
                tenantId: 'tenant_1',
                role: 'operator',
                scopes: [],
                enabled: false,
                expiresAt: null,
            }),
        },
    } as any;

    const result = await validateApiKey(rawKey, fakePrisma);
    assert.equal(result, null);
});

test('validateApiKey returns null when the key is expired', async () => {
    const rawKey = generateApiKey();
    const fakePrisma = {
        apiKey: {
            findUnique: async () => ({
                id: 'key_1',
                tenantId: 'tenant_1',
                role: 'operator',
                scopes: [],
                enabled: true,
                expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
            }),
        },
    } as any;

    const result = await validateApiKey(rawKey, fakePrisma);
    assert.equal(result, null);
});

test('validateApiKey returns ApiKeyData for a valid, enabled, non-expired key', async () => {
    const rawKey = generateApiKey();
    const fakePrisma = {
        apiKey: {
            findUnique: async () => ({
                id: 'key_valid',
                tenantId: 'tenant_abc',
                role: 'admin',
                scopes: ['read', 'write'],
                enabled: true,
                expiresAt: null,
            }),
            update: async () => ({}),
        },
    } as any;

    const result = await validateApiKey(rawKey, fakePrisma);
    assert.ok(result !== null);
    assert.equal(result.apiKeyId, 'key_valid');
    assert.equal(result.tenantId, 'tenant_abc');
    assert.equal(result.role, 'admin');
    assert.deepEqual(result.scopes, ['read', 'write']);
});
