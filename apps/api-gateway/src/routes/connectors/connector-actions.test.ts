// Enable the opt-in connector simulator for tests that don't inject their own executor
// or a secret store. Production fails closed by default (see connector-actions.ts).
process.env['AF_CONNECTOR_SIMULATE'] = '1';

import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {
    registerConnectorActionRoutes,
    failClosedProviderExecutor,
    type ConnectorActionRepo,
    type ConnectorApprovalChecker,
    type ConnectorAuditWriter,
    type ProviderExecutor,
    type SessionContext,
    type ActionLogRow,
} from './connector-actions.js';
import { createInMemorySecretStore } from '../../lib/secret-store.js';
import { createRealProviderExecutor, createRealConnectorHealthProbe } from '../../lib/provider-clients.js';

type Metadata = {
    connectorId: string;
    tenantId: string;
    workspaceId: string;
    connectorType: string;
    displayName?: string | null;
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
    id: string;
    actionId: string;
    tenantId: string;
    connectorId: string;
    connectorType: string;
    actionType: string;
    resultStatus: string;
    resultSummary: string;
    errorCode: string | null;
    errorMessage: string | null;
    remediationHint: string | null;
    contractVersion: string;
    completedAt: Date;
    createdAt: Date;
};

const createFakeRepo = (): ConnectorActionRepo & {
    metadata: Map<string, Metadata>;
    logs: ActionLog[];
} => {
    const metadata = new Map<string, Metadata>();
    const logs: ActionLog[] = [];
    const openapiCatalogs = new Map<string, unknown>();

    return {
        metadata,
        logs,

        async findAuthMetadata(connectorId) {
            return metadata.get(connectorId) ?? null;
        },

        async upsertAuthMetadata(input) {
            const existing = metadata.get(input.connectorId);
            if (!existing) {
                const record: Metadata = {
                    connectorId: input.connectorId,
                    tenantId: input.tenantId,
                    workspaceId: input.workspaceId,
                    connectorType: input.connectorType,
                    displayName: input.displayName ?? null,
                    status: input.status,
                    secretRefId: null,
                    scopeStatus: null,
                    lastErrorClass: null,
                };
                metadata.set(input.connectorId, record);
                return record;
            }
            return existing;
        },

        async renameConnector(input) {
            const existing = metadata.get(input.connectorId);
            if (existing) existing.displayName = input.displayName;
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
                id: `log_${logs.length + 1}`,
                actionId: record.actionId,
                tenantId: record.tenantId,
                connectorId: record.connectorId,
                connectorType: record.connectorType,
                actionType: record.actionType,
                resultStatus: record.resultStatus,
                resultSummary: record.resultSummary,
                errorCode: record.errorCode,
                errorMessage: record.errorMessage,
                remediationHint: record.remediationHint,
                contractVersion: record.contractVersion,
                completedAt: record.completedAt,
                createdAt: record.completedAt,
            });
        },
        async listConnectorActions(input): Promise<ActionLogRow[]> {
            return logs
                .filter(
                    (entry) =>
                        entry.tenantId === input.tenantId
                        && entry.connectorId === input.connectorId
                        && (!input.cursor || entry.createdAt < input.cursor),
                )
                .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                .slice(0, input.limit)
                .map((entry) => ({
                    id: entry.id,
                    actionId: entry.actionId,
                    connectorId: entry.connectorId,
                    connectorType: entry.connectorType,
                    actionType: entry.actionType,
                    resultStatus: entry.resultStatus,
                    resultSummary: entry.resultSummary,
                    errorCode: entry.errorCode,
                    errorMessage: entry.errorMessage,
                    remediationHint: entry.remediationHint,
                    completedAt: entry.completedAt,
                    createdAt: entry.createdAt,
                }));
        },
        async setOpenapiCatalog(input) {
            openapiCatalogs.set(input.connectorId, input.catalog);
        },
        async listOpenapiCatalogs(input) {
            const out: Array<{ connectorId: string; displayName: string | null; catalog: unknown }> = [];
            for (const [connectorId, catalog] of openapiCatalogs.entries()) {
                const meta = metadata.get(connectorId);
                if (meta && meta.tenantId === input.tenantId && meta.connectorType === 'custom_api') {
                    out.push({ connectorId, displayName: meta.displayName ?? null, catalog });
                }
            }
            return out;
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

test('PUT credentials with malformed connectorId returns 404', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    const store = createInMemorySecretStore({});

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        secretStore: store,
    });

    try {
        // Two-segment id can't be auto-registered (needs type:tenant:workspace).
        const response = await app.inject({
            method: 'PUT',
            url: '/v1/connectors/jira:tenant_1/credentials',
            payload: { credentials: { access_token: 'tok', base_url: 'https://acme.atlassian.net' } },
        });

        assert.equal(response.statusCode, 404);
        const body = response.json() as { error: string };
        assert.equal(body.error, 'connector_not_found');
    } finally {
        await app.close();
    }
});

test('PUT credentials to a workspace outside session scope returns 403', async () => {
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

        assert.equal(response.statusCode, 403);
        const body = response.json() as { error: string };
        assert.equal(body.error, 'workspace_scope_violation');
    } finally {
        await app.close();
    }
});

test('PATCH connector renames its display name', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    const store = createInMemorySecretStore({});
    repo.metadata.set('custom_api:tenant_1:ws_1:acme-123', {
        connectorId: 'custom_api:tenant_1:ws_1:acme-123',
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        connectorType: 'custom_api',
        displayName: 'Old Name',
        status: 'connected',
        secretRefId: 'ref',
        scopeStatus: null,
        lastErrorClass: null,
    });

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        secretStore: store,
    });

    try {
        const response = await app.inject({
            method: 'PATCH',
            url: '/v1/connectors/custom_api:tenant_1:ws_1:acme-123',
            payload: { display_name: 'New Name' },
        });

        assert.equal(response.statusCode, 200);
        assert.equal(repo.metadata.get('custom_api:tenant_1:ws_1:acme-123')?.displayName, 'New Name');
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
                assert.equal(auditWriter.events[0]!.eventType, 'connector_action_executed');
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
                assert.equal(auditWriter.events[0]!.eventType, 'connector_action_executed');
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
                assert.equal(auditWriter.events[0]!.eventType, 'connector_action_failed');
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

// ---------------------------------------------------------------------------
// GET /v1/connectors/:connectorId/actions
// ---------------------------------------------------------------------------

test('GET connector actions — returns 401 when no session', async () => {
    const app = Fastify();
    const repo = createFakeRepo();

    await registerConnectorActionRoutes(app, {
        getSession: () => null,
        repo,
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/connectors/jira:tenant_1:ws_1/actions',
        });
        assert.equal(response.statusCode, 401);
        const body = response.json() as { error: string };
        assert.equal(body.error, 'unauthorized');
    } finally {
        await app.close();
    }
});

test('GET connector actions — returns empty array when no actions exist', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/connectors/jira:tenant_1:ws_1/actions',
        });
        assert.equal(response.statusCode, 200);
        const body = response.json() as { actions: unknown[]; hasMore: boolean };
        assert.deepEqual(body.actions, []);
        assert.equal(body.hasMore, false);
    } finally {
        await app.close();
    }
});

