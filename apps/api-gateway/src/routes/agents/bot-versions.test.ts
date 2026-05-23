import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerBotVersionRoutes } from './bot-versions.js';

// ── Session helpers ───────────────────────────────────────────────────────────

const makeSession = (tenantId = 'tenant_1', role = 'admin') => ({
    userId: 'user_1',
    tenantId,
    workspaceIds: ['ws_1'],
    role,
    expiresAt: Date.now() + 60_000,
});

// ── Prisma mock helpers ───────────────────────────────────────────────────────

const makeBot = (tenantId = 'tenant_1') => ({
    id: 'bot_1',
    workspaceId: 'ws_1',
    role: 'developer',
    status: 'active',
    workspace: { tenantId },
});

const makeVersionRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'ver_1',
    botId: 'bot_1',
    tenantId: 'tenant_1',
    versionNumber: 1,
    role: 'developer',
    status: 'active',
    roleVersion: null,
    policyPackVersion: null,
    brainConfig: null,
    changeNote: 'checkpoint',
    createdBy: 'user_1',
    createdAt: new Date('2026-05-01T00:00:00Z'),
    ...overrides,
});

type PrismaMockOpts = {
    bot?: ReturnType<typeof makeBot> | null;
    versions?: ReturnType<typeof makeVersionRecord>[];
    findVersion?: ReturnType<typeof makeVersionRecord> | null;
    updatedBot?: Record<string, unknown>;
    onBotConfigVersionCreate?: () => void;
    onBotUpdate?: () => void;
};

const makePrisma = (opts: PrismaMockOpts = {}) => {
    const {
        bot = makeBot(),
        versions = [makeVersionRecord()],
        findVersion = makeVersionRecord(),
        updatedBot = makeBot(),
        onBotConfigVersionCreate,
        onBotUpdate,
    } = opts;

    return {
        bot: {
            findUnique: async ({ where }: { where: { id: string } }) => {
                if (where.id === bot?.id) return bot;
                return null;
            },
            update: async ({ data }: { data: Record<string, unknown> }) => {
                if (onBotUpdate) onBotUpdate();
                return { ...updatedBot, ...data };
            },
        },
        botConfigVersion: {
            findMany: async () => versions,
            findUnique: async ({ where }: { where: { id: string } }) => {
                if (where.id === findVersion?.id) return findVersion;
                return null;
            },
            aggregate: async () => ({ _max: { versionNumber: versions.length > 0 ? 1 : null } }),
            create: async ({ data }: { data: Record<string, unknown> }) => {
                if (onBotConfigVersionCreate) onBotConfigVersionCreate();
                return makeVersionRecord({ ...data, versionNumber: 2 });
            },
        },
        auditEvent: {
            create: async () => ({}),
        },
    } as any;
};

// ── Tests ─────────────────────────────────────────────────────────────────────

// 1. GET /v1/agents/:botId/versions — returns version list
test('GET /v1/agents/:botId/versions — returns version list', async () => {
    const app = Fastify();
    await registerBotVersionRoutes(app, { getSession: () => makeSession(), prisma: makePrisma() });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/agents/bot_1/versions' });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ versions: unknown[] }>();
        assert.ok(Array.isArray(body.versions));
        assert.equal(body.versions.length, 1);
    } finally {
        await app.close();
    }
});

// 2. GET /v1/agents/:botId/versions — 404 if bot not in tenant
test('GET /v1/agents/:botId/versions — 404 if bot not in tenant', async () => {
    const app = Fastify();
    await registerBotVersionRoutes(app, {
        getSession: () => makeSession('other_tenant'),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/agents/bot_1/versions' });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json<{ error: string }>().error, 'not_found');
    } finally {
        await app.close();
    }
});

// 3. GET /v1/agents/:botId/versions/:versionId — 200 with version data
test('GET /v1/agents/:botId/versions/:versionId — 200 with version data', async () => {
    const app = Fastify();
    await registerBotVersionRoutes(app, { getSession: () => makeSession(), prisma: makePrisma() });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/agents/bot_1/versions/ver_1' });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ version: { id: string } }>();
        assert.equal(body.version.id, 'ver_1');
    } finally {
        await app.close();
    }
});

// 4. GET /v1/agents/:botId/versions/:versionId — 404 on wrong tenant
test('GET /v1/agents/:botId/versions/:versionId — 404 on wrong tenant', async () => {
    const app = Fastify();
    await registerBotVersionRoutes(app, {
        getSession: () => makeSession('other_tenant'),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/agents/bot_1/versions/ver_1' });
        assert.equal(res.statusCode, 404);
    } finally {
        await app.close();
    }
});

// 5. POST /v1/agents/:botId/versions/snapshot — 201 returns new version
test('POST /v1/agents/:botId/versions/snapshot — 201 returns new version', async () => {
    const app = Fastify();
    await registerBotVersionRoutes(app, { getSession: () => makeSession('tenant_1', 'operator'), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/agents/bot_1/versions/snapshot',
            payload: { changeNote: 'before migration' },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json<{ version: { id: string } }>();
        assert.ok(body.version);
    } finally {
        await app.close();
    }
});

// 6. POST /v1/agents/:botId/versions/snapshot — 403 if viewer role
test('POST /v1/agents/:botId/versions/snapshot — 403 if viewer role', async () => {
    const app = Fastify();
    await registerBotVersionRoutes(app, { getSession: () => makeSession('tenant_1', 'viewer'), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/agents/bot_1/versions/snapshot',
            payload: {},
        });
        assert.equal(res.statusCode, 403);
        assert.equal(res.json<{ error: string }>().error, 'insufficient_role');
    } finally {
        await app.close();
    }
});

// 7. POST /v1/agents/:botId/versions/:versionId/restore — 200 returns updated bot
test('POST /v1/agents/:botId/versions/:versionId/restore — 200 returns updated bot', async () => {
    const app = Fastify();
    await registerBotVersionRoutes(app, { getSession: () => makeSession(), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/agents/bot_1/versions/ver_1/restore',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ bot: { id: string } }>();
        assert.ok(body.bot);
    } finally {
        await app.close();
    }
});

// 8. POST /v1/agents/:botId/versions/:versionId/restore — 403 if operator role
test('POST /v1/agents/:botId/versions/:versionId/restore — 403 if operator role', async () => {
    const app = Fastify();
    await registerBotVersionRoutes(app, { getSession: () => makeSession('tenant_1', 'operator'), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/agents/bot_1/versions/ver_1/restore',
        });
        assert.equal(res.statusCode, 403);
        assert.equal(res.json<{ error: string }>().error, 'insufficient_role');
    } finally {
        await app.close();
    }
});

// 9. POST /v1/agents/:botId/versions/:versionId/restore — 404 on wrong tenant
test('POST /v1/agents/:botId/versions/:versionId/restore — 404 on wrong tenant', async () => {
    const app = Fastify();
    await registerBotVersionRoutes(app, {
        getSession: () => makeSession('other_tenant'),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/agents/bot_1/versions/ver_1/restore',
        });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json<{ error: string }>().error, 'not_found');
    } finally {
        await app.close();
    }
});
