import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerObservabilityRoutes } from './observability.js';

const session = {
    userId: 'user_internal_1',
    tenantId: 'tenant_internal_1',
    workspaceIds: ['ws_1'],
    scope: 'internal' as const,
    expiresAt: Date.now() + 60_000,
};

test('GET observability replay proxies runtime session actions', async () => {
    let requestedUrl = '';

    const app = Fastify({ logger: false });
    await registerObservabilityRoutes(app, {
        getSession: () => session,
        findRuntimeEndpoint: async () => 'http://runtime.bot.local',
        fetchImpl: (async (url: string | URL | Request) => {
            requestedUrl = String(url);
            return new Response(JSON.stringify({
                session_id: 'session-1',
                count: 1,
                actions: [{ id: 'action-1', action_type: 'workspace_browser_open' }],
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        }) as typeof fetch,
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/observability/workspaces/ws_1/sessions/session-1/actions?bot_id=bot_1',
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as {
            workspace_id: string;
            bot_id: string;
            count: number;
            actions: Array<{ id: string }>;
        };
        assert.equal(body.workspace_id, 'ws_1');
        assert.equal(body.bot_id, 'bot_1');
        assert.equal(body.count, 1);
        assert.equal(body.actions[0]?.id, 'action-1');
        assert.match(requestedUrl, /\/runtime\/observability\/sessions\/session-1\/actions$/);
    } finally {
        await app.close();
    }
});

test('POST correctness proxies payload to runtime endpoint', async () => {
    let forwarded: Record<string, unknown> | null = null;

    const app = Fastify({ logger: false });
    await registerObservabilityRoutes(app, {
        getSession: () => session,
        findRuntimeEndpoint: async () => 'http://runtime.bot.local',
        fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
            forwarded = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
            return new Response(JSON.stringify({
                quality_signal: {
                    id: 'signal-1',
                    score: 0.75,
                },
                source: 'runtime_outcome',
            }), {
                status: 201,
                headers: { 'content-type': 'application/json' },
            });
        }) as typeof fetch,
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/observability/workspaces/ws_1/quality/correctness',
            payload: {
                bot_id: 'bot_1',
                provider: 'runtime-evaluator',
                action_type: 'workspace_browser_open',
                verified_actions: 3,
                total_actions: 4,
                source: 'runtime_outcome',
                task_id: 'task-1',
            },
        });

        assert.equal(response.statusCode, 201);
        const body = response.json() as { quality_signal: { score: number } };
        assert.equal(body.quality_signal.score, 0.75);
        assert.equal(forwarded?.['provider'], 'runtime-evaluator');
        assert.equal(forwarded?.['bot_id'], undefined);
        assert.equal(forwarded?.['verified_actions'], 3);
        assert.equal(forwarded?.['total_actions'], 4);
        assert.equal(forwarded?.['task_id'], 'task-1');
    } finally {
        await app.close();
    }
});

test('GET observability replay rejects workspace scope violations', async () => {
    const app = Fastify({ logger: false });
    await registerObservabilityRoutes(app, {
        getSession: () => ({ ...session, scope: 'customer' as const, workspaceIds: ['ws_other'] }),
        findRuntimeEndpoint: async () => 'http://runtime.bot.local',
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/observability/workspaces/ws_1/sessions/session-1/actions?bot_id=bot_1',
        });

        assert.equal(response.statusCode, 403);
        const body = response.json() as { error: string };
        assert.equal(body.error, 'workspace_scope_violation');
    } finally {
        await app.close();
    }
});
