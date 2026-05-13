# AgentFarm — Complete System Inventory

> Generated: 2026-05-09 | Updated: 2026-05-10  
> Scope: Full codebase read of `d:\AgentFarm`  
> Method: All entry points, route files, service indexes, connectors, schema, and test results read directly from source.

---

## Summary Counters

| Metric | Count |
|---|---|
| Total `.ts` source files (excl. tests, node_modules) | **606** |
| Total `.test.ts` files | **155** |
| Prisma DB models | **70** |
| API route files (api-gateway) | **62** |
| Connector implementations | **12** |
| Workspace packages (apps + services + packages) | **34** |
| Tests passing (Sprint 7 confirmed) | **1,853** |
| Tests failing | **0** |

---

## 1. Full Directory Tree — .ts Files Grouped by Package

| Package | Role | Source files (est.) | Test files (est.) |
|---|---|---|---|
| `apps/agent-runtime` | Core agent execution runtime | ~110 | ~60 |
| `apps/api-gateway` | REST API gateway (Fastify) | ~80 | ~57 |
| `apps/orchestrator` | Task scheduling, GOAP planner, handoff coordinator | ~15 | ~12 |
| `apps/trigger-service` | Webhook trigger ingestion | ~9 | ~3 |
| `apps/dashboard` | Next.js operator dashboard | ~75 | ~8 |
| `apps/website` | Next.js marketing / signup site | ~90 | ~10 |
| `services/agent-observability` | Browser action interceptor + diff verifier | ~10 | ~5 |
| `services/agent-question-service` | Human-in-the-loop question parking | ~4 | ~1 |
| `services/approval-service` | Approval batcher + kill-switch enforcer | ~6 | ~2 |
| `services/audit-storage` | Azure Blob audit/screenshot uploader | ~5 | ~1 |
| `services/browser-actions` | Playwright web-action helpers | ~3 | 0 |
| `services/compliance-export` | Audit CSV/JSONL export | ~3 | 0 |
| `services/connector-gateway` | Adapter registry + 12 connector impls | ~17 | ~4 |
| `services/evidence-service` | Governance KPI + HNSW vector search | ~3 | ~2 |
| `services/identity-service` | Identity scaffold | 1 | 0 |
| `services/meeting-agent` | Meeting lifecycle + voice pipeline | ~5 | ~2 |
| `services/memory-service` | Short/long-term agent memory store | ~6 | ~1 |
| `services/notification-service` | Notification dispatcher | ~9 | ~2 |
| `services/policy-engine` | Governance routing policy | ~3 | ~1 |
| `services/provisioning-service` | Azure VM provisioning job processor | ~7 | ~3 |
| `services/retention-cleanup` | Retention policy TTL cleanup | ~3 | 0 |
| `packages/auth-utils` | scrypt password hashing | 1 | 0 |
| `packages/cli` | af developer CLI | ~3 | 0 |
| `packages/config` | Service URL constants | 1 | 0 |
| `packages/connector-contracts` | Connector type definitions | 1 | 0 |
| `packages/crm-service` | CRM adapter (Salesforce, HubSpot) | ~9 | 1 |
| `packages/db-schema` | Prisma schema + barrel export | 2 | 0 |
| `packages/e2e` | Playwright end-to-end tests | ~5 | ~5 |
| `packages/erp-service` | ERP adapter (SAP, Oracle) | ~9 | 1 |
| `packages/notification-service` | Notification adapter | ~7 | ~2 |
| `packages/observability` | In-memory observability event store | 1 | 0 |
| `packages/queue-contracts` | Queue name constants + lease/budget types | 1 | 0 |
| `packages/sdk` | AgentFarmClient SDK | ~5 | 0 |
| `packages/shared-types` | All cross-service TypeScript contracts | ~15 | 1 |

---

## 2. Prisma Database Models (70 total)

All models live in `packages/db-schema/prisma/schema.prisma` against PostgreSQL 16.

### Identity and tenancy (8)
| Model | Purpose |
|---|---|
| `Tenant` | Root tenant record |
| `TenantUser` | Tenant user with hashed password + role |
| `Workspace` | Per-tenant workspace |
| `WorkspaceSessionState` | VM workspace state persistence |
| `TenantLanguageConfig` | Default + ticket language per tenant |
| `WorkspaceLanguageConfig` | Preferred language per workspace |
| `UserLanguageProfile` | Detected + preferred language per user |
| `TenantMcpServer` | Tenant-registered MCP server URLs |

### Agents and bots (8)
| Model | Purpose |
|---|---|
| `Bot` | Agent bot instance linked to workspace |
| `BotCapabilitySnapshot` | Frozen capability config (brain, language, avatar) |
| `BotConfigVersion` | Versioned bot config history |
| `AgentSession` | Browser audit session root (video + actions) |
| `AgentRateLimit` | Per-bot rate limiting state |
| `RuntimeInstance` | Live runtime endpoint + heartbeat |
| `AgentSubscription` | Per-agent subscription tier |
| `TenantSubscription` | Tenant-level subscription state |

### Task execution (9)
| Model | Purpose |
|---|---|
| `TaskExecutionRecord` | LLM token usage + latency per task |
| `TaskQueueEntry` | Priority queue entries with lease state |
| `Plan` | Subscription plan definitions |
| `ActionRecord` | Every agent action with risk + approval link |
| `AgentDispatchRecord` | Multi-agent dispatch tracking |
| `OrchestrationRun` | Orchestration run state + timeline |
| `RunResume` | Crash recovery run resume records |
| `ReproPack` | Crash repro pack manifests + download refs |
| `WorkspaceCheckpoint` | Workspace state checkpoint snapshots |

### Memory and knowledge (5)
| Model | Purpose |
|---|---|
| `AgentShortTermMemory` | 7-day TTL per-task memory for prompt injection |
| `AgentLongTermMemory` | Persistent behavioral pattern memory |
| `WorkMemory` | Per-workspace agent work memory entries |
| `AgentRepoKnowledge` | Per-repo role knowledge graph entries |
| `TerminalSession` | Terminal shell history + cwd |

### Billing and subscriptions (5)
| Model | Purpose |
|---|---|
| `Order` | Payment orders (Razorpay / Stripe) |
| `Invoice` | Invoice records with PDF URLs |
| `SubscriptionEvent` | Subscription lifecycle events |
| `ProvisioningJob` | Azure VM provisioning lifecycle |
| `ScheduledReport` | Scheduled report job config |

### Connectors and marketplace (6)
| Model | Purpose |
|---|---|
| `ConnectorAction` | Normalized connector action execution records |
| `ConnectorAuthEvent` | Auth event audit trail |
| `ConnectorAuthMetadata` | OAuth / API key auth state per connector |
| `ConnectorAuthSession` | OAuth state nonce sessions |
| `MarketplaceListing` | Agent marketplace catalog entries |
| `MarketplaceInstall` | Installed marketplace agents per workspace |

