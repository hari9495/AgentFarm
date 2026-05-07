# AgentFarm — Technical Reference

AgentFarm is a TypeScript pnpm monorepo for operating AI agents with enterprise control gates. The platform delivers one production-grade Developer Agent role backed by 18 connectors across 4 categories, risk-based autonomy with human approval enforcement, 12 tiers of local workspace actions, a desktop-operator abstraction layer, 10 LLM providers with health-score failover, and a complete audit and evidence path for compliance teams.

**1,392 tests passing across 14 packages. Quality gate: 47 checks, 46 PASS, 1 SKIP (DB smoke).**

---

## What We Built

### MVP Outcome
- One production-grade Developer Agent role operating across Jira, Teams, GitHub, Outlook, and more
- 18 connectors in the plugin registry (13 named + 5 generic REST variants) across 4 categories
- Risk-based autonomy: low-risk actions execute immediately, medium/high actions route to the human approval queue
- Full audit and evidence path: append-only audit log, compliance export (JSON and CSV), evidence freshness dashboard
- 12-tier local workspace action system with 70+ action types for the Developer Agent
- Desktop Operator abstraction: frozen interface + mock factory for browser, app launch, meeting join/speak
- 10 LLM providers with Auto mode and health-score-based failover, 4 configurable model profiles
- Budget policy enforcement: per-workspace daily/monthly limits with hard stop and ledger events
- Orchestrator with heartbeat wake model, routine scheduling, GOAP A* planner, plugin capability guard
- 179-agent marketplace catalogue across 29 departments
- Website with 51 pages, 43 API routes, and superadmin portal
- Operator dashboard with 14 UI components, runtime proxy, budget panel, governance workflow panel

---

## System Architecture

### Monorepo Boundaries

```
apps/         deployable surfaces and runtime entrypoints
services/     domain services (provisioning, approvals, connectors, evidence, identity, notifications, meetings, memory, questions)
packages/     shared types, contracts, schema, observability
infrastructure/  Azure control-plane and runtime-plane IaC
```

### Applications

| App | Port | Purpose | Tests |
|-----|------|---------|-------|
| `apps/api-gateway` | 3001 | Control-plane API: auth, session, connector execution, approvals, audit, budget policy, roles, snapshots, plugin loading, LLM config, governance workflows, SSE task-stream | 388 |
| `apps/agent-runtime` | — | Per-tenant execution engine: risk classification, LLM dispatch, 12-tier workspace actions, desktop-operator factory | 661 |
| `apps/dashboard` | 3000 | Operator UI: approval queue, evidence panel, runtime observability, LLM config, governance workflows, plugin loading, budget panel, workspace switcher, Kanban board | 118 |
| `apps/website` | 3002 | Product surface: 51 pages, 43 API routes, auth, connectors, marketplace, approvals, evidence, superadmin | 118 |
| `apps/orchestrator` | — | Multi-agent coordinator: heartbeat wake model, routine scheduler, plugin capability guard, GOAP A* planner, state persistence | 62 |

### Domain Services

| Service | Purpose | Tests |
|---------|---------|-------|
| `services/provisioning-service` | 11-step VM provisioning state machine, bootstrap, SLA monitoring, cleanup | 15 |
| `services/approval-service` | Approval enforcement, kill-switch, governance workflow manager, approval batcher | 12 |
| `services/connector-gateway` | OAuth flows, token lifecycle, adapter registry, adapter dispatch, mTLS verifier, PII-strip middleware | 36 |
| `services/policy-engine` | Governance routing policy and rule resolution | 2 |
| `services/evidence-service` | Governance KPI calculator (P50/P95/P99), HNSW vector index for evidence search | 24 |
| `services/agent-observability` | Action interception, browser action capture, diff verification, correctness scoring, audit log writer | 9 |
| `services/notification-service` | Approval-scoped notification gateway: Telegram, Slack, Discord, Webhook, Voice (VoxCPM/VoIP) | 31 |
| `services/meeting-agent` | Meeting lifecycle state machine, voice pipeline, STT/TTS adapters | 23 |
| `services/memory-service` | Long-term memory store: read/write/update, post-task crystallization | 11 |
| `services/agent-question-service` | Async agent Q&A with human teammates, expiry sweeper | — |
| `services/audit-storage` | Azure Blob screenshot uploader, audit evidence persistence | — |
| `services/compliance-export` | JSON/CSV compliance evidence packs | — |
| `services/retention-cleanup` | Scheduled retention cleanup (365-day active / 730-day archive) | — |
| `services/identity-service` | Tenant, workspace, user lifecycle (stub) | — |

### Shared Packages

| Package | Purpose |
|---------|---------|
| `packages/shared-types` | 100+ versioned contract types, enums, kill-switch types, GOAP plan types, skills crystallization types, voice/meeting types, `DesktopOperator` interface |
| `packages/connector-contracts` | 18-connector plugin registry, 18 normalized action types, 12 role policy keys |
| `packages/queue-contracts` | Queue event type definitions |
| `packages/db-schema` | Prisma schema and 10 migrations |
| `packages/observability` | Structured telemetry helpers |

---

## Contract Versioning

`packages/shared-types/src/index.ts` exports `CONTRACT_VERSIONS` — all pinned at `'1.0.0'`.

Core contracts: `PROVISIONING`, `RUNTIME`, `TASK_LEASE`, `BUDGET_DECISION`, `CONNECTOR_ACTION`, `APPROVAL`, `ACTION`, `AUDIT_EVENT`, `GOVERNANCE_WORKFLOW`, `PLUGIN_LOADING`

