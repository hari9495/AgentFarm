import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registerTaskTemplateRoutes } from './task-templates.js';

// ---------------------------------------------------------------------------
// In-memory stub (for POST create / dispatch)
// ---------------------------------------------------------------------------

const makeStore = () => {
    const templates = new Map<string, Record<string, unknown>>();
    const dispatches: Record<string, unknown>[] = [];
    let seq = 0;

    const stub = {
        taskTemplate: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
                if (Array.from(templates.values()).some(t => t['slug'] === data['slug'] && t['tenantId'] === data['tenantId'])) {
                    throw new Error('Unique constraint failed on the fields: (`slug`)');
                }
                const row = {
                    ...data,
                    id: data['id'] as string,
                    useCount: 0,
                    isBuiltIn: false,
                    estimatedTime: data['estimatedTime'] ?? null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
                templates.set(row.id as string, row);
                return row;
            },
            findMany: async () => [],
            findFirst: async ({ where }: { where: Record<string, unknown> }) => {
                const orConditions = where['OR'] as Array<{ id?: string; slug?: string }> | undefined;
                if (!orConditions) return null;
                return Array.from(templates.values()).find(t =>
                    orConditions.some(c => (c.id && t['id'] === c.id) || (c.slug && t['slug'] === c.slug))
                ) ?? null;
            },
            update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
                const t = templates.get(where.id);
                if (!t) return null;
                Object.assign(t, data);
                return t;
            },
        },
        agentDispatchRecord: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
                const record = { ...data, id: `dispatch_${++seq}`, queuedAt: new Date(), completedAt: null };
                dispatches.push(record);
                return record;
            },
        },
        // bot stub — used by the agent ownership check in dispatch
        bot: {
            findFirst: async ({ where }: { where: { id: string; tenantId: string } }) => {
                // Return a match when the agent belongs to the session tenant
                if (where.id === 'bot_1' && where.tenantId === 'tenant_1') return { id: 'bot_1' };
                return null;
            },
        },
        _templates: templates,
        _dispatches: dispatches,
    };
    return stub;
};

const session = (tenantId = 'tenant_1') => ({
    userId: 'u1', tenantId, workspaceIds: ['ws_1'], expiresAt: Date.now() + 60_000,
});

const buildApp = () => {
    const store = makeStore();
    const app = Fastify();
    registerTaskTemplateRoutes(app, { getSession: () => session(), prisma: store as never });
    return { app, store };
};

// ---------------------------------------------------------------------------
// GET /v1/task-templates
// ---------------------------------------------------------------------------

describe('GET /v1/task-templates', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerTaskTemplateRoutes(app, { getSession: () => null });
        const res = await app.inject({ method: 'GET', url: '/v1/task-templates?builtInOnly=true' });
        assert.equal(res.statusCode, 401);
    });

    it('returns 10 built-in templates with builtInOnly=true', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/task-templates?builtInOnly=true' });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.equal(body.total, 10);
        assert.ok(Array.isArray(body.templates));
        assert.ok(Array.isArray(body.categories));
        assert.ok(body.categories.length > 0);
    });

    it('all templates have locked=false when no bots provisioned', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/task-templates?builtInOnly=true' });
        const templates = res.json().templates as { locked: boolean }[];
        assert.ok(templates.every(t => t.locked === false));
    });

    it('filters by category', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/task-templates?builtInOnly=true&category=sales' });
        assert.equal(res.statusCode, 200);
        const templates = res.json().templates as { category: string }[];
        assert.ok(templates.length > 0);
        assert.ok(templates.every(t => t.category === 'sales'));
    });

    it('filters by agentRole', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/task-templates?builtInOnly=true&agentRole=recruiter' });
        const templates = res.json().templates as { agentRole: string }[];
        assert.ok(templates.length > 0);
        assert.ok(templates.every(t => t.agentRole === 'recruiter'));
    });

    it('searches by text query', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/task-templates?builtInOnly=true&q=email' });
        const templates = res.json().templates as { name: string; description: string; tags: string[] }[];
        assert.ok(templates.length > 0);
        assert.ok(templates.every(t => {
            const combined = (t.name + t.description + t.tags.join(' ')).toLowerCase();
            return combined.includes('email');
        }));
    });
});

// ---------------------------------------------------------------------------
// GET /v1/task-templates/:id
// ---------------------------------------------------------------------------

