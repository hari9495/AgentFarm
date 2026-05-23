import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerOrchestrationRoutes } from './orchestration.js';

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

const makeSession = (role = 'operator', tenantId = 'tenant_1') => ({
    userId: 'user_1',
    tenantId,
    workspaceIds: ['ws_1'],
    role,
    expiresAt: Date.now() + 60_000,
});

// ---------------------------------------------------------------------------
// Data stubs
// ---------------------------------------------------------------------------

const runRecord = () => ({
    id: 'run_1',
    tenantId: 'tenant_1',
    workspaceId: 'ws_1',
    coordinatorBotId: 'bot_1',
    goal: 'Analyse and fix',
    status: 'running',
    subTaskCount: 2,
    completedCount: 0,
    failedCount: 0,
    result: null,
    errorSummary: null,
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    dispatches: [],
});

const dispatchRecord = () => ({
    id: 'dispatch_1',
    fromAgentId: 'bot_1',
    toAgentId: 'agent_security',
    workspaceId: 'ws_1',
    tenantId: 'tenant_1',
    taskDescription: 'Run security review',
    status: 'queued',
    wakeSource: 'orchestration',
    orchestrationRunId: 'run_1',
    subTaskIndex: 0,
    completedAt: null,
    result: null,
    errorMessage: null,
    queuedAt: new Date(),
    createdAt: new Date(),
});

// ---------------------------------------------------------------------------
// Prisma mock
// ---------------------------------------------------------------------------

const makePrisma = (overrides: Record<string, any> = {}) => {
    const run = runRecord();
    const dispatch = dispatchRecord();
    // Updated run returned after transaction (completedCount 1 < subTaskCount 2)
    const runAfterTx = { ...run, completedCount: 1 };

    const prisma: any = {
        orchestrationRun: {
            create: async ({ data }: any) => ({ ...run, ...data, id: 'run_1' }),
            findMany: async () => [run],
            findUnique: async ({ where }: any) =>
                where?.id === 'run_1' ? { ...run, dispatches: [dispatch] } : null,
            update: async ({ data }: any) => ({ ...run, ...data }),
            ...(overrides.orchestrationRun ?? {}),
        },
        agentDispatchRecord: {
            create: async ({ data }: any) => ({ ...dispatch, ...data, id: 'dispatch_new' }),
            findUnique: async ({ where }: any) =>
                where?.id === 'dispatch_1' ? dispatch : null,
            findMany: async () => [dispatch],
            update: async ({ data }: any) => ({ ...dispatch, ...data }),
            updateMany: async () => ({ count: 1 }),
            ...(overrides.agentDispatchRecord ?? {}),
        },
        $transaction: async (fn: any) => fn({
            orchestrationRun: {
                update: async () => runAfterTx,
            },
        }),
        ...(overrides.$extra ?? {}),
    };
    return prisma;
};

const validBody = {
    coordinatorBotId: 'bot_1',
    workspaceId: 'ws_1',
    goal: 'Analyse and fix',
    subTasks: [
        { toAgentId: 'agent_security', taskDescription: 'Security review' },
        { toAgentId: 'agent_lint', taskDescription: 'Lint check' },
    ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// 1. POST /v1/orchestration/runs — 201 with valid body
test('POST /v1/orchestration/runs — 201 with valid body', async () => {
    const app = Fastify({ logger: false });
    await registerOrchestrationRoutes(app, {
        getSession: () => makeSession('operator'),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/orchestration/runs',
            payload: validBody,
        });
        assert.equal(res.statusCode, 201);
        const body = res.json<{ id: string; subTaskCount: number }>();
        assert.ok(body.id);
        assert.equal(body.subTaskCount, 2);
    } finally {
        await app.close();
    }
});

// 2. POST /v1/orchestration/runs — 403 if viewer role
test('POST /v1/orchestration/runs — 403 if viewer role', async () => {
    const app = Fastify({ logger: false });
    await registerOrchestrationRoutes(app, {
        getSession: () => makeSession('viewer'),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/orchestration/runs',
            payload: validBody,
        });
        assert.equal(res.statusCode, 403);
    } finally {
        await app.close();
    }
});

// 3. POST /v1/orchestration/runs — 400 if subTasks is empty
test('POST /v1/orchestration/runs — 400 if subTasks is empty', async () => {
    const app = Fastify({ logger: false });
    await registerOrchestrationRoutes(app, {
        getSession: () => makeSession('operator'),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/orchestration/runs',
            payload: { ...validBody, subTasks: [] },
        });
        assert.equal(res.statusCode, 400);
        const body = res.json<{ error: string }>();
        assert.ok(body.error);
    } finally {
        await app.close();
    }
});

