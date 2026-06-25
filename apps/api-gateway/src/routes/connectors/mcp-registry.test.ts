import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registerMcpRegistryRoutes } from './mcp-registry.js';
import { MANAGED_MCP_CATALOG } from '../../lib/managed-mcp-catalog.js';

// Helper: temporarily mark a catalog connector live (proxy provisioned) for enable-mechanics tests.
const withLiveConnector = async <T>(id: string, fn: () => Promise<T>): Promise<T> => {
    const c = MANAGED_MCP_CATALOG.find((x) => x.id === id)!;
    const prev = c.live;
    c.live = true;
    try { return await fn(); } finally { c.live = prev; }
};

// ---------------------------------------------------------------------------
// In-memory repo stub
// ---------------------------------------------------------------------------

const makeRepo = () => {
    const servers = new Map<string, {
        id: string; tenantId: string; workspaceId: string | null; name: string;
        url: string; headers: Record<string, string> | null; isActive: boolean;
        createdAt: Date; updatedAt: Date;
    }>();
    let seq = 0;

    return {
        async upsert(input: { tenantId: string; name: string; url: string; workspaceId?: string | null; headers?: Record<string, string> | null }) {
            const existing = Array.from(servers.values()).find(
                s => s.tenantId === input.tenantId && s.name === input.name,
            );
            const id = existing?.id ?? `mcp_${++seq}`;
            const record = {
                id,
                tenantId: input.tenantId,
                name: input.name,
                url: input.url,
                workspaceId: input.workspaceId ?? null,
                headers: input.headers ?? null,
                isActive: true,
                createdAt: existing?.createdAt ?? new Date(),
                updatedAt: new Date(),
            };
            servers.set(id, record);
            return record;
        },
        async findActive(tenantId: string) {
            return Array.from(servers.values()).filter(s => s.tenantId === tenantId && s.isActive);
        },
        async findById(id: string) {
            return servers.get(id) ?? null;
        },
        async deactivate(id: string) {
            const s = servers.get(id);
            if (s) s.isActive = false;
        },
        _servers: servers,
    };
};

const session = (tenantId = 'tenant_1') => ({
    userId: 'user_1', tenantId, workspaceIds: ['ws_1'], expiresAt: Date.now() + 60_000,
});

const buildApp = (tenantId = 'tenant_1') => {
    const repo = makeRepo();
    const app = Fastify();
    registerMcpRegistryRoutes(app, {
        getSession: () => session(tenantId),
        repo,
        fetcher: async () => new Response(null, { status: 200 }),
    });
    return { app, repo };
};

// ---------------------------------------------------------------------------
// Inter-service auth — runtime calls with shared token + x-tenant-id
// ---------------------------------------------------------------------------

describe('inter-service auth (runtime → gateway)', () => {
    const SERVICE_TOKEN = 'svc-token-abc123';

    const buildServiceApp = () => {
        const repo = makeRepo();
        const app = Fastify();
        process.env.AGENTFARM_MCP_REGISTRY_SHARED_TOKEN = SERVICE_TOKEN;
        registerMcpRegistryRoutes(app, {
            getSession: () => null, // no browser session — service path only
            repo,
            fetcher: async () => new Response(null, { status: 200 }),
        });
        return { app, repo };
    };

    it('GET /v1/mcp succeeds with valid service token + x-tenant-id', async () => {
        const { app, repo } = buildServiceApp();
        await repo.upsert({ tenantId: 'tenant_svc', name: 'github', url: 'http://mcp-github:3100' });
        const res = await app.inject({
            method: 'GET', url: '/v1/mcp',
            headers: { authorization: `Bearer ${SERVICE_TOKEN}`, 'x-tenant-id': 'tenant_svc' },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as Array<{ name: string }>;
        assert.equal(body.length, 1);
        assert.equal(body[0]!.name, 'github');
    });

    it('POST /v1/mcp auto-registers with valid service token + x-tenant-id', async () => {
        const { app } = buildServiceApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/mcp',
            headers: { authorization: `Bearer ${SERVICE_TOKEN}`, 'x-tenant-id': 'tenant_svc' },
            payload: { name: 'github', url: 'http://mcp-github:3100' },
        });
        assert.equal(res.statusCode, 201);
        assert.equal(res.json().name, 'github');
    });

    it('rejects an invalid service token (401)', async () => {
        const { app } = buildServiceApp();
        const res = await app.inject({
            method: 'GET', url: '/v1/mcp',
            headers: { authorization: 'Bearer wrong-token', 'x-tenant-id': 'tenant_svc' },
        });
        assert.equal(res.statusCode, 401);
    });

    it('rejects a valid token without x-tenant-id (401)', async () => {
        const { app } = buildServiceApp();
        const res = await app.inject({
            method: 'GET', url: '/v1/mcp',
            headers: { authorization: `Bearer ${SERVICE_TOKEN}` },
        });
        assert.equal(res.statusCode, 401);
    });

    it('scopes the auto-registered server to the x-tenant-id tenant', async () => {
        const { app, repo } = buildServiceApp();
        await app.inject({
            method: 'POST', url: '/v1/mcp',
            headers: { authorization: `Bearer ${SERVICE_TOKEN}`, 'x-tenant-id': 'tenant_xyz' },
            payload: { name: 'slack', url: 'http://mcp-slack:3100' },
        });
        const forXyz = await repo.findActive('tenant_xyz');
        const forOther = await repo.findActive('tenant_other');
        assert.equal(forXyz.length, 1);
        assert.equal(forOther.length, 0);
    });
});

