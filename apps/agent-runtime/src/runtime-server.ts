import Fastify, { type FastifyInstance } from 'fastify';
import { createHash } from 'crypto';
import { readdirSync, statSync } from 'fs';
import { extname, join } from 'path';
import type {
    BotBrainConfig,
    BotCapabilitySnapshotRecord,
    CapabilitySnapshotSource,
    ModelProfileKey,
    QualitySignalRecord,
    QualitySignalType,
    RoleKey,
    TaskLeaseRecord,
} from '@agentfarm/shared-types';
import { CONTRACT_VERSIONS } from '@agentfarm/shared-types';
import {
    buildDecision,
    processDeveloperTask,
    processDeveloperTaskWithMemory,
    processApprovedTask,
    type LlmDecisionResolver,
    type PayloadOverrideSource,
    type ProcessedTaskResult,
    type TaskEnvelope,
} from './execution-engine.js';
import {
    createLlmDecisionResolver,
    createLlmDecisionResolverFromConfig,
    type RuntimeLlmWorkspaceConfig,
} from './llm-decision-adapter.js';
import {
    type ActionResultRecord,
    type ActionResultWriter,
} from './action-result-contract.js';
import { createFileActionResultWriter, resolveActionResultPath } from './action-result-writer.js';
import type { EvidenceRecordWriter, ExecutionLogEntry } from './evidence-record-contract.js';
import { assembleEvidenceRecord } from './evidence-assembler.js';
import {
    createFileEvidenceRecordWriter,
    resolveEvidenceRecordPath,
} from './evidence-record-writer.js';
import {
    executeLocalWorkspaceAction,
    executeLocalWorkspaceActionWithMemoryMirror,
    buildGitPushApprovalSummary,
    getWorkspaceDir,
    LOCAL_WORKSPACE_ACTION_TYPES,
    type LocalWorkspaceActionType,
} from './local-workspace-executor.js';
import { AdvancedRuntimeFeatures } from './advanced-runtime-features.js';
import { recordTaskIntelligence } from './task-intelligence-memory.js';
import {
    TESTER_ROLE_ALLOWED_CONNECTORS,
    TESTER_ROLE_ALLOWED_LOCAL_ACTIONS,
    TESTER_ROLE_BLOCKED_ACTIONS,
    isTesterRoleProfile,
} from './tester-agent-profile.js';
import {
    getProviderQualityPenalty,
    getQualitySignalSummary,
    listQualitySignals,
    type QualitySignalSource,
    recordQualitySignal,
} from './llm-quality-tracker.js';
import {
    fireEvaluatorWebhook,
    resolveEvaluatorWebhookUrl,
} from './evaluator-webhook.js';
import { getAuditLogWriter } from './action-observability.js';
import { estimateTaskEffort, formatEstimateForApproval } from './effort-estimator.js';
import {
    buildRuntimeAuditContext,
    completeAgentSession,
} from './runtime-audit-integration.js';
import { buildErrorQuery, researchForTask, type FetchFn } from './web-research-service.js';
import { analyzeImage, type VisionLLMCallerFn, type VisionProvider } from './vision-service.js';
import { FanOutProgressSink, NoopProgressSink, type ProgressMilestone, type ProgressSink } from './task-progress-reporter.js';

type RuntimeMemoryStore = {
    readMemoryForTask: (workspaceId: string, maxResults?: number) => Promise<{
        recentMemories: unknown[];
        memoryCountThisWeek: number;
        mostCommonConnectors: string[];
        approvalRejectionRate: number;
        codeReviewPatterns?: string[];
    }>;
    writeMemoryAfterTask: (request: {
        workspaceId: string;
        tenantId: string;
        taskId: string;
        actionsTaken: string[];
        approvalOutcomes: Array<{
            action: string;
            decision: 'approved' | 'rejected';
            reason?: string;
        }>;
        connectorsUsed: string[];
        llmProvider?: string;
        executionStatus: 'success' | 'approval_required' | 'failed';
        summary: string;
        correlationId: string;
    }) => Promise<void>;
};

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
    enforceTaskLease: boolean;
    defaultTaskLeaseTtlSeconds: number;
};

const enrichTaskWithRuntimeContext = (task: TaskEnvelope, config: RuntimeConfig): TaskEnvelope => ({
    ...task,
    payload: {
        ...task.payload,
        tenantId: config.tenantId,
        workspaceId: config.workspaceId,
        botId: config.botId,
        roleKey: config.roleKey,
        roleProfile: config.roleProfile,
    },
});

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
    llmProvider?: string;
    llmModel?: string;
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
    actionType:
    | 'read_task'
    | 'create_comment'
    | 'update_status'
    | 'send_message'
    | 'create_pr_comment'
    | 'create_pr'
    | 'merge_pr'
    | 'list_prs'
    | 'send_email';
    payload: Record<string, unknown>;
    correlationId: string;
    claimToken?: string;
    leaseMetadata?: {
        leaseId: string;
        idempotencyKey: string;
        claimedBy: string;
        claimedAt: number;
        expiresAt: number;
        status: 'claimed' | 'released' | 'expired';
        correlationId?: string;
    };
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
        payloadOverrideSource: PayloadOverrideSource;
        payloadOverridesApplied: boolean;
        executedAt: Date;
    }) => Promise<void>;
};

type RuntimeServerOptions = {
    env?: NodeJS.ProcessEnv;
    workerPollMs?: number;
    maxConcurrentTasks?: number;
    killGraceMs?: number;
    approvalEscalationMs?: number;
    heartbeatIntervalMs?: number;
    backgroundWorkerIntervalMs?: number;
    weeklyReportCadenceMs?: number;
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
    evidenceRecordWriter?: EvidenceRecordWriter;
    capabilitySnapshotPersistenceClient?: CapabilitySnapshotPersistenceClient;
    taskExecutionRecordWriter?: TaskExecutionRecordWriter;
    memoryStore?: RuntimeMemoryStore;
    llmDecisionResolver?: LlmDecisionResolver;
    llmConfigFetcher?: (input: {
        config: RuntimeConfig;
        env: NodeJS.ProcessEnv;
    }) => Promise<RuntimeLlmWorkspaceConfig | null>;
    visionCaller?: VisionLLMCallerFn;
    visionProvider?: VisionProvider;
    workspaceSessionFetcher?: (input: {
        config: RuntimeConfig;
        env: NodeJS.ProcessEnv;
    }) => Promise<{
        source: 'default' | 'persisted';
        version: number;
        state: Record<string, unknown>;
    } | null>;
    localWorkspaceActionExecutor?: typeof executeLocalWorkspaceAction;
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

type EscalationWhatIfOption = {
    optionId: string;
    label: string;
    tradeoffSpeed: 'fast' | 'balanced' | 'slow';
    tradeoffRisk: 'high' | 'medium' | 'low';
    confidence: number;
    summary: string;
};

type PendingApprovalTask = {
    taskId: string;
    enqueuedAt: number;
    riskLevel: 'medium' | 'high';
    actionType: string;
    actionSummary: string;
    escalationOptions: EscalationWhatIfOption[];
    task: TaskEnvelope;
    executionPayload: Record<string, unknown>;
    payloadOverrideSource: PayloadOverrideSource;
    escalated: boolean;
    slaRiskPredicted: boolean;
};

type PendingApprovalBatch = {
    batchId: string;
    batchKey: string;
    riskLevel: 'medium' | 'high';
    actionType: string;
    pendingCount: number;
    taskIds: string[];
    escalatedCount: number;
    oldestEnqueuedAt: number;
    newestEnqueuedAt: number;
};

type ResolvePendingApprovalInput = {
    taskId: string;
    decision: ApprovalDecision;
    actor: string;
    reason: string | null;
    selectedOptionId: string | null;
};

type ResolvePendingApprovalResult =
    | {
        ok: false;
        statusCode: 400 | 404;
        error: 'approval_not_found' | 'invalid_selected_option';
        message: string;
    }
    | {
        ok: true;
        taskId: string;
        decision: ApprovalDecision;
        executionStatus: 'success' | 'failed' | 'approval_required' | 'cancelled';
        wasEscalated: boolean;
        selectedOptionId: string | null;
        pendingApprovalTasks: number;
    };

type WeeklyQualityRoiReport = {
    reportId: string;
    generatedAt: string;
    periodStartedAt: string;
    periodEndedAt: string;
    trigger: 'manual' | 'scheduled';
    completion_quality_pct: number;
    rework_rate_pct: number;
    approval_latency_ms: number;
    audit_completeness_pct: number;
    time_saved_by_task_category: Array<{
        category: string;
        estimated_minutes_saved: number;
    }>;
};

type WeeklyRoiAccumulator = {
    periodStartedAtMs: number;
    lastGeneratedAtMs: number | null;
    reportCount: number;
    totalProcessed: number;
    totalSucceeded: number;
    totalFailed: number;
    totalApprovalQueued: number;
    reworkEvents: number;
    approvalLatencyTotalMs: number;
    approvalLatencySamples: number;
    actionResultsPersisted: number;
    evidenceRecordsPersisted: number;
    timeSavedByCategoryMinutes: Map<string, number>;
    lastReport: WeeklyQualityRoiReport | null;
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
    activeTaskIds: Set<string>;
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

type RuntimeTaskLease = Omit<TaskLeaseRecord, 'claimedAt' | 'expiresAt' | 'releasedAt' | 'lastRenewedAt'> & {
    claimedAt: number;
    expiresAt: number;
    releasedAt?: number;
    lastRenewedAt?: number;
};

type TaskLeaseStore = {
    byTaskId: Map<string, RuntimeTaskLease>;
    byIdempotencyKey: Map<string, RuntimeTaskLease>;
};

type HeartbeatLoop = {
    running: boolean;
    handle: NodeJS.Timeout | null;
    sent: number;
    failed: number;
    lastHeartbeatAt: string | null;
};

type BackgroundLoop = {
    running: boolean;
    handle: NodeJS.Timeout | null;
    ticks: number;
    failures: number;
    lastRunAt: string | null;
};

type SnapshotObservabilityMetadata = {
    snapshot_source: CapabilitySnapshotSource;
    snapshot_version: number;
    snapshot_checksum?: string;
    fallback_reason?: string | null;
};

type TaskTranscript = {
    taskId: string;
    startedAt: string;
    completedAt: string;
    actionType: string;
    riskLevel: 'low' | 'medium' | 'high';
    route: 'execute' | 'approval';
    status: 'success' | 'approval_required' | 'failed';
    durationMs: number;
    errorMessage: string | null;
    approvalRequired: boolean;
    approvalSummary: string | null;
    payloadOverrideSource: PayloadOverrideSource;
    payloadOverridesApplied: boolean;
};

type RuntimeInterviewEvent = {
    taskId: string;
    actionType: string;
    sessionId: string | null;
    roleTrack: string | null;
    turnIndex: number | null;
    interruptedSpeaking: boolean;
    followUpQuestion: string | null;
    finalRecommendation: string | null;
    sequence: number;
    event: 'partial' | 'final';
    text: string;
    startedAt: string;
    endedAt: string;
    source: 'payload' | 'payload_chunks' | 'live_capture';
    recordedAt: string;
};

const DEFAULT_WORKER_POLL_MS = 250;
const DEFAULT_MAX_CONCURRENT_TASKS = 1;
const DEFAULT_KILL_GRACE_MS = 5_000;
const DEFAULT_APPROVAL_ESCALATION_MS = 60 * 60 * 1000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_BACKGROUND_WORKER_INTERVAL_MS = 60_000;
const DEFAULT_WEEKLY_REPORT_CADENCE_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_APPROVAL_SLA_PREDICTION_MS = 300_000;
const DEFAULT_MAX_RUNTIME_LOGS = 200;
const DEFAULT_APPROVAL_INTAKE_MAX_ATTEMPTS = 3;
const DEFAULT_APPROVAL_INTAKE_BACKOFF_MS = 200;
const DEFAULT_TASK_LEASE_TTL_SECONDS = 60;
const MIN_TASK_LEASE_TTL_SECONDS = 5;
const MAX_TASK_LEASE_TTL_SECONDS = 3600;
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
    'create_pr',
    'merge_pr',
    'list_prs',
    'send_email',
] as const);

const collectConnectorsUsed = (task: TaskEnvelope, actionType: string): string[] => {
    const connectors = new Set<string>();
    const connectorType = normalizeConnectorType(task.payload['connector_type']);
    if (connectorType) {
        connectors.add(connectorType);
    }

    if (LOCAL_WORKSPACE_ACTION_TYPES.has(actionType as LocalWorkspaceActionType)) {
        connectors.add('local_workspace');
    }

    return Array.from(connectors.values());
};

const collectApprovalOutcomes = (
    result: ProcessedTaskResult,
): Array<{ action: string; decision: 'approved' | 'rejected' }> => {
    if (result.decision.route !== 'approval' || result.status === 'approval_required') {
        return [];
    }

    return [{
        action: result.decision.actionType,
        decision: result.status === 'success' ? 'approved' : 'rejected',
    }];
};

const summarizeTaskForMemory = (task: TaskEnvelope, result: ProcessedTaskResult): string => {
    const summaryCandidateKeys = ['summary', 'objective', 'prompt', 'title'];
    for (const key of summaryCandidateKeys) {
        const value = task.payload[key];
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim().slice(0, 300);
        }
    }
    return `${result.decision.actionType}: ${result.decision.reason}`.slice(0, 300);
};

const estimateLlmQualityScore = (result: ProcessedTaskResult): number => {
    if (result.status === 'success') {
        return 0.9;
    }
    if (result.status === 'approval_required') {
        return 0.6;
    }
    return result.failureClass === 'transient_error' ? 0.45 : 0.3;
};

const parseQualitySignalSource = (value: unknown): QualitySignalSource | null => {
    if (value === 'runtime_outcome' || value === 'user_feedback' || value === 'evaluator' || value === 'manual') {
        return value;
    }
    return null;
};

const POST_CHANGE_QUALITY_GATE_ACTIONS = new Set<LocalWorkspaceActionType>([
    'code_edit',
    'code_edit_patch',
    'code_search_replace',
    'apply_patch',
    'file_move',
    'file_delete',
    'workspace_fix_test_failures',
    'workspace_autonomous_plan_execute',
    'workspace_bulk_refactor',
    'workspace_atomic_edit_set',
    'workspace_migration_helper',
    'workspace_generate_test',
    'workspace_format_code',
    'workspace_add_docstring',
]);

const clampConfidence = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
};

const categorizeActionForRoi = (actionType: string): string => {
    if (actionType.startsWith('workspace_') || actionType.startsWith('code_') || actionType.startsWith('file_')) {
        return 'engineering_changes';
    }
    if (actionType.includes('test') || actionType.includes('lint') || actionType.includes('quality')) {
        return 'quality_validation';
    }
    if (actionType.includes('deploy') || actionType.includes('release')) {
        return 'release_operations';
    }
    if (actionType.includes('approval') || actionType.includes('policy')) {
        return 'governance';
    }
    return 'coordination';
};

const estimateMinutesSavedForAction = (actionType: string): number => {
    const category = categorizeActionForRoi(actionType);
    if (category === 'engineering_changes') {
        return 35;
    }
    if (category === 'quality_validation') {
        return 20;
    }
    if (category === 'release_operations') {
        return 45;
    }
    if (category === 'governance') {
        return 15;
    }
    return 10;
};

const buildEscalationWhatIfOptions = (input: {
    actionType: string;
    riskLevel: 'medium' | 'high';
    confidence: number;
}): EscalationWhatIfOption[] => {
    const baseConfidence = clampConfidence(input.confidence);
    const fastConfidence = clampConfidence(baseConfidence - 0.05);
    const saferConfidence = clampConfidence(baseConfidence + 0.04);
    const conservativeConfidence = clampConfidence(baseConfidence + 0.07);

    const options: EscalationWhatIfOption[] = [
        {
            optionId: 'fast_track_execution',
            label: 'Fast-track execution',
            tradeoffSpeed: 'fast',
            tradeoffRisk: input.riskLevel === 'high' ? 'high' : 'medium',
            confidence: fastConfidence,
            summary: `Proceed immediately with ${input.actionType} after single approver review.`,
        },
        {
            optionId: 'staged_safe_rollout',
            label: 'Staged safe rollout',
            tradeoffSpeed: 'balanced',
            tradeoffRisk: 'medium',
            confidence: saferConfidence,
            summary: `Run a staged rollout with checkpoint validation before full apply for ${input.actionType}.`,
        },
    ];

    if (input.riskLevel === 'high') {
        options.push({
            optionId: 'manual_guarded_execution',
            label: 'Manual guarded execution',
            tradeoffSpeed: 'slow',
            tradeoffRisk: 'low',
            confidence: conservativeConfidence,
            summary: `Require paired review and live checklist execution for ${input.actionType}.`,
        });
    }

    return options;
};

type RuntimeConnectorType = 'jira' | 'teams' | 'github' | 'email';
type RuntimeConnectorActionType =
    | 'read_task'
    | 'create_comment'
    | 'update_status'
    | 'send_message'
    | 'create_pr_comment'
    | 'create_pr'
    | 'merge_pr'
    | 'list_prs'
    | 'send_email';

type RuntimeLocalWorkspaceActionType = LocalWorkspaceActionType;

const ROLE_CONNECTOR_POLICY: Record<RoleKey, RuntimeConnectorType[]> = {
    recruiter: ['teams', 'email'],
    developer: ['jira', 'teams', 'github', 'email'],
    fullstack_developer: ['jira', 'teams', 'github', 'email'],
    tester: [...TESTER_ROLE_ALLOWED_CONNECTORS],
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
    github: ['create_pr_comment', 'create_pr', 'merge_pr', 'list_prs'],
    email: ['send_email'],
};

const ROLE_CONNECTOR_ACTION_OVERRIDES: Partial<
    Record<RoleKey, Partial<Record<RuntimeConnectorType, RuntimeConnectorActionType[]>>>
> = {
    tester: {
        github: ['create_pr_comment', 'create_pr', 'list_prs'],
    },
};

