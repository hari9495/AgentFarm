# AgentFarm — Technical Overview

AgentFarm is a TypeScript pnpm monorepo for operating AI agents with enterprise control gates. The platform delivers one production-grade Developer Agent role backed by 18 connectors across 4 categories, risk-based autonomy with human approval enforcement, 12 tiers of local workspace actions, 10 LLM providers with health-score failover, and a complete audit and evidence path for compliance teams.

**Sprint 1 complete as of 2026-05-01.** All 24 local tasks are finished and validated. Three tasks (7.1 SWA deployment, 8.2 Azure production deployment, 8.3 security/load gates) are blocked on external Azure and GitHub secrets and are tracked in [operations/runbooks/mvp-launch-ops-runbook.md](operations/runbooks/mvp-launch-ops-runbook.md).

---

## What We Built

### MVP Outcome
- One production-grade Developer Agent role operating across Jira, Teams, GitHub, Outlook, and more
- 18 connectors in the plugin registry (13 named + 5 generic REST variants) across 4 categories
- Risk-based autonomy: low-risk actions execute immediately, medium/high actions route to the human approval queue
- Full audit and evidence path: append-only audit log, compliance export (JSON and CSV), evidence freshness dashboard
- 12-tier local workspace action system with 70+ action types for the Developer Agent
- 10 LLM providers with Auto mode and health-score-based failover, 4 configurable model profiles
- Budget policy enforcement: per-workspace daily/monthly limits with hard stop and ledger events
- Orchestrator with heartbeat wake model, routine scheduling, plugin capability guard
- 179-agent marketplace catalogue across 29 departments
- Website with 51 pages, 43 API routes, and superadmin portal
- Operator dashboard with 14 components, runtime proxy, budget panel, governance workflow panel

### Core Product Capabilities
- Tenant and workspace onboarding with HMAC-SHA256 session auth and workspace-scoped row-level security
- Runtime provisioning: 11-step Azure VM state machine with SLA monitoring (10-min target, 60-min stuck alert, 24-hr timeout), failure recovery, and rollback
- Connector authentication, token lifecycle (auto-refresh, revoke, re-consent), and monthly health probes
- Normalized connector action execution with exponential backoff retry and role-policy enforcement
- Approval intake, queue, decision enforcement, escalation, kill-switch, and decision webhook fanout
- Append-only audit log, retention policy (365-day active / 730-day archive), and compliance query API
- Evidence and compliance dashboard: live KPIs, P95/P50/P99 latency, audit event timeline, compliance export
- Bot capability snapshots: language tier (base/pro/enterprise), speech/TTS/avatar providers, checksum integrity
- Website onboarding surfaces: signup, connector dashboard, marketplace, approval inbox, evidence view, superadmin

---

## System Architecture

### Monorepo Boundaries

```
apps/         deployable surfaces and runtime entrypoints
services/     domain services (provisioning, approvals, connectors, evidence, identity, notifications)
packages/     shared types, contracts, schema, observability
infrastructure/  Azure control-plane and runtime-plane IaC
```

### Applications

| App | Port | Purpose | Tests |
|-----|------|---------|-------|
| `apps/api-gateway` | 3001 | Control-plane API: auth, session, connector execution, approvals, audit, budget policy, roles, snapshots, plugin loading, LLM config, governance workflows | 209 |
| `apps/agent-runtime` | — | Per-tenant execution engine: risk classification, LLM dispatch, 12-tier workspace actions | 118 |
| `apps/dashboard` | 3000 | Operator UI: approval queue, evidence panel, runtime observability, LLM config, governance workflows, plugin loading, budget panel, workspace switcher | — |
| `apps/website` | 3002 | Product surface: 51 pages, 43 API routes, auth, connectors, marketplace, approvals, evidence, superadmin | 28+ |
| `apps/orchestrator` | — | Multi-agent coordinator: heartbeat wake model, routine scheduler, plugin capability guard, state persistence | — |

### Domain Services

