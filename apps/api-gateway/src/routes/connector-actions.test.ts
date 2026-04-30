import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {
    registerConnectorActionRoutes,
    type ConnectorActionRepo,
    type ConnectorApprovalChecker,
    type ConnectorAuditWriter,
    type ProviderExecutor,
    type SessionContext,
} from './connector-actions.js';
import { createInMemorySecretStore } from '../lib/secret-store.js';

type Metadata = {
    connectorId: string;
    tenantId: string;
    workspaceId: string;
    connectorType: string;
    status: string;
    secretRefId: string | null;
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
    lastHealthcheckAt?: Date | null;
};

type ActionLog = {
    actionId: string;
    connectorType: string;
    actionType: string;
    resultStatus: string;
    errorCode: string | null;
    contractVersion: string;
    completedAt: Date;
};

const createFakeRepo = (): ConnectorActionRepo & {
    metadata: Map<string, Metadata>;
    logs: ActionLog[];
} => {
    const metadata = new Map<string, Metadata>();
    const logs: ActionLog[] = [];

    return {
        metadata,
        logs,

        async findAuthMetadata(connectorId) {
            return metadata.get(connectorId) ?? null;
        },

        async listAuthMetadata(input) {
            const items = Array.from(metadata.values()).filter(
                (entry) =>
                    entry.tenantId === input.tenantId
                    && entry.workspaceId === input.workspaceId
                    && (!input.connectorType || entry.connectorType === input.connectorType),
            );
            return items;
        },

        async updateAuthMetadata(input) {
            metadata.set(input.connectorId, {
                connectorId: input.connectorId,
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                connectorType: input.connectorType,
                status: input.status,
                secretRefId: input.secretRefId ?? null,
                scopeStatus: input.scopeStatus ?? null,
                lastErrorClass: input.lastErrorClass ?? null,
                lastHealthcheckAt: input.lastHealthcheckAt ?? null,
            });
        },

        async createConnectorActionLog(record) {
            logs.push({
                actionId: record.actionId,
                connectorType: record.connectorType,
                actionType: record.actionType,
                resultStatus: record.resultStatus,
                errorCode: record.errorCode,
                contractVersion: record.contractVersion,
                completedAt: record.completedAt,
            });
        },
    };
};

const sessionContext = (): SessionContext => ({
    userId: 'user_1',
    tenantId: 'tenant_1',
    workspaceIds: ['ws_1'],
    expiresAt: Date.now() + 3600_000,
});

const connectors = ['jira', 'teams', 'github', 'email'] as const;
const actions = [
    'read_task',
    'create_comment',
    'update_status',
    'send_message',
    'create_pr_comment',
    'create_pr',
    'merge_pr',
    'list_prs',
    'send_email',
] as const;

const seedConnectedMetadata = (repo: ReturnType<typeof createFakeRepo>): void => {
    for (const connectorType of connectors) {
        const connectorId = `${connectorType}:tenant_1:ws_1`;
        repo.metadata.set(connectorId, {
            connectorId,
            tenantId: 'tenant_1',
            workspaceId: 'ws_1',
            connectorType,
            status: 'connected',
            secretRefId: `kv://local/secrets/${connectorType}`,
            scopeStatus: 'full',
            lastErrorClass: null,
        });
    }
};

test('executes supported actions per connector and logs success records', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        sleep: async () => { },
    });

    try {
        const supportedByConnector: Record<typeof connectors[number], readonly typeof actions[number][]> = {
            jira: ['read_task', 'create_comment', 'update_status'],
            teams: ['send_message'],
            github: ['create_pr_comment', 'create_pr', 'merge_pr', 'list_prs'],
            email: ['send_email'],
        };

        for (const connectorType of connectors) {
            for (const actionType of supportedByConnector[connectorType]) {
                const response = await app.inject({
                    method: 'POST',
                    url: '/v1/connectors/actions/execute',
                    payload: {
                        connector_type: connectorType,
                        workspace_id: 'ws_1',
                        bot_id: 'bot_1',
                        role_key: 'developer',
                        action_type: actionType,
                        payload: {
                            target: `target_${connectorType}_${actionType}`,
                        },
                    },
                });

                assert.equal(response.statusCode, 200);
                const body = response.json() as {
                    status: string;
                    connector_type: string;
                    action_type: string;
                    contract_version: string;
                };
                assert.equal(body.status, 'success');
                assert.equal(body.connector_type, connectorType);
                assert.equal(body.action_type, actionType);
                assert.equal(body.contract_version, 'v1.0');
            }
        }

        assert.equal(repo.logs.length, 9);
        for (const entry of repo.logs) {
            assert.equal(entry.resultStatus, 'success');
            assert.equal(entry.errorCode, null);
            assert.equal(entry.contractVersion, 'v1.0');
        }
    } finally {
        await app.close();
    }
});

