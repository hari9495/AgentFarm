import Fastify, { type FastifyInstance } from 'fastify';
import { createHash } from 'crypto';
import type {
    BotBrainConfig,
    BotCapabilitySnapshotRecord,
    CapabilitySnapshotSource,
    ModelProfileKey,
    RoleKey,
} from '@agentfarm/shared-types';
import {
    buildDecision,
    processDeveloperTask,
    processApprovedTask,
    type ProcessedTaskResult,
    type TaskEnvelope,
} from './execution-engine.js';
import {
    type ActionResultRecord,
    type ActionResultWriter,
} from './action-result-contract.js';
import { createFileActionResultWriter, resolveActionResultPath } from './action-result-writer.js';

type RuntimeState =
    | 'created'
    | 'starting'
    | 'ready'
    | 'active'
    | 'degraded'
    | 'paused'
    | 'stopping'
    | 'stopped'
    | 'failed';

type RuntimeConfig = {
    tenantId: string;
    workspaceId: string;
    botId: string;
    roleProfile: string;
    roleKey: RoleKey;
    roleVersion: string;
    policyPackVersion: string;
    approvalApiUrl: string;
    approvalIntakeToken: string | null;
    decisionWebhookToken: string | null;
    connectorApiUrl: string;
    connectorExecuteToken: string | null;
    evidenceApiUrl: string;
    healthPort: number;
    logLevel: string;
    contractVersion: string;
    correlationId: string;
    controlPlaneHeartbeatUrl: string;
};

type ApprovalIntakeClient = (input: {
    baseUrl: string;
    token: string | null;
    tenantId: string;
    workspaceId: string;
    botId: string;
    taskId: string;
    actionId: string;
    actionSummary: string;
    riskLevel: 'medium' | 'high';
    requestedBy: string;
    policyPackVersion: string;
}) => Promise<{
    ok: boolean;
    statusCode: number;
    errorMessage?: string;
    approvalId?: string;
}>;

type ConnectorActionExecuteClient = (input: {
    baseUrl: string;
    token: string | null;
    tenantId: string;
    workspaceId: string;
    botId: string;
    roleKey: RoleKey;
    connectorType: 'jira' | 'teams' | 'github' | 'email';
    actionType: 'read_task' | 'create_comment' | 'update_status' | 'send_message' | 'create_pr_comment' | 'send_email';
    payload: Record<string, unknown>;
    correlationId: string;
}) => Promise<{
    ok: boolean;
    statusCode: number;
    attempts?: number;
    errorMessage?: string;
}>;

type CapabilitySnapshotPersistenceClient = {
    loadLatestByBotId: (input: { botId: string }) => Promise<BotCapabilitySnapshotRecord | null>;
    persistSnapshot: (input: {
        config: RuntimeConfig;
        snapshot: BotCapabilitySnapshotRecord;
        source: CapabilitySnapshotSource;
    }) => Promise<BotCapabilitySnapshotRecord>;
};

type TaskExecutionOutcome = 'success' | 'failed' | 'approval_queued';

type TaskExecutionRecordWriter = {
    write: (input: {
        botId: string;
        tenantId: string;
        workspaceId: string;
        taskId: string;
        modelProvider: string;
        modelProfile: string;
        promptTokens: number | null;
        completionTokens: number | null;
        totalTokens: number | null;
        latencyMs: number;
        outcome: TaskExecutionOutcome;
        executedAt: Date;
    }) => Promise<void>;
};

type RuntimeServerOptions = {
    env?: NodeJS.ProcessEnv;
    workerPollMs?: number;
    killGraceMs?: number;
    approvalEscalationMs?: number;
    heartbeatIntervalMs?: number;
    maxRuntimeLogs?: number;
    now?: () => number;
    closeOnKill?: boolean;
    dependencyProbe?: (baseUrl: string) => Promise<boolean>;
    approvalIntakeClient?: ApprovalIntakeClient;
    connectorActionExecuteClient?: ConnectorActionExecuteClient;
    approvalIntakeMaxAttempts?: number;
    approvalIntakeBackoffMs?: number;
    sleep?: (ms: number) => Promise<void>;
    exitProcess?: (code: number) => void;
    actionResultWriter?: ActionResultWriter;
    capabilitySnapshotPersistenceClient?: CapabilitySnapshotPersistenceClient;
    taskExecutionRecordWriter?: TaskExecutionRecordWriter;
};

type RuntimeLogEntry = {
    at: string;
    eventType: string;
    tenantId: string | null;
    workspaceId: string | null;
    botId: string | null;
    correlationId: string | null;
    runtimeState: RuntimeState;
    details?: Record<string, unknown>;
};

type RuntimeStateTransition = {
    at: string;
    from: RuntimeState;
    to: RuntimeState;
    reason: string | null;
};

type PendingApprovalTask = {
    taskId: string;
    enqueuedAt: number;
    riskLevel: 'medium' | 'high';
    actionType: string;
    actionSummary: string;
    task: TaskEnvelope;
    escalated: boolean;
};

type DecisionCacheEntry = {
    decision: 'approved';
    decidedAt: number;
    actor: string | null;
    reason: string | null;
};

type ApprovalDecision = 'approved' | 'rejected' | 'timeout_rejected';

type WorkerLoop = {
    running: boolean;
    handle: NodeJS.Timeout | null;
    tickBusy: boolean;
    queuedTasks: TaskEnvelope[];
    processedTasks: number;
    succeededTasks: number;
    failedTasks: number;
    approvalQueuedTasks: number;
    approvalResolvedTasks: number;
    approvalApprovedTasks: number;
    approvalRejectedTasks: number;
    pendingApprovals: PendingApprovalTask[];
    approvedDecisionCache: Map<string, DecisionCacheEntry>;
    approvalDecisionCacheHits: number;
    escalatedApprovalTasks: number;
    retriedAttempts: number;
};

type HeartbeatLoop = {
    running: boolean;
    handle: NodeJS.Timeout | null;
    sent: number;
    failed: number;
    lastHeartbeatAt: string | null;
};

type SnapshotObservabilityMetadata = {
    snapshot_source: CapabilitySnapshotSource;
    snapshot_version: number;
    snapshot_checksum?: string;
    fallback_reason?: string | null;
};

