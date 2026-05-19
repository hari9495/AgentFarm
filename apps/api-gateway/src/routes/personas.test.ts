import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerPersonaRoutes } from './personas.js';

type StoredPersona = {
    id: string;
    botId: string;
    tenantId: string;
    displayName: string;
    emailAddress: string;
    avatarUrl: string | null;
    communicationStyle: string;
    disclosureStatement: string;
    language: string;
    timezone: string;
    workingHours: unknown;
    createdAt: Date;
    updatedAt: Date;
};

type StoredBot = {
    id: string;
    workspaceId: string;
    tenantId: string;
};

const makeSession = (tenantId = 'tenant_1') => ({
    userId: 'user_1',
    tenantId,
    workspaceIds: ['ws_1'],
    role: 'operator',
    expiresAt: Date.now() + 60_000,
});

const BOT_ID = 'bot_1';
const OTHER_BOT_ID = 'bot_other';

function buildPrismaStub() {
    const personas = new Map<string, StoredPersona>();
    const bots = new Map<string, StoredBot>([
        [BOT_ID, { id: BOT_ID, workspaceId: 'ws_1', tenantId: 'tenant_1' }],
        [OTHER_BOT_ID, { id: OTHER_BOT_ID, workspaceId: 'ws_other', tenantId: 'tenant_other' }],
    ]);

    return {
        personas,
        bots,
        prisma: {
            bot: {
                findFirst: async ({ where }: { where: { id: string; workspace: { tenantId: string } } }) => {
                    const bot = bots.get(where.id);
                    if (!bot) return null;
                    if (bot.tenantId !== where.workspace.tenantId) return null;
                    return bot;
                },
            },
            agentPersona: {
                findUnique: async ({ where }: { where: { botId: string } }) => {
                    return personas.get(where.botId) ?? null;
                },
                create: async ({ data }: { data: Omit<StoredPersona, 'id' | 'createdAt' | 'updatedAt'> }) => {
                    const now = new Date();
                    const p: StoredPersona = {
                        id: `persona_${Date.now()}`,
                        botId: data.botId,
                        tenantId: data.tenantId,
                        displayName: data.displayName,
                        emailAddress: data.emailAddress,
                        avatarUrl: data.avatarUrl ?? null,
                        communicationStyle: data.communicationStyle ?? 'professional',
                        disclosureStatement: data.disclosureStatement ?? 'This message was sent by an AI agent.',
                        language: data.language ?? 'en',
                        timezone: data.timezone ?? 'UTC',
                        workingHours: data.workingHours ?? null,
                        createdAt: now,
                        updatedAt: now,
                    };
                    personas.set(data.botId, p);
                    return p;
                },
                update: async ({ where, data }: { where: { botId: string }; data: Partial<StoredPersona> }) => {
                    const existing = personas.get(where.botId);
                    if (!existing) throw new Error('not found');
                    const updated = { ...existing, ...data, updatedAt: new Date() };
                    personas.set(where.botId, updated);
                    return updated;
                },
            },
        } as unknown as import('@prisma/client').PrismaClient,
    };
}

function buildApp(tenantId = 'tenant_1', _botIdOverride?: string) {
    const app = Fastify();
    const { prisma } = buildPrismaStub();
    registerPersonaRoutes(app, {
        getSession: () => makeSession(tenantId),
        prisma,
    });
    return { app, prisma };
}

// ---------------------------------------------------------------------------
// GET /v1/personas/:botId
// ---------------------------------------------------------------------------

test('GET /v1/personas/:botId — 404 when persona does not exist', async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: 'GET', url: `/v1/personas/${BOT_ID}` });
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error, 'persona_not_found');
});

test('GET /v1/personas/:botId — 404 when bot not in tenant', async () => {
    const { app } = buildApp('tenant_stranger');
    const res = await app.inject({ method: 'GET', url: `/v1/personas/${BOT_ID}` });
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error, 'bot_not_found');
});

// ---------------------------------------------------------------------------
// POST /v1/personas/:botId
// ---------------------------------------------------------------------------

