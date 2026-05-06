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
  WORKSPACE_SESSION_STATE: '1.0.0', // Workspace session continuity state snapshot
  WORKSPACE_CHECKPOINT: '1.0.0', // Workspace rollback/safety checkpoints
  DESKTOP_PROFILE: '1.0.0', // Workspace browser/desktop profile persistence
  IDE_STATE: '1.0.0', // Workspace IDE open-files and editor state
  TERMINAL_SESSION: '1.0.0', // Workspace terminal session history and continuity
  ACTIVITY_EVENT: '1.0.0', // Unified activity/notification stream events (F5)
  ENV_PROFILE: '1.0.0', // Environment reconciler profile and drift reports (F8)
  DESKTOP_ACTION: '1.0.0', // Desktop GUI action runtime results (F3)
  PR_AUTOMATION: '1.0.0', // PR draft/publish/status records (F6)
  CI_TRIAGE: '1.0.0', // CI failure triage reports (F7)
  WORK_MEMORY: '1.0.0', // Workspace work memory and next-action plans (F10)
  REPRO_PACK: '1.0.0', // Crash recovery and repro pack export records (F9)
  MEETING_SESSION: '1.0.0', // Meeting lifecycle session records (voice agent)
  VOICE_TRANSCRIPT: '1.0.0', // STT transcript records from voice pipeline
  NOTIFICATION: '1.0.0', // Notification dispatch records (Telegram/Slack/Discord)
  GOAL_PLAN: '1.0.0', // GOAP goal plans and action sequences
  SKILL: '1.0.0', // Skills registry — crystallized reusable task templates
  AGENT_MEMORY: '1.0.0', // Agent short-term task memory (Epic A7)
  PROACTIVE_SIGNAL: '1.0.0', // Proactive operational signals (stale PR/ticket, budget warning)
  APPROVAL_BATCH: '1.0.0', // Batched approval grouping and batch decisions
  QUALITY_SIGNAL: '1.0.0', // LLM quality feedback signals by provider/action type
  AGENT_HANDOFF: '1.0.0', // Agent-to-agent handoff lifecycle records
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

// Frozen 2026-05-01 — workspace session continuity contract (Phase 1 VM realism)
export interface WorkspaceSessionStateRecord {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.WORKSPACE_SESSION_STATE
  tenantId: string;
  workspaceId: string;
  version: number;
  state: Record<string, unknown>;
  updatedBy: string;
  updatedAt: string;
  correlationId: string;
}

// Frozen 2026-05-01 — workspace checkpoint contract (Phase 1 VM realism)
export interface WorkspaceCheckpointRecord {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.WORKSPACE_CHECKPOINT
  tenantId: string;
  workspaceId: string;
  sessionVersion: number;
  label: string;
  reason?: string;
  stateDigest?: string;
  actor: string;
  createdAt: string;
  correlationId: string;
}

// Frozen 2026-05-01 — desktop profile persistence contract (Phase 1 VM realism)
export interface DesktopProfileRecord {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.DESKTOP_PROFILE
  tenantId: string;
  workspaceId: string;
  profileId: string;
  browser: string;
  storageRef?: string;
  tabState: Record<string, unknown>;
  tokenVersion: number;
  updatedAt: string;
  correlationId: string;
}

// Frozen 2026-05-01 — IDE state persistence contract (Phase 1 VM realism F4)
export type IdeStateStatus = 'active' | 'suspended' | 'restored';

export interface IdeStateRecord {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.IDE_STATE
  tenantId: string;
  workspaceId: string;
  openFiles: string[];
  activeFile?: string;
  breakpoints: Array<{ file: string; line: number; condition?: string }>;
  status: IdeStateStatus;
  updatedAt: string;
  correlationId: string;
}

// Frozen 2026-05-01 — Terminal session continuity contract (Phase 1 VM realism F4)
export type TerminalSessionStatus = 'active' | 'closed' | 'suspended';
export type TerminalShell = 'bash' | 'zsh' | 'sh' | 'fish' | 'powershell' | 'cmd';

export interface TerminalSessionRecord {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.TERMINAL_SESSION
  tenantId: string;
  workspaceId: string;
  shell: TerminalShell;
  cwd: string;
  lastCommand?: string;
  history: string[];
  status: TerminalSessionStatus;
  updatedAt: string;
  createdAt: string;
  correlationId: string;
}

// Frozen 2026-05-01 — Unified activity/notification stream event contract (Phase 1 F5)
export type ActivityEventCategory =
  | 'runtime'
  | 'approval'
  | 'ci'
  | 'connector'
  | 'provisioning'
  | 'security'
  | 'system';

