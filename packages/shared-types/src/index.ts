// ============================================================================
// CONTRACT VERSIONING (Epic A4)
// ============================================================================
// Frozen 2026-04-30 — Contract versioning standard for cross-service compatibility
// All versioned payloads use semantic versioning: MAJOR.MINOR.PATCH
// Version changes trigger compatibility validation in CI and test lanes
export const CONTRACT_VERSIONS = {
  PROVISIONING: '1.0.0', // SignupProvisioningRequested, ProvisioningJobRecord
  RUNTIME: '1.0.0', // RuntimeInstanceRecord
  TASK_LEASE: '1.0.0', // TaskLeaseRecord
  BUDGET_DECISION: '1.0.0', // BudgetDecisionRecord
  CONNECTOR_ACTION: '1.0.0', // ConnectorActionRecord
  APPROVAL: '1.0.0', // ApprovalRecord
  ACTION: '1.0.0', // ActionRecord
  AUDIT_EVENT: '1.0.0', // AuditEventRecord
  GOVERNANCE_WORKFLOW: '1.0.0', // Governance workflow templates, instances, decisions
  PLUGIN_LOADING: '1.0.0', // External adapter/plugin manifest and load records
} as const;

export type ContractVersion = (typeof CONTRACT_VERSIONS)[keyof typeof CONTRACT_VERSIONS];

export interface ContractMeta {
  contractVersion: string;
  correlationId: string;
}

// Contract validator: ensures all versioned contracts have required metadata
export const validateContractMeta = (obj: unknown): obj is ContractMeta => {
  if (typeof obj !== 'object' || obj === null) return false;
  const meta = obj as Record<string, unknown>;
  return typeof meta.contractVersion === 'string' && typeof meta.correlationId === 'string';
};

export type RiskLevel = 'low' | 'medium' | 'high';

// Frozen 2026-04-21 — canonical source: planning/spec-azure-provisioning-workflow.md
export type ProvisioningJobStatus =
  | 'queued'
  | 'validating'
  | 'creating_resources'
  | 'bootstrapping_vm'
  | 'starting_container'
  | 'registering_runtime'
  | 'healthchecking'
  | 'completed'
  | 'failed'
  | 'cleanup_pending'
  | 'cleaned_up';

// Frozen 2026-04-21 — canonical source: planning/spec-docker-runtime-contract.md
export type RuntimeStatus =
  | 'created'
  | 'starting'
  | 'ready'
  | 'active'
  | 'degraded'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'failed';

export type TenantStatus =
  | 'pending'
  | 'provisioning'
  | 'ready'
  | 'degraded'
  | 'suspended'
  | 'terminated';

export type WorkspaceStatus =
  | 'pending'
  | 'provisioning'
  | 'ready'
  | 'degraded'
  | 'suspended'
  | 'failed';

export type BotStatus =
  | 'created'
  | 'bootstrapping'
  | 'connector_setup_required'
  | 'active'
  | 'paused'
  | 'failed';

export type RoleKey =
  | 'recruiter'
  | 'developer'
  | 'fullstack_developer'
  | 'tester'
  | 'business_analyst'
  | 'technical_writer'
  | 'content_writer'
  | 'sales_rep'
  | 'marketing_specialist'
  | 'corporate_assistant'
  | 'customer_support_executive'
  | 'project_manager_product_owner_scrum_master';

export type RoleSubscriptionStatus = 'active' | 'expired' | 'suspended';

export type ModelProfileKey = 'quality_first' | 'speed_first' | 'cost_balanced' | 'custom';

export type CapabilityLanguageTier = 'base' | 'pro' | 'enterprise';

export type CapabilityProviderMode = 'oss' | 'azure' | 'hybrid';

export type CapabilityAvatarProvider = 'none' | CapabilityProviderMode;

export type CapabilitySnapshotSource = 'runtime_freeze' | 'persisted_load' | 'manual_override';

export interface BotBrainConfig {
  roleSystemPromptVersion: string;
  roleToolPolicyVersion: string;
  roleRiskPolicyVersion: string;
  defaultModelProfile: ModelProfileKey;
  fallbackModelProfile: ModelProfileKey;
}

export interface RoleCatalogRecord {
  roleKey: RoleKey;
  displayName: string;
  roleVersion: string;
  description: string;
  defaultPolicyPackVersion: string;
  active: boolean;
}