Sprint 2–4 additions: `WORKSPACE_SESSION_STATE`, `DESKTOP_PROFILE`, `IDE_STATE`, `TERMINAL_SESSION`, `ACTIVITY_EVENT`, `ENV_PROFILE`, `DESKTOP_ACTION`, `PR_AUTOMATION`, `CI_TRIAGE`, `WORK_MEMORY`, `REPRO_PACK`, `MEETING_SESSION`, `VOICE_TRANSCRIPT`, `NOTIFICATION`, `GOAL_PLAN`, `SKILL`, `AGENT_MEMORY`, `PROACTIVE_SIGNAL`, `APPROVAL_BATCH`, `QUALITY_SIGNAL`, `AGENT_HANDOFF`

Human-parity additions: `TASK_PROGRESS`, `AGENT_QUESTION`, `WEB_RESEARCH`, `REVIEW_LESSON`, `EFFORT_ESTIMATE`, `PACKAGE_OPERATION`, `VISION_ANALYSIS`, `TASK_SLOT`

Audit additions: `BROWSER_AUDIT`, `RETENTION_POLICY`

---

## Desktop Operator Abstraction

`packages/shared-types/src/desktop-operator.ts` — **frozen 2026-05-08** (interface never changes; only adapters change).

```typescript
interface DesktopOperator {
  browserOpen(url: string, browser?: string): Promise<DesktopOperatorResult>;
  appLaunch(app: string, args?: string[]): Promise<DesktopOperatorResult>;
  meetingJoin(meetingUrl: string, mode?: string): Promise<DesktopOperatorResult>;
  meetingSpeak(text: string): Promise<DesktopOperatorResult>;
}

interface DesktopOperatorResult { ok: boolean; output: string; durationMs: number; errorOutput?: string; }
type DesktopOperatorProvider = 'native' | 'mock';
```

`apps/agent-runtime/src/desktop-operator-factory.ts`:
- `MockDesktopOperator` — logs all calls, always returns `{ ok: true }`, used in CI and local dev
- `getDesktopOperator()` — reads `process.env.DESKTOP_OPERATOR`; `'mock'` returns mock; `'native'` or unset currently returns mock with a TODO for the real adapter

**Wired into `local-workspace-executor.ts`**: each of the four Tier 11 desktop action cases (`workspace_browser_open`, `workspace_app_launch`, `workspace_meeting_join`, `workspace_meeting_speak`) checks `DESKTOP_OPERATOR === 'mock'` at the top and short-circuits to the mock before any native execution logic.

---

## Connector Plugin Registry

`packages/connector-contracts/src/index.ts` exports a typed `CONNECTOR_REGISTRY` of 18 connectors:

| Category | Named Connectors | Custom Connector |
|----------|-----------------|-----------------|
| `task_tracker` | Jira, Linear, Asana, Monday, Trello, ClickUp | `generic_rest` |
| `messaging` | Microsoft Teams, Slack | `generic_rest_messaging` |
| `code` | GitHub, GitLab, Azure DevOps | `generic_rest_code` |
| `email` | Outlook (Microsoft Graph), Gmail | `generic_rest_email`, `generic_smtp` |

Auth methods: `oauth2`, `api_key`, `basic`, `bearer_token`, `generic_rest`

Each `ConnectorDefinition` carries: `tool`, `label`, `category`, `authMethod`, `configSchema`, `allowedRoles`, `defaultActionPolicyByRole`, and `oauthInitUrl` (OAuth connectors).

Exports: `getConnectorDefinition(tool)`, `getConnectorsByCategory(category)`, `isTrustedPluginPublisher`, `isValidPluginManifest`, `verifyPluginManifestSignature`, `ExternalPluginManifestContract`, `TrustedPublisherRule`.

### Normalized Action Types (18)

| Type | Category |
|------|----------|
| `get_task`, `create_task`, `update_task_status`, `add_comment`, `assign_task`, `list_tasks` | Task tracker |
| `send_message`, `create_channel`, `mention_user` | Messaging |
| `create_pr`, `add_pr_comment`, `merge_pr`, `list_prs` | Code |
| `list_emails`, `read_email`, `send_email`, `reply_email`, `read_thread` | Email |

### Agent Role Keys (12)

| Role Key | Description |
|----------|-------------|
| `recruiter` | Recruiter workflows |
| `developer` | Software development tasks |
| `fullstack_developer` | Full-stack development tasks |
| `tester` | QA and test automation |
| `business_analyst` | Business analysis and requirements |
| `technical_writer` | Documentation and technical content |
| `content_writer` | Marketing and general content |
| `sales_rep` | Sales workflows and outreach |
| `marketing_specialist` | Marketing campaigns |
| `corporate_assistant` | Corporate coordination tasks |
| `customer_support_executive` | Customer support workflows |
| `project_manager_product_owner_scrum_master` | PM/PO/Scrum combined role |

---

## LLM Decision Adapter

`apps/agent-runtime/src/llm-decision-adapter.ts`

### Providers (10)

`agentfarm` | `openai` | `azure_openai` | `github_models` | `anthropic` | `google` | `xai` | `mistral` | `together` | `auto`

`auto` uses health-score-based failover: 5-minute rolling composite (error rate + latency).

### Model Profiles (4)

