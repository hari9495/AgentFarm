import { randomBytes } from 'node:crypto';
import { URL } from 'node:url';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createInMemorySecretStore, type SecretStore } from '../lib/secret-store.js';

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

type ConnectorType = 'jira' | 'teams' | 'github' | 'email';
type CallbackStatus = 'completed' | 'failed' | 'expired';

type ConnectorAuthSessionRecord = {
    id: string;
    connectorId: string;
    tenantId: string;
    workspaceId: string;
    stateNonce: string;
    status: string;
    createdAt: Date;
    expiresAt: Date;
};

type ConnectorAuthRepo = {
    upsertAuthMetadata(input: {
        connectorId: string;
        tenantId: string;
        workspaceId: string;
        connectorType: string;
        status: string;
        authMode: string;
        secretRefId?: string | null;
        tokenExpiresAt?: Date | null;
        lastRefreshAt?: Date | null;
        scopeStatus?: 'full' | 'partial' | 'insufficient' | null;
        lastErrorClass?:
        | 'oauth_state_mismatch'
        | 'oauth_code_exchange_failed'
        | 'token_refresh_failed'
        | 'token_expired'
        | 'insufficient_scope'
        | 'provider_rate_limited'
        | 'provider_unavailable'
        | 'secret_store_unavailable'
        | null;
    }): Promise<void>;
    findAuthMetadata(connectorId: string): Promise<{
        connectorId: string;
        tenantId: string;
        workspaceId: string;
        connectorType: string;
        status: string;
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
    } | null>;
    createAuthSession(input: {
        connectorId: string;
        tenantId: string;
        workspaceId: string;
        stateNonce: string;
        status: string;
        expiresAt: Date;
    }): Promise<ConnectorAuthSessionRecord>;
    findAuthSessionByNonce(stateNonce: string): Promise<ConnectorAuthSessionRecord | null>;
    updateAuthSessionStatus(sessionId: string, status: CallbackStatus): Promise<void>;
    createAuthEvent(input: {
        connectorId: string;
        tenantId: string;
        eventType: string;
        result: string;
        correlationId: string;
        actor: string;
    }): Promise<void>;
};

type RegisterConnectorAuthRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    repo?: ConnectorAuthRepo;
    secretStore?: SecretStore;
    codeExchanger?: (input: {
        connectorType: ConnectorType;
        code: string;
        env: NodeJS.ProcessEnv;
        now: number;
    }) => Promise<{ credentials: Record<string, string>; expiresAt: Date; scopeStatus: 'full' | 'partial' | 'insufficient' }>;
    now?: () => number;
    nonceGenerator?: () => string;
    env?: NodeJS.ProcessEnv;
};

type InitiateBody = {
    connector_type?: string;
    workspace_id?: string;
};

type CallbackQuery = {
    state?: string;
    code?: string;
    error?: string;
    error_description?: string;
};

type RefreshBody = {
    connector_type?: string;
    workspace_id?: string;
    force?: boolean;
};

type RevokeBody = {
    connector_type?: string;
    workspace_id?: string;
};

type ReportErrorBody = {
    connector_type?: string;
    workspace_id?: string;
    error_class?: 'permission_invalid' | 'token_expired' | 'insufficient_scope';
    reason?: string;
};

const SUPPORTED_OAUTH_CONNECTORS: ConnectorType[] = ['jira', 'teams', 'github', 'email'];
const SESSION_TTL_MS = 10 * 60 * 1000;
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_EARLY_WINDOW_MS = 5 * 60 * 1000;

const DEFAULT_SCOPES: Record<ConnectorType, string[]> = {
    email: ['offline_access', 'Mail.Send', 'User.Read'],
    github: ['read:user', 'repo', 'workflow'],
    jira: ['read:jira-work', 'write:jira-work', 'read:jira-user'],
    teams: ['offline_access', 'User.Read', 'ChannelMessage.Send'],
};