export interface RoleCapabilityProfileRecord {
  id: string;
  roleKey: RoleKey;
  connectorTool: string;
  allowedActions: string[];
  allowedAuthMethods: string[];
  riskOverrides?: Record<string, unknown>;
}

export interface TenantRoleSubscriptionRecord {
  id: string;
  tenantId: string;
  roleKey: RoleKey;
  purchasedQuantity: number;
  status: RoleSubscriptionStatus;
  activeFrom: string;
  activeTo?: string;
}

export interface BotCapabilitySnapshotRecord {
  id: string;
  botId: string;
  roleKey: RoleKey;
  roleVersion: string;
  allowedConnectorTools: string[];
  allowedActions: string[];
  policyPackVersion: string;
  frozenAt: string;
  brainConfig: BotBrainConfig;
  // Optional during rollout to keep existing producers/consumers compatible.
  tenantId?: string;
  workspaceId?: string;
  supportedLanguages?: string[];
  defaultLanguage?: string;
  languageTier?: CapabilityLanguageTier;
  speechProvider?: CapabilityProviderMode;
  translationProvider?: CapabilityProviderMode;
  ttsProvider?: CapabilityProviderMode;
  avatarEnabled?: boolean;
  avatarStyle?: 'professional-neutral' | 'minimal-icon' | 'audio-only';
  avatarProvider?: CapabilityAvatarProvider;
  avatarLocale?: string;
  snapshotVersion?: number;
  snapshotChecksum?: string;
  source?: CapabilitySnapshotSource;
}

export interface LlmDecisionEnvelope {
  roleKey: RoleKey;
  proposedActions: Array<{
    connectorType: string;
    actionType: string;
    payload: Record<string, unknown>;
  }>;
  confidence: number;
  riskHints: RiskLevel[];
  reasonSummary: string;
}