test('retries transient connector failures with exponential backoff then succeeds', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);

    const sleepCalls: number[] = [];
    let callCount = 0;
    const providerExecutor: ProviderExecutor = async () => {
        callCount += 1;
        if (callCount <= 2) {
            return {
                ok: false,
                providerResponseCode: '503',
                resultSummary: 'Transient provider unavailable',
                transient: true,
                errorCode: 'provider_unavailable',
                errorMessage: 'temporary failure',
                remediationHint: 'retry',
            };
        }
        return {
            ok: true,
            providerResponseCode: '200',
            resultSummary: 'Recovered success',
        };
    };

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        sleep: async (ms) => {
            sleepCalls.push(ms);
        },
        providerExecutor,
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/connectors/actions/execute',
            payload: {
                connector_type: 'jira',
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                role_key: 'developer',
                action_type: 'read_task',
                payload: { target: 'ticket-1' },
            },
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as { attempts: number; status: string };
        assert.equal(body.status, 'success');
        assert.equal(body.attempts, 3);

        assert.deepEqual(sleepCalls, [50, 100]);
        assert.equal(repo.logs.length, 1);
        assert.equal(repo.logs[0]?.resultStatus, 'success');
    } finally {
        await app.close();
    }
});

test('classifies permission failures and updates connector auth for re-consent', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);

    const providerExecutor: ProviderExecutor = async () => ({
        ok: false,
        providerResponseCode: '403',
        resultSummary: 'Permission denied',
        errorCode: 'permission_denied',
        errorMessage: 'missing scope',
        remediationHint: 're-consent needed',
    });

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        sleep: async () => { },
        providerExecutor,
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/connectors/actions/execute',
            payload: {
                connector_type: 'github',
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                role_key: 'developer',
                action_type: 'create_pr_comment',
                payload: { pr: 12 },
            },
        });

        assert.equal(response.statusCode, 502);
        const body = response.json() as { status: string; error_code: string };
        assert.equal(body.status, 'failed');
        assert.equal(body.error_code, 'permission_denied');

        const metadata = repo.metadata.get('github:tenant_1:ws_1');
        assert.equal(metadata?.status, 'permission_invalid');
        assert.equal(metadata?.scopeStatus, 'insufficient');
        assert.equal(metadata?.lastErrorClass, 'insufficient_scope');

        assert.equal(repo.logs.length, 1);
        assert.equal(repo.logs[0]?.resultStatus, 'failed');
        assert.equal(repo.logs[0]?.errorCode, 'permission_denied');
    } finally {
        await app.close();
    }
});

test('classifies timeout failures consistently in response and connector action logs', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);

    const providerExecutor: ProviderExecutor = async ({ attempt }) => ({
        ok: false,
        providerResponseCode: '504',
        resultSummary: 'Provider timeout',
        transient: attempt < 3,
        errorCode: 'timeout',
        errorMessage: 'provider timeout',
        remediationHint: 'retry with backoff',
    });

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        sleep: async () => { },
        providerExecutor,
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/connectors/actions/execute',
            payload: {
                connector_type: 'jira',
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                role_key: 'developer',
                action_type: 'read_task',
                payload: { issue_key: 'PROJ-1' },
            },
        });

        assert.equal(response.statusCode, 504);
        const body = response.json() as { status: string; error_code: string; attempts: number };
        assert.equal(body.status, 'timeout');
        assert.equal(body.error_code, 'timeout');
        assert.equal(body.attempts, 3);

        assert.equal(repo.logs.length, 1);
        assert.equal(repo.logs[0]?.resultStatus, 'timeout');
        assert.equal(repo.logs[0]?.errorCode, 'timeout');
    } finally {
        await app.close();
    }
});

