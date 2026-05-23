import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerAbTestRoutes } from './ab-tests.js';

// ── Session helpers ───────────────────────────────────────────────────────────

const makeSession = (tenantId = 'tenant_1', role = 'admin') => ({
    userId: 'user_1',
    tenantId,
    workspaceIds: ['ws_1'],
    role,
    expiresAt: Date.now() + 60_000,
});

// ── Prisma mock helpers ───────────────────────────────────────────────────────

const makeAbTest = (overrides: Record<string, unknown> = {}) => ({
    id: 'abt_1',
    tenantId: 'tenant_1',
    botId: 'bot_1',
    name: 'title-test',
    versionAId: 'ver_a',
    versionBId: 'ver_b',
    trafficSplit: 0.5,
    status: 'active',
    conclusionNote: null,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
    ...overrides,
});

const makeAssignment = (overrides: Record<string, unknown> = {}) => ({
    id: 'assign_1',
    abTestId: 'abt_1',
    tenantId: 'tenant_1',
    taskId: 'task_1',
    versionId: 'ver_a',
    variant: 'A',
    createdAt: new Date('2026-05-01T00:00:00Z'),
    ...overrides,
});

type PrismaMockOpts = {
    abTest?: ReturnType<typeof makeAbTest> | null;
    abTests?: ReturnType<typeof makeAbTest>[];
    assignment?: ReturnType<typeof makeAssignment> | null;
    assignments?: ReturnType<typeof makeAssignment>[];
    qualitySignals?: Array<{ score: number | null }>;
    createdAbTest?: ReturnType<typeof makeAbTest>;
    updatedAbTest?: ReturnType<typeof makeAbTest>;
    onAbTestCreate?: () => void;
    onAbTestUpdate?: () => void;
    onAssignCreate?: () => void;
};

const makePrisma = (opts: PrismaMockOpts = {}) => {
    const {
        abTest = makeAbTest(),
        abTests = [makeAbTest()],
        assignment = null,
        assignments = [],
        qualitySignals = [],
        createdAbTest = makeAbTest(),
        updatedAbTest = makeAbTest({ status: 'concluded' }),
        onAbTestCreate,
        onAbTestUpdate,
        onAssignCreate,
    } = opts;

    return {
        abTest: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
                if (onAbTestCreate) onAbTestCreate();
                return { ...createdAbTest, ...data };
            },
            findMany: async () => abTests,
            findUnique: async ({ where }: { where: { id: string } }) => {
                if (where.id === abTest?.id) return abTest;
                return null;
            },
            update: async ({ data }: { data: Record<string, unknown> }) => {
                if (onAbTestUpdate) onAbTestUpdate();
                return { ...updatedAbTest, ...data };
            },
        },
        abTestAssignment: {
            findUnique: async ({ where }: { where: { taskId: string } }) => {
                if (where.taskId === assignment?.taskId) return assignment;
                return null;
            },
            findMany: async () => assignments,
            create: async ({ data }: { data: Record<string, unknown> }) => {
                if (onAssignCreate) onAssignCreate();
                return makeAssignment({ ...data });
            },
        },
        qualitySignalLog: {
            findMany: async () => qualitySignals,
        },
        auditEvent: {
            create: async () => ({}),
        },
    } as any;
};

// ── Tests ─────────────────────────────────────────────────────────────────────

// ── Group 1: POST /v1/ab-tests ────────────────────────────────────────────────

