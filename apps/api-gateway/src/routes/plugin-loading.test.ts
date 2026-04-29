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
    const app = Fastify();
    await registerPluginLoadingRoutes(app, {
        getSession: () => session(),
        featureEnabled: true,
        trustedPublishers: [{ publisher: 'agentfarm-plugins', sourceRepoPrefix: 'https://github.com/agentfarm/' }],
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