test('rejects unsupported action with clear validation error', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/connectors/actions/execute',
            payload: {
                connector_type: 'teams',
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                role_key: 'developer',
                action_type: 'delete_repo',
                payload: {},
            },
        });

        assert.equal(response.statusCode, 400);
        const body = response.json() as { error: string };
        assert.equal(body.error, 'unsupported_action');
        assert.equal(repo.logs.length, 0);
    } finally {
        await app.close();
    }
});

test('execute route accepts service token auth without user session', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);

    await registerConnectorActionRoutes(app, {
        getSession: () => null,
        repo,
        serviceAuthToken: 'connector-exec-shared-token',
        sleep: async () => { },
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/connectors/actions/execute',
            headers: {
                'x-connector-exec-token': 'connector-exec-shared-token',
            },
            payload: {
                tenant_id: 'tenant_1',
                connector_type: 'jira',
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                role_key: 'developer',
                action_type: 'create_comment',
                payload: {
                    target: 'issue-123',
                },
            },
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as { status: string; action_type: string };
        assert.equal(body.status, 'success');
        assert.equal(body.action_type, 'create_comment');
        assert.equal(repo.logs.length, 1);
    } finally {
        await app.close();
    }
});

test('executes custom_api send_message and records normalized connector action log', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);

    // Add custom_api connector metadata for this workspace
    repo.metadata.set('custom_api:tenant_1:ws_1', {
        connectorId: 'custom_api:tenant_1:ws_1',
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        connectorType: 'custom_api',
        status: 'connected',
        secretRefId: 'kv://local/secrets/custom_api',
        scopeStatus: 'full',
        lastErrorClass: null,
    });

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        sleep: async () => { },
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/connectors/actions/execute',
            payload: {
                connector_type: 'custom_api',
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                role_key: 'developer',
                action_type: 'send_message',
                payload: {
                    path: '/messages',
                    body: {
                        text: 'hello world',
                    },
                },
            },
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as {
            status: string;
            connector_type: string;
            action_type: string;
            contract_version: string;
        };
        assert.equal(body.status, 'success');
        assert.equal(body.connector_type, 'custom_api');
        assert.equal(body.action_type, 'send_message');
        assert.equal(body.contract_version, 'v1.0');

        const latestLog = repo.logs.at(-1);
        assert.equal(latestLog?.connectorType, 'custom_api');
        assert.equal(latestLog?.actionType, 'send_message');
        assert.equal(latestLog?.resultStatus, 'success');
    } finally {
        await app.close();
    }
});

test('health check runs for workspace connectors and updates healthy states with timestamps', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        connectorHealthProbe: async () => ({
            outcome: 'ok',
            message: 'health-ok',
        }),
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/connectors/health/check',
            payload: {
                workspace_id: 'ws_1',
            },
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as {
            totals: { connectors: number; healthy: number; remediation_required: number };
            results: Array<{ status_after: string; remediation: string }>;
        };
        assert.equal(body.totals.connectors, 4);
        assert.equal(body.totals.healthy, 4);
        assert.equal(body.totals.remediation_required, 0);
        assert.ok(body.results.every((item) => item.status_after === 'connected'));
        assert.ok(body.results.every((item) => item.remediation === 'none'));

        for (const connectorType of connectors) {
            const metadata = repo.metadata.get(`${connectorType}:tenant_1:ws_1`);
            assert.ok(metadata?.lastHealthcheckAt instanceof Date);
        }
    } finally {
        await app.close();
    }
});

test('invalid connector_type error message includes custom_api', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/connectors/actions/execute',
            payload: {
                connector_type: 'unknown_connector',
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                role_key: 'developer',
                action_type: 'read_task',
                payload: {},
            },
        });

        assert.equal(response.statusCode, 400);
        const body = response.json() as { message: string };
        assert.ok(body.message.includes('custom_api'));
    } finally {
        await app.close();
    }
});