test('GET connector actions — returns only actions for the specified connectorId', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);

    const now = new Date();
    await repo.createConnectorActionLog({
        actionId: 'act_jira_1',
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        botId: 'bot_1',
        connectorId: 'jira:tenant_1:ws_1',
        connectorType: 'jira',
        actionType: 'read_task',
        contractVersion: 'v1.0',
        correlationId: 'corr_1',
        requestBody: {},
        resultStatus: 'success',
        providerResponseCode: '200',
        resultSummary: 'ok',
        errorCode: null,
        errorMessage: null,
        remediationHint: null,
        completedAt: now,
    });
    await repo.createConnectorActionLog({
        actionId: 'act_github_1',
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        botId: 'bot_1',
        connectorId: 'github:tenant_1:ws_1',
        connectorType: 'github',
        actionType: 'create_pr_comment',
        contractVersion: 'v1.0',
        correlationId: 'corr_2',
        requestBody: {},
        resultStatus: 'success',
        providerResponseCode: '200',
        resultSummary: 'ok',
        errorCode: null,
        errorMessage: null,
        remediationHint: null,
        completedAt: now,
    });

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/connectors/jira:tenant_1:ws_1/actions',
        });
        assert.equal(response.statusCode, 200);
        const body = response.json() as { actions: Array<{ connectorId: string; actionId: string }> };
        assert.equal(body.actions.length, 1);
        assert.equal(body.actions[0]?.connectorId, 'jira:tenant_1:ws_1');
        assert.equal(body.actions[0]?.actionId, 'act_jira_1');
    } finally {
        await app.close();
    }
});

test('GET connector actions — never returns actions from other tenants', async () => {
    const app = Fastify();
    const repo = createFakeRepo();

    const now = new Date();
    // Seed action for a different tenant with the same connectorId pattern
    await repo.createConnectorActionLog({
        actionId: 'act_other_tenant',
        tenantId: 'tenant_other',
        workspaceId: 'ws_other',
        botId: 'bot_other',
        connectorId: 'jira:tenant_1:ws_1',
        connectorType: 'jira',
        actionType: 'read_task',
        contractVersion: 'v1.0',
        correlationId: 'corr_x',
        requestBody: {},
        resultStatus: 'success',
        providerResponseCode: '200',
        resultSummary: 'ok',
        errorCode: null,
        errorMessage: null,
        remediationHint: null,
        completedAt: now,
    });

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(), // returns tenantId: 'tenant_1'
        repo,
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/connectors/jira:tenant_1:ws_1/actions',
        });
        assert.equal(response.statusCode, 200);
        const body = response.json() as { actions: unknown[] };
        // Fake repo filters by tenantId — the other-tenant record has tenantId 'tenant_other'
        // so it must not appear for 'tenant_1' session
        assert.equal(body.actions.length, 0);
    } finally {
        await app.close();
    }
});

test('GET connector actions — returns hasMore true when results hit the limit', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);

    const baseTime = new Date('2026-01-01T00:00:00Z');
    // Seed 3 actions for a limit=2 request
    for (let i = 0; i < 3; i++) {
        await repo.createConnectorActionLog({
            actionId: `act_${i}`,
            tenantId: 'tenant_1',
            workspaceId: 'ws_1',
            botId: 'bot_1',
            connectorId: 'jira:tenant_1:ws_1',
            connectorType: 'jira',
            actionType: 'read_task',
            contractVersion: 'v1.0',
            correlationId: `corr_${i}`,
            requestBody: {},
            resultStatus: 'success',
            providerResponseCode: '200',
            resultSummary: 'ok',
            errorCode: null,
            errorMessage: null,
            remediationHint: null,
            completedAt: new Date(baseTime.getTime() + i * 1000),
        });
    }

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/connectors/jira:tenant_1:ws_1/actions?limit=2',
        });
        assert.equal(response.statusCode, 200);
        const body = response.json() as { actions: unknown[]; hasMore: boolean; nextCursor: string };
        assert.equal(body.actions.length, 2);
        assert.equal(body.hasMore, true);
        assert.ok(body.nextCursor, 'nextCursor should be set');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// Helpers for custom_api tests
// ---------------------------------------------------------------------------

const seedCustomApiMetadata = (repo: ReturnType<typeof createFakeRepo>): void => {
    repo.metadata.set('custom_api:tenant_1:ws_1', {
        connectorId: 'custom_api:tenant_1:ws_1',
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        connectorType: 'custom_api',
        status: 'not_configured',
        secretRefId: null,
        scopeStatus: null,
        lastErrorClass: null,
    });
};

const makeMockFetcher = () =>
    async () => new Response(JSON.stringify({ ok: true }), { status: 200 }) as Response;

// ---------------------------------------------------------------------------
// Custom REST API — PUT /v1/connectors/:connectorId/credentials
// ---------------------------------------------------------------------------

test('PUT credentials validates custom_api bearer_token credentials and stores them', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedCustomApiMetadata(repo);
    const store = createInMemorySecretStore({});

    await registerConnectorActionRoutes(app, { getSession: () => sessionContext(), repo, secretStore: store });

    try {
        const connectorId = 'custom_api:tenant_1:ws_1';
        const res = await app.inject({
            method: 'PUT',
            url: `/v1/connectors/${connectorId}/credentials`,
            payload: {
                credentials: {
                    base_url: 'https://api.example.com',
                    auth_type: 'bearer_token',
                    bearer_token: 'tok-abc',
                },
            },
        });

        assert.equal(res.statusCode, 200);
        const body = res.json() as { status: string; secret_ref_id: string };
        assert.equal(body.status, 'token_received');

        const stored = await store.getSecret(body.secret_ref_id);
        assert.ok(stored !== null);
        const creds = JSON.parse(stored!) as { base_url: string; bearer_token: string };
        assert.equal(creds.base_url, 'https://api.example.com');
        assert.equal(creds.bearer_token, 'tok-abc');

        const metadata = await repo.findAuthMetadata(connectorId);
        assert.equal(metadata?.status, 'token_received');
        assert.equal(metadata?.secretRefId, body.secret_ref_id);
    } finally {
        await app.close();
    }
});

test('PUT credentials validates custom_api api_key credentials correctly', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedCustomApiMetadata(repo);
    const store = createInMemorySecretStore({});

    await registerConnectorActionRoutes(app, { getSession: () => sessionContext(), repo, secretStore: store });

    try {
        const res = await app.inject({
            method: 'PUT',
            url: '/v1/connectors/custom_api:tenant_1:ws_1/credentials',
            payload: {
                credentials: {
                    base_url: 'https://api.example.com',
                    auth_type: 'api_key',
                    api_key: 'my-api-key-123',
                    api_key_header: 'X-Custom-Key',
                },
            },
        });

        assert.equal(res.statusCode, 200);
        const body = res.json() as { status: string };
        assert.equal(body.status, 'token_received');
    } finally {
        await app.close();
    }
});