| Profile | Description |
|---------|-------------|
| `quality_first` | Prioritizes highest-capability models |
| `speed_first` | Prioritizes lowest-latency models |
| `cost_balanced` | Balances cost vs. quality |
| `custom` | User-defined per-provider model selection |

### Provider Failover Trace

`ProviderFailoverTraceRecord` captures per-attempt: `provider`, `reasonCode` (`rate_limit` | `auth_failure` | `billing_disabled` | `timeout` | `provider_unavailable` | `unclassified`), `disposition` (`attempt_failed` | `skipped_cooldown` | `skipped_unconfigured`).

### LLM Workspace Config

`RuntimeLlmWorkspaceConfig` carries per-provider: `model`, `baseUrl`, `apiKey`, `modelProfiles`. Dashboard LLM config panel shows redacted key display. Routes: `GET/PUT /v1/workspaces/:workspaceId/llm-config`.

---

## Execution Engine and Risk Classification

`apps/agent-runtime/src/execution-engine.ts`

### Risk Classification

**HIGH_RISK_ACTIONS** (17):
`merge_release`, `merge_pr`, `delete_resource`, `change_permissions`, `deploy_production`, `git_push`, `run_shell_command`, `workspace_repl_start`, `workspace_repl_execute`, `workspace_dry_run_with_approval_chain`, `workspace_browser_open`, `workspace_app_launch`, `workspace_meeting_join`, `workspace_meeting_speak`, `workspace_meeting_interview_live`, `workspace_subagent_spawn`, `workspace_github_issue_fix`

**MEDIUM_RISK_ACTIONS** (40+): all mutating workspace-tier actions including `code_edit`, `code_edit_patch`, `git_commit`, `autonomous_loop`, `apply_patch`, `workspace_bulk_refactor`, `workspace_atomic_edit_set`, and all Tier 2–10 mutating operations.

Actions with confidence < 0.6 are escalated to medium risk regardless of action type.

### Key Types

- `TaskEnvelope`: `taskId`, `payload`, `lease`
- `ActionDecision`: `actionType`, `confidence`, `riskLevel`, `route` (`execute_immediately` | `route_to_approval`), `reason`
- `LlmDecisionMetadata`: `classificationSource`, `modelProvider`, `model`, `modelProfile`, `tokens`, `failoverTrace`
- `ProcessedTaskResult`: `decision`, `status`, `attempts`, `transientRetries`, `executionPayload`, `payloadOverrideSource`

---

## Developer Agent — 12-Tier Workspace Actions

`apps/agent-runtime/src/local-workspace-executor.ts` — `safeChildPath` sandbox enforcement on all file and shell operations. Tier 11 cases include `DESKTOP_OPERATOR=mock` short-circuits at the top of each case.

### Tier 1 — File and Directory (Claude Code parity)
`workspace_list_files`, `workspace_grep`, `file_move`, `file_delete`, `workspace_install_deps`

### Tier 2 — Autonomous Agent Operations
`run_linter`, `apply_patch`, `git_stash`, `git_log`, `workspace_scout`, `workspace_checkpoint`

### Tier 3 — IDE-Level Intelligence
`workspace_find_references`, `workspace_rename_symbol`, `workspace_extract_function`, `workspace_go_to_definition`, `workspace_hover_type`, `workspace_analyze_imports`, `workspace_code_coverage`, `workspace_complexity_metrics`, `workspace_security_scan`

### Tier 4 — Multi-File Coordination
`workspace_bulk_refactor`, `workspace_atomic_edit_set`, `workspace_generate_from_template`, `workspace_migration_helper`, `workspace_summarize_folder`, `workspace_dependency_tree`, `workspace_test_impact_analysis`

### Tier 5 — External Knowledge and REPL
`workspace_search_docs`, `workspace_package_lookup`, `workspace_ai_code_review`, `workspace_repl_start`, `workspace_repl_execute`, `workspace_repl_stop`, `workspace_debug_breakpoint`, `workspace_profiler_run`

### Tier 6 — Language Adapters
`workspace_language_adapter_python`, `workspace_language_adapter_java`, `workspace_language_adapter_go`, `workspace_language_adapter_csharp`

### Tier 7 — Governance and Safety
`workspace_dry_run_with_approval_chain` (**HIGH** risk), `workspace_change_impact_report`, `workspace_rollback_to_checkpoint`

### Tier 8 — Release and Collaboration
`workspace_generate_test`, `workspace_format_code`, `workspace_version_bump`, `workspace_changelog_generate`, `workspace_git_blame`, `workspace_outline_symbols`

### Tier 9 — Productivity Pilot
`workspace_create_pr`, `workspace_run_ci_checks`, `workspace_fix_test_failures`, `workspace_security_fix_suggest`, `workspace_pr_review_prepare`, `workspace_dependency_upgrade_plan`, `workspace_release_notes_generate`, `workspace_incident_patch_pack`, `workspace_memory_profile`, `workspace_autonomous_plan_execute`, `workspace_policy_preflight`

### Tier 10 — Hardening and Observability
`workspace_connector_test`, `workspace_pr_auto_assign`, `workspace_ci_watch`, `workspace_explain_code`, `workspace_add_docstring`, `workspace_refactor_plan`, `workspace_semantic_search`, `workspace_diff_preview`, `workspace_approval_status`, `workspace_audit_export`

### Tier 11 — Desktop and Meeting (**HIGH** risk, requires approval)
`workspace_browser_open`, `workspace_app_launch`, `workspace_meeting_join`, `workspace_meeting_speak`, `workspace_meeting_interview_live`

