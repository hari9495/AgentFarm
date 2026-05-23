import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerDisclosureRoutes } from './disclosure.js';
import type { PrismaClient } from '@prisma/client';

const makeSession = (tenantId = 'tenant-1') => ({
    userId: 'user-1',
    tenantId,
    workspaceIds: ['ws-1'],
    role: 'admin',
    expiresAt: Date.now() + 60_000,
});

const NOW = new Date('2026-05-18T10:00:00Z');

function makePersona(overrides: Partial<{
    botId: string;
    tenantId: string;
    disclosureStatement: string;
}> = {}) {
    return {
        id: 'persona-1',
        botId: overrides.botId ?? 'bot-1',
        tenantId: overrides.tenantId ?? 'tenant-1',
        displayName: 'Alex',
        emailAddress: 'alex@agentfarm.dev',
        avatarUrl: null,
        communicationStyle: 'professional',
        disclosureStatement: overrides.disclosureStatement ?? 'This message was sent by an AI agent.',
        language: 'en',
        timezone: 'UTC',
        workingHours: null,
        createdAt: NOW,
        updatedAt: NOW,
    };
}

function makePrisma(persona: ReturnType<typeof makePersona> | null = makePersona()): PrismaClient {
    return {
        agentPersona: {
            findFirst: async () => persona,
            update: async ({ data }: { data: Record<string, unknown> }) => ({
                ...persona!,
                disclosureStatement: data['disclosureStatement'] ?? persona?.disclosureStatement,
                updatedAt: NOW,
            }),
        },
        auditEvent: {
            create: async () => ({ id: 'ae-1' }),
            findMany: async () => [],
            count: async () => 0,
        },
    } as unknown as PrismaClient;
}

// ── GET /v1/disclosure/:botId ─────────────────────────────────────────────────

test('GET /v1/disclosure/:botId — no session → 401', async () => {
    const app = Fastify({ logger: false });
    await registerDisclosureRoutes(app, {
        getSession: () => null,
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/disclosure/bot-1' });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('GET /v1/disclosure/:botId — persona not found → 404', async () => {
    const app = Fastify({ logger: false });
    await registerDisclosureRoutes(app, {
        getSession: () => makeSession(),
        prisma: makePrisma(null),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/disclosure/bot-999' });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json<{ error: string }>().error, 'persona_not_found');
    } finally {
        await app.close();
    }
});

test('GET /v1/disclosure/:botId — found → 200 with disclosureStatement', async () => {
    const app = Fastify({ logger: false });
    await registerDisclosureRoutes(app, {
        getSession: () => makeSession(),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/disclosure/bot-1' });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ botId: string; disclosureStatement: string; jurisdictions: string[] }>();
        assert.equal(body.botId, 'bot-1');
        assert.ok(body.disclosureStatement.length > 0);
        assert.ok(Array.isArray(body.jurisdictions));
        assert.ok(body.jurisdictions.includes('EU_AI_ACT_ART52'));
    } finally {
        await app.close();
    }
});

// ── PATCH /v1/disclosure/:botId ───────────────────────────────────────────────

test('PATCH /v1/disclosure/:botId — no session → 401', async () => {
    const app = Fastify({ logger: false });
    await registerDisclosureRoutes(app, {
        getSession: () => null,
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/disclosure/bot-1',
            payload: { disclosureStatement: 'New statement.' },
        });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('PATCH /v1/disclosure/:botId — missing disclosureStatement → 400', async () => {
    const app = Fastify({ logger: false });
    await registerDisclosureRoutes(app, {
        getSession: () => makeSession(),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/disclosure/bot-1',
            payload: {},
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('PATCH /v1/disclosure/:botId — too short → 400', async () => {
    const app = Fastify({ logger: false });
    await registerDisclosureRoutes(app, {
        getSession: () => makeSession(),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/disclosure/bot-1',
            payload: { disclosureStatement: 'Short' },
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('PATCH /v1/disclosure/:botId — persona not found → 404', async () => {
    const app = Fastify({ logger: false });
    await registerDisclosureRoutes(app, {
        getSession: () => makeSession(),
        prisma: makePrisma(null),
    });
    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/disclosure/bot-1',
            payload: { disclosureStatement: 'This message was sent by an AI agent (updated).' },
        });
        assert.equal(res.statusCode, 404);
    } finally {
        await app.close();
    }
});

test('PATCH /v1/disclosure/:botId — valid → 200 with updated statement', async () => {
    const app = Fastify({ logger: false });
    await registerDisclosureRoutes(app, {
        getSession: () => makeSession(),
        prisma: makePrisma(),
    });
    try {
        const newStatement = 'This message was generated by an AI agent on behalf of the company.';
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/disclosure/bot-1',
            payload: { disclosureStatement: newStatement },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ botId: string; disclosureStatement: string }>();
        assert.equal(body.botId, 'bot-1');
        assert.equal(body.disclosureStatement, newStatement);
    } finally {
        await app.close();
    }
});

// ── POST /v1/disclosure/:botId/ack ────────────────────────────────────────────

test('POST /v1/disclosure/:botId/ack — no session → 401', async () => {
    const app = Fastify({ logger: false });
    await registerDisclosureRoutes(app, {
        getSession: () => null,
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/disclosure/bot-1/ack',
            payload: { channel: 'email' },
        });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('POST /v1/disclosure/:botId/ack — invalid channel → 400', async () => {
    const app = Fastify({ logger: false });
    await registerDisclosureRoutes(app, {
        getSession: () => makeSession(),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/disclosure/bot-1/ack',
            payload: { channel: 'fax' },
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('POST /v1/disclosure/:botId/ack — valid → 201', async () => {
    const app = Fastify({ logger: false });
    await registerDisclosureRoutes(app, {
        getSession: () => makeSession(),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/disclosure/bot-1/ack',
            payload: { channel: 'email', recipientId: 'user@external.com' },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json<{ botId: string; channel: string; recordedAt: string }>();
        assert.equal(body.botId, 'bot-1');
        assert.equal(body.channel, 'email');
        assert.ok(body.recordedAt);
    } finally {
        await app.close();
    }
});

test('POST /v1/disclosure/:botId/ack — all channels accepted', async () => {
    const channels = ['email', 'slack', 'pr', 'meeting', 'chat'] as const;
    for (const channel of channels) {
        const app = Fastify({ logger: false });
        await registerDisclosureRoutes(app, {
            getSession: () => makeSession(),
            prisma: makePrisma(),
        });
        try {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/disclosure/bot-1/ack',
                payload: { channel },
            });
            assert.equal(res.statusCode, 201, `Expected 201 for channel=${channel}`);
        } finally {
            await app.close();
        }
    }
});

// ── GET /v1/disclosure/:botId/audit ──────────────────────────────────────────

test('GET /v1/disclosure/:botId/audit — no session → 401', async () => {
    const app = Fastify({ logger: false });
    await registerDisclosureRoutes(app, {
        getSession: () => null,
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/disclosure/bot-1/audit' });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('GET /v1/disclosure/:botId/audit — valid → 200 with events list', async () => {
    const app = Fastify({ logger: false });
    await registerDisclosureRoutes(app, {
        getSession: () => makeSession(),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/disclosure/bot-1/audit?page=1&page_size=10',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ botId: string; page: number; total: number; events: unknown[] }>();
        assert.equal(body.botId, 'bot-1');
        assert.equal(body.page, 1);
        assert.ok(typeof body.total === 'number');
        assert.ok(Array.isArray(body.events));
    } finally {
        await app.close();
    }
});