test('health check applies remediation flows for auth failure, rate-limit, and network timeout', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);

    const probeOutcome: Record<string, 'auth_failure' | 'rate_limited' | 'network_timeout' | 'ok'> = {
        jira: 'auth_failure',
        teams: 'rate_limited',
        github: 'network_timeout',
        email: 'ok',
    };

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        connectorHealthProbe: async ({ connectorType }) => ({
            outcome: probeOutcome[connectorType] ?? 'ok',
            message: `probe-${connectorType}`,
        }),
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/connectors/health/check',
            payload: {
                workspace_id: 'ws_1',
            },
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as {
            totals: { remediation_required: number; degraded: number };
            results: Array<{ connector_type: string; status_after: string; remediation: string }>;
        };
        assert.equal(body.totals.remediation_required, 3);
        assert.equal(body.totals.degraded, 2);

        const jira = body.results.find((item) => item.connector_type === 'jira');
        const teams = body.results.find((item) => item.connector_type === 'teams');
        const github = body.results.find((item) => item.connector_type === 'github');

        assert.equal(jira?.status_after, 'permission_invalid');
        assert.equal(jira?.remediation, 're_auth');
        assert.equal(teams?.status_after, 'degraded');
        assert.equal(teams?.remediation, 'backoff');
        assert.equal(github?.status_after, 'degraded');
        assert.equal(github?.remediation, 'backoff');

        assert.equal(repo.metadata.get('jira:tenant_1:ws_1')?.lastErrorClass, 'insufficient_scope');
        assert.equal(repo.metadata.get('teams:tenant_1:ws_1')?.lastErrorClass, 'provider_rate_limited');
        assert.equal(repo.metadata.get('github:tenant_1:ws_1')?.lastErrorClass, 'provider_unavailable');
    } finally {
        await app.close();
    }
});

test('health summary endpoint surfaces connector status and remediation hints for dashboard', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);
    repo.metadata.set('jira:tenant_1:ws_1', {
        connectorId: 'jira:tenant_1:ws_1',
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        connectorType: 'jira',
        status: 'permission_invalid',
        secretRefId: 'kv://local/secrets/jira',
        scopeStatus: 'insufficient',
        lastErrorClass: 'insufficient_scope',
        lastHealthcheckAt: new Date(),
    });

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/connectors/health/summary?workspace_id=ws_1',
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as {
            connector_count: number;
            connectors: Array<{ connector_type: string; status: string; remediation: string }>;
        };
        assert.equal(body.connector_count, 4);
        const jira = body.connectors.find((item) => item.connector_type === 'jira');
        assert.equal(jira?.status, 'permission_invalid');
        assert.equal(jira?.remediation, 're_auth_or_reconsent');
    } finally {
        await app.close();
    }
});

test('rejects connector execution when role is not allowed for connector', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/connectors/actions/execute',
            payload: {
                connector_type: 'github',
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                role_key: 'recruiter',
                action_type: 'create_pr_comment',
                payload: {},
            },
        });

        assert.equal(response.statusCode, 403);
        const body = response.json() as { error: string; reason_code: string };
        assert.equal(body.error, 'role_not_allowed_for_connector');
        assert.equal(body.reason_code, 'role_not_allowed_for_connector');
        assert.equal(repo.logs.length, 0);
    } finally {
        await app.close();
    }
});

test('rejects connector execution when action is outside role connector policy', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/connectors/actions/execute',
            payload: {
                connector_type: 'github',
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                role_key: 'tester',
                action_type: 'read_task',
                payload: {},
            },
        });

        assert.equal(response.statusCode, 403);
        const body = response.json() as { error: string; reason_code: string };
        assert.equal(body.error, 'action_not_allowed_for_role');
        assert.equal(body.reason_code, 'action_not_allowed_for_role');
        assert.equal(repo.logs.length, 0);
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// PUT /v1/connectors/:connectorId/credentials
// ---------------------------------------------------------------------------

test('PUT credentials returns 200 and writes jira credentials to secret store', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);
    const store = createInMemorySecretStore({});

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        secretStore: store,
    });

    try {
        const connectorId = 'jira:tenant_1:ws_1';
        const response = await app.inject({
            method: 'PUT',
            url: `/v1/connectors/${connectorId}/credentials`,
            payload: {
                credentials: {
                    access_token: 'tok-abc',
                    base_url: 'https://acme.atlassian.net',
                },
            },
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as { connector_id: string; status: string; secret_ref_id: string };
        assert.equal(body.connector_id, connectorId);
        assert.equal(body.status, 'token_received');

        // Verify the secret was written to the store
        const stored = await store.getSecret(body.secret_ref_id);
        assert.ok(stored !== null);
        const parsed = JSON.parse(stored!) as { access_token: string; base_url: string };
        assert.equal(parsed.access_token, 'tok-abc');
        assert.equal(parsed.base_url, 'https://acme.atlassian.net');

        // Connector record status should be updated
        const metadata = await repo.findAuthMetadata(connectorId);
        assert.equal(metadata?.status, 'token_received');
        assert.equal(metadata?.secretRefId, body.secret_ref_id);
    } finally {
        await app.close();
    }
});