Each case checks `DESKTOP_OPERATOR === 'mock'` first and delegates to `MockDesktopOperator` if set. Native execution follows when the env var is absent or `native`.

### Tier 12 — Sub-Agent Delegation (**HIGH** risk, requires approval)
`workspace_subagent_spawn`, `workspace_github_pr_status`, `workspace_github_issue_triage`, `workspace_github_issue_fix`, `workspace_azure_deploy_plan`, `workspace_slack_notify`

### Original Action Set
`git_clone`, `git_branch`, `git_commit`, `git_push`, `code_read`, `code_edit`, `code_edit_patch`, `code_search_replace`, `run_build`, `run_tests`, `autonomous_loop`, `workspace_cleanup`, `workspace_diff`, `workspace_memory_write`, `workspace_memory_read`, `run_shell_command`, `create_pr_from_workspace`

---

## API Gateway Routes

`apps/api-gateway/src/routes/` — core route modules:

| Module | Routes |
|--------|--------|
| `auth.ts` | POST `/v1/auth/login`, `/v1/auth/logout`, `/v1/auth/session` |
| `approvals.ts` | POST `/v1/approvals/intake`, `/v1/approvals/escalate`, POST `/v1/approvals/:id/decision` |
| `audit.ts` | GET `/v1/audit/events` |
| `budget-policy.ts` | GET/PUT `/v1/workspaces/:id/budget-policy`, GET `/v1/workspaces/:id/budget-status` |
| `connector-actions.ts` | POST `/v1/connectors/:tool/execute` |
| `connector-auth.ts` | GET `/v1/connectors/oauth/init`, GET `/v1/connectors/oauth/callback` |
| `governance-workflows.ts` | Full CRUD for workflow templates, instances, decision submission |
| `internal-login-policy.ts` | GET `/v1/auth/internal-login-policy` |
| `plugin-loading.ts` | POST `/v1/plugins/allowlist/upsert` |
| `roles.ts` | GET `/v1/roles`, role subscription management |
| `runtime-llm-config.ts` | GET/PUT `/v1/workspaces/:id/llm-config` |
| `runtime-tasks.ts` | Task lease and runtime task routing |
| `snapshots.ts` | GET/PUT bot capability snapshots with checksum integrity |

Extended route modules: `activity-events`, `adapter-registry`, `agent-feedback`, `autonomous-loops`, `ci-failures`, `desktop-actions`, `desktop-profile`, `env-reconciler`, `governance-kpis`, `handoffs`, `ide-state`, `knowledge-graph`, `memory`, `observability`, `pull-requests`, `questions`, `repro-packs`, `retention-policy`, `skill-composition-execute`, `skill-pipelines`, `skill-scheduler`, `sse-tasks`, `webhooks`, `work-memory`

### API Gateway Background Workers

| Worker | Responsibility |
|--------|---------------|
| `provisioning-worker` | 11-step VM state machine polling |
| `connector-token-lifecycle-worker` | 60s/5min poll, 5min refresh window, batch 25 |
| `connector-health-worker` | Monthly scope validation |
| `run-recovery-worker` | Resume interrupted runs |

### Provisioning SLA Thresholds
- Target: 10 minutes | Stuck alert: 60 minutes | Timeout: 24 hours | Alert cooldown: 15 minutes

### Connector Token Lifecycle Worker
- Poll intervals: 60s active / 5min idle
- Refresh window: 5 minutes before expiry
- Batch size: 25 connectors per cycle
- `MetadataStatus` (11 states): `not_configured → auth_initiated → consent_pending → token_received → validation_in_progress → connected → degraded → token_expired → permission_invalid → revoked → disconnected`
- `ErrorClass` (8 types): `oauth_state_mismatch`, `oauth_code_exchange_failed`, `token_refresh_failed`, `token_expired`, `insufficient_scope`, `provider_rate_limited`, `provider_unavailable`, `secret_store_unavailable`

---

## Budget Policy System

- Per-workspace budget state: `dailySpent`, `dailyLimit`, `monthlySpent`, `monthlyLimit`, `isHardStopActive`, `lastResetDaily`
- Hard stop: once `isHardStopActive` is true, all new agent actions are blocked
- `BudgetLedgerEvent`: appended on every action that incurs cost
- `BudgetDenialReason` (5 reasons): `daily_limit_exceeded`, `monthly_limit_exceeded`, `hard_stop_active`, `workspace_suspended`, `budget_not_configured`
- `BudgetDecisionRecord`: carries `decision`, `reason`, `dailySpent`, `monthlySpent`, `limits`, `workspaceId`, `actionType`

---

## Orchestrator

`apps/orchestrator/src/`

### Task Scheduler
- Heartbeat Wake Model with coalescing
- `WakeSource`: `timer` | `task_assignment` | `on_demand` | `automation_trigger`
- `RunCoalescingStore`: merges duplicate wake requests by `dedupeKey`

### Routine Scheduler
- `RoutineSchedulerState`: `scheduledTasks`, `featureFlags`, `schedulerErrors`

### Plugin Capability Guard
- `evaluatePluginCapabilityGuard`: checks `loaded` + `trusted` + `capability_allowlisted`
- Denial reasons: `plugin_not_loaded`, `plugin_not_trusted`, `capability_not_allowlisted`