const DEFAULT_WORKER_POLL_MS = 250;
const DEFAULT_KILL_GRACE_MS = 5_000;
const DEFAULT_APPROVAL_ESCALATION_MS = 60 * 60 * 1000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_MAX_RUNTIME_LOGS = 200;
const DEFAULT_APPROVAL_INTAKE_MAX_ATTEMPTS = 3;
const DEFAULT_APPROVAL_INTAKE_BACKOFF_MS = 200;
const DEFAULT_ROLE_VERSION = 'v1';
const DEFAULT_ROLE_POLICY_VERSION = 'v1';
const DEFAULT_ROLE_RISK_POLICY_VERSION = 'v1';
const DEFAULT_ROLE_PROMPT_VERSION = 'v1';
const ROLE_KEYS: RoleKey[] = [
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
const CONNECTOR_ACTION_TYPES = new Set([
    'read_task',
    'create_comment',
    'update_status',
    'send_message',
    'create_pr_comment',
    'send_email',
] as const);

type RuntimeConnectorType = 'jira' | 'teams' | 'github' | 'email';
type RuntimeConnectorActionType =
    | 'read_task'
    | 'create_comment'
    | 'update_status'
    | 'send_message'
    | 'create_pr_comment'
    | 'send_email';

const ROLE_CONNECTOR_POLICY: Record<RoleKey, RuntimeConnectorType[]> = {
    recruiter: ['teams', 'email'],
    developer: ['jira', 'teams', 'github', 'email'],
    fullstack_developer: ['jira', 'teams', 'github', 'email'],
    tester: ['jira', 'teams', 'github', 'email'],
    business_analyst: ['jira', 'teams', 'email'],
    technical_writer: ['teams', 'email'],
    content_writer: ['teams', 'email'],
    sales_rep: ['teams', 'email'],
    marketing_specialist: ['teams', 'email'],
    corporate_assistant: ['teams', 'email'],
    customer_support_executive: ['jira', 'teams', 'email'],
    project_manager_product_owner_scrum_master: ['jira', 'teams', 'github', 'email'],
};

const CONNECTOR_ACTION_POLICY: Record<RuntimeConnectorType, RuntimeConnectorActionType[]> = {
    jira: ['read_task', 'create_comment', 'update_status'],
    teams: ['send_message'],
    github: ['create_pr_comment'],
    email: ['send_email'],
};

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const calculateSnapshotChecksum = (snapshot: BotCapabilitySnapshotRecord): string => {
    const payload = JSON.stringify({
        roleKey: snapshot.roleKey,
        roleVersion: snapshot.roleVersion,
        policyPackVersion: snapshot.policyPackVersion,
        allowedConnectorTools: snapshot.allowedConnectorTools.sort(),
        allowedActions: snapshot.allowedActions.sort(),
        brainConfig: snapshot.brainConfig,
        languageTier: snapshot.languageTier,
        speechProvider: snapshot.speechProvider,
        translationProvider: snapshot.translationProvider,
        ttsProvider: snapshot.ttsProvider,
        avatarEnabled: snapshot.avatarEnabled,
        avatarProvider: snapshot.avatarProvider,
    });
    return createHash('sha256').update(payload).digest('hex');
};

const normalizeRoleKey = (value: string | undefined): RoleKey | null => {
    if (!value || !value.trim()) {
        return null;
    }

    const normalized = value.trim().toLowerCase().replace(/\s+/g, '_') as RoleKey;
    return ROLE_KEYS.includes(normalized) ? normalized : null;
};

const roleKeyFromRoleProfile = (roleProfile: string): RoleKey | null => {
    const normalized = roleProfile.trim().toLowerCase().replace(/[\s/]+/g, '_');
    const aliases: Record<string, RoleKey> = {
        recruiter: 'recruiter',
        developer: 'developer',
        developer_agent: 'developer',
        fullstack_developer: 'fullstack_developer',
        full_stack_developer: 'fullstack_developer',
        tester: 'tester',
        qa: 'tester',
        business_analyst: 'business_analyst',
        technical_writer: 'technical_writer',
        content_writer: 'content_writer',
        sales_rep: 'sales_rep',
        marketing_specialist: 'marketing_specialist',
        corporate_assistant: 'corporate_assistant',
        customer_support_executive: 'customer_support_executive',
        project_manager_product_owner_scrum_master: 'project_manager_product_owner_scrum_master',
        project_manager: 'project_manager_product_owner_scrum_master',
        product_owner: 'project_manager_product_owner_scrum_master',
        scrum_master: 'project_manager_product_owner_scrum_master',
    };
    return aliases[normalized] ?? null;
};

const selectModelProfile = (value: string | undefined): ModelProfileKey => {
    const normalized = value?.trim().toLowerCase();
    if (normalized === 'quality_first' || normalized === 'speed_first' || normalized === 'cost_balanced' || normalized === 'custom') {
        return normalized;
    }
    return 'quality_first';
};

const buildBrainConfig = (env: NodeJS.ProcessEnv): BotBrainConfig => {
    const defaultModelProfile = selectModelProfile(env.AF_DEFAULT_MODEL_PROFILE ?? env.AGENTFARM_DEFAULT_MODEL_PROFILE);
    const fallbackModelProfile = selectModelProfile(env.AF_FALLBACK_MODEL_PROFILE ?? env.AGENTFARM_FALLBACK_MODEL_PROFILE);
    return {
        roleSystemPromptVersion: env.AF_ROLE_PROMPT_VERSION ?? env.AGENTFARM_ROLE_PROMPT_VERSION ?? DEFAULT_ROLE_PROMPT_VERSION,
        roleToolPolicyVersion: env.AF_ROLE_TOOL_POLICY_VERSION ?? env.AGENTFARM_ROLE_TOOL_POLICY_VERSION ?? DEFAULT_ROLE_POLICY_VERSION,
        roleRiskPolicyVersion: env.AF_ROLE_RISK_POLICY_VERSION ?? env.AGENTFARM_ROLE_RISK_POLICY_VERSION ?? DEFAULT_ROLE_RISK_POLICY_VERSION,
        defaultModelProfile,
        fallbackModelProfile,
    };
};

const buildCapabilitySnapshot = (config: RuntimeConfig, frozenAt: number, env: NodeJS.ProcessEnv): BotCapabilitySnapshotRecord => {
    const allowedConnectorTools = ROLE_CONNECTOR_POLICY[config.roleKey];
    const allowedActions = Array.from(new Set(
        allowedConnectorTools.flatMap((tool) => CONNECTOR_ACTION_POLICY[tool]),
    ));

    const snapshot: BotCapabilitySnapshotRecord = {
        id: `${config.botId}:snapshot:${frozenAt}`,
        botId: config.botId,
        roleKey: config.roleKey,
        roleVersion: config.roleVersion,
        allowedConnectorTools,
        allowedActions,
        policyPackVersion: config.policyPackVersion,
        frozenAt: new Date(frozenAt).toISOString(),
        brainConfig: buildBrainConfig(env),
        tenantId: config.tenantId,
        workspaceId: config.workspaceId,
        supportedLanguages: ['en-US'],
        defaultLanguage: 'en-US',
        languageTier: 'base',
        speechProvider: 'oss',
        translationProvider: 'oss',
        ttsProvider: 'oss',
        avatarEnabled: false,
        avatarStyle: 'audio-only',
        avatarProvider: 'none',
        avatarLocale: 'en-US',
        snapshotVersion: 1,
        source: 'runtime_freeze',
    };
    snapshot.snapshotChecksum = calculateSnapshotChecksum(snapshot);
    return snapshot;
};

const hasSameStringSet = (left: string[], right: string[]): boolean => {
    if (left.length !== right.length) {
        return false;
    }

    const rightSet = new Set(right);
    return left.every((entry) => rightSet.has(entry));
};

const validateSnapshotCompatibility = (input: {
    snapshot: BotCapabilitySnapshotRecord;
    config: RuntimeConfig;
}): { compatible: boolean; reason?: string } => {
    const { snapshot, config } = input;

    if (snapshot.roleKey !== config.roleKey) {
        return {
            compatible: false,
            reason: `snapshot_role_key_mismatch:${snapshot.roleKey}->${config.roleKey}`,
        };
    }

    if (snapshot.roleVersion !== config.roleVersion) {
        return {
            compatible: false,
            reason: `snapshot_role_version_mismatch:${snapshot.roleVersion}->${config.roleVersion}`,
        };
    }

    if (snapshot.policyPackVersion !== config.policyPackVersion) {
        return {
            compatible: false,
            reason: `snapshot_policy_pack_version_mismatch:${snapshot.policyPackVersion}->${config.policyPackVersion}`,
        };
    }

    const expectedConnectors = ROLE_CONNECTOR_POLICY[config.roleKey];
    const expectedActions = Array.from(new Set(
        expectedConnectors.flatMap((tool) => CONNECTOR_ACTION_POLICY[tool]),
    ));

    if (!hasSameStringSet(snapshot.allowedConnectorTools, expectedConnectors)) {
        return {
            compatible: false,
            reason: 'snapshot_connector_policy_mismatch',
        };
    }

    if (!hasSameStringSet(snapshot.allowedActions, expectedActions)) {
        return {
            compatible: false,
            reason: 'snapshot_action_policy_mismatch',
        };
    }

    return { compatible: true };
};

const createDefaultCapabilitySnapshotPersistenceClient = (
    env: NodeJS.ProcessEnv,
): CapabilitySnapshotPersistenceClient => {
    const prismaModuleName = '@prisma/client';

    const createPrismaClient = async (): Promise<{
        botCapabilitySnapshot: {
            findFirst: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
            create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
        };
        $disconnect: () => Promise<void>;
    } | null> => {
        const databaseUrl = env.DATABASE_URL;
        if (!databaseUrl || !databaseUrl.trim()) {
            return null;
        }

        try {
            const prismaModule = await import(prismaModuleName);
            const PrismaClient = (prismaModule as { PrismaClient?: new () => unknown }).PrismaClient;
            if (!PrismaClient) {
                return null;
            }

            return new PrismaClient() as {
                botCapabilitySnapshot: {
                    findFirst: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
                    create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
                };
                $disconnect: () => Promise<void>;
            };
        } catch {
            return null;
        }
    };

    const toStringArray = (value: unknown): string[] => {
        if (!Array.isArray(value)) {
            return [];
        }
        return value.filter((entry): entry is string => typeof entry === 'string');
    };

    const toSnapshotRecord = (row: Record<string, unknown>): BotCapabilitySnapshotRecord | null => {
        const roleKey = normalizeRoleKey(
            typeof row['roleKey'] === 'string' ? row['roleKey'] : undefined,
        );
        if (!roleKey) {
            return null;
        }

        const brainConfigCandidate = row['brainConfig'];
        const brainConfig: BotBrainConfig =
            typeof brainConfigCandidate === 'object' && brainConfigCandidate !== null
                ? brainConfigCandidate as BotBrainConfig
                : buildBrainConfig(env);

        return {
            id: typeof row['id'] === 'string' ? row['id'] : 'snapshot:unknown',
            botId: typeof row['botId'] === 'string' ? row['botId'] : 'unknown',
            roleKey,
            roleVersion: typeof row['roleVersion'] === 'string' ? row['roleVersion'] : DEFAULT_ROLE_VERSION,
            allowedConnectorTools: toStringArray(row['allowedConnectorTools']),
            allowedActions: toStringArray(row['allowedActions']),
            policyPackVersion: typeof row['policyPackVersion'] === 'string'
                ? row['policyPackVersion']
                : DEFAULT_ROLE_POLICY_VERSION,
            frozenAt: row['frozenAt'] instanceof Date
                ? row['frozenAt'].toISOString()
                : (typeof row['frozenAt'] === 'string' ? row['frozenAt'] : new Date().toISOString()),
            brainConfig,
            tenantId: typeof row['tenantId'] === 'string' ? row['tenantId'] : undefined,
            workspaceId: typeof row['workspaceId'] === 'string' ? row['workspaceId'] : undefined,
            supportedLanguages: toStringArray(row['supportedLanguages']),
            defaultLanguage: typeof row['defaultLanguage'] === 'string' ? row['defaultLanguage'] : 'en-US',
            languageTier:
                row['languageTier'] === 'pro' || row['languageTier'] === 'enterprise'
                    ? row['languageTier']
                    : 'base',
            speechProvider:
                row['speechProvider'] === 'azure' || row['speechProvider'] === 'hybrid'
                    ? row['speechProvider']
                    : 'oss',
            translationProvider:
                row['translationProvider'] === 'azure' || row['translationProvider'] === 'hybrid'
                    ? row['translationProvider']
                    : 'oss',
            ttsProvider:
                row['ttsProvider'] === 'azure' || row['ttsProvider'] === 'hybrid'
                    ? row['ttsProvider']
                    : 'oss',
            avatarEnabled: row['avatarEnabled'] === true,
            avatarStyle:
                row['avatarStyle'] === 'professional-neutral' || row['avatarStyle'] === 'minimal-icon'
                    ? row['avatarStyle']
                    : 'audio-only',
            avatarProvider:
                row['avatarProvider'] === 'oss'
                    || row['avatarProvider'] === 'azure'
                    || row['avatarProvider'] === 'hybrid'
                    ? row['avatarProvider']
                    : 'none',
            avatarLocale: typeof row['avatarLocale'] === 'string' ? row['avatarLocale'] : 'en-US',
            snapshotVersion: typeof row['snapshotVersion'] === 'number' ? row['snapshotVersion'] : 1,
            snapshotChecksum: typeof row['snapshotChecksum'] === 'string' ? row['snapshotChecksum'] : undefined,
            source:
                row['source'] === 'persisted_load' || row['source'] === 'manual_override'
                    ? row['source']
                    : 'runtime_freeze',
        };
    };

    return {
        loadLatestByBotId: async ({ botId }) => {
            const prisma = await createPrismaClient();
            if (!prisma) {
                return null;
            }

            try {
                const row = await prisma.botCapabilitySnapshot.findFirst({
                    where: { botId },
                    orderBy: [
                        { snapshotVersion: 'desc' },
                        { frozenAt: 'desc' },
                    ],
                });
                if (!row) {
                    return null;
                }

                const snapshot = toSnapshotRecord(row);
                if (!snapshot) {
                    return null;
                }

                // Validate checksum for data integrity
                if (snapshot.snapshotChecksum) {
                    const calculatedChecksum = calculateSnapshotChecksum(snapshot);
                    if (calculatedChecksum !== snapshot.snapshotChecksum) {
                        // Checksum mismatch indicates corruption
                        return null;
                    }
                }

                return {
                    ...snapshot,
                    source: 'persisted_load',
                };
            } catch {
                return null;
            } finally {
                await prisma.$disconnect().catch(() => undefined);
            }
        },
        persistSnapshot: async ({ config, snapshot, source }) => {
            const prisma = await createPrismaClient();
            if (!prisma) {
                return {
                    ...snapshot,
                    source,
                };
            }

            try {
                const latest = await prisma.botCapabilitySnapshot.findFirst({
                    where: { botId: config.botId },
                    orderBy: [{ snapshotVersion: 'desc' }],
                    select: { snapshotVersion: true },
                }) as { snapshotVersion?: number } | null;

                const nextVersion = (latest?.snapshotVersion ?? 0) + 1;
                // Ensure checksum is calculated
                const snapshotChecksum = snapshot.snapshotChecksum ?? calculateSnapshotChecksum(snapshot);

                const created = await prisma.botCapabilitySnapshot.create({
                    data: {
                        botId: config.botId,
                        tenantId: config.tenantId,
                        workspaceId: config.workspaceId,
                        roleKey: snapshot.roleKey,
                        roleVersion: snapshot.roleVersion,
                        policyPackVersion: snapshot.policyPackVersion,
                        allowedConnectorTools: snapshot.allowedConnectorTools,
                        allowedActions: snapshot.allowedActions,
                        brainConfig: snapshot.brainConfig,
                        supportedLanguages: snapshot.supportedLanguages ?? ['en-US'],
                        defaultLanguage: snapshot.defaultLanguage ?? 'en-US',
                        languageTier: snapshot.languageTier ?? 'base',
                        speechProvider: snapshot.speechProvider ?? 'oss',
                        translationProvider: snapshot.translationProvider ?? 'oss',
                        ttsProvider: snapshot.ttsProvider ?? 'oss',
                        avatarEnabled: snapshot.avatarEnabled ?? false,
                        avatarStyle: snapshot.avatarStyle ?? 'audio-only',
                        avatarProvider: snapshot.avatarProvider ?? 'none',
                        avatarLocale: snapshot.avatarLocale ?? 'en-US',
                        snapshotVersion: nextVersion,
                        snapshotChecksum,
                        source,
                        frozenAt: new Date(snapshot.frozenAt),
                    },
                });

                return {
                    ...snapshot,
                    id: typeof created['id'] === 'string' ? created['id'] : snapshot.id,
                    tenantId: config.tenantId,
                    workspaceId: config.workspaceId,
                    snapshotVersion: nextVersion,
                    snapshotChecksum,
                    source,
                };
            } catch {
                return {
                    ...snapshot,
                    source,
                };
            } finally {
                await prisma.$disconnect().catch(() => undefined);
            }
        },
    };
};

const evaluateSnapshotExecutionPolicy = (input: {
    snapshot: BotCapabilitySnapshotRecord | null;
    actionType: string;
    connectorType: RuntimeConnectorType | null;
}): { allowed: boolean; reason?: string } => {
    if (!input.snapshot) {
        return {
            allowed: false,
            reason: 'Capability snapshot is not available in runtime state.',
        };
    }

    if (!input.connectorType || !CONNECTOR_ACTION_TYPES.has(input.actionType as RuntimeConnectorActionType)) {
        return { allowed: true };
    }

    if (!input.snapshot.allowedConnectorTools.includes(input.connectorType)) {
        return {
            allowed: false,
            reason: `Connector ${input.connectorType} is not allowed for role ${input.snapshot.roleKey}.`,
        };
    }

    if (!input.snapshot.allowedActions.includes(input.actionType)) {
        return {
            allowed: false,
            reason: `Action ${input.actionType} is not in frozen capability snapshot policy.`,
        };
    }

    return { allowed: true };
};

const shouldRetryApprovalIntake = (statusCode: number): boolean => {
    if (statusCode === 0) {
        return true;
    }
    if (statusCode === 429) {
        return true;
    }
    if (statusCode >= 500) {
        return true;
    }
    return false;
};

const readEnv = (env: NodeJS.ProcessEnv, primary: string, fallback: string): string | undefined => {
    return env[primary] ?? env[fallback];
};

const required = (env: NodeJS.ProcessEnv, primary: string, fallback: string): string => {
    const value = readEnv(env, primary, fallback);
    if (!value || !value.trim()) {
        throw new Error(`Missing required environment variable ${primary} (or ${fallback})`);
    }
    return value;
};

const buildConfig = (env: NodeJS.ProcessEnv): RuntimeConfig => {
    const healthPortRaw = required(env, 'AF_HEALTH_PORT', 'AGENTFARM_HEALTH_PORT');
    const healthPort = Number(healthPortRaw);
    if (!Number.isFinite(healthPort) || healthPort <= 0) {
        throw new Error(`Invalid AF_HEALTH_PORT value '${healthPortRaw}'`);
    }

    const approvalIntakeToken = readEnv(
        env,
        'AF_APPROVAL_INTAKE_SHARED_TOKEN',
        'AGENTFARM_APPROVAL_INTAKE_SHARED_TOKEN',
    ) ?? null;

    const decisionWebhookToken = readEnv(
        env,
        'AF_RUNTIME_DECISION_SHARED_TOKEN',
        'AGENTFARM_RUNTIME_DECISION_SHARED_TOKEN',
    ) ?? approvalIntakeToken;

    const connectorExecuteToken = readEnv(
        env,
        'AF_CONNECTOR_EXEC_SHARED_TOKEN',
        'AGENTFARM_CONNECTOR_EXEC_SHARED_TOKEN',
    ) ?? approvalIntakeToken;

    const connectorApiUrl =
        readEnv(env, 'AF_CONNECTOR_API_URL', 'AGENTFARM_CONNECTOR_API_URL')
        ?? required(env, 'AF_APPROVAL_API_URL', 'AGENTFARM_APPROVAL_API_URL');

    if (env.NODE_ENV === 'production' && !approvalIntakeToken) {
        throw new Error('Missing required environment variable AF_APPROVAL_INTAKE_SHARED_TOKEN for production runtime intake auth');
    }

    const roleProfile = required(env, 'AF_ROLE_PROFILE', 'AGENTFARM_ROLE_TYPE');
    const roleKey =
        normalizeRoleKey(readEnv(env, 'AF_ROLE_KEY', 'AGENTFARM_ROLE_KEY'))
        ?? roleKeyFromRoleProfile(roleProfile);
    if (!roleKey) {
        throw new Error('Unable to resolve role key. Set AF_ROLE_KEY or provide a supported AF_ROLE_PROFILE.');
    }

    return {
        tenantId: required(env, 'AF_TENANT_ID', 'AGENTFARM_TENANT_ID'),
        workspaceId: required(env, 'AF_WORKSPACE_ID', 'AGENTFARM_WORKSPACE_ID'),
        botId: required(env, 'AF_BOT_ID', 'AGENTFARM_BOT_ID'),
        roleProfile,
        roleKey,
        roleVersion: readEnv(env, 'AF_ROLE_VERSION', 'AGENTFARM_ROLE_VERSION') ?? DEFAULT_ROLE_VERSION,
        policyPackVersion: required(env, 'AF_POLICY_PACK_VERSION', 'AGENTFARM_POLICY_PACK_VERSION'),
        approvalApiUrl: required(env, 'AF_APPROVAL_API_URL', 'AGENTFARM_APPROVAL_API_URL'),
        approvalIntakeToken,
        decisionWebhookToken,
        connectorApiUrl,
        connectorExecuteToken,
        evidenceApiUrl: required(env, 'AF_EVIDENCE_API_URL', 'AGENTFARM_EVIDENCE_API_ENDPOINT'),
        healthPort,
        logLevel: required(env, 'AF_LOG_LEVEL', 'AGENTFARM_LOG_LEVEL'),
        contractVersion: required(env, 'AF_RUNTIME_CONTRACT_VERSION', 'AGENTFARM_CONTRACT_VERSION'),
        correlationId: readEnv(env, 'AF_CORRELATION_ID', 'AGENTFARM_CORRELATION_ID') ?? 'unknown',
        controlPlaneHeartbeatUrl:
            readEnv(env, 'AF_CONTROL_PLANE_HEARTBEAT_URL', 'AGENTFARM_CONTROL_PLANE_HEARTBEAT_URL')
            ?? required(env, 'AF_APPROVAL_API_URL', 'AGENTFARM_APPROVAL_API_URL'),
    };
};

const defaultApprovalIntakeClient: ApprovalIntakeClient = async (input) => {
    try {
        const url = new URL('/v1/approvals/intake', input.baseUrl).toString();
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(input.token ? { 'x-approval-intake-token': input.token } : {}),
            },
            body: JSON.stringify({
                tenant_id: input.tenantId,
                workspace_id: input.workspaceId,
                bot_id: input.botId,
                task_id: input.taskId,
                action_id: input.actionId,
                action_summary: input.actionSummary,
                risk_level: input.riskLevel,
                requested_by: input.requestedBy,
                policy_pack_version: input.policyPackVersion,
            }),
            signal: AbortSignal.timeout(4_000),
        });

        let approvalId: string | undefined;
        let errorMessage: string | undefined;
        try {
            const parsed = await response.json() as { approval_id?: string; message?: string; error?: string };
            approvalId = parsed.approval_id;
            errorMessage = parsed.message ?? parsed.error;
        } catch {
            errorMessage = undefined;
        }

        return {
            ok: response.ok,
            statusCode: response.status,
            errorMessage,
            approvalId,
        };
    } catch (err: unknown) {
        return {
            ok: false,
            statusCode: 0,
            errorMessage: err instanceof Error ? err.message : String(err),
        };
    }
};