test('PUT credentials returns 400 when jira credentials missing base_url', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);
    const store = createInMemorySecretStore({});

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        secretStore: store,
    });

    try {
        const response = await app.inject({
            method: 'PUT',
            url: '/v1/connectors/jira:tenant_1:ws_1/credentials',
            payload: { credentials: { access_token: 'tok' } }, // missing base_url
        });

        assert.equal(response.statusCode, 400);
        const body = response.json() as { error: string; message: string };
        assert.equal(body.error, 'invalid_credentials');
        assert.ok(body.message.includes('base_url'));
    } finally {
        await app.close();
    }
});

test('PUT credentials returns 400 when credentials body is missing', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);
    const store = createInMemorySecretStore({});

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        secretStore: store,
    });

    try {
        const response = await app.inject({
            method: 'PUT',
            url: '/v1/connectors/jira:tenant_1:ws_1/credentials',
            payload: {},
        });

        assert.equal(response.statusCode, 400);
        const body = response.json() as { error: string };
        assert.equal(body.error, 'missing_credentials');
    } finally {
        await app.close();
    }
});

test('PUT credentials returns 404 when connector does not exist', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    const store = createInMemorySecretStore({});

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        secretStore: store,
    });

    try {
        const response = await app.inject({
            method: 'PUT',
            url: '/v1/connectors/jira:tenant_1:ws_nonexistent/credentials',
            payload: { credentials: { access_token: 'tok', base_url: 'https://acme.atlassian.net' } },
        });

        assert.equal(response.statusCode, 404);
        const body = response.json() as { error: string };
        assert.equal(body.error, 'connector_not_found');
    } finally {
        await app.close();
    }
});

test('PUT credentials returns 401 when no session', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);
    const store = createInMemorySecretStore({});

    await registerConnectorActionRoutes(app, {
        getSession: () => null,
        repo,
        secretStore: store,
    });

    try {
        const response = await app.inject({
            method: 'PUT',
            url: '/v1/connectors/jira:tenant_1:ws_1/credentials',
            payload: { credentials: { access_token: 'tok', base_url: 'https://acme.atlassian.net' } },
        });

        assert.equal(response.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('PUT credentials returns 503 when no secret store configured', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        // no secretStore
    });

    try {
        const response = await app.inject({
            method: 'PUT',
            url: '/v1/connectors/jira:tenant_1:ws_1/credentials',
            payload: { credentials: { access_token: 'tok', base_url: 'https://acme.atlassian.net' } },
        });

        assert.equal(response.statusCode, 503);
        const body = response.json() as { error: string };
        assert.equal(body.error, 'secret_store_unavailable');
    } finally {
        await app.close();
    }
});

test('PUT credentials validates sendgrid email credentials correctly', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);
    const store = createInMemorySecretStore({});

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        secretStore: store,
    });

    try {
        const connectorId = 'email:tenant_1:ws_1';
        const response = await app.inject({
            method: 'PUT',
            url: `/v1/connectors/${connectorId}/credentials`,
            payload: {
                credentials: {
                    type: 'sendgrid',
                    api_key: 'SG.test-key',
                    from_address: 'bot@acme.com',
                },
            },
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as { connector_id: string; status: string };
        assert.equal(body.status, 'token_received');
    } finally {
        await app.close();
    }
});

