import { prisma } from '../lib/db.js';
import type { SecretStore } from '../lib/secret-store.js';

const POLL_INTERVAL_ACTIVE_MS = 60_000;
const POLL_INTERVAL_IDLE_MS = 5 * 60_000;
const REFRESH_WINDOW_MS = 5 * 60_000;
const BATCH_SIZE = 25;

type ConnectorType = 'jira' | 'teams' | 'github' | 'email';
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

type ConnectorAuthMetadataRecord = {
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
};

type ConnectorTokenLifecycleRepo = {
    findRefreshCandidates(input: {
        refreshBefore: Date;
        limit: number;
    }): Promise<ConnectorAuthMetadataRecord[]>;
    updateMetadata(input: {
        connectorId: string;
        status: MetadataStatus;
        tokenExpiresAt?: Date | null;
        lastRefreshAt?: Date | null;
        scopeStatus?: ScopeStatus | null;
        lastErrorClass?: ErrorClass | null;
    }): Promise<void>;
    createAuthEvent(input: {
        connectorId: string;
        tenantId: string;
        eventType: string;
        result: string;
        errorClass?: ErrorClass | null;
        correlationId: string;
        actor: string;
    }): Promise<void>;
};

type WorkerLogger = {
    info: (message: string) => void;
    error: (message: string, error?: unknown) => void;
};

type WorkerDependencies = {
    repo: ConnectorTokenLifecycleRepo;
    secretStore: SecretStore;
    fetchImpl: typeof fetch;
    env: NodeJS.ProcessEnv;
    now: () => number;
    refreshWindowMs: number;
};

class OAuthRefreshError extends Error {
    constructor(
        public readonly errorClass: ErrorClass,
        public readonly statusCode: number,
        message: string,
    ) {
        super(message);
    }
}

const defaultLogger: WorkerLogger = {
    info: (message) => console.log(`[connector-token-worker] ${message}`),
    error: (message, error) => console.error(`[connector-token-worker] ${message}`, error),
};

const defaultRepo: ConnectorTokenLifecycleRepo = {
    async findRefreshCandidates({ refreshBefore, limit }) {
        return prisma.connectorAuthMetadata.findMany({
            where: {
                authMode: 'oauth2',
                OR: [
                    {
                        status: {
                            in: ['token_received', 'connected', 'degraded', 'token_expired', 'permission_invalid'] as never,
                        },
                    },
                ],
                AND: [
                    {
                        OR: [
                            { status: 'permission_invalid' as never },
                            { tokenExpiresAt: { lte: refreshBefore } },
                            { status: 'token_expired' as never },
                        ],
                    },
                ],
            },
            orderBy: { tokenExpiresAt: 'asc' },
            take: limit,
            select: {
                connectorId: true,
                tenantId: true,
                workspaceId: true,
                connectorType: true,
                authMode: true,
                status: true,
                secretRefId: true,
                tokenExpiresAt: true,
                lastRefreshAt: true,
                scopeStatus: true,
            },
        }) as Promise<ConnectorAuthMetadataRecord[]>;
    },
    async updateMetadata(input) {
        await prisma.connectorAuthMetadata.update({
            where: { connectorId: input.connectorId },
            data: {
                status: input.status as never,
                tokenExpiresAt: input.tokenExpiresAt,
                lastRefreshAt: input.lastRefreshAt,
                scopeStatus: input.scopeStatus as never,
                lastErrorClass: input.lastErrorClass as never,
            },
        });
    },
    async createAuthEvent(input) {
        await prisma.connectorAuthEvent.create({
            data: {
                connectorId: input.connectorId,
                tenantId: input.tenantId,
                eventType: input.eventType,
                result: input.result,
                errorClass: input.errorClass as never,
                correlationId: input.correlationId,
                actor: input.actor,
            },
        });
    },
};

let workerTimer: NodeJS.Timeout | null = null;
let workerStopping = false;
let inFlightTick = false;

const normalizeConnectorType = (value: string): ConnectorType | null => {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'jira' || normalized === 'teams' || normalized === 'github' || normalized === 'email') {
        return normalized;
    }
    return null;
};