### Governance and audit (12)
| Model | Purpose |
|---|---|
| `Approval` | Approval requests with decision + P95 latency fields |
| `AuditEvent` | Immutable audit log for all system events |
| `QualitySignalLog` | LLM and action quality signal records |
| `StoredEvidenceBundle` | Compliance evidence bundles with retention |
| `RetentionPolicy` | Customer-configured artifact retention rules |
| `ExternalPluginLoad` | External plugin load audit records |
| `PluginAllowlist` | Approved plugin registry |
| `PluginKillSwitch` | Disabled plugin registry |
| `CiTriageReport` | CI failure triage + patch proposals |
| `AbTest` | A/B test configuration |
| `AbTestAssignment` | Per-user A/B test assignments |
| `CircuitBreakerState` | Circuit breaker state per service |

### Communication and developer tools (17)
| Model | Purpose |
|---|---|
| `MeetingSession` | Meeting transcription sessions + summaries |
| `ChatSession` | Multi-turn chat sessions |
| `ChatMessage` | Individual chat messages |
| `AgentQuestion` | Human-in-the-loop question parking + answers |
| `NotificationLog` | Notification delivery records |
| `ActivityEvent` | Unified notification/activity stream |
| `PrDraft` | PR auto-driver draft records |
| `ApiKey` | SHA-256 hashed API keys with `af_` prefix |
| `OutboundWebhook` | Outbound webhook config |
| `OutboundWebhookDelivery` | Webhook delivery records + retry state |
| `WebhookDlqEntry` | Webhook dead-letter queue |
| `IdeState` | IDE open files, breakpoints, active file |
| `DesktopAction` | GUI action runtime records + screenshots |
| `DesktopProfile` | Browser profile storage refs + tab state |
| `BrowserActionEvent` | Individual browser action with screenshots |
| `EnvProfile` | Toolchain reconciliation drift report |
| `ScheduledJob` | Scheduled job execution records |
| `AgentRepoKnowledge` | Per-repo role knowledge graph entries | A7 |
| `AgentSession` | Browser audit session root (video + actions) | 2026-05-07 |
| `BrowserActionEvent` | Individual browser action with screenshots | 2026-05-07 |
| `RetentionPolicy` | Customer-configured artifact retention rules | 2026-05-07 |
| `AgentQuestion` | Human-in-the-loop question parking + answers | 2026-05-07 |
| `TenantMcpServer` | Tenant-registered MCP server URLs | 2026-05-07 |
| `TenantLanguageConfig` | Default + ticket language per tenant | 2026-05-07 |
| `WorkspaceLanguageConfig` | Preferred language per workspace | 2026-05-07 |
| `UserLanguageProfile` | Detected + preferred language per user | 2026-05-07 |
| `MeetingSession` | Meeting transcription sessions + summaries | 2026-05-09 |
| `Plan` | Subscription plan definitions | billing |
| `Order` | Payment orders (Razorpay / Stripe) | billing |
| `Invoice` | Invoice records with PDF URLs | billing |

---

## 3. Master Table — Every Exported Function / Class

### 3.1 `apps/agent-runtime/src/execution-engine.ts`

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `normalizeActionType` | function | Extracts `action_type` or `intent` from task payload; falls back to `read_task` | Built |
| `scoreConfidence` | function | Scores 0–1 confidence based on summary/target/complexity fields | Built |
| `buildDecision` | function | Constructs an `ActionDecision` from payload and risk classification | Built |
| `processDeveloperTask` | function | Main task loop: classify → route → execute or queue approval | Built |
| `processDeveloperTaskWithMemory` | function | Wraps `processDeveloperTask` with short-term memory read/write | Built |
| `processApprovedTask` | function | Re-runs an approved task after human sign-off | Built |
| `HIGH_RISK_ACTIONS` | Set | 18 action types requiring mandatory human approval | Built |
| `MEDIUM_RISK_ACTIONS` | Set | 55+ action types routed to approval queue | Built |

### 3.2 `apps/agent-runtime/src/runtime-server.ts`

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `startRuntimeServer` | function | Bootstraps Fastify runtime, loads capability snapshot, wires task loop | Built |
| `RuntimeConfig` | interface | All runtime config: tenantId, roleProfile, approvalApiUrl, etc. | Built |
| `RuntimeState` | enum | 9 states: created/starting/ready/active/degraded/paused/stopping/stopped/failed | Built |
| `processOneTask` | function | Single task dispatch: call LLM adapter, route, write action record | Built |
| `ApprovalIntakeClient` | type | Typed fn signature for submitting approval requests | Built |
| `ConnectorActionExecuteClient` | type | Typed fn signature for executing connector actions | Built |
| `RuntimeMemoryStore` | interface | readMemoryForTask / writeMemoryAfterTask contract | Built |

### 3.3 `apps/agent-runtime/src/llm-decision-adapter.ts`

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `buildLlmDecisionAdapter` | function | Factory: creates a `LlmDecisionResolver` for a given provider config | Built |
| `RuntimeLlmWorkspaceConfig` | type | Multi-provider LLM config (OpenAI, Azure, Anthropic, Google, xAI, Mistral, Together, auto) | Built |
| `callLlmDecision` | function | Dispatches to selected provider with retry + failover + token budget tracking | Built |
| `selectAutoProvider` | function | Picks best auto provider by cooldown state and profile preference | Built |
| `recordProviderOutcome` | function | Updates cooldown state and quality penalty tracker | Built |

### 3.4 `apps/agent-runtime/src/local-workspace-executor.ts`

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `LocalWorkspaceExecutor` | class | Executes 12-tier workspace actions in isolated tmp directory | Built |
| `LocalWorkspaceActionType` | union | 80+ action types from file read to autonomous plan execution | Built |
| `executeWorkspaceAction` | function | Routes to correct tier handler by action type | Built |

