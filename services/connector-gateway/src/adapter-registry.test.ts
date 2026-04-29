/**
 * Epic B1A: Adapter Registry Tests
 * Tests registry operations, health checks, and audit logging
 */

import { test } from 'node:test';
import * as assert from 'node:assert';
import { AdapterRegistry, type RegisterAdapterRequest } from './adapter-registry.js';

test('B1A: registerAdapter creates new adapter', async () => {
    const registry = new AdapterRegistry();
    const request: RegisterAdapterRequest = {
        adapterType: 'connector',
        adapterKey: 'jira_connector',
        displayName: 'Jira Connector',
        version: '1.0.0',
        capabilities: [
            { name: 'read_task', version: '1.0.0', supported: true },
            { name: 'create_comment', version: '1.0.0', supported: true },
        ],
        tenantId: 'tenant-1',
        correlationId: 'corr-1',
    };

    const adapter = await registry.registerAdapter(request);
    assert.ok(adapter.id);
    assert.equal(adapter.adapterKey, 'jira_connector');
    assert.equal(adapter.displayName, 'Jira Connector');
    assert.equal(adapter.status, 'registered');
    assert.equal(adapter.capabilities.length, 2);
});

test('B1A: registerAdapter rejects duplicate keys', async () => {
    const registry = new AdapterRegistry();
    const request: RegisterAdapterRequest = {
        adapterType: 'connector',
        adapterKey: 'github_connector',
        displayName: 'GitHub Connector',
        version: '1.0.0',
        capabilities: [],
        correlationId: 'corr-1',
    };

    await registry.registerAdapter(request);

    // Attempt duplicate registration
    await assert.rejects(
        () => registry.registerAdapter(request),
        /already registered/
    );
});

test('B1A: getAdapterByKey retrieves registered adapter', async () => {
    const registry = new AdapterRegistry();
    const request: RegisterAdapterRequest = {
        adapterType: 'runtime',
        adapterKey: 'azure_runtime',
        displayName: 'Azure Runtime',
        version: '1.0.0',
        capabilities: [],
        correlationId: 'corr-1',
    };

    const registered = await registry.registerAdapter(request);
    const retrieved = await registry.getAdapterByKey('azure_runtime');

    assert.equal(retrieved?.id, registered.id);
    assert.equal(retrieved?.adapterType, 'runtime');
});

test('B1A: discoverAdapters filters by type', async () => {
    const registry = new AdapterRegistry();

    // Register different adapter types
    await registry.registerAdapter({
        adapterType: 'connector',
        adapterKey: 'connector-1',
        displayName: 'Connector 1',
        version: '1.0.0',
        capabilities: [],
        correlationId: 'corr-1',
    });

    await registry.registerAdapter({
        adapterType: 'runtime',
        adapterKey: 'runtime-1',
        displayName: 'Runtime 1',
        version: '1.0.0',
        capabilities: [],
        correlationId: 'corr-2',
    });

    const connectors = await registry.discoverAdapters({ adapterType: 'connector' });
    assert.equal(connectors.length, 1);
    assert.equal(connectors[0].adapterKey, 'connector-1');

    const runtimes = await registry.discoverAdapters({ adapterType: 'runtime' });
    assert.equal(runtimes.length, 1);
    assert.equal(runtimes[0].adapterKey, 'runtime-1');
});

test('B1A: discoverAdapters filters by tenant', async () => {
    const registry = new AdapterRegistry();

    await registry.registerAdapter({
        adapterType: 'connector',
        adapterKey: 'tenant1-adapter',
        displayName: 'Tenant 1 Adapter',
        version: '1.0.0',
        capabilities: [],
        tenantId: 'tenant-1',
        correlationId: 'corr-1',
    });

    await registry.registerAdapter({
        adapterType: 'connector',
        adapterKey: 'tenant2-adapter',
        displayName: 'Tenant 2 Adapter',
        version: '1.0.0',
        capabilities: [],
        tenantId: 'tenant-2',
        correlationId: 'corr-2',
    });

    const tenant1 = await registry.discoverAdapters({ tenantId: 'tenant-1' });
    assert.equal(tenant1.length, 1);
    assert.equal(tenant1[0].tenantId, 'tenant-1');

    const tenant2 = await registry.discoverAdapters({ tenantId: 'tenant-2' });
    assert.equal(tenant2.length, 1);
    assert.equal(tenant2[0].tenantId, 'tenant-2');
});

test('B1A: healthCheck updates adapter status', async () => {
    const registry = new AdapterRegistry();
    const adapter = await registry.registerAdapter({
        adapterType: 'connector',
        adapterKey: 'health-test',
        displayName: 'Health Test',
        version: '1.0.0',
        capabilities: [],
        correlationId: 'corr-1',
    });

    const status = await registry.healthCheck(adapter.id, 'corr-1');
    assert.equal(status, 'healthy');

    const updated = await registry.getAdapter(adapter.id);
    assert.equal(updated?.status, 'healthy');
    assert.ok(updated?.lastHealthcheckAt);
    assert.equal(updated?.lastHealthcheckResult, 'OK');
});

test('B1A: unregisterAdapter marks adapter as unregistered', async () => {
    const registry = new AdapterRegistry();
    const adapter = await registry.registerAdapter({
        adapterType: 'connector',
        adapterKey: 'unreg-test',
        displayName: 'Unreg Test',
        version: '1.0.0',
        capabilities: [],
        correlationId: 'corr-1',
    });

    await registry.unregisterAdapter(adapter.id, 'corr-2');

    const retrieved = await registry.getAdapterByKey('unreg-test');
    assert.equal(retrieved?.status, 'unregistered');
});

test('B1A: updateCapabilities modifies adapter capabilities', async () => {
    const registry = new AdapterRegistry();
    const adapter = await registry.registerAdapter({
        adapterType: 'connector',
        adapterKey: 'cap-test',
        displayName: 'Cap Test',
        version: '1.0.0',
        capabilities: [{ name: 'read', version: '1.0.0', supported: true }],
        correlationId: 'corr-1',
    });

    const updated = await registry.updateCapabilities(
        adapter.id,
        [
            { name: 'read', version: '1.0.0', supported: true },
            { name: 'write', version: '1.0.0', supported: true },
        ],
        'corr-2'
    );

    assert.equal(updated.capabilities.length, 2);
    assert.ok(updated.capabilities.find((c: any) => c.name === 'write'));
});

test('B1A: audit log tracks registry operations', async () => {
    const registry = new AdapterRegistry();
    const adapter = await registry.registerAdapter({
        adapterType: 'connector',
        adapterKey: 'audit-test',
        displayName: 'Audit Test',
        version: '1.0.0',
        capabilities: [],
        tenantId: 'tenant-audit',
        correlationId: 'corr-1',
    });

    await registry.healthCheck(adapter.id, 'corr-2');
    await registry.unregisterAdapter(adapter.id, 'corr-3');

    const log = registry.getAuditLog('tenant-audit');
    assert.ok(log.length >= 2);

    const registerEntry = log.find((e: any) => e.action === 'register');
    assert.ok(registerEntry);

    const healthcheckEntry = log.find((e: any) => e.action === 'healthcheck');
    assert.ok(healthcheckEntry);

    const unregisterEntry = log.find((e: any) => e.action === 'unregister');
    assert.ok(unregisterEntry);
});