test('PUT credentials validates custom_api basic_auth credentials correctly', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedCustomApiMetadata(repo);
    const store = createInMemorySecretStore({});

    await registerConnectorActionRoutes(app, { getSession: () => sessionContext(), repo, secretStore: store });

    try {
        const res = await app.inject({
            method: 'PUT',
            url: '/v1/connectors/custom_api:tenant_1:ws_1/credentials',
            payload: {
                credentials: {
                    base_url: 'https://api.example.com',
                    auth_type: 'basic_auth',
                    basic_user: 'admin',
                    basic_pass: 'secret',
                },
            },
        });

        assert.equal(res.statusCode, 200);
        const body = res.json() as { status: string };
        assert.equal(body.status, 'token_received');
    } finally {
        await app.close();
    }
});

test('PUT credentials accepts custom_api with auth_type none (no credentials required)', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedCustomApiMetadata(repo);
    const store = createInMemorySecretStore({});

    await registerConnectorActionRoutes(app, { getSession: () => sessionContext(), repo, secretStore: store });

    try {
        const res = await app.inject({
            method: 'PUT',
            url: '/v1/connectors/custom_api:tenant_1:ws_1/credentials',
            payload: {
                credentials: {
                    base_url: 'https://public.api.example.com',
                    auth_type: 'none',
                },
            },
        });

        assert.equal(res.statusCode, 200);
        const body = res.json() as { status: string };
        assert.equal(body.status, 'token_received');
    } finally {
        await app.close();
    }
});

test('PUT credentials returns 400 when custom_api missing base_url', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedCustomApiMetadata(repo);
    const store = createInMemorySecretStore({});

    await registerConnectorActionRoutes(app, { getSession: () => sessionContext(), repo, secretStore: store });

    try {
        const res = await app.inject({
            method: 'PUT',
            url: '/v1/connectors/custom_api:tenant_1:ws_1/credentials',
            payload: { credentials: { auth_type: 'bearer_token', bearer_token: 'tok' } },
        });

        assert.equal(res.statusCode, 400);
        const body = res.json() as { error: string; message: string };
        assert.equal(body.error, 'invalid_credentials');
        assert.ok(body.message.includes('base_url'));
    } finally {
        await app.close();
    }
});

test('PUT credentials returns 400 when custom_api bearer_token auth_type is missing its token', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedCustomApiMetadata(repo);
    const store = createInMemorySecretStore({});

    await registerConnectorActionRoutes(app, { getSession: () => sessionContext(), repo, secretStore: store });

    try {
        const res = await app.inject({
            method: 'PUT',
            url: '/v1/connectors/custom_api:tenant_1:ws_1/credentials',
            payload: {
                credentials: { base_url: 'https://api.example.com', auth_type: 'bearer_token' },
            },
        });

        assert.equal(res.statusCode, 400);
        const body = res.json() as { error: string; message: string };
        assert.equal(body.error, 'invalid_credentials');
        assert.ok(body.message.includes('bearer_token'));
    } finally {
        await app.close();
    }
});

test('PUT credentials returns 400 when custom_api api_key auth_type is missing its key', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedCustomApiMetadata(repo);
    const store = createInMemorySecretStore({});

    await registerConnectorActionRoutes(app, { getSession: () => sessionContext(), repo, secretStore: store });

    try {
        const res = await app.inject({
            method: 'PUT',
            url: '/v1/connectors/custom_api:tenant_1:ws_1/credentials',
            payload: {
                credentials: { base_url: 'https://api.example.com', auth_type: 'api_key' },
            },
        });

        assert.equal(res.statusCode, 400);
        const body = res.json() as { error: string; message: string };
        assert.equal(body.error, 'invalid_credentials');
        assert.ok(body.message.includes('api_key'));
    } finally {
        await app.close();
    }
});

test('PUT credentials returns 400 when custom_api basic_auth is missing basic_user', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedCustomApiMetadata(repo);
    const store = createInMemorySecretStore({});

    await registerConnectorActionRoutes(app, { getSession: () => sessionContext(), repo, secretStore: store });

    try {
        const res = await app.inject({
            method: 'PUT',
            url: '/v1/connectors/custom_api:tenant_1:ws_1/credentials',
            payload: {
                credentials: {
                    base_url: 'https://api.example.com',
                    auth_type: 'basic_auth',
                    basic_pass: 'secret',
                },
            },
        });

        assert.equal(res.statusCode, 400);
        const body = res.json() as { error: string; message: string };
        assert.equal(body.error, 'invalid_credentials');
        assert.ok(body.message.includes('basic_user'));
    } finally {
        await app.close();
    }
});

test('PUT credentials returns 400 when custom_api basic_auth is missing basic_pass', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedCustomApiMetadata(repo);
    const store = createInMemorySecretStore({});

    await registerConnectorActionRoutes(app, { getSession: () => sessionContext(), repo, secretStore: store });

    try {
        const res = await app.inject({
            method: 'PUT',
            url: '/v1/connectors/custom_api:tenant_1:ws_1/credentials',
            payload: {
                credentials: {
                    base_url: 'https://api.example.com',
                    auth_type: 'basic_auth',
                    basic_user: 'admin',
                },
            },
        });

        assert.equal(res.statusCode, 400);
        const body = res.json() as { error: string; message: string };
        assert.equal(body.error, 'invalid_credentials');
        assert.ok(body.message.includes('basic_pass'));
    } finally {
        await app.close();
    }
});