const normalizeConnectorType = (value: unknown): 'jira' | 'teams' | 'github' | 'email' | null => {
    if (typeof value !== 'string' || !value.trim()) {
        return null;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === 'jira' || normalized === 'teams' || normalized === 'github' || normalized === 'email') {
        return normalized;
    }

    return null;
};

const defaultConnectorActionExecuteClient: ConnectorActionExecuteClient = async (input) => {
    try {
        const url = new URL('/v1/connectors/actions/execute', input.baseUrl).toString();
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(input.token ? { 'x-connector-exec-token': input.token } : {}),
            },
            body: JSON.stringify({
                tenant_id: input.tenantId,
                workspace_id: input.workspaceId,
                bot_id: input.botId,
                role_key: input.roleKey,
                connector_type: input.connectorType,
                action_type: input.actionType,
                payload: input.payload,
                correlation_id: input.correlationId,
            }),
            signal: AbortSignal.timeout(6_000),
        });

        let attempts: number | undefined;
        let errorMessage: string | undefined;
        try {
            const parsed = await response.json() as { attempts?: number; message?: string; error?: string };
            attempts = parsed.attempts;
            errorMessage = parsed.message ?? parsed.error;
        } catch {
            errorMessage = undefined;
        }

        return {
            ok: response.ok,
            statusCode: response.status,
            attempts,
            errorMessage,
        };
    } catch (err: unknown) {
        return {
            ok: false,
            statusCode: 0,
            errorMessage: err instanceof Error ? err.message : String(err),
        };
    }
};