const inferScopeStatus = (connectorType: ConnectorType, scopeValue: string | undefined): ScopeStatus => {
    if (!scopeValue) {
        return 'full';
    }

    const expectedScopes: Record<ConnectorType, string[]> = {
        email: ['offline_access', 'Mail.Send', 'User.Read'],
        github: ['read:user', 'repo', 'workflow'],
        jira: ['read:jira-work', 'write:jira-work', 'read:jira-user'],
        teams: ['offline_access', 'User.Read', 'ChannelMessage.Send'],
    };

    const normalizedScope = new Set(scopeValue.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean));
    const matched = expectedScopes[connectorType].filter((scope) => normalizedScope.has(scope));

    if (matched.length === expectedScopes[connectorType].length) {
        return 'full';
    }
    if (matched.length > 0) {
        return 'partial';
    }
    return 'insufficient';
};

const assertRefreshResponseOk = async (response: Response): Promise<void> => {
    if (response.ok) {
        return;
    }

    const text = await response.text().catch(() => '');
    if (response.status === 429) {
        throw new OAuthRefreshError('provider_rate_limited', 429, text || 'Provider rate limited refresh request.');
    }
    if (response.status >= 500) {
        throw new OAuthRefreshError('provider_unavailable', 502, text || 'Provider unavailable during refresh.');
    }
    throw new OAuthRefreshError('token_refresh_failed', 502, text || 'Token refresh rejected by provider.');
};

const parseRefreshJson = async (response: Response): Promise<unknown> => {
    const raw = await response.text();
    try {
        return JSON.parse(raw) as unknown;
    } catch {
        throw new OAuthRefreshError('token_refresh_failed', 502, raw || 'Provider returned invalid refresh payload.');
    }
};

