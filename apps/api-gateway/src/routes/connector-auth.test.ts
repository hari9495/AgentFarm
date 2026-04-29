import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerConnectorAuthRoutes, type ConnectorAuthRepo, type SessionContext } from './connector-auth.js';

type Metadata = {
    connectorId: string;
    tenantId: string;
    workspaceId: string;
    connectorType: string;
    status: string;
    authMode: string;
    secretRefId: string | null;
    tokenExpiresAt: Date | null;
    lastRefreshAt: Date | null;
    scopeStatus: 'full' | 'partial' | 'insufficient' | null;
    lastErrorClass:
    | 'oauth_state_mismatch'
    | 'oauth_code_exchange_failed'
    | 'token_refresh_failed'
    | 'token_expired'
    | 'insufficient_scope'
    | 'provider_rate_limited'
    | 'provider_unavailable'
    | 'secret_store_unavailable'
    | null;
};

type AuthSession = {
    id: string;
    connectorId: string;
    tenantId: string;
    workspaceId: string;
    stateNonce: string;
    status: string;
    createdAt: Date;
    expiresAt: Date;
};

type AuthEvent = {
    connectorId: string;
    tenantId: string;
    eventType: string;
    result: string;
    correlationId: string;
    actor: string;
};

const createFakeSecretStore = () => {
    const values = new Map<string, string>();
    return {
        values,
        async getSecret(secretRefId: string) {
            return values.get(secretRefId) ?? null;
        },
        async setSecret(secretRefId: string, value: string) {
            values.set(secretRefId, value);
            return secretRefId;
        },
    };
};

const createFakeRepo = (): ConnectorAuthRepo & {
    metadata: Map<string, Metadata>;
    sessions: Map<string, AuthSession>;
    events: AuthEvent[];
} => {
    const metadata = new Map<string, Metadata>();
    const sessions = new Map<string, AuthSession>();
    const events: AuthEvent[] = [];

    return {
        metadata,
        sessions,
        events,

        async upsertAuthMetadata(input) {
            metadata.set(input.connectorId, {
                connectorId: input.connectorId,
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                connectorType: input.connectorType,
                status: input.status,
                authMode: input.authMode,
                secretRefId: input.secretRefId ?? null,
                tokenExpiresAt: input.tokenExpiresAt ?? null,
                lastRefreshAt: input.lastRefreshAt ?? null,
                scopeStatus: input.scopeStatus ?? null,
                lastErrorClass: input.lastErrorClass ?? null,
            });
        },

        async findAuthMetadata(connectorId) {
            return metadata.get(connectorId) ?? null;
        },

        async createAuthSession(input) {
            const created: AuthSession = {
                id: `sess_${sessions.size + 1}`,
                connectorId: input.connectorId,
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                stateNonce: input.stateNonce,
                status: input.status,
                createdAt: new Date(),
                expiresAt: input.expiresAt,
            };
            sessions.set(created.id, created);
            return created;
        },

        async findAuthSessionByNonce(stateNonce) {
            for (const session of sessions.values()) {
                if (session.stateNonce === stateNonce) {
                    return session;
                }
            }
            return null;
        },

        async updateAuthSessionStatus(sessionId, status) {
            const existing = sessions.get(sessionId);
            if (!existing) {
                return;
            }
            existing.status = status;
            sessions.set(sessionId, existing);
        },

        async createAuthEvent(input) {
            events.push(input);
        },
    };
};

const sessionContext = (): SessionContext => ({
    userId: 'user_1',
    tenantId: 'tenant_1',
    workspaceIds: ['ws_1'],
    expiresAt: Date.now() + 3600_000,
});

test('oauth initiate creates connector auth session and returns authorization URL', async () => {
    const app = Fastify();
    const repo = createFakeRepo();

    await registerConnectorAuthRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        nonceGenerator: () => 'state_nonce_1',
        env: {
            API_BASE_URL: 'http://localhost:3000',
            CONNECTOR_GITHUB_AUTHORIZE_URL: 'https://github.com/login/oauth/authorize',
            CONNECTOR_GITHUB_CLIENT_ID: 'gh-client-123',
        },
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/connectors/oauth/initiate',
            payload: {
                connector_type: 'github',
                workspace_id: 'ws_1',
            },
        });

        assert.equal(response.statusCode, 201);
        const body = response.json() as {
            connector_id: string;
            state_nonce: string;
            authorization_url: string;
            token_storage: string;
        };

        assert.equal(body.connector_id, 'github:tenant_1:ws_1');
        assert.equal(body.state_nonce, 'state_nonce_1');
        assert.ok(body.authorization_url.includes('state=state_nonce_1'));
        assert.ok(body.authorization_url.includes('client_id=gh-client-123'));
        assert.equal(body.token_storage, 'key_vault_reference_only');

        assert.equal(repo.metadata.size, 1);
        assert.equal(repo.sessions.size, 1);
        assert.equal(repo.events.length, 1);
    } finally {
        await app.close();
    }
});