const readDecisionAuthToken = (headers: Record<string, unknown>): string | null => {
    const direct = headers['x-runtime-decision-token'];
    if (typeof direct === 'string' && direct.trim()) {
        return direct.trim();
    }

    const authHeader = headers.authorization;
    if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
        return authHeader.slice(7).trim();
    }

    return null;
};

const createDefaultTaskExecutionRecordWriter = (env: NodeJS.ProcessEnv): TaskExecutionRecordWriter => {
    const prismaModuleName = '@prisma/client';

    const createPrismaClient = async (): Promise<{
        taskExecutionRecord: {
            create: (args: Record<string, unknown>) => Promise<unknown>;
        };
        $disconnect: () => Promise<void>;
    } | null> => {
        const databaseUrl = env.DATABASE_URL;
        if (!databaseUrl || !databaseUrl.trim()) {
            return null;
        }

        try {
            const prismaModule = await import(prismaModuleName);
            const PrismaClient = (prismaModule as { PrismaClient?: new () => unknown }).PrismaClient;
            if (!PrismaClient) {
                return null;
            }

            return new PrismaClient() as {
                taskExecutionRecord: {
                    create: (args: Record<string, unknown>) => Promise<unknown>;
                };
                $disconnect: () => Promise<void>;
            };
        } catch {
            return null;
        }
    };

    return {
        write: async (input) => {
            const prisma = await createPrismaClient();
            if (!prisma) {
                return;
            }

            try {
                await prisma.taskExecutionRecord.create({
                    data: {
                        botId: input.botId,
                        tenantId: input.tenantId,
                        workspaceId: input.workspaceId,
                        taskId: input.taskId,
                        modelProvider: input.modelProvider,
                        modelProfile: input.modelProfile,
                        promptTokens: input.promptTokens ?? undefined,
                        completionTokens: input.completionTokens ?? undefined,
                        totalTokens: input.totalTokens ?? undefined,
                        latencyMs: input.latencyMs,
                        outcome: input.outcome,
                        executedAt: input.executedAt,
                    },
                });
            } finally {
                await prisma.$disconnect();
            }
        },
    };
};

const defaultDependencyProbe = async (baseUrl: string): Promise<boolean> => {
    try {
        const url = new URL('/health', baseUrl).toString();
        const response = await fetch(url, { signal: AbortSignal.timeout(4_000) });
        return response.ok;
    } catch {
        return false;
    }
};