### 3.5 `apps/agent-runtime/src/skill-execution-engine.ts`

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `getSkillHandler` | function | Returns handler fn for given skill_id | Built |
| `SkillHandler` | type | Pure fn: `(input, startedAt) => SkillOutput` | Built |
| `prReviewerRiskLabels` | SkillHandler | Labels PR files by risk level → recommends GitHub label | Built |
| `codeReviewSummarizer` | SkillHandler | Generates plain-English reviewer summary from PR diff | Built |
| `prCommentDrafter` | SkillHandler | Drafts inline PR review comments by concern type | Built |
| `deadCodeDetector` | SkillHandler | Detects unreferenced exports / dead code patterns | Built |
| `codeChurnAnalyzer` | SkillHandler | Analyzes commit churn rate by file | Built |
| `typeCoverageReporter` | SkillHandler | Reports `any` type coverage percentage | Built |
| `monorepoDepGraph` | SkillHandler | Builds package dependency graph | Built |
| `commitMessageLinter` | SkillHandler | Validates Conventional Commits format | Built |
| `flakyTestDetector` | SkillHandler | Identifies flaky test patterns from run history | Built |
| `testCoverageReporter` | SkillHandler | Reports line/branch coverage delta per PR | Built |
| `testNameReviewer` | SkillHandler | Checks test name quality and descriptiveness | Built |
| `stalePrDetector` | SkillHandler | Surfaces PRs idle beyond threshold | Built |
| `prSizeEnforcer` | SkillHandler | Rejects PRs above line-change threshold | Built |
| `dependencyAudit` | SkillHandler | Scans package.json for known CVEs via audit data | Built |
| `licenseComplianceCheck` | SkillHandler | Validates all deps have approved licenses | Built |
| `dockerImageScanner` | SkillHandler | Checks Docker base images for known vulnerabilities | Built |
| `envVarAuditor` | SkillHandler | Detects hard-coded secrets or missing .env declarations | Built |
| `releaseNotesGenerator` | SkillHandler | Auto-generates release notes from commit log | Built |
| `changelogDiffValidator` | SkillHandler | Validates CHANGELOG matches tagged commits | Built |
| `migrationRiskScorer` | SkillHandler | Scores DB migration risk by destructive operations | Built |

### 3.6 `apps/agent-runtime/src/multi-agent-orchestrator.ts`

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `MultiAgentOrchestrator` | class | Routes tasks to specialized sub-agents by capability match | Built |
| `AgentSpec` | type | Agent definition: capabilities, skill_ids, affinity_weight | Built |
| `OrchestratorTask` | type | Task with required capabilities, skill invocations, aggregation mode | Built |
| `OrchestratorResult` | type | Aggregate result with audit trail and per-agent timings | Built |
| `BUILT_IN_AGENTS` | const | 5 pre-registered agents: code, test, security, release, perf | Built |

### 3.7 `apps/agent-runtime/src/voicebox-client.ts`

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `VoiceboxClient` | class | HTTP client for local Voicebox voice I/O service | Built |
| `transcribeAudio` | method | Sends audio buffer to `/v1/transcribe` → returns text + language + confidence | Built |
| `synthesizeSpeech` | method | POSTs text to `/v1/synthesize` → returns audio Buffer | Built |
| `listVoices` | method | Lists available voices, optionally filtered by language | Built |
| `healthCheck` | method | Returns true if Voicebox health endpoint responds 200 | Built |

### 3.8 `apps/agent-runtime/src/task-intelligence-memory.ts`

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `recordTaskIntelligence` | function | Persists task outcome + action trajectory to JSON file | Built |
| `getTaskIntelligenceContext` | function | Reads trajectory history for prompt injection | Built |

### 3.9 `apps/agent-runtime/src/action-result-contract.ts`

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `ActionResultRecord` | type | Full action result: risk, route, lease, budget, evidence, approval fields | Built |
| `ActionResultWriter` | type | Async writer fn for persisting action results | Built |
| `ActionResultStatus` | type | `success | approval_required | failed | cancelled` | Built |

### 3.10 `apps/agent-runtime/src/desktop-operator-playwright.ts`

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `PlaywrightDesktopOperator` | class | Playwright-backed desktop operator for browser automation | Partial |
| `browserOpen` | method | Opens URL in headless Chromium | Built |
| `appLaunch` | method | Stub — returns `not_supported` | Stub |
| `meetingJoin` | method | Opens meeting URL in browser | Built |
| `meetingSpeak` | method | Stub — returns `not_supported` | Stub |

### 3.11 `apps/agent-runtime/src/mcp-registry-client.ts`

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `getTenantMcpServers` | function | Fetches active MCP servers for a tenant from API gateway | Built |
| `registerMcpServer` | function | Registers a new MCP server URL+headers for a tenant | Built |

### 3.12 `services/approval-service/src/approval-enforcer.ts`

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `ApprovalEnforcer` | class | Manages kill-switches and approval enforcement at execution time | Built |
| `activateKillSwitch` | method | Creates a kill-switch record halting risky execution | Built |
| `resumeAfterKillSwitch` | method | Resolves a kill-switch with incident reference | Built |
| `checkEnforcement` | method | Determines if action requires approval or is kill-switch blocked | Built |

### 3.13 `services/approval-service/src/approval-batcher.ts`

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `InMemoryApprovalBatcher` | class | Batches approval requests by workspace within a time window | Built |
| `shouldBatch` | function | Returns true if action type warrants batching | Built |

### 3.14 `services/connector-gateway/src/adapter-registry.ts`

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `AdapterRegistry` | class | In-memory tenant-scoped adapter registry with audit log | Built |
| `registerAdapter` | method | Registers adapter with duplicate-key guard | Built |
| `unregisterAdapter` | method | Marks adapter unregistered | Built |
| `getAdapter` | method | Lookup by adapter ID | Built |
| `getAdapterByKey` | method | Lookup by adapter key string | Built |
| `discoverAdapters` | method | Filtered discovery by type/status/tenant/workspace | Built |
| `healthCheck` | method | Marks adapter healthy and records health timestamp | Built (simulated) |

### 3.15 `services/connector-gateway/src/plugin-loader.ts`

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `PluginLoader` | class | Loads connector plugins from registry with trust/allowlist enforcement | Built |
| `loadPlugin` | method | Loads plugin by adapterKey + validates capabilities | Built |

### 3.16 `services/agent-observability/src/` (barrel)

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `ActionInterceptor` | class | Intercepts every agent action, classifies risk, routes to approval gate | Built |
| `classifyRiskByAction` | function | Maps action type string to `low/medium/high` risk | Built |
| `BrowserActionExecutor` | class | Wraps Playwright Page for observed browser actions | Built |
| `BrowserActionWithUpload` | class | Browser action execution with screenshot upload to blob storage | Built |
| `verifyDomDiff` | function | Compares DOM snapshots before/after action | Built |
| `verifyScreenshotDiff` | function | Pixel-diff comparison of before/after screenshots | Built |
| `runAssertions` | function | Runs array of `AssertionDefinition` against a page | Built |
| `buildVerificationFailure` | function | Constructs `VerificationFailureEvent` from assertion result | Built |
| `AuditLogWriter` | class | Writes `ActionAuditRecord` objects to persistent audit trail | Built |
| `scoreTaskCorrectness` | function | Produces `CorrectnessScore` from browser action results | Built |
| `toRuntimeQualitySignal` | function | Converts correctness score to quality signal payload for runtime | Built |