export interface LlmExecutionMetadata {
  modelProvider: string;
  modelName: string;
  modelProfile: ModelProfileKey;
  promptVersion: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

export type ProviderFailoverReasonCode =
  | 'rate_limit'
  | 'auth_failure'
  | 'billing_disabled'
  | 'timeout'
  | 'provider_unavailable'
  | 'unclassified';

export type ProviderFailoverDisposition =
  | 'attempt_failed'
  | 'skipped_cooldown'
  | 'skipped_unconfigured';

export interface ProviderFailoverTraceRecord {
  provider: string;
  reasonCode: ProviderFailoverReasonCode;
  disposition: ProviderFailoverDisposition;
  occurredAt: string;
  detail?: string;
  cooldownUntil?: string | null;
}

export interface TenantRecord {
  id: string;
  name: string;
  status: TenantStatus;
}

export interface WorkspaceRecord {
  id: string;
  tenantId: string;
  name: string;
  status: WorkspaceStatus;
}

export interface BotRecord {
  id: string;
  workspaceId: string;
  name: string;
  status: BotStatus;
  roleKey?: RoleKey;
}

// Frozen 2026-04-30 — signup-to-provisioning transition contract with versioning
export interface SignupProvisioningRequested {
  contractVersion: string; // CONTRACT_VERSIONS.PROVISIONING
  tenantId: string;
  workspaceId: string;
  botId: string;
  planId: string;
  runtimeTier: string;
  roleType: string;
  correlationId: string;
  requestedAt: string;
  requestedBy: string;
  triggerSource: 'signup_complete';
}

// Frozen 2026-04-21 — canonical source: planning/spec-azure-provisioning-workflow.md
// Updated 2026-04-30 — added contractVersion for cross-service compatibility (Epic A4)
export interface ProvisioningJobRecord {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.PROVISIONING
  tenantId: string;
  workspaceId: string;
  botId: string;
  planId: string;
  runtimeTier: string;
  roleType: string;
  correlationId: string;
  triggerSource: string;
  status: ProvisioningJobStatus;
  failureReason?: string;
  remediationHint?: string;
  cleanupResult?: string;
  requestedAt: string;
  requestedBy: string;
  startedAt?: string;
  completedAt?: string;
}

// Frozen 2026-04-21 — canonical source: planning/spec-docker-runtime-contract.md
export interface RuntimeInstanceRecord {
  id: string;
  botId: string;
  workspaceId: string;
  tenantId: string;
  status: RuntimeStatus;
  contractVersion: string;
  endpoint?: string;
  heartbeatAt?: string;
  lastSeenAt?: string;
}

export type TaskLeaseStatus = 'available' | 'claimed' | 'released' | 'expired';

export interface TaskLeaseRecord {
  leaseId: string;
  taskId: string;
  tenantId: string;
  workspaceId: string;
  idempotencyKey: string;
  status: TaskLeaseStatus;
  claimedBy: string;
  claimedAt: string;
  expiresAt: string;
  correlationId?: string;
  releasedAt?: string;
  lastRenewedAt?: string;
}

// Frozen 2026-04-29 — Budget policy decision contract for hard-stop enforcement
export type BudgetDecisionType = 'allowed' | 'denied' | 'warning';

export type BudgetDenialReason =
  | 'daily_limit_exceeded'
  | 'monthly_limit_exceeded'
  | 'hard_stop_active'
  | 'insufficient_remaining'
  | 'budget_paused';

export type BudgetLimitScope = 'task_level' | 'tenant_daily' | 'tenant_monthly';

export interface BudgetDecisionRecord {
  id: string;
  tenantId: string;
  workspaceId: string;
  taskId: string;
  decision: BudgetDecisionType;
  denialReason?: BudgetDenialReason;
  limitScope: BudgetLimitScope;
  limitType: string;
  limitValue: number;
  currentSpend: number;
  remainingBudget: number;
  isHardStopActive: boolean;
  workspaceBudgetState?: {
    dailySpent?: number;
    monthlySpent?: number;
    dailyLimit?: number;
    monthlyLimit?: number;
  };
  claimToken?: string;
  leaseId?: string;
  correlationId?: string;
  createdAt: string;
  decidedAt: string;
}

// Frozen 2026-04-21 — canonical source: planning/engineering-execution-design.md Section 6
export type ApprovalDecision = 'pending' | 'approved' | 'rejected' | 'timeout_rejected';

export type ActionStatus = 'pending' | 'executing' | 'completed' | 'rejected' | 'failed';

export type AuditEventType =
  | 'provisioning_event'
  | 'bot_runtime_event'
  | 'connector_event'
  | 'approval_event'
  | 'security_event'
  | 'audit_event';

export type AuditSeverity = 'info' | 'warn' | 'error' | 'critical';

// Frozen 2026-04-21 — canonical source: planning/spec-connector-auth-flow.md
export type ConnectorAuthStatus =
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

export type ConnectorScopeStatus = 'full' | 'partial' | 'insufficient';

export type ConnectorErrorClass =
  | 'oauth_state_mismatch'
  | 'oauth_code_exchange_failed'
  | 'token_refresh_failed'
  | 'token_expired'
  | 'insufficient_scope'
  | 'provider_rate_limited'
  | 'provider_unavailable'
  | 'secret_store_unavailable';

export interface ConnectorAuthMetadataRecord {
  id: string;
  connectorId: string;
  tenantId: string;
  workspaceId: string;
  connectorType: string;
  authMode: string;
  status: ConnectorAuthStatus;
  grantedScopes: string[];
  scopeStatus?: ConnectorScopeStatus;
  secretRefId?: string;
  tokenExpiresAt?: string;
  lastRefreshAt?: string;
  lastErrorClass?: ConnectorErrorClass;
  lastHealthcheckAt?: string;
}

// Frozen 2026-04-21 — canonical source: planning/engineering-execution-design.md Section 4 (normalized action contract)
export type ConnectorActionType =
  | 'read_task'
  | 'create_comment'
  | 'update_status'
  | 'send_message'
  | 'create_pr_comment'
  | 'send_email';

export type ConnectorActionStatus = 'success' | 'failed' | 'timeout';

export type ConnectorActionErrorCode =
  | 'rate_limit'
  | 'timeout'
  | 'provider_unavailable'
  | 'permission_denied'
  | 'invalid_format'
  | 'unsupported_action'
  | 'upgrade_required';

export interface ConnectorActionRecord {
  id: string;
  actionId: string;
  tenantId: string;
  workspaceId: string;
  botId: string;
  connectorId: string;
  connectorType: string;
  actionType: ConnectorActionType;
  contractVersion: string;
  correlationId: string;
  requestBody: Record<string, unknown>;
  resultStatus: ConnectorActionStatus;
  providerResponseCode?: string;
  resultSummary: string;
  errorCode?: ConnectorActionErrorCode;
  errorMessage?: string;
  remediationHint?: string;
  completedAt: string;
  createdAt: string;
}

// Frozen 2026-04-21 — canonical source: planning/engineering-execution-design.md Section 6
// Supports full decision traceability and P95 latency reporting (product-architecture.md Step 8)
// All fields are immutable after createdAt; decidedAt marks record completion
// Updated 2026-04-30 — added contractVersion and correlationId for cross-service compatibility (Epic A4)
export interface ApprovalRecord {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.APPROVAL
  tenantId: string;
  workspaceId: string;
  botId: string;
  taskId: string;
  actionId: string;
  riskLevel: RiskLevel;
  actionSummary: string;
  requestedBy: string;
  approverId?: string;
  decision: ApprovalDecision;
  decisionReason?: string;
  decisionLatencySeconds?: number; // Used for P95 SLA tracking (target <300 sec for medium-risk)
  policyPackVersion: string;
  escalationTimeoutSeconds: number;
  escalatedAt?: string;
  correlationId: string; // Traceability across services
  createdAt: string; // Immutable
  decidedAt?: string; // Immutable after set
}

// Frozen 2026-04-21 — canonical source: planning/engineering-execution-design.md Section 7
export interface ActionRecord {
  id: string;
  tenantId: string;
  workspaceId: string;
  botId: string;
  roleKey?: RoleKey;
  actionType: string;
  riskLevel: RiskLevel;
  policyPackVersion: string;
  inputSummary: string;
  outputSummary?: string;
  status: ActionStatus;
  approvalId?: string;
  connectorType?: string;
  llmExecutionMetadata?: LlmExecutionMetadata;
  correlationId: string;
  createdAt: string;
  completedAt?: string;
}

// Frozen 2026-04-21 — canonical source: planning/engineering-execution-design.md Section 7
// Updated 2026-04-30 — added contractVersion for cross-service compatibility (Epic A4)
export interface AuditEventRecord {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.AUDIT_EVENT
  tenantId: string;
  workspaceId: string;
  botId: string;
  eventType: AuditEventType;
  severity: AuditSeverity;
  summary: string;
  sourceSystem: string;
  correlationId: string;
  budgetDecision?: BudgetDecisionType;
  budgetDenialReason?: BudgetDenialReason;
  budgetLimitScope?: BudgetLimitScope;
  budgetLimitType?: string;
  createdAt: string;
}

// ============================================================================
// SPRINT B CONTRACTS (Enforcement and Operations)
// ============================================================================

// Epic B1: Heartbeat Wake Model with Coalescing
// Frozen 2026-05-01 — wake source tracking and run deduplication
export type WakeSource = 'timer' | 'assignment' | 'on_demand' | 'automation';

export type RunStatus = 'queued' | 'active' | 'completed' | 'cancelled' | 'timeout' | 'failed';

export interface RunRecord {
  id: string;
  botId: string;
  tenantId: string;
  workspaceId: string;
  wakeSource: WakeSource;
  status: RunStatus;
  dedupeKey?: string; // For coalescing duplicate wakeups
  previousRunId?: string; // Links to deduplicated run
  activeTaskCount: number;
  startedAt: string;
  completedAt?: string;
  lastHeartbeatAt: string;
  correlationId: string;
}

// Epic B1A: Adapter Registry
// Frozen 2026-05-01 — registry-driven adapter management
export type AdapterType = 'connector' | 'runtime' | 'provider';

export type AdapterStatus = 'registered' | 'healthy' | 'degraded' | 'failed' | 'unregistered';

export interface AdapterCapability {
  name: string;
  version: string;
  supported: boolean;
}

export interface AdapterRegistryRecord {
  id: string;
  adapterId: string;
  adapterType: AdapterType;
  adapterKey: string; // e.g. 'jira_connector', 'azure_runtime', 'openai_provider'
  displayName: string;
  status: AdapterStatus;
  version: string;
  tenantId?: string; // Optional, some adapters are global
  workspaceId?: string; // Optional, some adapters are workspace-scoped
  capabilities: AdapterCapability[];
  lastHealthcheckAt?: string;
  lastHealthcheckResult?: string;
  registeredAt: string;
  updatedAt: string;
  correlationId: string;
}

// Epic B2: Approval Gate Enforcement and Kill-Switch
// Frozen 2026-05-01 — kill-switch control and approval precedence
export type KillSwitchType = 'emergency' | 'manual' | 'threshold_breach' | 'security_incident';

export type KillSwitchStatus = 'active' | 'suspended' | 'expired' | 'resolved';

export interface KillSwitchRecord {
  id: string;
  tenantId: string;
  workspaceId?: string; // workspace-scoped or tenant-scoped
  botId?: string;
  switchType: KillSwitchType;
  status: KillSwitchStatus;
  activatedAt: string;
  activatedBy: string;
  reason: string;
  affectedActionTypes: string[]; // 'medium', 'high', or specific action types
  controlWindowMs: number; // Time for automation to detect and respond
  incidentRef?: string; // Link to incident tracking
  resumeRequiredApprovalId?: string; // Approval needed to resume
  resumedAt?: string;
  expiresAt?: string;
  correlationId: string;
}

export interface ApprovalEnforcementContext {
  taskId: string;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  killedBySwitch?: boolean;
  killSwitchId?: string;
  approvalId?: string;
  approvalStatus?: ApprovalDecision;
  enforceAt: string;
}

// Epic B3: Evidence Chain Completeness and Governance KPIs
// Frozen 2026-05-01 — governance metrics and KPI views
export interface GovernanceMetrics {
  workspaceId: string;
  tenantId: string;
  periodStart: string;
  periodEnd: string;