test('PUT credentials returns 400 when custom_api auth_type is an invalid value', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedCustomApiMetadata(repo);
    const store = createInMemorySecretStore({});

    await registerConnectorActionRoutes(app, { getSession: () => sessionContext(), repo, secretStore: store });

    try {
        const res = await app.inject({
            method: 'PUT',
            url: '/v1/connectors/custom_api:tenant_1:ws_1/credentials',
            payload: {
                credentials: {
                    base_url: 'https://api.example.com',
                    auth_type: 'oauth2',
                },
            },
        });

        assert.equal(res.statusCode, 400);
        const body = res.json() as { error: string; message: string };
        assert.equal(body.error, 'invalid_credentials');
        assert.ok(body.message.includes('auth_type'));
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// Custom REST API — Full end-to-end: add → health check → execute → log
// ---------------------------------------------------------------------------

test('custom_api e2e: PUT bearer_token credentials → health probe → execute read_task via GET → action log populated', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    const store = createInMemorySecretStore({});

    const connectorId = 'custom_api:tenant_1:ws_1';
    repo.metadata.set(connectorId, {
        connectorId,
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        connectorType: 'custom_api',
        status: 'not_configured',
        secretRefId: null,
        scopeStatus: null,
        lastErrorClass: null,
    });

    const mockFetcher = makeMockFetcher();
    const providerExecutor = createRealProviderExecutor(store, mockFetcher as typeof fetch);
    const connectorHealthProbe = createRealConnectorHealthProbe(store, mockFetcher as typeof fetch);

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        secretStore: store,
        providerExecutor,
        connectorHealthProbe,
        sleep: async () => {},
    });

    try {
        // Step 1: Add credentials via PUT
        const putRes = await app.inject({
            method: 'PUT',
            url: `/v1/connectors/${connectorId}/credentials`,
            payload: {
                credentials: {
                    base_url: 'https://api.example.com',
                    auth_type: 'bearer_token',
                    bearer_token: 'tok-e2e-xyz',
                },
            },
        });
        assert.equal(putRes.statusCode, 200);
        const putBody = putRes.json() as { status: string };
        assert.equal(putBody.status, 'token_received');

        // Verify connector status updated in metadata
        assert.equal((await repo.findAuthMetadata(connectorId))?.status, 'token_received');

        // Step 2: Health probe — mock fetcher returns 200, so connector should become connected
        const healthRes = await app.inject({
            method: 'POST',
            url: '/v1/connectors/health/check',
            payload: { workspace_id: 'ws_1' },
        });
        assert.equal(healthRes.statusCode, 200);
        const healthBody = healthRes.json() as {
            totals: { healthy: number };
            results: Array<{ probe_outcome: string; status_after: string }>;
        };
        assert.equal(healthBody.totals.healthy, 1);
        assert.equal(healthBody.results[0]?.probe_outcome, 'ok');
        assert.equal(healthBody.results[0]?.status_after, 'connected');
        assert.equal((await repo.findAuthMetadata(connectorId))?.status, 'connected');

        // Step 3: Execute a low-risk action (no approval required)
        const execRes = await app.inject({
            method: 'POST',
            url: '/v1/connectors/actions/execute',
            payload: {
                connector_type: 'custom_api',
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                role_key: 'developer',
                action_type: 'read_task',
                payload: { method: 'GET', path: '/tasks/99' },
            },
        });
        assert.equal(execRes.statusCode, 200);
        const execBody = execRes.json() as { status: string; attempts: number; connector_type: string };
        assert.equal(execBody.status, 'success');
        assert.equal(execBody.connector_type, 'custom_api');
        assert.equal(execBody.attempts, 1);

        // Step 4: Read action log — entry must exist with correct metadata
        const logRes = await app.inject({
            method: 'GET',
            url: `/v1/connectors/${connectorId}/actions`,
        });
        assert.equal(logRes.statusCode, 200);
        const logBody = logRes.json() as {
            actions: Array<{ actionType: string; resultStatus: string; connectorType: string }>;
            hasMore: boolean;
        };
        assert.equal(logBody.actions.length, 1);
        assert.equal(logBody.actions[0]?.actionType, 'read_task');
        assert.equal(logBody.actions[0]?.resultStatus, 'success');
        assert.equal(logBody.actions[0]?.connectorType, 'custom_api');
        assert.equal(logBody.hasMore, false);
    } finally {
        await app.close();
    }
});

test('custom_api e2e: payload.method and payload.path are forwarded to the HTTP request', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    const store = createInMemorySecretStore({});

    const connectorId = 'custom_api:tenant_1:ws_1';
    const secretRef = 'kv://test/custom_api';
    await store.setSecret(secretRef, JSON.stringify({
        base_url: 'https://api.example.com',
        auth_type: 'bearer_token',
        bearer_token: 'tok-method-test',
    }));
    repo.metadata.set(connectorId, {
        connectorId,
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        connectorType: 'custom_api',
        status: 'connected',
        secretRefId: secretRef,
        scopeStatus: 'full',
        lastErrorClass: null,
    });

    const capturedCalls: Array<{ url: string; method: string; hasAuthHeader: boolean }> = [];
    const capturingFetcher = async (url: string | URL, init?: RequestInit): Promise<Response> => {
        capturedCalls.push({
            url: String(url),
            method: (init?.method ?? 'GET').toUpperCase(),
            hasAuthHeader: typeof (init?.headers as Record<string, string>)?.['Authorization'] === 'string',
        });
        return new Response(JSON.stringify({ result: 'ok' }), { status: 200 }) as Response;
    };

    const providerExecutor = createRealProviderExecutor(store, capturingFetcher as typeof fetch);

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        providerExecutor,
        sleep: async () => {},
    });

    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/connectors/actions/execute',
            payload: {
                connector_type: 'custom_api',
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                role_key: 'developer',
                action_type: 'read_task',
                payload: { method: 'GET', path: '/items/42' },
            },
        });

        assert.equal(res.statusCode, 200);
        assert.equal(capturedCalls.length, 1);
        assert.equal(capturedCalls[0]?.url, 'https://api.example.com/items/42');
        assert.equal(capturedCalls[0]?.method, 'GET');
        assert.equal(capturedCalls[0]?.hasAuthHeader, true, 'Bearer token should be set in Authorization header');
    } finally {
        await app.close();
    }
});

test('custom_api e2e: health probe 401 → connector status updated to permission_invalid', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    const store = createInMemorySecretStore({});

    const connectorId = 'custom_api:tenant_1:ws_1';
    const secretRef = 'kv://test/custom_api_bad_token';
    await store.setSecret(secretRef, JSON.stringify({
        base_url: 'https://api.example.com',
        auth_type: 'bearer_token',
        bearer_token: 'expired-token',
    }));
    repo.metadata.set(connectorId, {
        connectorId,
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        connectorType: 'custom_api',
        status: 'connected',
        secretRefId: secretRef,
        scopeStatus: 'full',
        lastErrorClass: null,
    });

    const authFailFetcher = async () => new Response(null, { status: 401 }) as Response;
    const connectorHealthProbe = createRealConnectorHealthProbe(store, authFailFetcher as typeof fetch);

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        connectorHealthProbe,
        sleep: async () => {},
    });

    try {
        const healthRes = await app.inject({
            method: 'POST',
            url: '/v1/connectors/health/check',
            payload: { workspace_id: 'ws_1' },
        });

        assert.equal(healthRes.statusCode, 200);
        const healthBody = healthRes.json() as {
            totals: { remediation_required: number };
            results: Array<{ probe_outcome: string; status_after: string; remediation: string }>;
        };
        assert.equal(healthBody.totals.remediation_required, 1);
        assert.equal(healthBody.results[0]?.probe_outcome, 'auth_failure');
        assert.equal(healthBody.results[0]?.status_after, 'permission_invalid');
        assert.equal(healthBody.results[0]?.remediation, 're_auth');

        // Execute is now blocked because connector is permission_invalid
        const execRes = await app.inject({
            method: 'POST',
            url: '/v1/connectors/actions/execute',
            payload: {
                connector_type: 'custom_api',
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                role_key: 'developer',
                action_type: 'read_task',
                payload: {},
            },
        });
        assert.equal(execRes.statusCode, 409);
        const execBody = execRes.json() as { error: string; error_code: string };
        assert.equal(execBody.error, 'connector_unavailable');
        assert.equal(execBody.error_code, 'permission_denied');
    } finally {
        await app.close();
    }
});

test('GET connector actions — respects cursor pagination (returns only records before cursor)', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    seedConnectedMetadata(repo);

    const t1 = new Date('2026-01-01T10:00:00Z');
    const t2 = new Date('2026-01-01T11:00:00Z');
    const t3 = new Date('2026-01-01T12:00:00Z');

    for (const [actionId, completedAt] of [['act_1', t1], ['act_2', t2], ['act_3', t3]] as const) {
        await repo.createConnectorActionLog({
            actionId,
            tenantId: 'tenant_1',
            workspaceId: 'ws_1',
            botId: 'bot_1',
            connectorId: 'jira:tenant_1:ws_1',
            connectorType: 'jira',
            actionType: 'read_task',
            contractVersion: 'v1.0',
            correlationId: actionId,
            requestBody: {},
            resultStatus: 'success',
            providerResponseCode: '200',
            resultSummary: 'ok',
            errorCode: null,
            errorMessage: null,
            remediationHint: null,
            completedAt,
        });
    }

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
    });

    try {
        // Use t3 as cursor — should return only t2 and t1 (lt t3)
        const response = await app.inject({
            method: 'GET',
            url: `/v1/connectors/jira:tenant_1:ws_1/actions?cursor=${encodeURIComponent(t3.toISOString())}`,
        });
        assert.equal(response.statusCode, 200);
        const body = response.json() as { actions: Array<{ actionId: string }> };
        assert.equal(body.actions.length, 2);
        const ids = body.actions.map((a) => a.actionId);
        assert.ok(ids.includes('act_2'));
        assert.ok(ids.includes('act_1'));
        assert.ok(!ids.includes('act_3'));
    } finally {
        await app.close();
    }
});

