import { test } from 'node:test';
import * as assert from 'node:assert';
import {
    computePluginManifestSignature,
    type ExternalPluginManifestContract,
} from '@agentfarm/connector-contracts';
import { ExternalPluginLoader } from './plugin-loader.js';

const buildManifest = (): ExternalPluginManifestContract => {
    const unsigned: ExternalPluginManifestContract = {
        plugin_key: 'jira_external',
        plugin_name: 'Jira External Adapter',
        version: '1.0.0',
        provider: 'agentfarm',
        capabilities: ['ticket.create', 'ticket.read'],
        supported_adapter_types: ['task_tracker'],
        artifact_url: 'https://plugins.agentfarm.dev/jira-external-1.0.0.tgz',
        signature: '',
        signature_algorithm: 'sha256' as const,
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

test('C2: rejects plugin load while feature flag is disabled', () => {
    const loader = new ExternalPluginLoader({ featureEnabled: false });

    const record = loader.loadPlugin({
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        loadedBy: 'admin-1',
        correlationId: 'corr-1',
        manifest: buildManifest(),
    });

    assert.equal(record.loadStatus, 'rejected');
    assert.equal(record.rejectionReason, 'feature_flag_disabled');
});

test('C2: enforces trusted publisher + capability allowlist before loading plugin', () => {
    const loader = new ExternalPluginLoader({
        featureEnabled: true,
        trustedPublishers: [
            { publisher: 'agentfarm-plugins', sourceRepoPrefix: 'https://github.com/agentfarm/' },
        ],
    });

    loader.upsertAllowlist({
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        pluginKey: 'jira_external',
        allowedCapabilities: ['ticket.read'],
        updatedBy: 'admin-1',
    });

    const rejected = loader.loadPlugin({
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        loadedBy: 'admin-1',
        correlationId: 'corr-2',
        manifest: buildManifest(),
    });

    assert.equal(rejected.loadStatus, 'rejected');
    assert.match(rejected.rejectionReason ?? '', /^capability_not_allowlisted:/);

    loader.upsertAllowlist({
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        pluginKey: 'jira_external',
        allowedCapabilities: ['ticket.create', 'ticket.read'],
        updatedBy: 'admin-2',
    });

    const loaded = loader.loadPlugin({
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        loadedBy: 'admin-2',
        correlationId: 'corr-3',
        manifest: buildManifest(),
    });

    assert.equal(loaded.loadStatus, 'loaded');
    assert.equal(loaded.trustLevel, 'trusted');
});

test('C2: kill-switch disables plugin globally and emits audit evidence', () => {
    const loader = new ExternalPluginLoader({
        featureEnabled: true,
        trustedPublishers: [{ publisher: 'agentfarm-plugins' }],
    });

    loader.upsertAllowlist({
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        pluginKey: 'jira_external',
        allowedCapabilities: ['ticket.create', 'ticket.read'],
        updatedBy: 'admin-1',
    });

    const disabled = loader.disablePluginGlobally('jira_external', 'secops-1', 'incident-bridge', 'corr-disable');
    assert.equal(disabled.status, 'active');

    const rejected = loader.loadPlugin({
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        loadedBy: 'admin-1',
        correlationId: 'corr-4',
        manifest: buildManifest(),
    });

    assert.equal(rejected.loadStatus, 'rejected');
    assert.equal(rejected.rejectionReason, 'plugin_disabled:incident-bridge');

    const events = loader.listAuditEvents('jira_external');
    assert.ok(events.some((event) => event.eventType === 'plugin_disable'));
    assert.ok(events.some((event) => event.eventType === 'plugin_reject'));
});

test('C2: rejects plugin load when signature does not match manifest payload', () => {
    const loader = new ExternalPluginLoader({
        featureEnabled: true,
        trustedPublishers: [{ publisher: 'agentfarm-plugins' }],
    });

    loader.upsertAllowlist({
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        pluginKey: 'jira_external',
        allowedCapabilities: ['ticket.create', 'ticket.read'],
        updatedBy: 'admin-1',
    });

    const tampered = {
        ...buildManifest(),
        signature: '0'.repeat(64),
    };

    const record = loader.loadPlugin({
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        loadedBy: 'admin-1',
        correlationId: 'corr-invalid-signature',
        manifest: tampered,
    });

    assert.equal(record.loadStatus, 'rejected');
    assert.equal(record.rejectionReason, 'invalid_signature');
});