| Service | Purpose | Tests |
|---------|---------|-------|
| `services/provisioning-service` | 11-step VM provisioning state machine, bootstrap, SLA monitoring, cleanup | 15 |
| `services/approval-service` | Approval enforcement, kill-switch, governance workflow manager | 12+ |
| `services/connector-gateway` | OAuth flows, token lifecycle, adapter registry, adapter dispatch, health probes | passing |
| `services/policy-engine` | Governance routing policy and rule resolution | passing |
| `services/evidence-service` | Governance KPI calculator (P50/P95/P99, escalation rate, provider fallback rate) | passing |
| `services/identity-service` | Tenant, workspace, user lifecycle | — |
| `services/notification-service` | Approval and ops notifications | — |

### Shared Packages

| Package | Purpose |
|---------|---------|
| `packages/shared-types` | 10 versioned contract records, enums, kill-switch types, budget/governance/evidence types |
| `packages/connector-contracts` | 18-connector plugin registry, 18 normalized action types, 12 role policy keys |
| `packages/queue-contracts` | Queue event type definitions |
| `packages/db-schema` | Prisma schema and migrations |
| `packages/observability` | Structured telemetry helpers |

---

## Contract Versioning

`packages/shared-types/src/index.ts` exports `CONTRACT_VERSIONS` — all pinned at `'1.0.0'`:

| Contract | Key |
|----------|-----|
| Provisioning job | `PROVISIONING` |
| Runtime config | `RUNTIME` |
| Task lease | `TASK_LEASE` |
| Budget decision | `BUDGET_DECISION` |
| Connector action | `CONNECTOR_ACTION` |
| Approval record | `APPROVAL` |
| Action result | `ACTION` |
| Audit event | `AUDIT_EVENT` |
| Governance workflow | `GOVERNANCE_WORKFLOW` |
| Plugin loading | `PLUGIN_LOADING` |

---

## Connector Plugin Registry

`packages/connector-contracts/src/index.ts` exports a typed `CONNECTOR_REGISTRY` of 18 connectors:

| Category | Named Connectors | Custom Connector |
|----------|-----------------|-----------------|
| `task_tracker` | Jira, Linear, Asana, Monday, Trello, ClickUp | `generic_rest` |
| `messaging` | Microsoft Teams, Slack | `generic_rest_messaging` |
| `code` | GitHub, GitLab, Azure DevOps | `generic_rest_code` |
| `email` | Outlook (Microsoft Graph), Gmail | `generic_rest_email`, `generic_smtp` |

Auth methods used: `oauth2`, `api_key`, `basic`, `bearer_token`, `generic_rest`

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

`apps/agent-runtime/src/llm-decision-adapter.ts` — provider failover and decision routing.

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

Each profile has an `AutoProfileProviderMap` defining the ordered provider priority list for Auto mode.

### Provider Failover Trace

`ProviderFailoverTraceRecord` captures per-attempt: `provider`, `reasonCode` (`rate_limit` | `auth_failure` | `billing_disabled` | `timeout` | `provider_unavailable` | `unclassified`), `disposition` (`attempt_failed` | `skipped_cooldown` | `skipped_unconfigured`).

### LLM Workspace Config

`RuntimeLlmWorkspaceConfig` carries per-provider: `model`, `baseUrl`, `apiKey`, `modelProfiles`. Dashboard LLM config panel shows redacted key display. Routes: `GET/PUT /v1/workspaces/:workspaceId/llm-config`.

---

## Execution Engine and Risk Classification

`apps/agent-runtime/src/execution-engine.ts`

### Risk Classification

**HIGH_RISK_ACTIONS** (17 items):
`merge_release`, `merge_pr`, `delete_resource`, `change_permissions`, `deploy_production`, `git_push`, `run_shell_command`, `workspace_repl_start`, `workspace_repl_execute`, `workspace_dry_run_with_approval_chain`, `workspace_browser_open`, `workspace_app_launch`, `workspace_meeting_join`, `workspace_meeting_speak`, `workspace_meeting_interview_live`, `workspace_subagent_spawn`, `workspace_github_issue_fix`