const refreshTokenFromProvider = async (
    connectorType: ConnectorType,
    refreshToken: string,
    env: NodeJS.ProcessEnv,
    nowMs: number,
    fetchImpl: typeof fetch,
): Promise<{ credentials: Record<string, string>; expiresAt: Date; scopeStatus: ScopeStatus }> => {
    const clientId = env[`CONNECTOR_${connectorType.toUpperCase()}_CLIENT_ID`];
    const clientSecret = env[`CONNECTOR_${connectorType.toUpperCase()}_CLIENT_SECRET`];

    if (!clientId || !clientSecret) {
        throw new OAuthRefreshError('token_refresh_failed', 500, `Missing OAuth client credentials for ${connectorType}.`);
    }

    if (connectorType === 'github') {
        const tokenUrl = env.CONNECTOR_GITHUB_TOKEN_URL ?? 'https://github.com/login/oauth/access_token';
        const body = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        });

        const response = await fetchImpl(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            },
            body,
        });
        await assertRefreshResponseOk(response);

        const payload = (await parseRefreshJson(response)) as {
            access_token?: string;
            refresh_token?: string;
            expires_in?: number;
            scope?: string;
            error?: string;
            error_description?: string;
        };

        if (payload.error || !payload.access_token) {
            throw new OAuthRefreshError(
                payload.error === 'invalid_scope' ? 'insufficient_scope' : 'token_refresh_failed',
                502,
                payload.error_description ?? payload.error ?? 'GitHub refresh did not return access_token.',
            );
        }

        return {
            credentials: {
                access_token: payload.access_token,
                refresh_token: payload.refresh_token ?? refreshToken,
            },
            expiresAt: new Date(nowMs + (payload.expires_in ? payload.expires_in * 1000 : 60 * 60_000)),
            scopeStatus: inferScopeStatus('github', payload.scope),
        };
    }

    if (connectorType === 'jira') {
        const tokenUrl = env.CONNECTOR_JIRA_TOKEN_URL ?? 'https://auth.atlassian.com/oauth/token';
        const response = await fetchImpl(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({
                grant_type: 'refresh_token',
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
            }),
        });
        await assertRefreshResponseOk(response);

        const payload = (await parseRefreshJson(response)) as {
            access_token?: string;
            refresh_token?: string;
            expires_in?: number;
            scope?: string;
            error?: string;
            error_description?: string;
        };

        if (payload.error || !payload.access_token) {
            throw new OAuthRefreshError(
                payload.error === 'invalid_scope' ? 'insufficient_scope' : 'token_refresh_failed',
                502,
                payload.error_description ?? payload.error ?? 'Jira refresh did not return access_token.',
            );
        }

        const cloudId = env.CONNECTOR_JIRA_CLOUD_ID;
        if (!cloudId) {
            throw new OAuthRefreshError('token_refresh_failed', 500, 'Missing CONNECTOR_JIRA_CLOUD_ID for Jira refresh.');
        }

        return {
            credentials: {
                access_token: payload.access_token,
                refresh_token: payload.refresh_token ?? refreshToken,
                cloud_id: cloudId,
            },
            expiresAt: new Date(nowMs + (payload.expires_in ? payload.expires_in * 1000 : 60 * 60_000)),
            scopeStatus: inferScopeStatus('jira', payload.scope),
        };
    }

    if (connectorType === 'email') {
        const tenantId = env.CONNECTOR_EMAIL_TENANT_ID ?? 'common';
        const tokenUrl = env.CONNECTOR_EMAIL_TOKEN_URL
            ?? `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
        const body = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            scope: ['offline_access', 'Mail.Send', 'User.Read'].join(' '),
        });

        const response = await fetchImpl(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            },
            body,
        });
        await assertRefreshResponseOk(response);

        const payload = (await parseRefreshJson(response)) as {
            access_token?: string;
            refresh_token?: string;
            expires_in?: number;
            scope?: string;
            error?: string;
            error_description?: string;
        };

        if (payload.error || !payload.access_token) {
            throw new OAuthRefreshError(
                payload.error === 'invalid_scope' ? 'insufficient_scope' : 'token_refresh_failed',
                502,
                payload.error_description ?? payload.error ?? 'Email refresh did not return access_token.',
            );
        }

        return {
            credentials: {
                access_token: payload.access_token,
                refresh_token: payload.refresh_token ?? refreshToken,
                provider: 'microsoft_graph',
                tenant_id: tenantId,
            },
            expiresAt: new Date(nowMs + (payload.expires_in ? payload.expires_in * 1000 : 60 * 60_000)),
            scopeStatus: inferScopeStatus('email', payload.scope),
        };
    }

    const tenantId = env.CONNECTOR_TEAMS_TENANT_ID ?? 'common';
    const tokenUrl = env.CONNECTOR_TEAMS_TOKEN_URL
        ?? `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: ['offline_access', 'User.Read', 'ChannelMessage.Send'].join(' '),
    });

    const response = await fetchImpl(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        },
        body,
    });
    await assertRefreshResponseOk(response);

    const payload = (await parseRefreshJson(response)) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
        error?: string;
        error_description?: string;
    };

    if (payload.error || !payload.access_token) {
        throw new OAuthRefreshError(
            payload.error === 'invalid_scope' ? 'insufficient_scope' : 'token_refresh_failed',
            502,
            payload.error_description ?? payload.error ?? 'Teams refresh did not return access_token.',
        );
    }

    return {
        credentials: {
            access_token: payload.access_token,
            refresh_token: payload.refresh_token ?? refreshToken,
            tenant_id: tenantId,
        },
        expiresAt: new Date(nowMs + (payload.expires_in ? payload.expires_in * 1000 : 60 * 60_000)),
        scopeStatus: inferScopeStatus('teams', payload.scope),
    };
};

