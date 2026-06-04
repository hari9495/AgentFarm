import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerSalesConfigRoutes } from './sales-config.js';

// ---------------------------------------------------------------------------
// In-memory Prisma stub
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

let salesConfigStore: Map<string, Row> = new Map();
let botStore: Map<string, { id: string; role: string | null }> = new Map();
let idSeq = 0;

function resetStores() {
    salesConfigStore = new Map();
    botStore = new Map();
    idSeq = 0;
}

function makePrismaStub() {
    return {
        salesAgentConfig: {
            findFirst: async ({ where }: { where: Row }) => {
                for (const rec of salesConfigStore.values()) {
                    if (Object.entries(where).every(([k, v]) => rec[k] === v)) return rec;
                }
                return null;
            },
            create: async ({ data }: { data: Row }) => {
                const id = `config-${++idSeq}`;
                const rec: Row = { id, ...data };
                salesConfigStore.set(id, rec);
                return rec;
            },
            update: async ({ where, data }: { where: { id: string }; data: Row }) => {
                const rec = salesConfigStore.get(where.id);
                if (!rec) throw new Error('not found');
                const updated = { ...rec, ...data };
                salesConfigStore.set(where.id, updated);
                return updated;
            },
        },
        bot: {
            findUnique: async ({ where }: { where: { id: string } }) =>
                botStore.get(where.id) ?? null,
        },
    } as never;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const session = () => ({
    userId: 'user_1',
    tenantId: 'tenant_1',
    workspaceIds: ['ws_1'],
    expiresAt: Date.now() + 60_000,
});

const REQUIRED_BODY = {
    botId: 'bot_1',
    productDescription: 'AI sales assistant',
    icp: 'B2B SaaS companies',
    leadSourceProvider: 'phantombuster',
    emailProvider: 'smtp',
    crmProvider: 'hubspot',
    calendarProvider: 'calendly',
    signatureProvider: 'docusign',
};

function seedBot(id: string, role: string) {
    botStore.set(id, { id, role });
}

// ===========================================================================
// GET /v1/sales/config/:botId
// ===========================================================================

test('GET /v1/sales/config/:botId — 401 when no session', async () => {
    resetStores();
    const app = Fastify({ logger: false });
    registerSalesConfigRoutes(app, { getSession: () => null, prisma: makePrismaStub() });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/sales/config/bot_1' });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('GET /v1/sales/config/:botId — 404 when config not found', async () => {
    resetStores();
    const app = Fastify({ logger: false });
    registerSalesConfigRoutes(app, { getSession: () => session(), prisma: makePrismaStub() });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/sales/config/nonexistent' });
        assert.equal(res.statusCode, 404);
        assert.match(res.json<{ error: string }>().error, /not found/i);
    } finally {
        await app.close();
    }
});

test('GET /v1/sales/config/:botId — 200 returns config for matching tenant', async () => {
    resetStores();
    salesConfigStore.set('cfg-1', {
        id: 'cfg-1', botId: 'bot_1', tenantId: 'tenant_1',
        productDescription: 'SaaS sales tool', icp: 'B2B',
    });
    const app = Fastify({ logger: false });
    registerSalesConfigRoutes(app, { getSession: () => session(), prisma: makePrismaStub() });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/sales/config/bot_1' });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ config: Row }>();
        assert.equal(body.config['botId'], 'bot_1');
        assert.equal(body.config['productDescription'], 'SaaS sales tool');
    } finally {
        await app.close();
    }
});

test('GET /v1/sales/config/:botId — 404 when config belongs to different tenant', async () => {
    resetStores();
    salesConfigStore.set('cfg-other', {
        id: 'cfg-other', botId: 'bot_1', tenantId: 'tenant_other',
    });
    const app = Fastify({ logger: false });
    registerSalesConfigRoutes(app, { getSession: () => session(), prisma: makePrismaStub() });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/sales/config/bot_1' });
        assert.equal(res.statusCode, 404);
    } finally {
        await app.close();
    }
});

// ===========================================================================
// POST /v1/sales/config — auth + validation
// ===========================================================================

