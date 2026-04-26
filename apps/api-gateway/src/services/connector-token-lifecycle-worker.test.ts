import test from 'node:test';
import assert from 'node:assert/strict';
import { runConnectorTokenLifecycleTick } from './connector-token-lifecycle-worker.js';
import { createInMemorySecretStore } from '../lib/secret-store.js';

type ScopeStatus = 'full' | 'partial' | 'insufficient';

type MetadataStatus =
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

type RecordItem = {
    connectorId: string;
    tenantId: string;
    workspaceId: string;
    connectorType: string;
    authMode: string;
    status: MetadataStatus;
    secretRefId: string | null;
    tokenExpiresAt: Date | null;
    lastRefreshAt: Date | null;
    scopeStatus: ScopeStatus | null;
    lastErrorClass?: ErrorClass | null;
};

type EventItem = {
    connectorId: string;
    tenantId: string;
    eventType: string;
    result: string;
    errorClass?: ErrorClass | null;
    correlationId: string;
    actor: string;
};

const createFakeRepo = (records: RecordItem[]) => {
    const metadata = new Map(records.map((item) => [item.connectorId, { ...item }]));
    const events: EventItem[] = [];

    return {
        metadata,
        events,
        repo: {
            async findRefreshCandidates() {
                return Array.from(metadata.values());
            },
            async updateMetadata(input: {
                connectorId: string;
                status: MetadataStatus;
                tokenExpiresAt?: Date | null;
                lastRefreshAt?: Date | null;
                scopeStatus?: ScopeStatus | null;
                lastErrorClass?: ErrorClass | null;
            }) {
                const current = metadata.get(input.connectorId);
                if (!current) {
                    return;
                }
                metadata.set(input.connectorId, {
                    ...current,
                    status: input.status,
                    tokenExpiresAt: input.tokenExpiresAt ?? current.tokenExpiresAt,
                    lastRefreshAt: input.lastRefreshAt ?? current.lastRefreshAt,
                    scopeStatus: input.scopeStatus ?? current.scopeStatus,
                    lastErrorClass: input.lastErrorClass,
                });
            },
            async createAuthEvent(input: EventItem) {
                events.push(input);
            },
        },
    };
};

const jsonResponse = (status: number, body: unknown): Response => {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
        },
    });
};

test('refreshes due token and updates metadata + secret', async () => {
    const nowMs = 1_710_000_000_000;
    const connectorId = 'github:tenant_1:ws_1';
    const secretRefId = 'kv://vault/secrets/gh-token';

    const store = createInMemorySecretStore({
        [secretRefId]: JSON.stringify({
            access_token: 'old_access',
            refresh_token: 'refresh_1',
        }),
    });

    const fakeRepo = createFakeRepo([
        {
            connectorId,
            tenantId: 'tenant_1',
            workspaceId: 'ws_1',
            connectorType: 'github',
            authMode: 'oauth2',
            status: 'connected',
            secretRefId,
            tokenExpiresAt: new Date(nowMs + 30_000),
            lastRefreshAt: null,
            scopeStatus: 'full',
        },
    ]);

    const fetchImpl: typeof fetch = async () => {
        return jsonResponse(200, {
            access_token: 'new_access',
            refresh_token: 'refresh_2',
            expires_in: 3600,
            scope: 'read:user repo workflow',
        });
    };

    const result = await runConnectorTokenLifecycleTick({
        repo: fakeRepo.repo,
        secretStore: store,
        fetchImpl,
        now: () => nowMs,
        env: {
            CONNECTOR_GITHUB_CLIENT_ID: 'gh_client',
            CONNECTOR_GITHUB_CLIENT_SECRET: 'gh_secret',
        },
    });

    assert.equal(result.processed, 1);

    const updated = fakeRepo.metadata.get(connectorId);
    assert.equal(updated?.status, 'connected');
    assert.equal(updated?.lastErrorClass, null);
    assert.ok(updated?.tokenExpiresAt instanceof Date);
    assert.ok((updated?.tokenExpiresAt?.getTime() ?? 0) > nowMs);

    const refreshedSecret = await store.getSecret(secretRefId);
    assert.ok(refreshedSecret);
    const parsed = JSON.parse(refreshedSecret ?? '{}') as { access_token?: string; refresh_token?: string };
    assert.equal(parsed.access_token, 'new_access');
    assert.equal(parsed.refresh_token, 'refresh_2');

    assert.equal(fakeRepo.events.length, 1);
    assert.equal(fakeRepo.events[0]?.result, 'refreshed');
});

