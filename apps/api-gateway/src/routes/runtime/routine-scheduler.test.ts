/**
 * Epic B4: Feature-Flagged Routine Scheduler — api-gateway surface tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerRoutineSchedulerRoutes } from './routine-scheduler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const buildSession = (opts?: { role?: string }) => ({
    userId: 'user_1',
    tenantId: 'tenant_1',
    workspaceIds: ['ws_1'],
    role: opts?.role ?? 'operator',
    expiresAt: Date.now() + 60_000,
});

const buildApp = (overrideGetSession?: () => ReturnType<typeof buildSession> | null) => {
    const app = Fastify({ logger: false });
    void registerRoutineSchedulerRoutes(app, {
        getSession: () => (overrideGetSession ? overrideGetSession() : buildSession()),
        orchestratorBaseUrl: 'http://orchestrator.test',
    });
    return app;
};

// ---------------------------------------------------------------------------
// Feature-flag enable / disable
// ---------------------------------------------------------------------------

test('B4: POST /v1/runtime-flags/:flagKey/enable — 401 without session', async () => {
    const app = buildApp(() => null);

    const res = await app.inject({
        method: 'POST',
        url: '/v1/runtime-flags/scheduler.routine_tasks/enable',
    });

    assert.equal(res.statusCode, 401);
});

test('B4: POST /v1/runtime-flags/:flagKey/enable — 403 for non-admin role', async () => {
    const app = buildApp(() => buildSession({ role: 'operator' }));

    const res = await app.inject({
        method: 'POST',
        url: '/v1/runtime-flags/scheduler.routine_tasks/enable',
    });

    assert.equal(res.statusCode, 403);
    const body = res.json<{ error: string; required: string }>();
    assert.equal(body.required, 'admin');
});

test('B4: POST /v1/runtime-flags/:flagKey/enable — proxies to orchestrator for admin', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';

    globalThis.fetch = (async (url: string | URL | Request) => {
        capturedUrl = String(url);
        return new Response(JSON.stringify({ feature_flag_key: 'scheduler.routine_tasks', enabled: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;

    const app = buildApp(() => buildSession({ role: 'admin' }));

    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/runtime-flags/scheduler.routine_tasks/enable',
        });

        assert.equal(res.statusCode, 200);
        const body = res.json<{ enabled: boolean }>();
        assert.equal(body.enabled, true);
        assert.ok(capturedUrl.includes('/v1/feature-flags/scheduler.routine_tasks/enable'));
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('B4: POST /v1/runtime-flags/:flagKey/disable — proxies to orchestrator for admin', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';

    globalThis.fetch = (async (url: string | URL | Request) => {
        capturedUrl = String(url);
        return new Response(JSON.stringify({ feature_flag_key: 'scheduler.routine_tasks', enabled: false }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;

    const app = buildApp(() => buildSession({ role: 'admin' }));

    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/runtime-flags/scheduler.routine_tasks/disable',
        });

        assert.equal(res.statusCode, 200);
        const body = res.json<{ enabled: boolean }>();
        assert.equal(body.enabled, false);
        assert.ok(capturedUrl.includes('/v1/feature-flags/scheduler.routine_tasks/disable'));
    } finally {
        globalThis.fetch = originalFetch;
    }
});

// ---------------------------------------------------------------------------
// Routine task creation
// ---------------------------------------------------------------------------

test('B4: POST /v1/routine-tasks — 401 without session', async () => {
    const app = buildApp(() => null);

    const res = await app.inject({
        method: 'POST',
        url: '/v1/routine-tasks',
        payload: {},
    });

    assert.equal(res.statusCode, 401);
});

test('B4: POST /v1/routine-tasks — 403 when workspace not in session scope', async () => {
    const app = buildApp();

    const res = await app.inject({
        method: 'POST',
        url: '/v1/routine-tasks',
        payload: {
            workspace_id: 'ws_other',
            bot_id: 'bot_1',
            schedule_type: 'daily',
            schedule_expression: '0 9 * * *',
            policy: { dedupe_key: 'daily', concurrency_policy: 'queue', max_retries: 0, retry_backoff_ms: 0 },
        },
    });

    assert.equal(res.statusCode, 403);
    const body = res.json<{ error: string }>();
    assert.equal(body.error, 'workspace_scope_violation');
});

test('B4: POST /v1/routine-tasks — 400 on missing bot_id', async () => {
    const app = buildApp();

    const res = await app.inject({
        method: 'POST',
        url: '/v1/routine-tasks',
        payload: {
            workspace_id: 'ws_1',
            schedule_type: 'daily',
            schedule_expression: '0 9 * * *',
            policy: { dedupe_key: 'daily', concurrency_policy: 'queue' },
        },
    });

    assert.equal(res.statusCode, 400);
    const body = res.json<{ error: string }>();
    assert.equal(body.error, 'invalid_request');
});

test('B4: POST /v1/routine-tasks — 400 on invalid concurrency_policy', async () => {
    const app = buildApp();

    const res = await app.inject({
        method: 'POST',
        url: '/v1/routine-tasks',
        payload: {
            workspace_id: 'ws_1',
            bot_id: 'bot_1',
            schedule_type: 'daily',
            schedule_expression: '0 9 * * *',
            policy: { dedupe_key: 'daily', concurrency_policy: 'invalid' },
        },
    });

    assert.equal(res.statusCode, 400);
    const body = res.json<{ error: string }>();
    assert.equal(body.error, 'invalid_policy');
});

test('B4: POST /v1/routine-tasks — 201 proxied to orchestrator with tenant context', async () => {
    const originalFetch = globalThis.fetch;
    let forwardedBody: Record<string, unknown> | null = null;

    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        forwardedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        return new Response(
            JSON.stringify({
                id: 'task_abc',
                schedule_id: 'sched_abc',
                bot_id: 'bot_1',
                workspace_id: 'ws_1',
                enabled: true,
                feature_flag_key: 'scheduler.routine_tasks',
                status: 'pending',
            }),
            { status: 201, headers: { 'content-type': 'application/json' } },
        );
    }) as typeof fetch;

    const app = buildApp();

    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/routine-tasks',
            payload: {
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                schedule_type: 'daily',
                schedule_expression: '0 9 * * *',
                policy: { dedupe_key: 'daily-bot1', concurrency_policy: 'queue', max_retries: 2, retry_backoff_ms: 1000 },
                correlation_id: 'corr_b4',
            },
        });

        assert.equal(res.statusCode, 201);
        const body = res.json<{ id: string; enabled: boolean }>();
        assert.equal(body.enabled, true);

        // Verify tenant injection and workspace forwarding
        assert.ok(forwardedBody);
        assert.equal(forwardedBody['tenant_id'], 'tenant_1');
        assert.equal(forwardedBody['workspace_id'], 'ws_1');
        assert.equal(forwardedBody['bot_id'], 'bot_1');
        const policy = forwardedBody['policy'] as Record<string, unknown>;
        assert.equal(policy['concurrency_policy'], 'queue');
        assert.equal(policy['dedupe_key'], 'daily-bot1');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

// ---------------------------------------------------------------------------
// Run trigger + complete
// ---------------------------------------------------------------------------

test('B4: POST /v1/routine-tasks/:id/runs — 401 without session', async () => {
    const app = buildApp(() => null);

    const res = await app.inject({
        method: 'POST',
        url: '/v1/routine-tasks/task_abc/runs',
        payload: {},
    });

    assert.equal(res.statusCode, 401);
});

test('B4: POST /v1/routine-tasks/:id/runs — proxies run trigger to orchestrator', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';

    globalThis.fetch = (async (url: string | URL | Request, _init?: RequestInit) => {
        capturedUrl = String(url);
        return new Response(
            JSON.stringify({
                schedule_task_id: 'task_abc',
                run_id: 'run_001',
                deduplicated: false,
                correlation_id: 'corr-run',
            }),
            { status: 201, headers: { 'content-type': 'application/json' } },
        );
    }) as typeof fetch;

    const app = buildApp();

    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/routine-tasks/task_abc/runs',
            payload: { correlation_id: 'corr-run' },
        });

        assert.equal(res.statusCode, 201);
        const body = res.json<{ run_id: string; deduplicated: boolean }>();
        assert.equal(body.deduplicated, false);
        assert.ok(capturedUrl.includes('/v1/schedules/task_abc/runs'));
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('B4: GET /v1/routine-scheduler/errors — 403 for non-admin role', async () => {
    const app = buildApp(() => buildSession({ role: 'operator' }));

    const res = await app.inject({
        method: 'GET',
        url: '/v1/routine-scheduler/errors',
    });

    assert.equal(res.statusCode, 403);
});

test('B4: GET /v1/routine-scheduler/errors — proxies error log for admin', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async () => {
        return new Response(
            JSON.stringify({ errors: [{ message: 'scheduler failed', timestamp: Date.now() }] }),
            { status: 200, headers: { 'content-type': 'application/json' } },
        );
    }) as typeof fetch;

    const app = buildApp(() => buildSession({ role: 'admin' }));

    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/routine-scheduler/errors?limit=5',
        });

        assert.equal(res.statusCode, 200);
        const body = res.json<{ errors: Array<{ message: string }> }>();
        assert.ok(Array.isArray(body.errors));
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('B4: GET /v1/bots/:botId/routine-tasks — lists routine tasks for bot', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async () => {
        return new Response(
            JSON.stringify({ bot_id: 'bot_1', schedules: [{ id: 'task_abc', enabled: true }] }),
            { status: 200, headers: { 'content-type': 'application/json' } },
        );
    }) as typeof fetch;

    const app = buildApp();

    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/bots/bot_1/routine-tasks',
        });

        assert.equal(res.statusCode, 200);
        const body = res.json<{ bot_id: string; schedules: unknown[] }>();
        assert.equal(body.bot_id, 'bot_1');
        assert.ok(Array.isArray(body.schedules));
    } finally {
        globalThis.fetch = originalFetch;
    }
});