const LOCAL_WORKSPACE_ACTION_POLICY: Record<RoleKey, RuntimeLocalWorkspaceActionType[]> = {
    recruiter: [],
    developer: [
        // Tier 0-1
        'git_clone',
        'git_branch',
        'git_commit',
        'git_push',
        'git_stash',
        'git_log',
        'code_read',
        'code_edit',
        'code_edit_patch',
        'code_search_replace',
        'apply_patch',
        'file_move',
        'file_delete',
        'run_build',
        'run_tests',
        'run_linter',
        'workspace_install_deps',
        'workspace_list_files',
        'workspace_grep',
        'workspace_scout',
        'workspace_checkpoint',
        'autonomous_loop',
        'workspace_cleanup',
        'workspace_diff',
        'workspace_memory_write',
        'workspace_memory_read',
        'run_shell_command',
        'create_pr_from_workspace',
        // Tier 3: IDE-level capabilities
        'workspace_find_references',
        'workspace_rename_symbol',
        'workspace_extract_function',
        'workspace_go_to_definition',
        'workspace_hover_type',
        'workspace_analyze_imports',
        'workspace_code_coverage',
        'workspace_complexity_metrics',
        'workspace_security_scan',
        // Tier 4: Multi-file coordination
        'workspace_bulk_refactor',
        'workspace_atomic_edit_set',
        'workspace_generate_from_template',
        'workspace_migration_helper',
        'workspace_summarize_folder',
        'workspace_dependency_tree',
        'workspace_test_impact_analysis',
        // Tier 5: External knowledge & experimentation
        'workspace_search_docs',
        'workspace_package_lookup',
        'workspace_ai_code_review',
        'workspace_repl_start',
        'workspace_repl_execute',
        'workspace_repl_stop',
        'workspace_debug_breakpoint',
        'workspace_profiler_run',
        // Tier 6: Language adapters
        'workspace_language_adapter_python',
        'workspace_language_adapter_java',
        'workspace_language_adapter_go',
        'workspace_language_adapter_csharp',
        // Tier 7: Governance & safety
        'workspace_dry_run_with_approval_chain',
        'workspace_change_impact_report',
        'workspace_rollback_to_checkpoint',
        // Tier 8: Release & collaboration intelligence
        'workspace_generate_test',
        'workspace_format_code',
        'workspace_version_bump',
        'workspace_changelog_generate',
        'workspace_git_blame',
        'workspace_outline_symbols',
        // Tier 9: Pilot roadmap productivity actions
        'workspace_create_pr',
        'workspace_run_ci_checks',
        'workspace_fix_test_failures',
        'workspace_security_fix_suggest',
        'workspace_pr_review_prepare',
        'workspace_dependency_upgrade_plan',
        'workspace_release_notes_generate',
        'workspace_incident_patch_pack',
        'workspace_memory_profile',
        'workspace_autonomous_plan_execute',
        'workspace_policy_preflight',
        // Tier 10: Connector hardening, code intelligence, observability
        'workspace_connector_test',
        'workspace_pr_auto_assign',
        'workspace_ci_watch',
        'workspace_explain_code',
        'workspace_add_docstring',
        'workspace_refactor_plan',
        'workspace_semantic_search',
        'workspace_diff_preview',
        'workspace_approval_status',
        'workspace_audit_export',
        // Tier 11: Local desktop and browser control
        'workspace_browser_open',
        'workspace_app_launch',
        'workspace_meeting_join',
        'workspace_meeting_speak',
        'workspace_meeting_interview_live',
        // Tier 12: Sub-agent delegation, GitHub intelligence, Slack notifications
        'workspace_subagent_spawn',
        'workspace_github_pr_status',
        'workspace_github_issue_triage',
        'workspace_github_issue_fix',
        'workspace_azure_deploy_plan',
        'workspace_slack_notify',
    ],
    fullstack_developer: [
        // Tier 0-1
        'git_clone',
        'git_branch',
        'git_commit',
        'git_push',
        'git_stash',
        'git_log',
        'code_read',
        'code_edit',
        'code_edit_patch',
        'code_search_replace',
        'apply_patch',
        'file_move',
        'file_delete',
        'run_build',
        'run_tests',
        'run_linter',
        'workspace_install_deps',
        'workspace_list_files',
        'workspace_grep',
        'workspace_scout',
        'workspace_checkpoint',
        'autonomous_loop',
        'workspace_cleanup',
        'workspace_diff',
        'workspace_memory_write',
        'workspace_memory_read',
        'run_shell_command',
        'create_pr_from_workspace',
        // Tier 3: IDE-level capabilities
        'workspace_find_references',
        'workspace_rename_symbol',
        'workspace_extract_function',
        'workspace_go_to_definition',
        'workspace_hover_type',
        'workspace_analyze_imports',
        'workspace_code_coverage',
        'workspace_complexity_metrics',
        'workspace_security_scan',
        // Tier 4: Multi-file coordination
        'workspace_bulk_refactor',
        'workspace_atomic_edit_set',
        'workspace_generate_from_template',
        'workspace_migration_helper',
        'workspace_summarize_folder',
        'workspace_dependency_tree',
        'workspace_test_impact_analysis',
        // Tier 5: External knowledge & experimentation
        'workspace_search_docs',
        'workspace_package_lookup',
        'workspace_ai_code_review',
        'workspace_repl_start',
        'workspace_repl_execute',
        'workspace_repl_stop',
        'workspace_debug_breakpoint',
        'workspace_profiler_run',
        // Tier 6: Language adapters
        'workspace_language_adapter_python',
        'workspace_language_adapter_java',
        'workspace_language_adapter_go',
        'workspace_language_adapter_csharp',
        // Tier 7: Governance & safety
        'workspace_dry_run_with_approval_chain',
        'workspace_change_impact_report',
        'workspace_rollback_to_checkpoint',
        // Tier 8: Release & collaboration intelligence
        'workspace_generate_test',
        'workspace_format_code',
        'workspace_version_bump',
        'workspace_changelog_generate',
        'workspace_git_blame',
        'workspace_outline_symbols',
        // Tier 9: Pilot roadmap productivity actions
        'workspace_create_pr',
        'workspace_run_ci_checks',
        'workspace_fix_test_failures',
        'workspace_security_fix_suggest',
        'workspace_pr_review_prepare',
        'workspace_dependency_upgrade_plan',
        'workspace_release_notes_generate',
        'workspace_incident_patch_pack',
        'workspace_memory_profile',
        'workspace_autonomous_plan_execute',
        'workspace_policy_preflight',
        // Tier 10: Connector hardening, code intelligence, observability
        'workspace_connector_test',
        'workspace_pr_auto_assign',
        'workspace_ci_watch',
        'workspace_explain_code',
        'workspace_add_docstring',
        'workspace_refactor_plan',
        'workspace_semantic_search',
        'workspace_diff_preview',
        'workspace_approval_status',
        'workspace_audit_export',
        // Tier 11: Local desktop and browser control
        'workspace_browser_open',
        'workspace_app_launch',
        'workspace_meeting_join',
        'workspace_meeting_speak',
        'workspace_meeting_interview_live',
        // Tier 12: Sub-agent delegation, GitHub intelligence, Slack notifications
        'workspace_subagent_spawn',
        'workspace_github_pr_status',
        'workspace_github_issue_triage',
        'workspace_github_issue_fix',
        'workspace_azure_deploy_plan',
        'workspace_slack_notify',
    ],
    tester: [...TESTER_ROLE_ALLOWED_LOCAL_ACTIONS],
    business_analyst: [],
    technical_writer: [],
    content_writer: [],
    sales_rep: [],
    marketing_specialist: [],
    corporate_assistant: [],
    customer_support_executive: [],
    project_manager_product_owner_scrum_master: ['code_read'],
};

const getAllowedActionsForRole = (roleKey: RoleKey): string[] => {
    const connectorActions = ROLE_CONNECTOR_POLICY[roleKey].flatMap((tool) => {
        const roleToolOverrides = ROLE_CONNECTOR_ACTION_OVERRIDES[roleKey]?.[tool];
        return roleToolOverrides ?? CONNECTOR_ACTION_POLICY[tool];
    });
    const localActions = LOCAL_WORKSPACE_ACTION_POLICY[roleKey] ?? [];
    return Array.from(new Set([...connectorActions, ...localActions]));
};

const isTesterBlockedAction = (roleKey: RoleKey, actionType: string): boolean => {
    if (roleKey !== 'tester') {
        return false;
    }
    return TESTER_ROLE_BLOCKED_ACTIONS.includes(actionType as (typeof TESTER_ROLE_BLOCKED_ACTIONS)[number]);
};

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const toStableJsonValue = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map((entry) => toStableJsonValue(entry));
    }

    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const sortedEntries = Object.entries(record)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, entry]) => [key, toStableJsonValue(entry)] as const);
        return Object.fromEntries(sortedEntries);
    }

    return value;
};

const calculateSnapshotChecksum = (snapshot: BotCapabilitySnapshotRecord): string => {
    const payload = JSON.stringify({
        roleKey: snapshot.roleKey,
        roleVersion: snapshot.roleVersion,
        policyPackVersion: snapshot.policyPackVersion,
        allowedConnectorTools: [...snapshot.allowedConnectorTools].sort(),
        allowedActions: [...snapshot.allowedActions].sort(),
        brainConfig: toStableJsonValue(snapshot.brainConfig),
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
    if (isTesterRoleProfile(normalized)) {
        return 'tester';
    }
    const aliases: Record<string, RoleKey> = {
        recruiter: 'recruiter',
        developer: 'developer',
        developer_agent: 'developer',
        fullstack_developer: 'fullstack_developer',
        full_stack_developer: 'fullstack_developer',
        tester: 'tester',
        qa: 'tester',
        tester_agent: 'tester',
        qa_engineer: 'tester',
        quality_assurance_engineer: 'tester',
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

const resolveDefaultModelProfile = (snapshot: BotCapabilitySnapshotRecord | null): ModelProfileKey => {
    const candidate = snapshot?.brainConfig?.defaultModelProfile;
    return selectModelProfile(typeof candidate === 'string' ? candidate : undefined);
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
    const allowedActions = getAllowedActionsForRole(config.roleKey);

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
    const expectedActions = getAllowedActionsForRole(config.roleKey);

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

    const isConnectorAction = CONNECTOR_ACTION_TYPES.has(input.actionType as RuntimeConnectorActionType);
    const isLocalWorkspaceAction = LOCAL_WORKSPACE_ACTION_TYPES.has(input.actionType as LocalWorkspaceActionType);

    if (!input.snapshot.allowedActions.includes(input.actionType)) {
        if (!isConnectorAction && !isLocalWorkspaceAction) {
            return { allowed: true };
        }

        return {
            allowed: false,
            reason: `Action ${input.actionType} is not in frozen capability snapshot policy.`,
        };
    }

    if (!isConnectorAction) {
        return { allowed: true };
    }

    if (!input.connectorType) {
        return { allowed: true };
    }

    if (!input.snapshot.allowedConnectorTools.includes(input.connectorType)) {
        return {
            allowed: false,
            reason: `Connector ${input.connectorType} is not allowed for role ${input.snapshot.roleKey}.`,
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

const parseBooleanFlag = (value: string | undefined): boolean => {
    if (!value) {
        return false;
    }
    return value.trim().toLowerCase() === 'true';
};

const parseLeaseTtlSeconds = (value: string | undefined): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_TASK_LEASE_TTL_SECONDS;
    }
    return Math.min(MAX_TASK_LEASE_TTL_SECONDS, Math.max(MIN_TASK_LEASE_TTL_SECONDS, Math.floor(parsed)));
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
    const enforceTaskLease = parseBooleanFlag(
        readEnv(env, 'AF_ENFORCE_TASK_LEASE', 'AGENTFARM_ENFORCE_TASK_LEASE'),
    );
    const defaultTaskLeaseTtlSeconds = parseLeaseTtlSeconds(
        readEnv(env, 'AF_TASK_LEASE_TTL_SECONDS', 'AGENTFARM_TASK_LEASE_TTL_SECONDS'),
    );
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
        enforceTaskLease,
        defaultTaskLeaseTtlSeconds,
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
                llm_provider: input.llmProvider,
                llm_model: input.llmModel,
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
                claim_token: input.claimToken,
                lease_metadata: input.leaseMetadata,
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

const defaultLlmConfigFetcher = async (input: {
    config: RuntimeConfig;
    env: NodeJS.ProcessEnv;
}): Promise<RuntimeLlmWorkspaceConfig | null> => {
    const token =
        input.config.approvalIntakeToken
        ?? input.env.RUNTIME_CONFIG_SHARED_TOKEN
        ?? input.env.AF_APPROVAL_INTAKE_SHARED_TOKEN
        ?? input.env.AGENTFARM_APPROVAL_INTAKE_SHARED_TOKEN
        ?? null;

    if (!token) {
        return null;
    }

    try {
        const url = new URL(
            `/v1/workspaces/${encodeURIComponent(input.config.workspaceId)}/runtime/llm-config`,
            input.config.approvalApiUrl,
        );
        url.searchParams.set('tenant_id', input.config.tenantId);

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'x-runtime-config-token': token,
            },
            signal: AbortSignal.timeout(4_000),
            cache: 'no-store',
        });

        if (!response.ok) {
            return null;
        }

        const body = await response.json() as { config?: RuntimeLlmWorkspaceConfig };
        if (!body.config || !body.config.provider) {
            return null;
        }

        return body.config;
    } catch {
        return null;
    }
};

const defaultWorkspaceSessionFetcher = async (input: {
    config: RuntimeConfig;
    env: NodeJS.ProcessEnv;
}): Promise<{
    source: 'default' | 'persisted';
    version: number;
    state: Record<string, unknown>;
} | null> => {
    const token =
        input.env.RUNTIME_SESSION_SHARED_TOKEN
        ?? input.env.AF_RUNTIME_SESSION_SHARED_TOKEN
        ?? input.env.AGENTFARM_RUNTIME_SESSION_SHARED_TOKEN
        ?? input.env.RUNTIME_CONFIG_SHARED_TOKEN
        ?? input.env.AF_APPROVAL_INTAKE_SHARED_TOKEN
        ?? input.env.AGENTFARM_APPROVAL_INTAKE_SHARED_TOKEN
        ?? input.config.approvalIntakeToken
        ?? null;

    if (!token) {
        return null;
    }

    try {
        const url = new URL(
            `/v1/workspaces/${encodeURIComponent(input.config.workspaceId)}/session-state`,
            input.config.approvalApiUrl,
        );
        url.searchParams.set('tenant_id', input.config.tenantId);
        url.searchParams.set('mode', 'restore');

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'x-runtime-session-token': token,
            },
            signal: AbortSignal.timeout(4_000),
            cache: 'no-store',
        });

        if (!response.ok) {
            return null;
        }

        const body = await response.json() as {
            source?: 'default' | 'persisted';
            version?: number;
            state?: Record<string, unknown>;
        };

        return {
            source: body.source === 'persisted' ? 'persisted' : 'default',
            version: typeof body.version === 'number' ? body.version : 0,
            state: typeof body.state === 'object' && body.state !== null ? body.state : {},
        };
    } catch {
        return null;
    }
};