  // Evidence chain metrics
  totalActionAttempts: number;
  actionsWithCompleteEvidence: number;
  evidenceCompletenessPercent: number; // actionsWithCompleteEvidence / totalActionAttempts * 100

  // Approval SLA metrics
  mediumRiskApprovals: number;
  highRiskApprovals: number;
  approvalP50LatencySeconds: number;
  approvalP95LatencySeconds: number;
  approvalP99LatencySeconds: number;
  approvalTimeoutRate: number; // timeouts / total

  // Budget enforcement
  budgetBlocks: number;
  budgetBlockRate: number; // blocks / total_attempts
  hardStopsActivated: number;

  // Provider fallback degradation
  providerFailoverAttempts: number;
  providerFailoverRate: number;
  totalProviderFailovers: number;

  correlationId: string;
  generatedAt: string;
}

export interface EvidenceChainRecord {
  id: string;
  tenantId: string;
  workspaceId: string;
  botId: string;
  taskId: string;
  actionId: string;

  // Chain links
  actionRecord?: ActionRecord;
  approvalRecords?: ApprovalRecord[];
  budgetDecision?: BudgetDecisionRecord;
  auditEvents?: AuditEventRecord[];
  connectorActions?: ConnectorActionRecord[];

  // Completeness assessment
  isComplete: boolean;
  missingFields: string[];

