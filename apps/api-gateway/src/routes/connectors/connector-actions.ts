import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
    CONNECTOR_REGISTRY,
    type AgentRoleKey,
    type ConnectorTool,
    type NormalizedActionType,
} from '@agentfarm/connector-contracts';
import type { SecretStore } from '../../lib/secret-store.js';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

type ConnectorType = 'jira' | 'teams' | 'github' | 'email' | 'custom_api' | 'slack' | 'gitlab' | 'linear';
type ConnectorActionType =
    | 'read_task'
    | 'create_comment'
    | 'update_status'
    | 'send_message'
    | 'create_pr_comment'
    | 'create_pr'
    | 'merge_pr'
    | 'list_prs'
    | 'send_email';

type ConnectorActionErrorCode =
    | 'rate_limit'
    | 'timeout'
    | 'provider_unavailable'
    | 'permission_denied'
    | 'invalid_format'
    | 'unsupported_action'
    | 'upgrade_required';

type ConnectorActionStatus = 'success' | 'failed' | 'timeout';

type ConnectorAuthMetadata = {
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

type ConnectorActionLogRecord = {
    actionId: string;
    tenantId: string;
    workspaceId: string;
    botId: string;
    connectorId: string;
    connectorType: ConnectorType;
    actionType: ConnectorActionType;
    contractVersion: string;
    correlationId: string;
    requestBody: Record<string, unknown>;
    resultStatus: ConnectorActionStatus;
    providerResponseCode: string | null;
    resultSummary: string;
    errorCode: ConnectorActionErrorCode | null;
    errorMessage: string | null;
    remediationHint: string | null;
    completedAt: Date;
};

type ConnectorActionRepo = {
    findAuthMetadata(connectorId: string): Promise<ConnectorAuthMetadata | null>;
    upsertAuthMetadata(input: {
        connectorId: string;
        tenantId: string;
        workspaceId: string;
        connectorType: ConnectorType;
        status: string;
        authMode: string;
        displayName?: string | null;
    }): Promise<ConnectorAuthMetadata>;
    renameConnector(input: {
        connectorId: string;
        displayName: string;
    }): Promise<void>;
    listAuthMetadata(input: {
        tenantId: string;
        workspaceId: string;
        connectorType?: ConnectorType;
    }): Promise<ConnectorAuthMetadata[]>;
    updateAuthMetadata(input: {
        connectorId: string;
        tenantId: string;
        workspaceId: string;
        connectorType: ConnectorType;
        status: string;
        authMode: string;
        secretRefId?: string | null;
        scopeStatus?: 'full' | 'partial' | 'insufficient' | null;
        lastHealthcheckAt?: Date | null;
        displayName?: string | null;
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
    createConnectorActionLog(record: ConnectorActionLogRecord): Promise<void>;
    listConnectorActions(input: {
        tenantId: string;
        connectorId: string;
        limit: number;
        cursor?: Date;
    }): Promise<ActionLogRow[]>;
    // C6.2 — persist + read the OpenAPI tool catalog for self-describing Custom API connectors.
    setOpenapiCatalog?(input: {
        connectorId: string;
        tenantId: string;
        catalog: unknown;
    }): Promise<void>;
    listOpenapiCatalogs?(input: {
        tenantId: string;
        workspaceId?: string;
    }): Promise<Array<{ connectorId: string; displayName: string | null; catalog: unknown }>>;
};

type ActionLogRow = {
    id: string;
    actionId: string;
    connectorId: string;
    connectorType: string;
    actionType: string;
    resultStatus: string;
    resultSummary: string;
    errorCode: string | null;
    errorMessage: string | null;
    remediationHint: string | null;
    completedAt: Date;
    createdAt: Date;
};

type HealthProbeResult = {
    outcome: 'ok' | 'auth_failure' | 'rate_limited' | 'network_timeout';
    message: string;
};

type ConnectorHealthProbe = (input: {
    connectorType: ConnectorType;
    metadata: ConnectorAuthMetadata;
}) => Promise<HealthProbeResult>;

type ProviderExecutionResult = {
    ok: boolean;
    providerResponseCode: string;
    resultSummary: string;
    transient?: boolean;
    errorCode?: ConnectorActionErrorCode;
    errorMessage?: string;
    remediationHint?: string;
};

type ProviderExecutor = (input: {
    connectorType: ConnectorType;
    actionType: ConnectorActionType;
    payload: Record<string, unknown>;
    attempt: number;
    secretRefId: string | null;
}) => Promise<ProviderExecutionResult>;

type ConnectorApprovalChecker = {
    findByAction(input: {
        tenantId: string;
        workspaceId: string;
        actionId: string;
    }): Promise<{ decision: string } | null>;
};

type ConnectorAuditWriter = {
    createEvent(input: {
        tenantId: string;
        workspaceId: string;
        botId: string;
        eventType: string;
        severity: 'info' | 'warn' | 'error' | 'critical';
        summary: string;
        sourceSystem: string;
        correlationId: string;
        createdAt: Date;
    }): Promise<unknown>;
};

type RegisterConnectorActionRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    repo?: ConnectorActionRepo;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    providerExecutor?: ProviderExecutor;
    connectorHealthProbe?: ConnectorHealthProbe;
    serviceAuthToken?: string;
    secretStore?: SecretStore;
    approvalChecker?: ConnectorApprovalChecker;
    auditWriter?: ConnectorAuditWriter;
};

type ExecuteActionBody = {
    tenant_id?: string;
    role_key?: string;
    connector_type?: string;
    workspace_id?: string;
    bot_id?: string;
    action_type?: string;
    payload?: Record<string, unknown>;
    correlation_id?: string;
    claim_token?: string;
    approval_action_id?: string;
    lease_metadata?: {
        lease_id?: string;
        idempotency_key?: string;
        claimed_by?: string;
        claimed_at?: number;
        expires_at?: number;
        status?: string;
        correlation_id?: string;
    };
};

type HealthCheckBody = {
    connector_type?: string;
    workspace_id?: string;
};


const SUPPORTED_CONNECTORS: ConnectorType[] = ['jira', 'teams', 'github', 'email', 'custom_api', 'slack', 'gitlab', 'linear'];
const SUPPORTED_ACTIONS: ConnectorActionType[] = [
    'read_task',
    'create_comment',
    'update_status',
    'send_message',
    'create_pr_comment',
    'create_pr',
    'merge_pr',
    'list_prs',
    'send_email',
];

const CONTRACT_VERSION = 'v1.0';
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 50;

const CONNECTOR_ACTION_RISK: Record<ConnectorActionType, 'low' | 'medium' | 'high'> = {
    read_task: 'low',
    list_prs: 'low',
    create_comment: 'medium',
    create_pr_comment: 'medium',
    update_status: 'medium',
    send_message: 'medium',
    send_email: 'medium',
    create_pr: 'high',
    merge_pr: 'high',
};

const SUPPORTED_ROLE_KEYS: AgentRoleKey[] = [
    'recruiter',
    'developer',
    'fullstack_developer',
    'tester',
    'business_analyst',
    'technical_writer',
    'content_writer',
    'sales_rep',
    'marketing_specialist',
    'corporate_assistant',
    'customer_support_executive',
    'project_manager_product_owner_scrum_master',
];

const CONNECTOR_TOOL_ALIAS: Record<ConnectorType, ConnectorTool | null> = {
    jira: 'jira',
    teams: 'teams',
    github: 'github',
    email: null,
    custom_api: null,
    slack: 'slack',
    gitlab: 'gitlab',
    linear: 'linear',
};

const ACTION_ALIAS: Record<ConnectorActionType, NormalizedActionType> = {
    read_task: 'get_task',
    create_comment: 'add_comment',
    update_status: 'update_task_status',
    send_message: 'send_message',
    create_pr_comment: 'add_pr_comment',
    create_pr: 'create_pr',
    merge_pr: 'merge_pr',
    list_prs: 'list_prs',
    send_email: 'send_email',
};

const getPrisma = async () => {
    const db = await import('../../lib/db.js');
    return db.prisma;
};

const defaultRepo: ConnectorActionRepo = {
    async findAuthMetadata(connectorId) {
        const prisma = await getPrisma();
        return prisma.connectorAuthMetadata.findUnique({
            where: { connectorId },
            select: {
                connectorId: true,
                tenantId: true,
                workspaceId: true,
                connectorType: true,
                displayName: true,
                status: true,
                secretRefId: true,
                scopeStatus: true,
                lastErrorClass: true,
            },
        });
    },
    async upsertAuthMetadata(input) {
        const prisma = await getPrisma();
        return prisma.connectorAuthMetadata.upsert({
            where: { connectorId: input.connectorId },
            create: {
                connectorId: input.connectorId,
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                connectorType: input.connectorType,
                displayName: input.displayName ?? null,
                status: input.status as never,
                authMode: input.authMode,
            },
            update: input.displayName ? { displayName: input.displayName } : {},
            select: {
                connectorId: true,
                tenantId: true,
                workspaceId: true,
                connectorType: true,
                displayName: true,
                status: true,
                secretRefId: true,
                scopeStatus: true,
                lastErrorClass: true,
            },
        });
    },
    async renameConnector(input) {
        const prisma = await getPrisma();
        await prisma.connectorAuthMetadata.update({
            where: { connectorId: input.connectorId },
            data: { displayName: input.displayName },
        });
    },
    async listAuthMetadata(input) {
        const prisma = await getPrisma();
        return prisma.connectorAuthMetadata.findMany({
            where: {
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                connectorType: input.connectorType,
            },
            select: {
                connectorId: true,
                tenantId: true,
                workspaceId: true,
                connectorType: true,
                displayName: true,
                status: true,
                secretRefId: true,
                scopeStatus: true,
                lastErrorClass: true,
                lastHealthcheckAt: true,
            },
        });
    },
    async updateAuthMetadata(input) {
        const prisma = await getPrisma();
        await prisma.connectorAuthMetadata.upsert({
            where: { connectorId: input.connectorId },
            create: {
                connectorId: input.connectorId,
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                connectorType: input.connectorType,
                displayName: input.displayName ?? null,
                authMode: input.authMode,
                status: input.status as never,
                grantedScopes: [],
                secretRefId: input.secretRefId ?? null,
                scopeStatus: input.scopeStatus as never,
                lastHealthcheckAt: input.lastHealthcheckAt ?? null,
                lastErrorClass: input.lastErrorClass as never,
            },
            update: {
                status: input.status as never,
                secretRefId: input.secretRefId,
                scopeStatus: input.scopeStatus as never,
                lastHealthcheckAt: input.lastHealthcheckAt,
                lastErrorClass: input.lastErrorClass as never,
                ...(input.displayName ? { displayName: input.displayName } : {}),
            },
        });
    },
    async createConnectorActionLog(record) {
        const prisma = await getPrisma();
        await prisma.connectorAction.create({
            data: {
                actionId: record.actionId,
                tenantId: record.tenantId,
                workspaceId: record.workspaceId,
                botId: record.botId,
                connectorId: record.connectorId,
                connectorType: record.connectorType,
                actionType: record.actionType as never,
                contractVersion: record.contractVersion,
                correlationId: record.correlationId,
                requestBody: record.requestBody as never,
                resultStatus: record.resultStatus as never,
                providerResponseCode: record.providerResponseCode,
                resultSummary: record.resultSummary,
                errorCode: record.errorCode as never,
                errorMessage: record.errorMessage,
                remediationHint: record.remediationHint,
                completedAt: record.completedAt,
            },
        });
    },
    async listConnectorActions(input) {
        const prisma = await getPrisma();
        return prisma.connectorAction.findMany({
            where: {
                tenantId: input.tenantId,
                connectorId: input.connectorId,
                ...(input.cursor ? { createdAt: { lt: input.cursor } } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: input.limit,
            select: {
                id: true,
                actionId: true,
                connectorId: true,
                connectorType: true,
                actionType: true,
                resultStatus: true,
                resultSummary: true,
                errorCode: true,
                errorMessage: true,
                remediationHint: true,
                completedAt: true,
                createdAt: true,
            },
        });
    },
    async setOpenapiCatalog(input) {
        const prisma = await getPrisma();
        await prisma.connectorAuthMetadata.update({
            where: { connectorId: input.connectorId },
            data: { openapiCatalog: input.catalog as never },
        });
    },
    async listOpenapiCatalogs(input) {
        const prisma = await getPrisma();
        const rows = await prisma.connectorAuthMetadata.findMany({
            where: {
                tenantId: input.tenantId,
                ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
                connectorType: 'custom_api',
                NOT: { openapiCatalog: { equals: null as never } },
            },
            select: { connectorId: true, displayName: true, openapiCatalog: true },
        });
        return rows.map((r) => ({
            connectorId: r.connectorId,
            displayName: r.displayName,
            catalog: r.openapiCatalog,
        }));
    },
};

const defaultSleep = async (ms: number): Promise<void> => {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
};

const readServiceToken = (request: FastifyRequest): string | null => {
    const direct = request.headers['x-connector-exec-token'];
    if (typeof direct === 'string' && direct.trim()) {
        return direct.trim();
    }

    const authHeader = request.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
        return authHeader.slice(7).trim();
    }

    return null;
};

const normalizeConnectorType = (value: string | undefined): ConnectorType | null => {
    if (!value) {
        return null;
    }
    const normalized = value.trim().toLowerCase() as ConnectorType;
    return SUPPORTED_CONNECTORS.includes(normalized) ? normalized : null;
};

const normalizeActionType = (value: string | undefined): ConnectorActionType | null => {
    if (!value) {
        return null;
    }
    const normalized = value.trim().toLowerCase() as ConnectorActionType;
    return SUPPORTED_ACTIONS.includes(normalized) ? normalized : null;
};

const normalizeRoleKey = (value: string | undefined): AgentRoleKey | null => {
    if (!value) {
        return null;
    }

    const normalized = value.trim().toLowerCase() as AgentRoleKey;
    return SUPPORTED_ROLE_KEYS.includes(normalized) ? normalized : null;
};

const isRoleAllowed = (input: {
    connectorType: ConnectorType;
    actionType: ConnectorActionType;
    roleKey: AgentRoleKey;
}): {
    allowed: boolean;
    reasonCode?: 'role_not_allowed_for_connector' | 'action_not_allowed_for_role';
    message?: string;
} => {
    const connectorTool = CONNECTOR_TOOL_ALIAS[input.connectorType];
    const normalizedAction = ACTION_ALIAS[input.actionType];

    // Email and custom_api are treated as built-in channels until dedicated connector
    // registry entries exist in connector-contracts.
    if (connectorTool === null) {
        if (input.connectorType === 'email' && normalizedAction !== 'send_email') {
            return {
                allowed: false,
                reasonCode: 'action_not_allowed_for_role',
                message: 'Email connector currently supports send_email only.',
            };
        }

        if (input.connectorType === 'custom_api' && !SUPPORTED_ACTIONS.includes(input.actionType)) {
            return {
                allowed: false,
                reasonCode: 'action_not_allowed_for_role',
                message: `custom_api does not support action ${input.actionType}.`,
            };
        }

        return { allowed: true };
    }

    const connectorDefinition = CONNECTOR_REGISTRY.find((entry) => entry.tool === connectorTool);
    if (!connectorDefinition) {
        return {
            allowed: false,
            reasonCode: 'role_not_allowed_for_connector',
            message: 'Connector definition not found in registry.',
        };
    }

    const allowedRoles = connectorDefinition.allowedRoles ?? [];
    if (allowedRoles.length > 0 && !allowedRoles.includes(input.roleKey)) {
        return {
            allowed: false,
            reasonCode: 'role_not_allowed_for_connector',
            message: `Role ${input.roleKey} is not allowed to use connector ${input.connectorType}.`,
        };
    }

    const rolePolicy = connectorDefinition.defaultActionPolicyByRole?.[input.roleKey];
    if (rolePolicy && !rolePolicy.includes(normalizedAction)) {
        return {
            allowed: false,
            reasonCode: 'action_not_allowed_for_role',
            message: `Action ${input.actionType} is outside the role policy for ${input.roleKey}.`,
        };
    }

    if (!connectorDefinition.supportedActions.includes(normalizedAction)) {
        return {
            allowed: false,
            reasonCode: 'action_not_allowed_for_role',
            message: `Connector ${input.connectorType} does not support action ${input.actionType}.`,
        };
    }

    return { allowed: true };
};

const buildConnectorId = (connectorType: ConnectorType, tenantId: string, workspaceId: string): string => {
    return `${connectorType}:${tenantId}:${workspaceId}`;
};

/**
 * Fail-closed executor: used when no real provider executor and no secretStore are
 * configured. It NEVER fakes success — it returns an honest "not configured" error so a
 * misconfigured deployment cannot silently no-op while reporting success to agents.
 */
export const failClosedProviderExecutor: ProviderExecutor = async ({ connectorType, actionType }) => ({
    ok: false,
    providerResponseCode: '503',
    resultSummary: 'Connector execution is not configured.',
    errorCode: 'provider_unavailable',
    errorMessage:
        `No secret store / provider executor is configured for connector "${connectorType}" ` +
        `(action "${actionType}"). The action was NOT executed.`,
    remediationHint:
        'Configure a secret store (Azure Key Vault) so real provider clients are used, ' +
        'or inject an explicit providerExecutor (tests use the simulator).',
});

/**
 * Simulator. OPT-IN ONLY — must be explicitly injected via `providerExecutor`.
 * Never used as an automatic fallback in production. Honours `simulate_*` payload knobs
 * so the retry/error-class handling can be exercised in tests.
 */
export const simulateProviderExecutor: ProviderExecutor = async ({ actionType, payload, attempt }) => {
    const configuredTransientFailures = Number(payload['simulate_transient_failures'] ?? 0);
    if (Number.isFinite(configuredTransientFailures) && configuredTransientFailures > 0 && attempt <= configuredTransientFailures) {
        return {
            ok: false,
            providerResponseCode: '503',
            resultSummary: 'Provider unavailable, retryable.',
            transient: true,
            errorCode: 'provider_unavailable',
            errorMessage: 'Simulated transient provider unavailability.',
            remediationHint: 'Automatic retry with exponential backoff.',
        };
    }

    const simulatedError = typeof payload['simulate_error_code'] === 'string' ? payload['simulate_error_code'] : null;
    if (simulatedError === 'permission_denied') {
        return {
            ok: false,
            providerResponseCode: '403',
            resultSummary: 'Provider rejected action due to permission error.',
            errorCode: 'permission_denied',
            errorMessage: 'Connector permission does not allow this action.',
            remediationHint: 'Re-consent connector scopes in settings.',
        };
    }
    if (simulatedError === 'timeout') {
        return {
            ok: false,
            providerResponseCode: '504',
            resultSummary: 'Provider timeout.',
            transient: true,
            errorCode: 'timeout',
            errorMessage: 'Provider timed out while executing action.',
            remediationHint: 'Retry action with backoff.',
        };
    }
    if (simulatedError === 'rate_limit') {
        return {
            ok: false,
            providerResponseCode: '429',
            resultSummary: 'Provider rate limit reached.',
            transient: true,
            errorCode: 'rate_limit',
            errorMessage: 'Rate limit reached on provider API.',
            remediationHint: 'Retry later with exponential backoff.',
        };
    }

    return {
        ok: true,
        providerResponseCode: '200',
        resultSummary: `Action ${actionType} executed successfully.`,
    };
};

const defaultConnectorHealthProbe: ConnectorHealthProbe = async ({ metadata }) => {
    if (metadata.status === 'permission_invalid' || metadata.status === 'consent_pending') {
        return {
            outcome: 'auth_failure',
            message: 'Connector auth is invalid; re-authentication required.',
        };
    }
    if (metadata.lastErrorClass === 'provider_rate_limited') {
        return {
            outcome: 'rate_limited',
            message: 'Provider reports rate limiting.',
        };
    }
    if (metadata.lastErrorClass === 'provider_unavailable' || metadata.lastErrorClass === 'secret_store_unavailable') {
        return {
            outcome: 'network_timeout',
            message: 'Provider currently unavailable or timed out.',
        };
    }
    return {
        outcome: 'ok',
        message: 'Connector health probe passed.',
    };
};

const classifyConnectorAvailability = (metadata: ConnectorAuthMetadata): {
    allowed: boolean;
    errorCode?: ConnectorActionErrorCode;
    message?: string;
} => {
    if (metadata.status === 'revoked' || metadata.status === 'disconnected' || metadata.status === 'not_configured') {
        return {
            allowed: false,
            errorCode: 'upgrade_required',
            message: `Connector status ${metadata.status} requires re-authentication.`,
        };
    }

    if (metadata.status === 'permission_invalid' || metadata.scopeStatus === 'insufficient' || metadata.lastErrorClass === 'insufficient_scope') {
        return {
            allowed: false,
            errorCode: 'permission_denied',
            message: 'Connector permissions are insufficient. Re-consent required.',
        };
    }

    if (!metadata.secretRefId) {
        return {
            allowed: false,
            errorCode: 'upgrade_required',
            message: 'Connector token reference missing. Re-initiate connector auth.',
        };
    }

    return { allowed: true };
};

export const registerConnectorActionRoutes = async (
    app: FastifyInstance,
    options: RegisterConnectorActionRoutesOptions,
): Promise<void> => {
    const repo = options.repo ?? defaultRepo;
    const now = options.now ?? (() => Date.now());
    const sleep = options.sleep ?? defaultSleep;
    const approvalChecker = options.approvalChecker ?? null;
    const auditWriter = options.auditWriter ?? null;

    // If a real secretStore is provided and no explicit executor override, use real provider clients.
    let providerExecutor = options.providerExecutor;
    let connectorHealthProbe = options.connectorHealthProbe;
    if (!providerExecutor && options.secretStore) {
        const { createRealProviderExecutor, createRealConnectorHealthProbe } = await import('../../lib/provider-clients.js');
        providerExecutor = createRealProviderExecutor(options.secretStore);
        if (!connectorHealthProbe) {
            connectorHealthProbe = createRealConnectorHealthProbe(options.secretStore);
        }
    }
    // No real executor and no secret store: fail closed by default so a misconfigured
    // deployment can never silently simulate success. The simulator is opt-in only via
    // AF_CONNECTOR_SIMULATE=1 (used by tests and local dev).
    providerExecutor ??=
        process.env.AF_CONNECTOR_SIMULATE === '1' ? simulateProviderExecutor : failClosedProviderExecutor;
    connectorHealthProbe ??= defaultConnectorHealthProbe;
    const serviceAuthToken =
        options.serviceAuthToken
        ?? process.env.AGENTFARM_CONNECTOR_EXEC_SHARED_TOKEN
        ?? process.env.CONNECTOR_EXEC_SHARED_TOKEN
        ?? null;

    app.post<{ Body: ExecuteActionBody }>('/v1/connectors/actions/execute', async (request, reply) => {
        const session = options.getSession(request);
        const providedServiceToken = readServiceToken(request);
        const serviceAuthorized = Boolean(
            !session && serviceAuthToken && providedServiceToken && providedServiceToken === serviceAuthToken,
        );

        if (!session && !serviceAuthorized) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }

        const connectorType = normalizeConnectorType(request.body?.connector_type);
        if (!connectorType) {
            return reply.code(400).send({
                error: 'invalid_connector_type',
                message: 'connector_type must be one of jira, teams, github, email, custom_api',
            });
        }

        const actionType = normalizeActionType(request.body?.action_type);
        if (!actionType) {
            return reply.code(400).send({
                error: 'unsupported_action',
                message: 'action_type must be one of read_task, create_comment, update_status, send_message, create_pr_comment, create_pr, merge_pr, list_prs, send_email',
            });
        }

        const workspaceId = request.body?.workspace_id ?? session?.workspaceIds[0];
        if (!workspaceId) {
            return reply.code(400).send({
                error: 'invalid_workspace_id',
                message: 'workspace_id is required.',
            });
        }

        if (session && !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is not in your authenticated session scope.',
            });
        }

        const tenantId = session?.tenantId ?? request.body?.tenant_id?.trim();
        if (!tenantId) {
            return reply.code(400).send({
                error: 'invalid_tenant_id',
                message: 'tenant_id is required for service-authenticated execution.',
            });
        }

        const botId = request.body?.bot_id?.trim();
        if (!botId) {
            return reply.code(400).send({
                error: 'invalid_bot_id',
                message: 'bot_id is required.',
            });
        }

        const roleKey = normalizeRoleKey(request.body?.role_key);
        if (!roleKey) {
            return reply.code(400).send({
                error: 'invalid_role_key',
                message: 'role_key is required and must be a supported role.',
            });
        }

        const roleAuthorization = isRoleAllowed({
            connectorType,
            actionType,
            roleKey,
        });
        if (!roleAuthorization.allowed) {
            return reply.code(403).send({
                error: roleAuthorization.reasonCode,
                reason_code: roleAuthorization.reasonCode,
                message: roleAuthorization.message,
            });
        }

        const payload = request.body?.payload ?? {};
        const requestBodyForLog: Record<string, unknown> = {
            ...payload,
            _control_plane: {
                claim_token: request.body?.claim_token ?? null,
                lease_metadata: request.body?.lease_metadata ?? null,
            },
        };
        const connectorId = buildConnectorId(connectorType, tenantId, workspaceId);
        const actionId = `action_${now()}_${Math.random().toString(16).slice(2, 10)}`;
        const correlationId = request.body?.correlation_id ?? `corr_connector_action_${now()}`;

        const metadata = await repo.findAuthMetadata(connectorId);
        if (!metadata) {
            return reply.code(404).send({
                error: 'connector_not_found',
                message: 'Connector authentication metadata not found.',
            });
        }

        const availability = classifyConnectorAvailability(metadata);
        if (!availability.allowed) {
            try {
                await repo.createConnectorActionLog({
                    actionId,
                    tenantId,
                    workspaceId,
                    botId,
                    connectorId,
                    connectorType,
                    actionType,
                    contractVersion: CONTRACT_VERSION,
                    correlationId,
                    requestBody: requestBodyForLog,
                    resultStatus: 'failed',
                    providerResponseCode: '403',
                    resultSummary: availability.message ?? 'Connector unavailable for action execution.',
                    errorCode: availability.errorCode ?? 'permission_denied',
                    errorMessage: availability.message ?? null,
                    remediationHint: 'Reconnect connector or re-consent required scopes.',
                    completedAt: new Date(now()),
                });
            } catch { /* audit log write must not block the response */ }

            return reply.code(409).send({
                error: 'connector_unavailable',
                message: availability.message,
                error_code: availability.errorCode,
            });
        }

        // Approval gate: when an approvalChecker is configured, medium and high risk
        // actions require an approved approval record before execution.
        const riskLevel = CONNECTOR_ACTION_RISK[actionType];
        if (riskLevel !== 'low' && approvalChecker) {
            const approvalActionId = request.body?.approval_action_id?.trim() ?? null;
            if (!approvalActionId) {
                return reply.code(403).send({
                    error: 'action_awaiting_approval',
                    reason_code: 'approval_required',
                    message: `Action ${actionType} requires an approved approval record. Provide approval_action_id.`,
                    risk_level: riskLevel,
                });
            }

            const approvalRecord = await approvalChecker.findByAction({
                tenantId,
                workspaceId,
                actionId: approvalActionId,
            });
            if (!approvalRecord) {
                return reply.code(403).send({
                    error: 'action_awaiting_approval',
                    reason_code: 'approval_not_found',
                    message: `No approval record found for approval_action_id ${approvalActionId}.`,
                    risk_level: riskLevel,
                });
            }
            if (approvalRecord.decision !== 'approved') {
                return reply.code(403).send({
                    error: 'action_awaiting_approval',
                    reason_code: 'approval_not_granted',
                    message: `Approval for action ${approvalActionId} has status '${approvalRecord.decision}'. Execution blocked.`,
                    risk_level: riskLevel,
                    approval_decision: approvalRecord.decision,
                });
            }
        }

        let attempt = 0;
        let finalResult: ProviderExecutionResult | null = null;
        while (attempt < MAX_ATTEMPTS) {
            attempt += 1;
            const result = await providerExecutor({
                connectorType,
                actionType,
                payload,
                attempt,
                secretRefId: metadata.secretRefId,
            });
            finalResult = result;

            if (result.ok) {
                break;
            }

            if (result.transient === true && attempt < MAX_ATTEMPTS) {
                const delayMs = BASE_BACKOFF_MS * (2 ** (attempt - 1));
                await sleep(delayMs);
                continue;
            }

            break;
        }

        if (!finalResult || finalResult.ok) {
            try {
                await repo.createConnectorActionLog({
                    actionId,
                    tenantId,
                    workspaceId,
                    botId,
                    connectorId,
                    connectorType,
                    actionType,
                    contractVersion: CONTRACT_VERSION,
                    correlationId,
                    requestBody: requestBodyForLog,
                    resultStatus: 'success',
                    providerResponseCode: finalResult?.providerResponseCode ?? '200',
                    resultSummary: finalResult?.resultSummary ?? 'Action executed successfully.',
                    errorCode: null,
                    errorMessage: null,
                    remediationHint: null,
                    completedAt: new Date(now()),
                });
            } catch { /* audit log write must not block the response */ }

            if (auditWriter) {
                await auditWriter.createEvent({
                    tenantId,
                    workspaceId,
                    botId,
                    eventType: 'connector_action_executed',
                    severity: 'info',
                    summary: `Connector action ${actionType} on ${connectorType} executed successfully (action_id: ${actionId}).`,
                    sourceSystem: 'connector-actions',
                    correlationId,
                    createdAt: new Date(now()),
                });
            }

            return {
                status: 'success',
                action_id: actionId,
                connector_id: connectorId,
                connector_type: connectorType,
                action_type: actionType,
                attempts: attempt,
                contract_version: CONTRACT_VERSION,
                provider_response_code: finalResult?.providerResponseCode ?? '200',
                result_summary: finalResult?.resultSummary ?? 'Action executed successfully.',
            };
        }

        const resolvedErrorCode = finalResult.errorCode ?? 'provider_unavailable';
        const status: ConnectorActionStatus = resolvedErrorCode === 'timeout' ? 'timeout' : 'failed';

        try {
            await repo.createConnectorActionLog({
                actionId,
                tenantId,
                workspaceId,
                botId,
                connectorId,
                connectorType,
                actionType,
                contractVersion: CONTRACT_VERSION,
                correlationId,
                requestBody: requestBodyForLog,
                resultStatus: status,
                providerResponseCode: finalResult.providerResponseCode,
                resultSummary: finalResult.resultSummary,
                errorCode: resolvedErrorCode,
                errorMessage: finalResult.errorMessage ?? null,
                remediationHint: finalResult.remediationHint ?? null,
                completedAt: new Date(now()),
            });
        } catch { /* audit log write must not block the response */ }

        if (resolvedErrorCode === 'permission_denied') {
            await repo.updateAuthMetadata({
                connectorId,
                tenantId,
                workspaceId,
                connectorType,
                authMode: 'oauth2',
                status: 'permission_invalid',
                secretRefId: metadata.secretRefId,
                scopeStatus: 'insufficient',
                lastErrorClass: 'insufficient_scope',
            });
        }

        if (auditWriter) {
            await auditWriter.createEvent({
                tenantId,
                workspaceId,
                botId,
                eventType: 'connector_action_failed',
                severity: resolvedErrorCode === 'permission_denied' ? 'error' : 'warn',
                summary: `Connector action ${actionType} on ${connectorType} failed with error '${resolvedErrorCode}' after ${attempt} attempt(s) (action_id: ${actionId}).`,
                sourceSystem: 'connector-actions',
                correlationId,
                createdAt: new Date(now()),
            });
        }

        const failureHttpStatus = status === 'timeout' ? 504 : 502;

        return reply.code(failureHttpStatus).send({
            status,
            action_id: actionId,
            connector_id: connectorId,
            connector_type: connectorType,
            action_type: actionType,
            attempts: attempt,
            error_code: resolvedErrorCode,
            message: finalResult.errorMessage ?? 'Connector action execution failed.',
            remediation_hint: finalResult.remediationHint ?? null,
        });
    });

    app.post<{ Body: HealthCheckBody }>('/v1/connectors/health/check', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }

        const connectorType = normalizeConnectorType(request.body?.connector_type);
        if (request.body?.connector_type && !connectorType) {
            return reply.code(400).send({
                error: 'invalid_connector_type',
                message: 'connector_type must be one of jira, teams, github, email, custom_api',
            });
        }

        const workspaceId = request.body?.workspace_id ?? session.workspaceIds[0];
        if (!workspaceId || !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is not in your authenticated session scope.',
            });
        }

        const connectors = await repo.listAuthMetadata({
            tenantId: session.tenantId,
            workspaceId,
            connectorType: connectorType ?? undefined,
        });
        if (connectors.length === 0) {
            return reply.code(404).send({
                error: 'connectors_not_found',
                message: 'No connectors found for health check.',
            });
        }

        const checkedAt = new Date(now());
        const results: Array<{
            connector_id: string;
            connector_type: string;
            status_before: string;
            status_after: string;
            probe_outcome: HealthProbeResult['outcome'];
            message: string;
            remediation: 'none' | 're_auth' | 'reconsent' | 'backoff';
        }> = [];

        for (const connector of connectors) {
            const probe = await connectorHealthProbe({
                connectorType: connector.connectorType as ConnectorType,
                metadata: connector,
            });

            let statusAfter = connector.status;
            let scopeStatus = connector.scopeStatus;
            let lastErrorClass = connector.lastErrorClass;
            let remediation: 'none' | 're_auth' | 'reconsent' | 'backoff' = 'none';

            if (connector.scopeStatus === 'insufficient') {
                statusAfter = 'consent_pending';
                lastErrorClass = 'insufficient_scope';
                remediation = 'reconsent';
            } else if (probe.outcome === 'ok') {
                statusAfter = 'connected';
                lastErrorClass = null;
                scopeStatus = connector.scopeStatus ?? 'full';
            } else if (probe.outcome === 'auth_failure') {
                statusAfter = 'permission_invalid';
                scopeStatus = 'insufficient';
                lastErrorClass = 'insufficient_scope';
                remediation = 're_auth';
            } else if (probe.outcome === 'rate_limited') {
                statusAfter = 'degraded';
                lastErrorClass = 'provider_rate_limited';
                remediation = 'backoff';
            } else if (probe.outcome === 'network_timeout') {
                statusAfter = 'degraded';
                lastErrorClass = 'provider_unavailable';
                remediation = 'backoff';
            }

            await repo.updateAuthMetadata({
                connectorId: connector.connectorId,
                tenantId: connector.tenantId,
                workspaceId: connector.workspaceId,
                connectorType: connector.connectorType as ConnectorType,
                authMode: 'oauth2',
                status: statusAfter,
                secretRefId: connector.secretRefId,
                scopeStatus,
                lastHealthcheckAt: checkedAt,
                lastErrorClass,
            });

            results.push({
                connector_id: connector.connectorId,
                connector_type: connector.connectorType,
                status_before: connector.status,
                status_after: statusAfter,
                probe_outcome: probe.outcome,
                message: probe.message,
                remediation,
            });
        }

        const degraded = results.filter((item) => item.status_after === 'degraded').length;
        const healthy = results.filter((item) => item.status_after === 'connected').length;
        const remediationRequired = results.filter((item) => item.remediation !== 'none').length;

        return {
            checked_at: checkedAt.toISOString(),
            workspace_id: workspaceId,
            totals: {
                connectors: results.length,
                healthy,
                degraded,
                remediation_required: remediationRequired,
            },
            results,
        };
    });

    // -------------------------------------------------------------------------
    // GET /v1/connectors/health/summary
    //
    // Lightweight dashboard summary: lists all connectors with their current
    // status and a human-readable remediation hint. No live probing — reads
    // stored status from the connector metadata table only.
    // -------------------------------------------------------------------------

    app.get<{ Querystring: { workspace_id?: string } }>('/v1/connectors/health/summary', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized' });
        }

        const workspaceId = request.query?.workspace_id ?? session.workspaceIds[0];
        if (!workspaceId || !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({ error: 'workspace_scope_violation' });
        }

        const connectors = await repo.listAuthMetadata({ tenantId: session.tenantId, workspaceId });

        const remediationFor = (status: string, lastErrorClass: string | null): string => {
            if (status === 'permission_invalid' || lastErrorClass === 'insufficient_scope') {
                return 're_auth_or_reconsent';
            }
            if (status === 'consent_pending') return 'reconsent';
            if (status === 'token_expired' || status === 'auth_failed') return 're_auth';
            if (status === 'degraded') return 'contact_support';
            return 'none';
        };

        return reply.code(200).send({
            workspace_id: workspaceId,
            connector_count: connectors.length,
            connectors: connectors.map((c) => ({
                connector_id: c.connectorId,
                connector_type: c.connectorType,
                display_name: c.displayName ?? null,
                is_connected: c.status === 'connected',
                status: c.status,
                remediation: remediationFor(c.status, c.lastErrorClass ?? null),
                last_healthcheck_at: c.lastHealthcheckAt?.toISOString() ?? null,
            })),
        });
    });

    // -------------------------------------------------------------------------
    // PUT /v1/connectors/:connectorId/credentials
    //
    // Lets a customer update the raw credential JSON for a connector via the
    // dashboard UI.  The credential is validated for shape before being written
    // to the secret store, and the connector record is moved back to
    // "token_received" so the next health-check can verify it end-to-end.
    // -------------------------------------------------------------------------

    type UpdateCredentialsParams = { connectorId: string };
    type UpdateCredentialsBody = {
        /** Credential JSON object. Must match the shape for the connector type. */
        credentials?: Record<string, unknown>;
        /**
         * Optional override for the secret reference URI. If omitted the existing
         * secretRefId on the connector record is reused.  Useful when migrating a
         * connector to a different Key Vault secret.
         */
        secret_ref_id?: string;
        /** Optional human-friendly name shown in the dashboard. */
        display_name?: string;
    };

    const CREDENTIAL_VALIDATORS: Record<
        ConnectorType,
        (creds: Record<string, unknown>) => string | null
    > = {
        jira: (c) => {
            if (typeof c['access_token'] !== 'string' || !c['access_token']) {
                return 'jira credentials must include access_token (string)';
            }
            if (typeof c['base_url'] !== 'string' || !c['base_url']) {
                return 'jira credentials must include base_url (string, e.g. https://yoursite.atlassian.net)';
            }
            return null;
        },
        teams: (c) => {
            if (typeof c['access_token'] !== 'string' || !c['access_token']) {
                return 'teams credentials must include access_token (string)';
            }
            return null;
        },
        github: (c) => {
            if (typeof c['access_token'] !== 'string' || !c['access_token']) {
                return 'github credentials must include access_token (string)';
            }
            return null;
        },
        email: (c) => {
            const type = c['type'];
            if (type === 'sendgrid') {
                if (typeof c['api_key'] !== 'string' || !c['api_key']) {
                    return 'sendgrid email credentials must include api_key (string)';
                }
                if (typeof c['from_address'] !== 'string' || !c['from_address']) {
                    return 'sendgrid email credentials must include from_address (string)';
                }
                return null;
            }
            if (type === 'smtp') {
                for (const field of ['smtp_host', 'smtp_user', 'smtp_pass', 'from_address'] as const) {
                    if (typeof c[field] !== 'string' || !c[field]) {
                        return `smtp email credentials must include ${field} (string)`;
                    }
                }
                if (typeof c['smtp_port'] !== 'number') {
                    return 'smtp email credentials must include smtp_port (number)';
                }
                return null;
            }
            return 'email credentials must include type: "sendgrid" or "smtp"';
        },
        custom_api: (c) => {
            if (typeof c['base_url'] !== 'string' || !c['base_url']) {
                return 'custom_api credentials must include base_url (string)';
            }
            const authType = c['auth_type'];
            if (authType !== undefined && authType !== 'none' && authType !== 'api_key' && authType !== 'bearer_token' && authType !== 'basic_auth') {
                return 'custom_api auth_type must be one of: none, api_key, bearer_token, basic_auth';
            }
            if (authType === 'api_key') {
                if (typeof c['api_key'] !== 'string' || !c['api_key']) {
                    return 'custom_api api_key credentials must include api_key (string)';
                }
            }
            if (authType === 'bearer_token') {
                if (typeof c['bearer_token'] !== 'string' || !c['bearer_token']) {
                    return 'custom_api bearer_token credentials must include bearer_token (string)';
                }
            }
            if (authType === 'basic_auth') {
                if (typeof c['basic_user'] !== 'string' || !c['basic_user']) {
                    return 'custom_api basic_auth credentials must include basic_user (string)';
                }
                if (typeof c['basic_pass'] !== 'string' || !c['basic_pass']) {
                    return 'custom_api basic_auth credentials must include basic_pass (string)';
                }
            }
            return null;
        },
        slack: (c) => {
            if (typeof c['botToken'] !== 'string' || !c['botToken']) {
                return 'slack credentials must include botToken (string, xoxb-...)';
            }
            return null;
        },
        gitlab: (c) => {
            if (typeof c['access_token'] !== 'string' || !c['access_token']) {
                return 'gitlab credentials must include access_token (string)';
            }
            if (c['base_url'] !== undefined && typeof c['base_url'] !== 'string') {
                return 'gitlab base_url, if provided, must be a string (e.g. https://gitlab.acme.com)';
            }
            return null;
        },
        linear: (c) => {
            if (typeof c['api_key'] !== 'string' || !c['api_key']) {
                return 'linear credentials must include api_key (string)';
            }
            return null;
        },
    };

    app.put<{ Params: UpdateCredentialsParams; Body: UpdateCredentialsBody }>(
        '/v1/connectors/:connectorId/credentials',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({
                    error: 'unauthorized',
                    message: 'A valid authenticated session is required.',
                });
            }

            const connectorId = request.params.connectorId;
            const displayName = request.body?.display_name?.trim() || undefined;
            let metadata = await repo.findAuthMetadata(connectorId);

            // Auto-register non-OAuth connectors on first credential write.
            // connectorId format: {type}:{tenantId}:{workspaceId} for built-in
            // providers, or {type}:{tenantId}:{workspaceId}:{slug} for custom
            // connectors (the slug makes multiple custom_api connectors unique).
            if (!metadata) {
                const parts = connectorId.split(':');
                if (parts.length < 3 || parts.length > 4) {
                    return reply.code(404).send({
                        error: 'connector_not_found',
                        message: `No connector found with id ${connectorId}.`,
                    });
                }
                const [rawType, rawTenantId, rawWorkspaceId] = parts as [string, string, string];
                if (rawTenantId !== session.tenantId) {
                    return reply.code(403).send({
                        error: 'forbidden',
                        message: 'Connector tenant does not match your session.',
                    });
                }
                // Never auto-create a connector in a workspace outside the caller's scope.
                if (!session.workspaceIds.includes(rawWorkspaceId)) {
                    return reply.code(403).send({
                        error: 'workspace_scope_violation',
                        message: 'Connector workspace is not in your session scope.',
                    });
                }
                const inferredType = normalizeConnectorType(rawType);
                if (!inferredType) {
                    return reply.code(422).send({
                        error: 'unsupported_connector_type',
                        message: `Connector type '${rawType}' is not supported.`,
                    });
                }
                metadata = await repo.upsertAuthMetadata({
                    connectorId,
                    tenantId: session.tenantId,
                    workspaceId: rawWorkspaceId,
                    connectorType: inferredType,
                    displayName,
                    status: 'not_configured',
                    authMode: 'api_key',
                });
            } else if (displayName && metadata.displayName !== displayName) {
                // Connector already exists — keep its name in sync with the form.
                await repo.renameConnector({ connectorId, displayName });
            }

            if (metadata.tenantId !== session.tenantId) {
                return reply.code(403).send({
                    error: 'forbidden',
                    message: 'Connector does not belong to your tenant.',
                });
            }

            if (!session.workspaceIds.includes(metadata.workspaceId)) {
                return reply.code(403).send({
                    error: 'workspace_scope_violation',
                    message: 'Connector workspace is not in your session scope.',
                });
            }

            const { credentials, secret_ref_id } = request.body ?? {};
            if (!credentials || typeof credentials !== 'object') {
                return reply.code(400).send({
                    error: 'missing_credentials',
                    message: 'Request body must include a credentials object.',
                });
            }

            const connectorType = normalizeConnectorType(metadata.connectorType);
            if (!connectorType) {
                return reply.code(422).send({
                    error: 'unsupported_connector_type',
                    message: `Connector type '${metadata.connectorType}' does not support credential updates.`,
                });
            }

            const validationError = CREDENTIAL_VALIDATORS[connectorType](credentials);
            if (validationError) {
                return reply.code(400).send({
                    error: 'invalid_credentials',
                    message: validationError,
                });
            }

            if (!options.secretStore) {
                return reply.code(503).send({
                    error: 'secret_store_unavailable',
                    message: 'No secret store is configured. Credentials cannot be updated.',
                });
            }

            const targetSecretRefId =
                secret_ref_id ??
                metadata.secretRefId ??
                `env://CONNECTOR_${connectorType.toUpperCase()}_${connectorId.replace(/[^A-Z0-9]/gi, '_').toUpperCase()}`;

            let storedSecretRefId: string;
            try {
                storedSecretRefId = await options.secretStore.setSecret(
                    targetSecretRefId,
                    JSON.stringify(credentials),
                );
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return reply.code(502).send({
                    error: 'secret_store_write_failed',
                    message: `Failed to persist credentials: ${msg}`,
                });
            }

            await repo.updateAuthMetadata({
                connectorId,
                tenantId: metadata.tenantId,
                workspaceId: metadata.workspaceId,
                connectorType: connectorType as ConnectorType,
                status: 'token_received',
                authMode: 'api_key',
                secretRefId: storedSecretRefId,
                scopeStatus: null,
                lastErrorClass: null,
            });

            return reply.code(200).send({
                connector_id: connectorId,
                connector_type: connectorType,
                secret_ref_id: storedSecretRefId,
                status: 'token_received',
                message: 'Credentials updated. The connector will be re-validated on the next health check.',
            });
        },
    );

    // -------------------------------------------------------------------------
    // GET /v1/connectors/:connectorId/actions
    //
    // Returns a paginated list of ConnectorAction log records for a specific
    // connector, scoped to the authenticated tenant.  Cursor-based pagination
    // via createdAt ISO timestamp (lt cursor → earlier records).
    // requestBody is intentionally omitted (may contain secrets).
    // -------------------------------------------------------------------------

    type ActionLogParams = { connectorId: string };
    type ActionLogQuery = { limit?: string; cursor?: string };

    // -------------------------------------------------------------------------
    // PATCH /v1/connectors/:connectorId
    // Rename a connector (update its display name) without touching credentials.
    // Tenant- and workspace-scoped.
    // -------------------------------------------------------------------------
    type RenameParams = { connectorId: string };
    type RenameBody = { display_name?: string };

    app.patch<{ Params: RenameParams; Body: RenameBody }>(
        '/v1/connectors/:connectorId',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized', message: 'Authentication required.' });
            }

            const displayName = request.body?.display_name?.trim();
            if (!displayName) {
                return reply.code(400).send({ error: 'invalid_display_name', message: 'display_name is required.' });
            }
            if (displayName.length > 100) {
                return reply.code(400).send({ error: 'invalid_display_name', message: 'display_name must be 100 characters or fewer.' });
            }

            const { connectorId } = request.params;
            const metadata = await repo.findAuthMetadata(connectorId);
            if (!metadata) {
                return reply.code(404).send({ error: 'connector_not_found', message: `No connector found with id ${connectorId}.` });
            }
            if (metadata.tenantId !== session.tenantId) {
                return reply.code(403).send({ error: 'forbidden', message: 'Connector does not belong to your tenant.' });
            }
            if (!session.workspaceIds.includes(metadata.workspaceId)) {
                return reply.code(403).send({ error: 'workspace_scope_violation', message: 'Connector workspace is not in your session scope.' });
            }

            await repo.renameConnector({ connectorId, displayName });
            return reply.code(200).send({ connector_id: connectorId, display_name: displayName });
        },
    );

    // -------------------------------------------------------------------------
    // DELETE /v1/connectors/:connectorId
    // Generic disconnect for any connector type (OAuth or API key).
    // Marks the connector as 'revoked' and clears credentials.
    // -------------------------------------------------------------------------
    type DisconnectParams = { connectorId: string };

    app.delete<{ Params: DisconnectParams }>(
        '/v1/connectors/:connectorId',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized', message: 'Authentication required.' });
            }

            const { connectorId } = request.params;
            const metadata = await repo.findAuthMetadata(connectorId);
            if (!metadata) {
                return reply.code(404).send({ error: 'connector_not_found', message: `No connector found with id ${connectorId}.` });
            }
            if (metadata.tenantId !== session.tenantId) {
                return reply.code(403).send({ error: 'forbidden', message: 'Connector does not belong to your tenant.' });
            }
            if (!session.workspaceIds.includes(metadata.workspaceId)) {
                return reply.code(403).send({ error: 'workspace_scope_violation', message: 'Connector workspace is not in your session scope.' });
            }

            const oauthTypes = new Set(['jira', 'teams', 'github', 'email']);
            const authMode = oauthTypes.has(metadata.connectorType) ? 'oauth2' : 'api_key';

            await repo.updateAuthMetadata({
                connectorId,
                tenantId: session.tenantId,
                workspaceId: metadata.workspaceId,
                connectorType: metadata.connectorType as ConnectorType,
                status: 'revoked',
                authMode,
                secretRefId: null,
                scopeStatus: null,
                lastErrorClass: null,
            });

            return reply.code(200).send({ status: 'revoked', connector_id: connectorId });
        },
    );

    app.get<{ Params: ActionLogParams; Querystring: ActionLogQuery }>(
        '/v1/connectors/:connectorId/actions',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({
                    error: 'unauthorized',
                    message: 'A valid authenticated session is required.',
                });
            }

            const { connectorId } = request.params;

            const rawLimit = parseInt(request.query?.limit ?? '20', 10);
            const limit = Math.min(Math.max(Number.isNaN(rawLimit) ? 20 : rawLimit, 1), 50);

            let cursorDate: Date | undefined;
            if (request.query?.cursor) {
                const parsed = new Date(request.query.cursor);
                if (!Number.isNaN(parsed.getTime())) {
                    cursorDate = parsed;
                }
            }

            let actions: ActionLogRow[];
            try {
                actions = await repo.listConnectorActions({
                    tenantId: session.tenantId,
                    connectorId,
                    limit,
                    cursor: cursorDate,
                });
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return reply.code(500).send({
                    error: 'database_error',
                    message: `Failed to retrieve action log: ${msg}`,
                });
            }

            return reply.code(200).send({
                actions,
                hasMore: actions.length === limit,
                nextCursor: actions.at(-1)?.createdAt ?? null,
            });
        },
    );

    // C6 — Parse an OpenAPI 3.x spec into an agent tool catalog. Lets a Custom API connector
    // become self-describing (like MCP's tools/list): the dashboard previews the operations,
    // and the agent gets a tool list it can drive autonomously. Stateless: spec in, catalog out.
    app.post<{ Body: { spec?: unknown } }>(
        '/v1/connectors/openapi/parse',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({
                    error: 'unauthorized',
                    message: 'A valid authenticated session is required.',
                });
            }
            const spec = request.body?.spec;
            if (!spec || typeof spec !== 'object') {
                return reply.code(400).send({
                    error: 'invalid_spec',
                    message: 'Body must include a parsed OpenAPI 3.x document under "spec".',
                });
            }
            const { parseOpenApiToToolCatalog } = await import('../../lib/openapi-catalog.js');
            const tools = parseOpenApiToToolCatalog(spec);
            if (tools.length === 0) {
                return reply.code(422).send({
                    error: 'no_operations',
                    message: 'No operations found. Check the spec has a "paths" object with HTTP methods.',
                });
            }
            return reply.code(200).send({ tool_count: tools.length, tools });
        },
    );

    // C6.2 — Persist a parsed OpenAPI catalog onto a Custom API connector. The agent runtime
    // then auto-discovers it (GET below) and injects it into the planner tool list, so the
    // agent can drive the customer's REST API without being handed the operation each time.
    app.put<{ Params: { connectorId: string }; Body: { spec?: unknown } }>(
        '/v1/connectors/:connectorId/openapi',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
            }
            if (!repo.setOpenapiCatalog) {
                return reply.code(501).send({ error: 'not_supported', message: 'Catalog persistence is not available.' });
            }
            const connectorId = request.params.connectorId;
            const metadata = await repo.findAuthMetadata(connectorId);
            if (!metadata || metadata.tenantId !== session.tenantId) {
                return reply.code(404).send({ error: 'not_found', message: 'Connector not found for this tenant.' });
            }
            const spec = request.body?.spec;
            if (!spec || typeof spec !== 'object') {
                return reply.code(400).send({ error: 'invalid_spec', message: 'Body must include a parsed OpenAPI 3.x document under "spec".' });
            }
            const { parseOpenApiToToolCatalog } = await import('../../lib/openapi-catalog.js');
            const tools = parseOpenApiToToolCatalog(spec);
            if (tools.length === 0) {
                return reply.code(422).send({ error: 'no_operations', message: 'No operations found in the spec.' });
            }
            await repo.setOpenapiCatalog({ connectorId, tenantId: session.tenantId, catalog: tools });
            return reply.code(200).send({ stored: true, tool_count: tools.length });
        },
    );

    // C6.2 — Agent-runtime fetches all stored Custom API catalogs for the tenant.
    // Accepts either a browser session OR the connector-exec service token + x-tenant-id
    // header (runtime → gateway, same pattern as the MCP registry).
    app.get<{ Querystring: { workspace_id?: string } }>(
        '/v1/connectors/custom-api-catalog',
        async (request, reply) => {
            const session = options.getSession(request);
            const providedServiceToken = readServiceToken(request);
            const headerTenant = typeof request.headers['x-tenant-id'] === 'string'
                ? (request.headers['x-tenant-id'] as string)
                : null;
            const serviceAuthorized = Boolean(
                !session && serviceAuthToken && providedServiceToken && providedServiceToken === serviceAuthToken && headerTenant,
            );
            if (!session && !serviceAuthorized) {
                return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
            }
            const tenantId = session ? session.tenantId : headerTenant!;
            if (!repo.listOpenapiCatalogs) {
                return reply.code(200).send({ connectors: [] });
            }
            const connectors = await repo.listOpenapiCatalogs({
                tenantId,
                workspaceId: request.query?.workspace_id,
            });
            return reply.code(200).send({ connectors });
        },
    );
};

export type {
    RegisterConnectorActionRoutesOptions,
    ConnectorActionRepo,
    ConnectorApprovalChecker,
    ConnectorAuditWriter,
    SessionContext,
    ProviderExecutor,
    ActionLogRow,
};