const processCandidate = async (
    candidate: ConnectorAuthMetadataRecord,
    deps: WorkerDependencies,
): Promise<void> => {
    const nowMs = deps.now();
    const correlationId = `corr_connector_refresh_${candidate.connectorId}_${nowMs}`;

    if (candidate.status === 'permission_invalid' || candidate.scopeStatus === 'insufficient') {
        await deps.repo.updateMetadata({
            connectorId: candidate.connectorId,
            status: 'consent_pending',
            lastErrorClass: 'insufficient_scope',
        });
        await deps.repo.createAuthEvent({
            connectorId: candidate.connectorId,
            tenantId: candidate.tenantId,
            eventType: 'oauth_refresh',
            result: 'requires_reconsent',
            errorClass: 'insufficient_scope',
            correlationId,
            actor: 'connector_token_lifecycle_worker',
        });
        return;
    }

    if (!candidate.secretRefId) {
        await deps.repo.updateMetadata({
            connectorId: candidate.connectorId,
            status: 'token_expired',
            lastErrorClass: 'token_expired',
        });
        await deps.repo.createAuthEvent({
            connectorId: candidate.connectorId,
            tenantId: candidate.tenantId,
            eventType: 'oauth_refresh',
            result: 'missing_token_reference',
            errorClass: 'token_expired',
            correlationId,
            actor: 'connector_token_lifecycle_worker',
        });
        return;
    }

    const rawSecret = await deps.secretStore.getSecret(candidate.secretRefId);
    if (!rawSecret) {
        await deps.repo.updateMetadata({
            connectorId: candidate.connectorId,
            status: 'degraded',
            lastErrorClass: 'secret_store_unavailable',
        });
        await deps.repo.createAuthEvent({
            connectorId: candidate.connectorId,
            tenantId: candidate.tenantId,
            eventType: 'oauth_refresh',
            result: 'secret_not_found',
            errorClass: 'secret_store_unavailable',
            correlationId,
            actor: 'connector_token_lifecycle_worker',
        });
        return;
    }

    let parsedSecret: Record<string, unknown>;
    try {
        parsedSecret = JSON.parse(rawSecret) as Record<string, unknown>;
    } catch {
        await deps.repo.updateMetadata({
            connectorId: candidate.connectorId,
            status: 'degraded',
            lastErrorClass: 'secret_store_unavailable',
        });
        await deps.repo.createAuthEvent({
            connectorId: candidate.connectorId,
            tenantId: candidate.tenantId,
            eventType: 'oauth_refresh',
            result: 'secret_parse_failed',
            errorClass: 'secret_store_unavailable',
            correlationId,
            actor: 'connector_token_lifecycle_worker',
        });
        return;
    }

    const refreshToken = typeof parsedSecret['refresh_token'] === 'string' ? parsedSecret['refresh_token'] : null;
    const isExpired = candidate.tokenExpiresAt ? candidate.tokenExpiresAt.getTime() <= nowMs : true;

    if (!refreshToken) {
        if (isExpired) {
            await deps.repo.updateMetadata({
                connectorId: candidate.connectorId,
                status: 'token_expired',
                lastErrorClass: 'token_expired',
            });
            await deps.repo.createAuthEvent({
                connectorId: candidate.connectorId,
                tenantId: candidate.tenantId,
                eventType: 'oauth_refresh',
                result: 'refresh_token_missing',
                errorClass: 'token_expired',
                correlationId,
                actor: 'connector_token_lifecycle_worker',
            });
        }
        return;
    }

    const connectorType = normalizeConnectorType(candidate.connectorType);
    if (!connectorType) {
        await deps.repo.updateMetadata({
            connectorId: candidate.connectorId,
            status: 'degraded',
            lastErrorClass: 'token_refresh_failed',
        });
        await deps.repo.createAuthEvent({
            connectorId: candidate.connectorId,
            tenantId: candidate.tenantId,
            eventType: 'oauth_refresh',
            result: 'unsupported_connector',
            errorClass: 'token_refresh_failed',
            correlationId,
            actor: 'connector_token_lifecycle_worker',
        });
        return;
    }

    try {
        const refreshed = await refreshTokenFromProvider(
            connectorType,
            refreshToken,
            deps.env,
            nowMs,
            deps.fetchImpl,
        );

        const mergedSecret = {
            ...parsedSecret,
            ...refreshed.credentials,
        };
        await deps.secretStore.setSecret(candidate.secretRefId, JSON.stringify(mergedSecret));

        await deps.repo.updateMetadata({
            connectorId: candidate.connectorId,
            status: 'connected',
            tokenExpiresAt: refreshed.expiresAt,
            lastRefreshAt: new Date(nowMs),
            scopeStatus: refreshed.scopeStatus,
            lastErrorClass: null,
        });
        await deps.repo.createAuthEvent({
            connectorId: candidate.connectorId,
            tenantId: candidate.tenantId,
            eventType: 'oauth_refresh',
            result: 'refreshed',
            correlationId,
            actor: 'connector_token_lifecycle_worker',
        });
    } catch (error) {
        const refreshError = error instanceof OAuthRefreshError
            ? error
            : new OAuthRefreshError('token_refresh_failed', 502, 'Unknown token refresh failure.');

        const fallbackStatus: MetadataStatus =
            refreshError.errorClass === 'insufficient_scope'
                ? 'consent_pending'
                : isExpired
                    ? 'token_expired'
                    : 'degraded';

        const fallbackErrorClass: ErrorClass =
            refreshError.errorClass === 'insufficient_scope'
                ? 'insufficient_scope'
                : isExpired
                    ? 'token_expired'
                    : refreshError.errorClass;

        await deps.repo.updateMetadata({
            connectorId: candidate.connectorId,
            status: fallbackStatus,
            lastErrorClass: fallbackErrorClass,
        });
        await deps.repo.createAuthEvent({
            connectorId: candidate.connectorId,
            tenantId: candidate.tenantId,
            eventType: 'oauth_refresh',
            result: 'refresh_failed',
            errorClass: fallbackErrorClass,
            correlationId,
            actor: 'connector_token_lifecycle_worker',
        });
    }
};

