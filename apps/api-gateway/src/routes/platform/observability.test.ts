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

// ─── Langfuse trace proxy (Build #7) ──────────────────────────────────────────

const customerSession = {
    userId: 'user_cust_1',
    tenantId: 'tenant-acme',
    workspaceIds: ['ws_1'],
    scope: 'customer' as const,
    expiresAt: Date.now() + 60_000,
};

const langfuse = { host: 'http://langfuse.local', publicKey: 'pk-test', secretKey: 'sk-test' };

test('GET llm-traces requires an authenticated session', async () => {
    const app = Fastify({ logger: false });
    await registerObservabilityRoutes(app, { getSession: () => null, langfuse });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/observability/llm-traces' });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('GET llm-traces returns 503 when Langfuse unconfigured', async () => {
    const app = Fastify({ logger: false });
    await registerObservabilityRoutes(app, { getSession: () => customerSession }); // no langfuse, no env
    const prevHost = process.env['LANGFUSE_HOST'];
    const prevPk = process.env['LANGFUSE_PUBLIC_KEY'];
    delete process.env['LANGFUSE_HOST'];
    delete process.env['LANGFUSE_PUBLIC_KEY'];
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/observability/llm-traces' });
        assert.equal(res.statusCode, 503);
    } finally {
        if (prevHost !== undefined) process.env['LANGFUSE_HOST'] = prevHost;
        if (prevPk !== undefined) process.env['LANGFUSE_PUBLIC_KEY'] = prevPk;
        await app.close();
    }
});

test('GET llm-traces forces userId=tenantId for customer sessions (ignores client tenantId)', async () => {
    let requestedUrl = '';
    const app = Fastify({ logger: false });
    await registerObservabilityRoutes(app, {
        getSession: () => customerSession,
        langfuse,
        fetchImpl: (async (url: string | URL | Request) => {
            requestedUrl = String(url);
            return new Response(JSON.stringify({ data: [{ id: 'task-1', userId: 'tenant-acme' }], meta: { totalItems: 1 } }), {
                status: 200, headers: { 'content-type': 'application/json' },
            });
        }) as typeof fetch,
    });
    try {
        // Customer tries to snoop another tenant via query param — must be ignored.
        const res = await app.inject({ method: 'GET', url: '/v1/observability/llm-traces?tenantId=tenant-evil' });
        assert.equal(res.statusCode, 200);
        const u = new URL(requestedUrl);
        assert.equal(u.searchParams.get('userId'), 'tenant-acme', 'userId is forced to session tenant');
        const body = res.json() as { scope: string; traces: unknown[] };
        assert.equal(body.scope, 'tenant-acme');
        assert.equal(body.traces.length, 1);
    } finally {
        await app.close();
    }
});