### Orchestrator State Store
- `OrchestratorPersistedState`: `version: 1`, `taskScheduler`, `routineScheduler`
- Backends: `auto` | `file` | `db` — atomic write (write-then-rename for crash safety)

### GOAP Planner
- A* goal-state planner; replans on partial completion or world-state change

---

## Memory Service

`services/memory-service/src/`

`IMemoryStore` interface implemented by `MemoryStore` (Prisma-backed) and `InMemoryMemoryStore` (test/dev):

- `MemoryReadResponse`: `recentMemories[]`, `memoryCountThisWeek`, `mostCommonConnectors[]`, `approvalRejectionRate`, `codeReviewPatterns[]`
- `MemoryWriteRequest`: `workspaceId`, `tenantId`, `taskId`, `actionsTaken[]`, `approvalOutcomes[]`, `connectorsUsed[]`, `llmProvider?`, `executionStatus`, `summary`, `correlationId`
- Post-task memory crystallization integrated with the Hermes skills pattern

---

## Meeting Agent

`services/meeting-agent/src/`

- `MeetingLifecycleStateMachine`: join → active → speaking → ended states
- `VoicePipeline`: STT/TTS adapters (VoxCPM integration)
- Connects to Tier 11 `workspace_meeting_join` / `workspace_meeting_speak` / `workspace_meeting_interview_live` actions

---

## Agent Question Service

`services/agent-question-service/src/`

Async agent-to-human Q&A (human-parity feature):
- `AgentQuestionRecord`: `workspaceId`, `botId`, `questionText`, `questionerId`, `responderId?`, `responseText?`, `status` (`pending` | `answered` | `timeout`), `createdAt`, `expiresAt`
- `createQuestion`, `answerQuestion`, `resolveTimeout`, `sweepExpiredQuestions`
- `IQuestionStore` interface implemented by `PrismaQuestionStore`

---

## Notification Service

`services/notification-service/src/`

- Channel adapters: Discord, Slack, Telegram, Voice (VoxCPM/VoIP), Webhook
- `dispatchApprovalAlert()`: approval-only entry point — scopes messaging to approval triggers, blocks non-approval events
- `NotificationChannelConfig.allowedTriggers`: per-channel trigger allowlist
- `NotificationEventTrigger` types: `run_completed`, `run_failed`, `approval_requested`, `approval_decided`, `escalation_created`, `kill_switch_activated`, `meeting_completed`, `skill_crystallized`, `security_event`

---

## Evidence Service and Governance KPIs

`services/evidence-service/src/governance-kpi.ts` — `GovernanceKpiCalculator.calculateMetrics()` returns `GovernanceMetrics`:

- `evidenceCompletenessPercent`: percentage of expected evidence records present
- `approvalP50LatencySeconds`, `approvalP95LatencySeconds`, `approvalP99LatencySeconds`
- `approvalTimeoutRate`: fraction of approvals that timed out
- `budgetBlocks`: count of budget-policy denials
- `providerFallbackRate`: fraction of LLM calls that triggered failover

`services/evidence-service/src/hnsw-index.ts`: approximate nearest-neighbor index for evidence search.

---

## Policy Engine

`services/policy-engine/src/governance-routing-policy.ts` — `resolveApproverIds(template, context)`:
- Multi-rule matching with filters: `tenantId`, `workspaceId`, `riskLevel`, `actionTypePrefix`
- Returns deduplicated approver ID set used by the approval intake flow

---

## Connector Gateway and Adapter Registry

`services/connector-gateway/src/adapter-registry.ts` — `AdapterRegistry` class:
- `register(definition)`, `unregister(tool)`, `discover(category?)`, `healthCheck(tool)`
- In-memory `Map`, tenant-scoped, all operations audit-logged
- mTLS certificate verification for agent federation
- PII-strip middleware redacts sensitive data from connector payloads

---

## Bot Capability Snapshots

`BotCapabilitySnapshotRecord` in shared-types:

| Field | Values |
|-------|--------|
| `languageTier` | `base` \| `pro` \| `enterprise` |
| `speechProvider` / `translationProvider` / `ttsProvider` | provider identifier |
| `avatarEnabled` / `avatarStyle` / `avatarProvider` | avatar config |
| `snapshotVersion` | semver string |
| `snapshotChecksum` | SHA-256 of snapshot payload |
| `source` | `api` \| `manual` |

---

## Website — Pages and API Routes

### Pages (51+)

| Section | Pages |
|---------|-------|
| Marketing | `/`, `/about`, `/blog`, `/changelog`, `/compare`, `/contact`, `/customers`, `/how-it-works`, `/pricing`, `/privacy`, `/product`, `/security`, `/terms`, `/use-cases` |
| Docs | `/docs`, `/docs/quickstart`, `/docs/concepts`, `/docs/api-reference` |
| Product | `/book-demo`, `/connectors`, `/checkout`, `/get-started` |
| Auth | `/login`, `/signup`, `/forgot-password` |
| Onboarding | `/onboarding`, `/marketplace/[slug]` |
| Dashboard | `/dashboard`, `/dashboard/activity`, `/dashboard/agents`, `/dashboard/agents/[slug]`, `/dashboard/agents/[slug]/approvals`, `/dashboard/approvals`, `/dashboard/bots`, `/dashboard/deployments`, `/dashboard/evidence`, `/dashboard/settings`, `/dashboard/notifications`, `/dashboard/reports` |
| Admin | `/admin`, `/admin/bots`, `/admin/users`, `/admin/integrations`, `/admin/billing`, `/admin/audit`, `/admin/roles`, `/admin/security`, `/admin/superadmin` |
| Company portal | `/company`, `/company/tenants/[id]` |

