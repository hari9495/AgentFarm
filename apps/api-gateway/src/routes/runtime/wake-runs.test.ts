/**
 * Epic B1: Wake Run Routes — tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerWakeRunRoutes } from './wake-runs.js';

const buildSession = () => ({
    userId: 'user_1',
    tenantId: 'tenant_1',
    workspaceIds: ['ws_1'],
    expiresAt: Date.now() + 60_000,
});

test('B1: POST /v1/wake/schedule proxies to orchestrator and returns coalesce result', async () => {
    const originalFetch = globalThis.fetch;
    let forwardedBody: Record<string, unknown> | null = null;

    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        forwardedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        return new Response(JSON.stringify({
            run_id: 'run-abc',
            wake_source: 'assignment',
            is_new_run: true,
            coalesced: false,
            message: 'Created new run run-abc from wake source: assignment',
            correlation_id: 'corr-1',
        }), {
            status: 201,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;

    const app = Fastify({ logger: false });
    await registerWakeRunRoutes(app, {
        getSession: () => buildSession(),
        orchestratorBaseUrl: 'http://orchestrator.test',
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/wake/schedule',
            payload: {
                workspace_id: 'ws_1',
                bot_id: 'bot-1',
                wake_source: 'assignment',
                correlation_id: 'corr-1',
            },
        });

        assert.equal(response.statusCode, 201);
        const body = response.json() as { run_id: string; is_new_run: boolean; coalesced: boolean };
        assert.equal(body.is_new_run, true);
        assert.equal(body.coalesced, false);
        assert.ok(forwardedBody);
        assert.equal(forwardedBody['tenant_id'], 'tenant_1');
        assert.equal(forwardedBody['workspace_id'], 'ws_1');
        assert.equal(forwardedBody['wake_source'], 'assignment');
    } finally {
        globalThis.fetch = originalFetch;
        await app.close();
    }
});

test('B1: POST /v1/wake/schedule returns 400 for invalid wake_source', async () => {
    const app = Fastify({ logger: false });
    await registerWakeRunRoutes(app, {
        getSession: () => buildSession(),
        orchestratorBaseUrl: 'http://orchestrator.test',
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/wake/schedule',
            payload: {
                workspace_id: 'ws_1',
                bot_id: 'bot-1',
                wake_source: 'unknown_source',
            },
        });

        assert.equal(response.statusCode, 400);
        const body = response.json() as { error: string };
        assert.equal(body.error, 'invalid_wake_source');
    } finally {
        await app.close();
    }
});

test('B1: POST /v1/wake/schedule returns 403 when workspace_id not in session', async () => {
    const app = Fastify({ logger: false });
    await registerWakeRunRoutes(app, {
        getSession: () => buildSession(),
        orchestratorBaseUrl: 'http://orchestrator.test',
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/wake/schedule',
            payload: {
                workspace_id: 'ws_other',
                bot_id: 'bot-1',
                wake_source: 'timer',
            },
        });

        assert.equal(response.statusCode, 403);
    } finally {
        await app.close();
    }
});

test('B1: GET /v1/wake/runs returns run records with wake source, status, and dedupe metadata', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';

    globalThis.fetch = (async (url: string | URL | Request) => {
        requestedUrl = String(url);
        return new Response(JSON.stringify({
            count: 2,
            runs: [
                {
                    id: 'run-1',
                    botId: 'bot-1',
                    tenantId: 'tenant_1',
                    workspaceId: 'ws_1',
                    wakeSource: 'timer',
                    status: 'active',
                    dedupeKey: 'timer:bot-1:hourly:2026-05-15:9',
                    activeTaskCount: 1,
                    startedAt: '2026-05-15T09:00:00.000Z',
                    lastHeartbeatAt: '2026-05-15T09:01:00.000Z',
                    correlationId: 'corr-1',
                },
                {
                    id: 'run-2',
                    botId: 'bot-2',
                    tenantId: 'tenant_1',
                    workspaceId: 'ws_1',
                    wakeSource: 'on_demand',
                    status: 'queued',
                    activeTaskCount: 0,
                    startedAt: '2026-05-15T09:02:00.000Z',
                    lastHeartbeatAt: '2026-05-15T09:02:00.000Z',
                    correlationId: 'corr-2',
                },
            ],
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;

    const app = Fastify({ logger: false });
    await registerWakeRunRoutes(app, {
        getSession: () => buildSession(),
        orchestratorBaseUrl: 'http://orchestrator.test',
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/wake/runs?workspace_id=ws_1',
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as { count: number; runs: Array<{ id: string; wakeSource: string; status: string }> };
        assert.equal(body.count, 2);
        assert.equal(body.runs[0]!.wakeSource, 'timer');
        assert.ok(typeof body.runs[0]!.status === 'string');

        // Verify workspace_id was forwarded
        const url = new URL(requestedUrl);
        assert.equal(url.searchParams.get('workspace_id'), 'ws_1');
    } finally {
        globalThis.fetch = originalFetch;
        await app.close();
    }
});

test('B1: GET /v1/wake/runs returns 403 when workspace_id not in session scope', async () => {
    const app = Fastify({ logger: false });
    await registerWakeRunRoutes(app, {
        getSession: () => buildSession(),
        orchestratorBaseUrl: 'http://orchestrator.test',
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/wake/runs?workspace_id=ws_other',
        });

        assert.equal(response.statusCode, 403);
    } finally {
        await app.close();
    }
});

test('B1: GET /v1/wake/runs returns 401 when no session', async () => {
    const app = Fastify({ logger: false });
    await registerWakeRunRoutes(app, {
        getSession: () => null,
        orchestratorBaseUrl: 'http://orchestrator.test',
    });

    try {
        const response = await app.inject({ method: 'GET', url: '/v1/wake/runs' });
        assert.equal(response.statusCode, 401);
    } finally {
        await app.close();
    }
});