export function buildRuntimeServer(options: RuntimeServerOptions = {}): FastifyInstance {
    const env = options.env ?? process.env;
    const workerPollMs = options.workerPollMs ?? DEFAULT_WORKER_POLL_MS;
    const maxConcurrentTasks = Math.max(
        1,
        options.maxConcurrentTasks
        ?? Number(env.AF_MAX_CONCURRENT_TASKS ?? DEFAULT_MAX_CONCURRENT_TASKS),
    );
    const killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
    const closeOnKill = options.closeOnKill ?? true;
    const now = options.now ?? (() => Date.now());
    const approvalEscalationMs = options.approvalEscalationMs ?? DEFAULT_APPROVAL_ESCALATION_MS;
    const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    const backgroundWorkerIntervalMs =
        options.backgroundWorkerIntervalMs ?? DEFAULT_BACKGROUND_WORKER_INTERVAL_MS;
    const weeklyReportCadenceMs = options.weeklyReportCadenceMs ?? DEFAULT_WEEKLY_REPORT_CADENCE_MS;
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
    const llmConfigFetcher = options.llmConfigFetcher ?? defaultLlmConfigFetcher;
    const workspaceSessionFetcher = options.workspaceSessionFetcher ?? defaultWorkspaceSessionFetcher;
    let llmDecisionResolver = options.llmDecisionResolver ?? createLlmDecisionResolver(env);
    let activeModelProvider = env.AF_MODEL_PROVIDER ?? env.AGENTFARM_MODEL_PROVIDER ?? 'agentfarm';
    const sleep = options.sleep ?? defaultSleep;
    const exitProcess = options.exitProcess ?? ((code: number) => process.exit(code));
    const actionResultLogPath = resolveActionResultPath(env);
    const actionResultWriter = options.actionResultWriter ?? createFileActionResultWriter(actionResultLogPath);
    const evidenceRecordPath = resolveEvidenceRecordPath(env);
    const evidenceRecordWriter =
        options.evidenceRecordWriter ?? createFileEvidenceRecordWriter(evidenceRecordPath);
    const localWorkspaceActionExecutor = options.localWorkspaceActionExecutor ?? executeLocalWorkspaceAction;
    const memoryStore = options.memoryStore;
    const visionCaller = options.visionCaller;
    const visionProvider = options.visionProvider ?? 'anthropic';

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
    let restoredWorkspaceSessionState: {
        source: 'default' | 'persisted';
        version: number;
        state: Record<string, unknown>;
    } | null = null;
    const runtimeLogs: RuntimeLogEntry[] = [];
    const stateHistory: RuntimeStateTransition[] = [{
        at: new Date(now()).toISOString(),
        from: 'created',
        to: 'created',
        reason: 'initialized',
    },
    ];

    // Compact per-task execution transcripts — bounded ring buffer (100 entries)
    const MAX_TRANSCRIPTS = 100;
    const recentTranscripts: TaskTranscript[] = [];
    const MAX_INTERVIEW_EVENTS = 500;
    const recentInterviewEvents: RuntimeInterviewEvent[] = [];
    const taskStartTimes = new Map<string, number>();
    const taskApprovalSummaries = new Map<string, string>();

    const pushTranscript = (entry: TaskTranscript): void => {
        recentTranscripts.push(entry);
        if (recentTranscripts.length > MAX_TRANSCRIPTS) {
            recentTranscripts.shift();
        }
    };

    const pushInterviewEvent = (entry: RuntimeInterviewEvent): void => {
        recentInterviewEvents.push(entry);
        if (recentInterviewEvents.length > MAX_INTERVIEW_EVENTS) {
            recentInterviewEvents.shift();
        }
    };

    const captureInterviewEventsFromLocalOutput = (input: {
        taskId: string;
        actionType: string;
        output: string;
    }): void => {
        if (input.actionType !== 'workspace_meeting_interview_live' || !input.output.trim()) {
            return;
        }

        try {
            const parsed = JSON.parse(input.output) as {
                session_id?: unknown;
                role_track?: unknown;
                turn_index?: unknown;
                interrupted_speaking?: unknown;
                follow_up_question?: unknown;
                final_recommendation?: unknown;
                transcript_events?: unknown;
            };

            const eventsRaw = Array.isArray(parsed.transcript_events) ? parsed.transcript_events : [];
            const sessionId = typeof parsed.session_id === 'string' ? parsed.session_id : null;
            const roleTrack = typeof parsed.role_track === 'string' ? parsed.role_track : null;
            const turnIndex = typeof parsed.turn_index === 'number' ? parsed.turn_index : null;
            const interruptedSpeaking = parsed.interrupted_speaking === true;
            const followUpQuestion = typeof parsed.follow_up_question === 'string' ? parsed.follow_up_question : null;
            const recommendationObj = parsed.final_recommendation;
            const finalRecommendation = recommendationObj
                && typeof recommendationObj === 'object'
                && typeof (recommendationObj as Record<string, unknown>)['final_recommendation'] === 'string'
                ? (recommendationObj as Record<string, unknown>)['final_recommendation'] as string
                : null;

            for (const eventEntry of eventsRaw) {
                if (!eventEntry || typeof eventEntry !== 'object') continue;
                const eventRecord = eventEntry as Record<string, unknown>;
                const text = typeof eventRecord.text === 'string' ? eventRecord.text.trim() : '';
                if (!text) continue;

                const rawEventType = typeof eventRecord.event === 'string' ? eventRecord.event : 'partial';
                const eventType: 'partial' | 'final' = rawEventType === 'final' ? 'final' : 'partial';
                const sourceRaw = typeof eventRecord.source === 'string' ? eventRecord.source : 'payload';
                const source: 'payload' | 'payload_chunks' | 'live_capture' =
                    sourceRaw === 'live_capture' || sourceRaw === 'payload_chunks' ? sourceRaw : 'payload';

                pushInterviewEvent({
                    taskId: input.taskId,
                    actionType: input.actionType,
                    sessionId,
                    roleTrack,
                    turnIndex,
                    interruptedSpeaking,
                    followUpQuestion,
                    finalRecommendation,
                    sequence: typeof eventRecord.sequence === 'number' ? eventRecord.sequence : 0,
                    event: eventType,
                    text,
                    startedAt: typeof eventRecord.started_at === 'string' ? eventRecord.started_at : new Date(now()).toISOString(),
                    endedAt: typeof eventRecord.ended_at === 'string' ? eventRecord.ended_at : new Date(now()).toISOString(),
                    source,
                    recordedAt: new Date(now()).toISOString(),
                });
            }
        } catch {
            // Ignore malformed action output payloads for interview stream extraction.
        }
    };

    const toEvidenceLogLevel = (entry: RuntimeLogEntry): ExecutionLogEntry['level'] => {
        if (entry.eventType.includes('failed') || entry.eventType.includes('error')) {
            return 'error';
        }
        if (entry.eventType.includes('degraded') || entry.eventType.includes('blocked') || entry.eventType.includes('warn')) {
            return 'warn';
        }
        return 'info';
    };

    const collectExecutionLogsForTask = (taskId: string): ExecutionLogEntry[] => {
        return runtimeLogs
            .filter((entry) => {
                const detailTaskId =
                    typeof entry.details?.['task_id'] === 'string'
                        ? entry.details['task_id']
                        : undefined;
                return detailTaskId === taskId;
            })
            .map((entry) => ({
                timestamp: entry.at,
                level: toEvidenceLogLevel(entry),
                message: entry.eventType,
                context: entry.details,
            }));
    };

    const workerLoop: WorkerLoop = {
        running: false,
        handle: null,
        tickBusy: false,
        activeTaskIds: new Set<string>(),
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

    const taskLeaseStore: TaskLeaseStore = {
        byTaskId: new Map<string, RuntimeTaskLease>(),
        byIdempotencyKey: new Map<string, RuntimeTaskLease>(),
    };

    const heartbeatLoop: HeartbeatLoop = {
        running: false,
        handle: null,
        sent: 0,
        failed: 0,
        lastHeartbeatAt: null,
    };

    const backgroundLoop: BackgroundLoop = {
        running: false,
        handle: null,
        ticks: 0,
        failures: 0,
        lastRunAt: null,
    };
    const weeklyRoiAccumulator: WeeklyRoiAccumulator = {
        periodStartedAtMs: now(),
        lastGeneratedAtMs: null,
        reportCount: 0,
        totalProcessed: 0,
        totalSucceeded: 0,
        totalFailed: 0,
        totalApprovalQueued: 0,
        reworkEvents: 0,
        approvalLatencyTotalMs: 0,
        approvalLatencySamples: 0,
        actionResultsPersisted: 0,
        evidenceRecordsPersisted: 0,
        timeSavedByCategoryMinutes: new Map<string, number>(),
        lastReport: null,
    };
    const advancedFeatures = new AdvancedRuntimeFeatures(now);

    const generateWeeklyQualityRoiReport = (
        config: RuntimeConfig | null,
        trigger: 'manual' | 'scheduled',
    ): WeeklyQualityRoiReport => {
        const generatedAtMs = now();
        const generatedAtIso = new Date(generatedAtMs).toISOString();
        const periodStartedAtIso = new Date(weeklyRoiAccumulator.periodStartedAtMs).toISOString();

        const completionQuality = weeklyRoiAccumulator.totalProcessed > 0
            ? (weeklyRoiAccumulator.totalSucceeded / weeklyRoiAccumulator.totalProcessed) * 100
            : 100;
        const reworkRate = weeklyRoiAccumulator.totalProcessed > 0
            ? (weeklyRoiAccumulator.reworkEvents / weeklyRoiAccumulator.totalProcessed) * 100
            : 0;
        const approvalLatencyMs = weeklyRoiAccumulator.approvalLatencySamples > 0
            ? weeklyRoiAccumulator.approvalLatencyTotalMs / weeklyRoiAccumulator.approvalLatencySamples
            : 0;
        const auditCompleteness = weeklyRoiAccumulator.actionResultsPersisted > 0
            ? (weeklyRoiAccumulator.evidenceRecordsPersisted / weeklyRoiAccumulator.actionResultsPersisted) * 100
            : 100;

        const timeSavedByTaskCategory = Array.from(weeklyRoiAccumulator.timeSavedByCategoryMinutes.entries())
            .map(([category, estimatedMinutesSaved]) => ({
                category,
                estimated_minutes_saved: Math.round(estimatedMinutesSaved),
            }))
            .sort((a, b) => b.estimated_minutes_saved - a.estimated_minutes_saved);

        const report: WeeklyQualityRoiReport = {
            reportId: `${config?.workspaceId ?? 'workspace'}:${generatedAtMs}`,
            generatedAt: generatedAtIso,
            periodStartedAt: periodStartedAtIso,
            periodEndedAt: generatedAtIso,
            trigger,
            completion_quality_pct: Math.round(completionQuality * 100) / 100,
            rework_rate_pct: Math.round(reworkRate * 100) / 100,
            approval_latency_ms: Math.round(approvalLatencyMs),
            audit_completeness_pct: Math.round(auditCompleteness * 100) / 100,
            time_saved_by_task_category: timeSavedByTaskCategory,
        };

        weeklyRoiAccumulator.lastGeneratedAtMs = generatedAtMs;
        weeklyRoiAccumulator.lastReport = report;
        weeklyRoiAccumulator.reportCount += 1;
        weeklyRoiAccumulator.periodStartedAtMs = generatedAtMs;
        weeklyRoiAccumulator.totalProcessed = 0;
        weeklyRoiAccumulator.totalSucceeded = 0;
        weeklyRoiAccumulator.totalFailed = 0;
        weeklyRoiAccumulator.totalApprovalQueued = 0;
        weeklyRoiAccumulator.reworkEvents = 0;
        weeklyRoiAccumulator.approvalLatencyTotalMs = 0;
        weeklyRoiAccumulator.approvalLatencySamples = 0;
        weeklyRoiAccumulator.actionResultsPersisted = 0;
        weeklyRoiAccumulator.evidenceRecordsPersisted = 0;
        weeklyRoiAccumulator.timeSavedByCategoryMinutes.clear();

        emitRuntimeEvent('runtime.weekly_quality_roi_report_generated', config, {
            report_id: report.reportId,
            trigger,
            completion_quality_pct: report.completion_quality_pct,
            rework_rate_pct: report.rework_rate_pct,
            approval_latency_ms: report.approval_latency_ms,
            audit_completeness_pct: report.audit_completeness_pct,
            categories: report.time_saved_by_task_category.length,
        });

        return report;
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

    const isLeaseClaimedAndActive = (lease: RuntimeTaskLease, nowMs: number): boolean => {
        return lease.status === 'claimed' && lease.expiresAt > nowMs;
    };

    const expireLeaseIfNeeded = (lease: RuntimeTaskLease, nowMs: number): RuntimeTaskLease => {
        if (lease.status === 'claimed' && lease.expiresAt <= nowMs) {
            const expired: RuntimeTaskLease = {
                ...lease,
                status: 'expired',
            };
            taskLeaseStore.byTaskId.set(expired.taskId, expired);
            taskLeaseStore.byIdempotencyKey.set(expired.idempotencyKey, expired);
            return expired;
        }

        return lease;
    };

    const enqueueTaskLeaseMetadata = (taskId: string, lease: RuntimeTaskLease): void => {
        const queuedTask = workerLoop.queuedTasks.find((entry) => entry.taskId === taskId);
        if (!queuedTask) {
            return;
        }

        queuedTask.lease = {
            leaseId: lease.leaseId,
            idempotencyKey: lease.idempotencyKey,
            claimedBy: lease.claimedBy,
            claimedAt: lease.claimedAt,
            expiresAt: lease.expiresAt,
            correlationId: lease.correlationId,
            status:
                lease.status === 'claimed' || lease.status === 'released' || lease.status === 'expired'
                    ? lease.status
                    : 'expired',
        };
    };

    const getActiveLeaseCount = (): number => {
        const nowMs = now();
        let active = 0;
        for (const lease of taskLeaseStore.byTaskId.values()) {
            const normalized = expireLeaseIfNeeded(lease, nowMs);
            if (isLeaseClaimedAndActive(normalized, nowMs)) {
                active += 1;
            }
        }
        return active;
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

    const stopBackgroundLoop = (): void => {
        backgroundLoop.running = false;
        if (backgroundLoop.handle) {
            clearInterval(backgroundLoop.handle);
            backgroundLoop.handle = null;
        }
    };

    const collectFiles = (root: string, out: string[]): void => {
        let entries: string[] = [];
        try {
            entries = readdirSync(root);
        } catch {
            return;
        }

        for (const entry of entries) {
            const fullPath = join(root, entry);
            let isDirectory = false;
            try {
                isDirectory = statSync(fullPath).isDirectory();
            } catch {
                continue;
            }

            if (isDirectory) {
                if (entry === 'node_modules' || entry === '.git' || entry === 'coverage' || entry === 'dist') {
                    continue;
                }
                collectFiles(fullPath, out);
                continue;
            }

            out.push(fullPath);
        }
    };

    const computeWorkspaceTestGapSummary = (workspaceRoot: string): {
        sourceFileCount: number;
        testFileCount: number;
        uncoveredSample: string[];
    } => {
        const files: string[] = [];
        collectFiles(workspaceRoot, files);

        const sourceFiles = files.filter((file) => {
            const extension = extname(file);
            return extension === '.ts' || extension === '.tsx';
        }).filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.spec.ts'));

        const testBaseNames = new Set(
            files
                .filter((file) => file.endsWith('.test.ts') || file.endsWith('.spec.ts'))
                .map((file) => file
                    .replace(/\.test\.ts$/i, '')
                    .replace(/\.spec\.ts$/i, '')
                    .replace(/\\/g, '/')),
        );

        const uncovered = sourceFiles
            .filter((file) => !testBaseNames.has(file.replace(/\.(ts|tsx)$/i, '').replace(/\\/g, '/')))
            .slice(0, 10);

        return {
            sourceFileCount: sourceFiles.length,
            testFileCount: testBaseNames.size,
            uncoveredSample: uncovered,
        };
    };

    const buildProgressMessage = (task: TaskEnvelope, milestone: ProgressMilestone, detail: string): string => {
        return `[${task.taskId}] ${milestone}: ${detail}`;
    };

    const buildProgressSinkForTask = (task: TaskEnvelope, config: RuntimeConfig): ProgressSink => {
        const targets = Array.isArray(task.payload['progress_targets'])
            ? task.payload['progress_targets'].filter((target): target is Record<string, unknown> => typeof target === 'object' && target !== null)
            : [];
        const normalizedTargets = [...targets];

        if (normalizedTargets.length === 0 && typeof task.payload['connector_type'] === 'string') {
            if (task.payload['connector_type'] === 'jira' && typeof task.payload['issue_key'] === 'string') {
                normalizedTargets.push({ connector_type: 'jira', issue_key: task.payload['issue_key'] });
            }
            if (
                task.payload['connector_type'] === 'teams'
                && typeof task.payload['team_id'] === 'string'
                && typeof task.payload['channel_id'] === 'string'
            ) {
                normalizedTargets.push({
                    connector_type: 'teams',
                    team_id: task.payload['team_id'],
                    channel_id: task.payload['channel_id'],
                });
            }
            if (task.payload['connector_type'] === 'email' && typeof task.payload['to'] === 'string') {
                normalizedTargets.push({ connector_type: 'email', to: task.payload['to'] });
            }
        }

        if (normalizedTargets.length === 0) {
            return new NoopProgressSink();
        }

        const sinks: ProgressSink[] = normalizedTargets.map((target) => ({
            send: async (event) => {
                const connectorType = target['connector_type'];
                const message = buildProgressMessage(task, event.milestone, event.detail);
                if (connectorType === 'jira' && typeof target['issue_key'] === 'string') {
                    await connectorActionExecuteClient({
                        baseUrl: config.connectorApiUrl,
                        token: config.connectorExecuteToken,
                        tenantId: config.tenantId,
                        workspaceId: config.workspaceId,
                        botId: config.botId,
                        roleKey: config.roleKey,
                        connectorType: 'jira',
                        actionType: 'create_comment',
                        payload: {
                            issue_key: target['issue_key'],
                            body: message,
                        },
                        correlationId: `${config.correlationId}:${task.taskId}:progress:${event.milestone}`,
                    });
                    return;
                }

                if (
                    connectorType === 'teams'
                    && typeof target['team_id'] === 'string'
                    && typeof target['channel_id'] === 'string'
                ) {
                    await connectorActionExecuteClient({
                        baseUrl: config.connectorApiUrl,
                        token: config.connectorExecuteToken,
                        tenantId: config.tenantId,
                        workspaceId: config.workspaceId,
                        botId: config.botId,
                        roleKey: config.roleKey,
                        connectorType: 'teams',
                        actionType: 'send_message',
                        payload: {
                            team_id: target['team_id'],
                            channel_id: target['channel_id'],
                            text: message,
                        },
                        correlationId: `${config.correlationId}:${task.taskId}:progress:${event.milestone}`,
                    });
                    return;
                }

                if (connectorType === 'email' && typeof target['to'] === 'string') {
                    await connectorActionExecuteClient({
                        baseUrl: config.connectorApiUrl,
                        token: config.connectorExecuteToken,
                        tenantId: config.tenantId,
                        workspaceId: config.workspaceId,
                        botId: config.botId,
                        roleKey: config.roleKey,
                        connectorType: 'email',
                        actionType: 'send_email',
                        payload: {
                            to: target['to'],
                            subject: typeof target['subject'] === 'string' ? target['subject'] : `AgentFarm task progress ${task.taskId}`,
                            body: message,
                        },
                        correlationId: `${config.correlationId}:${task.taskId}:progress:${event.milestone}`,
                    });
                }
            },
        }));

        return new FanOutProgressSink(sinks);
    };

    const enrichTaskWithVision = async (task: TaskEnvelope): Promise<TaskEnvelope> => {
        const imageBase64 = typeof task.payload['image_base64'] === 'string' ? task.payload['image_base64'] : null;
        const mimeType = typeof task.payload['image_mime_type'] === 'string' ? task.payload['image_mime_type'] : null;
        const intent = typeof task.payload['vision_intent'] === 'string' ? task.payload['vision_intent'] : null;

        if (!imageBase64 || !mimeType || !intent) {
            return task;
        }

        if (!visionCaller) {
            return {
                ...task,
                payload: {
                    ...task.payload,
                    _vision_status: 'skipped',
                    _vision_error: 'vision_not_configured',
                },
            };
        }

        try {
            const analysis = await analyzeImage(
                {
                    imageBase64,
                    mimeType: mimeType as 'image/png' | 'image/jpeg' | 'image/webp',
                    intent: intent as 'ui_bug_report' | 'architecture_diagram' | 'whiteboard_photo' | 'error_screenshot' | 'figma_mockup',
                },
                {
                    tenantId: configCache?.tenantId ?? 'unknown_tenant',
                    workspaceId: configCache?.workspaceId ?? 'unknown_workspace',
                    taskId: task.taskId,
                    correlationId: configCache?.correlationId ?? `task-${task.taskId}`,
                },
                visionCaller,
                visionProvider,
            );

            return {
                ...task,
                payload: {
                    ...task.payload,
                    _vision_status: 'analyzed',
                    _vision_analysis: analysis,
                },
            };
        } catch (err: unknown) {
            return {
                ...task,
                payload: {
                    ...task.payload,
                    _vision_status: 'failed',
                    _vision_error: err instanceof Error ? err.message : String(err),
                },
            };
        }
    };

    const executeConnectorActionForTask = async (input: {
        task: TaskEnvelope;
        config: RuntimeConfig;
        decision: {
            actionType: string;
            confidence: number;
            riskLevel: 'low' | 'medium' | 'high';
            route: 'execute' | 'approval';
            reason: string;
        };
        connectorType: 'jira' | 'teams' | 'github' | 'email';
        source: 'approval_decision_webhook' | 'approval_decision_cache' | 'direct_execute';
        payloadOverrideSource: PayloadOverrideSource;
    }): Promise<ProcessedTaskResult> => {
        advancedFeatures.appendTraceStep(input.task.taskId, 'connector_tool_input', {
            connectorType: input.connectorType,
            actionType: input.decision.actionType,
            source: input.source,
            payloadKeys: Object.keys(input.task.payload),
        });
        const connectorResponse = await connectorActionExecuteClient({
            baseUrl: input.config.connectorApiUrl,
            token: input.config.connectorExecuteToken,
            tenantId: input.config.tenantId,
            workspaceId: input.config.workspaceId,
            botId: input.config.botId,
            roleKey: input.config.roleKey,
            connectorType: input.connectorType,
            actionType: input.decision.actionType as
                | 'read_task'
                | 'create_comment'
                | 'update_status'
                | 'send_message'
                | 'create_pr_comment'
                | 'create_pr'
                | 'merge_pr'
                | 'list_prs'
                | 'send_email',
            payload: input.task.payload,
            correlationId: `${input.config.correlationId}:${input.task.taskId}`,
            claimToken:
                typeof input.task.payload['_claim_token'] === 'string'
                    ? input.task.payload['_claim_token']
                    : undefined,
            leaseMetadata: input.task.lease,
        });

        if (connectorResponse.ok) {
            advancedFeatures.appendTraceStep(input.task.taskId, 'connector_tool_output', {
                ok: true,
                statusCode: connectorResponse.statusCode,
                attempts: connectorResponse.attempts ?? 1,
            });
            emitRuntimeEvent('runtime.connector_action_executed', input.config, {
                task_id: input.task.taskId,
                connector_type: input.connectorType,
                action_type: input.decision.actionType,
                status_code: connectorResponse.statusCode,
                source: input.source,
            });

            const attempts = Math.max(1, connectorResponse.attempts ?? 1);
            return {
                decision: {
                    ...input.decision,
                    route: 'execute',
                    reason:
                        input.source === 'direct_execute'
                            ? 'Executed via connector action endpoint.'
                            : 'Executed via connector action endpoint after approval.',
                },
                status: 'success',
                attempts,
                transientRetries: Math.max(0, attempts - 1),
                executionPayload: input.task.payload,
                payloadOverrideSource: input.payloadOverrideSource,
            };
        }

        emitRuntimeEvent('runtime.connector_action_failed', input.config, {
            task_id: input.task.taskId,
            connector_type: input.connectorType,
            action_type: input.decision.actionType,
            status_code: connectorResponse.statusCode,
            error_message: connectorResponse.errorMessage ?? null,
            source: input.source,
        });
        advancedFeatures.appendTraceStep(input.task.taskId, 'connector_tool_output', {
            ok: false,
            statusCode: connectorResponse.statusCode,
            attempts: connectorResponse.attempts ?? 1,
            error: connectorResponse.errorMessage ?? null,
        });

        return {
            decision: {
                ...input.decision,
                route: 'execute',
                reason:
                    input.source === 'direct_execute'
                        ? 'Connector action endpoint execution failed.'
                        : 'Connector action endpoint execution failed after approval.',
            },
            status: 'failed',
            attempts: Math.max(1, connectorResponse.attempts ?? 1),
            transientRetries: 0,
            executionPayload: input.task.payload,
            payloadOverrideSource: input.payloadOverrideSource,
            failureClass:
                connectorResponse.statusCode === 0
                    || connectorResponse.statusCode === 429
                    || connectorResponse.statusCode >= 500
                    ? 'transient_error'
                    : 'runtime_exception',
            errorMessage: connectorResponse.errorMessage ?? `Connector execution failed with status ${connectorResponse.statusCode}.`,
        };
    };

    const executeLocalWorkspaceActionForTask = async (input: {
        task: TaskEnvelope;
        config: RuntimeConfig;
        decision: {
            actionType: string;
            confidence: number;
            riskLevel: 'low' | 'medium' | 'high';
            route: 'execute' | 'approval';
            reason: string;
        };
        source: 'approval_decision_webhook' | 'approval_decision_cache' | 'direct_execute';
        payloadOverrideSource: PayloadOverrideSource;
    }): Promise<ProcessedTaskResult> => {
        const runtimeScopedTask = enrichTaskWithRuntimeContext(input.task, input.config);
        const tryAttachFailureResearch = async (errorMessage: string): Promise<Record<string, unknown>> => {
            if (!errorMessage.trim()) {
                return {};
            }

            try {
                const fetchFn: FetchFn = async (url: string) => {
                    const response = await fetch(url, { signal: AbortSignal.timeout(75) });
                    return {
                        ok: response.ok,
                        status: response.status,
                        text: async () => response.text(),
                    };
                };

                const research = await researchForTask(
                    buildErrorQuery(errorMessage),
                    {
                        tenantId: input.config.tenantId,
                        workspaceId: input.config.workspaceId,
                        taskId: runtimeScopedTask.taskId,
                        correlationId: input.config.correlationId,
                    },
                    fetchFn,
                );

                if (research.sources.length === 0 && !research.synthesizedAnswer) {
                    return {};
                }

                return {
                    _research_query: errorMessage,
                    _research_summary: research.synthesizedAnswer,
                    _research_sources: research.sources.map((entry) => ({
                        url: entry.url,
                        source: entry.source,
                        relevance: entry.relevance,
                    })),
                };
            } catch {
                return {};
            }
        };

        const finalizeAuditSession = async (
            payload: Record<string, unknown>,
            status: 'completed' | 'failed',
            failureReason?: string,
        ): Promise<void> => {
            const sessionId = typeof payload['session_id'] === 'string' ? payload['session_id'].trim() : '';
            const auditAgentInstanceId = typeof payload['audit_agent_instance_id'] === 'string'
                ? payload['audit_agent_instance_id'].trim()
                : '';
            const auditRole = typeof payload['audit_role'] === 'string'
                ? payload['audit_role'].trim()
                : String(input.config.roleKey);

            if (!sessionId || !auditAgentInstanceId || !process.env.DATABASE_URL?.trim()) {
                return;
            }

            try {
                const prismaModule = await import('@prisma/client');
                const prisma = new prismaModule.PrismaClient();
                try {
                    const auditContext = buildRuntimeAuditContext({
                        tenantId: input.config.tenantId,
                        workspaceId: input.config.workspaceId,
                        role: auditRole,
                        taskId: runtimeScopedTask.taskId,
                        sessionId,
                        agentInstanceId: auditAgentInstanceId,
                        env: process.env,
                    });
                    await completeAgentSession(prisma as never, auditContext, {
                        status,
                        actionCount: getAuditLogWriter().listSession(sessionId).length,
                        failureReason,
                    });
                } finally {
                    await prisma.$disconnect().catch(() => undefined);
                }
            } catch {
                // Best-effort audit completion only.
            }
        };

        const executeLocalPayload = async (payload: Record<string, unknown>) => {
            return executeLocalWorkspaceActionWithMemoryMirror({
                execution: {
                    tenantId: input.config.tenantId,
                    botId: input.config.botId,
                    taskId: runtimeScopedTask.taskId,
                    actionType: input.decision.actionType as LocalWorkspaceActionType,
                    payload,
                },
                executor: localWorkspaceActionExecutor,
                onMemoryMirror: memoryStore
                    ? (record) => memoryStore.writeMemoryAfterTask({
                        workspaceId: input.config.workspaceId,
                        tenantId: input.config.tenantId,
                        taskId: record.taskId,
                        actionsTaken: [record.actionType],
                        approvalOutcomes: input.source === 'direct_execute'
                            ? []
                            : [{ action: record.actionType, decision: 'approved' }],
                        connectorsUsed: [],
                        llmProvider: undefined,
                        executionStatus: record.executionStatus,
                        summary: `${record.summary} ${record.outputPreview}`.trim(),
                        correlationId: input.config.correlationId,
                    }).catch((err: unknown) => {
                        emitRuntimeEvent('runtime.memory_record_persist_failed', input.config, {
                            task_id: runtimeScopedTask.taskId,
                            error_message: err instanceof Error ? err.message : String(err),
                            hook: 'local_workspace_executor',
                        });
                    })
                    : undefined,
            });
        };

        advancedFeatures.appendTraceStep(runtimeScopedTask.taskId, 'local_tool_input', {
            actionType: input.decision.actionType,
            source: input.source,
            payloadKeys: Object.keys(runtimeScopedTask.payload),
        });
        let executionPayload = { ...runtimeScopedTask.payload };
        let localResult = await executeLocalPayload(executionPayload);

        if (!localResult.ok && executionPayload['_research_retry_attempted'] !== true) {
            const researchPayload = await tryAttachFailureResearch(localResult.output || 'local workspace action failed');
            if (Object.keys(researchPayload).length > 0) {
                executionPayload = {
                    ...executionPayload,
                    ...researchPayload,
                    _research_retry_attempted: true,
                };
                localResult = await executeLocalPayload(executionPayload);
            }
        }

        if (localResult.ok) {
            advancedFeatures.appendTraceStep(runtimeScopedTask.taskId, 'local_tool_output', {
                ok: true,
                exitCode: localResult.exitCode ?? 0,
                outputPreview: localResult.output.slice(0, 400),
            });

            const diffScan = advancedFeatures.scanGeneratedDiffForSecrets(localResult.output);
            if (diffScan.blocked) {
                advancedFeatures.appendTraceStep(runtimeScopedTask.taskId, 'local_output_secret_blocked', {
                    matches: diffScan.matches,
                });
                await finalizeAuditSession(executionPayload, 'failed', 'Local action output contains potential secrets; blocked by policy.');
                return {
                    decision: {
                        ...input.decision,
                        route: 'execute',
                        reason: 'Local action output appears to contain secrets and was blocked.',
                    },
                    status: 'failed',
                    attempts: 1,
                    transientRetries: 0,
                    executionPayload,
                    payloadOverrideSource: input.payloadOverrideSource,
                    failureClass: 'runtime_exception',
                    errorMessage: 'Local action output contains potential secrets; blocked by policy.',
                };
            }

            captureInterviewEventsFromLocalOutput({
                taskId: runtimeScopedTask.taskId,
                actionType: input.decision.actionType,
                output: localResult.output,
            });

            let payloadOverrideSource = input.payloadOverrideSource;
            if (input.decision.actionType === 'workspace_subagent_spawn' && localResult.output.trim()) {
                try {
                    const parsed = JSON.parse(localResult.output) as { plan_source?: string };
                    if (parsed.plan_source === 'executor_inferred') {
                        payloadOverrideSource = 'executor_inferred';
                    }
                } catch {
                    // Ignore JSON parse errors for telemetry derivation.
                }
            }

            emitRuntimeEvent('runtime.local_workspace_action_executed', input.config, {
                task_id: runtimeScopedTask.taskId,
                action_type: input.decision.actionType,
                output_length: localResult.output.length,
                exit_code: localResult.exitCode ?? 0,
                source: input.source,
                payload_override_source: payloadOverrideSource,
            });

            const actionType = input.decision.actionType as LocalWorkspaceActionType;
            if (POST_CHANGE_QUALITY_GATE_ACTIONS.has(actionType)) {
                const lintFixPayload = {
                    ...runtimeScopedTask.payload,
                    action_type: 'run_linter',
                    fix: true,
                };
                const lintVerifyPayload = {
                    ...runtimeScopedTask.payload,
                    action_type: 'run_linter',
                    fix: false,
                };
                const testsPayload = {
                    ...runtimeScopedTask.payload,
                    action_type: 'run_tests',
                };

                const lintFixResult = await localWorkspaceActionExecutor({
                    tenantId: input.config.tenantId,
                    botId: input.config.botId,
                    taskId: `${input.task.taskId}:quality:lint:fix`,
                    actionType: 'run_linter',
                    payload: lintFixPayload,
                });
                const lintVerifyResult = await localWorkspaceActionExecutor({
                    tenantId: input.config.tenantId,
                    botId: input.config.botId,
                    taskId: `${input.task.taskId}:quality:lint:verify`,
                    actionType: 'run_linter',
                    payload: lintVerifyPayload,
                });
                const testsResult = await localWorkspaceActionExecutor({
                    tenantId: input.config.tenantId,
                    botId: input.config.botId,
                    taskId: `${input.task.taskId}:quality:tests`,
                    actionType: 'run_tests',
                    payload: testsPayload,
                });

                const lintStatus = lintVerifyResult.ok ? 'passed' : 'failed';
                const testStatus = testsResult.ok ? 'passed' : 'failed';

                if (!lintVerifyResult.ok || !testsResult.ok) {
                    emitRuntimeEvent('runtime.post_change_quality_gate_failed', input.config, {
                        task_id: runtimeScopedTask.taskId,
                        action_type: input.decision.actionType,
                        lint_fix_exit_code: lintFixResult.exitCode ?? (lintFixResult.ok ? 0 : 1),
                        lint_verify_exit_code: lintVerifyResult.exitCode ?? (lintVerifyResult.ok ? 0 : 1),
                        tests_exit_code: testsResult.exitCode ?? (testsResult.ok ? 0 : 1),
                        source: input.source,
                    });

                    await finalizeAuditSession(
                        {
                            ...executionPayload,
                            _quality_gate_lint_status: lintStatus,
                            _quality_gate_test_status: testStatus,
                            _quality_gate_escalation: true,
                        },
                        'failed',
                        `QUALITY_GATE_FAILED lint=${lintStatus} test=${testStatus}`,
                    );

                    return {
                        decision: {
                            ...input.decision,
                            route: input.decision.route,
                            reason: 'Post-change quality gate failed. Escalation required for manual review.',
                        },
                        status: 'failed',
                        attempts: 1,
                        transientRetries: 0,
                        executionPayload: {
                            ...runtimeScopedTask.payload,
                            _quality_gate_lint_status: lintStatus,
                            _quality_gate_test_status: testStatus,
                            _quality_gate_escalation: true,
                        },
                        payloadOverrideSource,
                        failureClass: 'runtime_exception',
                        errorMessage: `QUALITY_GATE_FAILED lint=${lintStatus} test=${testStatus}`,
                    };
                }

                emitRuntimeEvent('runtime.post_change_quality_gate_passed', input.config, {
                    task_id: runtimeScopedTask.taskId,
                    action_type: input.decision.actionType,
                    lint_fix_exit_code: lintFixResult.exitCode ?? 0,
                    lint_verify_exit_code: lintVerifyResult.exitCode ?? 0,
                    tests_exit_code: testsResult.exitCode ?? 0,
                    source: input.source,
                });
            }

            await finalizeAuditSession(executionPayload, 'completed');

            return {
                decision: {
                    ...input.decision,
                    route: 'execute',
                    reason:
                        input.source === 'direct_execute'
                            ? 'Local workspace action executed successfully.'
                            : 'Local workspace action executed successfully after approval.',
                },
                status: 'success',
                attempts: 1,
                transientRetries: 0,
                executionPayload,
                payloadOverrideSource,
            };
        }

        emitRuntimeEvent('runtime.local_workspace_action_failed', input.config, {
            task_id: runtimeScopedTask.taskId,
            action_type: input.decision.actionType,
            exit_code: localResult.exitCode ?? 1,
            error_output: localResult.errorOutput ?? null,
            source: input.source,
        });
        advancedFeatures.appendTraceStep(runtimeScopedTask.taskId, 'local_tool_output', {
            ok: false,
            exitCode: localResult.exitCode ?? 1,
            errorOutput: (localResult.errorOutput ?? '').slice(0, 400),
        });

        const researchPayload = await tryAttachFailureResearch(
            localResult.errorOutput ?? `Local workspace action '${input.decision.actionType}' failed.`,
        );
        await finalizeAuditSession(
            executionPayload,
            'failed',
            localResult.errorOutput ?? `Local workspace action '${input.decision.actionType}' failed.`,
        );

        return {
            decision: {
                ...input.decision,
                route: 'execute',
                reason:
                    input.source === 'direct_execute'
                        ? 'Local workspace action failed.'
                        : 'Local workspace action failed after approval.',
            },
            status: 'failed',
            attempts: 1,
            transientRetries: 0,
            executionPayload: {
                ...runtimeScopedTask.payload,
                ...researchPayload,
            },
            payloadOverrideSource: input.payloadOverrideSource,
            failureClass: 'runtime_exception',
            errorMessage: localResult.errorOutput ?? `Local workspace action '${input.decision.actionType}' failed.`,
        };
    };

    const executeApprovedTask = async (
        task: TaskEnvelope,
        config: RuntimeConfig,
        source: 'approval_decision_webhook' | 'approval_decision_cache',
        payloadOverrideSource: PayloadOverrideSource = 'none',
    ): Promise<ProcessedTaskResult> => {
        task = enrichTaskWithRuntimeContext(task, config);
        const progressSink = buildProgressSinkForTask(task, config);
        const decision = buildDecision(task);
        if (isTesterBlockedAction(config.roleKey, decision.actionType)) {
            return {
                decision: {
                    ...decision,
                    route: 'execute',
                    reason: `Action '${decision.actionType}' is explicitly blocked for tester role.`,
                },
                status: 'failed',
                attempts: 0,
                transientRetries: 0,
                executionPayload: task.payload,
                payloadOverrideSource,
                failureClass: 'runtime_exception',
                errorMessage: `Tester role blocked action '${decision.actionType}'.`,
            };
        }
        const connectorType = normalizeConnectorType(task.payload['connector_type']);
        task = enrichTaskWithRuntimeContext(task, config);
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
                executionPayload: task.payload,
                payloadOverrideSource,
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
            | 'create_pr'
            | 'merge_pr'
            | 'list_prs'
            | 'send_email',
        );

        if (connectorType && isConnectorAction) {
            return executeConnectorActionForTask({
                task,
                config,
                decision,
                connectorType,
                source,
                payloadOverrideSource,
            });
        }

        const isLocalWorkspaceAction = LOCAL_WORKSPACE_ACTION_TYPES.has(
            decision.actionType as LocalWorkspaceActionType,
        );

        if (isLocalWorkspaceAction) {
            return executeLocalWorkspaceActionForTask({ task, config, decision, source, payloadOverrideSource });
        }

        return processApprovedTask(task, {
            maxAttempts: 3,
            modelProvider: activeModelProvider,
            modelProfile: resolveDefaultModelProfile(capabilitySnapshotCache),
            progressSink,
        });
    };

    const processOneTask = async (task: TaskEnvelope, config: RuntimeConfig): Promise<void> => {
        // Record task start time for transcript
        taskStartTimes.set(task.taskId, now());

        task = await enrichTaskWithVision(task);
        const progressSink = buildProgressSinkForTask(task, config);

        const taskDecision = buildDecision(task);
        advancedFeatures.recordStart(task, taskDecision);
        const executionPlan = advancedFeatures.createPlan(task, taskDecision);
        advancedFeatures.registerPlanCheckpoint(task, taskDecision, executionPlan);
        emitRuntimeEvent('runtime.plan_first_generated', config, {
            task_id: task.taskId,
            plan_id: executionPlan.planId,
            summary: executionPlan.summary,
            risks: executionPlan.risks,
            files_hint: executionPlan.filesHint,
            test_strategy: executionPlan.testStrategy,
            rollback: executionPlan.rollback,
        });
        advancedFeatures.appendTraceStep(task.taskId, 'plan_first_generated', {
            planId: executionPlan.planId,
            summary: executionPlan.summary,
            riskCount: executionPlan.risks.length,
        });

        const secretScan = advancedFeatures.scanPayloadForSecrets(task.payload);
        if (secretScan.blocked) {
            workerLoop.processedTasks += 1;
            workerLoop.failedTasks += 1;
            advancedFeatures.appendTraceStep(task.taskId, 'payload_secret_scan_blocked', {
                matches: secretScan.matches,
            });
            emitRuntimeEvent('runtime.security_payload_blocked', config, {
                task_id: task.taskId,
                action_type: taskDecision.actionType,
                matched_patterns: secretScan.matches,
            });

            await persistActionResultRecord(task, config, {
                decision: {
                    ...taskDecision,
                    route: 'approval',
                    reason: 'Payload blocked by secret scanning policy.',
                },
                status: 'failed',
                attempts: 0,
                transientRetries: 0,
                executionPayload: task.payload,
                payloadOverrideSource: 'none',
                failureClass: 'runtime_exception',
                errorMessage: 'Task payload contains potential secrets; blocked by policy.',
            });
            return;
        }

        const connectorTypeForPolicy = normalizeConnectorType(task.payload['connector_type']);
        const snapshotPolicy = evaluateSnapshotExecutionPolicy({
            snapshot: capabilitySnapshotCache,
            actionType: taskDecision.actionType,
            connectorType: connectorTypeForPolicy,
        });
        if (!snapshotPolicy.allowed) {
            workerLoop.processedTasks += 1;
            workerLoop.failedTasks += 1;
            advancedFeatures.appendTraceStep(task.taskId, 'capability_policy_blocked', {
                reason: snapshotPolicy.reason ?? null,
                connectorType: connectorTypeForPolicy,
            });
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
                executionPayload: task.payload,
                payloadOverrideSource: 'none',
                failureClass: 'runtime_exception',
                errorMessage: snapshotPolicy.reason ?? 'Capability policy blocked execution.',
            });
            return;
        }

        const cachedApproval = workerLoop.approvedDecisionCache.get(task.taskId);

        if (cachedApproval && taskDecision.route === 'approval') {
            workerLoop.approvalDecisionCacheHits += 1;
            advancedFeatures.appendTraceStep(task.taskId, 'approval_decision_cache_hit', {
                decision: cachedApproval.decision,
                actor: cachedApproval.actor,
            });
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

        const result = memoryStore
            ? await processDeveloperTaskWithMemory(
                task,
                memoryStore,
                {
                    maxAttempts: 3,
                    modelProvider: activeModelProvider,
                    modelProfile: resolveDefaultModelProfile(capabilitySnapshotCache),
                    llmDecisionResolver,
                    progressSink,
                },
            )
            : await processDeveloperTask(task, {
                maxAttempts: 3,
                modelProvider: activeModelProvider,
                modelProfile: resolveDefaultModelProfile(capabilitySnapshotCache),
                llmDecisionResolver,
                progressSink,
            });
        const executionTask: TaskEnvelope = {
            ...task,
            payload: result.executionPayload,
        };
        const scopeCheck = advancedFeatures.validateTaskScope(executionTask.payload);
        if (!scopeCheck.allowed) {
            workerLoop.processedTasks += 1;
            workerLoop.failedTasks += 1;
            advancedFeatures.appendTraceStep(task.taskId, 'scope_constraint_blocked', {
                outOfScopePaths: scopeCheck.outOfScopePaths,
                scope: advancedFeatures.getScopeConstraint(),
            });
            await persistActionResultRecord(executionTask, config, {
                ...result,
                status: 'failed',
                failureClass: 'runtime_exception',
                errorMessage: `Task blocked by scope constraint: ${scopeCheck.outOfScopePaths.join(', ')}`,
            });
            return;
        }

        const policyCheck = advancedFeatures.evaluatePolicyForTask(result.decision.actionType, executionTask.payload);
        if (policyCheck.blocked) {
            workerLoop.processedTasks += 1;
            workerLoop.failedTasks += 1;
            advancedFeatures.appendTraceStep(task.taskId, 'policy_pack_blocked', {
                actionType: result.decision.actionType,
                activePackId: policyCheck.activePackId,
                reason: policyCheck.reason,
            });
            await persistActionResultRecord(executionTask, config, {
                ...result,
                status: 'failed',
                failureClass: 'runtime_exception',
                errorMessage: policyCheck.reason ?? 'Blocked by active policy pack.',
            });
            return;
        }

        if (typeof executionTask.payload['generated_diff'] === 'string') {
            const diffScan = advancedFeatures.scanGeneratedDiffForSecrets(
                executionTask.payload['generated_diff'] as string,
            );
            if (diffScan.blocked) {
                workerLoop.processedTasks += 1;
                workerLoop.failedTasks += 1;
                advancedFeatures.appendTraceStep(task.taskId, 'generated_diff_secret_blocked', {
                    matches: diffScan.matches,
                });
                await persistActionResultRecord(executionTask, config, {
                    ...result,
                    status: 'failed',
                    failureClass: 'runtime_exception',
                    errorMessage: 'Generated diff contains potential secrets; blocked by policy.',
                });
                return;
            }
        }
        workerLoop.processedTasks += 1;
        workerLoop.retriedAttempts += result.transientRetries;

        emitRuntimeEvent('runtime.task_classified', config, {
            task_id: task.taskId,
            action_type: result.decision.actionType,
            confidence: result.decision.confidence,
            risk_level: result.decision.riskLevel,
            route: result.decision.route,
            classification_reason: result.decision.reason,
            classification_source: result.llmExecution?.classificationSource ?? 'heuristic',
            llm_fallback_reason: result.llmExecution?.fallbackReason ?? null,
            payload_override_source: result.payloadOverrideSource,
            payload_overrides_applied: result.payloadOverrideSource !== 'none',
        });
        advancedFeatures.appendTraceStep(task.taskId, 'task_classified', {
            actionType: result.decision.actionType,
            route: result.decision.route,
            riskLevel: result.decision.riskLevel,
            classificationSource: result.llmExecution?.classificationSource ?? 'heuristic',
        });

        if (isTesterBlockedAction(config.roleKey, result.decision.actionType)) {
            workerLoop.failedTasks += 1;
            advancedFeatures.appendTraceStep(task.taskId, 'tester_role_action_blocked', {
                actionType: result.decision.actionType,
            });
            await persistActionResultRecord(executionTask, config, {
                ...result,
                status: 'failed',
                failureClass: 'runtime_exception',
                errorMessage: `Tester role blocked action '${result.decision.actionType}'.`,
            });
            return;
        }

        if (isBudgetDenied(executionTask)) {
            workerLoop.failedTasks += 1;
            advancedFeatures.appendTraceStep(task.taskId, 'budget_hard_stop_denied', {
                reason: executionTask.payload['_budget_denial_reason'] ?? null,
            });
            await persistBudgetDenialRecord(executionTask, config);
            await persistActionResultRecord(executionTask, config, {
                ...result,
                status: 'failed',
                failureClass: 'runtime_exception',
                errorMessage: 'Task blocked by token budget hard-stop.',
            });
            return;
        }

        if (advancedFeatures.requiresPlanApproval(result.decision.actionType) && !advancedFeatures.isPlanApproved(task.taskId)) {
            advancedFeatures.appendTraceStep(task.taskId, 'plan_approval_required', {
                actionType: result.decision.actionType,
                reason: 'Mutating action requires explicit plan approval.',
            });
            result.status = 'approval_required';
            result.decision = {
                ...result.decision,
                route: 'approval',
                riskLevel: result.decision.riskLevel === 'low' ? 'medium' : result.decision.riskLevel,
                reason: 'Plan-first guard requires approval before mutating execution.',
            };
        }

        if (result.status === 'approval_required') {
            workerLoop.approvalQueuedTasks += 1;
            advancedFeatures.appendTraceStep(task.taskId, 'approval_required_queued', {
                actionType: result.decision.actionType,
                riskLevel: result.decision.riskLevel,
                confidence: result.decision.confidence,
            });

            const effortEstimate = estimateTaskEffort({
                tenantId: config.tenantId,
                workspaceId: config.workspaceId,
                taskId: task.taskId,
                description:
                    typeof executionTask.payload['summary'] === 'string'
                        ? executionTask.payload['summary']
                        : result.decision.reason,
                targetFiles: Array.isArray(executionTask.payload['target_files'])
                    ? executionTask.payload['target_files'].filter((entry): entry is string => typeof entry === 'string')
                    : typeof executionTask.payload['file_path'] === 'string' && executionTask.payload['file_path'].trim()
                        ? [executionTask.payload['file_path']]
                        : [],
                riskLevel: result.decision.riskLevel,
                hasExistingTests: executionTask.payload['has_existing_tests'] !== false,
                correlationId: config.correlationId,
            });
            executionTask.payload['_effort_estimated_minutes'] = effortEstimate.estimatedMinutes;
            executionTask.payload['_effort_complexity'] = effortEstimate.complexity;
            executionTask.payload['_effort_confidence'] = effortEstimate.confidenceScore;
            const effortSummary = formatEstimateForApproval(effortEstimate);

            if (result.decision.riskLevel === 'medium' || result.decision.riskLevel === 'high') {
                const actionId = `${task.taskId}:${result.decision.actionType}`;
                let actionSummary =
                    typeof executionTask.payload['summary'] === 'string' && executionTask.payload['summary'].trim()
                        ? executionTask.payload['summary']
                        : `${result.decision.actionType} requested by runtime`;

                const impactedScope =
                    typeof executionTask.payload['target'] === 'string' && executionTask.payload['target'].trim()
                        ? executionTask.payload['target'].trim()
                        : typeof executionTask.payload['file_path'] === 'string' && executionTask.payload['file_path'].trim()
                            ? executionTask.payload['file_path'].trim()
                            : typeof executionTask.payload['workspace_key'] === 'string' && executionTask.payload['workspace_key'].trim()
                                ? executionTask.payload['workspace_key'].trim()
                                : 'workspace_scope_not_provided';

                const rollbackHint =
                    typeof executionTask.payload['rollback_plan'] === 'string' && executionTask.payload['rollback_plan'].trim()
                        ? executionTask.payload['rollback_plan'].trim()
                        : 'Use workspace_checkpoint restore and git revert for manual rollback.';

                const lintStatus =
                    typeof executionTask.payload['_quality_gate_lint_status'] === 'string'
                        ? executionTask.payload['_quality_gate_lint_status']
                        : 'not_run';
                const testStatus =
                    typeof executionTask.payload['_quality_gate_test_status'] === 'string'
                        ? executionTask.payload['_quality_gate_test_status']
                        : 'not_run';

                const escalationOptions = buildEscalationWhatIfOptions({
                    actionType: result.decision.actionType,
                    riskLevel: result.decision.riskLevel,
                    confidence: result.decision.confidence,
                });

                const optionLines = escalationOptions.map((option, index) => {
                    return `Option ${index + 1} (${option.optionId}): ${option.summary} Tradeoff speed: ${option.tradeoffSpeed}, risk: ${option.tradeoffRisk}, confidence: ${option.confidence.toFixed(2)}.`;
                });

                actionSummary = [
                    `Change summary: ${actionSummary}`,
                    effortSummary,
                    `Impacted scope: ${impactedScope}`,
                    `Risk reason: ${result.decision.reason}`,
                    `Proposed rollback: ${rollbackHint}`,
                    'What-if options:',
                    ...optionLines,
                    `Lint status: ${String(lintStatus)}`,
                    `Test status: ${String(testStatus)}`,
                ].join('\n');

                // For git_push, generate a richer preflight summary (branch, commits, diff stat)
                // so the approver has context about what will be pushed.
                if (result.decision.actionType === 'git_push') {
                    const workspaceKey = typeof executionTask.payload['workspace_key'] === 'string' && executionTask.payload['workspace_key'].trim()
                        ? executionTask.payload['workspace_key'].trim()
                        : task.taskId;
                    const wsDir = getWorkspaceDir(config.tenantId, config.botId, workspaceKey);
                    const gitSummary = await buildGitPushApprovalSummary(wsDir, executionTask.payload)
                        .catch(() => actionSummary);
                    if (gitSummary.trim()) {
                        actionSummary = gitSummary;
                    }
                }

                // Store approval summary for transcript
                taskApprovalSummaries.set(task.taskId, actionSummary);

                const pendingRecord: PendingApprovalTask = {
                    taskId: task.taskId,
                    enqueuedAt: now(),
                    riskLevel: result.decision.riskLevel,
                    actionType: result.decision.actionType,
                    actionSummary,
                    escalationOptions,
                    task: executionTask,
                    executionPayload: executionTask.payload,
                    payloadOverrideSource: result.payloadOverrideSource,
                    escalated: false,
                    slaRiskPredicted: false,
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
                            llmProvider: result.llmExecution?.modelProvider,
                            llmModel: result.llmExecution?.model ?? undefined,
                        });

                        lastIntake = intake;
                        if (intake.ok) {
                            if (intake.approvalId) {
                                executionTask.payload['_approval_id'] = intake.approvalId;
                            }
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
                escalation_options: workerLoop.pendingApprovals.find((pending) => pending.taskId === task.taskId)?.escalationOptions
                    .map((option) => option.optionId) ?? [],
            });
            await persistActionResultRecord(executionTask, config, result);
            return;
        }

        const connectorType = normalizeConnectorType(executionTask.payload['connector_type']);
        const directConnectorAction = CONNECTOR_ACTION_TYPES.has(
            result.decision.actionType as
            | 'read_task'
            | 'create_comment'
            | 'update_status'
            | 'send_message'
            | 'create_pr_comment'
            | 'create_pr'
            | 'merge_pr'
            | 'list_prs'
            | 'send_email',
        );

        if (result.status === 'success' && connectorType && directConnectorAction) {
            advancedFeatures.appendTraceStep(task.taskId, 'connector_execution_started', {
                connectorType,
                actionType: result.decision.actionType,
            });
            const connectorResult = await executeConnectorActionForTask({
                task: executionTask,
                config,
                decision: result.decision,
                connectorType,
                source: 'direct_execute',
                payloadOverrideSource: result.payloadOverrideSource,
            });

            if (connectorResult.status === 'success') {
                workerLoop.succeededTasks += 1;
                workerLoop.retriedAttempts += connectorResult.transientRetries;
                advancedFeatures.appendTraceStep(task.taskId, 'connector_execution_succeeded', {
                    attempts: connectorResult.attempts,
                    retries: connectorResult.transientRetries,
                });
                emitRuntimeEvent('runtime.task_processed', config, {
                    task_id: task.taskId,
                    queue_depth: workerLoop.queuedTasks.length,
                    processed_tasks: workerLoop.processedTasks,
                    retries: connectorResult.transientRetries,
                    attempts: connectorResult.attempts,
                    execution_path: 'connector_endpoint',
                });
                await persistActionResultRecord(executionTask, config, connectorResult);
                return;
            }

            workerLoop.failedTasks += 1;
            advancedFeatures.appendTraceStep(task.taskId, 'connector_execution_failed', {
                attempts: connectorResult.attempts,
                retries: connectorResult.transientRetries,
                failureClass: connectorResult.failureClass ?? 'runtime_exception',
            });
            emitRuntimeEvent('runtime.task_failed', config, {
                task_id: task.taskId,
                attempts: connectorResult.attempts,
                retries: connectorResult.transientRetries,
                failure_class: connectorResult.failureClass ?? 'runtime_exception',
                error_message: connectorResult.errorMessage ?? null,
                execution_path: 'connector_endpoint',
            });
            await persistActionResultRecord(executionTask, config, connectorResult);
            return;
        }

        const isDirectLocalWorkspaceAction = LOCAL_WORKSPACE_ACTION_TYPES.has(
            result.decision.actionType as LocalWorkspaceActionType,
        );

        if (result.status === 'success' && isDirectLocalWorkspaceAction) {
            advancedFeatures.appendTraceStep(task.taskId, 'local_workspace_execution_started', {
                actionType: result.decision.actionType,
            });
            const localResult = await executeLocalWorkspaceActionForTask({
                task: executionTask,
                config,
                decision: result.decision,
                source: 'direct_execute',
                payloadOverrideSource: result.payloadOverrideSource,
            });

            if (localResult.status === 'success') {
                workerLoop.succeededTasks += 1;
                advancedFeatures.appendTraceStep(task.taskId, 'local_workspace_execution_succeeded', {
                    attempts: localResult.attempts,
                    retries: localResult.transientRetries,
                });
                emitRuntimeEvent('runtime.task_processed', config, {
                    task_id: task.taskId,
                    queue_depth: workerLoop.queuedTasks.length,
                    processed_tasks: workerLoop.processedTasks,
                    retries: localResult.transientRetries,
                    attempts: localResult.attempts,
                    execution_path: 'local_workspace',
                });
                await persistActionResultRecord(executionTask, config, localResult);
                return;
            }

            workerLoop.failedTasks += 1;
            advancedFeatures.appendTraceStep(task.taskId, 'local_workspace_execution_failed', {
                attempts: localResult.attempts,
                retries: localResult.transientRetries,
                failureClass: localResult.failureClass ?? 'runtime_exception',
            });
            emitRuntimeEvent('runtime.task_failed', config, {
                task_id: task.taskId,
                attempts: localResult.attempts,
                retries: localResult.transientRetries,
                failure_class: localResult.failureClass ?? 'runtime_exception',
                error_message: localResult.errorMessage ?? null,
                execution_path: 'local_workspace',
            });
            await persistActionResultRecord(executionTask, config, localResult);
            return;
        }

        if (result.status === 'success') {
            workerLoop.succeededTasks += 1;
            advancedFeatures.appendTraceStep(task.taskId, 'task_succeeded', {
                attempts: result.attempts,
                retries: result.transientRetries,
            });
            emitRuntimeEvent('runtime.task_processed', config, {
                task_id: task.taskId,
                queue_depth: workerLoop.queuedTasks.length,
                processed_tasks: workerLoop.processedTasks,
                retries: result.transientRetries,
                attempts: result.attempts,
            });
            await persistActionResultRecord(executionTask, config, result);
            return;
        }

        workerLoop.failedTasks += 1;
        advancedFeatures.appendTraceStep(task.taskId, 'task_failed', {
            attempts: result.attempts,
            retries: result.transientRetries,
            failureClass: result.failureClass ?? 'runtime_exception',
        });
        emitRuntimeEvent('runtime.task_failed', config, {
            task_id: task.taskId,
            attempts: result.attempts,
            retries: result.transientRetries,
            failure_class: result.failureClass ?? 'runtime_exception',
            error_message: result.errorMessage ?? null,
        });
        await persistActionResultRecord(executionTask, config, result);
    };

    const persistActionResultRecord = async (
        task: TaskEnvelope,
        config: RuntimeConfig,
        result: ProcessedTaskResult,
    ): Promise<void> => {
        // Write compact execution transcript before flushing the action result
        const startedAt = taskStartTimes.get(task.taskId);
        taskStartTimes.delete(task.taskId);
        const approvalSummary = taskApprovalSummaries.get(task.taskId) ?? null;
        taskApprovalSummaries.delete(task.taskId);
        const fallbackCompletedAt = now();
        let executionStartedAtIso = new Date(task.enqueuedAt).toISOString();
        let executionCompletedAtIso = new Date(fallbackCompletedAt).toISOString();
        let executionDurationMs = Math.max(0, fallbackCompletedAt - task.enqueuedAt);
        if (startedAt !== undefined) {
            const completedAt = fallbackCompletedAt;
            executionStartedAtIso = new Date(startedAt).toISOString();
            executionCompletedAtIso = new Date(completedAt).toISOString();
            executionDurationMs = Math.max(0, completedAt - startedAt);
            pushTranscript({
                taskId: task.taskId,
                startedAt: executionStartedAtIso,
                completedAt: executionCompletedAtIso,
                actionType: result.decision.actionType,
                riskLevel: result.decision.riskLevel,
                route: result.decision.route,
                status: result.status,
                durationMs: executionDurationMs,
                errorMessage: result.errorMessage ?? null,
                approvalRequired: result.status === 'approval_required',
                approvalSummary,
                payloadOverrideSource: result.payloadOverrideSource,
                payloadOverridesApplied: result.payloadOverrideSource !== 'none',
            });
        }

        advancedFeatures.appendTraceStep(task.taskId, 'task_result_persist_start', {
            status: result.status,
            actionType: result.decision.actionType,
            riskLevel: result.decision.riskLevel,
        });
        advancedFeatures.recordEnd(task, result);

        const claimToken =
            typeof task.payload['_claim_token'] === 'string'
                ? task.payload['_claim_token']
                : undefined;
        const budgetDecision =
            typeof task.payload['_budget_decision'] === 'string'
                ? (task.payload['_budget_decision'] as 'allowed' | 'denied' | 'warning')
                : undefined;
        const budgetDenialReason =
            typeof task.payload['_budget_denial_reason'] === 'string'
                ? task.payload['_budget_denial_reason']
                : undefined;
        const budgetLimitScope =
            typeof task.payload['_budget_limit_scope'] === 'string'
                ? task.payload['_budget_limit_scope']
                : undefined;
        const budgetLimitType =
            typeof task.payload['_budget_limit_type'] === 'string'
                ? task.payload['_budget_limit_type']
                : undefined;
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
            claimToken,
            leaseId: task.lease?.leaseId,
            leaseStatus: task.lease?.status,
            leaseClaimedBy: task.lease?.claimedBy,
            leaseIdempotencyKey: task.lease?.idempotencyKey,
            leaseExpiresAt: task.lease?.expiresAt,
            budgetDecision,
            budgetDenialReason,
            budgetLimitScope,
            budgetLimitType,
            payloadOverrideSource: result.payloadOverrideSource,
            payloadOverridesApplied: result.payloadOverrideSource !== 'none',
            actorId: task.lease?.claimedBy,
            routeReason: result.decision.reason,
            evidenceLink: `${config.evidenceApiUrl.replace(/\/$/, '')}/v1/evidence/tasks/${encodeURIComponent(task.taskId)}`,
            approvalSummary: approvalSummary ?? undefined,
        };

        weeklyRoiAccumulator.totalProcessed += 1;
        if (record.status === 'success') {
            weeklyRoiAccumulator.totalSucceeded += 1;
            const category = categorizeActionForRoi(record.actionType);
            const estimatedMinutes = estimateMinutesSavedForAction(record.actionType);
            weeklyRoiAccumulator.timeSavedByCategoryMinutes.set(
                category,
                (weeklyRoiAccumulator.timeSavedByCategoryMinutes.get(category) ?? 0) + estimatedMinutes,
            );
        } else if (record.status === 'approval_required') {
            weeklyRoiAccumulator.totalApprovalQueued += 1;
        } else if (record.status === 'failed') {
            weeklyRoiAccumulator.totalFailed += 1;
            weeklyRoiAccumulator.reworkEvents += 1;
        }
        if (record.retries > 0) {
            weeklyRoiAccumulator.reworkEvents += record.retries;
        }

        try {
            await actionResultWriter(record);
            weeklyRoiAccumulator.actionResultsPersisted += 1;
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

        try {
            const evidence = assembleEvidenceRecord({
                task,
                actionResult: record,
                executionLogs: collectExecutionLogsForTask(task.taskId),
                approvalId:
                    typeof task.payload['_approval_id'] === 'string'
                        ? task.payload['_approval_id']
                        : undefined,
                startedAt: executionStartedAtIso,
                completedAt: executionCompletedAtIso,
                durationMs: executionDurationMs,
            });
            await evidenceRecordWriter(evidence);
            weeklyRoiAccumulator.evidenceRecordsPersisted += 1;
            emitRuntimeEvent('runtime.evidence_record_persisted', config, {
                evidence_id: evidence.evidenceId,
                task_id: task.taskId,
                action_status: evidence.actionStatus,
                path: evidenceRecordPath,
            });
        } catch (err: unknown) {
            emitRuntimeEvent('runtime.evidence_record_persist_failed', config, {
                task_id: task.taskId,
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
        const modelProfile =
            typeof result.llmExecution?.modelProfile === 'string' && result.llmExecution.modelProfile.trim()
                ? result.llmExecution.modelProfile.trim()
                : resolveDefaultModelProfile(capabilitySnapshotCache);
        const modelProvider =
            result.llmExecution?.modelProvider
            ?? activeModelProvider
            ?? 'agentfarm';
        const latencyMs = Math.max(0, now() - task.enqueuedAt);

        taskExecutionRecordWriter.write({
            botId: config.botId,
            tenantId: config.tenantId,
            workspaceId: config.workspaceId,
            taskId: task.taskId,
            modelProvider,
            modelProfile,
            promptTokens: result.llmExecution?.promptTokens ?? null,
            completionTokens: result.llmExecution?.completionTokens ?? null,
            totalTokens: result.llmExecution?.totalTokens ?? null,
            latencyMs,
            outcome: taskOutcome,
            payloadOverrideSource: result.payloadOverrideSource,
            payloadOverridesApplied: result.payloadOverrideSource !== 'none',
            executedAt: new Date(task.enqueuedAt),
        }).catch(() => {
            // Non-blocking: task execution record write failures do not affect task outcome
        });

        recordQualitySignal({
            provider: modelProvider,
            actionType: result.decision.actionType,
            score: estimateLlmQualityScore(result),
            source: 'runtime_outcome',
            taskId: task.taskId,
            correlationId: config.correlationId,
        });

        const evaluatorWebhookUrl = resolveEvaluatorWebhookUrl(process.env);
        if (evaluatorWebhookUrl) {
            const runtimeBaseUrl =
                process.env.RUNTIME_BASE_URL?.trim()
                ?? `http://localhost:${process.env.RUNTIME_PORT ?? '4000'}`;
            fireEvaluatorWebhook({
                taskId: task.taskId,
                correlationId: config.correlationId,
                tenantId: config.tenantId,
                workspaceId: config.workspaceId,
                botId: config.botId,
                provider: modelProvider,
                actionType: result.decision.actionType,
                executionStatus: result.status,
                riskLevel: result.decision.riskLevel,
                latencyMs,
                promptTokens: result.llmExecution?.promptTokens ?? null,
                completionTokens: result.llmExecution?.completionTokens ?? null,
                heuristicScore: estimateLlmQualityScore(result),
                callbackUrl: `${runtimeBaseUrl}/runtime/quality/signals`,
                webhookUrl: evaluatorWebhookUrl,
            });
        }

        if (memoryStore) {
            memoryStore.writeMemoryAfterTask({
                workspaceId: config.workspaceId,
                tenantId: config.tenantId,
                taskId: task.taskId,
                actionsTaken: [result.decision.actionType],
                approvalOutcomes: collectApprovalOutcomes(result),
                connectorsUsed: collectConnectorsUsed(task, result.decision.actionType),
                llmProvider: modelProvider,
                executionStatus: result.status,
                summary: summarizeTaskForMemory(task, result),
                correlationId: config.correlationId,
            }).catch((err: unknown) => {
                emitRuntimeEvent('runtime.memory_record_persist_failed', config, {
                    task_id: task.taskId,
                    error_message: err instanceof Error ? err.message : String(err),
                });
            });
        }

        const workspaceKey =
            typeof task.payload['workspace_key'] === 'string' && task.payload['workspace_key'].trim()
                ? task.payload['workspace_key'].trim()
                : config.workspaceId;

        recordTaskIntelligence({
            workspaceKey,
            actionType: result.decision.actionType,
            riskLevel: result.decision.riskLevel,
            status: result.status,
            payload: task.payload,
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
        const claimToken =
            typeof input.task.payload['_claim_token'] === 'string'
                ? input.task.payload['_claim_token']
                : undefined;
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
            claimToken,
            leaseId: input.task.lease?.leaseId,
            leaseStatus: input.task.lease?.status,
            leaseClaimedBy: input.task.lease?.claimedBy,
            leaseIdempotencyKey: input.task.lease?.idempotencyKey,
            leaseExpiresAt: input.task.lease?.expiresAt,
            payloadOverrideSource: 'none',
            payloadOverridesApplied: false,
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
            if (!approval.slaRiskPredicted) {
                const elapsedMs = currentTime - approval.enqueuedAt;
                const projectedMs = elapsedMs + DEFAULT_APPROVAL_SLA_PREDICTION_MS;
                if (projectedMs >= approvalEscalationMs) {
                    approval.slaRiskPredicted = true;
                    emitRuntimeEvent('runtime.approval_sla_risk_predicted', config, {
                        task_id: approval.taskId,
                        risk_level: approval.riskLevel,
                        elapsed_ms: elapsedMs,
                        projected_ms: projectedMs,
                        escalation_threshold_ms: approvalEscalationMs,
                    });
                }
            }

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

    const runBackgroundWorkerTick = (config: RuntimeConfig): void => {
        backgroundLoop.ticks += 1;
        backgroundLoop.lastRunAt = new Date(now()).toISOString();

        try {
            const driftDetected = capabilitySnapshotCache
                ? capabilitySnapshotCache.roleKey !== config.roleKey
                || capabilitySnapshotCache.policyPackVersion !== config.policyPackVersion
                : false;
            if (driftDetected) {
                emitRuntimeEvent('runtime.background.connector_policy_drift_detected', config, {
                    role_key: config.roleKey,
                    snapshot_role_key: capabilitySnapshotCache?.roleKey ?? null,
                    policy_pack_version: config.policyPackVersion,
                    snapshot_policy_pack_version: capabilitySnapshotCache?.policyPackVersion ?? null,
                });
            }

            const workspaceRoot = process.cwd();
            const testGap = computeWorkspaceTestGapSummary(workspaceRoot);
            emitRuntimeEvent('runtime.background.test_gap_scan', config, {
                source_files: testGap.sourceFileCount,
                test_files: testGap.testFileCount,
                uncovered_sample: testGap.uncoveredSample,
            });

            emitRuntimeEvent('runtime.background.evidence_freshness_tick', config, {
                pending_approvals: workerLoop.pendingApprovals.length,
                transcripts_buffered: recentTranscripts.length,
            });

            emitRuntimeEvent('runtime.background.cost_burn_rate_tick', config, {
                processed_tasks: workerLoop.processedTasks,
                failed_tasks: workerLoop.failedTasks,
                retried_attempts: workerLoop.retriedAttempts,
            });

            if (!weeklyRoiAccumulator.lastGeneratedAtMs || (now() - weeklyRoiAccumulator.lastGeneratedAtMs) >= weeklyReportCadenceMs) {
                generateWeeklyQualityRoiReport(config, 'scheduled');
            }
        } catch (err: unknown) {
            backgroundLoop.failures += 1;
            emitRuntimeEvent('runtime.background.tick_failed', config, {
                error_message: err instanceof Error ? err.message : String(err),
                failures: backgroundLoop.failures,
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

    const dequeueNextProcessableTask = (config: RuntimeConfig): TaskEnvelope | undefined => {
        if (!config.enforceTaskLease) {
            return workerLoop.queuedTasks.shift();
        }

        const nowMs = now();
        for (let index = 0; index < workerLoop.queuedTasks.length; index += 1) {
            const candidate = workerLoop.queuedTasks[index];
            const lease = taskLeaseStore.byTaskId.get(candidate.taskId);
            if (!lease) {
                continue;
            }

            const normalizedLease = expireLeaseIfNeeded(lease, nowMs);
            if (!isLeaseClaimedAndActive(normalizedLease, nowMs)) {
                continue;
            }

            const [task] = workerLoop.queuedTasks.splice(index, 1);
            return task;
        }

        return undefined;
    };

    const isBudgetDenied = (task: TaskEnvelope): boolean => {
        return task.payload['_budget_decision'] === 'denied';
    };

    const persistBudgetDenialRecord = async (
        task: TaskEnvelope,
        config: RuntimeConfig,
    ): Promise<void> => {
        const budgetDenialReason =
            typeof task.payload['_budget_denial_reason'] === 'string'
                ? task.payload['_budget_denial_reason']
                : 'unknown_budget_denial';
        const budgetLimitScope =
            typeof task.payload['_budget_limit_scope'] === 'string'
                ? task.payload['_budget_limit_scope']
                : undefined;
        const budgetLimitType =
            typeof task.payload['_budget_limit_type'] === 'string'
                ? task.payload['_budget_limit_type']
                : undefined;
        const claimToken =
            typeof task.payload['_claim_token'] === 'string'
                ? task.payload['_claim_token']
                : undefined;

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
            actionType: typeof task.payload['action_type'] === 'string' ? (task.payload['action_type'] as string) : 'unknown',
            riskLevel: 'low',
            confidence: 0,
            route: 'execute',
            status: 'failed',
            attempts: 0,
            retries: 0,
            failureClass: 'runtime_exception',
            errorMessage: `Task blocked by budget hard-stop: ${budgetDenialReason}`,
            claimToken,
            budgetDecision: 'denied',
            budgetDenialReason,
            budgetLimitScope,
            budgetLimitType,
        };

        try {
            await actionResultWriter(record);
            emitRuntimeEvent('runtime.task_budget_denied', config, {
                record_id: record.recordId,
                task_id: task.taskId,
                denial_reason: budgetDenialReason,
            });
        } catch (err: unknown) {
            emitRuntimeEvent('runtime.budget_denial_persist_failed', config, {
                record_id: record.recordId,
                task_id: task.taskId,
                error_message: err instanceof Error ? err.message : String(err),
            });
        }
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
            if (!advancedFeatures.canProcessNextTask()) {
                return;
            }
            processApprovalEscalations(config);
            workerLoop.tickBusy = true;
            while (workerLoop.activeTaskIds.size < maxConcurrentTasks) {
                const task = dequeueNextProcessableTask(config);
                if (!task) {
                    break;
                }
                if (isBudgetDenied(task)) {
                    void persistBudgetDenialRecord(task, config);
                    continue;
                }
                workerLoop.activeTaskIds.add(task.taskId);
                void processOneTask(task, config).finally(() => {
                    workerLoop.activeTaskIds.delete(task.taskId);
                });
            }
            if (workerLoop.activeTaskIds.size === 0) {
                workerLoop.tickBusy = false;
                return;
            }
            queueMicrotask(() => {
                workerLoop.tickBusy = false;
            });
        }, workerPollMs);

        emitRuntimeEvent('runtime.worker_loops_started', config, {
            poll_interval_ms: workerPollMs,
            max_concurrent_tasks: maxConcurrentTasks,
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

    const startBackgroundLoop = (config: RuntimeConfig): void => {
        if (backgroundLoop.running && backgroundLoop.handle) {
            return;
        }

        backgroundLoop.running = true;
        backgroundLoop.handle = setInterval(() => {
            if (!backgroundLoop.running || killSwitchEngaged) {
                return;
            }
            if (runtimeState !== 'active' && runtimeState !== 'degraded') {
                return;
            }
            runBackgroundWorkerTick(config);
        }, backgroundWorkerIntervalMs);

        emitRuntimeEvent('runtime.background_loop_started', config, {
            interval_ms: backgroundWorkerIntervalMs,
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
            background_loop_running: backgroundLoop.running,
            heartbeat_sent: heartbeatLoop.sent,
            heartbeat_failed: heartbeatLoop.failed,
            last_heartbeat_at: heartbeatLoop.lastHeartbeatAt,
            background_ticks: backgroundLoop.ticks,
            background_failures: backgroundLoop.failures,
            background_last_run_at: backgroundLoop.lastRunAt,
            task_queue_depth: workerLoop.queuedTasks.length,
            active_task_slots: workerLoop.activeTaskIds.size,
            max_concurrent_tasks: maxConcurrentTasks,
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
            active_task_leases: getActiveLeaseCount(),
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
            background_loop_running: backgroundLoop.running,
            heartbeat_sent: heartbeatLoop.sent,
            heartbeat_failed: heartbeatLoop.failed,
            last_heartbeat_at: heartbeatLoop.lastHeartbeatAt,
            background_ticks: backgroundLoop.ticks,
            background_failures: backgroundLoop.failures,
            background_last_run_at: backgroundLoop.lastRunAt,
            task_queue_depth: workerLoop.queuedTasks.length,
            active_task_slots: workerLoop.activeTaskIds.size,
            max_concurrent_tasks: maxConcurrentTasks,
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
            active_task_leases: getActiveLeaseCount(),
        };
    });

    app.get('/health', async () => {
        const readiness = await getReadiness();
        return {
            ok: readiness.ready,
            state: runtimeState,
            checks: readiness.checks,
            heartbeat_loop_running: heartbeatLoop.running,
            background_loop_running: backgroundLoop.running,
            heartbeat_sent: heartbeatLoop.sent,
            heartbeat_failed: heartbeatLoop.failed,
            last_heartbeat_at: heartbeatLoop.lastHeartbeatAt,
            background_ticks: backgroundLoop.ticks,
            background_failures: backgroundLoop.failures,
            background_last_run_at: backgroundLoop.lastRunAt,
            task_queue_depth: workerLoop.queuedTasks.length,
            active_task_slots: workerLoop.activeTaskIds.size,
            max_concurrent_tasks: maxConcurrentTasks,
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
            active_task_leases: getActiveLeaseCount(),
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

    app.get('/runtime/session-state', async () => {
        return {
            restored: restoredWorkspaceSessionState,
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

            const restoredSession = await workspaceSessionFetcher({
                config: runtimeConfig,
                env,
            });
            restoredWorkspaceSessionState = restoredSession;
            if (restoredSession) {
                emitRuntimeEvent('runtime.workspace_session_restored', runtimeConfig, {
                    source: restoredSession.source,
                    version: restoredSession.version,
                    state_keys: Object.keys(restoredSession.state),
                });
            } else {
                emitRuntimeEvent('runtime.workspace_session_restore_skipped', runtimeConfig, {
                    reason: 'session_state_unavailable',
                });
            }

            const workspaceLlmConfig = await llmConfigFetcher({
                config: runtimeConfig,
                env,
            });
            if (workspaceLlmConfig) {
                activeModelProvider = workspaceLlmConfig.provider;
                llmDecisionResolver =
                    options.llmDecisionResolver
                    ?? createLlmDecisionResolverFromConfig(workspaceLlmConfig)
                    ?? createLlmDecisionResolver(env);
                emitRuntimeEvent('runtime.llm_config_loaded', runtimeConfig, {
                    provider: workspaceLlmConfig.provider,
                    source: 'workspace_config',
                });
            } else {
                activeModelProvider = env.AF_MODEL_PROVIDER ?? env.AGENTFARM_MODEL_PROVIDER ?? 'agentfarm';
                llmDecisionResolver = options.llmDecisionResolver ?? createLlmDecisionResolver(env);
                emitRuntimeEvent('runtime.llm_config_loaded', runtimeConfig, {
                    provider: activeModelProvider,
                    source: 'env_fallback',
                });
            }

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
            startBackgroundLoop(runtimeConfig);

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
                session_state_source: restoredSession?.source ?? null,
                session_state_version: restoredSession?.version ?? null,
                session_state_keys: restoredSession ? Object.keys(restoredSession.state) : [],
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

    app.post<{
        Body: {
            task_id?: string;
            idempotency_key?: string;
            claimed_by?: string;
            lease_ttl_seconds?: number;
            correlation_id?: string;
        };
    }>('/tasks/claim', async (request, reply) => {
        if (!startupCompleted || (runtimeState !== 'active' && runtimeState !== 'degraded')) {
            return reply.code(409).send({
                error: 'runtime_not_ready',
                state: runtimeState,
            });
        }

        const taskId = request.body?.task_id?.trim();
        const idempotencyKey = request.body?.idempotency_key?.trim();
        if (!taskId || !idempotencyKey) {
            return reply.code(400).send({
                error: 'invalid_lease_claim',
                message: 'task_id and idempotency_key are required',
            });
        }

        const taskExists = workerLoop.queuedTasks.some((entry) => entry.taskId === taskId);
        if (!taskExists) {
            return reply.code(404).send({
                error: 'task_not_found',
                message: `Task ${taskId} is not queued`,
            });
        }

        const nowMs = now();
        const existingByIdempotency = taskLeaseStore.byIdempotencyKey.get(idempotencyKey);
        if (existingByIdempotency) {
            const normalized = expireLeaseIfNeeded(existingByIdempotency, nowMs);
            if (normalized.taskId !== taskId) {
                return reply.code(409).send({
                    error: 'idempotency_conflict',
                    message: 'idempotency_key is already bound to another task',
                    lease_id: normalized.leaseId,
                    task_id: normalized.taskId,
                });
            }

            if (isLeaseClaimedAndActive(normalized, nowMs)) {
                return reply.code(200).send({
                    status: 'already_claimed',
                    task_id: taskId,
                    lease_id: normalized.leaseId,
                    expires_at: new Date(normalized.expiresAt).toISOString(),
                });
            }
        }

        const existingByTask = taskLeaseStore.byTaskId.get(taskId);
        if (existingByTask) {
            const normalized = expireLeaseIfNeeded(existingByTask, nowMs);
            if (isLeaseClaimedAndActive(normalized, nowMs) && normalized.idempotencyKey !== idempotencyKey) {
                return reply.code(409).send({
                    error: 'task_already_claimed',
                    message: 'Task is currently claimed by another lease',
                    lease_id: normalized.leaseId,
                    claimed_by: normalized.claimedBy,
                    expires_at: new Date(normalized.expiresAt).toISOString(),
                });
            }
        }

        const activeConfig = configCache ?? buildConfig(env);
        const requestedTtl =
            typeof request.body?.lease_ttl_seconds === 'number' && Number.isFinite(request.body.lease_ttl_seconds)
                ? Math.floor(request.body.lease_ttl_seconds)
                : activeConfig.defaultTaskLeaseTtlSeconds;
        const leaseTtlSeconds = Math.min(
            MAX_TASK_LEASE_TTL_SECONDS,
            Math.max(MIN_TASK_LEASE_TTL_SECONDS, requestedTtl),
        );

        const lease: RuntimeTaskLease = {
            leaseId: `${taskId}:${nowMs}`,
            taskId,
            tenantId: activeConfig.tenantId,
            workspaceId: activeConfig.workspaceId,
            idempotencyKey,
            status: 'claimed',
            claimedBy: request.body?.claimed_by?.trim() || activeConfig.botId,
            claimedAt: nowMs,
            expiresAt: nowMs + (leaseTtlSeconds * 1000),
            correlationId: request.body?.correlation_id?.trim() || activeConfig.correlationId,
        };

        taskLeaseStore.byTaskId.set(taskId, lease);
        taskLeaseStore.byIdempotencyKey.set(idempotencyKey, lease);
        enqueueTaskLeaseMetadata(taskId, lease);

        emitRuntimeEvent('runtime.task_lease_claimed', activeConfig, {
            task_id: taskId,
            lease_id: lease.leaseId,
            idempotency_key: idempotencyKey,
            claimed_by: lease.claimedBy,
            expires_at: new Date(lease.expiresAt).toISOString(),
        });

        return reply.code(200).send({
            status: 'claimed',
            task_id: taskId,
            lease_id: lease.leaseId,
            claimed_by: lease.claimedBy,
            expires_at: new Date(lease.expiresAt).toISOString(),
        });
    });

    app.post<{
        Params: { taskId: string };
        Body: {
            lease_id?: string;
            idempotency_key?: string;
            requested_by?: string;
            lease_ttl_seconds?: number;
        };
    }>('/tasks/:taskId/lease/renew', async (request, reply) => {
        if (!startupCompleted || (runtimeState !== 'active' && runtimeState !== 'degraded')) {
            return reply.code(409).send({
                error: 'runtime_not_ready',
                state: runtimeState,
            });
        }

        const taskId = request.params.taskId?.trim();
        const lease = taskId ? taskLeaseStore.byTaskId.get(taskId) : undefined;
        if (!taskId || !lease) {
            return reply.code(404).send({
                error: 'lease_not_found',
                message: 'No lease found for task',
            });
        }

        if (request.body?.lease_id && request.body.lease_id !== lease.leaseId) {
            return reply.code(409).send({
                error: 'lease_conflict',
                message: 'lease_id does not match current lease',
            });
        }

        if (request.body?.idempotency_key && request.body.idempotency_key !== lease.idempotencyKey) {
            return reply.code(409).send({
                error: 'lease_conflict',
                message: 'idempotency_key does not match current lease',
            });
        }

        const nowMs = now();
        const normalized = expireLeaseIfNeeded(lease, nowMs);
        if (!isLeaseClaimedAndActive(normalized, nowMs)) {
            return reply.code(409).send({
                error: 'lease_not_active',
                message: 'Only active claimed leases can be renewed',
                lease_status: normalized.status,
            });
        }

        const activeConfig = configCache ?? buildConfig(env);
        const requestedTtl =
            typeof request.body?.lease_ttl_seconds === 'number' && Number.isFinite(request.body.lease_ttl_seconds)
                ? Math.floor(request.body.lease_ttl_seconds)
                : activeConfig.defaultTaskLeaseTtlSeconds;
        const leaseTtlSeconds = Math.min(
            MAX_TASK_LEASE_TTL_SECONDS,
            Math.max(MIN_TASK_LEASE_TTL_SECONDS, requestedTtl),
        );

        const renewed: RuntimeTaskLease = {
            ...normalized,
            expiresAt: nowMs + (leaseTtlSeconds * 1000),
            lastRenewedAt: nowMs,
        };

        taskLeaseStore.byTaskId.set(taskId, renewed);
        taskLeaseStore.byIdempotencyKey.set(renewed.idempotencyKey, renewed);
        enqueueTaskLeaseMetadata(taskId, renewed);

        emitRuntimeEvent('runtime.task_lease_renewed', activeConfig, {
            task_id: taskId,
            lease_id: renewed.leaseId,
            requested_by: request.body?.requested_by?.trim() || activeConfig.botId,
            expires_at: new Date(renewed.expiresAt).toISOString(),
        });

        return reply.code(200).send({
            status: 'renewed',
            task_id: taskId,
            lease_id: renewed.leaseId,
            expires_at: new Date(renewed.expiresAt).toISOString(),
        });
    });

    app.post<{
        Params: { taskId: string };
        Body: {
            lease_id?: string;
            idempotency_key?: string;
            requested_by?: string;
        };
    }>('/tasks/:taskId/lease/release', async (request, reply) => {
        if (!startupCompleted || (runtimeState !== 'active' && runtimeState !== 'degraded')) {
            return reply.code(409).send({
                error: 'runtime_not_ready',
                state: runtimeState,
            });
        }

        const taskId = request.params.taskId?.trim();
        const lease = taskId ? taskLeaseStore.byTaskId.get(taskId) : undefined;
        if (!taskId || !lease) {
            return reply.code(404).send({
                error: 'lease_not_found',
                message: 'No lease found for task',
            });
        }

        if (request.body?.lease_id && request.body.lease_id !== lease.leaseId) {
            return reply.code(409).send({
                error: 'lease_conflict',
                message: 'lease_id does not match current lease',
            });
        }

        if (request.body?.idempotency_key && request.body.idempotency_key !== lease.idempotencyKey) {
            return reply.code(409).send({
                error: 'lease_conflict',
                message: 'idempotency_key does not match current lease',
            });
        }

        const nowMs = now();
        const normalized = expireLeaseIfNeeded(lease, nowMs);
        if (normalized.status === 'released') {
            return reply.code(200).send({
                status: 'already_released',
                task_id: taskId,
                lease_id: normalized.leaseId,
            });
        }

        if (normalized.status === 'expired') {
            return reply.code(409).send({
                error: 'lease_not_active',
                message: 'Expired leases cannot be released',
            });
        }

        const released: RuntimeTaskLease = {
            ...normalized,
            status: 'released',
            releasedAt: nowMs,
        };
        taskLeaseStore.byTaskId.set(taskId, released);
        taskLeaseStore.byIdempotencyKey.set(released.idempotencyKey, released);
        enqueueTaskLeaseMetadata(taskId, released);

        const activeConfig = configCache ?? buildConfig(env);
        emitRuntimeEvent('runtime.task_lease_released', activeConfig, {
            task_id: taskId,
            lease_id: released.leaseId,
            requested_by: request.body?.requested_by?.trim() || activeConfig.botId,
        });

        return reply.code(200).send({
            status: 'released',
            task_id: taskId,
            lease_id: released.leaseId,
            released_at: new Date(nowMs).toISOString(),
        });
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

        const scopeCheck = advancedFeatures.validateTaskScope(request.body?.payload ?? {});
        if (!scopeCheck.allowed) {
            return reply.code(403).send({
                error: 'scope_constraint_blocked',
                out_of_scope_paths: scopeCheck.outOfScopePaths,
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

    const getPendingApprovalBatches = (): PendingApprovalBatch[] => {
        const grouped = new Map<string, PendingApprovalBatch>();
        for (const pending of workerLoop.pendingApprovals) {
            const batchKey = `${pending.riskLevel}:${pending.actionType}`;
            const existing = grouped.get(batchKey);
            if (existing) {
                existing.taskIds.push(pending.taskId);
                existing.pendingCount += 1;
                existing.escalatedCount += pending.escalated ? 1 : 0;
                existing.oldestEnqueuedAt = Math.min(existing.oldestEnqueuedAt, pending.enqueuedAt);
                existing.newestEnqueuedAt = Math.max(existing.newestEnqueuedAt, pending.enqueuedAt);
                continue;
            }

            grouped.set(batchKey, {
                batchId: createHash('sha1').update(batchKey).digest('hex').slice(0, 16),
                batchKey,
                riskLevel: pending.riskLevel,
                actionType: pending.actionType,
                pendingCount: 1,
                taskIds: [pending.taskId],
                escalatedCount: pending.escalated ? 1 : 0,
                oldestEnqueuedAt: pending.enqueuedAt,
                newestEnqueuedAt: pending.enqueuedAt,
            });
        }

        return Array.from(grouped.values())
            .sort((a, b) => a.oldestEnqueuedAt - b.oldestEnqueuedAt);
    };

    const resolvePendingApproval = async (input: ResolvePendingApprovalInput): Promise<ResolvePendingApprovalResult> => {
        const pendingIndex = workerLoop.pendingApprovals.findIndex((pending) => pending.taskId === input.taskId);
        if (pendingIndex < 0) {
            return {
                ok: false,
                statusCode: 404,
                error: 'approval_not_found',
                message: `No pending approval found for task_id ${input.taskId}`,
            };
        }

        if (input.selectedOptionId) {
            const pending = workerLoop.pendingApprovals[pendingIndex];
            const knownOption = pending?.escalationOptions.some((option) => option.optionId === input.selectedOptionId);
            if (!knownOption) {
                return {
                    ok: false,
                    statusCode: 400,
                    error: 'invalid_selected_option',
                    message: `selected_option_id ${input.selectedOptionId} is not valid for task_id ${input.taskId}`,
                };
            }
        }

        const [resolved] = workerLoop.pendingApprovals.splice(pendingIndex, 1);
        if (!resolved) {
            return {
                ok: false,
                statusCode: 404,
                error: 'approval_not_found',
                message: `No pending approval found for task_id ${input.taskId}`,
            };
        }

        const latencyMs = Math.max(0, now() - resolved.enqueuedAt);
        weeklyRoiAccumulator.approvalLatencyTotalMs += latencyMs;
        weeklyRoiAccumulator.approvalLatencySamples += 1;
        workerLoop.approvalResolvedTasks += 1;
        if (input.decision === 'approved') {
            workerLoop.approvalApprovedTasks += 1;
        } else {
            workerLoop.approvalRejectedTasks += 1;
        }

        emitRuntimeEvent('runtime.approval_decision_received', configCache, {
            task_id: input.taskId,
            decision: input.decision,
            actor: input.actor,
            reason: input.reason,
            was_escalated: resolved.escalated,
            risk_level: resolved.riskLevel,
            selected_option_id: input.selectedOptionId,
            pending_approval_tasks: workerLoop.pendingApprovals.length,
        });

        if (input.decision === 'approved') {
            advancedFeatures.approvePlan(input.taskId, input.actor || 'runtime-approver', input.reason ?? undefined);
            workerLoop.approvedDecisionCache.set(input.taskId, {
                decision: 'approved',
                decidedAt: now(),
                actor: input.actor || null,
                reason: input.reason,
            });

            const approvedResult = await executeApprovedTask(
                resolved.task,
                configCache as RuntimeConfig,
                'approval_decision_webhook',
                resolved.payloadOverrideSource,
            );
            workerLoop.processedTasks += 1;
            workerLoop.retriedAttempts += approvedResult.transientRetries;

            if (approvedResult.status === 'success') {
                workerLoop.succeededTasks += 1;
                emitRuntimeEvent('runtime.task_processed', configCache, {
                    task_id: input.taskId,
                    queue_depth: workerLoop.queuedTasks.length,
                    processed_tasks: workerLoop.processedTasks,
                    retries: approvedResult.transientRetries,
                    attempts: approvedResult.attempts,
                    source: 'approval_decision_webhook',
                });
            } else {
                workerLoop.failedTasks += 1;
                emitRuntimeEvent('runtime.task_failed', configCache, {
                    task_id: input.taskId,
                    attempts: approvedResult.attempts,
                    retries: approvedResult.transientRetries,
                    failure_class: approvedResult.failureClass ?? 'runtime_exception',
                    error_message: approvedResult.errorMessage ?? null,
                    source: 'approval_decision_webhook',
                });
            }

            await persistActionResultRecord(resolved.task, configCache as RuntimeConfig, approvedResult);

            emitRuntimeEvent('runtime.bot_notification_sent', configCache, {
                task_id: input.taskId,
                decision: input.decision,
                channel: 'decision_webhook',
                actor: input.actor,
            });

            return {
                ok: true,
                taskId: input.taskId,
                decision: input.decision,
                executionStatus: approvedResult.status,
                wasEscalated: resolved.escalated,
                selectedOptionId: input.selectedOptionId,
                pendingApprovalTasks: workerLoop.pendingApprovals.length,
            };
        }

        await persistCancelledApprovalRecord({
            task: resolved.task,
            actionType: resolved.actionType,
            riskLevel: resolved.riskLevel,
            reason: input.reason,
        }, configCache as RuntimeConfig);

        emitRuntimeEvent('runtime.task_cancelled', configCache, {
            task_id: input.taskId,
            action_type: resolved.actionType,
            decision: input.decision,
            reason: input.reason,
            selected_option_id: input.selectedOptionId,
        });

        emitRuntimeEvent('runtime.bot_notification_sent', configCache, {
            task_id: input.taskId,
            decision: input.decision,
            channel: 'decision_webhook',
            actor: input.actor,
        });

        return {
            ok: true,
            taskId: input.taskId,
            decision: input.decision,
            executionStatus: 'cancelled',
            wasEscalated: resolved.escalated,
            selectedOptionId: input.selectedOptionId,
            pendingApprovalTasks: workerLoop.pendingApprovals.length,
        };
    };

    app.get('/decision/batches', async (_request, reply) => {
        if (!startupCompleted || (runtimeState !== 'active' && runtimeState !== 'degraded')) {
            return reply.code(409).send({
                error: 'runtime_not_ready',
                state: runtimeState,
            });
        }

        return {
            pending_batches: getPendingApprovalBatches().map((batch) => ({
                batch_id: batch.batchId,
                batch_key: batch.batchKey,
                risk_level: batch.riskLevel,
                action_type: batch.actionType,
                pending_count: batch.pendingCount,
                task_ids: batch.taskIds,
                escalated_count: batch.escalatedCount,
                oldest_enqueued_at: new Date(batch.oldestEnqueuedAt).toISOString(),
                newest_enqueued_at: new Date(batch.newestEnqueuedAt).toISOString(),
            })),
        };
    });

    app.post<{ Body: { batch_id?: string; batch_key?: string; decision?: string; reason?: string; actor?: string } }>('/decision/batch', async (request, reply) => {
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

        const decision = request.body?.decision as ApprovalDecision | undefined;
        if (decision !== 'approved' && decision !== 'rejected' && decision !== 'timeout_rejected') {
            return reply.code(400).send({
                error: 'invalid_decision',
                message: 'decision must be one of approved, rejected, timeout_rejected',
            });
        }

        const batchId = request.body?.batch_id?.trim() || null;
        const batchKey = request.body?.batch_key?.trim() || null;
        if (!batchId && !batchKey) {
            return reply.code(400).send({
                error: 'invalid_batch',
                message: 'batch_id or batch_key is required.',
            });
        }

        const batches = getPendingApprovalBatches();
        const targetBatch = batches.find((batch) => (batchId ? batch.batchId === batchId : false) || (batchKey ? batch.batchKey === batchKey : false));
        if (!targetBatch) {
            return reply.code(404).send({
                error: 'batch_not_found',
                message: 'No pending approval batch found for the provided identifier.',
            });
        }

        const actor = request.body?.actor?.trim() || 'batch_approver';
        const reason = request.body?.reason?.trim() || null;
        const results: Array<{ task_id: string; decision: ApprovalDecision; execution_status: 'success' | 'failed' | 'approval_required' | 'cancelled' }> = [];
        const taskIds = [...targetBatch.taskIds];
        for (const taskId of taskIds) {
            const resolved = await resolvePendingApproval({
                taskId,
                decision,
                actor,
                reason,
                selectedOptionId: null,
            });
            if (!resolved.ok) {
                continue;
            }
            results.push({
                task_id: resolved.taskId,
                decision: resolved.decision,
                execution_status: resolved.executionStatus,
            });
        }

        emitRuntimeEvent('runtime.approval_batch_decision_received', configCache, {
            batch_id: targetBatch.batchId,
            batch_key: targetBatch.batchKey,
            decision,
            actor,
            requested_count: taskIds.length,
            resolved_count: results.length,
            pending_approval_tasks: workerLoop.pendingApprovals.length,
        });

        return {
            status: 'resolved',
            batch_id: targetBatch.batchId,
            batch_key: targetBatch.batchKey,
            decision,
            requested_count: taskIds.length,
            resolved_count: results.length,
            results,
            pending_approval_tasks: workerLoop.pendingApprovals.length,
        };
    });

    app.post<{ Body: { task_id?: string; decision?: string; reason?: string; actor?: string; selected_option_id?: string } }>('/decision', async (request, reply) => {
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

        const selectedOptionId = request.body?.selected_option_id?.trim() || null;
        const resolved = await resolvePendingApproval({
            taskId,
            decision,
            actor: request.body?.actor?.trim() || 'unknown',
            reason: request.body?.reason?.trim() || null,
            selectedOptionId,
        });
        if (!resolved.ok) {
            return reply.code(resolved.statusCode).send({
                error: resolved.error,
                message: resolved.message,
            });
        }

        return {
            status: 'resolved',
            task_id: resolved.taskId,
            decision: resolved.decision,
            execution_status: resolved.executionStatus,
            was_escalated: resolved.wasEscalated,
            selected_option_id: resolved.selectedOptionId,
            pending_approval_tasks: resolved.pendingApprovalTasks,
        };
    });

    app.get<{ Querystring: { generate?: string } }>('/runtime/reports/weekly-quality-roi', async (request) => {
        const shouldGenerate = request.query?.generate === 'true';
        if (shouldGenerate || !weeklyRoiAccumulator.lastReport) {
            generateWeeklyQualityRoiReport(configCache, 'manual');
        }

        return {
            cadence_ms: weeklyReportCadenceMs,
            report_count: weeklyRoiAccumulator.reportCount,
            last_generated_at: weeklyRoiAccumulator.lastGeneratedAtMs
                ? new Date(weeklyRoiAccumulator.lastGeneratedAtMs).toISOString()
                : null,
            period_started_at: new Date(weeklyRoiAccumulator.periodStartedAtMs).toISOString(),
            report: weeklyRoiAccumulator.lastReport,
        };
    });

    app.get<{ Params: { sessionId: string } }>('/runtime/observability/sessions/:sessionId/actions', async (request, reply) => {
        const sessionId = request.params.sessionId?.trim();
        if (!sessionId) {
            return reply.code(400).send({
                error: 'invalid_session_id',
                message: 'sessionId path parameter is required.',
            });
        }

        try {
            const writer = getAuditLogWriter();
            const actions = writer.listSession(sessionId);
            return {
                session_id: sessionId,
                count: actions.length,
                actions: actions.map((entry) => ({
                    id: entry.actionId,
                    agent_id: entry.agentId,
                    workspace_id: entry.workspaceId,
                    task_id: entry.taskId,
                    session_id: entry.sessionId,
                    action_type: entry.actionType,
                    target: entry.target,
                    payload: entry.payload,
                    screenshot_before_url: entry.screenshotBefore,
                    screenshot_after_url: entry.screenshotAfter,
                    dom_snapshot_before: entry.domSnapshotBefore ?? null,
                    dom_snapshot_after: entry.domSnapshotAfter ?? null,
                    dom_snapshot_hash: entry.domSnapshotHash ?? null,
                    network_requests: entry.networkRequests ?? [],
                    evidence_bundle: entry.evidenceBundle ?? null,
                    risk_level: entry.riskLevel,
                    success: entry.success,
                    verified: entry.verified,
                    error_message: entry.errorMessage ?? null,
                    started_at: entry.startedAt.toISOString(),
                    completed_at: entry.completedAt.toISOString(),
                    duration_ms: entry.durationMs,
                })),
            };
        } catch (error) {
            return reply.code(500).send({
                error: 'observability_lookup_failed',
                message: error instanceof Error ? error.message : 'Failed to load observability events.',
            });
        }
    });

    app.get<{ Params: { sessionId: string } }>('/v1/audit/sessions/:sessionId/actions', async (request, reply) => {
        const sessionId = request.params.sessionId?.trim();
        if (!sessionId) {
            return reply.code(400).send({
                error: 'invalid_session_id',
                message: 'sessionId path parameter is required.',
            });
        }

        try {
            const actions = getAuditLogWriter().listSession(sessionId);
            return reply.send({ sessionId, actions });
        } catch (error) {
            return reply.code(500).send({
                error: 'audit_lookup_failed',
                message: error instanceof Error ? error.message : 'Failed to load audit actions.',
            });
        }
    });

    app.post<{
        Body: {
            provider?: string;
            model?: string;
            action_type?: string;
            correctness_score?: number;
            verified_actions?: number;
            total_actions?: number;
            assertion_passed?: number;
            assertion_total?: number;
            source?: string;
            reason?: string;
            metadata?: Record<string, unknown>;
            task_id?: string;
            correlation_id?: string;
        };
    }>('/runtime/quality/correctness', async (request, reply) => {
        if (!startupCompleted || (runtimeState !== 'active' && runtimeState !== 'degraded')) {
            return reply.code(409).send({
                error: 'runtime_not_ready',
                state: runtimeState,
            });
        }

        const provider = request.body?.provider?.trim();
        const actionType = request.body?.action_type?.trim() || 'workspace_observed_action';
        const source = parseQualitySignalSource(request.body?.source ?? 'runtime_outcome');

        if (!provider || !source) {
            return reply.code(400).send({
                error: 'invalid_quality_correctness',
                message: 'provider and a valid source are required.',
            });
        }

        let score: number | null = null;
        const directScore = request.body?.correctness_score;
        if (typeof directScore === 'number' && Number.isFinite(directScore)) {
            const normalized = directScore > 1 ? directScore / 100 : directScore;
            score = Math.max(0, Math.min(1, normalized));
        }

        const totalActions = request.body?.total_actions;
        const verifiedActions = request.body?.verified_actions;
        if (
            score === null
            && typeof totalActions === 'number'
            && typeof verifiedActions === 'number'
            && Number.isFinite(totalActions)
            && Number.isFinite(verifiedActions)
            && totalActions > 0
        ) {
            score = Math.max(0, Math.min(1, verifiedActions / totalActions));
        }

        const assertionTotal = request.body?.assertion_total;
        const assertionPassed = request.body?.assertion_passed;
        if (
            score === null
            && typeof assertionTotal === 'number'
            && typeof assertionPassed === 'number'
            && Number.isFinite(assertionTotal)
            && Number.isFinite(assertionPassed)
            && assertionTotal > 0
        ) {
            score = Math.max(0, Math.min(1, assertionPassed / assertionTotal));
        }

        if (score === null || !configCache) {
            return reply.code(400).send({
                error: 'invalid_quality_correctness',
                message: 'Provide correctness_score, or verified_actions/total_actions, or assertion_passed/assertion_total.',
            });
        }

        const signal = recordQualitySignal({
            provider,
            model: request.body?.model,
            actionType,
            score,
            signal: 'action_succeeded',
            source,
            reason: request.body?.reason ?? 'runtime_correctness_signal',
            metadata: {
                ...(request.body?.metadata ?? {}),
                verified_actions: request.body?.verified_actions ?? null,
                total_actions: request.body?.total_actions ?? null,
                assertion_passed: request.body?.assertion_passed ?? null,
                assertion_total: request.body?.assertion_total ?? null,
            },
            taskId: request.body?.task_id,
            correlationId: request.body?.correlation_id ?? configCache.correlationId,
        });

        if (!signal) {
            return reply.code(500).send({
                error: 'quality_signal_record_failed',
                message: 'Unable to persist correctness signal.',
            });
        }

        const qualitySignalRecord: QualitySignalRecord = {
            id: signal.id,
            contractVersion: CONTRACT_VERSIONS.QUALITY_SIGNAL,
            tenantId: configCache.tenantId,
            workspaceId: configCache.workspaceId,
            botId: configCache.botId,
            provider: signal.provider,
            model: signal.model,
            actionType: signal.actionType,
            score: signal.score,
            signal: signal.signal,
            weight: signal.weight,
            source: signal.source,
            reason: signal.reason,
            metadata: signal.metadata,
            correlationId: signal.correlationId ?? configCache.correlationId,
            observedAt: signal.observedAt,
        };

        return reply.code(201).send({
            quality_signal: qualitySignalRecord,
            source: signal.source,
            task_id: signal.taskId ?? null,
        });
    });

    app.post<{
        Body: {
            provider?: string;
            model?: string;
            action_type?: string;
            score?: number;
            signal?: QualitySignalType;
            weight?: number;
            reason?: string;
            source?: string;
            metadata?: Record<string, unknown>;
            task_id?: string;
            correlation_id?: string;
        };
    }>('/runtime/quality/signals', async (request, reply) => {
        if (!startupCompleted || (runtimeState !== 'active' && runtimeState !== 'degraded')) {
            return reply.code(409).send({
                error: 'runtime_not_ready',
                state: runtimeState,
            });
        }

        const provider = request.body?.provider?.trim();
        const actionType = request.body?.action_type?.trim();
        const score = request.body?.score;
        const signalType = request.body?.signal;
        const source = parseQualitySignalSource(request.body?.source ?? 'manual');
        const hasScore = typeof score === 'number' && Number.isFinite(score);
        const hasSignal = signalType === 'action_approved'
            || signalType === 'action_rejected'
            || signalType === 'action_escalated'
            || signalType === 'action_succeeded'
            || signalType === 'action_retried';
        if (!provider || !actionType || !source || (!hasScore && !hasSignal)) {
            return reply.code(400).send({
                error: 'invalid_quality_signal',
                message: 'provider, action_type, and either score or signal with a valid source are required.',
            });
        }

        const signal = recordQualitySignal({
            provider,
            model: request.body?.model,
            actionType,
            score,
            signal: signalType,
            weight: request.body?.weight,
            source,
            reason: request.body?.reason,
            metadata:
                typeof request.body?.metadata === 'object' && request.body?.metadata !== null
                    ? request.body.metadata
                    : undefined,
            taskId: request.body?.task_id,
            correlationId: request.body?.correlation_id ?? configCache?.correlationId,
        });

        if (!signal || !configCache) {
            return reply.code(500).send({
                error: 'quality_signal_record_failed',
                message: 'Unable to persist quality signal.',
            });
        }

        const qualitySignalRecord: QualitySignalRecord = {
            id: signal.id,
            contractVersion: CONTRACT_VERSIONS.QUALITY_SIGNAL,
            tenantId: configCache.tenantId,
            workspaceId: configCache.workspaceId,
            botId: configCache.botId,
            provider: signal.provider,
            model: signal.model,
            actionType: signal.actionType,
            score: signal.score,
            signal: signal.signal,
            weight: signal.weight,
            source: signal.source,
            reason: signal.reason,
            metadata: signal.metadata,
            correlationId: signal.correlationId ?? configCache.correlationId,
            observedAt: signal.observedAt,
        };

        return reply.code(201).send({
            quality_signal: qualitySignalRecord,
            source: signal.source,
            task_id: signal.taskId ?? null,
        });
    });

    app.get<{
        Querystring: {
            provider?: string;
            action_type?: string;
            source?: string;
            limit?: string;
        };
    }>('/runtime/quality/signals', async (request, reply) => {
        const source = request.query?.source ? parseQualitySignalSource(request.query.source) : null;
        if (request.query?.source && !source) {
            return reply.code(400).send({
                error: 'invalid_quality_source',
                message: 'source must be one of runtime_outcome, user_feedback, evaluator, manual.',
            });
        }

        const rawLimit = Number(request.query?.limit ?? '100');
        if (!Number.isFinite(rawLimit) || rawLimit <= 0) {
            return reply.code(400).send({
                error: 'invalid_limit',
                message: 'limit must be a positive integer',
            });
        }

        const signals = listQualitySignals({
            provider: request.query?.provider,
            actionType: request.query?.action_type,
            source: source ?? undefined,
            limit: Math.trunc(rawLimit),
        });

        return {
            count: signals.length,
            signals: signals.map((signal) => ({
                id: signal.id,
                provider: signal.provider,
                model: signal.model ?? null,
                action_type: signal.actionType,
                score: signal.score,
                signal: signal.signal ?? null,
                weight: signal.weight ?? null,
                source: signal.source,
                reason: signal.reason ?? null,
                metadata: signal.metadata ?? null,
                task_id: signal.taskId ?? null,
                correlation_id: signal.correlationId ?? null,
                observed_at: signal.observedAt,
            })),
        };
    });

    app.get<{
        Querystring: {
            provider?: string;
            action_type?: string;
        };
    }>('/runtime/quality/signals/summary', async (request) => {
        const summary = getQualitySignalSummary({
            provider: request.query?.provider,
            actionType: request.query?.action_type,
        });

        return {
            count: summary.length,
            summary: summary.map((entry) => ({
                provider: entry.provider,
                action_type: entry.actionType,
                average_score: entry.averageScore,
                sample_count: entry.sampleCount,
                penalty: getProviderQualityPenalty(entry.provider, entry.actionType),
                last_observed_at: entry.lastObservedAt,
            })),
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
        stopBackgroundLoop();

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
        stopBackgroundLoop();
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

    app.get<{ Querystring: { limit?: string } }>('/runtime/transcripts', async (request, reply) => {
        const rawLimit = Number(request.query?.limit ?? '50');
        if (!Number.isFinite(rawLimit) || rawLimit <= 0) {
            return reply.code(400).send({
                error: 'invalid_limit',
                message: 'limit must be a positive integer',
            });
        }

        const limit = Math.min(Math.trunc(rawLimit), MAX_TRANSCRIPTS);
        const slice = recentTranscripts.slice(Math.max(0, recentTranscripts.length - limit));
        return {
            count: slice.length,
            total_buffered: recentTranscripts.length,
            transcripts: slice,
        };
    });

    app.get<{ Querystring: { limit?: string } }>('/runtime/interview-events', async (request, reply) => {
        const rawLimit = Number(request.query?.limit ?? '200');
        if (!Number.isFinite(rawLimit) || rawLimit <= 0) {
            return reply.code(400).send({
                error: 'invalid_limit',
                message: 'limit must be a positive integer',
            });
        }

        const limit = Math.min(Math.trunc(rawLimit), MAX_INTERVIEW_EVENTS);
        const events = recentInterviewEvents.slice(Math.max(0, recentInterviewEvents.length - limit));
        return {
            count: events.length,
            total_buffered: recentInterviewEvents.length,
            events,
        };
    });

    app.get<{ Querystring: { limit?: string } }>('/runtime/traces', async (request, reply) => {
        const rawLimit = Number(request.query?.limit ?? '100');
        if (!Number.isFinite(rawLimit) || rawLimit <= 0) {
            return reply.code(400).send({
                error: 'invalid_limit',
                message: 'limit must be a positive integer',
            });
        }

        const traces = advancedFeatures.listTraces(rawLimit);
        return {
            count: traces.length,
            traces,
        };
    });

    app.get<{ Params: { taskId: string } }>('/runtime/traces/:taskId', async (request, reply) => {
        const trace = advancedFeatures.getTrace(request.params.taskId);
        if (!trace) {
            return reply.code(404).send({
                error: 'trace_not_found',
                message: `No trace found for task ${request.params.taskId}`,
            });
        }

        return {
            trace,
        };
    });

    app.post<{ Params: { taskId: string }; Body: { from_step?: number } }>('/runtime/traces/:taskId/replay', async (request, reply) => {
        const replay = advancedFeatures.replay(request.params.taskId, request.body?.from_step ?? 0);
        if (!replay.ok) {
            return reply.code(404).send({
                error: 'trace_not_found',
                message: `No trace found for task ${request.params.taskId}`,
            });
        }

        return {
            status: 'replayed',
            task_id: request.params.taskId,
            replayed_steps: replay.replayed,
        };
    });

    app.post<{ Body: { blocked_actions?: string[]; sample_size?: number } }>('/runtime/policy/simulate', async (request, reply) => {
        const blockedActions = Array.isArray(request.body?.blocked_actions)
            ? request.body?.blocked_actions.filter((entry): entry is string => typeof entry === 'string')
            : [];

        if (blockedActions.length === 0) {
            return reply.code(400).send({
                error: 'invalid_policy_simulation',
                message: 'blocked_actions must contain at least one action',
            });
        }

        const traces = advancedFeatures
            .listTraces(request.body?.sample_size ?? 100)
            .map((trace) => ({
                actionType: trace.decision.actionType,
                status: trace.status ?? 'unknown',
            }));

        return {
            simulation: advancedFeatures.simulatePolicy({
                blockedActions,
                traces,
            }),
            blocked_actions: blockedActions,
        };
    });

    app.post<{ Body: { changed_files?: string[]; summary?: string } }>('/runtime/pr/review', async (request, reply) => {
        const changedFiles = Array.isArray(request.body?.changed_files)
            ? request.body?.changed_files.filter((entry): entry is string => typeof entry === 'string')
            : [];
        if (changedFiles.length === 0) {
            return reply.code(400).send({
                error: 'invalid_pr_review',
                message: 'changed_files must contain at least one path',
            });
        }

        return {
            review: advancedFeatures.computePrReview({
                changedFiles,
                summary: request.body?.summary,
            }),
        };
    });

    app.post<{ Body: { issue_number?: number; title?: string; body?: string } }>('/runtime/autopilot/issue-to-pr', async (request, reply) => {
        const issueNumber = request.body?.issue_number;
        const title = request.body?.title?.trim();
        if (!issueNumber || issueNumber <= 0 || !title) {
            return reply.code(400).send({
                error: 'invalid_issue_payload',
                message: 'issue_number and title are required',
            });
        }

        return {
            autopilot: advancedFeatures.buildIssueToPrAutopilot({
                issueNumber,
                title,
                body: request.body?.body,
            }),
        };
    });

    app.get('/runtime/flaky-tests', async () => {
        return {
            flaky_signals: advancedFeatures.getFlakySignals(50),
        };
    });

    app.get('/runtime/advanced/status', async () => {
        return {
            control: advancedFeatures.getControlState(),
            traces: advancedFeatures.listTraces(20).length,
            background_loop_running: backgroundLoop.running,
            scope_constraint: advancedFeatures.getScopeConstraint(),
            active_policy_pack: advancedFeatures.getActivePolicyPack(),
            weekly_report: {
                cadence_ms: weeklyReportCadenceMs,
                report_count: weeklyRoiAccumulator.reportCount,
                last_generated_at: weeklyRoiAccumulator.lastGeneratedAtMs
                    ? new Date(weeklyRoiAccumulator.lastGeneratedAtMs).toISOString()
                    : null,
                period_started_at: new Date(weeklyRoiAccumulator.periodStartedAtMs).toISOString(),
            },
        };
    });

    app.get<{ Querystring: { limit?: string } }>('/runtime/plan/pending', async (request, reply) => {
        const rawLimit = Number(request.query?.limit ?? '100');
        if (!Number.isFinite(rawLimit) || rawLimit <= 0) {
            return reply.code(400).send({
                error: 'invalid_limit',
                message: 'limit must be a positive integer',
            });
        }

        const plans = advancedFeatures.listPendingPlans(rawLimit);
        return {
            count: plans.length,
            plans,
        };
    });

    app.get<{ Params: { taskId: string } }>('/runtime/plan/:taskId', async (request, reply) => {
        const plan = advancedFeatures.getPlanCheckpoint(request.params.taskId);
        if (!plan) {
            return reply.code(404).send({
                error: 'plan_not_found',
                message: `No plan checkpoint found for task ${request.params.taskId}`,
            });
        }

        return {
            plan,
        };
    });

    app.post<{ Params: { taskId: string }; Body: { actor?: string; reason?: string } }>('/runtime/plan/:taskId/approve', async (request, reply) => {
        const actor = request.body?.actor?.trim() || 'runtime-operator';
        const approved = advancedFeatures.approvePlan(request.params.taskId, actor, request.body?.reason);
        if (!approved) {
            return reply.code(404).send({
                error: 'plan_not_found',
                message: `No plan checkpoint found for task ${request.params.taskId}`,
            });
        }

        return {
            status: 'approved',
            plan: approved,
        };
    });

    app.post('/runtime/control/pause', async () => {
        return {
            status: 'paused',
            control: advancedFeatures.setPaused(true),
        };
    });

    app.post('/runtime/control/resume', async () => {
        return {
            status: 'resumed',
            control: advancedFeatures.setPaused(false),
        };
    });

    app.post('/runtime/control/step', async () => {
        return {
            status: 'single_step_armed',
            control: advancedFeatures.allowSingleStep(),
        };
    });

    app.post<{ Body: { include_paths?: string[] } }>('/runtime/control/scope', async (request, reply) => {
        const includePaths = Array.isArray(request.body?.include_paths)
            ? request.body.include_paths.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean)
            : [];
        if (includePaths.length === 0) {
            return reply.code(400).send({
                error: 'invalid_scope',
                message: 'include_paths must contain at least one path',
            });
        }

        return {
            status: 'scope_set',
            scope: advancedFeatures.setScopeConstraint(includePaths),
        };
    });

    app.delete('/runtime/control/scope', async () => {
        advancedFeatures.clearScopeConstraint();
        return {
            status: 'scope_cleared',
        };
    });

    app.get<{ Querystring: { task_id?: string } }>('/runtime/control/why', async (request, reply) => {
        const taskId = request.query?.task_id?.trim();
        if (!taskId) {
            return reply.code(400).send({
                error: 'invalid_task_id',
                message: 'task_id query parameter is required',
            });
        }

        return advancedFeatures.explainWhy(taskId);
    });

    app.get('/runtime/semantic-graph', async () => {
        return {
            graph: advancedFeatures.getSemanticGraph(process.cwd()),
        };
    });

    app.get<{ Querystring: { symbol?: string } }>('/runtime/semantic-graph/query', async (request, reply) => {
        const symbol = request.query?.symbol?.trim();
        if (!symbol) {
            return reply.code(400).send({
                error: 'invalid_symbol',
                message: 'symbol query parameter is required',
            });
        }

        return {
            result: advancedFeatures.querySemanticGraph(symbol),
        };
    });

    app.post<{ Body: { incident_id?: string; service?: string } }>('/runtime/incident/patch-pack', async (request, reply) => {
        const incidentId = request.body?.incident_id?.trim();
        const service = request.body?.service?.trim();
        if (!incidentId || !service) {
            return reply.code(400).send({
                error: 'invalid_incident_payload',
                message: 'incident_id and service are required',
            });
        }

        const traces = advancedFeatures.listTraces(100).map((trace) => ({
            taskId: trace.taskId,
            status: trace.status ?? 'unknown',
            actionType: trace.decision.actionType,
        }));

        return {
            patch_pack: advancedFeatures.generateIncidentPatchPack({
                incidentId,
                service,
                traces,
            }),
        };
    });

    app.get('/runtime/policy/packs', async () => {
        return {
            active_pack: advancedFeatures.getActivePolicyPack(),
            packs: advancedFeatures.listPolicyPacks(),
        };
    });

    app.post<{
        Body: {
            id?: string;
            name?: string;
            blocked_actions?: string[];
            blocked_command_patterns?: string[];
            max_allowed_block_rate?: number;
        };
    }>('/runtime/policy/packs', async (request, reply) => {
        const id = request.body?.id?.trim();
        const name = request.body?.name?.trim();
        if (!id || !name) {
            return reply.code(400).send({
                error: 'invalid_policy_pack',
                message: 'id and name are required',
            });
        }

        const pack = advancedFeatures.upsertPolicyPack({
            id,
            name,
            blockedActions: Array.isArray(request.body?.blocked_actions)
                ? request.body.blocked_actions.filter((entry): entry is string => typeof entry === 'string')
                : [],
            blockedCommandPatterns: Array.isArray(request.body?.blocked_command_patterns)
                ? request.body.blocked_command_patterns.filter((entry): entry is string => typeof entry === 'string')
                : [],
            maxAllowedBlockRate: request.body?.max_allowed_block_rate,
        });

        return {
            status: 'policy_pack_upserted',
            pack,
        };
    });

    app.post<{ Params: { packId: string }; Body: { sample_size?: number } }>('/runtime/policy/packs/:packId/simulate', async (request, reply) => {
        const sampleSize = Math.max(100, Math.min(500, Math.trunc(Number(request.body?.sample_size ?? 100))));
        const traces = advancedFeatures
            .listTraces(sampleSize)
            .map((trace) => ({
                actionType: trace.decision.actionType,
                status: trace.status ?? 'unknown',
            }));
        const simulation = advancedFeatures.simulatePolicyPack(request.params.packId, traces);
        if (!simulation) {
            return reply.code(404).send({
                error: 'policy_pack_not_found',
                message: `No policy pack found for id ${request.params.packId}`,
            });
        }

        return {
            simulation,
        };
    });

    app.post<{ Params: { packId: string } }>('/runtime/policy/packs/:packId/enable', async (request, reply) => {
        const result = advancedFeatures.enablePolicyPack(request.params.packId);
        if (!result.enabled) {
            return reply.code(409).send({
                error: 'policy_pack_enable_failed',
                reason: result.reason,
                active_pack_id: result.activePackId,
            });
        }

        return {
            status: 'policy_pack_enabled',
            active_pack_id: result.activePackId,
        };
    });

    app.get('/runtime/flaky-tests/triage', async () => {
        return {
            triage: advancedFeatures.triageFlakyTests(),
        };
    });

    app.post<{ Body: { issue_number?: number; title?: string; body?: string } }>('/runtime/autopilot/issue-to-pr/execute', async (request, reply) => {
        const issueNumber = request.body?.issue_number;
        const title = request.body?.title?.trim();
        if (!issueNumber || issueNumber <= 0 || !title) {
            return reply.code(400).send({
                error: 'invalid_issue_payload',
                message: 'issue_number and title are required',
            });
        }

        return {
            execution: advancedFeatures.buildIssueToPrExecution({
                issueNumber,
                title,
                body: request.body?.body,
            }),
        };
    });

    app.get('/runtime/marketplace/skills', async () => {
        return {
            skills: advancedFeatures.listMarketplaceSkills(),
        };
    });

    app.post<{ Body: { skill_id?: string; approved_permissions?: string[]; required_version?: string; pin_version?: string; workspace_key?: string } }>('/runtime/marketplace/install', async (request, reply) => {
        const skillId = request.body?.skill_id?.trim();
        const approvedPermissions = Array.isArray(request.body?.approved_permissions)
            ? request.body.approved_permissions.filter((entry): entry is string => typeof entry === 'string')
            : [];

        if (!skillId) {
            return reply.code(400).send({
                error: 'invalid_install_payload',
                message: 'skill_id is required',
            });
        }

        const installed = advancedFeatures.installMarketplaceSkill({
            skillId,
            approvedPermissions,
            requiredVersion: request.body?.required_version,
            pinVersion: request.body?.pin_version,
            workspaceKey: request.body?.workspace_key,
        });

        if (!installed.installed) {
            return reply.code(403).send({
                error: 'skill_install_denied',
                reason: installed.reason,
            });
        }

        return {
            status: 'installed',
            skill_id: skillId,
        };
    });

    app.post<{ Body: { skill_id?: string; workspace_key?: string } }>('/runtime/marketplace/uninstall', async (request, reply) => {
        const skillId = request.body?.skill_id?.trim();
        if (!skillId) {
            return reply.code(400).send({
                error: 'invalid_uninstall_payload',
                message: 'skill_id is required',
            });
        }

        const result = advancedFeatures.uninstallMarketplaceSkill({
            skillId,
            workspaceKey: request.body?.workspace_key,
        });
        if (!result.removed) {
            return reply.code(404).send({
                error: 'skill_uninstall_denied',
                reason: result.reason,
            });
        }

        return {
            status: 'uninstalled',
            skill_id: skillId,
        };
    });

    app.post<{ Body: { id?: string; name?: string; version?: string; permissions?: string[]; source?: string } }>('/runtime/marketplace/catalog/skills', async (request, reply) => {
        const id = request.body?.id?.trim();
        const name = request.body?.name?.trim();
        const version = request.body?.version?.trim();
        const permissions = Array.isArray(request.body?.permissions)
            ? request.body.permissions.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean)
            : [];

        if (!id || !name || !version) {
            return reply.code(400).send({
                error: 'invalid_catalog_payload',
                message: 'id, name, and version are required',
            });
        }

        const upserted = advancedFeatures.upsertMarketplaceSkill({
            id,
            name,
            version,
            permissions,
            source: request.body?.source,
        });
        return {
            status: upserted.updated ? 'updated' : 'created',
            skill: upserted.skill,
        };
    });

    app.delete<{ Params: { skillId: string } }>('/runtime/marketplace/catalog/skills/:skillId', async (request, reply) => {
        const skillId = request.params.skillId?.trim();
        if (!skillId) {
            return reply.code(400).send({
                error: 'invalid_skill_id',
                message: 'skillId path parameter is required',
            });
        }

        const removed = advancedFeatures.removeMarketplaceSkill(skillId);
        if (!removed.removed) {
            const status = removed.reason === 'builtin_skill_read_only' ? 403 : 404;
            return reply.code(status).send({
                error: 'skill_remove_denied',
                reason: removed.reason,
            });
        }

        return {
            status: 'removed',
            skill_id: skillId,
        };
    });

    app.get<{ Querystring: { limit?: string } }>('/runtime/marketplace/telemetry', async (request, reply) => {
        const rawLimit = Number(request.query?.limit ?? '100');
        if (!Number.isFinite(rawLimit) || rawLimit <= 0) {
            return reply.code(400).send({
                error: 'invalid_limit',
                message: 'limit must be a positive integer',
            });
        }

        return {
            events: advancedFeatures.listMarketplaceTelemetry(rawLimit),
        };
    });

    app.post<{ Body: { skill_id?: string; workspace_key?: string } }>('/runtime/marketplace/use', async (request, reply) => {
        const skillId = request.body?.skill_id?.trim();
        if (!skillId) {
            return reply.code(400).send({
                error: 'invalid_skill_id',
                message: 'skill_id is required',
            });
        }

        advancedFeatures.recordMarketplaceUsage({
            skillId,
            event: 'invoke',
            workspaceKey: request.body?.workspace_key?.trim() || 'default',
        });
        return {
            status: 'recorded',
            skill_id: skillId,
        };
    });

    app.post<{ Body: { skill_id?: string; inputs?: Record<string, unknown>; workspace_key?: string } }>('/runtime/marketplace/invoke', async (request, reply) => {
        const skillId = request.body?.skill_id?.trim();
        if (!skillId) {
            return reply.code(400).send({
                error: 'invalid_invoke_payload',
                message: 'skill_id is required',
            });
        }

        const inputs = typeof request.body?.inputs === 'object' && request.body.inputs !== null
            ? request.body.inputs as Record<string, unknown>
            : {};

        const output = advancedFeatures.executeInstalledSkill({
            skillId,
            inputs,
            workspaceKey: request.body?.workspace_key,
        });

        if (!output.ok && (output.result as Record<string, unknown>)?.['error'] === 'skill_not_installed') {
            return reply.code(404).send({
                error: 'skill_not_installed',
                skill_id: skillId,
            });
        }

        if (!output.ok && (output.result as Record<string, unknown>)?.['error'] === 'no_handler_registered') {
            return reply.code(501).send({
                error: 'no_handler_registered',
                skill_id: skillId,
            });
        }

        return output;
    });

    app.get<{ Querystring: { limit?: string } }>('/runtime/provenance/attestations', async (request, reply) => {
        const rawLimit = Number(request.query?.limit ?? '100');
        if (!Number.isFinite(rawLimit) || rawLimit <= 0) {
            return reply.code(400).send({
                error: 'invalid_limit',
                message: 'limit must be a positive integer',
            });
        }

        return {
            attestations: advancedFeatures.listProvenanceAttestations(rawLimit),
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