**MEDIUM_RISK_ACTIONS** (40+ items): all mutating workspace-tier actions including `code_edit`, `code_edit_patch`, `git_commit`, `autonomous_loop`, `apply_patch`, `workspace_bulk_refactor`, `workspace_atomic_edit_set`, and all Tier 2–10 mutating operations.

Actions with confidence < 0.6 are escalated to medium risk regardless of action type.

### Key Types

- `TaskEnvelope`: `taskId`, `payload`, `lease`
- `ActionDecision`: `actionType`, `confidence`, `riskLevel`, `route` (`execute_immediately` | `route_to_approval`), `reason`
- `LlmDecisionMetadata`: `classificationSource`, `modelProvider`, `model`, `modelProfile`, `tokens`, `failoverTrace`
- `ProcessedTaskResult`: `decision`, `status`, `attempts`, `transientRetries`, `executionPayload`, `payloadOverrideSource`

---

## Developer Agent — 12-Tier Workspace Actions

`apps/agent-runtime/src/local-workspace-executor.ts` — `safeChildPath` sandbox enforcement on all file and shell operations.

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

### Tier 9 — Productivity Pilot (Roadmap)
`workspace_create_pr`, `workspace_run_ci_checks`, `workspace_fix_test_failures`, `workspace_security_fix_suggest`, `workspace_pr_review_prepare`, `workspace_dependency_upgrade_plan`, `workspace_release_notes_generate`, `workspace_incident_patch_pack`, `workspace_memory_profile`, `workspace_autonomous_plan_execute`, `workspace_policy_preflight`

### Tier 10 — Hardening and Observability
`workspace_connector_test`, `workspace_pr_auto_assign`, `workspace_ci_watch`, `workspace_explain_code`, `workspace_add_docstring`, `workspace_refactor_plan`, `workspace_semantic_search`, `workspace_diff_preview`, `workspace_approval_status`, `workspace_audit_export`

### Tier 11 — Desktop and Meeting (**HIGH** risk, requires approval)
`workspace_browser_open`, `workspace_app_launch`, `workspace_meeting_join`, `workspace_meeting_speak`, `workspace_meeting_interview_live`

### Tier 12 — Sub-Agent Delegation (**HIGH** risk, requires approval)
`workspace_subagent_spawn`, `workspace_github_pr_status`, `workspace_github_issue_triage`, `workspace_github_issue_fix`, `workspace_azure_deploy_plan`, `workspace_slack_notify`

### Original Action Set
`git_clone`, `git_branch`, `git_commit`, `git_push`, `code_read`, `code_edit`, `code_edit_patch`, `code_search_replace`, `run_build`, `run_tests`, `autonomous_loop`, `workspace_cleanup`, `workspace_diff`, `workspace_memory_write`, `workspace_memory_read`, `run_shell_command`, `create_pr_from_workspace`

---

## API Gateway Routes

`apps/api-gateway/src/routes/` — 13 route modules:

| Module | Routes |
|--------|--------|
| `auth.ts` | POST `/v1/auth/login`, `/v1/auth/logout`, `/v1/auth/session` |
| `approvals.ts` | POST `/v1/approvals/intake`, `/v1/approvals/escalate`, POST `/v1/approvals/:id/decision` |
| `audit.ts` | GET `/v1/audit/events` |
| `budget-policy.ts` | GET/PUT `/v1/workspaces/:id/budget-policy`, GET `/v1/workspaces/:id/budget-status` |
| `connector-actions.ts` | POST `/v1/connectors/:tool/execute` |
| `connector-auth.ts` | GET `/v1/connectors/oauth/init`, GET `/v1/connectors/oauth/callback` |
| `governance-workflows.ts` | Full CRUD for workflow templates, instances, decision submission |
| `internal-login-policy.ts` | GET `/v1/auth/internal-login-policy` (internal scope only) |
| `plugin-loading.ts` | POST `/v1/plugins/allowlist/upsert` |
| `roles.ts` | GET `/v1/roles`, role subscription management |
| `runtime-llm-config.ts` | GET/PUT `/v1/workspaces/:id/llm-config` |
| `runtime-tasks.ts` | Task lease and runtime task routing |
| `snapshots.ts` | GET/PUT bot capability snapshots with checksum integrity |