### API Routes (43 across 12 groups)

| Route Group | Key Endpoints |
|-------------|--------------|
| `auth` | login, logout, session, signup, forgot-password |
| `activity` | GET activity feed |
| `admin/bots` | bot management (CRUD) |
| `admin/users` | user management (CRUD) |
| `approvals` | list approvals, GET/PATCH by ID |
| `audit/events` | list audit events |
| `connectors` | list, create, delete, health per connector |
| `deployments` | list, latest, get by ID |
| `evidence` | summary (KPIs), export (CSV/JSON) |
| `marketplace` | bots catalogue, quick-start, selection |
| `onboarding` | complete onboarding |
| `provisioning` | process, retry, status |
| `superadmin` | audit, billing, fleet (CRUD + bulk), incidents (CRUD + assign/resolve), integrations, logs, overview, sessions, tenants |

### Website Auth Store

SQLite-backed (`node:sqlite` `DatabaseSync`). Key types: `UserRecord`, `SessionRecord`, `ApprovalRecord`, `ActivityFeedEvent`, `ComplianceEvidenceSummary`, `ComplianceEvidencePack`, `DeploymentJobRecord`, `UserOnboardingState`, `CustomerTenantRecord`, `WorkspaceRecord`, `BotRecord`, `ProvisioningQueueEntry`, `AuditEventRecord`.

### Bot Marketplace Catalogue
- 179 agents from the awesome-openclaw-agents list
- `BotDepartment` enum: 29 departments (Engineering, DevOps, Security, Healthcare, Legal, Marketing, Sales, HR, Finance, Customer Support, and more)

---

## Operator Dashboard

### Pure Logic (TypeScript — with tests)
- `dashboard-navigation.ts`, `dashboard-tab-storage.ts`, `runtime-observability-utils.ts`, `workspace-budget-panel-utils.ts`, `kanban-board-utils.ts` (Kanban CRUD: create, add, move, remove with WIP limits and priority support)

### Components (React TSX)
`approval-queue-panel`, `connector-config-panel`, `copy-link-button`, `dashboard-deep-link-bar`, `dashboard-mobile-shell`, `dashboard-tab-nav`, `dashboard-workspace-switcher`, `evidence-compliance-panel`, `governance-workflow-panel`, `llm-config-panel`, `operational-signal-timeline`, `plugin-loading-panel`, `runtime-observability-panel`, `workspace-budget-panel`

### Dashboard API Routes
- `approvals/`: decision, escalate, governance-diagnostics, plugins-audit, plugins-status
- `audit/`: events, export, retention-policy, session-replay
- `auth/`: internal-login
- `runtime/[botId]/`: capability, health, interview-events, kill, logs, state, transcripts, marketplace (catalog, install, invoke, uninstall, skills, telemetry), weekly-quality-roi
- `workspaces/[workspaceId]/`: budget-limits, historical-metrics, llm-config

---

## Key Runtime Flows

### 1. Signup to Operational Workspace
1. `POST /auth/signup` → atomic transaction: Tenant (`provisioning`), TenantUser (`owner`), Workspace, Bot (`created`), ProvisioningJob (`queued`)
2. Session token (HMAC-SHA256) returned as `agentfarm_session` HttpOnly cookie
3. Provisioning worker polls queued jobs → runs 11-step state machine → `queued → validating → creating_resources → bootstrapping_vm → starting_container → registering_runtime → healthchecking → completed`
4. Dashboard provisioning card reflects live state with remediation hints on failure

### 2. Connector Action Execution with Governance
1. Agent runtime requests normalized action via api-gateway
2. Role policy checked against `defaultActionPolicyByRole`; budget policy evaluated
3. `classifyRisk()` checks `HIGH_RISK_ACTIONS` (17) and `MEDIUM_RISK_ACTIONS` (40+); confidence < 0.6 escalates to medium
4. Low-risk: executes immediately, writes success audit event
5. Medium/high: creates immutable approval record (`pending`), returns 201 to runtime
6. Approved: executes with `executionToken`, writes audit event + budget ledger entry
7. Rejected: returns 403 with reason to caller, writes rejection audit event

### 3. Approval Lifecycle
1. Risky action enters `POST /v1/approvals/intake` — immutable record created
2. UI at `/dashboard/approvals` shows pending items grouped by risk (HIGH first)
3. Approver submits via `PATCH /api/approvals/[id]`; reason required on rejection (≥8 characters)
4. `decisionLatencySeconds` computed and stored; P95 shown on evidence dashboard
5. `POST /v1/approvals/escalate` marks overdue pending approvals (default 3600s SLA)
6. Kill-switch: blocks all medium/high within 30-second control window; resume requires `incidentRef` + `authorizedBy`

### 4. Audit and Evidence
1. `writeAuditEvent()` appends to SQLite — no UPDATE/DELETE paths ever
2. Events: signup, login, connector add/remove, approval request/decision, action executed/blocked, provisioning state changes, budget blocks
3. Query API: filter by `actorEmail`, `action`, `tenantId`, `from`, `to`, `limit`
4. Compliance export: JSON `ComplianceEvidencePack` + CSV, 365-day active / 730-day archive retention