const defaultRepo: ConnectorAuthRepo = {
    async upsertAuthMetadata(input) {
        const prisma = await getPrisma();
        await prisma.connectorAuthMetadata.upsert({
            where: { connectorId: input.connectorId },
            create: {
                connectorId: input.connectorId,
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                connectorType: input.connectorType,
                authMode: input.authMode,
                status: input.status as never,
                grantedScopes: [],
                secretRefId: input.secretRefId ?? null,
                tokenExpiresAt: input.tokenExpiresAt ?? null,
                lastRefreshAt: input.lastRefreshAt ?? null,
                scopeStatus: input.scopeStatus as never,
                lastErrorClass: input.lastErrorClass as never,
            },
            update: {
                status: input.status as never,
                authMode: input.authMode,
                secretRefId: input.secretRefId ?? undefined,
                tokenExpiresAt: input.tokenExpiresAt,
                lastRefreshAt: input.lastRefreshAt,
                scopeStatus: input.scopeStatus as never,
                lastErrorClass: input.lastErrorClass as never,
            },
        });
    },
    async findAuthMetadata(connectorId) {
        const prisma = await getPrisma();
        return prisma.connectorAuthMetadata.findUnique({
            where: { connectorId },
            select: {
                connectorId: true,
                tenantId: true,
                workspaceId: true,
                connectorType: true,
                status: true,
                secretRefId: true,
                tokenExpiresAt: true,
                lastRefreshAt: true,
                scopeStatus: true,
                lastErrorClass: true,
            },
        });
    },
    async createAuthSession(input) {
        const prisma = await getPrisma();
        return prisma.connectorAuthSession.create({
            data: {
                connectorId: input.connectorId,
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                stateNonce: input.stateNonce,
                status: input.status,
                expiresAt: input.expiresAt,
            },
        });
    },
    async findAuthSessionByNonce(stateNonce) {
        const prisma = await getPrisma();
        return prisma.connectorAuthSession.findUnique({ where: { stateNonce } });
    },
    async updateAuthSessionStatus(sessionId, status) {
        const prisma = await getPrisma();
        await prisma.connectorAuthSession.update({
            where: { id: sessionId },
            data: { status },
        });
    },
    async createAuthEvent(input) {
        const prisma = await getPrisma();
        await prisma.connectorAuthEvent.create({
            data: {
                connectorId: input.connectorId,
                tenantId: input.tenantId,
                eventType: input.eventType,
                result: input.result,
                correlationId: input.correlationId,
                actor: input.actor,
            },
        });
    },
};

const normalizeConnectorType = (value: string | undefined): ConnectorType | null => {
    if (!value) {
        return null;
    }
    const normalized = value.trim().toLowerCase();
    if (SUPPORTED_OAUTH_CONNECTORS.includes(normalized as ConnectorType)) {
        return normalized as ConnectorType;
    }
    return null;
};

const buildOAuthAuthorizeUrl = (
    connectorType: ConnectorType,
    stateNonce: string,
    env: NodeJS.ProcessEnv,
): string => {
    const authorizeBase =
        env[`CONNECTOR_${connectorType.toUpperCase()}_AUTHORIZE_URL`] ?? `https://example.${connectorType}.oauth/authorize`;
    const clientId =
        env[`CONNECTOR_${connectorType.toUpperCase()}_CLIENT_ID`] ?? `dev-${connectorType}-client-id`;
    const apiBase = env.API_BASE_URL ?? `http://localhost:${env.API_GATEWAY_PORT ?? '3000'}`;
    const redirectUri = env.CONNECTOR_OAUTH_REDIRECT_URI ?? `${apiBase}/auth/connectors/callback`;
    const scope = DEFAULT_SCOPES[connectorType].join(' ');

    const authUrl = new URL(authorizeBase);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('state', stateNonce);
    return authUrl.toString();
};

const buildOAuthRedirectUri = (env: NodeJS.ProcessEnv): string => {
    const apiBase = env.API_BASE_URL ?? `http://localhost:${env.API_GATEWAY_PORT ?? '3000'}`;
    return env.CONNECTOR_OAUTH_REDIRECT_URI ?? `${apiBase}/auth/connectors/callback`;
};

const buildConnectorId = (connectorType: ConnectorType, tenantId: string, workspaceId: string): string => {
    return `${connectorType}:${tenantId}:${workspaceId}`;
};

const buildSecretRefId = (connectorId: string, env: NodeJS.ProcessEnv): string => {
    const keyVaultBase = env.CONNECTOR_TOKEN_KEYVAULT_URI ?? 'kv://agentfarm-local-vault';
    return `${keyVaultBase.replace(/\/$/, '')}/secrets/${encodeURIComponent(connectorId)}-oauth-token`;
};

class OAuthCodeExchangeError extends Error {
    constructor(
        public readonly errorClass: 'oauth_code_exchange_failed' | 'insufficient_scope' | 'provider_rate_limited' | 'provider_unavailable',
        public readonly statusCode: number,
        message: string,
    ) {
        super(message);
    }
}

const inferScopeStatus = (connectorType: ConnectorType, scopeValue: string | undefined): 'full' | 'partial' | 'insufficient' => {
    if (!scopeValue) {
        return 'full';
    }
    const normalizedScope = new Set(scopeValue.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean));
    const expected = DEFAULT_SCOPES[connectorType];
    const matched = expected.filter((scope) => normalizedScope.has(scope));
    if (matched.length === expected.length) {
        return 'full';
    }
    if (matched.length > 0) {
        return 'partial';
    }
    return 'insufficient';
};