API Gateway Services (`src/services/`): `azure-provisioning-steps.ts`, `connector-health-worker.ts`, `connector-token-lifecycle-worker.ts`, `provisioning-monitoring.ts`, `provisioning-worker.ts`

### Provisioning SLA Thresholds
- Target: `SLA_TARGET_MS` = 10 minutes
- Stuck alert: `STUCK_ALERT_MS` = 60 minutes
- Timeout: `TIMEOUT_MS` = 24 hours
- Alert cooldown: `ALERT_COOLDOWN_MS` = 15 minutes

### Connector Token Lifecycle Worker
- Poll intervals: `POLL_INTERVAL_ACTIVE_MS` = 60s, `POLL_INTERVAL_IDLE_MS` = 5 min
- Refresh window: `REFRESH_WINDOW_MS` = 5 min before expiry
- Batch size: 25 connectors per cycle
- `MetadataStatus` (11 states): `not_configured` → `auth_initiated` → `consent_pending` → `token_received` → `validation_in_progress` → `connected` → `degraded` → `token_expired` → `permission_invalid` → `revoked` → `disconnected`
- `ErrorClass` (8 types): `oauth_state_mismatch`, `oauth_code_exchange_failed`, `token_refresh_failed`, `token_expired`, `insufficient_scope`, `provider_rate_limited`, `provider_unavailable`, `secret_store_unavailable`

---

## Budget Policy System

`apps/api-gateway/src/routes/budget-policy.ts`

- Per-workspace budget state: `dailySpent`, `dailyLimit`, `monthlySpent`, `monthlyLimit`, `isHardStopActive`, `lastResetDaily`
- Hard stop: once `isHardStopActive` is true, all new agent actions are blocked
- `BudgetLedgerEvent`: appended on every action that incurs cost
- `BudgetDenialReason` (5 reasons): `daily_limit_exceeded`, `monthly_limit_exceeded`, `hard_stop_active`, `workspace_suspended`, `budget_not_configured`
- `BudgetLimitScope`: `workspace`
- `BudgetDecisionRecord` in `packages/shared-types`: carries `decision`, `reason`, `dailySpent`, `monthlySpent`, `limits`, `workspaceId`, `actionType`

---

## Orchestrator

`apps/orchestrator/src/` — 5 modules:

### Task Scheduler (`task-scheduler.ts`)
- **Heartbeat Wake Model** with coalescing
- `WakeSource`: `timer` | `task_assignment` | `on_demand` | `automation_trigger`
- `WakeRequest`: source, `dedupeKey`, `targetWorkspaceId`, `priority`
- `RunCoalescingStore`: merges duplicate wake requests by `dedupeKey`
- `RunScheduleResult`: whether a new run was created or coalesced

### Routine Scheduler (`routine-scheduler.ts`)
- `RoutineSchedulerState`: `scheduledTasks`, `featureFlags`, `schedulerErrors`

### Plugin Capability Guard (`plugin-capability-guard.ts`)
- `evaluatePluginCapabilityGuard`: checks `loaded` + `trusted` + `capability_allowlisted`
- Denial reasons: `plugin_not_loaded`, `plugin_not_trusted`, `capability_not_allowlisted`

### Orchestrator State Store (`orchestrator-state-store.ts`)
- `OrchestratorPersistedState`: `version: 1`, `taskScheduler`, `routineScheduler`
- `OrchestratorStateBackend`: `auto` | `file` | `db`
- Atomic write: write-then-rename for crash safety

---

## Bot Capability Snapshots

`apps/api-gateway/src/routes/snapshots.ts` and `BotCapabilitySnapshotRecord` in shared-types:

