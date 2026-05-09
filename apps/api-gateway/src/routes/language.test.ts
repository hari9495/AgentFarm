import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerLanguageRoutes } from './language.js';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

const session = (): SessionContext => ({
    userId: 'u1',
    tenantId: 't1',
    workspaceIds: ['ws1'],
    expiresAt: Date.now() + 60_000,
});

// ---------------------------------------------------------------------------
// GET /v1/language/tenant
// ---------------------------------------------------------------------------

test('returns default config when no tenant record exists', async () => {
    const prisma = {
        tenantLanguageConfig: {
            findUnique: async () => null,
        },
    };

    const app = Fastify({ logger: false });
    await registerLanguageRoutes(app, { getSession: () => session(), prisma: prisma as never });

    try {
        const res = await app.inject({ method: 'GET', url: '/v1/language/tenant' });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { defaultLanguage: string; ticketLanguage: string; autoDetect: boolean };
        assert.equal(body.defaultLanguage, 'en');
        assert.equal(body.ticketLanguage, 'en');
        assert.equal(body.autoDetect, true);
    } finally {
        await app.close();
    }
});

test('returns existing tenant config when record exists', async () => {
    const stored = { defaultLanguage: 'ja', ticketLanguage: 'en', autoDetect: true };
    const prisma = {
        tenantLanguageConfig: {
            findUnique: async () => stored,
        },
    };

    const app = Fastify({ logger: false });
    await registerLanguageRoutes(app, { getSession: () => session(), prisma: prisma as never });

    try {
        const res = await app.inject({ method: 'GET', url: '/v1/language/tenant' });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { defaultLanguage: string };
        assert.equal(body.defaultLanguage, 'ja');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// GET /v1/language/workspace/:workspaceId
// ---------------------------------------------------------------------------

test('returns null preferredLanguage when no workspace record exists', async () => {
    const prisma = {
        workspaceLanguageConfig: {
            findUnique: async () => null,
        },
    };

    const app = Fastify({ logger: false });
    await registerLanguageRoutes(app, { getSession: () => session(), prisma: prisma as never });

    try {
        const res = await app.inject({ method: 'GET', url: '/v1/language/workspace/ws1' });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { preferredLanguage: null };
        assert.equal(body.preferredLanguage, null);
    } finally {
        await app.close();
    }
});

test('returns preferredLanguage when workspace record exists', async () => {
    const prisma = {
        workspaceLanguageConfig: {
            findUnique: async () => ({ preferredLanguage: 'ko' }),
        },
    };

    const app = Fastify({ logger: false });
    await registerLanguageRoutes(app, { getSession: () => session(), prisma: prisma as never });

    try {
        const res = await app.inject({ method: 'GET', url: '/v1/language/workspace/ws1' });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { preferredLanguage: string };
        assert.equal(body.preferredLanguage, 'ko');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// GET /v1/language/user/:userId
// ---------------------------------------------------------------------------

test('returns null fields when no user profile exists', async () => {
    const prisma = {
        userLanguageProfile: {
            findUnique: async () => null,
        },
    };

    const app = Fastify({ logger: false });
    await registerLanguageRoutes(app, { getSession: () => session(), prisma: prisma as never });

    try {
        const res = await app.inject({ method: 'GET', url: '/v1/language/user/u1' });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { detectedLanguage: null; preferredLanguage: null };
        assert.equal(body.detectedLanguage, null);
        assert.equal(body.preferredLanguage, null);
    } finally {
        await app.close();
    }
});

test('returns profile fields when user profile exists', async () => {
    const lastDetectedAt = new Date('2026-01-01T00:00:00.000Z');
    const prisma = {
        userLanguageProfile: {
            findUnique: async () => ({
                detectedLanguage: 'ja',
                preferredLanguage: null,
                confidence: 0.92,
                lastDetectedAt,
            }),
        },
    };

    const app = Fastify({ logger: false });
    await registerLanguageRoutes(app, { getSession: () => session(), prisma: prisma as never });

    try {
        const res = await app.inject({ method: 'GET', url: '/v1/language/user/u1' });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { detectedLanguage: string; confidence: number };
        assert.equal(body.detectedLanguage, 'ja');
        assert.equal(body.confidence, 0.92);
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// POST /v1/language/user
// ---------------------------------------------------------------------------

test('upserts user language profile and returns ok: true', async () => {
    const upsertCalls: unknown[] = [];
    const prisma = {
        userLanguageProfile: {
            upsert: async (args: unknown) => {
                upsertCalls.push(args);
                return { ok: true };
            },
        },
    };

    const app = Fastify({ logger: false });
    await registerLanguageRoutes(app, { getSession: () => session(), prisma: prisma as never });

    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/language/user',
            payload: { userId: 'u1', language: 'ja', confidence: 0.92 },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { ok: boolean };
        assert.equal(body.ok, true);
        assert.equal(upsertCalls.length, 1);
        const call = upsertCalls[0] as { where: { tenantId_userId: { tenantId: string; userId: string } } };
        assert.deepEqual(call.where.tenantId_userId, { tenantId: 't1', userId: 'u1' });
    } finally {
        await app.close();
    }
});

test('returns 400 when POST /v1/language/user body is missing required fields', async () => {
    const prisma = {
        userLanguageProfile: {
            upsert: async () => ({}),
        },
    };

    const app = Fastify({ logger: false });
    await registerLanguageRoutes(app, { getSession: () => session(), prisma: prisma as never });

    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/language/user',
            payload: {},
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// PATCH /v1/language/tenant
// ---------------------------------------------------------------------------

test('upserts tenant config with provided fields only', async () => {
    const upsertCalls: unknown[] = [];
    const prisma = {
        tenantLanguageConfig: {
            upsert: async (args: unknown) => {
                upsertCalls.push(args);
                return { defaultLanguage: 'ja', ticketLanguage: 'en', autoDetect: true };
            },
        },
    };

    const app = Fastify({ logger: false });
    await registerLanguageRoutes(app, { getSession: () => session(), prisma: prisma as never });

    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/language/tenant',
            payload: { defaultLanguage: 'ja' },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { defaultLanguage: string };
        assert.equal(body.defaultLanguage, 'ja');
        assert.equal(upsertCalls.length, 1);
        const call = upsertCalls[0] as { update: { defaultLanguage?: string; ticketLanguage?: string; autoDetect?: boolean } };
        assert.deepEqual(call.update, { defaultLanguage: 'ja' });
    } finally {
        await app.close();
    }
});

test('returns 400 when PATCH /v1/language/tenant body is empty', async () => {
    const prisma = {
        tenantLanguageConfig: {
            upsert: async () => ({}),
        },
    };

    const app = Fastify({ logger: false });
    await registerLanguageRoutes(app, { getSession: () => session(), prisma: prisma as never });

    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/language/tenant',
            payload: {},
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});