test('failClosedProviderExecutor never fakes success — returns honest not-configured error', async () => {
    const result = await failClosedProviderExecutor({
        connectorType: 'github',
        actionType: 'create_pr',
        payload: {},
        attempt: 1,
        secretRefId: null,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'provider_unavailable');
    assert.match(result.errorMessage ?? '', /not executed/i);
});

// ---------------------------------------------------------------------------
// C2 — GitLab + Linear real provider executors
// ---------------------------------------------------------------------------

test('gitlab create_pr opens a merge request via the REST v4 API', async () => {
    const store = createInMemorySecretStore({});
    const ref = 'kv://test/gitlab';
    await store.setSecret(ref, JSON.stringify({ access_token: 'glpat-xyz' }));

    const calls: Array<{ url: string; method: string; auth?: string }> = [];
    const fetcher = async (url: string | URL, init?: RequestInit): Promise<Response> => {
        calls.push({
            url: String(url),
            method: (init?.method ?? 'GET').toUpperCase(),
            auth: (init?.headers as Record<string, string>)?.['Authorization'],
        });
        return new Response(JSON.stringify({ iid: 7, web_url: 'https://gitlab.com/x/-/merge_requests/7' }), { status: 201 }) as Response;
    };

    const exec = createRealProviderExecutor(store, fetcher as typeof fetch);
    const result = await exec({
        connectorType: 'gitlab',
        actionType: 'create_pr',
        payload: { project_id: 'group/proj', head: 'feature', base: 'main', title: 'Add X' },
        attempt: 1,
        secretRefId: ref,
    });

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.method, 'POST');
    assert.ok(calls[0]?.url.includes('/api/v4/projects/group%2Fproj/merge_requests'), calls[0]?.url);
    assert.equal(calls[0]?.auth, 'Bearer glpat-xyz');
    assert.match(result.resultSummary, /MR !7/);
});

test('gitlab self-hosted base_url is honoured', async () => {
    const store = createInMemorySecretStore({});
    const ref = 'kv://test/gitlab-self';
    await store.setSecret(ref, JSON.stringify({ access_token: 't', base_url: 'https://gitlab.acme.com' }));
    let calledUrl = '';
    const fetcher = async (url: string | URL): Promise<Response> => {
        calledUrl = String(url);
        return new Response(JSON.stringify([{ iid: 1 }]), { status: 200 }) as Response;
    };
    const exec = createRealProviderExecutor(store, fetcher as typeof fetch);
    const result = await exec({
        connectorType: 'gitlab',
        actionType: 'list_prs',
        payload: { project_id: '42' },
        attempt: 1,
        secretRefId: ref,
    });
    assert.equal(result.ok, true);
    assert.ok(calledUrl.startsWith('https://gitlab.acme.com/api/v4/projects/42/merge_requests'), calledUrl);
});

test('gitlab missing project_id fails with invalid_format (not executed)', async () => {
    const store = createInMemorySecretStore({});
    const ref = 'kv://test/gitlab2';
    await store.setSecret(ref, JSON.stringify({ access_token: 't' }));
    let called = false;
    const fetcher = async (): Promise<Response> => { called = true; return new Response('{}', { status: 200 }) as Response; };
    const exec = createRealProviderExecutor(store, fetcher as typeof fetch);
    const result = await exec({
        connectorType: 'gitlab',
        actionType: 'create_pr',
        payload: { head: 'f', base: 'main', title: 'T' },
        attempt: 1,
        secretRefId: ref,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'invalid_format');
    assert.equal(called, false, 'no HTTP call should be made when project_id is missing');
});

test('linear create_comment posts a GraphQL mutation with the raw api_key auth header', async () => {
    const store = createInMemorySecretStore({});
    const ref = 'kv://test/linear';
    await store.setSecret(ref, JSON.stringify({ api_key: 'lin_api_123' }));

    const calls: Array<{ url: string; method: string; auth?: string; body: string }> = [];
    const fetcher = async (url: string | URL, init?: RequestInit): Promise<Response> => {
        calls.push({
            url: String(url),
            method: (init?.method ?? 'GET').toUpperCase(),
            auth: (init?.headers as Record<string, string>)?.['Authorization'],
            body: String(init?.body ?? ''),
        });
        return new Response(JSON.stringify({ data: { commentCreate: { success: true, comment: { id: 'c1' } } } }), { status: 200 }) as Response;
    };

    const exec = createRealProviderExecutor(store, fetcher as typeof fetch);
    const result = await exec({
        connectorType: 'linear',
        actionType: 'create_comment',
        payload: { issue_id: 'ISS-1', body: 'Looks good' },
        attempt: 1,
        secretRefId: ref,
    });

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, 'https://api.linear.app/graphql');
    assert.equal(calls[0]?.method, 'POST');
    assert.equal(calls[0]?.auth, 'lin_api_123', 'Linear uses the raw api_key as Authorization (no Bearer prefix)');
    assert.ok(calls[0]?.body.includes('commentCreate'), calls[0]?.body);
});

