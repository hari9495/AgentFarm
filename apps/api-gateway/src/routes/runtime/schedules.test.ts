import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerScheduleRoutes } from './schedules.js';

// ── Session helpers ───────────────────────────────────────────────────────────

const makeSession = (tenantId = 'tenant_1', role = 'admin') => ({
    userId: 'user_1',
    tenantId,
    workspaceIds: ['ws_1'],
    role,
    expiresAt: Date.now() + 60_000,
});

// ── Prisma mock helpers ───────────────────────────────────────────────────────

const makeJobRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'job_1',
    tenantId: 'tenant_1',
    name: 'Nightly report',
    cronExpr: '0 0 * * *',
    goal: 'Generate nightly summary',
    agentId: null,
    enabled: true,
    lastRunAt: null,
    nextRunAt: new Date('2026-05-11T00:00:00Z'),
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
    ...overrides,
});

const makePrisma = (overrides: Record<string, unknown> = {}) => ({
    scheduledJob: {
        findMany: async () => [makeJobRecord()],
        findUnique: async ({ where }: { where: { id: string } }) =>
            where.id === 'job_1' ? makeJobRecord() : null,
        create: async ({ data }: { data: Record<string, unknown> }) =>
            makeJobRecord({ id: 'job_new', ...data }),
        update: async ({ data }: { data: Record<string, unknown> }) =>
            makeJobRecord({ ...data }),
        delete: async () => makeJobRecord(),
        ...((overrides as any)?.scheduledJob ?? {}),
    },
    ...overrides,
} as any);

// ── Tests ─────────────────────────────────────────────────────────────────────

// 1. GET /v1/schedules — returns list for tenant
test('GET /v1/schedules — returns list for tenant', async () => {
    const app = Fastify();
    await registerScheduleRoutes(app, { getSession: () => makeSession(), prisma: makePrisma() });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/schedules' });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ schedules: unknown[] }>();
        assert.ok(Array.isArray(body.schedules));
        assert.equal(body.schedules.length, 1);
    } finally {
        await app.close();
    }
});

// 2. POST /v1/schedules — 201 on valid body
test('POST /v1/schedules — 201 on valid body', async () => {
    const app = Fastify();
    await registerScheduleRoutes(app, { getSession: () => makeSession(), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/schedules',
            payload: { name: 'Daily', cronExpr: '0 9 * * *', goal: 'Morning digest' },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json<{ id: string; cronExpr: string }>();
        assert.ok(body.id);
        assert.equal(body.cronExpr, '0 9 * * *');
    } finally {
        await app.close();
    }
});

// 3. POST /v1/schedules — 400 on invalid cronExpr
test('POST /v1/schedules — 400 on invalid cronExpr', async () => {
    const app = Fastify();
    await registerScheduleRoutes(app, { getSession: () => makeSession(), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/schedules',
            payload: { name: 'Bad', cronExpr: 'not a cron', goal: 'something' },
        });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json<{ error: string }>().error, 'invalid cronExpr');
    } finally {
        await app.close();
    }
});

// 4. GET /v1/schedules/:id — 200 on found
test('GET /v1/schedules/:id — 200 on found', async () => {
    const app = Fastify();
    await registerScheduleRoutes(app, { getSession: () => makeSession(), prisma: makePrisma() });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/schedules/job_1' });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ id: string }>();
        assert.equal(body.id, 'job_1');
    } finally {
        await app.close();
    }
});

// 5. GET /v1/schedules/:id — 404 on wrong tenant
test('GET /v1/schedules/:id — 404 on wrong tenant', async () => {
    const app = Fastify();
    // session is tenant_other, but job belongs to tenant_1
    await registerScheduleRoutes(app, {
        getSession: () => makeSession('tenant_other'),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/schedules/job_1' });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json<{ error: string }>().error, 'not_found');
    } finally {
        await app.close();
    }
});

// 6. PATCH /v1/schedules/:id — updates fields
test('PATCH /v1/schedules/:id — updates fields', async () => {
    const app = Fastify();
    let capturedData: Record<string, unknown> = {};
    const prisma = makePrisma({
        scheduledJob: {
            findUnique: async () => makeJobRecord(),
            update: async ({ data }: { data: Record<string, unknown> }) => {
                capturedData = data;
                return makeJobRecord({ ...data });
            },
        },
    });
    await registerScheduleRoutes(app, { getSession: () => makeSession(), prisma });
    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/schedules/job_1',
            payload: { name: 'Updated Name', enabled: false },
        });
        assert.equal(res.statusCode, 200);
        assert.equal(capturedData['name'], 'Updated Name');
        assert.equal(capturedData['enabled'], false);
    } finally {
        await app.close();
    }
});

