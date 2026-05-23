import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {
    computePluginManifestSignature,
    type ExternalPluginManifestContract,
} from '@agentfarm/connector-contracts';
import { registerPluginLoadingRoutes } from './plugin-loading.js';

const session = () => ({
    userId: 'user-1',
    tenantId: 'tenant-1',
    workspaceIds: ['ws-1'],
    expiresAt: Date.now() + 60_000,
});

const buildManifest = (): ExternalPluginManifestContract => {
    const unsigned: ExternalPluginManifestContract = {
        plugin_key: 'jira_external',
        plugin_name: 'Jira External',
        version: '1.0.0',
        provider: 'agentfarm',
        capabilities: ['ticket.create', 'ticket.read'],
        supported_adapter_types: ['task_tracker'],
        artifact_url: 'https://plugins.agentfarm.dev/jira-external-1.0.0.tgz',
        signature: '',
        signature_algorithm: 'sha256',
        provenance: {
            publisher: 'agentfarm-plugins',
            source_repo: 'https://github.com/agentfarm/plugins',
        },
    };

    return {
        ...unsigned,
        signature: computePluginManifestSignature(unsigned),
    };
};

test('C2: plugin load route enforces allowlist and trusted publisher', async () => {
    const mockPrisma = {
        externalPluginLoad: {
            create: async () => ({}),
            findMany: async () => [],
        },
        pluginKillSwitch: {
            upsert: async () => ({}),
            findUnique: async () => null,
        },
    };

    const app = Fastify();
    await registerPluginLoadingRoutes(app, {
        getSession: () => session(),
        featureEnabled: true,
        trustedPublishers: [{ publisher: 'agentfarm-plugins', sourceRepoPrefix: 'https://github.com/agentfarm/' }],
        getPrisma: async () => mockPrisma as Parameters<typeof registerPluginLoadingRoutes>[1]['getPrisma'] extends (() => Promise<infer T>) | undefined ? T : never,
    });

    try {
        const missingAllowlist = await app.inject({
            method: 'POST',
            url: '/v1/plugins/load',
            payload: {
                workspace_id: 'ws-1',
                manifest: buildManifest(),
                correlation_id: 'corr-1',
            },
        });

        assert.equal(missingAllowlist.statusCode, 403);
        assert.equal((missingAllowlist.json() as { rejectionReason: string }).rejectionReason, 'missing_allowlist');

        const allowlist = await app.inject({
            method: 'POST',
            url: '/v1/plugins/allowlist/upsert',
            payload: {
                workspace_id: 'ws-1',
                plugin_key: 'jira_external',
                allowed_capabilities: ['ticket.read'],
            },
        });
        assert.equal(allowlist.statusCode, 201);

        const disallowedCapability = await app.inject({
            method: 'POST',
            url: '/v1/plugins/load',
            payload: {
                workspace_id: 'ws-1',
                manifest: buildManifest(),
                correlation_id: 'corr-2',
            },
        });
        assert.equal(disallowedCapability.statusCode, 403);

        const allowlistAll = await app.inject({
            method: 'POST',
            url: '/v1/plugins/allowlist/upsert',
            payload: {
                workspace_id: 'ws-1',
                plugin_key: 'jira_external',
                allowed_capabilities: ['ticket.create', 'ticket.read'],
            },
        });
        assert.equal(allowlistAll.statusCode, 201);

        const loaded = await app.inject({
            method: 'POST',
            url: '/v1/plugins/load',
            payload: {
                workspace_id: 'ws-1',
                manifest: buildManifest(),
                correlation_id: 'corr-3',
            },
        });
        assert.equal(loaded.statusCode, 201);
        const body = loaded.json() as { loadStatus: string; trustLevel: string };
        assert.equal(body.loadStatus, 'loaded');
        assert.equal(body.trustLevel, 'trusted');
    } finally {
        await app.close();
    }
});

test('C2: plugin load route rejects invalid signature before trust and allowlist checks', async () => {
    const app = Fastify();
    await registerPluginLoadingRoutes(app, {
        getSession: () => session(),
        featureEnabled: true,
        trustedPublishers: [{ publisher: 'agentfarm-plugins' }],
    });

    try {
        const tampered = {
            ...buildManifest(),
            signature: 'f'.repeat(64),
        };

        const response = await app.inject({
            method: 'POST',
            url: '/v1/plugins/load',
            payload: {
                workspace_id: 'ws-1',
                manifest: tampered,
                correlation_id: 'corr-invalid-signature',
            },
        });

        assert.equal(response.statusCode, 400);
        assert.equal((response.json() as { rejectionReason: string }).rejectionReason, 'invalid_signature');
    } finally {
        await app.close();
    }
});