| Field | Values |
|-------|--------|
| `languageTier` | `base` | `pro` | `enterprise` |
| `speechProvider` | provider identifier |
| `translationProvider` | provider identifier |
| `ttsProvider` | provider identifier |
| `avatarEnabled` | boolean |
| `avatarStyle` | style identifier |
| `avatarProvider` | provider identifier |
| `snapshotVersion` | semver string |
| `snapshotChecksum` | SHA-256 of snapshot payload |
| `source` | `api` | `manual` |

---

## Evidence Service and Governance KPIs

`services/evidence-service/src/governance-kpi.ts` — `GovernanceKpiCalculator.calculateMetrics()` returns `GovernanceMetrics`:

- `evidenceCompletenessPercent`: percentage of expected evidence records present
- `approvalP50LatencySeconds`, `approvalP95LatencySeconds`, `approvalP99LatencySeconds`
- `approvalTimeoutRate`: fraction of approvals that timed out
- `budgetBlocks`: count of budget-policy denials
- `providerFallbackRate`: fraction of LLM calls that triggered failover

---

## Policy Engine and Governance Routing

`services/policy-engine/src/governance-routing-policy.ts` — `resolveApproverIds(template, context)`:

- Multi-rule matching with filters: `tenantId`, `workspaceId`, `riskLevel`, `actionTypePrefix`
- Returns deduplicated approver ID set
- Used by the approval intake flow to determine routing targets

---

## Connector Gateway and Adapter Registry

`services/connector-gateway/src/adapter-registry.ts` — `AdapterRegistry` class:

- `register(definition)`: registers a connector adapter
- `unregister(tool)`: removes a registered adapter
- `discover(category?)`: returns available adapters, optionally filtered by category
- `healthCheck(tool)`: performs health check on a specific adapter
- All operations are audit-logged
- Storage: in-memory `Map` backed, tenant-scoped

---

## Website — Pages and API Routes

### Pages (51+ routes)

| Section | Pages |
|---------|-------|
| Marketing | `/`, `/about`, `/blog`, `/changelog`, `/compare`, `/contact`, `/customers`, `/how-it-works`, `/pricing`, `/privacy`, `/product`, `/security`, `/terms`, `/use-cases` |
| Docs | `/docs`, `/docs/quickstart`, `/docs/concepts`, `/docs/api-reference` |
| Product | `/book-demo`, `/connectors`, `/checkout`, `/get-started` |
| Auth | `/login`, `/signup`, `/forgot-password` |
| Onboarding | `/onboarding`, `/marketplace/[slug]` |
| Dashboard | `/dashboard`, `/dashboard/activity`, `/dashboard/agents`, `/dashboard/agents/[slug]`, `/dashboard/agents/[slug]/approvals`, `/dashboard/approvals`, `/dashboard/bots`, `/dashboard/deployments`, `/dashboard/evidence`, `/dashboard/settings` |
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

### Website Auth Store (`apps/website/lib/auth-store.ts`)

SQLite-backed (`node:sqlite` DatabaseSync), exports:
`UserRecord`, `SessionRecord`, `ApprovalRecord`, `ActivityFeedEvent`, `ComplianceEvidenceSummary`, `ComplianceEvidencePack`, `DeploymentJobRecord`, `UserOnboardingState`, `CustomerTenantRecord`, `WorkspaceRecord`, `BotRecord`, `ProvisioningQueueEntry`, `AuditEventRecord`

Functions: `getSessionUser`, `createApprovalRequest`, `updateApprovalDecision`, `listApprovals`, `escalatePendingApprovals`, `writeAuditEvent`, `listAuditEvents`, `getComplianceEvidenceSummary`, `exportComplianceEvidencePack`, `listRecentActivity`

### Bot Marketplace Catalogue

`apps/website/lib/bots-catalogue.ts` — 179 agents from the awesome-openclaw-agents list.
`apps/website/lib/bots.ts` — `BotDepartment` enum with 29 departments including Engineering, DevOps, Security, Healthcare, Legal, Marketing, Sales, HR, Finance, Customer Support, and more.

---

## Operator Dashboard (`apps/dashboard`)