test('linear surfaces GraphQL errors as invalid_format', async () => {
    const store = createInMemorySecretStore({});
    const ref = 'kv://test/linear2';
    await store.setSecret(ref, JSON.stringify({ api_key: 'k' }));
    const fetcher = async (): Promise<Response> =>
        new Response(JSON.stringify({ errors: [{ message: 'Entity not found: Issue' }] }), { status: 200 }) as Response;
    const exec = createRealProviderExecutor(store, fetcher as typeof fetch);
    const result = await exec({
        connectorType: 'linear',
        actionType: 'read_task',
        payload: { issue_id: 'NOPE' },
        attempt: 1,
        secretRefId: ref,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'invalid_format');
    assert.match(result.errorMessage ?? '', /Entity not found/);
});

test('linear rejects PR actions as unsupported_action', async () => {
    const store = createInMemorySecretStore({});
    const ref = 'kv://test/linear3';
    await store.setSecret(ref, JSON.stringify({ api_key: 'k' }));
    const exec = createRealProviderExecutor(store, (async () => new Response('{}', { status: 200 })) as typeof fetch);
    const result = await exec({
        connectorType: 'linear',
        actionType: 'merge_pr',
        payload: {},
        attempt: 1,
        secretRefId: ref,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'unsupported_action');
});

// ---------------------------------------------------------------------------
// C6 — Custom API self-describing operation invocation (OpenAPI-driven)
// ---------------------------------------------------------------------------

test('custom_api executes an OpenAPI operation by name + args (path param + body resolved)', async () => {
    const store = createInMemorySecretStore({});
    const ref = 'kv://test/customopenapi';
    await store.setSecret(ref, JSON.stringify({ base_url: 'https://api.acme.com', auth_type: 'bearer_token', bearer_token: 'tok' }));

    const calls: Array<{ url: string; method: string; body: string }> = [];
    const fetcher = async (url: string | URL, init?: RequestInit): Promise<Response> => {
        calls.push({ url: String(url), method: (init?.method ?? 'GET').toUpperCase(), body: String(init?.body ?? '') });
        return new Response(JSON.stringify({ ok: true }), { status: 200 }) as Response;
    };

    const exec = createRealProviderExecutor(store, fetcher as typeof fetch);
    const result = await exec({
        connectorType: 'custom_api',
        actionType: 'create_comment',
        payload: {
            openapi_operation: {
                name: 'addComment',
                description: 'Add a comment',
                method: 'POST',
                path: '/tickets/{id}/comments',
                pathParams: ['id'],
                queryParams: [],
                requiredParams: ['id'],
                hasBody: true,
            },
            args: { id: 'T-9', text: 'hello' },
        },
        attempt: 1,
        secretRefId: ref,
    });

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.method, 'POST');
    assert.equal(calls[0]?.url, 'https://api.acme.com/tickets/T-9/comments');
    assert.ok(calls[0]?.body.includes('"text":"hello"'), calls[0]?.body);
    assert.ok(!calls[0]?.body.includes('"id"'), 'path param must not leak into body');
});

test('custom_api operation mode fails closed when a required param is missing (no HTTP call)', async () => {
    const store = createInMemorySecretStore({});
    const ref = 'kv://test/customopenapi2';
    await store.setSecret(ref, JSON.stringify({ base_url: 'https://api.acme.com', auth_type: 'none' }));
    let called = false;
    const fetcher = async (): Promise<Response> => { called = true; return new Response('{}', { status: 200 }) as Response; };
    const exec = createRealProviderExecutor(store, fetcher as typeof fetch);
    const result = await exec({
        connectorType: 'custom_api',
        actionType: 'read_task',
        payload: {
            openapi_operation: { name: 'getTicket', description: '', method: 'GET', path: '/tickets/{id}', pathParams: ['id'], queryParams: [], requiredParams: ['id'], hasBody: false },
            args: {},
        },
        attempt: 1,
        secretRefId: ref,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'invalid_format');
    assert.equal(called, false);
});

test('POST /v1/connectors/openapi/parse returns a tool catalog from a spec', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    await registerConnectorActionRoutes(app, { getSession: () => sessionContext(), repo });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/connectors/openapi/parse',
            payload: { spec: { paths: { '/tickets/{id}': { get: { operationId: 'getTicket', summary: 'Get' } } } } },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { tool_count: number; tools: Array<{ name: string; method: string; pathParams: string[] }> };
        assert.equal(body.tool_count, 1);
        assert.equal(body.tools[0]?.name, 'getTicket');
        assert.equal(body.tools[0]?.method, 'GET');
        assert.deepEqual(body.tools[0]?.pathParams, ['id']);
    } finally {
        await app.close();
    }
});

test('POST /v1/connectors/openapi/parse rejects an unauthenticated request', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    await registerConnectorActionRoutes(app, { getSession: () => null, repo });
    try {
        const res = await app.inject({ method: 'POST', url: '/v1/connectors/openapi/parse', payload: { spec: {} } });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// C6.2 — Persist + fetch Custom API OpenAPI catalogs
// ---------------------------------------------------------------------------

test('PUT /v1/connectors/:id/openapi stores the catalog; GET custom-api-catalog returns it', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    const connectorId = 'custom_api:tenant_1:ws_1';
    repo.metadata.set(connectorId, {
        connectorId,
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        connectorType: 'custom_api',
        status: 'connected',
        secretRefId: null,
        scopeStatus: null,
        lastErrorClass: null,
    });
    await registerConnectorActionRoutes(app, { getSession: () => sessionContext(), repo });
    try {
        const putRes = await app.inject({
            method: 'PUT',
            url: `/v1/connectors/${connectorId}/openapi`,
            payload: { spec: { paths: { '/tickets/{id}': { get: { operationId: 'getTicket', summary: 'Get' } } } } },
        });
        assert.equal(putRes.statusCode, 200);
        assert.equal((putRes.json() as { tool_count: number }).tool_count, 1);

        const getRes = await app.inject({ method: 'GET', url: '/v1/connectors/custom-api-catalog' });
        assert.equal(getRes.statusCode, 200);
        const body = getRes.json() as { connectors: Array<{ connectorId: string; catalog: Array<{ name: string }> }> };
        assert.equal(body.connectors.length, 1);
        assert.equal(body.connectors[0]?.connectorId, connectorId);
        assert.equal(body.connectors[0]?.catalog[0]?.name, 'getTicket');
    } finally {
        await app.close();
    }
});

test('PUT openapi 404s for a connector owned by another tenant', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    const connectorId = 'custom_api:other:ws';
    repo.metadata.set(connectorId, {
        connectorId, tenantId: 'other_tenant', workspaceId: 'ws', connectorType: 'custom_api',
        status: 'connected', secretRefId: null, scopeStatus: null, lastErrorClass: null,
    });
    await registerConnectorActionRoutes(app, { getSession: () => sessionContext(), repo });
    try {
        const res = await app.inject({
            method: 'PUT',
            url: `/v1/connectors/${connectorId}/openapi`,
            payload: { spec: { paths: { '/x': { get: {} } } } },
        });
        assert.equal(res.statusCode, 404);
    } finally {
        await app.close();
    }
});