describe('GET /v1/task-templates/:id', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerTaskTemplateRoutes(app, { getSession: () => null });
        const res = await app.inject({ method: 'GET', url: '/v1/task-templates/builtin-draft-cold-email' });
        assert.equal(res.statusCode, 401);
    });

    it('returns built-in template by id', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/task-templates/builtin-draft-cold-email' });
        assert.equal(res.statusCode, 200);
        const { template } = res.json();
        assert.equal(template.id, 'builtin-draft-cold-email');
        assert.equal(template.slug, 'draft-cold-email');
        assert.equal(template.isBuiltIn, true);
    });

    it('returns built-in template by slug', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/task-templates/draft-cold-email' });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().template.slug, 'draft-cold-email');
    });

    it('returns 404 for unknown template when DB returns null', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/task-templates/nonexistent-template-id' });
        assert.equal(res.statusCode, 404);
    });
});

// ---------------------------------------------------------------------------
// POST /v1/task-templates
// ---------------------------------------------------------------------------

describe('POST /v1/task-templates', () => {
    const validBody = () => ({
        slug: 'my-custom-template',
        name: 'My Custom Template',
        description: 'Does something useful',
        category: 'custom',
        agentRole: 'tester',
        promptTemplate: 'Do {{task}} for {{target}}',
    });

    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerTaskTemplateRoutes(app, { getSession: () => null });
        const res = await app.inject({ method: 'POST', url: '/v1/task-templates', payload: validBody() });
        assert.equal(res.statusCode, 401);
    });

    it('returns 400 when required fields are missing', async () => {
        const { app } = buildApp();
        const { name: _, ...body } = validBody();
        const res = await app.inject({ method: 'POST', url: '/v1/task-templates', payload: body });
        assert.equal(res.statusCode, 400);
    });

    it('creates a template and returns 201', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'POST', url: '/v1/task-templates', payload: validBody() });
        assert.equal(res.statusCode, 201);
        const { template } = res.json();
        assert.equal(template.slug, 'my-custom-template');
        assert.equal(template.name, 'My Custom Template');
        assert.equal(template.isBuiltIn, false);
        assert.ok(template.id);
        assert.ok(template.createdAt);
    });

    it('returns 409 when slug conflicts', async () => {
        const { app } = buildApp();
        await app.inject({ method: 'POST', url: '/v1/task-templates', payload: validBody() });
        const res = await app.inject({ method: 'POST', url: '/v1/task-templates', payload: validBody() });
        assert.equal(res.statusCode, 409);
    });
});

// ---------------------------------------------------------------------------
// POST /v1/task-templates/:id/dispatch
// ---------------------------------------------------------------------------

describe('POST /v1/task-templates/:id/dispatch', () => {
    const dispatchBody = () => ({
        agentId: 'bot_1',
        workspaceId: 'ws_1',
        inputs: { prospect_name: 'Jane Smith', company_name: 'Acme', prospect_role: 'CTO', pain_point: 'slow pipelines' },
    });

    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerTaskTemplateRoutes(app, { getSession: () => null });
        const res = await app.inject({ method: 'POST', url: '/v1/task-templates/draft-cold-email/dispatch', payload: dispatchBody() });
        assert.equal(res.statusCode, 401);
    });

    it('returns 400 when agentId is missing', async () => {
        const { app } = buildApp();
        const { agentId: _, ...body } = dispatchBody();
        const res = await app.inject({ method: 'POST', url: '/v1/task-templates/draft-cold-email/dispatch', payload: body });
        assert.equal(res.statusCode, 400);
    });

    it('returns 400 when workspaceId is missing', async () => {
        const { app } = buildApp();
        const { workspaceId: _, ...body } = dispatchBody();
        const res = await app.inject({ method: 'POST', url: '/v1/task-templates/draft-cold-email/dispatch', payload: body });
        assert.equal(res.statusCode, 400);
    });

    it('returns 404 for unknown template', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/task-templates/nonexistent-xyz/dispatch',
            payload: dispatchBody(),
        });
        assert.equal(res.statusCode, 404);
    });

    it('dispatches built-in template and returns 201 with queued status', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/task-templates/draft-cold-email/dispatch',
            payload: dispatchBody(),
        });
        assert.equal(res.statusCode, 201);
        const body = res.json();
        assert.ok(body.dispatchId);
        assert.equal(body.templateId, 'builtin-draft-cold-email');
        assert.equal(body.status, 'queued');
        assert.ok(body.taskDescription.includes('Jane Smith'));
    });
});