### Components (TypeScript — with tests)
- `dashboard-navigation.ts` — navigation routing and state
- `dashboard-tab-storage.ts` — tab persistence
- `runtime-observability-utils.ts` — runtime metric aggregation
- `workspace-budget-panel-utils.ts` — budget state formatting

### Components (React TSX)
- `approval-queue-panel.tsx` — pending approvals by risk level, decision UI
- `connector-config-panel.tsx` — connector status and configuration
- `copy-link-button.tsx` — deep link sharing
- `dashboard-deep-link-bar.tsx` — contextual quick navigation
- `dashboard-mobile-shell.tsx` — mobile-responsive layout
- `dashboard-tab-nav.tsx` — tabbed navigation
- `dashboard-workspace-switcher.tsx` — workspace context switcher
- `evidence-compliance-panel.tsx` — compliance KPIs and export
- `governance-workflow-panel.tsx` — workflow template and instance management
- `llm-config-panel.tsx` — per-provider LLM settings, profile presets
- `operational-signal-timeline.tsx` — event timeline for runtime operations
- `plugin-loading-panel.tsx` — trusted publisher allowlist, kill-switch
- `runtime-observability-panel.tsx` — runtime health, logs, transcripts
- `workspace-budget-panel.tsx` — daily/monthly spend, hard stop controls

### Dashboard API Routes
- `approvals/`: decision, escalate, governance diagnostics, plugins (audit/status)
- `audit/`: events, export, retention policy
- `auth/`: internal-login
- `runtime/[botId]/`: route-handler-core, runtime-proxy-utils, capability, health, interview-events, kill, logs, state, transcripts
- `workspaces/[workspaceId]/`: budget-limits, historical-metrics, llm-config

### Dashboard Pages
`/` (main), `/connectors`, `/governance`, `/governance/plugins`, `/login`, `/provisioning`, `/signup`, `/target`

---

## Key Runtime Flows

### 1. Signup to Operational Workspace
1. `POST /auth/signup` → atomic transaction creates: Tenant (`provisioning`), TenantUser (`owner`), Workspace, Bot (`created`), ProvisioningJob (`queued`)
2. Session token (HMAC-SHA256) returned as `agentfarm_session` HttpOnly cookie
3. Provisioning worker polls for `queued` jobs and runs 11-step state machine
4. Steps: `queued → validating → creating_resource_group → creating_vm → bootstrapping_docker → registering_runtime → health_checking → completed` (with `failed`, `cleanup_pending`, `cleanup_complete` paths)
5. Dashboard provisioning card reflects live state with remediation hints on failure

### 2. Connector Action Execution with Governance
1. Agent runtime requests normalized action via api-gateway
2. Role policy checked against `defaultActionPolicyByRole`; budget policy evaluated
3. `classifyRisk()` checks `HIGH_RISK_ACTIONS` (17 items) and `MEDIUM_RISK_ACTIONS` (40+ items); confidence < 0.6 escalates to medium
4. Low-risk: executes immediately, writes success audit event
5. Medium/high: creates immutable approval record (`pending`), returns 201 to runtime
6. Approved action: executes with `executionToken`, writes audit event + budget ledger entry
7. Rejected action: returns 403 with reason to caller, writes rejection audit event

### 3. Approval Lifecycle
1. Risky action enters `POST /v1/approvals/intake` — immutable approval record created
2. `ApprovalsQueue` UI at `/dashboard/approvals` shows pending items grouped by risk (HIGH first)
3. Approver submits decision via `PATCH /api/approvals/[id]` with optional reason (required on rejection, ≥8 characters)
4. `decisionLatencySeconds` computed and stored; P95 latency shown on evidence dashboard
5. `POST /v1/approvals/escalate` marks overdue pending approvals per `escalationTimeoutSeconds` (default 3600s)
6. Kill-switch: blocks all new medium/high actions within 30-second control window; resume requires `incidentRef` + `authorizedBy`