export function buildRuntimeServer(options: RuntimeServerOptions = {}): FastifyInstance {
    const env = options.env ?? process.env;
    const workerPollMs = options.workerPollMs ?? DEFAULT_WORKER_POLL_MS;
    const killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
    const closeOnKill = options.closeOnKill ?? true;
    const now = options.now ?? (() => Date.now());
    const approvalEscalationMs = options.approvalEscalationMs ?? DEFAULT_APPROVAL_ESCALATION_MS;
    const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    const maxRuntimeLogs = options.maxRuntimeLogs ?? DEFAULT_MAX_RUNTIME_LOGS;
    const approvalIntakeMaxAttempts =
        Math.max(1, options.approvalIntakeMaxAttempts ?? DEFAULT_APPROVAL_INTAKE_MAX_ATTEMPTS);
    const approvalIntakeBackoffMs =
        Math.max(1, options.approvalIntakeBackoffMs ?? DEFAULT_APPROVAL_INTAKE_BACKOFF_MS);
    const dependencyProbe = options.dependencyProbe ?? defaultDependencyProbe;
    const approvalIntakeClient = options.approvalIntakeClient ?? defaultApprovalIntakeClient;
    const connectorActionExecuteClient =
        options.connectorActionExecuteClient ?? defaultConnectorActionExecuteClient;
    const capabilitySnapshotPersistenceClient =
        options.capabilitySnapshotPersistenceClient
        ?? createDefaultCapabilitySnapshotPersistenceClient(env);
    const taskExecutionRecordWriter =
        options.taskExecutionRecordWriter
        ?? createDefaultTaskExecutionRecordWriter(env);
    const sleep = options.sleep ?? defaultSleep;
    const exitProcess = options.exitProcess ?? ((code: number) => process.exit(code));
    const actionResultLogPath = resolveActionResultPath(env);
    const actionResultWriter = options.actionResultWriter ?? createFileActionResultWriter(actionResultLogPath);

    const app = Fastify({
        logger: {
            level: env.AF_LOG_LEVEL ?? env.AGENTFARM_LOG_LEVEL ?? 'info',
        },
    });

    let runtimeState: RuntimeState = 'created';
    let startupAttempts = 0;
    let startupCompleted = false;
    let killSwitchEngaged = false;
    let configCache: RuntimeConfig | null = null;
    let capabilitySnapshotCache: BotCapabilitySnapshotRecord | null = null;
    let snapshotObservabilityMetadata: SnapshotObservabilityMetadata | null = null;
    const runtimeLogs: RuntimeLogEntry[] = [];
    const stateHistory: RuntimeStateTransition[] = [
        {
            at: new Date(now()).toISOString(),
            from: 'created',
            to: 'created',
            reason: 'initialized',
        },
    ];

    const workerLoop: WorkerLoop = {
        running: false,
        handle: null,
        tickBusy: false,
        queuedTasks: [],
        processedTasks: 0,
        succeededTasks: 0,
        failedTasks: 0,
        approvalQueuedTasks: 0,
        approvalResolvedTasks: 0,
        approvalApprovedTasks: 0,
        approvalRejectedTasks: 0,
        pendingApprovals: [],
        approvedDecisionCache: new Map<string, DecisionCacheEntry>(),
        approvalDecisionCacheHits: 0,
        escalatedApprovalTasks: 0,
        retriedAttempts: 0,
    };

    const heartbeatLoop: HeartbeatLoop = {
        running: false,
        handle: null,
        sent: 0,
        failed: 0,
        lastHeartbeatAt: null,
    };

    const emitRuntimeEvent = (
        eventType: string,
        config: RuntimeConfig | null,
        extra?: Record<string, unknown>,
    ): void => {
        runtimeLogs.push({
            at: new Date(now()).toISOString(),
            eventType,
            tenantId: config?.tenantId ?? null,
            workspaceId: config?.workspaceId ?? null,
            botId: config?.botId ?? null,
            correlationId: config?.correlationId ?? null,
            runtimeState,
            details: extra,
        });
        if (runtimeLogs.length > maxRuntimeLogs) {
            runtimeLogs.splice(0, runtimeLogs.length - maxRuntimeLogs);
        }

        app.log.info({
            event_type: eventType,
            tenant_id: config?.tenantId ?? null,
            workspace_id: config?.workspaceId ?? null,
            bot_id: config?.botId ?? null,
            correlation_id: config?.correlationId ?? null,
            runtime_state: runtimeState,
            ...extra,
        });
    };

    const setRuntimeState = (next: RuntimeState, config: RuntimeConfig | null, reason?: string): void => {
        const prev = runtimeState;
        runtimeState = next;
        stateHistory.push({
            at: new Date(now()).toISOString(),
            from: prev,
            to: next,
            reason: reason ?? null,
        });
        emitRuntimeEvent('runtime.state_transition', config, {
            from_state: prev,
            next_state: next,
            reason: reason ?? null,
        });
    };

    const stopWorkerLoop = (): void => {
        workerLoop.running = false;
        workerLoop.tickBusy = false;
        if (workerLoop.handle) {
            clearInterval(workerLoop.handle);
            workerLoop.handle = null;
        }
    };

    const stopHeartbeatLoop = (): void => {
        heartbeatLoop.running = false;
        if (heartbeatLoop.handle) {
            clearInterval(heartbeatLoop.handle);
            heartbeatLoop.handle = null;
        }
    };

    const executeApprovedTask = async (
        task: TaskEnvelope,
        config: RuntimeConfig,
        source: 'approval_decision_webhook' | 'approval_decision_cache',
    ): Promise<ProcessedTaskResult> => {
        const decision = buildDecision(task);
        const connectorType = normalizeConnectorType(task.payload['connector_type']);
        const snapshotPolicy = evaluateSnapshotExecutionPolicy({
            snapshot: capabilitySnapshotCache,
            actionType: decision.actionType,
            connectorType,
        });
        if (!snapshotPolicy.allowed) {
            emitRuntimeEvent('runtime.capability_policy_blocked', config, {
                task_id: task.taskId,
                action_type: decision.actionType,
                connector_type: connectorType,
                reason: snapshotPolicy.reason ?? null,
                source,
                role_key: capabilitySnapshotCache?.roleKey ?? null,
                snapshot_id: capabilitySnapshotCache?.id ?? null,
            });
            return {
                decision: {
                    ...decision,
                    route: 'execute',
                    reason: snapshotPolicy.reason ?? 'Blocked by capability snapshot policy.',
                },
                status: 'failed',
                attempts: 0,
                transientRetries: 0,
                failureClass: 'runtime_exception',
                errorMessage: snapshotPolicy.reason ?? 'Capability policy blocked execution.',
            };
        }

        const isConnectorAction = CONNECTOR_ACTION_TYPES.has(
            decision.actionType as
            | 'read_task'
            | 'create_comment'
            | 'update_status'
            | 'send_message'
            | 'create_pr_comment'
            | 'send_email',
        );

        if (connectorType && isConnectorAction) {
            const connectorResponse = await connectorActionExecuteClient({
                baseUrl: config.connectorApiUrl,
                token: config.connectorExecuteToken,
                tenantId: config.tenantId,
                workspaceId: config.workspaceId,
                botId: config.botId,
                roleKey: config.roleKey,
                connectorType,
                actionType: decision.actionType as
                    | 'read_task'
                    | 'create_comment'
                    | 'update_status'
                    | 'send_message'
                    | 'create_pr_comment'
                    | 'send_email',
                payload: task.payload,
                correlationId: `${config.correlationId}:${task.taskId}`,
            });

            if (connectorResponse.ok) {
                emitRuntimeEvent('runtime.connector_action_executed', config, {
                    task_id: task.taskId,
                    connector_type: connectorType,
                    action_type: decision.actionType,
                    status_code: connectorResponse.statusCode,
                    source,
                });

                const attempts = Math.max(1, connectorResponse.attempts ?? 1);
                return {
                    decision: {
                        ...decision,
                        route: 'execute',
                        reason: 'Executed via connector action endpoint after approval.',
                    },
                    status: 'success',
                    attempts,
                    transientRetries: Math.max(0, attempts - 1),
                };
            }

            emitRuntimeEvent('runtime.connector_action_failed', config, {
                task_id: task.taskId,
                connector_type: connectorType,
                action_type: decision.actionType,
                status_code: connectorResponse.statusCode,
                error_message: connectorResponse.errorMessage ?? null,
                source,
            });

            return {
                decision: {
                    ...decision,
                    route: 'execute',
                    reason: 'Connector action endpoint execution failed after approval.',
                },
                status: 'failed',
                attempts: Math.max(1, connectorResponse.attempts ?? 1),
                transientRetries: 0,
                failureClass:
                    connectorResponse.statusCode === 0
                        || connectorResponse.statusCode === 429
                        || connectorResponse.statusCode >= 500
                        ? 'transient_error'
                        : 'runtime_exception',
                errorMessage: connectorResponse.errorMessage ?? `Connector execution failed with status ${connectorResponse.statusCode}.`,
            };
        }

        return processApprovedTask(task, { maxAttempts: 3 });
    };

    const processOneTask = async (task: TaskEnvelope, config: RuntimeConfig): Promise<void> => {
        const taskDecision = buildDecision(task);
        const connectorTypeForPolicy = normalizeConnectorType(task.payload['connector_type']);
        const snapshotPolicy = evaluateSnapshotExecutionPolicy({
            snapshot: capabilitySnapshotCache,
            actionType: taskDecision.actionType,
            connectorType: connectorTypeForPolicy,
        });
        if (!snapshotPolicy.allowed) {
            workerLoop.processedTasks += 1;
            workerLoop.failedTasks += 1;
            emitRuntimeEvent('runtime.capability_policy_blocked', config, {
                task_id: task.taskId,
                action_type: taskDecision.actionType,
                connector_type: connectorTypeForPolicy,
                reason: snapshotPolicy.reason ?? null,
                role_key: capabilitySnapshotCache?.roleKey ?? null,
                snapshot_id: capabilitySnapshotCache?.id ?? null,
            });

            await persistActionResultRecord(task, config, {
                decision: {
                    ...taskDecision,
                    route: 'execute',
                    reason: snapshotPolicy.reason ?? 'Blocked by capability snapshot policy.',
                },
                status: 'failed',
                attempts: 0,
                transientRetries: 0,
                failureClass: 'runtime_exception',
                errorMessage: snapshotPolicy.reason ?? 'Capability policy blocked execution.',
            });
            return;
        }

        const cachedApproval = workerLoop.approvedDecisionCache.get(task.taskId);

        if (cachedApproval && taskDecision.route === 'approval') {
            workerLoop.approvalDecisionCacheHits += 1;
            emitRuntimeEvent('runtime.approval_decision_cache_hit', config, {
                task_id: task.taskId,
                action_type: taskDecision.actionType,
                decision: cachedApproval.decision,
                actor: cachedApproval.actor,
                decided_at: new Date(cachedApproval.decidedAt).toISOString(),
            });

            const approvedResult = await executeApprovedTask(task, config, 'approval_decision_cache');
            workerLoop.processedTasks += 1;
            workerLoop.retriedAttempts += approvedResult.transientRetries;

            if (approvedResult.status === 'success') {
                workerLoop.succeededTasks += 1;
                emitRuntimeEvent('runtime.task_processed', config, {
                    task_id: task.taskId,
                    queue_depth: workerLoop.queuedTasks.length,
                    processed_tasks: workerLoop.processedTasks,
                    retries: approvedResult.transientRetries,
                    attempts: approvedResult.attempts,
                    source: 'approval_decision_cache',
                });
            } else {
                workerLoop.failedTasks += 1;
                emitRuntimeEvent('runtime.task_failed', config, {
                    task_id: task.taskId,
                    attempts: approvedResult.attempts,
                    retries: approvedResult.transientRetries,
                    failure_class: approvedResult.failureClass ?? 'runtime_exception',
                    error_message: approvedResult.errorMessage ?? null,
                    source: 'approval_decision_cache',
                });
            }

            await persistActionResultRecord(task, config, approvedResult);
            return;
        }

        const result = await processDeveloperTask(task, { maxAttempts: 3 });
        workerLoop.processedTasks += 1;
        workerLoop.retriedAttempts += result.transientRetries;

        emitRuntimeEvent('runtime.task_classified', config, {
            task_id: task.taskId,
            action_type: result.decision.actionType,
            confidence: result.decision.confidence,
            risk_level: result.decision.riskLevel,
            route: result.decision.route,
            classification_reason: result.decision.reason,
        });

        if (result.status === 'approval_required') {
            workerLoop.approvalQueuedTasks += 1;
            if (result.decision.riskLevel === 'medium' || result.decision.riskLevel === 'high') {
                const actionId = `${task.taskId}:${result.decision.actionType}`;
                const actionSummary =
                    typeof task.payload['summary'] === 'string' && task.payload['summary'].trim()
                        ? task.payload['summary']
                        : `${result.decision.actionType} requested by runtime`;

                const pendingRecord: PendingApprovalTask = {
                    taskId: task.taskId,
                    enqueuedAt: now(),
                    riskLevel: result.decision.riskLevel,
                    actionType: result.decision.actionType,
                    actionSummary,
                    task,
                    escalated: false,
                };

                const existingPendingIndex = workerLoop.pendingApprovals
                    .findIndex((pending) => pending.taskId === task.taskId);
                if (existingPendingIndex >= 0) {
                    workerLoop.pendingApprovals[existingPendingIndex] = pendingRecord;
                } else {
                    workerLoop.pendingApprovals.push(pendingRecord);
                }

                if (config.approvalIntakeToken) {
                    let lastIntake: Awaited<ReturnType<ApprovalIntakeClient>> | null = null;
                    let intakeAttempts = 0;
                    for (let attempt = 1; attempt <= approvalIntakeMaxAttempts; attempt += 1) {
                        intakeAttempts = attempt;
                        const intake = await approvalIntakeClient({
                            baseUrl: config.approvalApiUrl,
                            token: config.approvalIntakeToken,
                            tenantId: config.tenantId,
                            workspaceId: config.workspaceId,
                            botId: config.botId,
                            taskId: task.taskId,
                            actionId,
                            actionSummary,
                            riskLevel: result.decision.riskLevel,
                            requestedBy: `runtime:${config.botId}`,
                            policyPackVersion: config.policyPackVersion,
                        });

                        lastIntake = intake;
                        if (intake.ok) {
                            emitRuntimeEvent('runtime.approval_intake_queued', config, {
                                task_id: task.taskId,
                                action_id: actionId,
                                approval_id: intake.approvalId ?? null,
                                attempt,
                            });
                            break;
                        }

                        const willRetry =
                            attempt < approvalIntakeMaxAttempts
                            && shouldRetryApprovalIntake(intake.statusCode);

                        if (!willRetry) {
                            break;
                        }

                        const backoffMs = approvalIntakeBackoffMs * 2 ** (attempt - 1);
                        emitRuntimeEvent('runtime.approval_intake_retry_scheduled', config, {
                            task_id: task.taskId,
                            action_id: actionId,
                            attempt,
                            next_attempt: attempt + 1,
                            wait_ms: backoffMs,
                            status_code: intake.statusCode,
                        });
                        await sleep(backoffMs);
                    }

                    if (lastIntake && !lastIntake.ok) {
                        emitRuntimeEvent('runtime.approval_intake_failed', config, {
                            task_id: task.taskId,
                            action_id: actionId,
                            status_code: lastIntake.statusCode,
                            error_message: lastIntake.errorMessage ?? null,
                            attempts: intakeAttempts,
                        });
                    }
                } else {
                    emitRuntimeEvent('runtime.approval_intake_skipped', config, {
                        task_id: task.taskId,
                        action_id: actionId,
                        reason: 'missing_shared_token',
                    });
                }
            }
            emitRuntimeEvent('runtime.approval_required', config, {
                task_id: task.taskId,
                risk_level: result.decision.riskLevel,
                confidence: result.decision.confidence,
            });
            await persistActionResultRecord(task, config, result);
            return;
        }

        if (result.status === 'success') {
            workerLoop.succeededTasks += 1;
            emitRuntimeEvent('runtime.task_processed', config, {
                task_id: task.taskId,
                queue_depth: workerLoop.queuedTasks.length,
                processed_tasks: workerLoop.processedTasks,
                retries: result.transientRetries,
                attempts: result.attempts,
            });
            await persistActionResultRecord(task, config, result);
            return;
        }

        workerLoop.failedTasks += 1;
        emitRuntimeEvent('runtime.task_failed', config, {
            task_id: task.taskId,
            attempts: result.attempts,
            retries: result.transientRetries,
            failure_class: result.failureClass ?? 'runtime_exception',
            error_message: result.errorMessage ?? null,
        });
        await persistActionResultRecord(task, config, result);
    };

    const persistActionResultRecord = async (
        task: TaskEnvelope,
        config: RuntimeConfig,
        result: ProcessedTaskResult,
    ): Promise<void> => {
        const record: ActionResultRecord = {
            recordId: `${task.taskId}:${now()}`,
            recordedAt: new Date().toISOString(),
            tenantId: config.tenantId,
            workspaceId: config.workspaceId,
            botId: config.botId,
            roleProfile: config.roleProfile,
            policyPackVersion: config.policyPackVersion,
            correlationId: config.correlationId,
            taskId: task.taskId,
            actionType: result.decision.actionType,
            riskLevel: result.decision.riskLevel,
            confidence: result.decision.confidence,
            route: result.decision.route,
            status: result.status,
            attempts: result.attempts,
            retries: result.transientRetries,
            failureClass: result.failureClass,
            errorMessage: result.errorMessage,
        };

        try {
            await actionResultWriter(record);
            emitRuntimeEvent('runtime.action_result_persisted', config, {
                record_id: record.recordId,
                task_id: task.taskId,
                status: record.status,
                path: actionResultLogPath,
            });
        } catch (err: unknown) {
            emitRuntimeEvent('runtime.action_result_persist_failed', config, {
                record_id: record.recordId,
                task_id: task.taskId,
                status: record.status,
                error_message: err instanceof Error ? err.message : String(err),
            });
        }

        // Write LLM task execution metadata for Sprint 2 observability baseline.
        // Token counts are null until real LLM provider integration is complete.
        const taskOutcome: TaskExecutionOutcome =
            result.status === 'success'
                ? 'success'
                : result.status === 'approval_required'
                    ? 'approval_queued'
                    : 'failed';
        const brainConfig = capabilitySnapshotCache?.brainConfig;
        const modelProfile =
            brainConfig && typeof brainConfig === 'object' && 'defaultModelProfile' in brainConfig
                ? String((brainConfig as { defaultModelProfile: unknown }).defaultModelProfile)
                : 'quality_first';
        const modelProvider = env.AF_MODEL_PROVIDER ?? 'agentfarm';
        const latencyMs = Math.max(0, now() - task.enqueuedAt);

        taskExecutionRecordWriter.write({
            botId: config.botId,
            tenantId: config.tenantId,
            workspaceId: config.workspaceId,
            taskId: task.taskId,
            modelProvider,
            modelProfile,
            promptTokens: null,
            completionTokens: null,
            totalTokens: null,
            latencyMs,
            outcome: taskOutcome,
            executedAt: new Date(task.enqueuedAt),
        }).catch(() => {
            // Non-blocking: task execution record write failures do not affect task outcome
        });
    };

    const persistCancelledApprovalRecord = async (
        input: {
            task: TaskEnvelope;
            actionType: string;
            riskLevel: 'medium' | 'high';
            reason: string | null;
        },
        config: RuntimeConfig,
    ): Promise<void> => {
        const record: ActionResultRecord = {
            recordId: `${input.task.taskId}:${now()}`,
            recordedAt: new Date().toISOString(),
            tenantId: config.tenantId,
            workspaceId: config.workspaceId,
            botId: config.botId,
            roleProfile: config.roleProfile,
            policyPackVersion: config.policyPackVersion,
            correlationId: config.correlationId,
            taskId: input.task.taskId,
            actionType: input.actionType,
            riskLevel: input.riskLevel,
            confidence: 1,
            route: 'approval',
            status: 'cancelled',
            attempts: 0,
            retries: 0,
            errorMessage: input.reason ?? undefined,
        };

        try {
            await actionResultWriter(record);
            emitRuntimeEvent('runtime.action_result_persisted', config, {
                record_id: record.recordId,
                task_id: input.task.taskId,
                status: record.status,
                path: actionResultLogPath,
            });
        } catch (err: unknown) {
            emitRuntimeEvent('runtime.action_result_persist_failed', config, {
                record_id: record.recordId,
                task_id: input.task.taskId,
                status: record.status,
                error_message: err instanceof Error ? err.message : String(err),
            });
        }
    };

    const processApprovalEscalations = (config: RuntimeConfig): void => {
        const currentTime = now();
        for (const approval of workerLoop.pendingApprovals) {
            if (approval.escalated) {
                continue;
            }

            const elapsedMs = currentTime - approval.enqueuedAt;
            if (elapsedMs < approvalEscalationMs) {
                continue;
            }

            approval.escalated = true;
            workerLoop.escalatedApprovalTasks += 1;
            emitRuntimeEvent('runtime.approval_escalated', config, {
                task_id: approval.taskId,
                risk_level: approval.riskLevel,
                wait_ms: elapsedMs,
            });
        }
    };

    const sendHeartbeat = async (config: RuntimeConfig): Promise<void> => {
        const ok = await dependencyProbe(config.controlPlaneHeartbeatUrl);
        if (ok) {
            heartbeatLoop.sent += 1;
            heartbeatLoop.lastHeartbeatAt = new Date(now()).toISOString();
            emitRuntimeEvent('runtime.heartbeat_sent', config, {
                heartbeat_url: config.controlPlaneHeartbeatUrl,
                sent_count: heartbeatLoop.sent,
            });
            return;
        }

        heartbeatLoop.failed += 1;
        emitRuntimeEvent('runtime.heartbeat_failed', config, {
            heartbeat_url: config.controlPlaneHeartbeatUrl,
            failed_count: heartbeatLoop.failed,
        });
    };

    const startWorkerLoop = (config: RuntimeConfig): void => {
        if (workerLoop.running && workerLoop.handle) {
            return;
        }

        workerLoop.running = true;
        workerLoop.handle = setInterval(() => {
            if (!workerLoop.running || killSwitchEngaged) {
                return;
            }
            if (workerLoop.tickBusy) {
                return;
            }
            if (runtimeState !== 'active' && runtimeState !== 'degraded') {
                return;
            }
            processApprovalEscalations(config);
            const task = workerLoop.queuedTasks.shift();
            if (!task) {
                return;
            }
            workerLoop.tickBusy = true;
            void processOneTask(task, config).finally(() => {
                workerLoop.tickBusy = false;
            });
        }, workerPollMs);

        emitRuntimeEvent('runtime.worker_loops_started', config, {
            poll_interval_ms: workerPollMs,
        });
    };

    const startHeartbeatLoop = (config: RuntimeConfig): void => {
        if (heartbeatLoop.running && heartbeatLoop.handle) {
            return;
        }

        heartbeatLoop.running = true;
        heartbeatLoop.handle = setInterval(() => {
            if (!heartbeatLoop.running || killSwitchEngaged) {
                return;
            }
            if (runtimeState !== 'active' && runtimeState !== 'degraded') {
                return;
            }
            void sendHeartbeat(config);
        }, heartbeatIntervalMs);

        emitRuntimeEvent('runtime.heartbeat_loop_started', config, {
            heartbeat_interval_ms: heartbeatIntervalMs,
            heartbeat_url: config.controlPlaneHeartbeatUrl,
        });
    };

    const getReadiness = async (): Promise<{ ready: boolean; checks: Record<string, boolean> }> => {
        try {
            const config = configCache ?? buildConfig(env);
            configCache = config;
            const [approvalOk, evidenceOk] = await Promise.all([
                dependencyProbe(config.approvalApiUrl),
                dependencyProbe(config.evidenceApiUrl),
            ]);

            const checks = {
                config_loaded: true,
                approval_api_reachable: approvalOk,
                evidence_api_reachable: evidenceOk,
                worker_loops_started: workerLoop.running,
                kill_switch_clear: !killSwitchEngaged,
            };

            return {
                ready: Object.values(checks).every(Boolean) && (runtimeState === 'ready' || runtimeState === 'active'),
                checks,
            };
        } catch {
            return {
                ready: false,
                checks: {
                    config_loaded: false,
                    approval_api_reachable: false,
                    evidence_api_reachable: false,
                    worker_loops_started: workerLoop.running,
                    kill_switch_clear: !killSwitchEngaged,
                },
            };
        }
    };

    app.get('/health/live', async () => {
        return {
            ok: runtimeState !== 'stopped' && runtimeState !== 'failed',
            state: runtimeState,
            startup_attempts: startupAttempts,
            worker_loop_running: workerLoop.running,
            heartbeat_loop_running: heartbeatLoop.running,
            heartbeat_sent: heartbeatLoop.sent,
            heartbeat_failed: heartbeatLoop.failed,
            last_heartbeat_at: heartbeatLoop.lastHeartbeatAt,
            task_queue_depth: workerLoop.queuedTasks.length,
            processed_tasks: workerLoop.processedTasks,
            succeeded_tasks: workerLoop.succeededTasks,
            failed_tasks: workerLoop.failedTasks,
            approval_queued_tasks: workerLoop.approvalQueuedTasks,
            approval_resolved_tasks: workerLoop.approvalResolvedTasks,
            approval_approved_tasks: workerLoop.approvalApprovedTasks,
            approval_rejected_tasks: workerLoop.approvalRejectedTasks,
            pending_approval_tasks: workerLoop.pendingApprovals.length,
            approval_decision_cache_size: workerLoop.approvedDecisionCache.size,
            approval_decision_cache_hits: workerLoop.approvalDecisionCacheHits,
            escalated_approval_tasks: workerLoop.escalatedApprovalTasks,
            retried_attempts: workerLoop.retriedAttempts,
        };
    });

    app.get('/health/ready', async () => {
        const readiness = await getReadiness();
        if (!readiness.ready && (runtimeState === 'ready' || runtimeState === 'active')) {
            setRuntimeState('degraded', configCache, 'dependency_unreachable');
        }
        if (readiness.ready && runtimeState === 'degraded' && !killSwitchEngaged) {
            setRuntimeState('active', configCache, 'dependency_recovered');
        }
        return {
            ready: readiness.ready,
            state: runtimeState,
            checks: readiness.checks,
            heartbeat_loop_running: heartbeatLoop.running,
            heartbeat_sent: heartbeatLoop.sent,
            heartbeat_failed: heartbeatLoop.failed,
            last_heartbeat_at: heartbeatLoop.lastHeartbeatAt,
            task_queue_depth: workerLoop.queuedTasks.length,
            processed_tasks: workerLoop.processedTasks,
            succeeded_tasks: workerLoop.succeededTasks,
            failed_tasks: workerLoop.failedTasks,
            approval_queued_tasks: workerLoop.approvalQueuedTasks,
            approval_resolved_tasks: workerLoop.approvalResolvedTasks,
            approval_approved_tasks: workerLoop.approvalApprovedTasks,
            approval_rejected_tasks: workerLoop.approvalRejectedTasks,
            pending_approval_tasks: workerLoop.pendingApprovals.length,
            approval_decision_cache_size: workerLoop.approvedDecisionCache.size,
            approval_decision_cache_hits: workerLoop.approvalDecisionCacheHits,
            escalated_approval_tasks: workerLoop.escalatedApprovalTasks,
            retried_attempts: workerLoop.retriedAttempts,
        };
    });

    app.get('/health', async () => {
        const readiness = await getReadiness();
        return {
            ok: readiness.ready,
            state: runtimeState,
            checks: readiness.checks,
            heartbeat_loop_running: heartbeatLoop.running,
            heartbeat_sent: heartbeatLoop.sent,
            heartbeat_failed: heartbeatLoop.failed,
            last_heartbeat_at: heartbeatLoop.lastHeartbeatAt,
            task_queue_depth: workerLoop.queuedTasks.length,
            processed_tasks: workerLoop.processedTasks,
            succeeded_tasks: workerLoop.succeededTasks,
            failed_tasks: workerLoop.failedTasks,
            approval_queued_tasks: workerLoop.approvalQueuedTasks,
            approval_resolved_tasks: workerLoop.approvalResolvedTasks,
            approval_approved_tasks: workerLoop.approvalApprovedTasks,
            approval_rejected_tasks: workerLoop.approvalRejectedTasks,
            pending_approval_tasks: workerLoop.pendingApprovals.length,
            approval_decision_cache_size: workerLoop.approvedDecisionCache.size,
            approval_decision_cache_hits: workerLoop.approvalDecisionCacheHits,
            escalated_approval_tasks: workerLoop.escalatedApprovalTasks,
            retried_attempts: workerLoop.retriedAttempts,
            snapshot_source: snapshotObservabilityMetadata?.snapshot_source ?? null,
            snapshot_version: snapshotObservabilityMetadata?.snapshot_version ?? null,
            snapshot_checksum: snapshotObservabilityMetadata?.snapshot_checksum ?? null,
            snapshot_fallback_reason: snapshotObservabilityMetadata?.fallback_reason ?? null,
        };
    });

    app.get('/runtime/capability-snapshot', async (_request, reply) => {
        if (!capabilitySnapshotCache) {
            return reply.code(404).send({
                error: 'capability_snapshot_not_found',
                message: 'Capability snapshot is not initialized. Start runtime first.',
            });
        }

        return {
            snapshot: capabilitySnapshotCache,
            metadata: snapshotObservabilityMetadata,
            state: runtimeState,
        };
    });

    app.post('/startup', async (_request, reply) => {
        startupAttempts += 1;

        if (startupCompleted && runtimeState === 'active') {
            return {
                status: 'already_started',
                state: runtimeState,
                startup_attempts: startupAttempts,
            };
        }

        let config: RuntimeConfig | null = null;
        try {
            const runtimeConfig = buildConfig(env);
            config = runtimeConfig;
            configCache = runtimeConfig;
            setRuntimeState('starting', runtimeConfig);

            emitRuntimeEvent('runtime.init_started', runtimeConfig);
            emitRuntimeEvent('runtime.config_loaded', runtimeConfig);
            emitRuntimeEvent('runtime.policy_loaded', runtimeConfig, {
                policy_pack_version: runtimeConfig.policyPackVersion,
            });
            let persistedSnapshot: BotCapabilitySnapshotRecord | null = null;
            try {
                persistedSnapshot = await capabilitySnapshotPersistenceClient.loadLatestByBotId({
                    botId: runtimeConfig.botId,
                });
            } catch (err: unknown) {
                emitRuntimeEvent('runtime.capability_snapshot_load_failed', runtimeConfig, {
                    bot_id: runtimeConfig.botId,
                    error_message: err instanceof Error ? err.message : String(err),
                });
                persistedSnapshot = null;
            }

            const useFallbackFreeze = async (reason: string): Promise<void> => {
                const frozenSnapshot = buildCapabilitySnapshot(runtimeConfig, now(), env);
                try {
                    capabilitySnapshotCache = await capabilitySnapshotPersistenceClient.persistSnapshot({
                        config: runtimeConfig,
                        snapshot: frozenSnapshot,
                        source: 'runtime_freeze',
                    });
                } catch {
                    capabilitySnapshotCache = frozenSnapshot;
                }

                snapshotObservabilityMetadata = {
                    snapshot_source: 'runtime_freeze',
                    snapshot_version: capabilitySnapshotCache.snapshotVersion ?? 1,
                    snapshot_checksum: capabilitySnapshotCache.snapshotChecksum,
                    fallback_reason: reason,
                };

                emitRuntimeEvent('runtime.capability_snapshot_frozen', runtimeConfig, {
                    snapshot_id: capabilitySnapshotCache.id,
                    role_key: capabilitySnapshotCache.roleKey,
                    role_version: capabilitySnapshotCache.roleVersion,
                    allowed_connector_tools: capabilitySnapshotCache.allowedConnectorTools,
                    allowed_actions: capabilitySnapshotCache.allowedActions,
                    frozen_at: capabilitySnapshotCache.frozenAt,
                    snapshot_version: capabilitySnapshotCache.snapshotVersion ?? null,
                    source: capabilitySnapshotCache.source ?? 'runtime_freeze',
                    fallback_reason: reason,
                });
            };

            if (persistedSnapshot) {
                const compatibility = validateSnapshotCompatibility({
                    snapshot: persistedSnapshot,
                    config: runtimeConfig,
                });

                if (compatibility.compatible) {
                    capabilitySnapshotCache = persistedSnapshot;
                    snapshotObservabilityMetadata = {
                        snapshot_source: 'persisted_load',
                        snapshot_version: capabilitySnapshotCache.snapshotVersion ?? 1,
                        snapshot_checksum: capabilitySnapshotCache.snapshotChecksum,
                        fallback_reason: null,
                    };

                    emitRuntimeEvent('runtime.capability_snapshot_loaded', runtimeConfig, {
                        snapshot_id: capabilitySnapshotCache.id,
                        role_key: capabilitySnapshotCache.roleKey,
                        role_version: capabilitySnapshotCache.roleVersion,
                        allowed_connector_tools: capabilitySnapshotCache.allowedConnectorTools,
                        allowed_actions: capabilitySnapshotCache.allowedActions,
                        frozen_at: capabilitySnapshotCache.frozenAt,
                        snapshot_version: capabilitySnapshotCache.snapshotVersion ?? null,
                        source: capabilitySnapshotCache.source ?? 'persisted_load',
                    });
                } else {
                    // For checksum mismatch, emit explicit corruption event
                    const isChecksumRejection = persistedSnapshot.snapshotChecksum
                        ? calculateSnapshotChecksum(persistedSnapshot) !== persistedSnapshot.snapshotChecksum
                        : false;

                    if (isChecksumRejection) {
                        emitRuntimeEvent('runtime.corrupted_snapshot_rejected', runtimeConfig, {
                            snapshot_id: persistedSnapshot.id,
                            snapshot_version: persistedSnapshot.snapshotVersion ?? null,
                            expected_checksum: calculateSnapshotChecksum(persistedSnapshot),
                            actual_checksum: persistedSnapshot.snapshotChecksum,
                            rejection_reason: 'checksum_mismatch',
                        });
                    } else {
                        emitRuntimeEvent('runtime.stale_or_incompatible_snapshot', runtimeConfig, {
                            snapshot_id: persistedSnapshot.id,
                            snapshot_role_key: persistedSnapshot.roleKey,
                            snapshot_role_version: persistedSnapshot.roleVersion,
                            snapshot_policy_pack_version: persistedSnapshot.policyPackVersion,
                            fallback_reason: compatibility.reason ?? 'snapshot_incompatible',
                        });
                    }
                    await useFallbackFreeze(compatibility.reason ?? 'snapshot_incompatible');
                }
            } else {
                await useFallbackFreeze('snapshot_not_found');
            }
            emitRuntimeEvent('runtime.connector_bindings_loaded', runtimeConfig);

            startWorkerLoop(runtimeConfig);
            startHeartbeatLoop(runtimeConfig);

            startupCompleted = true;
            setRuntimeState('ready', runtimeConfig);
            emitRuntimeEvent('runtime.ready', runtimeConfig);

            setRuntimeState('active', runtimeConfig);

            if (!capabilitySnapshotCache) {
                throw new Error('Capability snapshot is not initialized after startup flow.');
            }

            return {
                status: 'started',
                state: runtimeState,
                startup_attempts: startupAttempts,
                runtime_contract_version: runtimeConfig.contractVersion,
                worker_loop_running: workerLoop.running,
                role_key: runtimeConfig.roleKey,
                capability_snapshot_id: capabilitySnapshotCache.id,
                capability_snapshot_source: capabilitySnapshotCache.source ?? 'runtime_freeze',
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            stopWorkerLoop();
            setRuntimeState('failed', config, 'config_error');
            emitRuntimeEvent('runtime.init_failed', config, {
                failure_class: 'config_error',
                remediation_hint: 'Verify required AF_* or AGENTFARM_* runtime variables are set.',
                error_message: message,
            });

            return reply.code(500).send({
                error: 'runtime_init_failed',
                failure_class: 'config_error',
                state: runtimeState,
                message,
            });
        }
    });

    app.post<{ Body: { task_id?: string; payload?: Record<string, unknown> } }>('/tasks/intake', async (request, reply) => {
        if (!startupCompleted || (runtimeState !== 'active' && runtimeState !== 'degraded')) {
            return reply.code(409).send({
                error: 'runtime_not_ready',
                state: runtimeState,
            });
        }

        const taskId = request.body?.task_id;
        if (!taskId || !taskId.trim()) {
            return reply.code(400).send({
                error: 'invalid_task',
                message: 'task_id is required',
            });
        }

        workerLoop.queuedTasks.push({
            taskId,
            payload: request.body?.payload ?? {},
            enqueuedAt: now(),
        });

        emitRuntimeEvent('runtime.task_intake_queued', configCache, {
            task_id: taskId,
            queue_depth: workerLoop.queuedTasks.length,
        });

        return reply.code(202).send({
            status: 'queued',
            task_id: taskId,
            queue_depth: workerLoop.queuedTasks.length,
        });
    });

    app.post<{ Body: { task_id?: string; decision?: string; reason?: string; actor?: string } }>('/decision', async (request, reply) => {
        if (!startupCompleted || (runtimeState !== 'active' && runtimeState !== 'degraded')) {
            return reply.code(409).send({
                error: 'runtime_not_ready',
                state: runtimeState,
            });
        }

        if (configCache?.decisionWebhookToken) {
            const provided = readDecisionAuthToken(request.headers as Record<string, unknown>);
            if (!provided || provided !== configCache.decisionWebhookToken) {
                return reply.code(401).send({
                    error: 'unauthorized',
                    message: 'Missing or invalid runtime decision webhook token.',
                });
            }
        }

        const taskId = request.body?.task_id?.trim();
        if (!taskId) {
            return reply.code(400).send({
                error: 'invalid_decision',
                message: 'task_id is required',
            });
        }

        const decision = request.body?.decision as ApprovalDecision | undefined;
        if (decision !== 'approved' && decision !== 'rejected' && decision !== 'timeout_rejected') {
            return reply.code(400).send({
                error: 'invalid_decision',
                message: 'decision must be one of approved, rejected, timeout_rejected',
            });
        }

        const pendingIndex = workerLoop.pendingApprovals.findIndex((pending) => pending.taskId === taskId);
        if (pendingIndex < 0) {
            return reply.code(404).send({
                error: 'approval_not_found',
                message: `No pending approval found for task_id ${taskId}`,
            });
        }

        const [resolved] = workerLoop.pendingApprovals.splice(pendingIndex, 1);
        workerLoop.approvalResolvedTasks += 1;
        if (decision === 'approved') {
            workerLoop.approvalApprovedTasks += 1;
        } else {
            workerLoop.approvalRejectedTasks += 1;
        }

        emitRuntimeEvent('runtime.approval_decision_received', configCache, {
            task_id: taskId,
            decision,
            actor: request.body?.actor ?? 'unknown',
            reason: request.body?.reason ?? null,
            was_escalated: resolved?.escalated ?? false,
            risk_level: resolved?.riskLevel ?? null,
            pending_approval_tasks: workerLoop.pendingApprovals.length,
        });

        if (decision === 'approved') {
            workerLoop.approvedDecisionCache.set(taskId, {
                decision: 'approved',
                decidedAt: now(),
                actor: request.body?.actor?.trim() || null,
                reason: request.body?.reason?.trim() || null,
            });

            const approvedResult = await executeApprovedTask(
                resolved.task,
                configCache as RuntimeConfig,
                'approval_decision_webhook',
            );
            workerLoop.processedTasks += 1;
            workerLoop.retriedAttempts += approvedResult.transientRetries;

            if (approvedResult.status === 'success') {
                workerLoop.succeededTasks += 1;
                emitRuntimeEvent('runtime.task_processed', configCache, {
                    task_id: taskId,
                    queue_depth: workerLoop.queuedTasks.length,
                    processed_tasks: workerLoop.processedTasks,
                    retries: approvedResult.transientRetries,
                    attempts: approvedResult.attempts,
                    source: 'approval_decision_webhook',
                });
            } else {
                workerLoop.failedTasks += 1;
                emitRuntimeEvent('runtime.task_failed', configCache, {
                    task_id: taskId,
                    attempts: approvedResult.attempts,
                    retries: approvedResult.transientRetries,
                    failure_class: approvedResult.failureClass ?? 'runtime_exception',
                    error_message: approvedResult.errorMessage ?? null,
                    source: 'approval_decision_webhook',
                });
            }

            await persistActionResultRecord(resolved.task, configCache as RuntimeConfig, approvedResult);

            emitRuntimeEvent('runtime.bot_notification_sent', configCache, {
                task_id: taskId,
                decision,
                channel: 'decision_webhook',
                actor: request.body?.actor ?? 'unknown',
            });

            return {
                status: 'resolved',
                task_id: taskId,
                decision,
                execution_status: approvedResult.status,
                was_escalated: resolved?.escalated ?? false,
                pending_approval_tasks: workerLoop.pendingApprovals.length,
            };
        }

        await persistCancelledApprovalRecord({
            task: resolved.task,
            actionType: resolved.actionType,
            riskLevel: resolved.riskLevel,
            reason: request.body?.reason?.trim() || null,
        }, configCache as RuntimeConfig);

        emitRuntimeEvent('runtime.task_cancelled', configCache, {
            task_id: taskId,
            action_type: resolved.actionType,
            decision,
            reason: request.body?.reason ?? null,
        });

        emitRuntimeEvent('runtime.bot_notification_sent', configCache, {
            task_id: taskId,
            decision,
            channel: 'decision_webhook',
            actor: request.body?.actor ?? 'unknown',
        });

        return {
            status: 'resolved',
            task_id: taskId,
            decision,
            execution_status: 'cancelled',
            was_escalated: resolved?.escalated ?? false,
            pending_approval_tasks: workerLoop.pendingApprovals.length,
        };
    });

    app.post('/kill', async (_request, reply) => {
        if (killSwitchEngaged) {
            return reply.code(202).send({
                status: 'kill_already_engaged',
                state: runtimeState,
            });
        }

        killSwitchEngaged = true;
        stopWorkerLoop();
        stopHeartbeatLoop();

        setRuntimeState('stopping', configCache, 'killswitch');
        emitRuntimeEvent('runtime.killswitch_engaged', configCache, {
            actor: 'control-plane',
            reason: 'kill endpoint invoked',
        });

        setTimeout(() => {
            setRuntimeState('stopped', configCache, 'graceful_shutdown_complete');
            if (closeOnKill) {
                void app.close().finally(() => {
                    exitProcess(0);
                });
            }
        }, killGraceMs);

        return reply.code(202).send({
            status: 'killswitch_engaged',
            state: runtimeState,
            graceful_shutdown_seconds: Math.max(1, Math.ceil(killGraceMs / 1000)),
        });
    });

    app.addHook('onClose', async () => {
        stopWorkerLoop();
        stopHeartbeatLoop();
    });

    app.get<{ Querystring: { limit?: string } }>('/logs', async (request, reply) => {
        const rawLimit = Number(request.query?.limit ?? '100');
        if (!Number.isFinite(rawLimit) || rawLimit <= 0) {
            return reply.code(400).send({
                error: 'invalid_limit',
                message: 'limit must be a positive integer',
            });
        }

        const limit = Math.min(Math.trunc(rawLimit), maxRuntimeLogs);
        const logs = runtimeLogs.slice(Math.max(0, runtimeLogs.length - limit));
        return {
            count: logs.length,
            total_buffered: runtimeLogs.length,
            logs,
        };
    });

    app.get<{ Querystring: { limit?: string } }>('/state/history', async (request, reply) => {
        const rawLimit = Number(request.query?.limit ?? '100');
        if (!Number.isFinite(rawLimit) || rawLimit <= 0) {
            return reply.code(400).send({
                error: 'invalid_limit',
                message: 'limit must be a positive integer',
            });
        }

        const limit = Math.min(Math.trunc(rawLimit), maxRuntimeLogs);
        const transitions = stateHistory.slice(Math.max(0, stateHistory.length - limit));
        return {
            count: transitions.length,
            total_buffered: stateHistory.length,
            current_state: runtimeState,
            transitions,
        };
    });

    return app;
}

export async function startRuntimeServer(options: RuntimeServerOptions = {}): Promise<FastifyInstance> {
    const env = options.env ?? process.env;
    const app = buildRuntimeServer(options);
    const port = Number(env.AF_HEALTH_PORT ?? env.AGENTFARM_HEALTH_PORT ?? 8080);
    await app.listen({ host: '0.0.0.0', port });
    app.log.info({ port }, 'agent-runtime listening');
    return app;
}