test('moves permission_invalid to consent_pending for re-consent recovery', async () => {
    const connectorId = 'jira:tenant_1:ws_1';
    const fakeRepo = createFakeRepo([
        {
            connectorId,
            tenantId: 'tenant_1',
            workspaceId: 'ws_1',
            connectorType: 'jira',
            authMode: 'oauth2',
            status: 'permission_invalid',
            secretRefId: 'kv://vault/secrets/jira-token',
            tokenExpiresAt: new Date(Date.now() + 30_000),
            lastRefreshAt: null,
            scopeStatus: 'insufficient',
        },
    ]);

    const store = createInMemorySecretStore({});

    await runConnectorTokenLifecycleTick({
        repo: fakeRepo.repo,
        secretStore: store,
        fetchImpl: async () => jsonResponse(200, {}),
        now: () => Date.now(),
        env: {},
    });

    const updated = fakeRepo.metadata.get(connectorId);
    assert.equal(updated?.status, 'consent_pending');
    assert.equal(updated?.lastErrorClass, 'insufficient_scope');
    assert.equal(fakeRepo.events[0]?.result, 'requires_reconsent');
});

test('marks token_expired when refresh token is missing and token already expired', async () => {
    const nowMs = 1_710_000_000_000;
    const connectorId = 'teams:tenant_1:ws_1';
    const secretRefId = 'kv://vault/secrets/teams-token';
    const store = createInMemorySecretStore({
        [secretRefId]: JSON.stringify({ access_token: 'still_old' }),
    });

    const fakeRepo = createFakeRepo([
        {
            connectorId,
            tenantId: 'tenant_1',
            workspaceId: 'ws_1',
            connectorType: 'teams',
            authMode: 'oauth2',
            status: 'token_expired',
            secretRefId,
            tokenExpiresAt: new Date(nowMs - 1_000),
            lastRefreshAt: null,
            scopeStatus: 'full',
        },
    ]);

    await runConnectorTokenLifecycleTick({
        repo: fakeRepo.repo,
        secretStore: store,
        fetchImpl: async () => jsonResponse(200, {}),
        now: () => nowMs,
        env: {
            CONNECTOR_TEAMS_CLIENT_ID: 'teams_client',
            CONNECTOR_TEAMS_CLIENT_SECRET: 'teams_secret',
        },
    });

    const updated = fakeRepo.metadata.get(connectorId);
    assert.equal(updated?.status, 'token_expired');
    assert.equal(updated?.lastErrorClass, 'token_expired');
    assert.equal(fakeRepo.events[0]?.result, 'refresh_token_missing');
});

test('maps provider 429 refresh failure to degraded/provider_rate_limited', async () => {
    const nowMs = 1_710_000_000_000;
    const connectorId = 'github:tenant_1:ws_1';
    const secretRefId = 'kv://vault/secrets/gh-token';

    const store = createInMemorySecretStore({
        [secretRefId]: JSON.stringify({
            access_token: 'old_access',
            refresh_token: 'refresh_1',
        }),
    });

    const fakeRepo = createFakeRepo([
        {
            connectorId,
            tenantId: 'tenant_1',
            workspaceId: 'ws_1',
            connectorType: 'github',
            authMode: 'oauth2',
            status: 'connected',
            secretRefId,
            tokenExpiresAt: new Date(nowMs + 10_000),
            lastRefreshAt: null,
            scopeStatus: 'full',
        },
    ]);

    const fetchImpl: typeof fetch = async () => new Response('rate-limited', { status: 429 });

    await runConnectorTokenLifecycleTick({
        repo: fakeRepo.repo,
        secretStore: store,
        fetchImpl,
        now: () => nowMs,
        env: {
            CONNECTOR_GITHUB_CLIENT_ID: 'gh_client',
            CONNECTOR_GITHUB_CLIENT_SECRET: 'gh_secret',
        },
    });

    const updated = fakeRepo.metadata.get(connectorId);
    assert.equal(updated?.status, 'degraded');
    assert.equal(updated?.lastErrorClass, 'provider_rate_limited');
    assert.equal(fakeRepo.events[0]?.errorClass, 'provider_rate_limited');
    assert.equal(fakeRepo.events[0]?.result, 'refresh_failed');
});