### 4. Audit and Evidence
1. `writeAuditEvent()` appends to SQLite (no UPDATE/DELETE paths ever)
2. Events: signup, login, connector add/remove, approval request, approval decision, action executed/blocked, provisioning state changes, budget blocks
3. Query API with filters: `actorEmail`, `action`, `tenantId`, `from`, `to`, `limit`
4. Evidence summary computes: requests, pending, approved, rejected, escalated, P95 latency, freshness seconds
5. Compliance export returns full `ComplianceEvidencePack` (JSON + CSV), 365-day active / 730-day archive retention

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
4. Hard stop once active blocks all new agent actions until manually cleared by admin

### 7. Plugin Loading and Trust
1. External plugin submitted with manifest + cryptographic signature
2. `isValidPluginManifest` + `verifyPluginManifestSignature` + `isTrustedPluginPublisher` checked
3. If all pass: added to allowlist via `POST /v1/plugins/allowlist/upsert`
4. Orchestrator `evaluatePluginCapabilityGuard` enforces per-capability decisions at runtime

### 8. Orchestrator Wake and Run
1. Wake request received with `WakeSource` and `dedupeKey`
2. `RunCoalescingStore` deduplicates inflight requests by `dedupeKey`
3. Run state written atomically (write-then-rename) to `OrchestratorPersistedState`
4. Routine scheduler evaluates `scheduledTasks` against `featureFlags`

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
- Sandbox path enforcement (`safeChildPath`) on all file and shell workspace operations

---

## Quality and Test Discipline

### Monorepo Quality Commands

```bash
pnpm build               # build all packages
pnpm test                # run all tests
pnpm typecheck           # typecheck all packages
pnpm quality:gate        # run full 33-check quality gate
pnpm smoke:e2e           # E2E auth/session smoke lane
pnpm verify:website:prod # production website verification
```

### Quality Gate Summary (as of 2026-05-01) — 33 checks

| Check | Status |
|-------|--------|
| API Gateway coverage gate | ✅ PASS |
| Agent Runtime coverage gate | ✅ PASS |
| API Gateway typecheck | ✅ PASS |
| Agent Runtime typecheck | ✅ PASS |
| Dashboard typecheck | ✅ PASS |
| Provisioning service typecheck + regression | ✅ PASS |
| Website signup regression | ✅ PASS |
| Website provisioning worker regression | ✅ PASS |
| Website session auth + RLS regression | ✅ PASS |
| Website provisioning progress UI regression | ✅ PASS |
| Website deployment flow regression | ✅ PASS |
| Website deployment UI regression | ✅ PASS |
| Website approvals regression (Task 5.2/5.3) | ✅ PASS |
| Website evidence compliance regression (Task 6.1/6.2) | ✅ PASS |
| Website E2E smoke lane | ✅ PASS |
| Contract versioning and compatibility | ✅ PASS |
| Import boundary enforcement | ✅ PASS |
| Orchestrator typecheck + tests | ✅ PASS |
| API Gateway task lease race-condition tests | ✅ PASS |
| Connector Gateway typecheck + tests | ✅ PASS |
| Approval Service typecheck + tests | ✅ PASS |
| Evidence Service typecheck + tests | ✅ PASS |
| Shared Types typecheck | ✅ PASS |
| Connector Contracts typecheck | ✅ PASS |
| Observability package typecheck | ✅ PASS |
| Policy Engine typecheck + tests | ✅ PASS |
| DB Runtime snapshot smoke lane | ⏭ SKIP (requires Docker / Postgres) |

### Coverage Thresholds (≥80% line coverage enforced)

| Module | Coverage |
|--------|---------|
| `execution-engine.ts` | 95.04% |
| `provisioning-monitoring.ts` | 94.44% |
| `action-result-writer.ts` | 93.10% |
| `runtime-server.ts` | 81.45% |
| `api-gateway` (overall) | 72.07% (critical modules enforced) |
| `agent-runtime` (overall) | 79.91% |

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

# 4. Start website (port 3002) — full product surface
pnpm --filter @agentfarm/website dev

# 5. Start API gateway (port 3001)
pnpm --filter @agentfarm/api-gateway dev