test('POST /v1/sales/config — 401 when no session', async () => {
    resetStores();
    const app = Fastify({ logger: false });
    registerSalesConfigRoutes(app, { getSession: () => null, prisma: makePrismaStub() });
    try {
        const res = await app.inject({ method: 'POST', url: '/v1/sales/config', payload: REQUIRED_BODY });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

for (const requiredField of [
    'botId', 'productDescription', 'icp', 'leadSourceProvider',
    'emailProvider', 'crmProvider', 'calendarProvider', 'signatureProvider',
]) {
    test(`POST /v1/sales/config — 400 when ${requiredField} is missing`, async () => {
        resetStores();
        const app = Fastify({ logger: false });
        registerSalesConfigRoutes(app, { getSession: () => session(), prisma: makePrismaStub() });
        const body = { ...REQUIRED_BODY } as Record<string, unknown>;
        delete body[requiredField];
        try {
            const res = await app.inject({ method: 'POST', url: '/v1/sales/config', payload: body });
            assert.equal(res.statusCode, 400);
            assert.match(res.json<{ error: string }>().error, new RegExp(requiredField, 'i'));
        } finally {
            await app.close();
        }
    });
}

test('POST /v1/sales/config — 404 when bot does not exist', async () => {
    resetStores();
    const app = Fastify({ logger: false });
    registerSalesConfigRoutes(app, { getSession: () => session(), prisma: makePrismaStub() });
    try {
        const res = await app.inject({ method: 'POST', url: '/v1/sales/config', payload: REQUIRED_BODY });
        assert.equal(res.statusCode, 404);
        assert.match(res.json<{ error: string }>().error, /bot not found/i);
    } finally {
        await app.close();
    }
});

test('POST /v1/sales/config — 422 when bot role is not sales_rep', async () => {
    resetStores();
    seedBot('bot_1', 'developer');
    const app = Fastify({ logger: false });
    registerSalesConfigRoutes(app, { getSession: () => session(), prisma: makePrismaStub() });
    try {
        const res = await app.inject({ method: 'POST', url: '/v1/sales/config', payload: REQUIRED_BODY });
        assert.equal(res.statusCode, 422);
        assert.match(res.json<{ error: string }>().error, /sales_rep/i);
    } finally {
        await app.close();
    }
});

test('POST /v1/sales/config — 409 when config already exists for bot', async () => {
    resetStores();
    seedBot('bot_1', 'sales_rep');
    salesConfigStore.set('existing', { id: 'existing', botId: 'bot_1', tenantId: 'tenant_1' });
    const app = Fastify({ logger: false });
    registerSalesConfigRoutes(app, { getSession: () => session(), prisma: makePrismaStub() });
    try {
        const res = await app.inject({ method: 'POST', url: '/v1/sales/config', payload: REQUIRED_BODY });
        assert.equal(res.statusCode, 409);
        assert.match(res.json<{ error: string }>().error, /already exists/i);
    } finally {
        await app.close();
    }
});

test('POST /v1/sales/config — 201 creates config with correct defaults', async () => {
    resetStores();
    seedBot('bot_1', 'sales_rep');
    const app = Fastify({ logger: false });
    registerSalesConfigRoutes(app, { getSession: () => session(), prisma: makePrismaStub() });
    try {
        const res = await app.inject({ method: 'POST', url: '/v1/sales/config', payload: REQUIRED_BODY });
        assert.equal(res.statusCode, 201);
        const body = res.json<{ ok: boolean; config: Row }>();
        assert.equal(body.ok, true);
        assert.equal(body.config['botId'], 'bot_1');
        assert.equal(body.config['tenantId'], 'tenant_1');
        assert.equal(body.config['emailTone'], 'conversational');
        assert.equal(body.config['maxProspectsPerDay'], 50);
        assert.equal(body.config['active'], true);
        assert.deepEqual(body.config['followUpDays'], [3, 7, 14]);
        assert.equal(body.config['marketResearchEnabled'], false);
        assert.equal(body.config['crmSyncEnabled'], false);
    } finally {
        await app.close();
    }
});

test('POST /v1/sales/config — 201 respects explicitly supplied optional fields', async () => {
    resetStores();
    seedBot('bot_1', 'sales_rep');
    const app = Fastify({ logger: false });
    registerSalesConfigRoutes(app, { getSession: () => session(), prisma: makePrismaStub() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/sales/config',
            payload: { ...REQUIRED_BODY, maxProspectsPerDay: 100, active: false, emailTone: 'formal' },
        });
        assert.equal(res.statusCode, 201);
        const config = res.json<{ config: Row }>().config;
        assert.equal(config['maxProspectsPerDay'], 100);
        assert.equal(config['active'], false);
        assert.equal(config['emailTone'], 'formal');
    } finally {
        await app.close();
    }
});

// ===========================================================================
// POST /v1/sales/config — field encryption
// ===========================================================================

test('POST /v1/sales/config — sensitive fields encrypted at rest when FIELD_ENCRYPTION_KEY is set', async (t) => {
    resetStores();
    t.after(() => { delete process.env['FIELD_ENCRYPTION_KEY']; });
    process.env['FIELD_ENCRYPTION_KEY'] = 'test-field-encryption-key-32chars!!';

    seedBot('bot_1', 'sales_rep');

    let storedData: Row | null = null;
    const capturingPrisma = {
        salesAgentConfig: {
            findFirst: async () => null,
            create: async ({ data }: { data: Row }) => {
                storedData = { ...data };
                return { id: 'cfg-1', ...data };
            },
        },
        bot: { findUnique: async () => ({ id: 'bot_1', role: 'sales_rep' }) },
    } as never;

    const app = Fastify({ logger: false });
    registerSalesConfigRoutes(app, { getSession: () => session(), prisma: capturingPrisma });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/sales/config',
            payload: {
                ...REQUIRED_BODY,
                twilioAuthToken: 'twilio-secret-token',
                hubspotAccessToken: 'hs-access-token',
                salesforceAccessToken: 'sf-access-token',
            },
        });
        assert.equal(res.statusCode, 201);

        // Stored values must be encrypted (enc: prefix)
        assert.ok(storedData, 'create must have been called');
        assert.ok(String(storedData!['twilioAuthToken']).startsWith('enc:'), 'twilioAuthToken must be encrypted at rest');
        assert.ok(String(storedData!['hubspotAccessToken']).startsWith('enc:'), 'hubspotAccessToken must be encrypted at rest');
        assert.ok(String(storedData!['salesforceAccessToken']).startsWith('enc:'), 'salesforceAccessToken must be encrypted at rest');

        // Returned values must be decrypted to original plaintext
        const config = res.json<{ config: Row }>().config;
        assert.equal(config['twilioAuthToken'], 'twilio-secret-token');
        assert.equal(config['hubspotAccessToken'], 'hs-access-token');
        assert.equal(config['salesforceAccessToken'], 'sf-access-token');
    } finally {
        await app.close();
    }
});