  correlationId: string;
  assembledAt: string;
}

// Epic B4: Feature-Flagged Routine Scheduler
// Frozen 2026-05-01 — controlled pilot for recurring task intake
export type ScheduleType = 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly';

export type ScheduledRunStatus = 'scheduled' | 'queued' | 'active' | 'completed' | 'skipped' | 'failed';

export interface SchedulePolicy {
  dedupeKey: string; // Deduplication policy key
  concurrencyPolicy: 'queue' | 'replace' | 'skip'; // queue: wait, replace: cancel previous, skip: skip if already active
  maxRetries: number;
  retryBackoffMs: number;
}

export interface ScheduledTaskRecord {
  id: string;
  botId: string;
  tenantId: string;
  workspaceId: string;
  scheduleId: string;
  scheduleType: ScheduleType;
  scheduleExpression: string; // cron or interval

  // Task definition
  taskPayload: Record<string, unknown>;
  policyPackVersion: string;

  // Scheduling state
  status: ScheduledRunStatus;
  isFeatureFlagged: boolean;
  featureFlagKey: string; // e.g. 'scheduler.routine_tasks'
  enabled: boolean;

  // Execution tracking
  lastTriggeredAt?: string;
  lastCompletedRunId?: string;
  nextScheduledAt?: string;
  failureCount: number;
  lastFailureReason?: string;