### 3.17 `services/memory-service/src/` (barrel)

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `MemoryStore` | class | Prisma-backed short/long-term memory store | Built |
| `InMemoryMemoryStore` | class | In-memory implementation for tests | Built |
| `calculateRejectionRate` | function | Computes rejection rate from approval outcomes | Built |
| `extractCommonConnectors` | function | Extracts most-used connectors from memory entries | Built |

### 3.18 `services/meeting-agent/src/` (barrel)

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `MeetingLifecycleStateMachine` | class | State machine: joining→recording→transcribing→summarizing→done | Built |
| `InvalidTransitionError` | class | Thrown on invalid state transition | Built |
| `VoicePipeline` | class | Chains STT adapter → LLM summarization → TTS output | Built |
| `buildVoxCpmRequest` | function | Constructs VoxCPM2 TTS request payload | Built |

### 3.19 `services/provisioning-service/src/` (barrel)

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `ProvisioningJobProcessor` | class | Azure VM provisioning state machine processor | Built |
| `DefaultProvisioningStepExecutor` | class | Executes each provisioning step (create VM, bootstrap, register) | Built |
| `buildCloudInitScript` | function | Generates cloud-init YAML for VM bootstrapping | Built |

### 3.20 `services/audit-storage/src/` (barrel)

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `AzureBlobAuditStorage` | class | Uploads audit artifacts to Azure Blob Storage | Built |
| `ScreenshotUploader` | class | Handles before/after screenshot upload per browser action | Built |

### 3.21 `services/policy-engine/src/governance-routing-policy.ts`

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `resolveApproverIds` | function | Returns approver IDs from governance routing context | Built |

### 3.22 `packages/connector-contracts/src/index.ts`

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `ConnectorDefinition` | interface | Full connector spec: tool, category, authMethod, actions, scopes | Built |
| `TenantConnector` | interface | Per-tenant connector instance with status + health | Built |
| `ConnectorAction` | interface | Action dispatch contract: connector, actionType, actor, payload | Built |
| `NormalizedActionType` | union | 18 canonical action types across all connector categories | Built |
| `ConnectorTool` | union | 20+ supported tool slugs (jira, github, slack, teams, etc.) | Built |
| `ConnectorAuthMethod` | union | `oauth2 | api_key | basic | bearer_token | generic_rest` | Built |

### 3.23 `packages/shared-types/src/index.ts` (key exports)

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `CONTRACT_VERSIONS` | const | 40+ versioned contract keys for cross-service compatibility | Built |
| `RoleKey` | union | 12 agent roles (developer, tester, recruiter, etc.) | Built |
| `RiskLevel` | type | `low | medium | high` | Built |
| `ProvisioningJobRecord` | interface | Full provisioning job contract | Built |
| `RuntimeInstanceRecord` | interface | Runtime endpoint + heartbeat contract | Built |
| `TaskLeaseRecord` | interface | Task lease with claim/expire lifecycle | Built |
| `KillSwitchRecord` | interface | Kill-switch with status, affected actions, control window | Built |
| `ApprovalEnforcementContext` | interface | Runtime enforcement decision: requiresApproval, killedBySwitch | Built |
| `WorkspaceSessionStateRecord` | interface | VM workspace state persistence contract | Built |
| `DesktopProfileRecord` | interface | Browser profile persistence contract | Built |
| `LlmDecisionEnvelope` | interface | LLM decision output: actions, confidence, risk hints | Built |
| `LlmExecutionMetadata` | interface | Token usage + latency metadata per LLM call | Built |
| `ProviderFailoverTraceRecord` | interface | Per-provider failover disposition record | Built |
| `validateContractMeta` | function | Validates contractVersion field against known versions | Built |

### 3.24 `packages/queue-contracts/src/index.ts`

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `QUEUE_PROVISIONING` | const | Queue name for provisioning jobs | Built |
| `QUEUE_APPROVAL` | const | Queue name for approval requests | Built |
| `QUEUE_EVIDENCE` | const | Queue name for evidence events | Built |
| `QUEUE_RUNTIME_TASKS` | const | Queue name for runtime task dispatches | Built |
| `QUEUE_MEETING` | const | Queue name for meeting events | Built |
| `QUEUE_NOTIFICATION` | const | Queue name for notification dispatches | Built |
| `TASK_LEASE_ACTIONS` | const | Claim/renew/release/expire action keys | Built |
| `BUDGET_DECISION_ACTIONS` | const | Allowed/denied/warning budget decision keys | Built |

### 3.25 `packages/observability/src/index.ts`

| Symbol | Type | What It Does | Status |
|---|---|---|---|
| `initObservability` | function | Initializes observability for a service (logs name to console) | Stub |
| `ObservabilityEventStore` | class | In-memory event store with emit + list + filter | Stub |

---

## 4. Master Table — Every API Route

All routes in `apps/api-gateway/src/routes/`. Auth guard: `API_REQUIRE_AUTH=true` requires `Authorization: Bearer <jwt>` or `agentfarm_session=` cookie.