const assertHttpOk = async (response: Response): Promise<void> => {
    if (response.ok) {
        return;
    }
    const text = await response.text().catch(() => '');
    if (response.status === 429) {
        throw new OAuthCodeExchangeError('provider_rate_limited', 429, text || 'Provider rate limited token exchange request.');
    }
    if (response.status >= 500) {
        throw new OAuthCodeExchangeError('provider_unavailable', 502, text || 'Provider unavailable during token exchange.');
    }
    throw new OAuthCodeExchangeError('oauth_code_exchange_failed', 502, text || 'OAuth token exchange rejected by provider.');
};

const parseJsonSafely = async (response: Response): Promise<unknown> => {
    const raw = await response.text();
    try {
        return JSON.parse(raw) as unknown;
    } catch {
        throw new OAuthCodeExchangeError('oauth_code_exchange_failed', 502, raw || 'Provider returned non-JSON token response.');
    }
};

const defaultCodeExchanger = async (input: {
    connectorType: ConnectorType;
    code: string;
    env: NodeJS.ProcessEnv;
    now: number;
}): Promise<{ credentials: Record<string, string>; expiresAt: Date; scopeStatus: 'full' | 'partial' | 'insufficient' }> => {
    const redirectUri = buildOAuthRedirectUri(input.env);
    const clientId = input.env[`CONNECTOR_${input.connectorType.toUpperCase()}_CLIENT_ID`];
    const clientSecret = input.env[`CONNECTOR_${input.connectorType.toUpperCase()}_CLIENT_SECRET`];

    // Keep deterministic local behavior when connector OAuth secrets are not configured.
    if (!clientId || !clientSecret) {
        const accessToken = `${input.connectorType}_access_${input.code}`;
        const baseCredentials: Record<string, string> = {
            access_token: accessToken,
        };

        if (input.connectorType === 'jira') {
            baseCredentials.cloud_id = input.env.CONNECTOR_JIRA_CLOUD_ID ?? 'dev-cloud-id';
        }
        if (input.connectorType === 'teams') {
            baseCredentials.tenant_id = input.env.CONNECTOR_TEAMS_TENANT_ID ?? 'dev-tenant-id';
        }
        if (input.connectorType === 'email') {
            baseCredentials.provider = 'microsoft_graph';
            baseCredentials.tenant_id = input.env.CONNECTOR_EMAIL_TENANT_ID ?? 'dev-tenant-id';
        }

        return {
            credentials: baseCredentials,
            expiresAt: new Date(input.now + ACCESS_TOKEN_TTL_MS),
            scopeStatus: 'full',
        };
    }

    if (input.connectorType === 'github') {
        const tokenUrl = input.env.CONNECTOR_GITHUB_TOKEN_URL ?? 'https://github.com/login/oauth/access_token';
        const body = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code: input.code,
            redirect_uri: redirectUri,
        });

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            },
            body,
        });
        await assertHttpOk(response);
        const payload = (await parseJsonSafely(response)) as {
            access_token?: string;
            refresh_token?: string;
            expires_in?: number;
            scope?: string;
            error?: string;
            error_description?: string;
        };

        if (payload.error || !payload.access_token) {
            throw new OAuthCodeExchangeError(
                'oauth_code_exchange_failed',
                502,
                payload.error_description ?? payload.error ?? 'GitHub token response missing access_token.',
            );
        }

        const credentials: Record<string, string> = {
            access_token: payload.access_token,
        };
        if (payload.refresh_token) {
            credentials.refresh_token = payload.refresh_token;
        }

        return {
            credentials,
            expiresAt: new Date(input.now + (payload.expires_in ? payload.expires_in * 1000 : ACCESS_TOKEN_TTL_MS)),
            scopeStatus: inferScopeStatus('github', payload.scope),
        };
    }

    if (input.connectorType === 'jira') {
        const tokenUrl = input.env.CONNECTOR_JIRA_TOKEN_URL ?? 'https://auth.atlassian.com/oauth/token';
        const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({
                grant_type: 'authorization_code',
                client_id: clientId,
                client_secret: clientSecret,
                code: input.code,
                redirect_uri: redirectUri,
            }),
        });
        await assertHttpOk(tokenResponse);
        const payload = (await parseJsonSafely(tokenResponse)) as {
            access_token?: string;
            refresh_token?: string;
            expires_in?: number;
            scope?: string;
            error?: string;
            error_description?: string;
        };

        if (payload.error || !payload.access_token) {
            throw new OAuthCodeExchangeError(
                'oauth_code_exchange_failed',
                502,
                payload.error_description ?? payload.error ?? 'Jira token response missing access_token.',
            );
        }

        let cloudId = input.env.CONNECTOR_JIRA_CLOUD_ID;
        if (!cloudId) {
            const resourcesUrl = input.env.CONNECTOR_JIRA_RESOURCES_URL ?? 'https://api.atlassian.com/oauth/token/accessible-resources';
            const resourcesResponse = await fetch(resourcesUrl, {
                headers: { Authorization: `Bearer ${payload.access_token}` },
            });
            if (resourcesResponse.ok) {
                const resources = (await parseJsonSafely(resourcesResponse)) as Array<{ id?: string }>;
                cloudId = resources.find((resource) => typeof resource.id === 'string')?.id;
            }
        }

        if (!cloudId) {
            throw new OAuthCodeExchangeError(
                'oauth_code_exchange_failed',
                502,
                'Jira OAuth succeeded but no cloud_id could be resolved.',
            );
        }

        const credentials: Record<string, string> = {
            access_token: payload.access_token,
            cloud_id: cloudId,
        };
        if (payload.refresh_token) {
            credentials.refresh_token = payload.refresh_token;
        }

        return {
            credentials,
            expiresAt: new Date(input.now + (payload.expires_in ? payload.expires_in * 1000 : ACCESS_TOKEN_TTL_MS)),
            scopeStatus: inferScopeStatus('jira', payload.scope),
        };
    }

    if (input.connectorType === 'email') {
        const tenantId = input.env.CONNECTOR_EMAIL_TENANT_ID ?? 'common';
        const tokenUrl = input.env.CONNECTOR_EMAIL_TOKEN_URL
            ?? `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
        const body = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            code: input.code,
            redirect_uri: redirectUri,
            scope: DEFAULT_SCOPES.email.join(' '),
        });

        const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            },
            body,
        });
        await assertHttpOk(tokenResponse);
        const payload = (await parseJsonSafely(tokenResponse)) as {
            access_token?: string;
            refresh_token?: string;
            expires_in?: number;
            scope?: string;
            error?: string;
            error_description?: string;
        };

        if (payload.error || !payload.access_token) {
            throw new OAuthCodeExchangeError(
                payload.error === 'invalid_scope' ? 'insufficient_scope' : 'oauth_code_exchange_failed',
                502,
                payload.error_description ?? payload.error ?? 'Email token response missing access_token.',
            );
        }

        const credentials: Record<string, string> = {
            access_token: payload.access_token,
            provider: 'microsoft_graph',
            tenant_id: tenantId,
        };
        if (payload.refresh_token) {
            credentials.refresh_token = payload.refresh_token;
        }

        return {
            credentials,
            expiresAt: new Date(input.now + (payload.expires_in ? payload.expires_in * 1000 : ACCESS_TOKEN_TTL_MS)),
            scopeStatus: inferScopeStatus('email', payload.scope),
        };
    }

    const tenantId = input.env.CONNECTOR_TEAMS_TENANT_ID ?? 'common';
    const tokenUrl = input.env.CONNECTOR_TEAMS_TOKEN_URL
        ?? `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: input.code,
        redirect_uri: redirectUri,
        scope: DEFAULT_SCOPES.teams.join(' '),
    });

    const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        },
        body,
    });
    await assertHttpOk(tokenResponse);
    const payload = (await parseJsonSafely(tokenResponse)) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
        error?: string;
        error_description?: string;
    };

    if (payload.error || !payload.access_token) {
        throw new OAuthCodeExchangeError(
            payload.error === 'invalid_scope' ? 'insufficient_scope' : 'oauth_code_exchange_failed',
            502,
            payload.error_description ?? payload.error ?? 'Teams token response missing access_token.',
        );
    }

    const credentials: Record<string, string> = {
        access_token: payload.access_token,
        tenant_id: tenantId,
    };
    if (payload.refresh_token) {
        credentials.refresh_token = payload.refresh_token;
    }

    return {
        credentials,
        expiresAt: new Date(input.now + (payload.expires_in ? payload.expires_in * 1000 : ACCESS_TOKEN_TTL_MS)),
        scopeStatus: inferScopeStatus('teams', payload.scope),
    };
};

