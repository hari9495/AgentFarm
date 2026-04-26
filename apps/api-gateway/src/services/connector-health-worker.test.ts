import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemorySecretStore } from '../lib/secret-store.js';
import { runConnectorHealthTick } from './connector-health-worker.js';

type ScopeStatus = 'full' | 'partial' | 'insufficient';
type ConnectorStatus =
    | 'not_configured'
    | 'auth_initiated'
    | 'consent_pending'
    | 'token_received'
    | 'validation_in_progress'
    | 'connected'
    | 'degraded'
    | 'token_expired'
    | 'permission_invalid'
    | 'revoked'
    | 'disconnected';
type ErrorClass =
    | 'oauth_state_mismatch'
    | 'oauth_code_exchange_failed'
    | 'token_refresh_failed'
    | 'token_expired'
    | 'insufficient_scope'
    | 'provider_rate_limited'
    | 'provider_unavailable'
    | 'secret_store_unavailable';

type MetadataRecord = {
    connectorId: string;
    tenantId: string;
    workspaceId: string;
    connectorType: string;
    status: ConnectorStatus;
    secretRefId: string | null;
    scopeStatus: ScopeStatus | null;
    lastErrorClass: ErrorClass | null;
    lastHealthcheckAt: Date | null;
};

type AuthEvent = {
    connectorId: string;
    tenantId: string;
    eventType: string;
    result: string;
    errorClass?: ErrorClass | null;
    correlationId: string;
    actor: string;
};

const createFakeRepo = (records: MetadataRecord[]) => {
    const data = new Map(records.map((item) => [item.connectorId, { ...item }]));
    const events: AuthEvent[] = [];

    return {
        data,
        events,
        repo: {
            async findCandidates() {
                return Array.from(data.values());
            },
            async updateMetadata(input: {
                connectorId: string;
                status: ConnectorStatus;
                scopeStatus?: ScopeStatus | null;
                lastErrorClass?: ErrorClass | null;
                lastHealthcheckAt: Date;
            }) {
                const current = data.get(input.connectorId);
                if (!current) {
                    return;
                }
                data.set(input.connectorId, {
                    ...current,
                    status: input.status,
                    scopeStatus: input.scopeStatus ?? current.scopeStatus,
                    lastErrorClass: input.lastErrorClass ?? null,
                    lastHealthcheckAt: input.lastHealthcheckAt,
                });
            },
            async createAuthEvent(input: AuthEvent) {
                events.push(input);
            },
        },
    };
};

test('monthly stale connector is health-checked and moved to connected on successful probe', async () => {
    const nowMs = 1_710_000_000_000;
    const connectorId = 'jira:tenant_1:ws_1';
    const fakeRepo = createFakeRepo([
        {
            connectorId,
            tenantId: 'tenant_1',
            workspaceId: 'ws_1',
            connectorType: 'jira',
            status: 'degraded',
            secretRefId: 'kv://vault/secrets/jira',
            scopeStatus: 'partial',
            lastErrorClass: 'provider_unavailable',
            lastHealthcheckAt: null,
        },
    ]);

    const result = await runConnectorHealthTick({
        secretStore: createInMemorySecretStore({}),
        repo: fakeRepo.repo,
        now: () => nowMs,
        healthProbe: async () => ({ outcome: 'ok', message: 'healthy' }),
    });

    assert.equal(result.checked, 1);
    const updated = fakeRepo.data.get(connectorId);
    assert.equal(updated?.status, 'connected');
    assert.equal(updated?.lastErrorClass, null);
    assert.equal(updated?.scopeStatus, 'partial');
    assert.ok(updated?.lastHealthcheckAt instanceof Date);
    assert.equal(fakeRepo.events[0]?.eventType, 'oauth_healthcheck');
    assert.equal(fakeRepo.events[0]?.result, 'healthy');
});

test('auth failure probe maps connector to permission_invalid and re-auth remediation', async () => {
    const connectorId = 'github:tenant_1:ws_1';
    const fakeRepo = createFakeRepo([
        {
            connectorId,
            tenantId: 'tenant_1',
            workspaceId: 'ws_1',
            connectorType: 'github',
            status: 'connected',
            secretRefId: 'kv://vault/secrets/gh',
            scopeStatus: 'full',
            lastErrorClass: null,
            lastHealthcheckAt: null,
        },
    ]);

    await runConnectorHealthTick({
        secretStore: createInMemorySecretStore({}),
        repo: fakeRepo.repo,
        healthProbe: async () => ({ outcome: 'auth_failure', message: 'invalid token' }),
    });

    const updated = fakeRepo.data.get(connectorId);
    assert.equal(updated?.status, 'permission_invalid');
    assert.equal(updated?.scopeStatus, 'insufficient');
    assert.equal(updated?.lastErrorClass, 'insufficient_scope');
    assert.equal(fakeRepo.events[0]?.result, 'auth_failure');
});

test('rate-limited probe maps connector to degraded with provider_rate_limited', async () => {
    const connectorId = 'teams:tenant_1:ws_1';
    const fakeRepo = createFakeRepo([
        {
            connectorId,
            tenantId: 'tenant_1',
            workspaceId: 'ws_1',
            connectorType: 'teams',
            status: 'connected',
            secretRefId: 'kv://vault/secrets/teams',
            scopeStatus: 'full',
            lastErrorClass: null,
            lastHealthcheckAt: null,
        },
    ]);

    await runConnectorHealthTick({
        secretStore: createInMemorySecretStore({}),
        repo: fakeRepo.repo,
        healthProbe: async () => ({ outcome: 'rate_limited', message: '429' }),
    });

    const updated = fakeRepo.data.get(connectorId);
    assert.equal(updated?.status, 'degraded');
    assert.equal(updated?.lastErrorClass, 'provider_rate_limited');
    assert.equal(fakeRepo.events[0]?.errorClass, 'provider_rate_limited');
    assert.equal(fakeRepo.events[0]?.result, 'rate_limited');
});

test('insufficient scope always maps to consent_pending regardless of probe outcome', async () => {
    const connectorId = 'jira:tenant_1:ws_1';
    const fakeRepo = createFakeRepo([
        {
            connectorId,
            tenantId: 'tenant_1',
            workspaceId: 'ws_1',
            connectorType: 'jira',
            status: 'connected',
            secretRefId: 'kv://vault/secrets/jira',
            scopeStatus: 'insufficient',
            lastErrorClass: 'insufficient_scope',
            lastHealthcheckAt: null,
        },
    ]);

    await runConnectorHealthTick({
        secretStore: createInMemorySecretStore({}),
        repo: fakeRepo.repo,
        healthProbe: async () => ({ outcome: 'ok', message: 'healthy but scope missing' }),
    });

    const updated = fakeRepo.data.get(connectorId);
    assert.equal(updated?.status, 'consent_pending');
    assert.equal(updated?.scopeStatus, 'insufficient');
    assert.equal(updated?.lastErrorClass, 'insufficient_scope');
    assert.equal(fakeRepo.events[0]?.result, 'requires_reconsent');
});