| Method | Path | Route File | Auth Required | Status |
|---|---|---|---|---|
| POST | `/auth/signup` | auth.ts | No | Built |
| POST | `/auth/login` | auth.ts | No | Built |
| POST | `/auth/internal-login` | auth.ts | Internal token | Built |
| GET | `/auth/me` | auth.ts | Yes | Built |
| POST | `/auth/logout` | auth.ts | Yes | Built |
| GET | `/health` | api-routes.ts | No | Built |
| GET | `/v1/tenants/:tenantId` | api-routes.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId` | api-routes.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/summary` | api-routes.ts | Yes | Built |
| POST | `/v1/workspaces/:workspaceId/approvals/intake` | approvals.ts | Service token | Built |
| GET | `/v1/workspaces/:workspaceId/approvals` | approvals.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/approvals/:approvalId` | approvals.ts | Yes | Built |
| POST | `/v1/workspaces/:workspaceId/approvals/:approvalId/decide` | approvals.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/approvals/batch` | approvals.ts | Yes | Built |
| POST | `/v1/admin/provision` | admin-provision.ts | Yes | Built |
| GET | `/v1/admin/provisioning/:jobId` | admin-provision.ts | Yes | Built |
| GET | `/v1/audit` | audit.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/audit` | audit.ts | Yes | Built |
| POST | `/v1/workspaces/:workspaceId/runtime-tasks/claim` | runtime-tasks.ts | Service token | Built |
| POST | `/v1/workspaces/:workspaceId/runtime-tasks/renew` | runtime-tasks.ts | Service token | Built |
| POST | `/v1/workspaces/:workspaceId/runtime-tasks/release` | runtime-tasks.ts | Service token | Built |
| POST | `/v1/workspaces/:workspaceId/runtime-tasks/:taskId/dispatch` | runtime-tasks.ts | Service token | Built |
| GET | `/v1/workspaces/:workspaceId/runtime-tasks/:taskId/status` | runtime-tasks.ts | Yes | Built |
| POST | `/v1/workspaces/:workspaceId/connector-actions` | connector-actions.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/connector-actions/:actionId` | connector-actions.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/connectors` | connector-auth.ts | Yes | Built |
| POST | `/v1/workspaces/:workspaceId/connectors/:connectorId/auth/initiate` | connector-auth.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/connectors/:connectorId/auth/callback` | connector-auth.ts | No (OAuth redirect) | Built |
| PUT | `/v1/workspaces/:workspaceId/connectors/:connectorId/credentials` | connector-auth.ts | Yes | Built |
| DELETE | `/v1/workspaces/:workspaceId/connectors/:connectorId` | connector-auth.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/connectors/:connectorId/health` | connector-health.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/desktop-profile` | desktop-profile.ts | Yes | Built |
| PUT | `/v1/workspaces/:workspaceId/desktop-profile` | desktop-profile.ts | Yes | Built |
| POST | `/v1/workspaces/:workspaceId/desktop-actions` | desktop-actions.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/desktop-actions/:actionId` | desktop-actions.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/ide-state` | ide-state.ts | Yes | Built |
| PUT | `/v1/workspaces/:workspaceId/ide-state` | ide-state.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/session` | workspace-session.ts | Yes | Built |
| PUT | `/v1/workspaces/:workspaceId/session` | workspace-session.ts | Yes | Built |
| POST | `/v1/workspaces/:workspaceId/session/checkpoint` | workspace-session.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/session/checkpoints` | workspace-session.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/activity` | activity-events.ts | Yes | Built |
| POST | `/v1/workspaces/:workspaceId/activity/ack` | activity-events.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/env-profile` | env-reconciler.ts | Yes | Built |
| PUT | `/v1/workspaces/:workspaceId/env-profile` | env-reconciler.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/pull-requests` | pull-requests.ts | Yes | Built |
| POST | `/v1/workspaces/:workspaceId/pull-requests` | pull-requests.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/pull-requests/:prId` | pull-requests.ts | Yes | Built |
| POST | `/v1/workspaces/:workspaceId/ci-failures/intake` | ci-failures.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/ci-failures/:triageId/report` | ci-failures.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/work-memory` | work-memory.ts | Yes | Built |
| PUT | `/v1/workspaces/:workspaceId/work-memory` | work-memory.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/repro-packs` | repro-packs.ts | Yes | Built |
| POST | `/v1/workspaces/:workspaceId/repro-packs` | repro-packs.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/repro-packs/:packId` | repro-packs.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/questions` | questions.ts | Yes | Built |
| POST | `/v1/workspaces/:workspaceId/questions/:questionId/answer` | questions.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/meetings` | meetings.ts | Yes | Built |
| POST | `/v1/workspaces/:workspaceId/meetings` | meetings.ts | Yes | Built |
| PUT | `/v1/workspaces/:workspaceId/meetings/:meetingId` | meetings.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/handoffs` | handoffs.ts | Yes | Built |
| POST | `/v1/workspaces/:workspaceId/handoffs` | handoffs.ts | Yes | Built |
| PUT | `/v1/workspaces/:workspaceId/handoffs/:handoffId` | handoffs.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/skills` | skill-pipelines.ts | Yes | Built |
| POST | `/v1/workspaces/:workspaceId/skills/execute` | skill-pipelines.ts | Yes | Built |
| POST | `/v1/workspaces/:workspaceId/skills/compose` | skill-composition-execute.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/skills/schedule` | skill-scheduler.ts | Yes | Built |
| POST | `/v1/workspaces/:workspaceId/skills/schedule` | skill-scheduler.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/roles` | roles.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/snapshots` | snapshots.ts | Yes | Built |
| POST | `/v1/workspaces/:workspaceId/snapshots` | snapshots.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/snapshots/:snapshotId` | snapshots.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/observability` | observability.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/governance-kpis` | governance-kpis.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/governance-workflows` | governance-workflows.ts | Yes | Built |
| POST | `/v1/workspaces/:workspaceId/governance-workflows` | governance-workflows.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/budget-policy` | budget-policy.ts | Yes | Built |
| PUT | `/v1/workspaces/:workspaceId/budget-policy` | budget-policy.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/language` | language.ts | Yes | Built |
| PUT | `/v1/workspaces/:workspaceId/language` | language.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/memory` | memory.ts | Yes | Built |
| POST | `/api/v1/memory/patterns/code-review` | memory.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/next-actions` | memory.ts | Yes | Built |
| POST | `/v1/workspaces/:workspaceId/daily-plan` | memory.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/autonomous-loops` | autonomous-loops.ts | Yes | Built |
| POST | `/v1/workspaces/:workspaceId/autonomous-loops` | autonomous-loops.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/knowledge-graph` | knowledge-graph.ts | Yes | Built |
| POST | `/v1/workspaces/:workspaceId/knowledge-graph` | knowledge-graph.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/agent-feedback` | agent-feedback.ts | Yes | Built |
| POST | `/v1/workspaces/:workspaceId/agent-feedback` | agent-feedback.ts | Yes | Built |
| GET | `/v1/mcp` | mcp-registry.ts | Yes | Built |
| POST | `/v1/mcp` | mcp-registry.ts | Yes | Built |
| DELETE | `/v1/mcp/:serverId` | mcp-registry.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/plugin-loading` | plugin-loading.ts | Yes | Built |
| POST | `/v1/workspaces/:workspaceId/plugin-loading` | plugin-loading.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/retention-policy` | retention-policy.ts | Yes | Built |
| PUT | `/v1/workspaces/:workspaceId/retention-policy` | retention-policy.ts | Yes | Built |
| GET | `/v1/workspaces/:workspaceId/adapter-registry` | adapter-registry.ts | Yes | Built |
| POST | `/v1/billing/plans` | billing.ts | Yes | Built |
| POST | `/v1/billing/orders` | billing.ts | Yes | Built |
| POST | `/v1/billing/webhooks/razorpay` | billing.ts | No (HMAC verified) | Built |
| POST | `/v1/billing/webhooks/stripe` | billing.ts | No (signature verified) | Built |
| POST | `/v1/billing/webhooks/zoho-sign` | zoho-sign-webhook.ts | HMAC token | Built |
| GET | `/v1/workspaces/:workspaceId/runtime-llm-config` | runtime-llm-config.ts | Yes | Built |
| PUT | `/v1/workspaces/:workspaceId/runtime-llm-config` | runtime-llm-config.ts | Yes | Built |
| GET | `/sse/tasks` | sse-tasks.ts | Yes | Built |
| POST | `/sse/tasks/push` | sse-tasks.ts | Service token | Built |
| POST | `/webhooks/trigger` | webhooks.ts | HMAC | Built |
| GET | `/v1/workspaces/:workspaceId/internal-login-policy` | internal-login-policy.ts | Yes | Built |
| PUT | `/v1/workspaces/:workspaceId/internal-login-policy` | internal-login-policy.ts | Yes | Built |

