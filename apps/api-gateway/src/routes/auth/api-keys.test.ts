import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerApiKeyRoutes } from './api-keys.js';
import { generateApiKey, getKeyPrefix } from '../lib/api-key-auth.js';

// ── Session helpers ───────────────────────────────────────────────────────────

const makeSession = (overrides: Record<string, unknown> = {}) => ({
    userId: 'user_operator',
    tenantId: 'tenant_1',
    workspaceIds: ['ws_1'],
    role: 'operator',
    expiresAt: Date.now() + 60_000,
    ...overrides,
});

// ── Prisma mock helper ────────────────────────────────────────────────────────

const makeStoredKey = (overrides: Record<string, unknown> = {}) => {
    const rawKey = generateApiKey();
    // keyHash is intentionally excluded — matches safeSelect used by routes
    return {
        id: 'key_1',
        tenantId: 'tenant_1',
        createdBy: 'user_operator',
        name: 'CI Token',
        keyPrefix: getKeyPrefix(rawKey),
        scopes: ['read'],
        role: 'operator',
        enabled: true,
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date('2026-05-01T00:00:00Z'),
        ...overrides,
    };
};

const makePrisma = (overrides: Record<string, unknown> = {}) =>
({
    apiKey: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({
            id: 'key_new',
            tenantId: data.tenantId,
            createdBy: data.createdBy,
            name: data.name,
            keyPrefix: data.keyPrefix,
            scopes: data.scopes,
            role: data.role,
            enabled: true,
            expiresAt: data.expiresAt ?? null,
            lastUsedAt: null,
            createdAt: new Date(),
        }),
        findMany: async () => [makeStoredKey()],
        findUnique: async ({ where }: { where: { id?: string; keyHash?: string } }) => {
            if (where.id === 'key_1') return makeStoredKey();
            return null;
        },
        update: async ({ data }: { data: Record<string, unknown> }) => ({
            ...makeStoredKey(),
            ...data,
        }),
        delete: async () => makeStoredKey(),
    },
    ...overrides,
} as any);

// ── Tests ─────────────────────────────────────────────────────────────────────

// 1. POST /v1/api-keys — creates a key and returns rawKey
test('POST /v1/api-keys — creates a key and returns rawKey', async () => {
    const app = Fastify();
    await registerApiKeyRoutes(app, { getSession: () => makeSession(), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/api-keys',
            payload: { name: 'CI Token', role: 'operator', scopes: ['read'] },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json<{ apiKey: Record<string, unknown>; rawKey: string; warning: string }>();
        assert.ok(body.rawKey, 'rawKey must be present');
        assert.ok(body.apiKey, 'apiKey object must be present');
        assert.ok(body.warning, 'warning must be present');
        assert.equal('keyHash' in body.apiKey, false, 'keyHash must never be returned');
    } finally {
        await app.close();
    }
});

// 2. POST /v1/api-keys — rawKey starts with "af_"
test('POST /v1/api-keys — rawKey starts with "af_"', async () => {
    const app = Fastify();
    await registerApiKeyRoutes(app, { getSession: () => makeSession(), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/api-keys',
            payload: { name: 'Deploy Key', role: 'viewer' },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json<{ rawKey: string }>();
        assert.ok(body.rawKey.startsWith('af_'), `Expected rawKey to start with "af_", got: ${body.rawKey}`);
    } finally {
        await app.close();
    }
});

// 3. POST /v1/api-keys — 400 for invalid role
test('POST /v1/api-keys — 400 for invalid role', async () => {
    const app = Fastify();
    await registerApiKeyRoutes(app, { getSession: () => makeSession(), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/api-keys',
            payload: { name: 'Bad Role Key', role: 'superadmin' },
        });
        assert.equal(res.statusCode, 400);
        const body = res.json<{ error: string }>();
        assert.equal(body.error, 'invalid_role');
    } finally {
        await app.close();
    }
});

// 4. POST /v1/api-keys — 403 for viewer session (requires operator+)
test('POST /v1/api-keys — 403 when caller is viewer', async () => {
    const app = Fastify();
    await registerApiKeyRoutes(app, {
        getSession: () => makeSession({ role: 'viewer' }),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/api-keys',
            payload: { name: 'Viewer Key', role: 'viewer' },
        });
        assert.equal(res.statusCode, 403);
        const body = res.json<{ error: string; required: string }>();
        assert.equal(body.error, 'insufficient_role');
        assert.equal(body.required, 'operator');
    } finally {
        await app.close();
    }
});

// 5. GET /v1/api-keys — returns list without keyHash
test('GET /v1/api-keys — returns list without keyHash', async () => {
    const app = Fastify();
    await registerApiKeyRoutes(app, { getSession: () => makeSession(), prisma: makePrisma() });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/api-keys' });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ keys: Record<string, unknown>[] }>();
        assert.ok(Array.isArray(body.keys));
        for (const k of body.keys) {
            assert.equal('keyHash' in k, false, 'keyHash must not be present in list response');
            assert.ok(k.id, 'id must be present');
            assert.ok(k.keyPrefix, 'keyPrefix must be present');
        }
    } finally {
        await app.close();
    }
});

// 6. GET /v1/api-keys/:keyId — 404 for unknown id
test('GET /v1/api-keys/:keyId — 404 for unknown id', async () => {
    const app = Fastify();
    await registerApiKeyRoutes(app, { getSession: () => makeSession(), prisma: makePrisma() });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/api-keys/key_unknown' });
        assert.equal(res.statusCode, 404);
        const body = res.json<{ error: string }>();
        assert.equal(body.error, 'not_found');
    } finally {
        await app.close();
    }
});

// 7. PATCH /v1/api-keys/:keyId — updates enabled field
test('PATCH /v1/api-keys/:keyId — updates enabled to false', async () => {
    const app = Fastify();
    const prisma = makePrisma({
        apiKey: {
            ...makePrisma().apiKey,
            findUnique: async ({ where }: { where: { id?: string } }) => {
                if (where.id === 'key_1') return makeStoredKey();
                return null;
            },
            update: async ({ data }: { data: Record<string, unknown> }) => ({
                ...makeStoredKey(),
                enabled: data.enabled,
            }),
        },
    });
    await registerApiKeyRoutes(app, { getSession: () => makeSession(), prisma });
    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/api-keys/key_1',
            payload: { enabled: false },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ apiKey: Record<string, unknown> }>();
        assert.equal(body.apiKey.enabled, false);
        assert.equal('keyHash' in body.apiKey, false, 'keyHash must not be returned');
    } finally {
        await app.close();
    }
});

// 8. DELETE /v1/api-keys/:keyId — 403 when caller is operator (requires admin+)
test('DELETE /v1/api-keys/:keyId — 403 when caller is operator', async () => {
    const app = Fastify();
    await registerApiKeyRoutes(app, {
        getSession: () => makeSession({ role: 'operator' }),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({ method: 'DELETE', url: '/v1/api-keys/key_1' });
        assert.equal(res.statusCode, 403);
        const body = res.json<{ error: string; required: string }>();
        assert.equal(body.error, 'insufficient_role');
        assert.equal(body.required, 'admin');
    } finally {
        await app.close();
    }
});