### 5. LLM Provider Failover
1. Execution engine calls `LLMDecisionAdapter` with action context and workspaceId
2. Profile resolved: `quality_first`, `speed_first`, `cost_balanced`, `custom`
3. Auto mode iterates `AutoProfileProviderMap[profile]` ordered by 5-minute rolling health score
4. Each skip/failure appended to `ProviderFailoverTraceRecord[]`
5. Heuristic fallback fires if all providers fail

### 6. Budget Enforcement
1. Per-task cost estimate evaluated against `WorkspaceBudgetState`
2. Daily and monthly spend checked; `isHardStopActive` checked
3. Denial reasons emitted as `BudgetDecisionRecord` and appended to ledger
4. Hard stop blocks all new agent actions until manually cleared by admin

### 7. Plugin Loading and Trust
1. External plugin submitted with manifest + cryptographic signature
2. `isValidPluginManifest` + `verifyPluginManifestSignature` + `isTrustedPluginPublisher` checked
3. All pass: added to allowlist via `POST /v1/plugins/allowlist/upsert`
4. Orchestrator `evaluatePluginCapabilityGuard` enforces per-capability decisions at runtime

### 8. Orchestrator Wake and Run
1. Wake request with `WakeSource` and `dedupeKey`
2. `RunCoalescingStore` deduplicates inflight by `dedupeKey`
3. Run state written atomically (write-then-rename) to `OrchestratorPersistedState`
4. Routine scheduler evaluates `scheduledTasks` against `featureFlags`

### 9. Desktop Operator Dispatch
1. Agent requests Tier 11/12 desktop action (e.g. `workspace_browser_open`)
2. `local-workspace-executor` checks `process.env.DESKTOP_OPERATOR === 'mock'` at the top of the case
3. If mock: calls `getDesktopOperator().browserOpen(url, browser)` → returns `{ ok, output, errorOutput }` immediately
4. If native or unset: falls through to existing platform execution path (full governance, approval gate, OS-level dispatch)

### 10. Skills Crystallization (Hermes Pattern)
- Successful run completion → `SkillsRegistry.crystallize()` extracts template → `draft` → `active` lifecycle
- `findMatching()` accelerates future similar tasks

### 11. Approval Notification
- Approval event emitted → `dispatchApprovalAlert()` enforces approval-trigger filter
- Routed to Telegram/Slack/Discord/Webhook/Voice channel adapters (independently non-blocking)

---

## Security and Reliability Posture

- No connector secrets stored in relational records — only Key Vault `kv://` references persisted
- Workspace and tenant scoping enforced at session and route level with workspace RLS
- Approval immutability: `409 Conflict` on any attempt to re-decide a concluded approval
- Kill-switch governance: 30-second control window halts risky execution; authorized resume requires incident reference
- CSRF nonce validation on all OAuth connector callback flows with replay rejection
- Timing-safe password hash comparison on login to prevent user enumeration
- Exponential backoff (50ms → 100ms) on transient connector action failures
- State-machine cleanup and rollback on provisioning failures
- Budget hard stop: configurable per-workspace daily/monthly limits; hard stop blocks all agent actions
- Plugin trust verification: cryptographic signature check before any external plugin is allowlisted
- `safeChildPath` sandbox enforcement on all file and shell workspace operations

---

## Quality and Test Discipline

### Monorepo Quality Commands

```bash
pnpm build               # build all packages
pnpm test                # run all tests
pnpm typecheck           # typecheck all packages
pnpm quality:gate        # run full 47-check quality gate
pnpm smoke:e2e           # E2E auth/session smoke lane
pnpm verify:website:prod # production website verification
```

### Quality Gate (47 checks — current)

| Check | Status |
|-------|--------|
| Agent Runtime: 661 tests | ✅ PASS |
| API Gateway: 388 tests | ✅ PASS |
| Dashboard: 118 tests | ✅ PASS |
| Website: 118 tests across 9 suites | ✅ PASS |
| Orchestrator: 62 tests | ✅ PASS |
| Connector Gateway: 36 tests | ✅ PASS |
| Notification Service: 31 tests | ✅ PASS |
| Evidence Service: 24 tests | ✅ PASS |
| Meeting Agent: 23 tests | ✅ PASS |
| Provisioning Service: 15 tests | ✅ PASS |
| Approval Service: 12 tests | ✅ PASS |
| Memory Service: 11 tests | ✅ PASS |
| Agent Observability: 9 tests | ✅ PASS |
| Policy Engine: 2 tests | ✅ PASS |
| API Gateway coverage gate (≥80%) | ✅ PASS |
| Agent Runtime coverage gate (≥80%) | ✅ PASS |
| API Gateway typecheck | ✅ PASS |
| Agent Runtime typecheck | ✅ PASS |
| Dashboard typecheck | ✅ PASS |
| Website typecheck | ✅ PASS |
| Shared Types typecheck | ✅ PASS |
| Connector Contracts typecheck | ✅ PASS |
| Observability package typecheck | ✅ PASS |
| Contract versioning and compatibility | ✅ PASS |
| Import boundary enforcement | ✅ PASS |
| Orchestrator typecheck | ✅ PASS |
| Connector Gateway typecheck | ✅ PASS |
| Approval Service typecheck | ✅ PASS |
| Evidence Service typecheck | ✅ PASS |
| Policy Engine typecheck | ✅ PASS |
| Provisioning Service typecheck | ✅ PASS |
| Notification Service typecheck | ✅ PASS |
| Meeting Agent typecheck | ✅ PASS |
| Memory Service typecheck | ✅ PASS |
| Agent Observability typecheck | ✅ PASS |
| Website E2E smoke lane | ✅ PASS |
| Task lease race-condition tests | ✅ PASS |
| Connector token lifecycle regression | ✅ PASS |
| Kill-switch governance regression | ✅ PASS |
| Desktop Operator mock factory tests | ✅ PASS |
| Skills crystallization tests | ✅ PASS |
| GOAP planner tests | ✅ PASS |
| SSE task stream tests | ✅ PASS |
| Budget enforcement regression | ✅ PASS |
| Approval immutability regression | ✅ PASS |
| Plugin trust verification tests | ✅ PASS |
| DB Runtime snapshot smoke lane | ⏭ SKIP (requires Docker / Postgres) |

