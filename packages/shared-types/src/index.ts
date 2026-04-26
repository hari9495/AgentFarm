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

export interface SignupProvisioningRequested {
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
export interface ProvisioningJobRecord {
  id: string;
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
export interface ApprovalRecord {
  id: string;
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

export interface AuditEventRecord {
  id: string;
  tenantId: string;
  workspaceId: string;
  botId: string;
  eventType: AuditEventType;
  severity: AuditSeverity;
  summary: string;
  sourceSystem: string;
  correlationId: string;
  createdAt: string;
}