test('oauth initiate supports company email connector', async () => {
    const app = Fastify();
    const repo = createFakeRepo();

    await registerConnectorAuthRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        nonceGenerator: () => 'state_nonce_email_init',
        env: {
            API_BASE_URL: 'http://localhost:3000',
            CONNECTOR_EMAIL_AUTHORIZE_URL: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
            CONNECTOR_EMAIL_CLIENT_ID: 'email-client-123',
        },
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/connectors/oauth/initiate',
            payload: {
                connector_type: 'email',
                workspace_id: 'ws_1',
            },
        });

        assert.equal(response.statusCode, 201);
        const body = response.json() as {
            connector_id: string;
            authorization_url: string;
            state_nonce: string;
        };

        assert.equal(body.connector_id, 'email:tenant_1:ws_1');
        assert.equal(body.state_nonce, 'state_nonce_email_init');
        assert.ok(body.authorization_url.includes('client_id=email-client-123'));
        assert.ok(body.authorization_url.includes('Mail.Send'));
    } finally {
        await app.close();
    }
});

test('oauth initiate rejects workspace outside session scope', async () => {
    const app = Fastify();

    await registerConnectorAuthRoutes(app, {
        getSession: () => sessionContext(),
        repo: createFakeRepo(),
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/connectors/oauth/initiate',
            payload: {
                connector_type: 'jira',
                workspace_id: 'ws_999',
            },
        });

        assert.equal(response.statusCode, 403);
    } finally {
        await app.close();
    }
});

test('callback rejects invalid state nonce', async () => {
    const app = Fastify();

    await registerConnectorAuthRoutes(app, {
        getSession: () => null,
        repo: createFakeRepo(),
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/auth/connectors/callback?state=bad_nonce&code=abc',
        });

        assert.equal(response.statusCode, 400);
        const body = response.json() as { error: string };
        assert.equal(body.error, 'invalid_state_nonce');
    } finally {
        await app.close();
    }
});

test('callback success stores only key vault reference and marks token_received', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    const secretStore = createFakeSecretStore();

    await registerConnectorAuthRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        secretStore,
        nonceGenerator: () => 'state_nonce_success',
        env: {
            CONNECTOR_TOKEN_KEYVAULT_URI: 'https://kv-agentfarm.vault.azure.net',
        },
    });

    try {
        const init = await app.inject({
            method: 'POST',
            url: '/v1/connectors/oauth/initiate',
            payload: {
                connector_type: 'teams',
                workspace_id: 'ws_1',
            },
        });
        assert.equal(init.statusCode, 201);

        const callback = await app.inject({
            method: 'GET',
            url: '/auth/connectors/callback?state=state_nonce_success&code=oauth_code_123',
        });

        assert.equal(callback.statusCode, 200);
        const body = callback.json() as {
            status: string;
            token_storage: string;
            secret_ref_id: string;
        };
        assert.equal(body.status, 'oauth_completed');
        assert.equal(body.token_storage, 'key_vault_reference_only');
        assert.ok(body.secret_ref_id.includes('/secrets/'));

        const metadata = repo.metadata.get('teams:tenant_1:ws_1');
        assert.equal(metadata?.status, 'token_received');
        assert.equal(metadata?.secretRefId, body.secret_ref_id);
        assert.ok(metadata?.tokenExpiresAt instanceof Date);
        assert.ok(metadata?.lastRefreshAt instanceof Date);
        const persistedSecret = await secretStore.getSecret(body.secret_ref_id);
        assert.ok(typeof persistedSecret === 'string');
        const parsedSecret = JSON.parse(persistedSecret ?? '{}') as { access_token?: string };
        assert.ok(typeof parsedSecret.access_token === 'string');
        assert.ok(parsedSecret.access_token?.includes('oauth_code_123'));

        const firstSession = Array.from(repo.sessions.values())[0];
        assert.equal(firstSession?.status, 'completed');
    } finally {
        await app.close();
    }
});