test('GET custom-api-catalog accepts the service token + x-tenant-id (runtime path)', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    const connectorId = 'custom_api:tenant_1:ws_1';
    repo.metadata.set(connectorId, {
        connectorId, tenantId: 'tenant_1', workspaceId: 'ws_1', connectorType: 'custom_api',
        status: 'connected', secretRefId: null, scopeStatus: null, lastErrorClass: null,
    });
    await repo.setOpenapiCatalog!({ connectorId, tenantId: 'tenant_1', catalog: [{ name: 'op1' }] });
    await registerConnectorActionRoutes(app, {
        getSession: () => null,
        repo,
        serviceAuthToken: 'svc-secret',
    });
    try {
        const ok = await app.inject({
            method: 'GET',
            url: '/v1/connectors/custom-api-catalog',
            headers: { 'x-connector-exec-token': 'svc-secret', 'x-tenant-id': 'tenant_1' },
        });
        assert.equal(ok.statusCode, 200);
        assert.equal((ok.json() as { connectors: unknown[] }).connectors.length, 1);

        const unauth = await app.inject({ method: 'GET', url: '/v1/connectors/custom-api-catalog' });
        assert.equal(unauth.statusCode, 401);
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// Gmail / Outlook — native mailbox connectors through the execute route
// ---------------------------------------------------------------------------

test('gmail e2e: PUT access_token credentials → execute send_email via real executor → success logged', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    const store = createInMemorySecretStore({});

    const connectorId = 'gmail:tenant_1:ws_1';
    repo.metadata.set(connectorId, {
        connectorId,
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        connectorType: 'gmail',
        status: 'not_configured',
        secretRefId: null,
        scopeStatus: null,
        lastErrorClass: null,
    });

    const gmailFetcher = async () =>
        new Response(JSON.stringify({ id: 'msg-e2e-1' }), { status: 200 }) as Response;
    const providerExecutor = createRealProviderExecutor(store, gmailFetcher as typeof fetch);

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        secretStore: store,
        providerExecutor,
        sleep: async () => {},
    });

    try {
        const putRes = await app.inject({
            method: 'PUT',
            url: `/v1/connectors/${connectorId}/credentials`,
            payload: { credentials: { access_token: 'ya29.gmail-oauth' } },
        });
        assert.equal(putRes.statusCode, 200);

        const execRes = await app.inject({
            method: 'POST',
            url: '/v1/connectors/actions/execute',
            payload: {
                connector_type: 'gmail',
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                role_key: 'corporate_assistant',
                action_type: 'send_email',
                payload: { to: 'alice@example.com', subject: 'Weekly summary', body: 'All green.' },
            },
        });
        assert.equal(execRes.statusCode, 200);
        const execBody = execRes.json() as { status: string; result_summary: string };
        assert.equal(execBody.status, 'success');
        assert.ok(execBody.result_summary.includes('msg-e2e-1'));

        assert.equal(repo.logs.length, 1);
        assert.equal(repo.logs[0]!.connectorType, 'gmail');
        assert.equal(repo.logs[0]!.actionType, 'send_email');
        assert.equal(repo.logs[0]!.resultStatus, 'success');
    } finally {
        await app.close();
    }
});