const buildDependencies = (override: Partial<WorkerDependencies> = {}): WorkerDependencies => {
    if (!override.secretStore) {
        throw new Error('connector token worker requires a configured secretStore');
    }

    return {
        repo: override.repo ?? defaultRepo,
        secretStore: override.secretStore,
        fetchImpl: override.fetchImpl ?? fetch,
        env: override.env ?? process.env,
        now: override.now ?? (() => Date.now()),
        refreshWindowMs: override.refreshWindowMs ?? REFRESH_WINDOW_MS,
    };
};

export const runConnectorTokenLifecycleTick = async (
    override: Partial<WorkerDependencies> = {},
): Promise<{ processed: number }> => {
    const deps = buildDependencies(override);
    const refreshBefore = new Date(deps.now() + deps.refreshWindowMs);
    const candidates = await deps.repo.findRefreshCandidates({
        refreshBefore,
        limit: BATCH_SIZE,
    });

    for (const candidate of candidates) {
        await processCandidate(candidate, deps);
    }

    return { processed: candidates.length };
};

const scheduleNext = (logger: WorkerLogger, deps: Partial<WorkerDependencies>, delayMs: number) => {
    if (workerStopping) {
        return;
    }

    workerTimer = setTimeout(async () => {
        if (workerStopping) {
            return;
        }

        if (inFlightTick) {
            scheduleNext(logger, deps, POLL_INTERVAL_ACTIVE_MS);
            return;
        }

        inFlightTick = true;
        try {
            const result = await runConnectorTokenLifecycleTick(deps);
            const nextDelay = result.processed > 0 ? POLL_INTERVAL_ACTIVE_MS : POLL_INTERVAL_IDLE_MS;
            scheduleNext(logger, deps, nextDelay);
        } catch (error) {
            logger.error('connector token lifecycle tick failed', error);
            scheduleNext(logger, deps, POLL_INTERVAL_ACTIVE_MS);
        } finally {
            inFlightTick = false;
        }
    }, delayMs);
};

export const startConnectorTokenLifecycleWorker = (
    logger: WorkerLogger = defaultLogger,
    deps: Partial<WorkerDependencies> = {},
): void => {
    if (workerTimer) {
        logger.info('connector token lifecycle worker already running');
        return;
    }

    workerStopping = false;
    scheduleNext(logger, deps, 1_000);
    logger.info('connector token lifecycle worker started');
};

export const stopConnectorTokenLifecycleWorker = (): void => {
    workerStopping = true;
    if (workerTimer) {
        clearTimeout(workerTimer);
        workerTimer = null;
    }
};