// 7. PATCH /v1/schedules/:id — resets nextRunAt when cronExpr changes
test('PATCH /v1/schedules/:id — resets nextRunAt when cronExpr changes', async () => {
    const app = Fastify();
    let capturedData: Record<string, unknown> = {};
    const prisma = makePrisma({
        scheduledJob: {
            findUnique: async () => makeJobRecord(),
            update: async ({ data }: { data: Record<string, unknown> }) => {
                capturedData = data;
                return makeJobRecord({ ...data });
            },
        },
    });
    await registerScheduleRoutes(app, { getSession: () => makeSession(), prisma });
    try {
        const beforePatch = new Date();
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/schedules/job_1',
            payload: { cronExpr: '*/5 * * * *' },
        });
        assert.equal(res.statusCode, 200);
        assert.equal(capturedData['cronExpr'], '*/5 * * * *');
        assert.ok(capturedData['nextRunAt'] instanceof Date, 'nextRunAt should be reset to a Date');
        assert.ok(
            (capturedData['nextRunAt'] as Date) >= beforePatch,
            'nextRunAt should be on or after patch time',
        );
    } finally {
        await app.close();
    }
});

// 8. PATCH /v1/schedules/:id — 404 on wrong tenant
test('PATCH /v1/schedules/:id — 404 on wrong tenant', async () => {
    const app = Fastify();
    await registerScheduleRoutes(app, {
        getSession: () => makeSession('tenant_other'),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/schedules/job_1',
            payload: { name: 'x' },
        });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json<{ error: string }>().error, 'not_found');
    } finally {
        await app.close();
    }
});

// 9. DELETE /v1/schedules/:id — 204
test('DELETE /v1/schedules/:id — 204', async () => {
    const app = Fastify();
    await registerScheduleRoutes(app, { getSession: () => makeSession(), prisma: makePrisma() });
    try {
        const res = await app.inject({ method: 'DELETE', url: '/v1/schedules/job_1' });
        assert.equal(res.statusCode, 204);
    } finally {
        await app.close();
    }
});

// 10. DELETE /v1/schedules/:id — 404 on wrong tenant
test('DELETE /v1/schedules/:id — 404 on wrong tenant', async () => {
    const app = Fastify();
    await registerScheduleRoutes(app, {
        getSession: () => makeSession('tenant_other'),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({ method: 'DELETE', url: '/v1/schedules/job_1' });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json<{ error: string }>().error, 'not_found');
    } finally {
        await app.close();
    }
});

// 11. POST /v1/schedules — 403 if role is viewer
test('POST /v1/schedules — 403 if role is viewer', async () => {
    const app = Fastify();
    await registerScheduleRoutes(app, {
        getSession: () => makeSession('tenant_1', 'viewer'),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/schedules',
            payload: { name: 'test', cronExpr: '* * * * *', goal: 'something' },
        });
        assert.equal(res.statusCode, 403);
        assert.equal(res.json<{ error: string }>().error, 'insufficient_role');
    } finally {
        await app.close();
    }
});

// 12. DELETE /v1/schedules/:id — 403 if role is operator (needs admin)
test('DELETE /v1/schedules/:id — 403 if role is operator (needs admin)', async () => {
    const app = Fastify();
    await registerScheduleRoutes(app, {
        getSession: () => makeSession('tenant_1', 'operator'),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({ method: 'DELETE', url: '/v1/schedules/job_1' });
        assert.equal(res.statusCode, 403);
        const body = res.json<{ error: string; required: string }>();
        assert.equal(body.error, 'insufficient_role');
        assert.equal(body.required, 'admin');
    } finally {
        await app.close();
    }
});
