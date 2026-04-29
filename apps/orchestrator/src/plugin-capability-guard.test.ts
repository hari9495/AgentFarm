import { test } from 'node:test';
import * as assert from 'node:assert';
import { CONTRACT_VERSIONS, type ExternalPluginLoadRecord, type PluginCapabilityAllowlist } from '@agentfarm/shared-types';
import { evaluatePluginCapabilityGuard } from './plugin-capability-guard.js';

const makeLoadedRecord = (overrides: Partial<ExternalPluginLoadRecord> = {}): ExternalPluginLoadRecord => ({
    id: 'record-1',
    contractVersion: CONTRACT_VERSIONS.PLUGIN_LOADING,
    tenantId: 'tenant-1',
    workspaceId: 'ws-1',
    pluginKey: 'jira_external',
    manifestVersion: '1.0.0',
    loadStatus: 'loaded',
    trustLevel: 'trusted',
    loadedBy: 'admin-1',
    correlationId: 'corr-1',
    loadedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
});

const allowlist: PluginCapabilityAllowlist = {
    tenantId: 'tenant-1',
    workspaceId: 'ws-1',
    pluginKey: 'jira_external',
    allowedCapabilities: ['ticket.read'],
    updatedBy: 'admin-1',
    updatedAt: '2025-01-01T00:00:00.000Z',
};

test('C2: plugin capability guard denies when plugin was not loaded', () => {
    const decision = evaluatePluginCapabilityGuard({
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        pluginKey: 'jira_external',
        capability: 'ticket.read',
        loadRecords: [],
        allowlists: [allowlist],
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, 'plugin_not_loaded');
});

test('C2: plugin capability guard enforces trust and allowlist boundaries', () => {
    const untrustedDecision = evaluatePluginCapabilityGuard({
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        pluginKey: 'jira_external',
        capability: 'ticket.read',
        loadRecords: [makeLoadedRecord({ trustLevel: 'untrusted' })],
        allowlists: [allowlist],
    });

    assert.equal(untrustedDecision.allowed, false);
    assert.equal(untrustedDecision.reason, 'plugin_not_trusted');

    const disallowedCapabilityDecision = evaluatePluginCapabilityGuard({
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        pluginKey: 'jira_external',
        capability: 'ticket.create',
        loadRecords: [makeLoadedRecord()],
        allowlists: [allowlist],
    });

    assert.equal(disallowedCapabilityDecision.allowed, false);
    assert.equal(disallowedCapabilityDecision.reason, 'capability_not_allowlisted');

    const allowedDecision = evaluatePluginCapabilityGuard({
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        pluginKey: 'jira_external',
        capability: 'ticket.read',
        loadRecords: [makeLoadedRecord()],
        allowlists: [allowlist],
    });

    assert.equal(allowedDecision.allowed, true);
});
