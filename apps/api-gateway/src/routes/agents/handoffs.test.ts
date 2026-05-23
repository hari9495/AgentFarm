import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerHandoffRoutes } from './handoffs.js';

const buildSession = () => ({
    userId: 'user_1',
    tenantId: 'tenant_1',
    workspaceIds: ['ws_1'],
    expiresAt: Date.now() + 60_000,
});

test('GET /v1/handoffs/pending/:role requests pending status from orchestrator', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';

    globalThis.fetch = (async (url: string | URL | Request, _init?: RequestInit) => {
        requestedUrl = String(url);
        return new Response(JSON.stringify({
            count: 2,
            handoffs: [
                { id: 'h_1', toBotId: 'qa_tester' },
                { id: 'h_2', toBotId: 'dev_agent' },
            ],
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;

    const app = Fastify({ logger: false });
    await registerHandoffRoutes(app, {
        getSession: () => buildSession(),
        orchestratorBaseUrl: 'http://orchestrator.test',
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/handoffs/pending/qa_tester?workspace_id=ws_1',
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as {
            count: number;
            handoffs: Array<{ id: string }>;
        };
        assert.equal(body.count, 1);
        assert.equal(body.handoffs.length, 1);

        const upstream = new URL(requestedUrl);
        assert.equal(upstream.searchParams.get('status'), 'pending');
        assert.equal(upstream.searchParams.get('tenant_id'), 'tenant_1');
        assert.equal(upstream.searchParams.get('workspace_id'), 'ws_1');
    } finally {
        globalThis.fetch = originalFetch;
        await app.close();
    }
});

test('POST /v1/handoffs/:handoffId/complete forwards status and completion payload', async () => {
    const originalFetch = globalThis.fetch;
    let forwardedBody: Record<string, unknown> | null = null;

    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        forwardedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        return new Response(JSON.stringify({ handoff: { id: 'h_1', status: 'failed' } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;

    const app = Fastify({ logger: false });
    await registerHandoffRoutes(app, {
        getSession: () => buildSession(),
        orchestratorBaseUrl: 'http://orchestrator.test',
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/handoffs/h_1/complete',
            payload: {
                workspace_id: 'ws_1',
                status: 'failed',
                reason: 'validation failed',
                result: { failed_check_count: 3 },
                completion_context: { source: 'qa_runner' },
            },
        });

        assert.equal(response.statusCode, 200);
        assert.equal(forwardedBody?.['status'], 'failed');
        assert.equal(forwardedBody?.['reason'], 'validation failed');
        assert.deepEqual(forwardedBody?.['result'], { failed_check_count: 3 });
        assert.deepEqual(forwardedBody?.['completion_context'], { source: 'qa_runner' });
    } finally {
        globalThis.fetch = originalFetch;
        await app.close();
    }
});
