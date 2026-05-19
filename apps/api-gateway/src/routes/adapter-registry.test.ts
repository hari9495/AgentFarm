/**
 * Epic B1A: Adapter Registry Routes — tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerAdapterRegistryRoutes, AdapterRegistryStore } from './adapter-registry.js';

const buildSession = () => ({
    userId: 'user-1',
    tenantId: 'tenant-1',
    workspaceIds: ['ws-1'],
    expiresAt: Date.now() + 60_000,
});

const buildApp = (store?: AdapterRegistryStore) => {
    const app = Fastify({ logger: false });
    registerAdapterRegistryRoutes(app, {
        getSession: () => buildSession(),
        store,
    });
    return app;
};

const noSessionApp = () => {
    const app = Fastify({ logger: false });
    registerAdapterRegistryRoutes(app, {
        getSession: () => null,
    });
    return app;
};

// ── Registration ─────────────────────────────────────────────────────────────

test('B1A: POST /v1/adapters registers adapter and returns record', async () => {
    const store = new AdapterRegistryStore();
    const app = buildApp(store);

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/adapters',
            payload: {
                adapter_key: 'jira_connector',
                adapter_type: 'connector',
                display_name: 'Jira Connector',
                version: '1.0.0',
                capabilities: [{ name: 'read_task', version: '1.0.0', supported: true }],
                workspace_id: 'ws-1',
                correlation_id: 'corr-1',
            },
        });

        assert.equal(response.statusCode, 201);
        const body = response.json() as { id: string; adapterKey: string; status: string };
        assert.equal(body.adapterKey, 'jira_connector');
        assert.equal(body.status, 'registered');
        assert.ok(body.id);

        // Audit log should have an entry
        assert.equal(store.auditLog.length, 1);
        assert.equal(store.auditLog[0]!.action, 'register');
        assert.equal(store.auditLog[0]!.actorId, 'user-1');
    } finally {
        await app.close();
    }
});

test('B1A: POST /v1/adapters returns 409 for duplicate adapter key', async () => {
    const store = new AdapterRegistryStore();
    const app = buildApp(store);

    try {
        const payload = {
            adapter_key: 'github_connector',
            adapter_type: 'connector',
            display_name: 'GitHub Connector',
            version: '1.0.0',
        };

        await app.inject({ method: 'POST', url: '/v1/adapters', payload });
        const response = await app.inject({ method: 'POST', url: '/v1/adapters', payload });

        assert.equal(response.statusCode, 409);
        const body = response.json() as { error: string };
        assert.equal(body.error, 'conflict');
    } finally {
        await app.close();
    }
});

test('B1A: POST /v1/adapters returns 400 for invalid adapter_type', async () => {
    const app = buildApp();

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/adapters',
            payload: {
                adapter_key: 'bad_adapter',
                adapter_type: 'unknown_type',
                display_name: 'Bad',
                version: '1.0.0',
            },
        });

        assert.equal(response.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('B1A: POST /v1/adapters returns 401 when no session', async () => {
    const app = noSessionApp();

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/adapters',
            payload: { adapter_key: 'x', adapter_type: 'connector', display_name: 'X', version: '1.0.0' },
        });

        assert.equal(response.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('B1A: POST /v1/adapters returns 403 when workspace_id not in session', async () => {
    const app = buildApp();

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/adapters',
            payload: {
                adapter_key: 'scoped_adapter',
                adapter_type: 'connector',
                display_name: 'Scoped',
                version: '1.0.0',
                workspace_id: 'ws-other',
            },
        });

        assert.equal(response.statusCode, 403);
    } finally {
        await app.close();
    }
});

// ── List ──────────────────────────────────────────────────────────────────────

test('B1A: GET /v1/adapters returns tenant-scoped adapter list', async () => {
    const store = new AdapterRegistryStore();
    const app = buildApp(store);

    try {
        // Register two adapters for this tenant
        await app.inject({
            method: 'POST', url: '/v1/adapters',
            payload: { adapter_key: 'adapter-a', adapter_type: 'connector', display_name: 'A', version: '1.0.0' },
        });
        await app.inject({
            method: 'POST', url: '/v1/adapters',
            payload: { adapter_key: 'adapter-b', adapter_type: 'runtime', display_name: 'B', version: '1.0.0' },
        });

        const response = await app.inject({ method: 'GET', url: '/v1/adapters' });
        assert.equal(response.statusCode, 200);
        const body = response.json() as { adapters: unknown[]; total: number };
        assert.equal(body.total, 2);
        assert.equal(body.adapters.length, 2);
    } finally {
        await app.close();
    }
});

test('B1A: GET /v1/adapters filters by adapter_type', async () => {
    const store = new AdapterRegistryStore();
    const app = buildApp(store);

    try {
        await app.inject({ method: 'POST', url: '/v1/adapters', payload: { adapter_key: 'conn-1', adapter_type: 'connector', display_name: 'Connector 1', version: '1.0.0' } });
        await app.inject({ method: 'POST', url: '/v1/adapters', payload: { adapter_key: 'run-1', adapter_type: 'runtime', display_name: 'Runtime 1', version: '1.0.0' } });

        const response = await app.inject({ method: 'GET', url: '/v1/adapters?adapter_type=connector' });
        assert.equal(response.statusCode, 200);
        const body = response.json() as { adapters: Array<{ adapterType: string }>; total: number };
        assert.equal(body.total, 1);
        assert.equal(body.adapters[0]!.adapterType, 'connector');
    } finally {
        await app.close();
    }
});

// ── Discover ──────────────────────────────────────────────────────────────────

test('B1A: GET /v1/adapters/discover returns capability summary by adapter_key', async () => {
    const store = new AdapterRegistryStore();
    const app = buildApp(store);

    try {
        await app.inject({
            method: 'POST', url: '/v1/adapters',
            payload: {
                adapter_key: 'slack_connector',
                adapter_type: 'connector',
                display_name: 'Slack Connector',
                version: '1.2.0',
                capabilities: [{ name: 'send_message', version: '1.0.0', supported: true }],
            },
        });

        const response = await app.inject({ method: 'GET', url: '/v1/adapters/discover?adapter_key=slack_connector' });
        assert.equal(response.statusCode, 200);
        const body = response.json() as { adapter_key: string; status: string; capabilities: unknown[] };
        assert.equal(body.adapter_key, 'slack_connector');
        assert.equal(body.status, 'registered');
        assert.equal(body.capabilities.length, 1);
    } finally {
        await app.close();
    }
});

test('B1A: GET /v1/adapters/discover returns 404 for unknown adapter_key', async () => {
    const app = buildApp(new AdapterRegistryStore());

    try {
        const response = await app.inject({ method: 'GET', url: '/v1/adapters/discover?adapter_key=nonexistent' });
        assert.equal(response.statusCode, 404);
    } finally {
        await app.close();
    }
});

// ── Health check ──────────────────────────────────────────────────────────────

test('B1A: POST /v1/adapters/:id/health-check updates status and audit log', async () => {
    const store = new AdapterRegistryStore();
    const app = buildApp(store);

    try {
        const regResponse = await app.inject({
            method: 'POST', url: '/v1/adapters',
            payload: { adapter_key: 'hc-test', adapter_type: 'connector', display_name: 'HC Test', version: '1.0.0' },
        });
        const registered = regResponse.json() as { id: string };

        const response = await app.inject({ method: 'POST', url: `/v1/adapters/${registered.id}/health-check` });
        assert.equal(response.statusCode, 200);
        const body = response.json() as { status: string; last_healthcheck_result: string };
        assert.equal(body.status, 'healthy');
        assert.equal(body.last_healthcheck_result, 'OK');

        // Audit log should have register + health_check entries
        assert.equal(store.auditLog.length, 2);
        assert.equal(store.auditLog[1]!.action, 'health_check');
    } finally {
        await app.close();
    }
});

// ── Deregister ────────────────────────────────────────────────────────────────

test('B1A: DELETE /v1/adapters/:id deregisters adapter and logs audit entry', async () => {
    const store = new AdapterRegistryStore();
    const app = buildApp(store);

    try {
        const regResponse = await app.inject({
            method: 'POST', url: '/v1/adapters',
            payload: { adapter_key: 'del-test', adapter_type: 'connector', display_name: 'Del Test', version: '1.0.0' },
        });
        const registered = regResponse.json() as { id: string };

        const deleteResponse = await app.inject({ method: 'DELETE', url: `/v1/adapters/${registered.id}` });
        assert.equal(deleteResponse.statusCode, 204);

        // Adapter should no longer appear in list
        const listResponse = await app.inject({ method: 'GET', url: '/v1/adapters' });
        const list = listResponse.json() as { total: number };
        assert.equal(list.total, 0);

        // Audit log
        assert.equal(store.auditLog.length, 2);
        assert.equal(store.auditLog[1]!.action, 'unregister');
    } finally {
        await app.close();
    }
});