  // Deduplication
  policy: SchedulePolicy;
  activeRunId?: string; // Current active run if concurrency==queue

  correlationId: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// PHASE 3 C1 CONTRACTS (Org-Level Governance Workflows)
// ============================================================================

export type GovernanceWorkflowStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'timed_out';

export type GovernanceReasonCode =
  | 'policy_violation'
  | 'insufficient_evidence'
  | 'manual_override'
  | 'risk_threshold_exceeded'
  | 'sla_timeout'
  | 'approved_with_controls';

export interface GovernanceRoutingRule {
  id: string;
  riskLevel?: RiskLevel;
  actionTypePrefix?: string;
  tenantId?: string;
  workspaceId?: string;
  approverIds: string[];
}

export interface GovernanceWorkflowStage {
  stageId: string;
  stageName: string;
  minApprovers: number;
  escalationTimeoutSeconds: number;
}

export interface GovernanceWorkflowTemplate {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.GOVERNANCE_WORKFLOW
  tenantId: string;
  workspaceId?: string;
  templateName: string;
  policyPackVersion: string;
  stages: GovernanceWorkflowStage[];
  routingRules: GovernanceRoutingRule[];
  createdBy: string;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface GovernanceWorkflowInstance {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.GOVERNANCE_WORKFLOW
  templateId: string;
  tenantId: string;
  workspaceId: string;
  botId: string;
  taskId: string;
  actionId: string;
  actionSummary: string;
  riskLevel: RiskLevel;
  policyPackVersion: string;
  status: GovernanceWorkflowStatus;
  currentStageId: string;
  currentStageIndex: number;
  assignedApproverIds: string[];
  correlationId: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface GovernanceWorkflowDecisionRecord {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.GOVERNANCE_WORKFLOW
  workflowId: string;
  stageId: string;
  tenantId: string;
  workspaceId: string;
  approverId: string;
  decision: Exclude<ApprovalDecision, 'pending'>;
  reasonCode: GovernanceReasonCode;
  reasonText: string;
  evidenceLinks: string[];
  policyPackVersion: string;
  correlationId: string;
  decidedAt: string;
}

export interface GovernanceWorkflowDiagnostics {
  tenantId: string;
  workspaceId: string;
  generatedAt: string;
  workflowSlaSeconds: number;
  pendingWorkflows: number;
  overdueWorkflows: number;
  bottleneckStageId?: string;
  bottleneckStagePendingCount: number;
  avgStageLatencySeconds: number;
}

// ============================================================================
// PHASE 3 C2 CONTRACTS (External Adapter/Plugin Loading)
// ============================================================================

export type PluginLoadStatus = 'loaded' | 'rejected' | 'disabled';

export type PluginTrustLevel = 'trusted' | 'untrusted' | 'unknown';

export interface ExternalPluginManifest {
  pluginKey: string;
  pluginName: string;
  version: string;
  provider: string;
  capabilities: string[];
  supportedAdapterTypes: AdapterType[];
  artifactUrl: string;
  signature: string;
  signatureAlgorithm: 'sha256' | 'sha512';
  provenance: {
    publisher: string;
    sourceRepo?: string;
    sourceCommit?: string;
  };
}

export interface ExternalPluginLoadRecord {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.PLUGIN_LOADING
  tenantId: string;
  workspaceId: string;
  pluginKey: string;
  manifestVersion: string;
  loadStatus: PluginLoadStatus;
  trustLevel: PluginTrustLevel;
  rejectionReason?: string;
  loadedBy: string;
  correlationId: string;
  loadedAt: string;
}

export interface PluginCapabilityAllowlist {
  tenantId: string;
  workspaceId: string;
  pluginKey: string;
  allowedCapabilities: string[];
  updatedBy: string;
  updatedAt: string;
}

export interface PluginKillSwitchRecord {
  pluginKey: string;
  status: 'active' | 'resolved';
  reason: string;
  activatedBy: string;
  activatedAt: string;
  correlationId: string;
  resolvedAt?: string;
}

export interface PluginAuditEvent {
  pluginKey: string;
  tenantId: string;
  workspaceId: string;
  eventType: 'plugin_load' | 'plugin_reject' | 'plugin_disable' | 'plugin_enable';
  message: string;
  correlationId: string;
  createdAt: string;
}