test('GET llm-traces allows internal operator to scope to a chosen tenant', async () => {
    let requestedUrl = '';
    const app = Fastify({ logger: false });
    await registerObservabilityRoutes(app, {
        getSession: () => session, // internal scope
        langfuse,
        fetchImpl: (async (url: string | URL | Request) => {
            requestedUrl = String(url);
            return new Response(JSON.stringify({ data: [], meta: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
        }) as typeof fetch,
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/observability/llm-traces?tenantId=tenant-xyz' });
        assert.equal(res.statusCode, 200);
        assert.equal(new URL(requestedUrl).searchParams.get('userId'), 'tenant-xyz');
    } finally {
        await app.close();
    }
});

test('GET llm-traces/:taskId hides another tenant trace from a customer (404)', async () => {
    const app = Fastify({ logger: false });
    await registerObservabilityRoutes(app, {
        getSession: () => customerSession, // tenant-acme
        langfuse,
        fetchImpl: (async () => new Response(JSON.stringify({ id: 'task-9', userId: 'tenant-other', observations: [] }), {
            status: 200, headers: { 'content-type': 'application/json' },
        })) as typeof fetch,
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/observability/llm-traces/task-9' });
        assert.equal(res.statusCode, 404, 'cross-tenant trace must be hidden');
    } finally {
        await app.close();
    }
});

test('GET llm-traces/:taskId returns the trace when it belongs to the customer', async () => {
    const app = Fastify({ logger: false });
    await registerObservabilityRoutes(app, {
        getSession: () => customerSession, // tenant-acme
        langfuse,
        fetchImpl: (async () => new Response(JSON.stringify({ id: 'task-9', userId: 'tenant-acme', observations: [{ model: 'gpt-4o' }] }), {
            status: 200, headers: { 'content-type': 'application/json' },
        })) as typeof fetch,
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/observability/llm-traces/task-9' });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { id: string; userId: string };
        assert.equal(body.id, 'task-9');
        assert.equal(body.userId, 'tenant-acme');
    } finally {
        await app.close();
    }
});

test('GET llm-traces/:taskId redacts input/output for customers but keeps metadata', async () => {
    const app = Fastify({ logger: false });
    await registerObservabilityRoutes(app, {
        getSession: () => customerSession, // tenant-acme, customer scope
        langfuse,
        fetchImpl: (async () => new Response(JSON.stringify({
            id: 'task-9', userId: 'tenant-acme', input: 'SYSTEM PROMPT SECRET', output: 'raw',
            observations: [{ id: 'o1', model: 'gpt-4o', usage: { input: 100, output: 20, total: 120 },
                input: 'RAG CONTEXT SECRET', output: 'decision text', metadata: { provider: 'openai', estimatedCostUsd: 0.004 } }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch,
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/observability/llm-traces/task-9' });
        assert.equal(res.statusCode, 200);
        const body = res.json() as Record<string, any>;
        assert.equal(body.redacted, true);
        assert.equal(body.input, undefined, 'trace input stripped');
        assert.equal(body.output, undefined, 'trace output stripped');
        const obs = body.observations[0];
        assert.equal(obs.input, undefined, 'observation input stripped');
        assert.equal(obs.output, undefined, 'observation output stripped');
        // metadata preserved
        assert.equal(obs.model, 'gpt-4o');
        assert.equal(obs.usage.total, 120);
        assert.equal(obs.metadata.estimatedCostUsd, 0.004);
    } finally {
        await app.close();
    }
});

test('GET llm-traces/:taskId returns full input/output for internal operators', async () => {
    const app = Fastify({ logger: false });
    await registerObservabilityRoutes(app, {
        getSession: () => session, // internal scope
        langfuse,
        fetchImpl: (async () => new Response(JSON.stringify({
            id: 'task-9', userId: 'tenant-acme', input: 'full prompt',
            observations: [{ id: 'o1', model: 'gpt-4o', input: 'ctx', output: 'out' }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch,
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/observability/llm-traces/task-9' });
        assert.equal(res.statusCode, 200);
        const body = res.json() as Record<string, any>;
        assert.equal(body.input, 'full prompt', 'operator sees full input');
        assert.equal(body.observations[0].output, 'out');
        assert.notEqual(body.redacted, true);
    } finally {
        await app.close();
    }
});

test('GET llm-traces accepts a portal session (customer scope, redacted)', async () => {
    let requestedUrl = '';
    const app = Fastify({ logger: false });
    await registerObservabilityRoutes(app, {
        getSession: () => null, // no API session
        getPortalSession: async () => ({ userId: 'acct-1', tenantId: 'tenant-portal', workspaceIds: [], expiresAt: Date.now() + 60_000 }),
        langfuse,
        fetchImpl: (async (url: string | URL | Request) => {
            requestedUrl = String(url);
            return new Response(JSON.stringify({ data: [{ id: 'task-1', userId: 'tenant-portal' }], meta: {} }), {
                status: 200, headers: { 'content-type': 'application/json' },
            });
        }) as typeof fetch,
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/observability/llm-traces', headers: { cookie: 'portal_session=xyz' } });
        assert.equal(res.statusCode, 200);
        assert.equal(new URL(requestedUrl).searchParams.get('userId'), 'tenant-portal', 'portal user is tenant-locked');
    } finally {
        await app.close();
    }
});

test('GET llm-traces/:taskId redacts for portal sessions too', async () => {
    const app = Fastify({ logger: false });
    await registerObservabilityRoutes(app, {
        getSession: () => null,
        getPortalSession: async () => ({ userId: 'acct-1', tenantId: 'tenant-portal', workspaceIds: [], expiresAt: Date.now() + 60_000 }),
        langfuse,
        fetchImpl: (async () => new Response(JSON.stringify({
            id: 'task-1', userId: 'tenant-portal', input: 'SECRET',
            observations: [{ id: 'o1', model: 'gpt-4o', input: 'ctx', output: 'out', metadata: { estimatedCostUsd: 0.01 } }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch,
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/observability/llm-traces/task-1', headers: { cookie: 'portal_session=xyz' } });
        assert.equal(res.statusCode, 200);
        const body = res.json() as Record<string, any>;
        assert.equal(body.redacted, true);
        assert.equal(body.input, undefined);
        assert.equal(body.observations[0].input, undefined);
        assert.equal(body.observations[0].metadata.estimatedCostUsd, 0.01);
    } finally {
        await app.close();
    }
});