test('POST /v1/sales/config — stores plaintext when FIELD_ENCRYPTION_KEY is absent', async (t) => {
    resetStores();
    const prev = process.env['FIELD_ENCRYPTION_KEY'];
    delete process.env['FIELD_ENCRYPTION_KEY'];
    t.after(() => { if (prev !== undefined) process.env['FIELD_ENCRYPTION_KEY'] = prev; });

    seedBot('bot_1', 'sales_rep');

    let storedData: Row | null = null;
    const capturingPrisma = {
        salesAgentConfig: {
            findFirst: async () => null,
            create: async ({ data }: { data: Row }) => {
                storedData = { ...data };
                return { id: 'cfg-1', ...data };
            },
        },
        bot: { findUnique: async () => ({ id: 'bot_1', role: 'sales_rep' }) },
    } as never;

    const app = Fastify({ logger: false });
    registerSalesConfigRoutes(app, { getSession: () => session(), prisma: capturingPrisma });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/sales/config',
            payload: { ...REQUIRED_BODY, twilioAuthToken: 'plain-token' },
        });
        assert.equal(res.statusCode, 201);
        // Without a key, stored value is plaintext (no enc: prefix)
        assert.equal(storedData!['twilioAuthToken'], 'plain-token');
    } finally {
        await app.close();
    }
});

test('POST /v1/sales/config — non-sensitive fields are never encrypted', async (t) => {
    resetStores();
    t.after(() => { delete process.env['FIELD_ENCRYPTION_KEY']; });
    process.env['FIELD_ENCRYPTION_KEY'] = 'test-field-encryption-key-32chars!!';

    seedBot('bot_1', 'sales_rep');

    let storedData: Row | null = null;
    const capturingPrisma = {
        salesAgentConfig: {
            findFirst: async () => null,
            create: async ({ data }: { data: Row }) => {
                storedData = { ...data };
                return { id: 'cfg-1', ...data };
            },
        },
        bot: { findUnique: async () => ({ id: 'bot_1', role: 'sales_rep' }) },
    } as never;

    const app = Fastify({ logger: false });
    registerSalesConfigRoutes(app, { getSession: () => session(), prisma: capturingPrisma });
    try {
        const res = await app.inject({ method: 'POST', url: '/v1/sales/config', payload: REQUIRED_BODY });
        assert.equal(res.statusCode, 201);
        // Non-sensitive fields should remain as-is
        assert.equal(storedData!['emailProvider'], 'smtp');
        assert.equal(storedData!['crmProvider'], 'hubspot');
        assert.ok(!String(storedData!['emailProvider']).startsWith('enc:'));
    } finally {
        await app.close();
    }
});

