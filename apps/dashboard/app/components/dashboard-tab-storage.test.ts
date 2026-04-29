import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getDashboardWorkspaceStorageKey,
    getDashboardTabStorageKey,
    getLegacyDashboardTabStorageKey,
    resolveDashboardStoredWorkspaceId,
    resolveDashboardStoredTab,
} from './dashboard-tab-storage';

test('getDashboardTabStorageKey returns default key when workspace id is missing', () => {
    assert.equal(getDashboardTabStorageKey(), 'agentfarm.dashboard.activeTab');
    assert.equal(getDashboardTabStorageKey(''), 'agentfarm.dashboard.activeTab');
});

test('getDashboardTabStorageKey scopes key by workspace id', () => {
    assert.equal(
        getDashboardTabStorageKey('ws_primary_001'),
        'agentfarm.dashboard.activeTab.ws_primary_001',
    );
    assert.equal(getDashboardTabStorageKey('tenant-42'), 'agentfarm.dashboard.activeTab.tenant-42');
});

test('getLegacyDashboardTabStorageKey returns shared key', () => {
    assert.equal(getLegacyDashboardTabStorageKey(), 'agentfarm.dashboard.activeTab');
});

test('resolveDashboardStoredTab prefers workspace-scoped tab value', () => {
    assert.deepEqual(
        resolveDashboardStoredTab({
            workspaceStoredTab: 'audit',
            legacyStoredTab: 'overview',
            workspaceId: 'ws_primary_001',
        }),
        { storedTab: 'audit', shouldMigrateLegacy: false },
    );
});

test('resolveDashboardStoredTab migrates legacy value when workspace key is missing', () => {
    assert.deepEqual(
        resolveDashboardStoredTab({
            workspaceStoredTab: null,
            legacyStoredTab: 'observability',
            workspaceId: 'ws_primary_001',
        }),
        { storedTab: 'observability', shouldMigrateLegacy: true },
    );
});

test('resolveDashboardStoredTab ignores invalid legacy values', () => {
    assert.deepEqual(
        resolveDashboardStoredTab({
            workspaceStoredTab: null,
            legacyStoredTab: 'invalid-tab',
            workspaceId: 'ws_primary_001',
        }),
        { storedTab: null, shouldMigrateLegacy: false },
    );
});

test('resolveDashboardStoredTab keeps workspaces independent by key', () => {
    const firstWorkspace = getDashboardTabStorageKey('ws_one');
    const secondWorkspace = getDashboardTabStorageKey('ws_two');

    assert.notEqual(firstWorkspace, secondWorkspace);
});

test('getDashboardWorkspaceStorageKey returns sticky workspace key', () => {
    assert.equal(getDashboardWorkspaceStorageKey(), 'agentfarm.dashboard.activeWorkspaceId');
});

test('resolveDashboardStoredWorkspaceId returns null for unknown workspace', () => {
    const resolved = resolveDashboardStoredWorkspaceId({
        storedWorkspaceId: 'ws_unknown',
        availableWorkspaceIds: ['ws_one', 'ws_two'],
    });

    assert.equal(resolved, null);
});

test('resolveDashboardStoredWorkspaceId returns stored workspace when available', () => {
    const resolved = resolveDashboardStoredWorkspaceId({
        storedWorkspaceId: 'ws_two',
        availableWorkspaceIds: ['ws_one', 'ws_two'],
    });

    assert.equal(resolved, 'ws_two');
});