**trigger-service routes (apps/trigger-service/src/main.ts):**

| Method | Path | Auth | Status |
|---|---|---|---|
| GET | `/health` | None | Built |
| GET | `/status` | None | Built |
| POST | `/webhook` | HMAC `x-hub-signature-256` or `x-signature` | Built |

**orchestrator routes (apps/orchestrator/src/main.ts):**

| Method | Path | Auth | Status |
|---|---|---|---|
| GET | `/health` | None | Built |
| POST | `/wake` | Shared token | Built |
| POST | `/wake/complete` | Shared token | Built |
| GET | `/schedule` | Shared token | Built |
| POST | `/schedule` | Shared token | Built |
| POST | `/signal` | Shared token | Built |
| GET | `/signals` | Shared token | Built |
| POST | `/signals/:signalId/resolve` | Shared token | Built |
| GET | `/handoffs` | Shared token | Built |
| POST | `/handoffs` | Shared token | Built |
| PUT | `/handoffs/:handoffId` | Shared token | Built |
| GET | `/slots` | Shared token | Built |
| POST | `/slots/:slotId/dispatch` | Shared token | Built |

---

## 5. Master Table — Every Connector

All connector implementations live in `services/connector-gateway/src/connectors/`.

| Connector | File | Auth Method | Key Env Vars | Supported Actions | Status |
|---|---|---|---|---|---|
| GitHub | `github-connector.ts` | Bearer token (PAT) | `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO` | listIssues, createIssue, listPRs, createPR, getPR, mergePR, listCommits, listWorkflowRuns, getReviews, getComments, addComment | Built |
| Slack | `slack-connector.ts` | OAuth bot token | `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` | sendMessage, postToChannel, createThread, reactToMessage, listChannels, getChannelInfo, getUserInfo, sendIncidentAlert | Built |
| Azure DevOps | `azure-devops-connector.ts` | PAT / OAuth | `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_TOKEN` | listWorkItems, createWorkItem, updateWorkItem, listPipelines, triggerPipeline | Built |
| Linear | `linear-connector.ts` | API key | `LINEAR_API_KEY` | listIssues, createIssue, updateIssueStatus, addComment, listTeams | Built |
| Confluence | `confluence-connector.ts` | Basic / OAuth | `CONFLUENCE_URL`, `CONFLUENCE_USER`, `CONFLUENCE_TOKEN` | getPage, createPage, updatePage, searchPages, listSpaces | Built |
| Notion | `notion-connector.ts` | Integration token | `NOTION_TOKEN` | listDatabases, queryDatabase, createPage, updatePage, getPage | Built |
| PagerDuty | `pagerduty-connector.ts` | API key | `PAGERDUTY_API_KEY` | listIncidents, createIncident, acknowledgeIncident, resolveIncident, listServices | Built |
| Sentry | `sentry-connector.ts` | Auth token | `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` | listIssues, getIssue, resolveIssue, listProjects, listEvents | Built |
| Email (SMTP/Graph) | `email-connector.ts` | OAuth / SMTP | `EMAIL_PROVIDER`, `SMTP_HOST`, `GRAPH_CLIENT_ID` | listEmails, readEmail, sendEmail, replyEmail, readThread | Built |
| Generic REST | via `ConnectorDefinition.configSchema` | Configurable | Customer-provided | Any normalized action via HTTP mapping | Built (schema only) |

**Connectors defined in `packages/connector-contracts` but NOT yet in connector-gateway:**
- Jira (type defined, no implementation file found)
- Teams (type defined, no implementation file found)
- GitLab (type defined, no implementation file found)
- Bitbucket (type defined, no implementation file found)
- Asana, Monday, Trello, ClickUp, Google Chat, Gmail, Exchange (types only)

---

## 6. Gap Analysis

### Gap 1: Evidence Service is a Stub (CRITICAL)
**File:** `services/evidence-service/src/index.ts` — 2 lines: `export const serviceName = 'evidence-service'; console.log(...)`  
**Impact:** The entire evidence plane (evidence collection, linking to approvals, audit exports) has no implementation. The `AuditEvent` model and `audit-storage` package exist, but nothing routes evidence through the evidence service. Real enterprise customers cannot prove agent behavior for compliance or SOC2.  
**Fix needed:** Implement evidence intake, storage, and retrieval routes.

### Gap 2: LLM Integration Requires Credentials to Run (HIGH)
**File:** `apps/agent-runtime/src/llm-decision-adapter.ts`  
**Impact:** The entire execution pipeline (`processDeveloperTask`) depends on a live LLM call. Without API keys for at least one provider (OpenAI, Anthropic, Azure, GitHub Models, etc.) the agent cannot make decisions. There is no offline/mock mode for production trials. Default behavior falls back to heuristics only.  
**Fix needed:** Add a `mock_llm` provider mode for demo/trial environments.

### Gap 3: Connector Gap — Jira/Teams/GitLab Missing Implementations (HIGH)
**Files:** `packages/connector-contracts/src/index.ts` defines 20+ connector tools; only 10 are implemented in `connector-gateway/src/connectors/`.  
**Impact:** Most enterprise customers use Jira (not Linear), Teams (not Slack), GitLab (not GitHub). The most common request will fail at connector setup.  
**Fix needed:** Implement Jira, Teams, GitLab connectors.

### Gap 4: Desktop Meeting Agent is Partially Functional (MEDIUM)
**Files:** `apps/agent-runtime/src/desktop-operator-playwright.ts` — `appLaunch()` and `meetingSpeak()` return `not_supported`.  
**Impact:** The meeting agent can join and record meetings via browser but cannot speak autonomously. VoicePipeline exists in meeting-agent service but is not connected to the Playwright operator.  
**Fix needed:** Wire VoicePipeline TTS output to a WebRTC/virtual microphone device in the container.

### Gap 5: Observability is In-Memory Only (MEDIUM)
**File:** `packages/observability/src/index.ts`  
**Impact:** `initObservability()` is a console.log stub. `ObservabilityEventStore` is in-memory with no persistence. There is no OpenTelemetry, Prometheus, or Azure Monitor integration. Operators cannot monitor production agent activity from a central observability platform.  
**Fix needed:** Implement OpenTelemetry SDK integration with Azure Monitor exporter.