export type ActivityEventStatus = 'unread' | 'read' | 'acked';

export interface ActivityEventRecord {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.ACTIVITY_EVENT
  tenantId: string;
  workspaceId: string;
  category: ActivityEventCategory;
  title: string;
  body?: string;
  payload?: Record<string, unknown>;
  status: ActivityEventStatus;
  sequence: number;
  createdAt: string;
  ackedAt?: string;
  ackedBy?: string;
  correlationId: string;
}

// Frozen 2026-05-01 — Environment reconciler profile and drift contract (Phase 1 F8)
export type EnvReconcileStatus = 'clean' | 'drifted' | 'reconciling' | 'failed';
export type ToolchainEntryStatus = 'ok' | 'missing' | 'version_mismatch' | 'unknown';

export interface ToolchainEntry {
  name: string;
  requiredVersion: string;
  actualVersion?: string;
  status: ToolchainEntryStatus;
}

export interface EnvProfileRecord {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.ENV_PROFILE
  tenantId: string;
  workspaceId: string;
  toolchain: ToolchainEntry[];
  reconcileStatus: EnvReconcileStatus;
  lastReconcileAt?: string;
  driftReport?: Record<string, unknown>;
  updatedAt: string;
  createdAt: string;
  correlationId: string;
}

// Frozen 2026-05-01 — Desktop GUI action runtime result contract (Phase 1 F3)
export type DesktopActionType = 'launch' | 'click' | 'type' | 'upload' | 'screenshot' | 'select_file';
export type DesktopActionResult = 'success' | 'failed' | 'retrying' | 'approval_pending' | 'blocked';
export type DesktopActionRisk = 'low' | 'medium' | 'high';
export type DesktopActionRetryClass = 'retryable' | 'non_retryable';