test('C2: plugin kill-switch disables globally and appears in status', async () => {
    const app = Fastify();
    await registerPluginLoadingRoutes(app, {
        getSession: () => session(),
        featureEnabled: true,
        trustedPublishers: [{ publisher: 'agentfarm-plugins' }],
    });

    try {
        const disable = await app.inject({
            method: 'POST',
            url: '/v1/plugins/jira_external/disable',
            payload: {
                reason: 'incident-response',
                correlation_id: 'corr-disable',
            },
        });
        assert.equal(disable.statusCode, 200);

        const status = await app.inject({
            method: 'GET',
            url: '/v1/plugins/status?workspace_id=ws-1',
        });

        assert.equal(status.statusCode, 200);
        const statusBody = status.json() as {
            kill_switches: Array<{ pluginKey: string; status: string }>;
        };

        assert.ok(statusBody.kill_switches.some((entry) => entry.pluginKey === 'jira_external' && entry.status === 'active'));
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// Prisma persistence tests
// ---------------------------------------------------------------------------

test('plugin load writes to Prisma on success', async () => {
    const created: unknown[] = [];
    const mockPrisma = {
        externalPluginLoad: {
            create: async (args: unknown) => { created.push(args); return {}; },
            findMany: async () => [],
        },
        pluginKillSwitch: {
            upsert: async () => ({}),
            findUnique: async () => null,
        },
    };

    const app = Fastify();
    await registerPluginLoadingRoutes(app, {
        getSession: () => session(),
        featureEnabled: true,
        trustedPublishers: [{ publisher: 'agentfarm-plugins', sourceRepoPrefix: 'https://github.com/agentfarm/' }],
        getPrisma: async () => mockPrisma as Parameters<typeof registerPluginLoadingRoutes>[1]['getPrisma'] extends (() => Promise<infer T>) | undefined ? T : never,
    });

    try {
        await app.inject({ method: 'POST', url: '/v1/plugins/allowlist/upsert', payload: { workspace_id: 'ws-1', plugin_key: 'jira_external', allowed_capabilities: ['ticket.create', 'ticket.read'] } });
        const res = await app.inject({ method: 'POST', url: '/v1/plugins/load', payload: { workspace_id: 'ws-1', manifest: buildManifest(), correlation_id: 'corr-prisma-1' } });
        assert.equal(res.statusCode, 201);

        // Give the fire-and-forget a tick to resolve
        await new Promise((r) => setImmediate(r));
        assert.ok(created.length >= 1, 'Prisma create should have been called at least once');
        const row = (created[0] as { data: { status: string; pluginKey: string } }).data;
        assert.equal(row.status, 'loaded');
        assert.equal(row.pluginKey, 'jira_external');
    } finally {
        await app.close();
    }
});

test('plugin disable upserts kill switch to Prisma', async () => {
    const upserted: unknown[] = [];
    const mockPrisma = {
        externalPluginLoad: {
            create: async () => ({}),
            findMany: async () => [],
        },
        pluginKillSwitch: {
            upsert: async (args: unknown) => { upserted.push(args); return {}; },
            findUnique: async () => null,
        },
    };

    const app = Fastify();
    await registerPluginLoadingRoutes(app, {
        getSession: () => session(),
        featureEnabled: true,
        trustedPublishers: [],
        getPrisma: async () => mockPrisma as Parameters<typeof registerPluginLoadingRoutes>[1]['getPrisma'] extends (() => Promise<infer T>) | undefined ? T : never,
    });

    try {
        const res = await app.inject({ method: 'POST', url: '/v1/plugins/jira_external/disable', payload: { reason: 'security-incident' } });
        assert.equal(res.statusCode, 200);

        await new Promise((r) => setImmediate(r));
        assert.ok(upserted.length >= 1, 'Prisma upsert should have been called');
        const call = upserted[0] as { create: { pluginKey: string; reason: string } };
        assert.equal(call.create.pluginKey, 'jira_external');
        assert.equal(call.create.reason, 'security-incident');
    } finally {
        await app.close();
    }
});

test('plugin load is blocked when DB kill switch exists', async () => {
    const mockPrisma = {
        externalPluginLoad: {
            create: async () => ({}),
            findMany: async () => [],
        },
        pluginKillSwitch: {
            upsert: async () => ({}),
            findUnique: async () => ({ id: 'ks-1', tenantId: 'tenant-1', pluginKey: 'jira_external', reason: 'db-blocked', killedAt: new Date() }),
        },
    };

    const app = Fastify();
    await registerPluginLoadingRoutes(app, {
        getSession: () => session(),
        featureEnabled: true,
        trustedPublishers: [{ publisher: 'agentfarm-plugins', sourceRepoPrefix: 'https://github.com/agentfarm/' }],
        getPrisma: async () => mockPrisma as Parameters<typeof registerPluginLoadingRoutes>[1]['getPrisma'] extends (() => Promise<infer T>) | undefined ? T : never,
    });

    try {
        await app.inject({ method: 'POST', url: '/v1/plugins/allowlist/upsert', payload: { workspace_id: 'ws-1', plugin_key: 'jira_external', allowed_capabilities: ['ticket.create', 'ticket.read'] } });
        const res = await app.inject({ method: 'POST', url: '/v1/plugins/load', payload: { workspace_id: 'ws-1', manifest: buildManifest(), correlation_id: 'corr-dbkill' } });
        assert.equal(res.statusCode, 409);
        assert.equal((res.json() as { rejectionReason: string }).rejectionReason, 'kill_switch_active');
    } finally {
        await app.close();
    }
});

test('GET /v1/plugins/history returns records from Prisma', async () => {
    const fakeRecords = [
        { id: 'rec-1', tenantId: 'tenant-1', pluginKey: 'jira_external', version: '1.0.0', status: 'loaded', trustLevel: 'trusted', loadedAt: new Date() },
    ];
    const mockPrisma = {
        externalPluginLoad: {
            create: async () => ({}),
            findMany: async () => fakeRecords,
        },
        pluginKillSwitch: {
            upsert: async () => ({}),
            findUnique: async () => null,
        },
    };

    const app = Fastify();
    await registerPluginLoadingRoutes(app, {
        getSession: () => session(),
        featureEnabled: true,
        trustedPublishers: [],
        getPrisma: async () => mockPrisma as Parameters<typeof registerPluginLoadingRoutes>[1]['getPrisma'] extends (() => Promise<infer T>) | undefined ? T : never,
    });

    try {
        const res = await app.inject({ method: 'GET', url: '/v1/plugins/history' });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { records: unknown[] };
        assert.ok(Array.isArray(body.records));
        assert.equal(body.records.length, 1);
    } finally {
        await app.close();
    }
});
