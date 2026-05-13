import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerAgentControlRoutes } from './agent-control.js';

const session = () => ({
    userId: 'user_1',
    tenantId: 'tenant_1',
    workspaceIds: ['ws_1'],
    role: 'operator',
    expiresAt: Date.now() + 60_000,
});

const activeBot = {
    id: 'bot_1',
    status: 'active',
    workspaceId: 'ws_1',
    workspace: { tenantId: 'tenant_1' },
    updatedAt: new Date('2026-01-01'),
};

const pausedBot = {
    ...activeBot,
    status: 'paused',
};

const wrongTenantBot = {
    ...activeBot,
    workspace: { tenantId: 'other_tenant' },
};

const makePrisma = (bot: typeof activeBot | null, updateStatus?: string, onSnapshot?: () => void) => ({
    bot: {
        findUnique: async () => bot,
        update: async () => ({
            id: bot?.id ?? 'bot_1',
            status: updateStatus ?? 'paused',
            updatedAt: new Date('2026-01-02'),
        }),
    },
    botConfigVersion: {
        aggregate: async () => ({ _max: { versionNumber: null } }),
        create: async () => {
            if (onSnapshot) onSnapshot();
            return {};
        },
    },
    auditEvent: {
        create: async () => ({}),
    },
    outboundWebhook: {
        findMany: async () => [],
    },
} as any);

// ---------------------------------------------------------------------------
// pause
// ---------------------------------------------------------------------------

test('POST /v1/agents/:botId/pause — bot not found — 404', async () => {
    const app = Fastify();
    await registerAgentControlRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(null),
    });
    try {
        const res = await app.inject({ method: 'POST', url: '/v1/agents/missing_bot/pause' });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json().code, 'BOT_NOT_FOUND');
    } finally {
        await app.close();
    }
});

test('POST /v1/agents/:botId/pause — wrong tenant — 403', async () => {
    const app = Fastify();
    await registerAgentControlRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(wrongTenantBot),
    });
    try {
        const res = await app.inject({ method: 'POST', url: '/v1/agents/bot_1/pause' });
        assert.equal(res.statusCode, 403);
        assert.equal(res.json().code, 'FORBIDDEN');
    } finally {
        await app.close();
    }
});

test('POST /v1/agents/:botId/pause — already paused — 200 already paused', async () => {
    const app = Fastify();
    await registerAgentControlRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(pausedBot),
    });
    try {
        const res = await app.inject({ method: 'POST', url: '/v1/agents/bot_1/pause' });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().status, 'paused');
        assert.equal(res.json().message, 'Already paused');
    } finally {
        await app.close();
    }
});

test('POST /v1/agents/:botId/pause — active bot — 200 status paused', async () => {
    const app = Fastify();
    await registerAgentControlRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(activeBot, 'paused'),
    });
    try {
        const res = await app.inject({ method: 'POST', url: '/v1/agents/bot_1/pause' });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().botId, 'bot_1');
        assert.equal(res.json().status, 'paused');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// resume
// ---------------------------------------------------------------------------

test('POST /v1/agents/:botId/resume — bot not found — 404', async () => {
    const app = Fastify();
    await registerAgentControlRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(null),
    });
    try {
        const res = await app.inject({ method: 'POST', url: '/v1/agents/missing_bot/resume' });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json().code, 'BOT_NOT_FOUND');
    } finally {
        await app.close();
    }
});

test('POST /v1/agents/:botId/resume — wrong tenant — 403', async () => {
    const app = Fastify();
    await registerAgentControlRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(wrongTenantBot),
    });
    try {
        const res = await app.inject({ method: 'POST', url: '/v1/agents/bot_1/resume' });
        assert.equal(res.statusCode, 403);
        assert.equal(res.json().code, 'FORBIDDEN');
    } finally {
        await app.close();
    }
});

test('POST /v1/agents/:botId/resume — already active — 200 already active', async () => {
    const app = Fastify();
    await registerAgentControlRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(activeBot),
    });
    try {
        const res = await app.inject({ method: 'POST', url: '/v1/agents/bot_1/resume' });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().status, 'active');
        assert.equal(res.json().message, 'Already active');
    } finally {
        await app.close();
    }
});

test('POST /v1/agents/:botId/resume — paused bot — 200 status active', async () => {
    const app = Fastify();
    await registerAgentControlRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(pausedBot, 'active'),
    });
    try {
        const res = await app.inject({ method: 'POST', url: '/v1/agents/bot_1/resume' });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().botId, 'bot_1');
        assert.equal(res.json().status, 'active');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

test('GET /v1/agents/:botId/status — bot not found — 404', async () => {
    const app = Fastify();
    await registerAgentControlRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(null),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/agents/missing_bot/status' });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json().code, 'BOT_NOT_FOUND');
    } finally {
        await app.close();
    }
});

test('GET /v1/agents/:botId/status — wrong tenant — 403', async () => {
    const app = Fastify();
    await registerAgentControlRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(wrongTenantBot),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/agents/bot_1/status' });
        assert.equal(res.statusCode, 403);
        assert.equal(res.json().code, 'FORBIDDEN');
    } finally {
        await app.close();
    }
});