// ---------------------------------------------------------------------------
// POST /v1/mcp — register
// ---------------------------------------------------------------------------

describe('POST /v1/mcp', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerMcpRegistryRoutes(app, { getSession: () => null, repo: makeRepo() });
        const res = await app.inject({
            method: 'POST', url: '/v1/mcp',
            payload: { name: 'my-server', url: 'https://mcp.example.com' },
        });
        assert.equal(res.statusCode, 401);
    });

    it('returns 400 when name is missing', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/mcp',
            payload: { url: 'https://example.com' },
        });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json().error, 'invalid_request');
    });

    it('returns 400 when url is missing', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/mcp',
            payload: { name: 'my-server' },
        });
        assert.equal(res.statusCode, 400);
    });

    it('returns 400 for non-http/https url', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/mcp',
            payload: { name: 'srv', url: 'ftp://example.com' },
        });
        assert.equal(res.statusCode, 400);
    });

    it('returns 400 for invalid url', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/mcp',
            payload: { name: 'srv', url: 'not-a-url' },
        });
        assert.equal(res.statusCode, 400);
    });

    it('creates a server and returns 201 with id', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/mcp',
            payload: { name: 'my-server', url: 'https://mcp.example.com' },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json();
        assert.ok(body.id);
        assert.equal(body.name, 'my-server');
        assert.equal(body.url, 'https://mcp.example.com');
        assert.equal(body.isActive, true);
    });

    it('re-registers (upserts) existing server with same name', async () => {
        const { app, repo } = buildApp();
        await app.inject({ method: 'POST', url: '/v1/mcp', payload: { name: 'srv', url: 'https://a.com' } });
        await app.inject({ method: 'POST', url: '/v1/mcp', payload: { name: 'srv', url: 'https://b.com' } });
        const active = await repo.findActive('tenant_1');
        assert.equal(active.length, 1, 'upsert should keep one entry');
        assert.equal(active[0]!.url, 'https://b.com');
    });
});

// ---------------------------------------------------------------------------
// GET /v1/mcp — list
// ---------------------------------------------------------------------------

describe('GET /v1/mcp', () => {
    it('returns 401 for unauthenticated request', async () => {
        const app = Fastify();
        registerMcpRegistryRoutes(app, { getSession: () => null, repo: makeRepo() });
        const res = await app.inject({ method: 'GET', url: '/v1/mcp' });
        assert.equal(res.statusCode, 401);
    });

    it('returns empty array when no servers registered', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/mcp' });
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json(), []);
    });

    it('returns only active servers for this tenant', async () => {
        const { app } = buildApp('t1');
        await app.inject({ method: 'POST', url: '/v1/mcp', payload: { name: 'srv1', url: 'https://a.com' } });
        await app.inject({ method: 'POST', url: '/v1/mcp', payload: { name: 'srv2', url: 'https://b.com' } });
        const res = await app.inject({ method: 'GET', url: '/v1/mcp' });
        assert.equal(res.statusCode, 200);
        const list = res.json() as { name: string }[];
        assert.equal(list.length, 2);
    });
});

// ---------------------------------------------------------------------------
// DELETE /v1/mcp/:id
// ---------------------------------------------------------------------------