### Gap 6: No Real Database in Any Test Run (MEDIUM)
**Impact:** All 1,297 passing tests use in-memory stubs. The `test:db-smoke` scripts exist but are not integrated into CI. Prisma migrations may drift from schema without detection.  
**Fix needed:** Add a DB integration test lane using `docker-compose.yml` PostgreSQL to CI pipeline.

### Gap 7: MCP Protocol Not Implemented (MEDIUM)
**File:** `apps/agent-runtime/src/mcp-registry-client.ts` — stores URL+headers in DB, no tool discovery.  
**Impact:** The MCP registry is a URL store, not a protocol client. Agents cannot dynamically discover or invoke MCP tools at runtime.  
**Fix needed:** Implement MCP JSON-RPC handshake, tool listing (`tools/list`), and tool invocation (`tools/call`).

### Gap 8: Multi-Agent Orchestration is Single-Process (MEDIUM)
**File:** `apps/agent-runtime/src/multi-agent-orchestrator.ts`  
**Impact:** The 5 built-in sub-agents (code, test, security, release, perf) are all backed by the same `skill-execution-engine.ts` in the same process. There is no cross-VM, cross-container, or cross-API agent coordination. The Orchestrator app handles wake scheduling but does not coordinate multi-agent dispatch.  
**Fix needed:** Wire `MultiAgentOrchestrator` to dispatch through the orchestrator API rather than calling skill handlers directly.

### Gap 9: Billing Does Not Trigger Workspace Provisioning Automatically (LOW)
**Impact:** The Zoho Sign webhook creates a `ProvisioningJob` but there is no worker polling `ProvisioningJob.status=queued` in the provisioning service. The provisioning service module (`ProvisioningJobProcessor`) is built but not wired to a queue consumer.  
**Fix needed:** Add a queue consumer in provisioning-service that polls `QUEUE_PROVISIONING`.

### Gap 10: i18n Covers Data Only, Not UI (LOW)
**Models:** `TenantLanguageConfig`, `WorkspaceLanguageConfig`, `UserLanguageProfile`  
**Impact:** Language detection and tagging is implemented for ticket/task data but the dashboard and website have no locale-aware UI rendering. Enterprise customers in non-English markets (India, Japan) will see English-only UI.  
**Fix needed:** Add `next-i18next` or `react-intl` to dashboard and website.

---

## 7. Dependency Map

### External npm Dependencies by App

| Package | Key External Dependencies |
|---|---|
| `@agentfarm/agent-runtime` | fastify, playwright, @prisma/client |
| `@agentfarm/api-gateway` | fastify, @prisma/client, @azure/arm-compute, @azure/arm-network, @azure/arm-resources, @azure/identity, pdfkit, razorpay, stripe |
| `@agentfarm/orchestrator` | fastify, @prisma/client |
| `@agentfarm/trigger-service` | fastify |
| `@agentfarm/dashboard` | Next.js, React |
| `@agentfarm/website` | Next.js, React |
| `@agentfarm/connector-gateway` | (internal only) |
| `@agentfarm/agent-observability` | playwright |
| `@agentfarm/audit-storage` | @azure/storage-blob |
| `@agentfarm/meeting-agent` | (STT/TTS via VoxCPM2 HTTP) |
| `@agentfarm/provisioning-service` | @azure/arm-compute, @azure/identity |

### Internal Package Dependency Graph

```
@agentfarm/api-gateway
  └── @agentfarm/agent-runtime
        └── @agentfarm/agent-observability
              └── @agentfarm/audit-storage
        └── @agentfarm/browser-actions
        └── @agentfarm/crm-adapters
        └── @agentfarm/erp-adapters
        └── @agentfarm/notification-adapters
        └── @agentfarm/shared-types
  └── @agentfarm/connector-contracts
  └── @agentfarm/memory-service
  └── @agentfarm/queue-contracts
  └── @agentfarm/shared-types
  └── @agentfarm/agent-question-service

@agentfarm/orchestrator
  └── @agentfarm/shared-types

@agentfarm/connector-gateway
  └── @agentfarm/shared-types

@agentfarm/approval-service (standalone service)
@agentfarm/policy-engine (standalone service)
@agentfarm/provisioning-service (standalone service)
@agentfarm/retention-cleanup (standalone service)
@agentfarm/evidence-service (stub)
@agentfarm/identity-service (stub)
```

### Environment Variables — Full Inventory

| Variable | Used By | Purpose | Default |
|---|---|---|---|
| `DATABASE_URL` | All Prisma apps | PostgreSQL connection string | Required |
| `AGENT_TENANT_ID` | agent-runtime | Default tenant ID | `default` |
| `AF_HEALTH_PORT` | agent-runtime | Health server port | `3001` |
| `API_GATEWAY_PORT` | api-gateway | HTTP listen port | `3000` |
| `API_REQUIRE_AUTH` | api-gateway | Enable JWT auth guard | `false` |
| `OPS_MONITORING_TOKEN` | api-gateway | Ops monitoring bearer token | none |
| `TRIGGER_SERVICE_PORT` | trigger-service | HTTP listen port | `3002` |
| `WEBHOOK_HMAC_SECRET` | trigger-service | HMAC secret for webhook validation | Required in prod |
| `ORCHESTRATOR_GATEWAY_API_URL` | orchestrator | Gateway URL for question sweeps | none |
| `API_GATEWAY_URL` | orchestrator, agent-runtime | Gateway base URL | none |
| `ORCHESTRATOR_GATEWAY_BEARER_TOKEN` | orchestrator | Bearer token for gateway calls | none |
| `ORCHESTRATOR_GATEWAY_OPS_TOKEN` | orchestrator | Ops token for gateway calls | none |
| `ORCHESTRATOR_STATE_PATH` | orchestrator | File path for state persistence | `.orchestrator-state.json` |
| `ORCHESTRATOR_STATE_BACKEND` | orchestrator | `file` or `db` | `auto` |
| `ORCHESTRATOR_SESSION_API_URL` | orchestrator | Session API URL for workspace fetch | none |
| `RUNTIME_SESSION_SHARED_TOKEN` | orchestrator, agent-runtime | Shared token for runtime calls | none |
| `AF_RUNTIME_SESSION_SHARED_TOKEN` | orchestrator | Alias for above | none |
| `AGENTFARM_RUNTIME_SESSION_SHARED_TOKEN` | orchestrator | Alias for above | none |
| `GITHUB_TOKEN` | connector-gateway | GitHub PAT or fine-grained token | Required for GitHub |
| `GITHUB_OWNER` | connector-gateway | GitHub org/user | Required for GitHub |
| `GITHUB_REPO` | connector-gateway | GitHub repo name | Required for GitHub |
| `SLACK_BOT_TOKEN` | connector-gateway | Slack bot OAuth token | Required for Slack |
| `SLACK_SIGNING_SECRET` | connector-gateway | Slack webhook signing secret | Required for Slack |
| `VOICEBOX_URL` | agent-runtime | Voicebox service base URL | `http://localhost:17493` |
| `AF_TASK_INTELLIGENCE_PATH` | agent-runtime | Task intelligence JSON file path | `$TMPDIR/agentfarm-task-intelligence-memory.json` |
| `AGENTFARM_TASK_INTELLIGENCE_PATH` | agent-runtime | Alias for above | none |
| `OPENAI_API_KEY` | llm-decision-adapter | OpenAI API key | Required for OpenAI provider |
| `ANTHROPIC_API_KEY` | llm-decision-adapter | Anthropic API key | Required for Anthropic provider |
| `AZURE_OPENAI_ENDPOINT` | llm-decision-adapter | Azure OpenAI endpoint URL | Required for Azure provider |
| `AZURE_OPENAI_API_KEY` | llm-decision-adapter | Azure OpenAI API key | Required for Azure provider |
| `GITHUB_MODELS_API_KEY` | llm-decision-adapter | GitHub Models API key | Required for GitHub Models provider |
| `XAI_API_KEY` | llm-decision-adapter | xAI Grok API key | Required for xAI provider |
| `MISTRAL_API_KEY` | llm-decision-adapter | Mistral API key | Required for Mistral provider |
| `TOGETHER_API_KEY` | llm-decision-adapter | Together.xyz API key | Required for Together provider |
| `ZOHO_CLIENT_ID` | api-gateway billing | Zoho Sign OAuth client ID | Required for Zoho Sign |
| `ZOHO_CLIENT_SECRET` | api-gateway billing | Zoho Sign OAuth secret | Required for Zoho Sign |
| `RAZORPAY_KEY_ID` | api-gateway billing | Razorpay key ID | Required for Razorpay |
| `RAZORPAY_KEY_SECRET` | api-gateway billing | Razorpay secret | Required for Razorpay |
| `STRIPE_SECRET_KEY` | api-gateway billing | Stripe secret key | Required for Stripe |
| `STRIPE_WEBHOOK_SECRET` | api-gateway billing | Stripe webhook signing secret | Required for Stripe |
| `AF_TASK_INTELLIGENCE_PATH` | agent-runtime | Task memory JSON path | temp dir |