# 6. Start operator dashboard (port 3000)
pnpm --filter @agentfarm/dashboard dev
```

### Key Test Commands

```bash
# Website test suites (9 files, 28+ tests)
pnpm --filter @agentfarm/website test:signup
pnpm --filter @agentfarm/website test:approvals
pnpm --filter @agentfarm/website test:evidence
pnpm --filter @agentfarm/website test:permissions
pnpm --filter @agentfarm/website test:session-auth
pnpm --filter @agentfarm/website test:provisioning
pnpm --filter @agentfarm/website test:provisioning-ui
pnpm --filter @agentfarm/website test:deployments
pnpm --filter @agentfarm/website test:deployments:ui

# API Gateway (209 tests)
pnpm --filter @agentfarm/api-gateway test

# Agent Runtime (118 tests)
pnpm --filter @agentfarm/agent-runtime test

# Full quality gate (33 checks)
pnpm quality:gate
```

---

## Environment and Configuration

| Variable | Purpose |
|----------|---------|
| `AGENTFARM_ALLOWED_SIGNUP_DOMAINS` | Comma-separated domains allowed to self-serve signup (e.g. `agentfarm.local`) |
| `AGENTFARM_COMPANY_EMAILS` | Specific emails allowed company portal access |
| `AGENTFARM_COMPANY_DOMAINS` | Domain allowlist for company portal access |
| `CONNECTOR_GITHUB_CLIENT_ID/SECRET` | GitHub OAuth app credentials |
| `CONNECTOR_JIRA_CLIENT_ID/SECRET` | Jira OAuth app credentials |
| `CONNECTOR_TEAMS_CLIENT_ID/SECRET` | Microsoft Teams OAuth app credentials |
| `SESSION_SECRET` | HMAC-SHA256 signing key for session tokens |
| `WEBSITE_AUTH_DB_PATH` | SQLite database path for website auth store (default: `.auth.sqlite`) |

Never commit secrets to source. All connector tokens are stored as Key Vault references at runtime.

---

## Deployment and Operations

- **Infrastructure**: `infrastructure/control-plane/` (PostgreSQL, Redis, Container Registry, Key Vault, monitoring) and `infrastructure/runtime-plane/` (per-tenant VM, NIC, disk, NSG, managed identity)
- **Website**: Azure Static Web App via `.github/workflows/website-swa.yml` — blocked on `AZURE_STATIC_WEB_APPS_API_TOKEN_WEBSITE` GitHub secret
- **Production deployment**: tracked in [operations/runbooks/mvp-launch-ops-runbook.md](operations/runbooks/mvp-launch-ops-runbook.md)
- **Operations docs**: quality reports and runbooks maintained under `operations/`

---

## Sprint 1 Task Completion Summary

| Workstream | Tasks | Status |
|-----------|-------|--------|
| 1 — Signup and Tenant Lifecycle | 1.1, 1.2, 1.3 | ✅ All completed |
| 2 — Azure Runtime Provisioning | 2.1, 2.2, 2.3, 2.4 | ✅ All completed |
| 3 — Docker Runtime and Bot Execution | 3.1, 3.2, 3.3 | ✅ All completed |
| 4 — Connector Auth and Action Execution | 4.1, 4.2, 4.3, 4.4 | ✅ All completed |
| 5 — Approval and Risk Controls | 5.1, 5.2, 5.3 | ✅ All completed |
| 6 — Audit, Evidence, and Observability | 6.1, 6.2 | ✅ All completed |
| 7 — Website and Marketplace | 7.2 | ✅ Completed; 7.1 blocked on Azure/GitHub |
| 8 — Testing and Deployment | 8.1 | ✅ Completed; 8.2, 8.3 blocked on Azure |
| 9 — Workspace Actions (Tier 1–12) | 9.1–9.12 | ✅ All completed |

---

## Who This Repository Is For

- **Platform engineers** building controlled AI agent systems
- **AI runtime engineers** implementing governed autonomy with human oversight
- **Security and compliance teams** requiring auditable decision and execution traces
- **Product and operations leads** preparing pilot-ready enterprise delivery

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).