test('PUT credentials returns 400 when gmail credentials missing access_token', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    const store = createInMemorySecretStore({});
    const connectorId = 'gmail:tenant_1:ws_1';
    repo.metadata.set(connectorId, {
        connectorId,
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        connectorType: 'gmail',
        status: 'not_configured',
        secretRefId: null,
        scopeStatus: null,
        lastErrorClass: null,
    });

    await registerConnectorActionRoutes(app, { getSession: () => sessionContext(), repo, secretStore: store });

    try {
        const res = await app.inject({
            method: 'PUT',
            url: `/v1/connectors/${connectorId}/credentials`,
            payload: { credentials: { refresh_token: 'only-refresh' } },
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('outlook executes list_emails (low risk) through the real executor and logs it', async () => {
    const app = Fastify();
    const repo = createFakeRepo();

    const secretRefId = 'kv://vault/secrets/outlook-tenant1';
    const store = createInMemorySecretStore({
        [secretRefId]: JSON.stringify({ access_token: 'graph-token-1' }),
    });

    const connectorId = 'outlook:tenant_1:ws_1';
    repo.metadata.set(connectorId, {
        connectorId,
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        connectorType: 'outlook',
        status: 'connected',
        secretRefId,
        scopeStatus: 'full',
        lastErrorClass: null,
    });

    const graphFetcher = async () =>
        new Response(
            JSON.stringify({ value: [{ id: 'o1', subject: 'Board deck', from: { emailAddress: { address: 'ceo@example.com' } } }] }),
            { status: 200 },
        ) as Response;
    const providerExecutor = createRealProviderExecutor(store, graphFetcher as typeof fetch);

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        secretStore: store,
        providerExecutor,
        sleep: async () => {},
    });

    try {
        const execRes = await app.inject({
            method: 'POST',
            url: '/v1/connectors/actions/execute',
            payload: {
                connector_type: 'outlook',
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                role_key: 'corporate_assistant',
                action_type: 'list_emails',
                payload: { max_results: 5 },
            },
        });
        assert.equal(execRes.statusCode, 200);
        const execBody = execRes.json() as { status: string; result_summary: string };
        assert.equal(execBody.status, 'success');
        assert.ok(execBody.result_summary.includes('Board deck'));
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// HubSpot / Salesforce — native CRM connectors through the execute route
// ---------------------------------------------------------------------------

test('hubspot e2e: PUT access_token credentials → execute get_record via real executor → success logged', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    const store = createInMemorySecretStore({});

    const connectorId = 'hubspot:tenant_1:ws_1';
    repo.metadata.set(connectorId, {
        connectorId,
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        connectorType: 'hubspot',
        status: 'not_configured',
        secretRefId: null,
        scopeStatus: null,
        lastErrorClass: null,
    });

    const hubspotFetcher = async () =>
        new Response(JSON.stringify({ id: '501', properties: { email: 'ada@example.com' } }), { status: 200 }) as Response;
    const providerExecutor = createRealProviderExecutor(store, hubspotFetcher as typeof fetch);

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        secretStore: store,
        providerExecutor,
        sleep: async () => {},
    });

    try {
        const putRes = await app.inject({
            method: 'PUT',
            url: `/v1/connectors/${connectorId}/credentials`,
            payload: { credentials: { access_token: 'pat-na1-hubspot' } },
        });
        assert.equal(putRes.statusCode, 200);

        const execRes = await app.inject({
            method: 'POST',
            url: '/v1/connectors/actions/execute',
            payload: {
                connector_type: 'hubspot',
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                role_key: 'sales_rep',
                action_type: 'get_record',
                payload: { record_type: 'contacts', record_id: '501' },
            },
        });
        assert.equal(execRes.statusCode, 200);
        const execBody = execRes.json() as { status: string; result_summary: string };
        assert.equal(execBody.status, 'success');
        assert.ok(execBody.result_summary.includes('ada@example.com'));

        assert.equal(repo.logs.length, 1);
        assert.equal(repo.logs[0]!.connectorType, 'hubspot');
        assert.equal(repo.logs[0]!.actionType, 'get_record');
        assert.equal(repo.logs[0]!.resultStatus, 'success');
    } finally {
        await app.close();
    }
});

test('PUT credentials returns 400 when salesforce credentials missing instance_url', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    const store = createInMemorySecretStore({});
    const connectorId = 'salesforce:tenant_1:ws_1';
    repo.metadata.set(connectorId, {
        connectorId,
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        connectorType: 'salesforce',
        status: 'not_configured',
        secretRefId: null,
        scopeStatus: null,
        lastErrorClass: null,
    });

    await registerConnectorActionRoutes(app, { getSession: () => sessionContext(), repo, secretStore: store });

    try {
        const res = await app.inject({
            method: 'PUT',
            url: `/v1/connectors/${connectorId}/credentials`,
            payload: { credentials: { access_token: 'sf-only-token' } },
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('salesforce executes search_records (low risk) through the real executor and logs it', async () => {
    const app = Fastify();
    const repo = createFakeRepo();

    const secretRefId = 'kv://vault/secrets/salesforce-tenant1';
    const store = createInMemorySecretStore({
        [secretRefId]: JSON.stringify({ access_token: 'sf-token', instance_url: 'https://acme.my.salesforce.com' }),
    });

    const connectorId = 'salesforce:tenant_1:ws_1';
    repo.metadata.set(connectorId, {
        connectorId,
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        connectorType: 'salesforce',
        status: 'connected',
        secretRefId,
        scopeStatus: 'full',
        lastErrorClass: null,
    });

    const sfFetcher = async () =>
        new Response(JSON.stringify({ totalSize: 1, records: [{ Id: '006xx' }] }), { status: 200 }) as Response;
    const providerExecutor = createRealProviderExecutor(store, sfFetcher as typeof fetch);

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        secretStore: store,
        providerExecutor,
        sleep: async () => {},
    });

    try {
        const execRes = await app.inject({
            method: 'POST',
            url: '/v1/connectors/actions/execute',
            payload: {
                connector_type: 'salesforce',
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                role_key: 'sales_rep',
                action_type: 'search_records',
                payload: { record_type: 'Opportunity', query: 'acme' },
            },
        });
        assert.equal(execRes.statusCode, 200);
        const execBody = execRes.json() as { status: string; result_summary: string };
        assert.equal(execBody.status, 'success');
        assert.ok(execBody.result_summary.includes('006xx'));
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// Greenhouse / WordPress — ATS + CMS connectors through the execute route
// ---------------------------------------------------------------------------

test('greenhouse executes get_record (low risk) through the real executor for the recruiter role', async () => {
    const app = Fastify();
    const repo = createFakeRepo();

    const secretRefId = 'kv://vault/secrets/greenhouse-tenant1';
    const store = createInMemorySecretStore({
        [secretRefId]: JSON.stringify({ api_key: 'gh-key', on_behalf_of: '4001' }),
    });

    const connectorId = 'greenhouse:tenant_1:ws_1';
    repo.metadata.set(connectorId, {
        connectorId,
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        connectorType: 'greenhouse',
        status: 'connected',
        secretRefId,
        scopeStatus: 'full',
        lastErrorClass: null,
    });

    const ghFetcher = async () =>
        new Response(JSON.stringify({ id: 9001, first_name: 'Ada', last_name: 'Lovelace' }), { status: 200 }) as Response;
    const providerExecutor = createRealProviderExecutor(store, ghFetcher as typeof fetch);

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        secretStore: store,
        providerExecutor,
        sleep: async () => {},
    });

    try {
        const execRes = await app.inject({
            method: 'POST',
            url: '/v1/connectors/actions/execute',
            payload: {
                connector_type: 'greenhouse',
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                role_key: 'recruiter',
                action_type: 'get_record',
                payload: { record_type: 'candidates', record_id: '9001' },
            },
        });
        assert.equal(execRes.statusCode, 200);
        const execBody = execRes.json() as { status: string; result_summary: string };
        assert.equal(execBody.status, 'success');
        assert.ok(execBody.result_summary.includes('Ada'));
    } finally {
        await app.close();
    }
});

test('wordpress executes list_content (low risk) through the real executor for the content writer role', async () => {
    const app = Fastify();
    const repo = createFakeRepo();

    const secretRefId = 'kv://vault/secrets/wordpress-tenant1';
    const store = createInMemorySecretStore({
        [secretRefId]: JSON.stringify({ base_url: 'https://blog.acme.com', username: 'agent', app_password: 'pw' }),
    });

    const connectorId = 'wordpress:tenant_1:ws_1';
    repo.metadata.set(connectorId, {
        connectorId,
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        connectorType: 'wordpress',
        status: 'connected',
        secretRefId,
        scopeStatus: 'full',
        lastErrorClass: null,
    });

    const wpFetcher = async () =>
        new Response(JSON.stringify([{ id: 42, status: 'publish', title: { rendered: 'Hello World' } }]), { status: 200 }) as Response;
    const providerExecutor = createRealProviderExecutor(store, wpFetcher as typeof fetch);

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        secretStore: store,
        providerExecutor,
        sleep: async () => {},
    });

    try {
        const execRes = await app.inject({
            method: 'POST',
            url: '/v1/connectors/actions/execute',
            payload: {
                connector_type: 'wordpress',
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                role_key: 'content_writer',
                action_type: 'list_content',
                payload: { max_results: 5 },
            },
        });
        assert.equal(execRes.statusCode, 200);
        const execBody = execRes.json() as { status: string; result_summary: string };
        assert.equal(execBody.status, 'success');
        assert.ok(execBody.result_summary.includes('Hello World'));
    } finally {
        await app.close();
    }
});

test('PUT credentials returns 400 when wordpress credentials missing app_password', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    const store = createInMemorySecretStore({});
    const connectorId = 'wordpress:tenant_1:ws_1';
    repo.metadata.set(connectorId, {
        connectorId,
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        connectorType: 'wordpress',
        status: 'not_configured',
        secretRefId: null,
        scopeStatus: null,
        lastErrorClass: null,
    });

    await registerConnectorActionRoutes(app, { getSession: () => sessionContext(), repo, secretStore: store });

    try {
        const res = await app.inject({
            method: 'PUT',
            url: `/v1/connectors/${connectorId}/credentials`,
            payload: { credentials: { base_url: 'https://blog.acme.com', username: 'agent' } },
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// Azure — native cloud connector through the execute route (read-only tier)
// ---------------------------------------------------------------------------

test('azure executes list_resources (low risk) through the real executor for the devops role', async () => {
    const app = Fastify();
    const repo = createFakeRepo();

    const secretRefId = 'kv://vault/secrets/azure-tenant1';
    const store = createInMemorySecretStore({
        [secretRefId]: JSON.stringify({ access_token: 'arm-tok', subscription_id: 'sub-1' }),
    });

    const connectorId = 'azure:tenant_1:ws_1';
    repo.metadata.set(connectorId, {
        connectorId,
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        connectorType: 'azure',
        status: 'connected',
        secretRefId,
        scopeStatus: 'full',
        lastErrorClass: null,
    });

    const armFetcher = async () =>
        new Response(
            JSON.stringify({ value: [{ name: 'vm-1', type: 'Microsoft.Compute/virtualMachines', location: 'southindia' }] }),
            { status: 200 },
        ) as Response;
    const providerExecutor = createRealProviderExecutor(store, armFetcher as typeof fetch);

    await registerConnectorActionRoutes(app, {
        getSession: () => sessionContext(),
        repo,
        secretStore: store,
        providerExecutor,
        sleep: async () => {},
    });

    try {
        const execRes = await app.inject({
            method: 'POST',
            url: '/v1/connectors/actions/execute',
            payload: {
                connector_type: 'azure',
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                role_key: 'devops_engineer',
                action_type: 'list_resources',
                payload: { max_results: 5 },
            },
        });
        assert.equal(execRes.statusCode, 200);
        const execBody = execRes.json() as { status: string; result_summary: string };
        assert.equal(execBody.status, 'success');
        assert.ok(execBody.result_summary.includes('vm-1'));
    } finally {
        await app.close();
    }
});

test('PUT credentials returns 400 when azure credentials missing subscription_id', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    const store = createInMemorySecretStore({});
    const connectorId = 'azure:tenant_1:ws_1';
    repo.metadata.set(connectorId, {
        connectorId,
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        connectorType: 'azure',
        status: 'not_configured',
        secretRefId: null,
        scopeStatus: null,
        lastErrorClass: null,
    });

    await registerConnectorActionRoutes(app, { getSession: () => sessionContext(), repo, secretStore: store });

    try {
        const res = await app.inject({
            method: 'PUT',
            url: `/v1/connectors/${connectorId}/credentials`,
            payload: { credentials: { access_token: 'arm-only' } },
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});