describe('DELETE /v1/mcp/:id', () => {
    it('returns 404 for unknown server', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'DELETE', url: '/v1/mcp/nonexistent' });
        assert.equal(res.statusCode, 404);
    });

    it('returns 403 when server belongs to different tenant', async () => {
        const repo = makeRepo();
        await repo.upsert({ tenantId: 'other_tenant', name: 'srv', url: 'https://x.com' });
        const [server] = await repo.findActive('other_tenant');
        const app = Fastify();
        registerMcpRegistryRoutes(app, { getSession: () => session('tenant_1'), repo });
        const res = await app.inject({ method: 'DELETE', url: `/v1/mcp/${server!.id}` });
        assert.equal(res.statusCode, 403);
    });

    it('deactivates the server and returns 200', async () => {
        const { app, repo } = buildApp();
        await app.inject({ method: 'POST', url: '/v1/mcp', payload: { name: 'srv', url: 'https://x.com' } });
        const [server] = await repo.findActive('tenant_1');
        const res = await app.inject({ method: 'DELETE', url: `/v1/mcp/${server!.id}` });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().ok, true);
        const remaining = await repo.findActive('tenant_1');
        assert.equal(remaining.length, 0);
    });
});

// ---------------------------------------------------------------------------
// GET /v1/mcp/:id/ping
// ---------------------------------------------------------------------------

describe('GET /v1/mcp/:id/ping', () => {
    it('returns 404 for unknown server', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/mcp/nonexistent/ping' });
        assert.equal(res.statusCode, 404);
    });

    it('returns latency for reachable server', async () => {
        const { app, repo } = buildApp();
        await app.inject({ method: 'POST', url: '/v1/mcp', payload: { name: 'srv', url: 'https://x.com' } });
        const [server] = await repo.findActive('tenant_1');
        const res = await app.inject({ method: 'GET', url: `/v1/mcp/${server!.id}/ping` });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.equal(body.ok, true);
        assert.ok(typeof body.latencyMs === 'number');
    });

    it('returns ok:false when fetcher throws', async () => {
        const repo = makeRepo();
        const app = Fastify();
        registerMcpRegistryRoutes(app, {
            getSession: () => session(),
            repo,
            fetcher: async () => { throw new Error('unreachable'); },
        });
        await app.inject({ method: 'POST', url: '/v1/mcp', payload: { name: 'srv', url: 'https://x.com' } });
        const [server] = await repo.findActive('tenant_1');
        const res = await app.inject({ method: 'GET', url: `/v1/mcp/${server!.id}/ping` });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().ok, false);
    });
});

// ---------------------------------------------------------------------------
// GET /v1/mcp/catalog
// ---------------------------------------------------------------------------

describe('GET /v1/mcp/catalog', () => {
    it('returns 401 for unauthenticated request', async () => {
        const app = Fastify();
        registerMcpRegistryRoutes(app, { getSession: () => null, repo: makeRepo() });
        const res = await app.inject({ method: 'GET', url: '/v1/mcp/catalog' });
        assert.equal(res.statusCode, 401);
    });

    it('returns catalog with at least one entry', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/mcp/catalog' });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.ok(Array.isArray(body.catalog));
        assert.ok(body.catalog.length > 0);
        const first = body.catalog[0];
        assert.ok(first.id);
        assert.ok(first.displayName);
        assert.ok(Array.isArray(first.requiredFields));
    });
});

// ---------------------------------------------------------------------------
// POST /v1/mcp/catalog/:connectorId/enable
// ---------------------------------------------------------------------------

describe('POST /v1/mcp/catalog/:connectorId/enable', () => {
    it('returns 404 for unknown connector', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/mcp/catalog/nonexistent-connector/enable',
            payload: {},
        });
        assert.equal(res.statusCode, 404);
    });

    it('returns 409 coming_soon when the connector proxy is not yet live', async () => {
        const { app } = buildApp();
        // github is not marked live by default (no proxy provisioned yet).
        const res = await app.inject({
            method: 'POST', url: '/v1/mcp/catalog/github/enable',
            payload: { token: 'ghp_fake_token_12345' },
        });
        assert.equal(res.statusCode, 409);
        assert.equal(res.json().error, 'connector_coming_soon');
    });

    it('returns 400 when required fields are missing for a live connector', async () => {
        await withLiveConnector('github', async () => {
            const { app } = buildApp();
            const res = await app.inject({
                method: 'POST', url: '/v1/mcp/catalog/github/enable',
                payload: {},
            });
            assert.equal(res.statusCode, 400);
            assert.equal(res.json().error, 'missing_fields');
            assert.ok(Array.isArray(res.json().missingFields));
        });
    });

    it('enables a live managed connector when required fields are provided', async () => {
        await withLiveConnector('github', async () => {
            const { app } = buildApp();
            const res = await app.inject({
                method: 'POST', url: '/v1/mcp/catalog/github/enable',
                payload: { token: 'ghp_fake_token_12345' },
            });
            assert.equal(res.statusCode, 201);
            const body = res.json();
            assert.equal(body.connectorId, 'github');
            assert.equal(body.isActive, true);
        });
    });
});