// 4. GET /v1/orchestration/runs — returns list for tenant
test('GET /v1/orchestration/runs — returns list for tenant', async () => {
    const app = Fastify({ logger: false });
    await registerOrchestrationRoutes(app, {
        getSession: () => makeSession('viewer'),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/orchestration/runs' });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ runs: unknown[] }>();
        assert.ok(Array.isArray(body.runs));
        assert.equal(body.runs.length, 1);
    } finally {
        await app.close();
    }
});

// 5. GET /v1/orchestration/runs/:runId — 200 with dispatches
test('GET /v1/orchestration/runs/:runId — 200 with dispatches', async () => {
    const app = Fastify({ logger: false });
    await registerOrchestrationRoutes(app, {
        getSession: () => makeSession('viewer'),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/orchestration/runs/run_1' });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ id: string; dispatches: unknown[] }>();
        assert.equal(body.id, 'run_1');
        assert.ok(Array.isArray(body.dispatches));
    } finally {
        await app.close();
    }
});

// 6. GET /v1/orchestration/runs/:runId — 404 on wrong tenant
test('GET /v1/orchestration/runs/:runId — 404 on wrong tenant', async () => {
    const app = Fastify({ logger: false });
    await registerOrchestrationRoutes(app, {
        getSession: () => makeSession('viewer', 'tenant_other'),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/orchestration/runs/run_1' });
        assert.equal(res.statusCode, 404);
    } finally {
        await app.close();
    }
});

// 7. POST /v1/orchestration/runs/:runId/cancel — 200 on success
test('POST /v1/orchestration/runs/:runId/cancel — 200 on success', async () => {
    const app = Fastify({ logger: false });
    await registerOrchestrationRoutes(app, {
        getSession: () => makeSession('operator'),
        prisma: makePrisma({
            orchestrationRun: {
                findUnique: async () => ({ ...runRecord(), status: 'running' }),
                update: async ({ data }: any) => ({ ...runRecord(), ...data }),
            },
            agentDispatchRecord: {
                updateMany: async () => ({ count: 1 }),
            },
        }),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/orchestration/runs/run_1/cancel',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ status: string }>();
        assert.equal(body.status, 'cancelled');
    } finally {
        await app.close();
    }
});

// 8. POST /v1/orchestration/runs/:runId/cancel — 403 if viewer role
test('POST /v1/orchestration/runs/:runId/cancel — 403 if viewer role', async () => {
    const app = Fastify({ logger: false });
    await registerOrchestrationRoutes(app, {
        getSession: () => makeSession('viewer'),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/orchestration/runs/run_1/cancel',
        });
        assert.equal(res.statusCode, 403);
    } finally {
        await app.close();
    }
});

// 9. POST /v1/orchestration/runs/:runId/subtasks/:dispatchId/complete — 200 on success
test('POST /v1/orchestration/runs/:runId/subtasks/:dispatchId/complete — 200 on success', async () => {
    const app = Fastify({ logger: false });
    const run = runRecord();
    const dispatch = dispatchRecord();
    const runAfterTx = { ...run, completedCount: 1 }; // 1 < 2 → no finalization

    const prisma = makePrisma({
        agentDispatchRecord: {
            findUnique: async () => dispatch,
            update: async () => dispatch,
            findMany: async () => [dispatch],
        },
        orchestrationRun: {
            update: async ({ data }: any) => ({ ...run, ...data }),
        },
        '$transaction_override': true,
    });
    // Override $transaction to return runAfterTx (completedCount < subTaskCount)
    prisma.$transaction = async (fn: any) => fn({
        orchestrationRun: { update: async () => runAfterTx },
    });

    await registerOrchestrationRoutes(app, {
        getSession: () => makeSession('operator'),
        prisma,
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/orchestration/runs/run_1/subtasks/dispatch_1/complete',
            payload: { success: true },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ run: { completedCount: number } }>();
        assert.ok(body.run);
    } finally {
        await app.close();
    }
});

// 10. POST /v1/orchestration/runs/:runId/subtasks/:dispatchId/complete — 404 if dispatch belongs to different run
test('POST .../subtasks/:dispatchId/complete — 404 if dispatch belongs to different run', async () => {
    const app = Fastify({ logger: false });
    const dispatch = dispatchRecord();

    await registerOrchestrationRoutes(app, {
        getSession: () => makeSession('operator'),
        prisma: makePrisma({
            agentDispatchRecord: {
                // dispatch belongs to run_other, not run_1
                findUnique: async () => ({ ...dispatch, orchestrationRunId: 'run_other' }),
            },
        }),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/orchestration/runs/run_1/subtasks/dispatch_1/complete',
            payload: { success: true },
        });
        assert.equal(res.statusCode, 404);
    } finally {
        await app.close();
    }
});