export interface DesktopActionRecord {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.DESKTOP_ACTION
  tenantId: string;
  workspaceId: string;
  actionType: DesktopActionType;
  target?: string;
  inputPayload?: Record<string, unknown>;
  result: DesktopActionResult;
  riskLevel: DesktopActionRisk;
  retryClass: DesktopActionRetryClass;
  retryCount: number;
  screenshotRef?: string;
  approvalId?: string;
  errorMessage?: string;
  completedAt?: string;
  createdAt: string;
  correlationId: string;
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

export type ApprovalBatchStatus = 'pending' | 'resolved';

export interface ApprovalBatchRecord {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.APPROVAL_BATCH
  tenantId: string;
  workspaceId: string;
  botId: string;
  batchKey: string;
  riskLevel: RiskLevel;
  actionType: string;
  taskIds: string[];
  status: ApprovalBatchStatus;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalBatchDecisionRecord {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.APPROVAL_BATCH
  batchId: string;
  tenantId: string;
  workspaceId: string;
  botId: string;
  decision: Exclude<ApprovalDecision, 'pending'>;
  actor: string;
  reason?: string;
  taskIds: string[];
  correlationId: string;
  decidedAt: string;
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
export type WakeSource = 'timer' | 'assignment' | 'on_demand' | 'automation' | 'proactive_signal' | 'agent_handoff';

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

// ---------------------------------------------------------------------------
// F6 PR Auto Driver
// ---------------------------------------------------------------------------

export type PrDraftStatus = 'draft' | 'publishing' | 'published' | 'failed';
export type PrPublishStatus = 'publishing' | 'published' | 'failed';

export interface PrDraftRecord {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.PR_AUTOMATION
  tenantId: string;
  workspaceId: string;
  branch: string;
  targetBranch?: string;
  changeSummary: string;
  linkedIssueIds: string[];
  title: string;
  body: string;
  checklist: string[];
  reviewersSuggested: string[];
  status: PrDraftStatus;
  prId?: string;
  provider?: string;
  labels?: string[];
  correlationId: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// F7 CI Failure Triage
// ---------------------------------------------------------------------------

export type CiTriageStatus = 'queued' | 'triaging' | 'complete' | 'failed';

export interface CiFailedJob {
  jobName: string;
  step?: string;
  exitCode?: number;
  logRef?: string;
}

export interface CiTriageReport {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.CI_TRIAGE
  tenantId: string;
  workspaceId: string;
  provider: string;
  runId: string;
  repo: string;
  branch: string;
  failedJobs: CiFailedJob[];
  logRefs: string[];
  status: CiTriageStatus;
  rootCauseHypothesis?: string;
  reproSteps?: string[];
  patchProposal?: string;
  confidence?: number;
  blastRadius?: string;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// F10 Work Memory + Next-Action Planner
// ---------------------------------------------------------------------------

export interface WorkMemoryEntry {
  key: string;
  value: unknown;
  tags?: string[];
  updatedAt: string;
}

export type WorkMemoryMergeMode = 'replace' | 'merge' | 'append';

export interface WorkMemoryRecord {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.WORK_MEMORY
  tenantId: string;
  workspaceId: string;
  memoryVersion: number;
  entries: WorkMemoryEntry[];
  summary?: string;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface NextActionItem {
  action: string;
  reason: string;
  confidence: number;
  requiresApproval: boolean;
  priority: 'high' | 'medium' | 'low';
}

export interface DailyPlanRecord {
  id: string;
  tenantId: string;
  workspaceId: string;
  objective?: string;
  constraints?: string[];
  nextActions: NextActionItem[];
  risks: string[];
  approvalsNeeded: string[];
  correlationId: string;
  createdAt: string;
}

// ============================================================================
// SPRINT 4 — F9: Crash Recovery + Repro Pack Generator
// Frozen 2026-05-01 — canonical source: planning/phase-1-vm-realism-execution-plan.md
// ============================================================================

export type ResumeStrategy = 'last_checkpoint' | 'latest_state';

export type ReproPackStatus = 'generating' | 'ready' | 'expired' | 'failed';

export type RunResumeStatus = 'queued' | 'resuming' | 'resumed' | 'failed';

export interface ReproPackManifest {
  runId: string;
  workspaceId: string;
  tenantId: string;
  includedLogs: boolean;
  includedScreenshots: boolean;
  includedDiffs: boolean;
  includedActionTraces: boolean;
  actionCount: number;
  logBundleRef?: string;
  screenshotRefs: string[];
  diffRefs: string[];
  timeline: Array<{ at: string; event: string; actor: string }>;
}

export interface ReproPackRecord {
  id: string;
  contractVersion: string;
  tenantId: string;
  workspaceId: string;
  runId: string;
  status: ReproPackStatus;
  manifest: ReproPackManifest;
  downloadRef?: string;
  expiresAt: string;
  exportAuditEventId?: string;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface RunResumeRecord {
  id: string;
  contractVersion: string;
  tenantId: string;
  workspaceId: string;
  runId: string;
  strategy: ResumeStrategy;
  resumedFrom?: string;
  status: RunResumeStatus;
  failureReason?: string;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// VOICE MEETING AGENT CONTRACTS
// Spec: planning/spec-meeting-agent-teams.md
// ============================================================================

export type MeetingLifecycleStatus =
  | 'scheduled'
  | 'join_requested'
  | 'joining'
  | 'joined'
  | 'listening'
  | 'speaking'
  | 'paused'
  | 'escalation_required'
  | 'completed'
  | 'failed';

export type MeetingQuestionHandlingStatus =
  | 'received'
  | 'transcribed'
  | 'classified'
  | 'grounded'
  | 'policy_checked'
  | 'approval_pending'
  | 'answered'
  | 'escalated'
  | 'blocked';

export type MeetingMode = 'standup' | 'interactive_qa' | 'interview_assistant';

export type MeetingPlatform = 'teams' | 'zoom' | 'meet' | 'webex';

export interface MeetingSessionRecord {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.MEETING_SESSION
  tenantId: string;
  workspaceId: string;
  botId: string;
  platform: MeetingPlatform;
  mode: MeetingMode;
  meetingId: string;
  meetingUrl?: string;
  status: MeetingLifecycleStatus;
  disclosureAnnounced: boolean; // AI disclosure non-negotiable — must be true before any speech
  transcriptRef?: string;
  summaryRef?: string;
  evidenceIds: string[];
  correlationId: string;
  scheduledAt?: string;
  joinedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingQuestionRecord {
  id: string;
  sessionId: string;
  tenantId: string;
  workspaceId: string;
  speakerId?: string;
  transcription: string;
  status: MeetingQuestionHandlingStatus;
  classifiedRisk?: RiskLevel;
  groundedResponse?: string;
  approvalId?: string;
  escalationReason?: string;
  confidenceScore?: number;
  answeredAt?: string;
  correlationId: string;
  createdAt: string;
}

// ============================================================================
// VOICE PIPELINE CONTRACTS (VoxCPM / Voicebox / Whisper)
// ============================================================================

export type SttProvider = 'whisper_local' | 'whisper_cloud' | 'azure_speech';

export type TtsProvider = 'voxcpm' | 'voicebox' | 'azure_tts' | 'openai_tts';

export type VoiceQuality = 'standard' | 'high' | 'studio';

export interface VoicePipelineConfig {
  sttProvider: SttProvider;
  sttModel?: string; // e.g. 'whisper-turbo', 'whisper-large-v3'
  ttsProvider: TtsProvider;
  ttsModel?: string; // e.g. 'openbmb/VoxCPM2'
  ttsEndpoint?: string; // e.g. 'http://localhost:8000/v1/audio/speech'
  voiceProfileId?: string; // for voice cloning
  voiceQuality?: VoiceQuality;
  languageCode?: string; // BCP-47, e.g. 'en-US'
  streamingEnabled?: boolean;
}

// ============================================================================
// AUTONOMOUS SKILL LOOP CONTRACTS (Feature #9 — Self-iteration)
// ============================================================================

export type {
  LoopState,
  LoopDecision,
  SuccessCriteria,
  SkillBranch,
  LoopConfig,
  LoopStepTrace,
  LoopRunResult,
  LearnedPattern,
} from './autonomous-loop.js';

// ============================================================================
// SKILL COMPOSITION/DAG CONTRACTS (Feature #8 — Pipeline chaining)
// ============================================================================

export type {
  PipelineNodeType,
  EdgeCondition,
  CompositionNode,
  CompositionEdge,
  SkillCompositionDAG,
  CompositionRunRecord,
  CompositionExecutionResult,
} from './skill-composition.js';

// ============================================================================
// PROVIDER FAILOVER CONTRACTS (Feature #5 — Resilience)
// ============================================================================

export type {
  FailoverReason,
  ProviderHealthStatus,
  CooldownRecord,
  ProviderStateSnapshot,
  ProviderFailoverPolicy,
} from './provider-failover.js';

// ============================================================================
// GOVERNANCE KPI CONTRACTS (Feature #6 — Operator visibility)
// ============================================================================

export type {
  KPICategory,
  KPIMetric,
  ApprovalKPIs,
  AuditKPIs,
  BudgetKPIs,
  ProviderKPIs,
  ExecutionKPIs,
  GovernanceKPISnapshot,
} from './governance-kpis.js';

// ============================================================================
// ADAPTER REGISTRY CONTRACTS (Feature #7 — Extensibility)
// ============================================================================

export type {
  AdapterManifest,
  AdapterInstance,
  CapabilityDiscoveryResult,
  AdapterHealthCheckResult,
} from './adapter-registry.js';

// ============================================================================
// TELEMETRY CONTRACTS (Feature #4 — Observability)
// ============================================================================

export type {
  LogLevel,
  LogEntry,
  MetricType,
  Metric,
  TelemetryEvent,
  MetricsSnapshot,
  CorrelationContext,
  TelemetryExporter,
} from './telemetry.js';

export interface VoiceTranscriptRecord {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.VOICE_TRANSCRIPT
  sessionId: string;
  tenantId: string;
  workspaceId: string;
  audioRef?: string;
  transcript: string;
  confidence?: number;
  sttProvider: SttProvider;
  sttModel?: string;
  languageDetected?: string;
  durationMs?: number;
  correlationId: string;
  createdAt: string;
}

export interface VoiceSpeechRecord {
  id: string;
  sessionId: string;
  tenantId: string;
  workspaceId: string;
  text: string;
  audioRef?: string;
  ttsProvider: TtsProvider;
  ttsModel?: string;
  voiceProfileId?: string;
  durationMs?: number;
  streamingUsed?: boolean;
  correlationId: string;
  createdAt: string;
}

// ============================================================================
// NOTIFICATION GATEWAY CONTRACTS (Telegram / Slack / Discord / Webhook)
// ============================================================================

export type NotificationChannel = 'telegram' | 'slack' | 'discord' | 'email' | 'webhook' | 'voice';

export type NotificationEventTrigger =
  | 'run_completed'
  | 'run_failed'
  | 'approval_requested'
  | 'approval_decided'
  | 'escalation_created'
  | 'kill_switch_activated'
  | 'meeting_completed'
  | 'skill_crystallized'
  | 'security_event';

export interface NotificationChannelConfig {
  channel: NotificationChannel;
  enabled: boolean;
  config: Record<string, string>; // botToken, webhookUrl, chatId, etc.
  /** When set, this channel config only activates for the listed triggers. */
  allowedTriggers?: NotificationEventTrigger[];
}

export interface NotificationRecord {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.NOTIFICATION
  tenantId: string;
  workspaceId: string;
  channel: NotificationChannel;
  trigger: NotificationEventTrigger;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  status: 'pending' | 'sent' | 'failed' | 'retrying';
  retryCount: number;
  errorMessage?: string;
  correlationId: string;
  scheduledAt?: string;
  sentAt?: string;
  createdAt: string;
}

export interface NotificationDispatchResult {
  notificationId: string;
  channel: NotificationChannel;
  success: boolean;
  errorMessage?: string;
  platformMessageId?: string;
}

// ============================================================================
// GOAP PLANNER CONTRACTS (Goal-Oriented Action Planning — A*)
// ============================================================================

export type GoalPlanStatus =
  | 'pending'
  | 'planning'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'replanning';

export type GoalWorldState = Record<string, boolean | string | number | null>;

export interface GoalAction {
  id: string;
  name: string;
  preconditions: GoalWorldState; // conditions that must hold before execution
  effects: GoalWorldState;       // state changes produced by execution
  cost: number;                  // A* edge cost
}

export interface GoalPlan {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.GOAL_PLAN
  tenantId: string;
  workspaceId: string;
  botId: string;
  goalDescription: string;
  currentState: GoalWorldState;
  targetState: GoalWorldState;
  actions: GoalAction[];   // ordered sequence produced by planner
  totalCost: number;
  status: GoalPlanStatus;
  currentActionIndex: number;
  replanCount: number;
  failedActionId?: string;
  failureReason?: string;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// SKILLS REGISTRY CONTRACTS (from Hermes Agent / Ruflo SONA)
// ============================================================================

export type SkillStatus = 'draft' | 'active' | 'deprecated';

export type SkillTrigger = 'manual' | 'auto_crystallized' | 'imported';

export interface SkillRecord {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.SKILL
  tenantId: string;
  workspaceId: string;
  name: string;
  description: string;
  trigger: SkillTrigger;
  status: SkillStatus;
  roleKey?: RoleKey;
  inputPattern: Record<string, unknown>; // template for inputs that activate skill
  outputTemplate: Record<string, unknown>; // expected output shape
  stepCount: number;
  successCount: number;
  useCount: number;
  sourceRunId?: string;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SkillCrystallizationRecord {
  id: string;
  skillId: string;
  runId: string;
  tenantId: string;
  workspaceId: string;
  triggerReason: string;
  trajectoryCompressed: boolean;
  correlationId: string;
  createdAt: string;
}

// ============================================================================
// AGENT MEMORY SERVICE (Epic A7)
// ============================================================================
// Short-term task memory for agent context injection (7-day TTL)
// Frozen 2026-05-07 — Agent Memory Service specification

export interface ApprovalOutcome {
  action: string;
  decision: 'approved' | 'rejected';
  reason?: string;
}

export interface AgentShortTermMemoryRecord {
  id: string;
  workspaceId: string;
  tenantId: string;
  taskId: string;
  actionsTaken: string[]; // action types executed
  approvalOutcomes: ApprovalOutcome[]; // approval history for this task
  connectorsUsed: string[]; // connector types used
  llmProvider?: string; // which provider made the LLM decision
  executionStatus: 'success' | 'approval_required' | 'failed';
  summary: string; // brief task summary for LLM prompt injection
  correlationId: string;
  createdAt: string;
  expiresAt: string; // TTL: createdAt + 7 days
}

export interface AgentMemoryInjectionContext {
  recentMemories: AgentShortTermMemoryRecord[];
  memoryCountThisWeek: number;
  mostCommonConnectors: string[];
  approvalRejectionRate: number; // 0-1, for prompt bias adjustment
}

export type ProactiveSignalType = 'stale_pr' | 'stale_ticket' | 'budget_warning';

export type ProactiveSignalStatus = 'open' | 'resolved';

export interface ProactiveSignalRecord {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.PROACTIVE_SIGNAL
  tenantId: string;
  workspaceId: string;
  botId: string;
  signalType: ProactiveSignalType;
  status: ProactiveSignalStatus;
  severity: RiskLevel;
  summary: string;
  sourceRef: string;
  metadata?: Record<string, unknown>;
  correlationId: string;
  detectedAt: string;
  updatedAt: string;
}

export interface QualitySignalRecord {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.QUALITY_SIGNAL
  tenantId: string;
  workspaceId: string;
  botId: string;
  provider: string;
  actionType: string;
  score: number; // 0-1 normalized quality score
  reason?: string;
  metadata?: Record<string, unknown>;
  correlationId: string;
  observedAt: string;
}

export type AgentHandoffStatus = 'requested' | 'accepted' | 'rejected' | 'completed' | 'cancelled';

export interface AgentHandoffRecord {
  id: string;
  contractVersion: string; // CONTRACT_VERSIONS.AGENT_HANDOFF
  tenantId: string;
  workspaceId: string;
  taskId: string;
  fromBotId: string;
  toBotId: string;
  reason: string;
  status: AgentHandoffStatus;
  handoffContext?: Record<string, unknown>;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
}