test('GET /v1/agents/:botId/status — returns status', async () => {
    const app = Fastify();
    await registerAgentControlRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(activeBot),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/agents/bot_1/status' });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().botId, 'bot_1');
        assert.equal(res.json().status, 'active');
        assert.equal(res.json().tenantId, 'tenant_1');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// auto-snapshot (Phase 14)
// ---------------------------------------------------------------------------

test('POST /v1/agents/:botId/pause — auto-snapshot is called after update', async () => {
    let snapshotCalled = false;
    const app = Fastify();
    await registerAgentControlRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(activeBot, 'paused', () => { snapshotCalled = true; }),
    });
    try {
        const res = await app.inject({ method: 'POST', url: '/v1/agents/bot_1/pause' });
        assert.equal(res.statusCode, 200);
        // Give the fire-and-forget snapshot a tick to execute
        await new Promise((r) => setImmediate(r));
        assert.ok(snapshotCalled, 'snapshotBotConfig should have been called after pause');
    } finally {
        await app.close();
    }
});

test('POST /v1/agents/:botId/resume — auto-snapshot is called after update', async () => {
    let snapshotCalled = false;
    const app = Fastify();
    await registerAgentControlRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(pausedBot, 'active', () => { snapshotCalled = true; }),
    });
    try {
        const res = await app.inject({ method: 'POST', url: '/v1/agents/bot_1/resume' });
        assert.equal(res.statusCode, 200);
        await new Promise((r) => setImmediate(r));
        assert.ok(snapshotCalled, 'snapshotBotConfig should have been called after resume');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// Phase 22 — rate-limit management routes
// ---------------------------------------------------------------------------

const rateLimitRow = {
    botId: 'bot_1',
    tenantId: 'tenant_1',
    requestsPerMinute: 60,
    burstLimit: 10,
    enabled: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
};

const makeRlPrisma = (
    bot: typeof activeBot | null,
    rlRow: typeof rateLimitRow | null,
) => ({
    bot: { findUnique: async () => bot },
    agentRateLimit: {
        findUnique: async () => rlRow,
        upsert: async () => rateLimitRow,
        update: async () => rateLimitRow,
        delete: async () => rateLimitRow,
    },
    botConfigVersion: { aggregate: async () => ({ _max: { versionNumber: null } }), create: async () => ({}) },
    auditEvent: { create: async () => ({}) },
} as any);

test('GET /v1/agents/:botId/rate-limit — returns config when it exists', async () => {
    const app = Fastify();
    await registerAgentControlRoutes(app, {
        getSession: () => session(),
        prisma: makeRlPrisma(activeBot, rateLimitRow),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/agents/bot_1/rate-limit' });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().requestsPerMinute, 60);
        assert.equal(res.json().burstLimit, 10);
        assert.equal(res.json().enabled, true);
    } finally {
        await app.close();
    }
});

test('GET /v1/agents/:botId/rate-limit — returns 404 when not configured', async () => {
    const app = Fastify();
    await registerAgentControlRoutes(app, {
        getSession: () => session(),
        prisma: makeRlPrisma(activeBot, null),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/agents/bot_1/rate-limit' });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json().code, 'RATE_LIMIT_NOT_CONFIGURED');
    } finally {
        await app.close();
    }
});

test('GET /v1/agents/:botId/rate-limit — returns 403 when bot belongs to different tenant', async () => {
    const app = Fastify();
    await registerAgentControlRoutes(app, {
        getSession: () => session(),
        prisma: makeRlPrisma(wrongTenantBot, rateLimitRow),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/agents/bot_1/rate-limit' });
        assert.equal(res.statusCode, 403);
        assert.equal(res.json().code, 'FORBIDDEN');
    } finally {
        await app.close();
    }
});

test('POST /v1/agents/:botId/rate-limit — creates config and returns 200', async () => {
    const app = Fastify();
    await registerAgentControlRoutes(app, {
        getSession: () => session(),
        prisma: makeRlPrisma(activeBot, null),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/agents/bot_1/rate-limit',
            payload: { requestsPerMinute: 60, burstLimit: 10, enabled: true },
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().botId, 'bot_1');
    } finally {
        await app.close();
    }
});

test('POST /v1/agents/:botId/rate-limit — rejects requestsPerMinute > 10000 with 400', async () => {
    const app = Fastify();
    await registerAgentControlRoutes(app, {
        getSession: () => session(),
        prisma: makeRlPrisma(activeBot, null),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/agents/bot_1/rate-limit',
            payload: { requestsPerMinute: 99999 },
        });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json().error, 'validation_error');
    } finally {
        await app.close();
    }
});

test('PATCH /v1/agents/:botId/rate-limit — updates enabled field', async () => {
    const app = Fastify();
    await registerAgentControlRoutes(app, {
        getSession: () => session(),
        prisma: makeRlPrisma(activeBot, rateLimitRow),
    });
    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/agents/bot_1/rate-limit',
            payload: { enabled: false },
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().botId, 'bot_1');
    } finally {
        await app.close();
    }
});

test('DELETE /v1/agents/:botId/rate-limit — removes config with admin role', async () => {
    const adminSession = () => ({ ...session(), role: 'admin' });
    const app = Fastify();
    await registerAgentControlRoutes(app, {
        getSession: adminSession,
        prisma: makeRlPrisma(activeBot, rateLimitRow),
    });
    try {
        const res = await app.inject({ method: 'DELETE', url: '/v1/agents/bot_1/rate-limit' });
        assert.equal(res.statusCode, 204);
    } finally {
        await app.close();
    }
});

test('DELETE /v1/agents/:botId/rate-limit — returns 403 for operator role', async () => {
    const app = Fastify();
    await registerAgentControlRoutes(app, {
        getSession: () => session(), // operator role
        prisma: makeRlPrisma(activeBot, rateLimitRow),
    });
    try {
        const res = await app.inject({ method: 'DELETE', url: '/v1/agents/bot_1/rate-limit' });
        assert.equal(res.statusCode, 403);
        assert.equal(res.json().error, 'insufficient_role');
    } finally {
        await app.close();
    }
});