test('PUT credentials returns 400 when email type is missing', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);
    const store = createInMemorySecretStore({});

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        secretStore: store,
    });

    try {
        const response = await app.inject({
            method: 'PUT',
            url: '/v1/connectors/email:tenant_1:ws_1/credentials',
            payload: { credentials: { api_key: 'SG.key', from_address: 'bot@a.com' } }, // missing type
        });

        assert.equal(response.statusCode, 400);
        const body = response.json() as { error: string; message: string };
        assert.equal(body.error, 'invalid_credentials');
        assert.ok(body.message.includes('type'));
        test('PUT credentials returns 400 when email type is missing', async () => {
            const app = Fastify();
            const repo = createFakeRepo();
            seedConnectedMetadata(repo);
            const store = createInMemorySecretStore({});

            await registerConnectorActionRoutes(app, {
                getSession: () => sessionContext(),
                repo,
                secretStore: store,
            });

            try {
                const response = await app.inject({
                    method: 'PUT',
                    url: '/v1/connectors/email:tenant_1:ws_1/credentials',
                    payload: { credentials: { api_key: 'SG.key', from_address: 'bot@a.com' } }, // missing type
                });

                assert.equal(response.statusCode, 400);
                const body = response.json() as { error: string; message: string };
                assert.equal(body.error, 'invalid_credentials');
                assert.ok(body.message.includes('type'));
            } finally {
                await app.close();
            }
        });

        const createFakeApprovalChecker = (): ConnectorApprovalChecker & {
            approvals: Map<string, { decision: string }>;
        } => {
            const approvals = new Map<string, { decision: string }>();
            return {
                approvals,
                async findByAction(input) {
                    return approvals.get(`${input.tenantId}:${input.workspaceId}:${input.actionId}`) ?? null;
                },
            };
        };

        const createFakeAuditWriter = (): ConnectorAuditWriter & {
            events: Array<{ eventType: string; severity: string; summary: string }>;
        } => {
            const events: Array<{ eventType: string; severity: string; summary: string }> = [];
            return {
                events,
                async createEvent(input) {
                    events.push({ eventType: input.eventType, severity: input.severity, summary: input.summary });
                },
            };
        };

        test('blocks high-risk action when no approval_action_id provided', async () => {
            const app = Fastify();
            const repo = createFakeRepo();
            seedConnectedMetadata(repo);
            const approvalChecker = createFakeApprovalChecker();

            await registerConnectorActionRoutes(app, {
                getSession: () => sessionContext(),
                repo,
                sleep: async () => { },
                approvalChecker,
            });

            try {
                const response = await app.inject({
                    method: 'POST',
                    url: '/v1/connectors/actions/execute',
                    payload: {
                        connector_type: 'github',
                        workspace_id: 'ws_1',
                        bot_id: 'bot_1',
                        role_key: 'developer',
                        action_type: 'merge_pr',
                        payload: { pr_number: 42 },
                        // no approval_action_id provided
                    },
                });

                assert.equal(response.statusCode, 403);
                const body = response.json() as { error: string; reason_code: string; risk_level: string };
                assert.equal(body.error, 'action_awaiting_approval');
                assert.equal(body.reason_code, 'approval_required');
                assert.equal(body.risk_level, 'high');
                assert.equal(repo.logs.length, 0, 'no action log should be written for blocked action');
            } finally {
                await app.close();
            }
        });

        test('blocks medium-risk action when no approval_action_id provided', async () => {
            const app = Fastify();
            const repo = createFakeRepo();
            seedConnectedMetadata(repo);
            const approvalChecker = createFakeApprovalChecker();

            await registerConnectorActionRoutes(app, {
                getSession: () => sessionContext(),
                repo,
                sleep: async () => { },
                approvalChecker,
            });

            try {
                const response = await app.inject({
                    method: 'POST',
                    url: '/v1/connectors/actions/execute',
                    payload: {
                        connector_type: 'jira',
                        workspace_id: 'ws_1',
                        bot_id: 'bot_1',
                        role_key: 'developer',
                        action_type: 'update_status',
                        payload: { issue_id: 'JIRA-1', status: 'done' },
                    },
                });

                assert.equal(response.statusCode, 403);
                const body = response.json() as { error: string; reason_code: string; risk_level: string };
                assert.equal(body.error, 'action_awaiting_approval');
                assert.equal(body.reason_code, 'approval_required');
                assert.equal(body.risk_level, 'medium');
            } finally {
                await app.close();
            }
        });

        test('blocks risky action when approval record not found', async () => {
            const app = Fastify();
            const repo = createFakeRepo();
            seedConnectedMetadata(repo);
            const approvalChecker = createFakeApprovalChecker();
            // no approval seeded

            await registerConnectorActionRoutes(app, {
                getSession: () => sessionContext(),
                repo,
                sleep: async () => { },
                approvalChecker,
            });

            try {
                const response = await app.inject({
                    method: 'POST',
                    url: '/v1/connectors/actions/execute',
                    payload: {
                        connector_type: 'github',
                        workspace_id: 'ws_1',
                        bot_id: 'bot_1',
                        role_key: 'developer',
                        action_type: 'create_pr',
                        payload: {},
                        approval_action_id: 'act_nonexistent',
                    },
                });

                assert.equal(response.statusCode, 403);
                const body = response.json() as { error: string; reason_code: string };
                assert.equal(body.error, 'action_awaiting_approval');
                assert.equal(body.reason_code, 'approval_not_found');
            } finally {
                await app.close();
            }
        });

        test('blocks risky action when approval decision is pending (not approved)', async () => {
            const app = Fastify();
            const repo = createFakeRepo();
            seedConnectedMetadata(repo);
            const approvalChecker = createFakeApprovalChecker();
            approvalChecker.approvals.set('tenant_1:ws_1:act_pending_1', { decision: 'pending' });

            await registerConnectorActionRoutes(app, {
                getSession: () => sessionContext(),
                repo,
                sleep: async () => { },
                approvalChecker,
            });

            try {
                const response = await app.inject({
                    method: 'POST',
                    url: '/v1/connectors/actions/execute',
                    payload: {
                        connector_type: 'github',
                        workspace_id: 'ws_1',
                        bot_id: 'bot_1',
                        role_key: 'developer',
                        action_type: 'merge_pr',
                        payload: { pr_number: 1 },
                        approval_action_id: 'act_pending_1',
                    },
                });

                assert.equal(response.statusCode, 403);
                const body = response.json() as { error: string; reason_code: string; approval_decision: string };
                assert.equal(body.error, 'action_awaiting_approval');
                assert.equal(body.reason_code, 'approval_not_granted');
                assert.equal(body.approval_decision, 'pending');
            } finally {
                await app.close();
            }
        });

        test('blocks risky action when approval is rejected', async () => {
            const app = Fastify();
            const repo = createFakeRepo();
            seedConnectedMetadata(repo);
            const approvalChecker = createFakeApprovalChecker();
            approvalChecker.approvals.set('tenant_1:ws_1:act_rejected_1', { decision: 'rejected' });

            await registerConnectorActionRoutes(app, {
                getSession: () => sessionContext(),
                repo,
                sleep: async () => { },
                approvalChecker,
            });

            try {
                const response = await app.inject({
                    method: 'POST',
                    url: '/v1/connectors/actions/execute',
                    payload: {
                        connector_type: 'github',
                        workspace_id: 'ws_1',
                        bot_id: 'bot_1',
                        role_key: 'developer',
                        action_type: 'merge_pr',
                        payload: { pr_number: 5 },
                        approval_action_id: 'act_rejected_1',
                    },
                });

                assert.equal(response.statusCode, 403);
                const body = response.json() as { error: string; reason_code: string; approval_decision: string };
                assert.equal(body.error, 'action_awaiting_approval');
                assert.equal(body.reason_code, 'approval_not_granted');
                assert.equal(body.approval_decision, 'rejected');
            } finally {
                await app.close();
            }
        });

        test('executes high-risk action when approval is approved and writes audit event', async () => {
            const app = Fastify();
            const repo = createFakeRepo();
            seedConnectedMetadata(repo);
            const approvalChecker = createFakeApprovalChecker();
            approvalChecker.approvals.set('tenant_1:ws_1:act_approved_1', { decision: 'approved' });
            const auditWriter = createFakeAuditWriter();

            await registerConnectorActionRoutes(app, {
                getSession: () => sessionContext(),
                repo,
                sleep: async () => { },
                approvalChecker,
                auditWriter,
            });

            try {
                const response = await app.inject({
                    method: 'POST',
                    url: '/v1/connectors/actions/execute',
                    payload: {
                        connector_type: 'github',
                        workspace_id: 'ws_1',
                        bot_id: 'bot_1',
                        role_key: 'developer',
                        action_type: 'merge_pr',
                        payload: { pr_number: 7 },
                        approval_action_id: 'act_approved_1',
                    },
                });

                assert.equal(response.statusCode, 200);
                const body = response.json() as { status: string; action_type: string };
                assert.equal(body.status, 'success');
                assert.equal(body.action_type, 'merge_pr');

                assert.equal(repo.logs.length, 1);
                assert.equal(repo.logs[0]!.resultStatus, 'success');

                assert.equal(auditWriter.events.length, 1);
                assert.equal(auditWriter.events[0]!.eventType, 'connector_action.executed');
                assert.equal(auditWriter.events[0]!.severity, 'info');
                assert.ok(auditWriter.events[0]!.summary.includes('merge_pr'));
            } finally {
                await app.close();
            }
        });

        test('low-risk action executes without approval requirement and writes audit event on success', async () => {
            const app = Fastify();
            const repo = createFakeRepo();
            seedConnectedMetadata(repo);
            const approvalChecker = createFakeApprovalChecker();
            const auditWriter = createFakeAuditWriter();

            await registerConnectorActionRoutes(app, {
                getSession: () => sessionContext(),
                repo,
                sleep: async () => { },
                approvalChecker,
                auditWriter,
            });

            try {
                const response = await app.inject({
                    method: 'POST',
                    url: '/v1/connectors/actions/execute',
                    payload: {
                        connector_type: 'jira',
                        workspace_id: 'ws_1',
                        bot_id: 'bot_1',
                        role_key: 'developer',
                        action_type: 'read_task',
                        payload: { issue_id: 'JIRA-42' },
                        // no approval_action_id needed for low-risk
                    },
                });

                assert.equal(response.statusCode, 200);
                const body = response.json() as { status: string };
                assert.equal(body.status, 'success');

                assert.equal(auditWriter.events.length, 1);
                assert.equal(auditWriter.events[0]!.eventType, 'connector_action.executed');
            } finally {
                await app.close();
            }
        });

        test('writes audit event with error severity on connector action failure', async () => {
            const app = Fastify();
            const repo = createFakeRepo();
            seedConnectedMetadata(repo);
            const approvalChecker = createFakeApprovalChecker();
            approvalChecker.approvals.set('tenant_1:ws_1:act_approved_fail', { decision: 'approved' });
            const auditWriter = createFakeAuditWriter();

            const failingExecutor: ProviderExecutor = async () => ({
                ok: false,
                providerResponseCode: '403',
                resultSummary: 'Permission denied.',
                errorCode: 'permission_denied',
                errorMessage: 'Connector permission does not allow this action.',
                remediationHint: 'Re-consent connector scopes in settings.',
            });

            await registerConnectorActionRoutes(app, {
                getSession: () => sessionContext(),
                repo,
                sleep: async () => { },
                providerExecutor: failingExecutor,
                approvalChecker,
                auditWriter,
            });

            try {
                const response = await app.inject({
                    method: 'POST',
                    url: '/v1/connectors/actions/execute',
                    payload: {
                        connector_type: 'github',
                        workspace_id: 'ws_1',
                        bot_id: 'bot_1',
                        role_key: 'developer',
                        action_type: 'merge_pr',
                        payload: {},
                        approval_action_id: 'act_approved_fail',
                    },
                });

                assert.equal(response.statusCode, 502);

                assert.equal(auditWriter.events.length, 1);
                assert.equal(auditWriter.events[0]!.eventType, 'connector_action.failed');
                assert.equal(auditWriter.events[0]!.severity, 'error');
                assert.ok(auditWriter.events[0]!.summary.includes('merge_pr'));
            } finally {
                await app.close();
            }
        });
    } finally {
        await app.close();
    }
});

test('PUT credentials respects explicit secret_ref_id override', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);
    const store = createInMemorySecretStore({});

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        secretStore: store,
    });

    try {
        const override = 'env://MY_GITHUB_CREDS';
        const response = await app.inject({
            method: 'PUT',
            url: '/v1/connectors/github:tenant_1:ws_1/credentials',
            payload: {
                credentials: { access_token: 'gh-tok' },
                secret_ref_id: override,
            },
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as { secret_ref_id: string };
        assert.equal(body.secret_ref_id, override);
    } finally {
        await app.close();
    }
});