test('email callback success stores key vault reference and marks token_received', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    const secretStore = createFakeSecretStore();

    await registerConnectorAuthRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        secretStore,
        nonceGenerator: () => 'state_nonce_email_success',
        env: {
            CONNECTOR_TOKEN_KEYVAULT_URI: 'https://kv-agentfarm.vault.azure.net',
        },
    });

    try {
        const init = await app.inject({
            method: 'POST',
            url: '/v1/connectors/oauth/initiate',
            payload: {
                connector_type: 'email',
                workspace_id: 'ws_1',
            },
        });
        assert.equal(init.statusCode, 201);

        const callback = await app.inject({
            method: 'GET',
            url: '/auth/connectors/callback?state=state_nonce_email_success&code=oauth_code_email_123',
        });

        assert.equal(callback.statusCode, 200);
        const body = callback.json() as {
            status: string;
            secret_ref_id: string;
        };
        assert.equal(body.status, 'oauth_completed');

        const metadata = repo.metadata.get('email:tenant_1:ws_1');
        assert.equal(metadata?.status, 'token_received');
        assert.equal(metadata?.scopeStatus, 'full');
        assert.equal(metadata?.secretRefId, body.secret_ref_id);

        const persistedSecret = await secretStore.getSecret(body.secret_ref_id);
        assert.ok(typeof persistedSecret === 'string');
        const parsedSecret = JSON.parse(persistedSecret ?? '{}') as { access_token?: string; provider?: string };
        assert.ok(parsedSecret.access_token?.includes('oauth_code_email_123'));
        assert.equal(parsedSecret.provider, 'microsoft_graph');
    } finally {
        await app.close();
    }
});

test('callback marks metadata degraded when secret store write fails', async () => {
    const app = Fastify();
    const repo = createFakeRepo();

    await registerConnectorAuthRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        nonceGenerator: () => 'state_nonce_secret_fail',
        secretStore: {
            async getSecret() {
                return null;
            },
            async setSecret() {
                throw new Error('secret store offline');
            },
        },
    });

    try {
        const init = await app.inject({
            method: 'POST',
            url: '/v1/connectors/oauth/initiate',
            payload: {
                connector_type: 'github',
                workspace_id: 'ws_1',
            },
        });
        assert.equal(init.statusCode, 201);

        const callback = await app.inject({
            method: 'GET',
            url: '/auth/connectors/callback?state=state_nonce_secret_fail&code=oauth_code_123',
        });

        assert.equal(callback.statusCode, 503);
        const body = callback.json() as { error: string };
        assert.equal(body.error, 'secret_store_unavailable');

        const metadata = repo.metadata.get('github:tenant_1:ws_1');
        assert.equal(metadata?.status, 'degraded');
        assert.equal(metadata?.lastErrorClass, 'secret_store_unavailable');

        const firstSession = Array.from(repo.sessions.values())[0];
        assert.equal(firstSession?.status, 'failed');
    } finally {
        await app.close();
    }
});

test('callback handles provider consent error and marks connector consent_pending', async () => {
    const app = Fastify();
    const repo = createFakeRepo();

    await registerConnectorAuthRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        nonceGenerator: () => 'state_nonce_error',
    });

    try {
        const init = await app.inject({
            method: 'POST',
            url: '/v1/connectors/oauth/initiate',
            payload: {
                connector_type: 'jira',
                workspace_id: 'ws_1',
            },
        });
        assert.equal(init.statusCode, 201);

        const callback = await app.inject({
            method: 'GET',
            url: '/auth/connectors/callback?state=state_nonce_error&error=access_denied',
        });

        assert.equal(callback.statusCode, 400);
        const metadata = repo.metadata.get('jira:tenant_1:ws_1');
        assert.equal(metadata?.status, 'consent_pending');
        assert.equal(metadata?.lastErrorClass, 'insufficient_scope');

        const firstSession = Array.from(repo.sessions.values())[0];
        assert.equal(firstSession?.status, 'failed');
    } finally {
        await app.close();
    }
});