test('POST /v1/personas/:botId — creates persona and returns 201', async () => {
    const { app } = buildApp();
    const res = await app.inject({
        method: 'POST',
        url: `/v1/personas/${BOT_ID}`,
        payload: { displayName: 'Alex', emailAddress: 'alex@agentfarm.ai' },
    });
    assert.equal(res.statusCode, 201);
    const body = res.json();
    assert.equal(body.persona.displayName, 'Alex');
    assert.equal(body.persona.emailAddress, 'alex@agentfarm.ai');
    assert.equal(body.persona.botId, BOT_ID);
    assert.equal(body.persona.communicationStyle, 'professional');
});

test('POST /v1/personas/:botId — 400 when displayName missing', async () => {
    const { app } = buildApp();
    const res = await app.inject({
        method: 'POST',
        url: `/v1/personas/${BOT_ID}`,
        payload: { emailAddress: 'alex@agentfarm.ai' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().field, 'displayName');
});

test('POST /v1/personas/:botId — 409 when persona already exists', async () => {
    const { app } = buildApp();
    await app.inject({
        method: 'POST',
        url: `/v1/personas/${BOT_ID}`,
        payload: { displayName: 'Alex', emailAddress: 'alex@agentfarm.ai' },
    });
    const res = await app.inject({
        method: 'POST',
        url: `/v1/personas/${BOT_ID}`,
        payload: { displayName: 'Alex', emailAddress: 'alex@agentfarm.ai' },
    });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error, 'persona_already_exists');
});

test('POST /v1/personas/:botId — 400 for invalid communicationStyle', async () => {
    const { app } = buildApp();
    const res = await app.inject({
        method: 'POST',
        url: `/v1/personas/${BOT_ID}`,
        payload: { displayName: 'Alex', emailAddress: 'alex@agentfarm.ai', communicationStyle: 'aggressive' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, 'invalid_communication_style');
});

// ---------------------------------------------------------------------------
// PATCH /v1/personas/:botId
// ---------------------------------------------------------------------------

test('PATCH /v1/personas/:botId — updates displayName and reflects in GET', async () => {
    const { app } = buildApp();
    // Create first
    await app.inject({
        method: 'POST',
        url: `/v1/personas/${BOT_ID}`,
        payload: { displayName: 'Alex', emailAddress: 'alex@agentfarm.ai' },
    });
    // Patch
    const patchRes = await app.inject({
        method: 'PATCH',
        url: `/v1/personas/${BOT_ID}`,
        payload: { displayName: 'Alexandra' },
    });
    assert.equal(patchRes.statusCode, 200);
    assert.equal(patchRes.json().persona.displayName, 'Alexandra');

    // GET reflects change
    const getRes = await app.inject({ method: 'GET', url: `/v1/personas/${BOT_ID}` });
    assert.equal(getRes.statusCode, 200);
    assert.equal(getRes.json().persona.displayName, 'Alexandra');
});

test('PATCH /v1/personas/:botId — 404 when persona not found', async () => {
    const { app } = buildApp();
    const res = await app.inject({
        method: 'PATCH',
        url: `/v1/personas/${BOT_ID}`,
        payload: { displayName: 'Alex' },
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error, 'persona_not_found');
});

// ---------------------------------------------------------------------------
// Cross-tenant isolation
// ---------------------------------------------------------------------------

test('POST cannot create persona for bot belonging to another tenant', async () => {
    // tenant_1 tries to create persona for OTHER_BOT_ID which belongs to tenant_other
    const { app } = buildApp('tenant_1');
    const res = await app.inject({
        method: 'POST',
        url: `/v1/personas/${OTHER_BOT_ID}`,
        payload: { displayName: 'Hacker', emailAddress: 'hacker@evil.com' },
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error, 'bot_not_found');
});

test('GET cannot read persona for bot belonging to another tenant', async () => {
    const { app } = buildApp('tenant_1');
    const res = await app.inject({ method: 'GET', url: `/v1/personas/${OTHER_BOT_ID}` });
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error, 'bot_not_found');
});
