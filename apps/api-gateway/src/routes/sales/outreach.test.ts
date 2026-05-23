import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerOutreachRoutes } from './outreach.js';
import type { OutreachParams, OutreachResult } from '@agentfarm/agent-runtime/sales/outreach.js';
import type { ClassifyReplyParams, ClassifyReplyResult } from '@agentfarm/agent-runtime/sales/reply-classifier.js';

const session = () => ({
    userId: 'user_1',
    tenantId: 'tenant_1',
    workspaceIds: ['ws_1'],
    role: 'operator',
    expiresAt: Date.now() + 60_000,
});

const mockConfig = {
    id: 'config_1',
    tenantId: 'tenant_1',
    botId: 'bot_1',
    emailProvider: 'smtp',
};

const mockProspect = {
    id: 'prospect_1',
    tenantId: 'tenant_1',
    botId: 'bot_1',
    firstName: 'Jane',
    email: 'jane@acme.com',
};

const wrongTenantProspect = { ...mockProspect, tenantId: 'other_tenant' };

const mockOutreachResult: OutreachResult = {
    success: true,
    subject: 'Test Subject',
    provider: 'smtp',
    activityId: 'activity_1',
    messageId: 'msg_abc',
};

const mockClassifyResult: ClassifyReplyResult = {
    intent: 'interested',
    confidence: 0.9,
    suggestedAction: 'schedule_demo',
    reasoning: 'Prospect is interested.',
};

const makePrisma = (config: unknown, prospect: unknown) =>
    ({
        salesAgentConfig: { findFirst: async () => config },
        prospect: {
            findUnique: async () => prospect,
            update: async () => ({}),
        },
        salesActivity: { create: async () => ({ id: 'activity_1' }) },
    }) as never;

const mockSendOutreach = async (_params: OutreachParams, _prisma: unknown): Promise<OutreachResult> =>
    mockOutreachResult;

const mockClassifyReply = async (_params: ClassifyReplyParams): Promise<ClassifyReplyResult> =>
    mockClassifyResult;

const sendBody = {
    botId: 'bot_1',
    prospectId: 'prospect_1',
    emailConfig: { fromEmail: 'sales@agentfarm.dev' },
};

const classifyBody = {
    prospectId: 'prospect_1',
    replyText: 'Yes, I am interested!',
    originalSubject: 'Automate your workflows',
};

// -------------------------------------------------------------------------
// POST /v1/sales/outreach/send
// -------------------------------------------------------------------------

test('POST /v1/sales/outreach/send — 401 without session', async () => {
    const app = Fastify();
    await registerOutreachRoutes(app, {
        getSession: () => null,
        prisma: makePrisma(mockConfig, mockProspect),
        sendOutreach: mockSendOutreach,
    });
    try {
        const res = await app.inject({ method: 'POST', url: '/v1/sales/outreach/send', payload: sendBody });
        assert.equal(res.statusCode, 401);
        assert.equal(res.json().code, 'UNAUTHORIZED');
    } finally {
        await app.close();
    }
});

test('POST /v1/sales/outreach/send — 404 when config not found', async () => {
    const app = Fastify();
    await registerOutreachRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(null, mockProspect),
        sendOutreach: mockSendOutreach,
    });
    try {
        const res = await app.inject({ method: 'POST', url: '/v1/sales/outreach/send', payload: sendBody });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json().code, 'CONFIG_NOT_FOUND');
    } finally {
        await app.close();
    }
});

test('POST /v1/sales/outreach/send — 200 on success', async () => {
    const app = Fastify();
    await registerOutreachRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(mockConfig, mockProspect),
        sendOutreach: mockSendOutreach,
    });
    try {
        const res = await app.inject({ method: 'POST', url: '/v1/sales/outreach/send', payload: sendBody });
        assert.equal(res.statusCode, 200);
        const body = res.json() as OutreachResult;
        assert.equal(body.success, true);
        assert.equal(body.activityId, 'activity_1');
    } finally {
        await app.close();
    }
});

// -------------------------------------------------------------------------
// POST /v1/sales/outreach/classify-reply
// -------------------------------------------------------------------------

test('POST /v1/sales/outreach/classify-reply — 200 with intent', async () => {
    const app = Fastify();
    await registerOutreachRoutes(app, {
        getSession: () => session(),
        prisma: makePrisma(mockConfig, mockProspect),
        classifyReplyFn: mockClassifyReply,
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/sales/outreach/classify-reply',
            payload: classifyBody,
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as ClassifyReplyResult;
        assert.equal(body.intent, 'interested');
        assert.ok(body.confidence > 0);
    } finally {
        await app.close();
    }
});

// -------------------------------------------------------------------------
// GET /v1/sales/outreach/activities/:prospectId
// -------------------------------------------------------------------------

test('GET /v1/sales/outreach/activities/:id — 403 when wrong tenant', async () => {
    const app = Fastify();
    await registerOutreachRoutes(app, {
        getSession: () => session(),
        prisma: ({
            salesAgentConfig: { findFirst: async () => null },
            prospect: { findUnique: async () => wrongTenantProspect, update: async () => ({}) },
            salesActivity: { findMany: async () => [], create: async () => ({ id: 'a1' }) },
        }) as never,
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/sales/outreach/activities/prospect_1' });
        assert.equal(res.statusCode, 403);
        assert.equal(res.json().code, 'FORBIDDEN');
    } finally {
        await app.close();
    }
});

test('GET /v1/sales/outreach/activities/:id — 200 returns activity list', async () => {
    const mockActivity = {
        id: 'activity_1',
        tenantId: 'tenant_1',
        botId: 'bot_1',
        prospectId: 'prospect_1',
        activityType: 'email',
        subject: 'Test Subject',
        outcome: 'sent',
        createdAt: new Date().toISOString(),
    };
    const app = Fastify();
    await registerOutreachRoutes(app, {
        getSession: () => session(),
        prisma: ({
            salesAgentConfig: { findFirst: async () => null },
            prospect: { findUnique: async () => mockProspect, update: async () => ({}) },
            salesActivity: { findMany: async () => [mockActivity], create: async () => ({ id: 'a1' }) },
        }) as never,
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/sales/outreach/activities/prospect_1' });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { activities: unknown[] };
        assert.equal(Array.isArray(body.activities), true);
        assert.equal(body.activities.length, 1);
    } finally {
        await app.close();
    }
});