### Coverage Thresholds (≥80% line coverage enforced on critical modules)

| Module | Coverage |
|--------|---------|
| `execution-engine.ts` | 95.04% |
| `provisioning-monitoring.ts` | 94.44% |
| `action-result-writer.ts` | 93.10% |
| `runtime-server.ts` | 81.45% |
| `api-gateway` (critical modules) | ≥80% enforced |
| `agent-runtime` (critical modules) | ≥80% enforced |

---

## Repository Quick Start

### Prerequisites
- Node.js LTS (v20+) or Node.js v24
- pnpm (workspace package manager)
- Optional: Docker for full integration paths, Azure CLI for production deployment

### Install and Run

```bash
# 1. Install all workspace dependencies
pnpm install

# 2. Copy and fill environment variables
cp .env.example .env

# 3. Enable local signup (add to .env)
AGENTFARM_ALLOWED_SIGNUP_DOMAINS=agentfarm.local

# 4. Start website (port 3002)
pnpm --filter @agentfarm/website dev

# 5. Start API gateway (port 3001)
pnpm --filter @agentfarm/api-gateway dev

# 6. Start operator dashboard (port 3000)
pnpm --filter @agentfarm/dashboard dev
```

### Key Test Commands

```bash
# All packages
pnpm test

# Per package
pnpm --filter @agentfarm/agent-runtime test    # 661 tests
pnpm --filter @agentfarm/api-gateway test      # 388 tests
pnpm --filter @agentfarm/dashboard test        # 118 tests

# Website suites
pnpm --filter @agentfarm/website test:signup
pnpm --filter @agentfarm/website test:approvals
pnpm --filter @agentfarm/website test:evidence
pnpm --filter @agentfarm/website test:permissions
pnpm --filter @agentfarm/website test:session-auth
pnpm --filter @agentfarm/website test:provisioning
pnpm --filter @agentfarm/website test:deployments

# Full quality gate (47 checks)
pnpm quality:gate
```

---

## Environment and Configuration

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `OPA_BASE_URL` | Open Policy Agent base URL |
| `API_GATEWAY_PORT` | API gateway listen port (default: 3000) |
| `AGENTFARM_ALLOWED_SIGNUP_DOMAINS` | Comma-separated domains allowed to self-serve signup |
| `AGENTFARM_COMPANY_EMAILS` | Specific emails allowed company portal access |
| `AGENTFARM_COMPANY_DOMAINS` | Domain allowlist for company portal access |
| `AGENTFARM_COMPANY_FALLBACK_DOMAINS` | Dev fallback domains (default: `agentfarm.local`) |
| `AGENTFARM_DISABLE_COMPANY_FALLBACK` | Disable dev fallback (default: `false`) |
| `DESKTOP_OPERATOR` | Desktop operator provider: `native` \| `mock` (default: `native`) |
| `SESSION_SECRET` | HMAC-SHA256 signing key for session tokens |
| `WEBSITE_AUTH_DB_PATH` | SQLite database path for website auth store |
| `CONNECTOR_GITHUB_CLIENT_ID/SECRET` | GitHub OAuth app credentials |
| `CONNECTOR_JIRA_CLIENT_ID/SECRET` | Jira OAuth app credentials |
| `CONNECTOR_TEAMS_CLIENT_ID/SECRET` | Microsoft Teams OAuth app credentials |

Never commit secrets to source. All connector tokens are stored as Key Vault references at runtime.

---

## Deployment and Operations

- **Infrastructure**: `infrastructure/control-plane/` (PostgreSQL, Redis, Container Registry, Key Vault, monitoring) and `infrastructure/runtime-plane/` (per-tenant VM, NIC, disk, NSG, managed identity)
- **Website**: Azure Static Web App via `.github/workflows/website-swa.yml` — blocked on `AZURE_STATIC_WEB_APPS_API_TOKEN_WEBSITE` GitHub secret
- **Production deployment**: tracked in [operations/runbooks/mvp-launch-ops-runbook.md](operations/runbooks/mvp-launch-ops-runbook.md)
- **Operations docs**: quality reports and runbooks under `operations/`

---

## Who This Repository Is For

- **Platform engineers** building controlled AI agent systems
- **AI runtime engineers** implementing governed autonomy with human oversight
- **Security and compliance teams** requiring auditable decision and execution traces
- **Product and operations leads** preparing pilot-ready enterprise delivery

<!-- doc-sync: 2026-05-08 desktop-operator + full-service-coverage + test-count-update -->
> Last synchronized: 2026-05-08 (desktop-operator abstraction, all 14 services documented, 1,392 total tests, quality gate 47 checks).