test('email callback with insufficient scope is routed to consent_pending', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    const secretStore = createFakeSecretStore();

    await registerConnectorAuthRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        secretStore,
        nonceGenerator: () => 'state_nonce_email_scope',
        codeExchanger: async () => ({
            credentials: {
                access_token: 'email_access_insufficient',
                provider: 'microsoft_graph',
            },
            expiresAt: new Date(Date.now() + 60_000),
            scopeStatus: 'insufficient',
        }),
    });

    try {
        const init = await app.inject({
            method: 'POST',
            url: '/v1/connectors/oauth/initiate',
            payload: {
                connector_type: 'email',
                workspace_id: 'ws_1',
            },
        });
        assert.equal(init.statusCode, 201);

        const callback = await app.inject({
            method: 'GET',
            url: '/auth/connectors/callback?state=state_nonce_email_scope&code=oauth_code_email_scope',
        });

        assert.equal(callback.statusCode, 409);
        const body = callback.json() as { error: string; status: string };
        assert.equal(body.error, 'insufficient_scope');
        assert.equal(body.status, 'consent_pending');

        const metadata = repo.metadata.get('email:tenant_1:ws_1');
        assert.equal(metadata?.status, 'consent_pending');
        assert.equal(metadata?.scopeStatus, 'insufficient');
        assert.equal(metadata?.lastErrorClass, 'insufficient_scope');

        const firstSession = Array.from(repo.sessions.values())[0];
        assert.equal(firstSession?.status, 'failed');
    } finally {
        await app.close();
    }
});

test('callback rejects state nonce replay after successful completion', async () => {
    const app = Fastify();
    const repo = createFakeRepo();

    await registerConnectorAuthRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        nonceGenerator: () => 'state_nonce_replay',
    });

    try {
        const init = await app.inject({
            method: 'POST',
            url: '/v1/connectors/oauth/initiate',
            payload: {
                connector_type: 'github',
                workspace_id: 'ws_1',
            },
        });
        assert.equal(init.statusCode, 201);

        const firstCallback = await app.inject({
            method: 'GET',
            url: '/auth/connectors/callback?state=state_nonce_replay&code=oauth_code_123',
        });
        assert.equal(firstCallback.statusCode, 200);

        const replay = await app.inject({
            method: 'GET',
            url: '/auth/connectors/callback?state=state_nonce_replay&code=oauth_code_456',
        });

        assert.equal(replay.statusCode, 409);
        const body = replay.json() as { error: string };
        assert.equal(body.error, 'state_nonce_already_used');

        const metadata = repo.metadata.get('github:tenant_1:ws_1');
        assert.equal(metadata?.status, 'token_received');
    } finally {
        await app.close();
    }
});

test('callback rejects expired auth session state nonce', async () => {
    const app = Fastify();
    const repo = createFakeRepo();

    let fakeNow = 1000;

    await registerConnectorAuthRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        nonceGenerator: () => 'state_nonce_expired',
        now: () => fakeNow,
    });

    try {
        const init = await app.inject({
            method: 'POST',
            url: '/v1/connectors/oauth/initiate',
            payload: {
                connector_type: 'github',
                workspace_id: 'ws_1',
            },
        });
        assert.equal(init.statusCode, 201);

        fakeNow += 10 * 60 * 1000 + 1;

        const callback = await app.inject({
            method: 'GET',
            url: '/auth/connectors/callback?state=state_nonce_expired&code=ok',
        });

        assert.equal(callback.statusCode, 400);
        const body = callback.json() as { error: string };
        assert.equal(body.error, 'expired_state_nonce');

        const firstSession = Array.from(repo.sessions.values())[0];
        assert.equal(firstSession?.status, 'expired');
    } finally {
        await app.close();
    }
});