// ===========================================================================
// PUT /v1/sales/config/:botId
// ===========================================================================

test('PUT /v1/sales/config/:botId — 401 when no session', async () => {
    resetStores();
    const app = Fastify({ logger: false });
    registerSalesConfigRoutes(app, { getSession: () => null, prisma: makePrismaStub() });
    try {
        const res = await app.inject({ method: 'PUT', url: '/v1/sales/config/bot_1', payload: { active: false } });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('PUT /v1/sales/config/:botId — 404 when config does not exist', async () => {
    resetStores();
    const app = Fastify({ logger: false });
    registerSalesConfigRoutes(app, { getSession: () => session(), prisma: makePrismaStub() });
    try {
        const res = await app.inject({ method: 'PUT', url: '/v1/sales/config/bot_1', payload: { active: false } });
        assert.equal(res.statusCode, 404);
        assert.match(res.json<{ error: string }>().error, /not found/i);
    } finally {
        await app.close();
    }
});

test('PUT /v1/sales/config/:botId — 200 updates supplied fields', async () => {
    resetStores();
    salesConfigStore.set('cfg-1', {
        id: 'cfg-1', botId: 'bot_1', tenantId: 'tenant_1',
        active: true, maxProspectsPerDay: 50, emailTone: 'conversational',
    });
    const app = Fastify({ logger: false });
    registerSalesConfigRoutes(app, { getSession: () => session(), prisma: makePrismaStub() });
    try {
        const res = await app.inject({
            method: 'PUT',
            url: '/v1/sales/config/bot_1',
            payload: { active: false, maxProspectsPerDay: 25 },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ ok: boolean; config: Row }>();
        assert.equal(body.ok, true);
        assert.equal(body.config['active'], false);
        assert.equal(body.config['maxProspectsPerDay'], 25);
        // Untouched field should remain
        assert.equal(body.config['emailTone'], 'conversational');
    } finally {
        await app.close();
    }
});

test('PUT /v1/sales/config/:botId — 404 when config belongs to different tenant', async () => {
    resetStores();
    salesConfigStore.set('cfg-other', {
        id: 'cfg-other', botId: 'bot_1', tenantId: 'tenant_other',
    });
    const app = Fastify({ logger: false });
    registerSalesConfigRoutes(app, { getSession: () => session(), prisma: makePrismaStub() });
    try {
        const res = await app.inject({ method: 'PUT', url: '/v1/sales/config/bot_1', payload: { active: false } });
        assert.equal(res.statusCode, 404);
    } finally {
        await app.close();
    }
});

test('PUT /v1/sales/config/:botId — encrypts sensitive fields on update', async (t) => {
    resetStores();
    t.after(() => { delete process.env['FIELD_ENCRYPTION_KEY']; });
    process.env['FIELD_ENCRYPTION_KEY'] = 'test-field-encryption-key-32chars!!';

    let updatedData: Row | null = null;
    const capturingPrisma = {
        salesAgentConfig: {
            findFirst: async () => ({ id: 'cfg-1', botId: 'bot_1', tenantId: 'tenant_1' }),
            update: async ({ data }: { where: unknown; data: Row }) => {
                updatedData = { ...data };
                return { id: 'cfg-1', botId: 'bot_1', tenantId: 'tenant_1', ...data };
            },
        },
        bot: { findUnique: async () => null },
    } as never;

    const app = Fastify({ logger: false });
    registerSalesConfigRoutes(app, { getSession: () => session(), prisma: capturingPrisma });
    try {
        const res = await app.inject({
            method: 'PUT',
            url: '/v1/sales/config/bot_1',
            payload: { salesforceAccessToken: 'new-sf-token', signalwireApiToken: 'sw-token' },
        });
        assert.equal(res.statusCode, 200);
        assert.ok(String(updatedData!['salesforceAccessToken']).startsWith('enc:'), 'salesforceAccessToken must be encrypted on update');
        assert.ok(String(updatedData!['signalwireApiToken']).startsWith('enc:'), 'signalwireApiToken must be encrypted on update');
        // Returned value decrypted
        const config = res.json<{ config: Row }>().config;
        assert.equal(config['salesforceAccessToken'], 'new-sf-token');
    } finally {
        await app.close();
    }
});