export const registerConnectorAuthRoutes = async (
    app: FastifyInstance,
    options: RegisterConnectorAuthRoutesOptions,
): Promise<void> => {
    const repo = options.repo ?? defaultRepo;
    const secretStore = options.secretStore ?? createInMemorySecretStore({});
    const codeExchanger = options.codeExchanger ?? defaultCodeExchanger;
    const now = options.now ?? (() => Date.now());
    const nonceGenerator = options.nonceGenerator ?? (() => randomBytes(24).toString('hex'));
    const env = options.env ?? process.env;

    app.post<{ Body: InitiateBody }>('/v1/connectors/oauth/initiate', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }

        const connectorType = normalizeConnectorType(request.body?.connector_type);
        if (!connectorType) {
            return reply.code(400).send({
                error: 'unsupported_connector',
                message: 'connector_type must be one of jira, teams, github, email',
            });
        }

        const workspaceId = request.body?.workspace_id ?? session.workspaceIds[0];
        if (!workspaceId) {
            return reply.code(400).send({
                error: 'invalid_workspace',
                message: 'workspace_id is required when no workspace is present in session scope.',
            });
        }

        if (!session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is not in your authenticated session scope.',
            });
        }

        const connectorId = buildConnectorId(connectorType, session.tenantId, workspaceId);
        const stateNonce = nonceGenerator();
        const expiresAt = new Date(now() + SESSION_TTL_MS);
        const authUrl = buildOAuthAuthorizeUrl(connectorType, stateNonce, env);

        await repo.upsertAuthMetadata({
            connectorId,
            tenantId: session.tenantId,
            workspaceId,
            connectorType,
            authMode: 'oauth2',
            status: 'auth_initiated',
        });

        const authSession = await repo.createAuthSession({
            connectorId,
            tenantId: session.tenantId,
            workspaceId,
            stateNonce,
            status: 'auth_initiated',
            expiresAt,
        });

        await repo.createAuthEvent({
            connectorId,
            tenantId: session.tenantId,
            eventType: 'oauth_initiated',
            result: 'success',
            correlationId: `corr_connector_auth_${now()}`,
            actor: session.userId,
        });

        return reply.code(201).send({
            connector_id: connectorId,
            connector_type: connectorType,
            auth_session_id: authSession.id,
            state_nonce: stateNonce,
            authorization_url: authUrl,
            expires_at: expiresAt.toISOString(),
            status: 'auth_initiated',
            token_storage: 'key_vault_reference_only',
        });
    });

    app.get<{ Querystring: CallbackQuery }>('/auth/connectors/callback', async (request, reply) => {
        const stateNonce = request.query?.state?.trim();
        if (!stateNonce) {
            return reply.code(400).send({
                error: 'invalid_state_nonce',
                message: 'state query parameter is required.',
            });
        }

        const authSession = await repo.findAuthSessionByNonce(stateNonce);
        if (!authSession) {
            return reply.code(400).send({
                error: 'invalid_state_nonce',
                message: 'No active connector auth session found for provided state.',
            });
        }

        if (authSession.status !== 'auth_initiated') {
            await repo.createAuthEvent({
                connectorId: authSession.connectorId,
                tenantId: authSession.tenantId,
                eventType: 'oauth_callback',
                result: 'state_nonce_replay',
                correlationId: `corr_connector_auth_${now()}`,
                actor: 'oauth_provider_callback',
            });
            return reply.code(409).send({
                error: 'state_nonce_already_used',
                message: 'Connector auth state nonce has already been consumed. Re-initiate OAuth flow.',
            });
        }

        if (authSession.expiresAt.getTime() <= now()) {
            await repo.updateAuthSessionStatus(authSession.id, 'expired');
            await repo.upsertAuthMetadata({
                connectorId: authSession.connectorId,
                tenantId: authSession.tenantId,
                workspaceId: authSession.workspaceId,
                connectorType: authSession.connectorId.split(':')[0] ?? 'unknown',
                authMode: 'oauth2',
                status: 'degraded',
                lastErrorClass: 'oauth_state_mismatch',
            });
            await repo.createAuthEvent({
                connectorId: authSession.connectorId,
                tenantId: authSession.tenantId,
                eventType: 'oauth_callback',
                result: 'expired',
                correlationId: `corr_connector_auth_${now()}`,
                actor: 'oauth_provider_callback',
            });
            return reply.code(400).send({
                error: 'expired_state_nonce',
                message: 'Connector auth session expired. Re-initiate OAuth flow.',
            });
        }

        if (request.query?.error) {
            const providerError = request.query.error.trim().toLowerCase();
            const lastErrorClass =
                providerError === 'access_denied' || providerError === 'invalid_scope'
                    ? 'insufficient_scope'
                    : 'oauth_code_exchange_failed';
            const status = lastErrorClass === 'insufficient_scope' ? 'consent_pending' : 'degraded';
            await repo.updateAuthSessionStatus(authSession.id, 'failed');
            await repo.upsertAuthMetadata({
                connectorId: authSession.connectorId,
                tenantId: authSession.tenantId,
                workspaceId: authSession.workspaceId,
                connectorType: authSession.connectorId.split(':')[0] ?? 'unknown',
                authMode: 'oauth2',
                status,
                lastErrorClass,
            });
            await repo.createAuthEvent({
                connectorId: authSession.connectorId,
                tenantId: authSession.tenantId,
                eventType: 'oauth_callback',
                result: providerError,
                correlationId: `corr_connector_auth_${now()}`,
                actor: 'oauth_provider_callback',
            });
            return reply.code(400).send({
                error: 'oauth_provider_error',
                message: request.query.error_description ?? request.query.error,
            });
        }

        const code = request.query?.code?.trim();
        if (!code) {
            return reply.code(400).send({
                error: 'missing_code',
                message: 'code query parameter is required.',
            });
        }

        const connectorType = normalizeConnectorType(authSession.connectorId.split(':')[0]);
        if (!connectorType) {
            await repo.updateAuthSessionStatus(authSession.id, 'failed');
            await repo.upsertAuthMetadata({
                connectorId: authSession.connectorId,
                tenantId: authSession.tenantId,
                workspaceId: authSession.workspaceId,
                connectorType: authSession.connectorId.split(':')[0] ?? 'unknown',
                authMode: 'oauth2',
                status: 'degraded',
                lastErrorClass: 'oauth_code_exchange_failed',
            });
            await repo.createAuthEvent({
                connectorId: authSession.connectorId,
                tenantId: authSession.tenantId,
                eventType: 'oauth_callback',
                result: 'unsupported_connector',
                correlationId: `corr_connector_auth_${now()}`,
                actor: 'oauth_provider_callback',
            });
            return reply.code(400).send({
                error: 'unsupported_connector',
                message: 'Connector from auth session is not supported for OAuth callback.',
            });
        }

        let exchanged: { credentials: Record<string, string>; expiresAt: Date; scopeStatus: 'full' | 'partial' | 'insufficient' };
        try {
            exchanged = await codeExchanger({
                connectorType,
                code,
                env,
                now: now(),
            });
        } catch (error) {
            const exchangeError = error instanceof OAuthCodeExchangeError
                ? error
                : new OAuthCodeExchangeError('oauth_code_exchange_failed', 502, 'Failed to exchange OAuth code for connector token.');
            const status = exchangeError.errorClass === 'insufficient_scope' ? 'consent_pending' : 'degraded';
            const mappedLastErrorClass =
                exchangeError.errorClass === 'insufficient_scope'
                    ? 'insufficient_scope'
                    : exchangeError.errorClass;
            await repo.updateAuthSessionStatus(authSession.id, 'failed');
            await repo.upsertAuthMetadata({
                connectorId: authSession.connectorId,
                tenantId: authSession.tenantId,
                workspaceId: authSession.workspaceId,
                connectorType,
                authMode: 'oauth2',
                status,
                lastErrorClass: mappedLastErrorClass,
            });
            await repo.createAuthEvent({
                connectorId: authSession.connectorId,
                tenantId: authSession.tenantId,
                eventType: 'oauth_callback',
                result: exchangeError.errorClass,
                correlationId: `corr_connector_auth_${now()}`,
                actor: 'oauth_provider_callback',
            });
            return reply.code(exchangeError.statusCode).send({
                error: exchangeError.errorClass,
                message: exchangeError.message,
            });
        }

        const secretRefId = buildSecretRefId(authSession.connectorId, env);
        try {
            await secretStore.setSecret(secretRefId, JSON.stringify(exchanged.credentials));
        } catch {
            await repo.updateAuthSessionStatus(authSession.id, 'failed');
            await repo.upsertAuthMetadata({
                connectorId: authSession.connectorId,
                tenantId: authSession.tenantId,
                workspaceId: authSession.workspaceId,
                connectorType,
                authMode: 'oauth2',
                status: 'degraded',
                lastErrorClass: 'secret_store_unavailable',
            });
            await repo.createAuthEvent({
                connectorId: authSession.connectorId,
                tenantId: authSession.tenantId,
                eventType: 'oauth_callback',
                result: 'secret_store_unavailable',
                correlationId: `corr_connector_auth_${now()}`,
                actor: 'oauth_provider_callback',
            });
            return reply.code(503).send({
                error: 'secret_store_unavailable',
                message: 'Unable to persist connector token in secret store.',
            });
        }

        await repo.updateAuthSessionStatus(authSession.id, 'completed');
        if (exchanged.scopeStatus === 'insufficient') {
            await repo.updateAuthSessionStatus(authSession.id, 'failed');
            await repo.upsertAuthMetadata({
                connectorId: authSession.connectorId,
                tenantId: authSession.tenantId,
                workspaceId: authSession.workspaceId,
                connectorType,
                authMode: 'oauth2',
                status: 'consent_pending',
                secretRefId,
                tokenExpiresAt: exchanged.expiresAt,
                lastRefreshAt: new Date(now()),
                scopeStatus: 'insufficient',
                lastErrorClass: 'insufficient_scope',
            });
            await repo.createAuthEvent({
                connectorId: authSession.connectorId,
                tenantId: authSession.tenantId,
                eventType: 'oauth_callback',
                result: 'insufficient_scope',
                correlationId: `corr_connector_auth_${now()}`,
                actor: 'oauth_provider_callback',
            });

            return reply.code(409).send({
                error: 'insufficient_scope',
                message: 'Connector permissions are insufficient; restart consent flow.',
                status: 'consent_pending',
                connector_id: authSession.connectorId,
                token_storage: 'key_vault_reference_only',
                secret_ref_id: secretRefId,
            });
        }

        await repo.upsertAuthMetadata({
            connectorId: authSession.connectorId,
            tenantId: authSession.tenantId,
            workspaceId: authSession.workspaceId,
            connectorType,
            authMode: 'oauth2',
            status: 'token_received',
            secretRefId,
            tokenExpiresAt: exchanged.expiresAt,
            lastRefreshAt: new Date(now()),
            scopeStatus: exchanged.scopeStatus,
            lastErrorClass: null,
        });

        await repo.createAuthEvent({
            connectorId: authSession.connectorId,
            tenantId: authSession.tenantId,
            eventType: 'oauth_callback',
            result: 'success',
            correlationId: `corr_connector_auth_${now()}`,
            actor: 'oauth_provider_callback',
        });

        return {
            status: 'oauth_completed',
            connector_id: authSession.connectorId,
            token_storage: 'key_vault_reference_only',
            secret_ref_id: secretRefId,
        };
    });

    app.post<{ Body: RefreshBody }>('/v1/connectors/oauth/refresh', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }

        const connectorType = normalizeConnectorType(request.body?.connector_type);
        if (!connectorType) {
            return reply.code(400).send({
                error: 'unsupported_connector',
                message: 'connector_type must be one of jira, teams, github, email',
            });
        }

        const workspaceId = request.body?.workspace_id ?? session.workspaceIds[0];
        if (!workspaceId || !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is not in your authenticated session scope.',
            });
        }

        const connectorId = buildConnectorId(connectorType, session.tenantId, workspaceId);
        const metadata = await repo.findAuthMetadata(connectorId);
        if (!metadata) {
            return reply.code(404).send({
                error: 'connector_not_found',
                message: 'Connector auth metadata not found.',
            });
        }

        if (metadata.status === 'revoked' || metadata.status === 'disconnected' || metadata.status === 'not_configured') {
            return reply.code(409).send({
                error: 'connector_not_refreshable',
                message: `Connector status ${metadata.status} requires new auth initiation.`,
            });
        }

        const needsReconsent =
            metadata.status === 'permission_invalid'
            || metadata.scopeStatus === 'insufficient'
            || metadata.lastErrorClass === 'insufficient_scope';

        if (needsReconsent) {
            await repo.upsertAuthMetadata({
                connectorId,
                tenantId: session.tenantId,
                workspaceId,
                connectorType,
                authMode: 'oauth2',
                status: 'consent_pending',
                scopeStatus: 'insufficient',
                lastErrorClass: 'insufficient_scope',
            });
            await repo.createAuthEvent({
                connectorId,
                tenantId: session.tenantId,
                eventType: 'oauth_refresh',
                result: 'requires_reconsent',
                correlationId: `corr_connector_auth_${now()}`,
                actor: session.userId,
            });
            return reply.code(409).send({
                error: 'reconsent_required',
                message: 'Connector permissions are insufficient; restart consent flow.',
            });
        }

        if (!metadata.secretRefId) {
            return reply.code(409).send({
                error: 'missing_token_reference',
                message: 'No token secret reference found. Re-initiate OAuth.',
            });
        }

        const force = request.body?.force === true;
        const expiresAtMs = metadata.tokenExpiresAt?.getTime() ?? 0;
        const shouldRefresh = force || expiresAtMs <= now() + REFRESH_EARLY_WINDOW_MS;

        if (!shouldRefresh) {
            return {
                status: 'refresh_skipped_not_due',
                connector_id: connectorId,
                token_expires_at: metadata.tokenExpiresAt?.toISOString() ?? null,
            };
        }

        const nextExpiry = new Date(now() + ACCESS_TOKEN_TTL_MS);
        await repo.upsertAuthMetadata({
            connectorId,
            tenantId: session.tenantId,
            workspaceId,
            connectorType,
            authMode: 'oauth2',
            status: 'connected',
            secretRefId: metadata.secretRefId,
            tokenExpiresAt: nextExpiry,
            lastRefreshAt: new Date(now()),
            scopeStatus: metadata.scopeStatus ?? 'full',
            lastErrorClass: null,
        });
        await repo.createAuthEvent({
            connectorId,
            tenantId: session.tenantId,
            eventType: 'oauth_refresh',
            result: 'success',
            correlationId: `corr_connector_auth_${now()}`,
            actor: session.userId,
        });

        return {
            status: 'refreshed',
            connector_id: connectorId,
            token_expires_at: nextExpiry.toISOString(),
        };
    });

    app.post<{ Body: RevokeBody }>('/v1/connectors/oauth/revoke', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }

        const connectorType = normalizeConnectorType(request.body?.connector_type);
        if (!connectorType) {
            return reply.code(400).send({
                error: 'unsupported_connector',
                message: 'connector_type must be one of jira, teams, github, email',
            });
        }

        const workspaceId = request.body?.workspace_id ?? session.workspaceIds[0];
        if (!workspaceId || !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is not in your authenticated session scope.',
            });
        }

        const connectorId = buildConnectorId(connectorType, session.tenantId, workspaceId);
        const metadata = await repo.findAuthMetadata(connectorId);
        if (!metadata) {
            return reply.code(404).send({
                error: 'connector_not_found',
                message: 'Connector auth metadata not found.',
            });
        }

        await repo.upsertAuthMetadata({
            connectorId,
            tenantId: session.tenantId,
            workspaceId,
            connectorType,
            authMode: 'oauth2',
            status: 'revoked',
            secretRefId: null,
            tokenExpiresAt: null,
            lastRefreshAt: null,
            scopeStatus: null,
            lastErrorClass: null,
        });
        await repo.createAuthEvent({
            connectorId,
            tenantId: session.tenantId,
            eventType: 'oauth_revoke',
            result: 'success',
            correlationId: `corr_connector_auth_${now()}`,
            actor: session.userId,
        });

        return {
            status: 'revoked',
            connector_id: connectorId,
        };
    });

    app.post<{ Body: ReportErrorBody }>('/v1/connectors/oauth/report-error', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }

        const connectorType = normalizeConnectorType(request.body?.connector_type);
        if (!connectorType) {
            return reply.code(400).send({
                error: 'unsupported_connector',
                message: 'connector_type must be one of jira, teams, github, email',
            });
        }

        const workspaceId = request.body?.workspace_id ?? session.workspaceIds[0];
        if (!workspaceId || !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is not in your authenticated session scope.',
            });
        }

        const errorClass = request.body?.error_class;
        if (errorClass !== 'permission_invalid' && errorClass !== 'token_expired' && errorClass !== 'insufficient_scope') {
            return reply.code(400).send({
                error: 'invalid_error_class',
                message: 'error_class must be one of permission_invalid, token_expired, insufficient_scope',
            });
        }

        const connectorId = buildConnectorId(connectorType, session.tenantId, workspaceId);
        const metadata = await repo.findAuthMetadata(connectorId);
        if (!metadata) {
            return reply.code(404).send({
                error: 'connector_not_found',
                message: 'Connector auth metadata not found.',
            });
        }

        const status = errorClass === 'token_expired' ? 'token_expired' : 'consent_pending';
        const mappedLastErrorClass = errorClass === 'token_expired' ? 'token_expired' : 'insufficient_scope';
        const scopeStatus = errorClass === 'token_expired' ? metadata.scopeStatus : 'insufficient';

        await repo.upsertAuthMetadata({
            connectorId,
            tenantId: session.tenantId,
            workspaceId,
            connectorType,
            authMode: 'oauth2',
            status,
            secretRefId: metadata.secretRefId,
            tokenExpiresAt: metadata.tokenExpiresAt,
            lastRefreshAt: metadata.lastRefreshAt,
            scopeStatus,
            lastErrorClass: mappedLastErrorClass,
        });
        await repo.createAuthEvent({
            connectorId,
            tenantId: session.tenantId,
            eventType: 'oauth_report_error',
            result: errorClass,
            correlationId: `corr_connector_auth_${now()}`,
            actor: session.userId,
        });

        return {
            status,
            connector_id: connectorId,
            next_action: status === 'consent_pending' ? 'reconsent' : 'refresh',
            reason: request.body?.reason ?? null,
        };
    });
};

export type { RegisterConnectorAuthRoutesOptions, ConnectorAuthRepo, SessionContext };