test('refresh endpoint auto-refreshes token before expiry and updates lifecycle timestamps', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    let fakeNow = 10_000;

    await registerConnectorAuthRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        nonceGenerator: () => 'state_nonce_refresh',
        now: () => fakeNow,
        env: {
            CONNECTOR_TOKEN_KEYVAULT_URI: 'https://kv-agentfarm.vault.azure.net',
        },
    });

    try {
        const init = await app.inject({
            method: 'POST',
            url: '/v1/connectors/oauth/initiate',
            payload: {
                connector_type: 'github',
                workspace_id: 'ws_1',
            },
        });
        assert.equal(init.statusCode, 201);

        const callback = await app.inject({
            method: 'GET',
            url: '/auth/connectors/callback?state=state_nonce_refresh&code=oauth_code_123',
        });
        assert.equal(callback.statusCode, 200);

        const metadataBefore = repo.metadata.get('github:tenant_1:ws_1');
        assert.ok(metadataBefore?.tokenExpiresAt instanceof Date);

        fakeNow = (metadataBefore?.tokenExpiresAt?.getTime() ?? fakeNow) - 60_000;

        const refresh = await app.inject({
            method: 'POST',
            url: '/v1/connectors/oauth/refresh',
            payload: {
                connector_type: 'github',
                workspace_id: 'ws_1',
            },
        });

        assert.equal(refresh.statusCode, 200);
        const body = refresh.json() as { status: string; token_expires_at: string };
        assert.equal(body.status, 'refreshed');
        assert.equal(typeof body.token_expires_at, 'string');

        const metadataAfter = repo.metadata.get('github:tenant_1:ws_1');
        assert.equal(metadataAfter?.status, 'connected');
        assert.ok((metadataAfter?.tokenExpiresAt?.getTime() ?? 0) > (metadataBefore?.tokenExpiresAt?.getTime() ?? 0));
    } finally {
        await app.close();
    }
});

test('refresh endpoint forces re-consent when permission state is invalid', async () => {
    const app = Fastify();
    const repo = createFakeRepo();

    await registerConnectorAuthRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        nonceGenerator: () => 'state_nonce_permission',
    });

    try {
        const init = await app.inject({
            method: 'POST',
            url: '/v1/connectors/oauth/initiate',
            payload: {
                connector_type: 'jira',
                workspace_id: 'ws_1',
            },
        });
        assert.equal(init.statusCode, 201);

        const callback = await app.inject({
            method: 'GET',
            url: '/auth/connectors/callback?state=state_nonce_permission&code=oauth_code_123',
        });
        assert.equal(callback.statusCode, 200);

        const report = await app.inject({
            method: 'POST',
            url: '/v1/connectors/oauth/report-error',
            payload: {
                connector_type: 'jira',
                workspace_id: 'ws_1',
                error_class: 'permission_invalid',
            },
        });
        assert.equal(report.statusCode, 200);

        const refresh = await app.inject({
            method: 'POST',
            url: '/v1/connectors/oauth/refresh',
            payload: {
                connector_type: 'jira',
                workspace_id: 'ws_1',
            },
        });
        assert.equal(refresh.statusCode, 409);
        const body = refresh.json() as { error: string };
        assert.equal(body.error, 'reconsent_required');

        const metadata = repo.metadata.get('jira:tenant_1:ws_1');
        assert.equal(metadata?.status, 'consent_pending');
        assert.equal(metadata?.scopeStatus, 'insufficient');
    } finally {
        await app.close();
    }
});

test('revoke endpoint clears connector auth token reference and marks revoked', async () => {
    const app = Fastify();
    const repo = createFakeRepo();

    await registerConnectorAuthRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        nonceGenerator: () => 'state_nonce_revoke',
    });

    try {
        const init = await app.inject({
            method: 'POST',
            url: '/v1/connectors/oauth/initiate',
            payload: {
                connector_type: 'teams',
                workspace_id: 'ws_1',
            },
        });
        assert.equal(init.statusCode, 201);

        const callback = await app.inject({
            method: 'GET',
            url: '/auth/connectors/callback?state=state_nonce_revoke&code=oauth_code_123',
        });
        assert.equal(callback.statusCode, 200);

        const revoke = await app.inject({
            method: 'POST',
            url: '/v1/connectors/oauth/revoke',
            payload: {
                connector_type: 'teams',
                workspace_id: 'ws_1',
            },
        });
        assert.equal(revoke.statusCode, 200);
        const body = revoke.json() as { status: string };
        assert.equal(body.status, 'revoked');

        const metadata = repo.metadata.get('teams:tenant_1:ws_1');
        assert.equal(metadata?.status, 'revoked');
        assert.equal(metadata?.secretRefId, null);
        assert.equal(metadata?.tokenExpiresAt, null);
        assert.equal(metadata?.lastRefreshAt, null);
    } finally {
        await app.close();
    }
});