// 1. Creates A/B test and returns 201
test('POST /v1/ab-tests — 201 with valid body', async () => {
    const app = Fastify();
    await registerAbTestRoutes(app, { getSession: () => makeSession('tenant_1', 'operator'), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/ab-tests',
            payload: { botId: 'bot_1', name: 'test', versionAId: 'ver_a', versionBId: 'ver_b', trafficSplit: 0.4 },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json<{ abTest: { id: string } }>();
        assert.ok(body.abTest?.id);
    } finally {
        await app.close();
    }
});

// 2. 400 when botId missing
test('POST /v1/ab-tests — 400 when botId missing', async () => {
    const app = Fastify();
    await registerAbTestRoutes(app, { getSession: () => makeSession('tenant_1', 'operator'), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/ab-tests',
            payload: { name: 'test', versionAId: 'ver_a', versionBId: 'ver_b' },
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

// 3. 400 when trafficSplit out of range
test('POST /v1/ab-tests — 400 when trafficSplit > 1', async () => {
    const app = Fastify();
    await registerAbTestRoutes(app, { getSession: () => makeSession('tenant_1', 'operator'), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/ab-tests',
            payload: { botId: 'bot_1', name: 'test', versionAId: 'ver_a', versionBId: 'ver_b', trafficSplit: 1.5 },
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

// 4. 403 if viewer role
test('POST /v1/ab-tests — 403 if viewer role', async () => {
    const app = Fastify();
    await registerAbTestRoutes(app, { getSession: () => makeSession('tenant_1', 'viewer'), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/ab-tests',
            payload: { botId: 'bot_1', name: 'test', versionAId: 'ver_a', versionBId: 'ver_b' },
        });
        assert.equal(res.statusCode, 403);
        assert.equal(res.json<{ error: string }>().error, 'insufficient_role');
    } finally {
        await app.close();
    }
});

// 5. 401 if no session
test('POST /v1/ab-tests — 401 if no session', async () => {
    const app = Fastify();
    await registerAbTestRoutes(app, { getSession: () => null, prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/ab-tests',
            payload: { botId: 'bot_1', name: 'test', versionAId: 'ver_a', versionBId: 'ver_b' },
        });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

// ── Group 2: GET /v1/ab-tests and GET /v1/ab-tests/:abTestId ─────────────────

// 6. GET /v1/ab-tests — returns list
test('GET /v1/ab-tests — returns list of tests', async () => {
    const app = Fastify();
    await registerAbTestRoutes(app, { getSession: () => makeSession(), prisma: makePrisma() });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/ab-tests' });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ abTests: unknown[] }>();
        assert.ok(Array.isArray(body.abTests));
        assert.equal(body.abTests.length, 1);
    } finally {
        await app.close();
    }
});

// 7. GET /v1/ab-tests — 403 if no role
test('GET /v1/ab-tests — 401 if unauthenticated', async () => {
    const app = Fastify();
    await registerAbTestRoutes(app, { getSession: () => null, prisma: makePrisma() });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/ab-tests' });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

// 8. GET /v1/ab-tests/:abTestId — 200 returns test
test('GET /v1/ab-tests/:abTestId — 200 returns test', async () => {
    const app = Fastify();
    await registerAbTestRoutes(app, { getSession: () => makeSession(), prisma: makePrisma() });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/ab-tests/abt_1' });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ abTest: { id: string } }>();
        assert.equal(body.abTest.id, 'abt_1');
    } finally {
        await app.close();
    }
});

// 9. GET /v1/ab-tests/:abTestId — 404 on wrong tenant
test('GET /v1/ab-tests/:abTestId — 404 on wrong tenant', async () => {
    const app = Fastify();
    await registerAbTestRoutes(app, { getSession: () => makeSession('other_tenant'), prisma: makePrisma() });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/ab-tests/abt_1' });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json<{ error: string }>().error, 'not_found');
    } finally {
        await app.close();
    }
});

// 10. GET /v1/ab-tests/:abTestId — 404 when test does not exist
test('GET /v1/ab-tests/:abTestId — 404 when test not found', async () => {
    const app = Fastify();
    await registerAbTestRoutes(app, { getSession: () => makeSession(), prisma: makePrisma({ abTest: null }) });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/ab-tests/abt_1' });
        assert.equal(res.statusCode, 404);
    } finally {
        await app.close();
    }
});

// ── Group 3: Results + Assign ─────────────────────────────────────────────────

// 11. GET /v1/ab-tests/:abTestId/results — 200 returns stats
test('GET /v1/ab-tests/:abTestId/results — 200 returns variant stats', async () => {
    const app = Fastify();
    const assignments = [
        makeAssignment({ variant: 'A', versionId: 'ver_a', taskId: 'task_1' }),
        makeAssignment({ id: 'assign_2', variant: 'B', versionId: 'ver_b', taskId: 'task_2' }),
    ];
    await registerAbTestRoutes(app, {
        getSession: () => makeSession(),
        prisma: makePrisma({
            assignments,
            qualitySignals: [{ score: 0.9 }, { score: 0.7 }],
        }),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/ab-tests/abt_1/results' });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ results: { a: { variant: string }; b: { variant: string } } }>();
        assert.equal(body.results.a.variant, 'A');
        assert.equal(body.results.b.variant, 'B');
    } finally {
        await app.close();
    }
});

// 12. GET /v1/ab-tests/:abTestId/results — 404 on wrong tenant
test('GET /v1/ab-tests/:abTestId/results — 404 on wrong tenant', async () => {
    const app = Fastify();
    await registerAbTestRoutes(app, { getSession: () => makeSession('other_tenant'), prisma: makePrisma() });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/ab-tests/abt_1/results' });
        assert.equal(res.statusCode, 404);
    } finally {
        await app.close();
    }
});

// 13. POST /v1/ab-tests/:abTestId/assign — 200 creates assignment
test('POST /v1/ab-tests/:abTestId/assign — 200 creates assignment', async () => {
    const app = Fastify();
    await registerAbTestRoutes(app, { getSession: () => makeSession('tenant_1', 'operator'), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/ab-tests/abt_1/assign',
            payload: { taskId: 'task_new' },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ assignment: { taskId: string } }>();
        assert.ok(body.assignment);
    } finally {
        await app.close();
    }
});

// 14. POST /v1/ab-tests/:abTestId/assign — 400 when taskId missing
test('POST /v1/ab-tests/:abTestId/assign — 400 when taskId missing', async () => {
    const app = Fastify();
    await registerAbTestRoutes(app, { getSession: () => makeSession('tenant_1', 'operator'), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/ab-tests/abt_1/assign',
            payload: {},
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

// 15. POST /v1/ab-tests/:abTestId/assign — 404 when test inactive
test('POST /v1/ab-tests/:abTestId/assign — 404 when test is not active', async () => {
    const app = Fastify();
    await registerAbTestRoutes(app, {
        getSession: () => makeSession('tenant_1', 'operator'),
        prisma: makePrisma({ abTest: makeAbTest({ status: 'concluded' }) }),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/ab-tests/abt_1/assign',
            payload: { taskId: 'task_new' },
        });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json<{ error: string }>().error, 'not_found_or_inactive');
    } finally {
        await app.close();
    }
});

// 16. POST /v1/ab-tests/:abTestId/assign — idempotent: returns existing assignment
test('POST /v1/ab-tests/:abTestId/assign — idempotent on duplicate taskId', async () => {
    const app = Fastify();
    await registerAbTestRoutes(app, {
        getSession: () => makeSession('tenant_1', 'operator'),
        prisma: makePrisma({ assignment: makeAssignment({ taskId: 'task_1' }) }),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/ab-tests/abt_1/assign',
            payload: { taskId: 'task_1' },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ assignment: { taskId: string } }>();
        assert.equal(body.assignment.taskId, 'task_1');
    } finally {
        await app.close();
    }
});

// ── Group 4: Conclude ─────────────────────────────────────────────────────────

// 17. POST /v1/ab-tests/:abTestId/conclude — 200 marks test concluded
test('POST /v1/ab-tests/:abTestId/conclude — 200 concludes test', async () => {
    const app = Fastify();
    await registerAbTestRoutes(app, { getSession: () => makeSession(), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/ab-tests/abt_1/conclude',
            payload: { conclusionNote: 'Version B wins' },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ abTest: { status: string } }>();
        assert.equal(body.abTest.status, 'concluded');
    } finally {
        await app.close();
    }
});

// 18. POST /v1/ab-tests/:abTestId/conclude — 403 if operator role
test('POST /v1/ab-tests/:abTestId/conclude — 403 if operator role', async () => {
    const app = Fastify();
    await registerAbTestRoutes(app, { getSession: () => makeSession('tenant_1', 'operator'), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/ab-tests/abt_1/conclude',
            payload: {},
        });
        assert.equal(res.statusCode, 403);
        assert.equal(res.json<{ error: string }>().error, 'insufficient_role');
    } finally {
        await app.close();
    }
});

// 19. POST /v1/ab-tests/:abTestId/conclude — 404 if test not found
test('POST /v1/ab-tests/:abTestId/conclude — 404 if test not found', async () => {
    const app = Fastify();
    await registerAbTestRoutes(app, { getSession: () => makeSession(), prisma: makePrisma({ abTest: null }) });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/ab-tests/abt_1/conclude',
            payload: {},
        });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json<{ error: string }>().error, 'not_found');
    } finally {
        await app.close();
    }
});

// 20. POST /v1/ab-tests/:abTestId/conclude — 404 on wrong tenant
test('POST /v1/ab-tests/:abTestId/conclude — 404 on wrong tenant', async () => {
    const app = Fastify();
    await registerAbTestRoutes(app, { getSession: () => makeSession('other_tenant'), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/ab-tests/abt_1/conclude',
            payload: {},
        });
        assert.equal(res.statusCode, 404);
    } finally {
        await app.close();
    }
});
