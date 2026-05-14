import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerProspectsRoutes } from './prospects.js';

const session = () => ({
    userId: 'user_1',
    tenantId: 'tenant_1',
    workspaceIds: ['ws_1'],
    role: 'operator',
    expiresAt: Date.now() + 60_000,
});

const makeProspect = (overrides: Record<string, unknown> = {}) => ({
    id: 'prospect_1',
    tenantId: 'tenant_1',
    botId: 'bot_1',
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@techcorp.io',
    company: 'TechCorp',
    icpScore: 72,
    qualified: true,
    status: 'new',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
});

const makeSalesConfig = () => ({
    id: 'cfg_1',
    tenantId: 'tenant_1',
    botId: 'bot_1',
    productDescription: 'B2B SaaS',
    icp: 'software, engineering',
    leadSourceProvider: 'apollo',
    emailProvider: 'gmail',
    crmProvider: 'hubspot',
    calendarProvider: 'google_calendar',
    signatureProvider: 'docusign',
    emailTone: 'conversational',
    followUpDays: [3, 7, 14],
    maxProspectsPerDay: 50,
    active: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
});

const makePrisma = (overrides: Record<string, unknown> = {}) => ({
    prospect: {
        findMany: async () => [makeProspect()],
        count: async () => 1,
        findUnique: async ({ where }: { where: { id: string } }) =>
            where.id === 'prospect_1' ? makeProspect() : null,
        update: async () => makeProspect({ status: 'contacted', updatedAt: new Date() }),
    },
    salesAgentConfig: {
        findFirst: async () => makeSalesConfig(),
    },
    ...overrides,
} as never);

// ── GET /v1/sales/prospects ──────────────────────────────────────────────────

test('GET /v1/sales/prospects — no auth — 401', async () => {
    const app = Fastify();
    await registerProspectsRoutes(app, {
        getSession: () => null,
        prisma: makePrisma(),
    });
    const res = await app.inject({ method: 'GET', url: '/v1/sales/prospects' });
    assert.equal(res.statusCode, 401);
});

test('GET /v1/sales/prospects — auth — returns list — 200', async () => {
    const app = Fastify();
    await registerProspectsRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(),
    });
    const res = await app.inject({ method: 'GET', url: '/v1/sales/prospects' });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(Array.isArray(body.prospects));
    assert.equal(body.total, 1);
});

// ── GET /v1/sales/prospects/:prospectId ──────────────────────────────────────

test('GET /v1/sales/prospects/:prospectId — not found — 404', async () => {
    const app = Fastify();
    await registerProspectsRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(),
    });
    const res = await app.inject({ method: 'GET', url: '/v1/sales/prospects/missing_id' });
    assert.equal(res.statusCode, 404);
});

test('GET /v1/sales/prospects/:prospectId — wrong tenant — 403', async () => {
    const app = Fastify();
    await registerProspectsRoutes(app, {
        getSession: () => ({ ...session(), tenantId: 'other_tenant' }),
        prisma: makePrisma(),
    });
    const res = await app.inject({ method: 'GET', url: '/v1/sales/prospects/prospect_1' });
    assert.equal(res.statusCode, 403);
});

test('GET /v1/sales/prospects/:prospectId — found — 200', async () => {
    const app = Fastify();
    await registerProspectsRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(),
    });
    const res = await app.inject({ method: 'GET', url: '/v1/sales/prospects/prospect_1' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().prospect.id, 'prospect_1');
});

// ── POST /v1/sales/prospects/find ─────────────────────────────────────────────

test('POST /v1/sales/prospects/find — no auth — 401', async () => {
    const app = Fastify();
    await registerProspectsRoutes(app, {
        getSession: () => null,
        prisma: makePrisma(),
        findProspects: async () => ({ found: 0, saved: 0, skipped: 0 }),
    });
    const res = await app.inject({
        method: 'POST',
        url: '/v1/sales/prospects/find',
        payload: { botId: 'bot_1' },
    });
    assert.equal(res.statusCode, 401);
});

test('POST /v1/sales/prospects/find — valid request — 200 with counts', async () => {
    const app = Fastify();
    await registerProspectsRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(),
        findProspects: async () => ({ found: 5, saved: 4, skipped: 1 }),
    });
    const res = await app.inject({
        method: 'POST',
        url: '/v1/sales/prospects/find',
        payload: { botId: 'bot_1', domain: 'techcorp.io' },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.found, 5);
    assert.equal(body.saved, 4);
    assert.equal(body.skipped, 1);
});