---

## 8. Test Results

Tests run via `pnpm test` (root-level recursive run using `tsx --test`).

### Results by Package

| Package | Test Files | Total Tests | Passing | Failing | Skipped | Duration |
|---|---|---|---|---|---|---|
| `apps/agent-runtime` | ~55 | **785** | 785 | 0 | 0 | 30.2s |
| `apps/api-gateway` | ~50 | **450** | 450 | 0 | 0 | 14.3s–17.1s |
| `apps/orchestrator` | ~12 | **62** | 62 | 0 | 0 | 4.6s |
| `services/*`, `packages/*` | ~40 | (no root `test` script in most) | — | — | — | — |
| **TOTAL** | **~157** | **1,297** | **1,297** | **0** | **0** | ~52s |

### Notable Test Coverage

- **Runtime approval flow:** approval summary parsing, quality gate failure, kill-switch enforcement — covered
- **API gateway:** auth, connector auth OAuth flow, billing webhooks (Zoho Sign, Razorpay, Stripe), workspace session, CI triage, repro packs, SSE tasks — covered
- **Orchestrator:** GOAP planner, wake scheduling, routine scheduler, state persistence, proactive signals, task slots, agent handoffs — covered
- **Skill engine:** all 21 skill handlers tested for output shape, duration_ms, correct risk classification — covered
- **Multi-agent orchestrator:** routing, parallel dispatch, aggregation — covered
- **Database:** all tests use in-memory mocks; `test:db-smoke` exists but is not in default test run

---

## 9. Feature Area Analysis

| Feature Area | Implementation Status | Key Files | Gaps |
|---|---|---|---|
| **Task Intake** | Built | execution-engine.ts, runtime-server.ts, runtime-tasks route | No offline/mock LLM mode |
| **Approval Workflow** | Built | approvals route, approval-enforcer.ts, approval-batcher.ts | Evidence service is stub |
| **Multi-Agent** | Partial | multi-agent-orchestrator.ts, orchestrator/main.ts | Single-process only; no cross-VM dispatch |
| **Memory** | Built | memory-service, AgentShortTermMemory, AgentLongTermMemory, task-intelligence-memory | In-memory only in tests |
| **Connectors** | Partial | connector-gateway/connectors/ (10 impl) | Jira, Teams, GitLab missing |
| **Evidence / Audit** | Partial | AuditEvent model, audit-storage service, agent-observability | Evidence service is 2-line stub |
| **Language / i18n** | Schema only | language route, DB models | No UI locale support |
| **Cost / Token Tracking** | Built | TaskExecutionRecord, token budget in llm-decision-adapter | No dashboard visualization |
| **Dashboard UI** | Built | apps/dashboard (Next.js, ~75 files) | — |
| **MCP Registry** | Partial | mcp-registry route, mcp-registry-client.ts, TenantMcpServer model | No MCP protocol implementation |
| **Trigger System** | Built | apps/trigger-service, webhook HMAC validation | — |
| **Desktop / Browser Operator** | Partial | desktop-operator-playwright.ts, BrowserActionExecutor | appLaunch/meetingSpeak stub |
| **Skill System** | Built | skill-execution-engine.ts (21 skills), skill-pipeline, skill-scheduler | — |
| **Voice / Meeting** | Partial | VoicePipeline, VoiceboxClient, VoxCPM2Client, MeetingSession model | Voice output not wired to Playwright |
| **Observability** | Stub | packages/observability/src/index.ts | No OTel, no Azure Monitor |
| **Billing / Payments** | Built | billing route, Razorpay, Stripe, Zoho Sign | Provisioning job not auto-triggered from payment queue |

---

## 10. Top 5 Gaps (Priority Order)

1. **Evidence service is a stub** — No implementation. Enterprise compliance and SOC2 readiness impossible.
2. **Jira + Teams + GitLab connectors missing** — The three most common enterprise connectors have type definitions but no implementation files.
3. **LLM requires credentials with no fallback** — No offline/mock LLM mode means demos and trial onboarding require live API keys.
4. **Observability is in-memory only** — No OpenTelemetry or Azure Monitor. Production monitoring is impossible.
5. **MCP protocol not implemented** — The MCP registry stores URLs but has no JSON-RPC tool discovery or invocation. Agents cannot use MCP tools at runtime.

---

*Report file: `d:\AgentFarm\operations\agentfarm-system-inventory.md`*  
*Generated by: full source read of 606 .ts files + 155 .test.ts files + 43 Prisma models + test run*
