# AgentFarm Codebase Report

> Generated: 2026-05-07 | Quality Gate: PASS (52/52) | Tests: 1,542 total, 0 failures

---

## Table of Contents

1. [Monorepo Structure](#1-monorepo-structure)
2. [Agent Roles](#2-agent-roles)
3. [Full Execution Pipeline](#3-full-execution-pipeline)
4. [Complete Action Registry](#4-complete-action-registry)
5. [LLM Integration](#5-llm-integration)
6. [Connector Layer](#6-connector-layer)
7. [Data Models](#7-data-models)
8. [Test Summary](#8-test-summary)
9. [Gaps and TODOs](#9-gaps-and-todos)
10. [Environment Variable Reference](#10-environment-variable-reference)

---

## 1. Monorepo Structure

**Runtime:** Node 22, pnpm 9.12.0, TypeScript strict mode
**Workspace root:** `D:\AgentFarm`
**pnpm workspaces:** `apps/*`, `services/*`, `packages/*`

### Apps

| Package | Name | Port | Purpose |
|---------|------|------|---------|
| `apps/agent-runtime` | `@agentfarm/agent-runtime` | 4000 | Core agent execution engine — LLM decision, action dispatch, approval lifecycle, workspace execution |
| `apps/api-gateway` | `@agentfarm/api-gateway` | 3000 | REST API gateway for dashboard + connectors; wraps all control-plane operations (76+ route files) |
| `apps/dashboard` | `@agentfarm/dashboard` | 3001/3101 | Next.js 15 dashboard UI — approval queue, task management, workspace monitoring |
| `apps/orchestrator` | `@agentfarm/orchestrator` | 3011 | GOAP planner, task scheduler, routine scheduler, proactive signals, agent handoffs |
| `apps/trigger-service` | `@agentfarm/trigger-service` | 3002 | Inbound event router — receives webhooks, routes to agent-runtime `/run-task` |
| `apps/website` | `@agentfarm/website` | 3002/3102 | Next.js 15 marketing/product website |

### Services

| Package | Name | Purpose |
|---------|------|---------|
| `services/agent-observability` | `@agentfarm/agent-observability` | Azure Blob telemetry writer — structured agent run metrics |
| `services/agent-question-service` | `@agentfarm/agent-question-service` | Agent async Q&A — park task, await human answer, resume |
| `services/approval-service` | `@agentfarm/approval-service` | Approval CRUD and decision lifecycle (Prisma-backed) |
| `services/audit-storage` | `@agentfarm/audit-storage` | Audit event persistence (Prisma-backed) |
| `services/browser-actions` | `@agentfarm/browser-actions` | Browser audit session and action event recording |
| `services/compliance-export` | `@agentfarm/compliance-export` | GDPR/SOC2 export job runner |
| `services/connector-gateway` | `@agentfarm/connector-gateway` | Connector auth, token lifecycle, action dispatch to external APIs |
| `services/evidence-service` | `@agentfarm/evidence-service` | Evidence packet assembly for approvals and audit |
| `services/identity-service` | `@agentfarm/identity-service` | Tenant user identity and session management |
| `services/meeting-agent` | `@agentfarm/meeting-agent` | Voice pipeline, meeting lifecycle FSM, STT/TTS adapters |
| `services/memory-service` | `@agentfarm/memory-service` | Agent short-term/long-term memory CRUD |
| `services/notification-service` | `@agentfarm/notification-service` | Notification dispatch (Teams, Slack, email) |
| `services/policy-engine` | `@agentfarm/policy-engine` | Role policy enforcement — action allowlists, risk overrides |
| `services/provisioning-service` | `@agentfarm/provisioning-service` | Azure VM + Docker container provisioning workflow |
| `services/retention-cleanup` | `@agentfarm/retention-cleanup` | Retention policy enforcement — scheduled artifact cleanup |

### Packages

| Package | Name | Purpose |
|---------|------|---------|
| `packages/connector-contracts` | `@agentfarm/connector-contracts` | Shared connector action types and request/response shapes |
| `packages/crm-service` | `@agentfarm/crm-adapters` | CRM adapters (Salesforce, HubSpot, Zoho, Dynamics, Pipedrive) |
| `packages/db-schema` | `@agentfarm/db-schema` | Prisma schema + PostgreSQL client (34 models, 15+ enums) |
| `packages/erp-service` | `@agentfarm/erp-adapters` | ERP adapters (SAP, Oracle, Dynamics 365, NetSuite, Odoo) |
| `packages/notification-service` | `@agentfarm/notification-adapters` | Notification adapters (Webhook, Slack, Teams, Email) |
| `packages/observability` | `@agentfarm/observability` | Structured logging and telemetry helpers |
| `packages/queue-contracts` | `@agentfarm/queue-contracts` | Shared queue/event message contracts |
| `packages/shared-types` | `@agentfarm/shared-types` | Canonical TypeScript types, contract versions (43 contracts), enums |

---

## 2. Agent Roles

### Role Keys (canonical union in `packages/shared-types/src/index.ts`)

```
recruiter | developer | fullstack_developer | tester | business_analyst |
technical_writer | content_writer | sales_rep | marketing_specialist |
corporate_assistant | customer_support_executive |
project_manager_product_owner_scrum_master
```

### Role Configuration

Each role is governed by:
- **`RoleCapabilityProfileRecord`** — per-connector tool allowlists + allowed actions
- **`BotCapabilitySnapshot`** (Prisma model) — frozen capability snapshot at task time
  - fields: `roleKey`, `roleVersion`, `allowedConnectorTools[]`, `allowedActions[]`, `policyPackVersion`, `brainConfig` (JSON)
  - optional: `supportedLanguages[]`, `languageTier`, `speechProvider`, `translationProvider`, `ttsProvider`, `avatarEnabled`, `avatarStyle`, `avatarProvider`
- **`BotBrainConfig`** — `roleSystemPromptVersion`, `roleToolPolicyVersion`, `roleRiskPolicyVersion`, `defaultModelProfile`, `fallbackModelProfile`

### Tester Role Profile (fully implemented: `apps/agent-runtime/src/tester-agent-profile.ts`)

**Allowed connectors:** `jira`, `teams`, `github`, `email`

**Allowed local actions (45):** `code_read`, `run_tests`, `run_linter`, `workspace_list_files`, `workspace_grep`, `workspace_scout`, `git_log`, `workspace_cleanup`, `workspace_diff`, `workspace_memory_read`, `workspace_find_references`, `workspace_go_to_definition`, `workspace_hover_type`, `workspace_analyze_imports`, `workspace_generate_test`, `workspace_run_ci_checks`, `workspace_fix_test_failures`, `workspace_code_coverage`, `workspace_complexity_metrics`, `workspace_security_scan`, `workspace_test_impact_analysis`, `workspace_search_docs`, `workspace_package_lookup`, `workspace_language_adapter_python/java/go/csharp`, `workspace_change_impact_report`, `workspace_git_blame`, `workspace_outline_symbols`, `workspace_security_fix_suggest`, `workspace_pr_review_prepare`, `workspace_dependency_upgrade_plan`, `workspace_policy_preflight`, `workspace_connector_test`, `workspace_explain_code`, `workspace_refactor_plan`, `workspace_semantic_search`, `workspace_diff_preview`, `workspace_approval_status`, `workspace_audit_export`

**Blocked actions:** `merge_pr`, `deploy_production`, `delete_resource`, `workspace_subagent_spawn`, `run_shell_command`, `change_permissions`, `code_edit_patch`, `workspace_bulk_refactor`

**High-risk (requires approval):** `workspace_autonomous_plan_execute`, `workspace_github_issue_fix`

**Profile aliases:** `tester`, `tester_agent`, `qa`, `qa_engineer`, `quality_assurance_engineer`

### Developer Role

Full access to all action types subject to risk-based approval routing. No per-profile blocking. Primarily drives workspace execution, PR automation, and code editing.

### Model Profiles

`quality_first | speed_first | cost_balanced | custom`

---

## 3. Full Execution Pipeline

### Step 1 — Inbound Trigger (`apps/trigger-service`)

1. **WebhookTriggerSource** receives HTTP POST on `/webhook`; validates HMAC (`x-hub-signature-256` or `x-signature`). Returns 401 on invalid signature.
2. **TriggerEngine** calls `TriggerRouter.route(body, from)`.
3. Multi-tenant: **Anthropic LLM** classifies message to `tenantId` + `agentId`. Falls back to first tenant on auth error or missing key.
4. **TriggerDispatcher** POSTs `{ task, tenantId, agentId, triggerId, source }` to `<AGENT_RUNTIME_URL>/run-task`.
5. **ReplyDispatcher** sends success/failure notification to origin (Slack API or webhook `callbackUrl`).

### Step 2 — Task Receipt (`apps/agent-runtime`)

1. `runtime-server.ts` Fastify `POST /run-task` receives task envelope.
2. Loads **RuntimeConfig** from env: `tenantId`, `workspaceId`, `botId`, `roleProfile`, `roleKey`, `roleVersion`, `policyPackVersion`, `approvalApiUrl`, `connectorApiUrl`, `evidenceApiUrl`, etc.
3. Validates state machine: must be `ready` or `active`. Transitions to `active`.

### Step 3 — Task Classification (`apps/agent-runtime/src/execution-engine.ts`)

1. **`processDeveloperTask`** builds `LlmDecisionEnvelope` via configured LLM provider.
2. **`classifyRisk`** assigns `low | medium | high` based on `HIGH_RISK_ACTIONS` and `MEDIUM_RISK_ACTIONS` sets.
3. **`scoreConfidence`** computes 0–1 confidence score from LLM response.

### Step 4 — Risk Routing

| Risk Level | Outcome |
|------------|---------|
| `low` | Execute immediately via connector or local workspace |
| `medium` | Submit approval packet; await decision |
| `high` | Submit approval packet; await decision |

### Step 5 — LLM Decision (`apps/agent-runtime/src/llm-decision-adapter.ts`)

1. Selects provider via health scoring + per-task-type routing history.
2. Checks cooldown store (`.agent-runtime/provider-cooldowns.json`).
3. Calls provider API (5 s timeout).
4. On failure: classifies reason code, sets cooldown, fails over to next provider.
5. Records outcome in health store (5-min window, 20 entries max) and token budget state.

### Step 6 — Action Execution

**Connector actions (external):**
- POSTs to `connectorApiUrl` with `connectorExecuteToken`
- Supported: `read_task | create_comment | update_status | send_message | create_pr_comment | create_pr | merge_pr | list_prs | send_email`
- Connector types: `jira | teams | github | email | slack`

**Local workspace actions (in-container):**
- `local-workspace-executor.ts` — 140+ actions in Docker sandbox
- Shell commands: strict allowlist, no path traversal

### Step 7 — Approval Lifecycle

1. Approval packet POSTed to `approvalApiUrl` (api-gateway `/approvals`).
2. Packet: `change_summary`, `impacted_scope`, `risk_reason`, `proposed_rollback`, `lint_status`, `test_status`, `packet_complete`, `actorId`, `routeReason`, `evidenceLink`, `approvalSummary`.
3. Dashboard approval-queue-panel renders structured packet + detail drawer.
4. Decision (approved / rejected / timeout_rejected) fires webhook; agent continues or abandons.

### Step 8 — Evidence Assembly (`services/evidence-service`)

- Collects action records, approval records, audit events, LLM metadata.
- Assembles evidence packet; stores via `agent-observability` to Azure Blob.

### Step 9 — Post-Change Quality Gate

- After local workspace actions: run `run_tests` + `run_linter`.
- On failure: re-queue for LLM fix loop (configurable max attempts).

### Step 10 — Memory Recording

- Orchestrator calls `taskMemoryRecorder` after task.
- Stores `AgentShortTermMemory` (7-day TTL): `actionsTaken`, `approvalOutcomes`, `connectorsUsed`, `llmProvider`, `executionStatus`, `summary`.
- Long-term pattern learning via `AgentLongTermMemory`.

---

## 4. Complete Action Registry

### Risk Classification

**HIGH_RISK (requires approval):**
`merge_release`, `merge_pr`, `delete_resource`, `change_permissions`, `deploy_production`, `git_push`, `run_shell_command`, `workspace_repl_start`, `workspace_repl_execute`, `workspace_dry_run_with_approval_chain`, `workspace_browser_open`, `workspace_app_launch`, `workspace_meeting_join`, `workspace_meeting_speak`, `workspace_meeting_interview_live`, `workspace_subagent_spawn`, `workspace_github_issue_fix`

**MEDIUM_RISK (requires approval):**
`update_status`, `create_comment`, `create_pr_comment`, `create_pr`, `send_message`, `code_edit`, `code_edit_patch`, `code_search_replace`, `run_build`, `run_tests`, `git_commit`, `autonomous_loop`, `create_pr_from_workspace`, `workspace_memory_write`, `git_stash`, `apply_patch`, `file_move`, `file_delete`, `run_linter`, `workspace_install_deps`, `workspace_checkpoint`, `workspace_rename_symbol`, `workspace_extract_function`, `workspace_analyze_imports`, `workspace_security_scan`, `workspace_bulk_refactor`, `workspace_atomic_edit_set`, `workspace_generate_from_template`, `workspace_migration_helper`, `workspace_debug_breakpoint`, `workspace_profiler_run`, `workspace_rollback_to_checkpoint`, `workspace_generate_test`, `workspace_format_code`, `workspace_version_bump`, `workspace_changelog_generate`, `workspace_create_pr`, `workspace_run_ci_checks`, `workspace_fix_test_failures`, `workspace_release_notes_generate`, `workspace_incident_patch_pack`, `workspace_memory_profile`, `workspace_autonomous_plan_execute`, `workspace_pr_auto_assign`, `workspace_ci_watch`, `workspace_add_docstring`, `workspace_diff_preview`, `workspace_audit_export`, `workspace_github_pr_status`, `workspace_github_issue_triage`, `workspace_slack_notify`

**LOW_RISK (execute immediately):** All remaining read/scout/analysis actions.

### Local Workspace Actions by Tier

| Tier | Actions | Status |
|------|---------|--------|
| Tier 1 — Basic | `workspace_list_files`, `workspace_grep`, `workspace_read_file`, `file_move`, `file_delete`, `workspace_install_deps` | IMPLEMENTED |
| Tier 2 — Git/Scout | `run_linter`, `apply_patch`, `git_stash`, `git_log`, `workspace_scout`, `workspace_checkpoint` | IMPLEMENTED |
| Tier 3 — IDE | `workspace_find_references`, `workspace_rename_symbol`*, `workspace_extract_function`*, `workspace_go_to_definition`*, `workspace_hover_type`*, `workspace_analyze_imports`, `workspace_code_coverage`, `workspace_complexity_metrics`*, `workspace_security_scan`* | PARTIALLY STUBBED |
| Tier 4 — Multi-file | `workspace_bulk_refactor`, `workspace_atomic_edit_set`, `workspace_generate_from_template`, `workspace_migration_helper`, `workspace_summarize_folder`, `workspace_dependency_tree`*, `workspace_test_impact_analysis`* | PARTIALLY STUBBED |
| Tier 5 — External Knowledge | `workspace_search_docs`*, `workspace_package_lookup`*, `workspace_ai_code_review`*, `workspace_repl_start`*, `workspace_repl_execute`*, `workspace_repl_stop`, `workspace_debug_breakpoint`*, `workspace_profiler_run`* | STUBBED |
| Tier 6 — Language Adapters | `workspace_language_adapter_python`, `workspace_language_adapter_java`, `workspace_language_adapter_go`, `workspace_language_adapter_csharp` | IMPLEMENTED |
| Tier 7 — Governance | `workspace_dry_run_with_approval_chain`, `workspace_change_impact_report`, `workspace_rollback_to_checkpoint` | IMPLEMENTED |
| Tier 8 — Release | `workspace_generate_test`, `workspace_format_code`, `workspace_version_bump`, `workspace_changelog_generate`, `workspace_git_blame`, `workspace_outline_symbols` | IMPLEMENTED |
| Tier 9 — Productivity | `workspace_create_pr`, `workspace_run_ci_checks`, `workspace_fix_test_failures`, `workspace_security_fix_suggest`, `workspace_pr_review_prepare`, `workspace_dependency_upgrade_plan`, `workspace_release_notes_generate`, `workspace_incident_patch_pack`, `workspace_memory_profile`, `workspace_autonomous_plan_execute`, `workspace_policy_preflight` | IMPLEMENTED |
| Tier 10 — Connector/Observability | `workspace_connector_test`, `workspace_pr_auto_assign`, `workspace_ci_watch`, `workspace_explain_code`, `workspace_add_docstring`, `workspace_refactor_plan`, `workspace_semantic_search`, `workspace_diff_preview`, `workspace_approval_status`, `workspace_audit_export` | IMPLEMENTED |
| Tier 11 — Desktop/Browser | `workspace_browser_open`, `workspace_app_launch`, `workspace_meeting_join`, `workspace_meeting_speak`, `workspace_meeting_interview_live` | IMPLEMENTED (requires OS adapter) |
| Tier 12 — Sub-agent/GitHub/Slack | `workspace_subagent_spawn`, `workspace_github_pr_status`, `workspace_github_issue_triage`, `workspace_github_issue_fix`, `workspace_azure_deploy_plan`, `workspace_slack_notify` | IMPLEMENTED |
| Tier 13 — Performance | `workspace_benchmark_run`, `workspace_memory_leak_detect`, `workspace_bundle_size_analyze`, `workspace_perf_regression_flag` | IMPLEMENTED |
| Tier 14 — Database | `workspace_db_schema_diff`, `workspace_migration_safety_check`, `workspace_seed_data_generate`, `workspace_query_explain_plan` | IMPLEMENTED |
| Tier 15 — Security | `workspace_sast_scan`, `workspace_secret_scan`, `workspace_sbom_generate`, `workspace_cve_check`, `workspace_compliance_snapshot` | IMPLEMENTED |
| Tier 16 — Multi-file Refactoring | `workspace_dead_code_remove`, `workspace_interface_extract`, `workspace_import_cleanup`, `workspace_monorepo_boundary_check` | IMPLEMENTED |
| Tier 17 — Web Operator | `workspace_web_login`, `workspace_web_navigate`, `workspace_web_read_page`, `workspace_web_fill_form`, `workspace_web_click`, `workspace_web_extract_data` | IMPLEMENTED |
| Originals | `git_clone`, `git_branch`, `git_commit`, `git_push`, `code_read`, `code_edit`, `code_edit_patch`, `code_search_replace`, `run_build`, `run_tests`, `autonomous_loop`, `workspace_cleanup`, `workspace_diff`, `workspace_memory_write/read/promote_request/promote_decide/org_read`, `run_shell_command`, `create_pr_from_workspace` | IMPLEMENTED |

> \* = Stub implementation (returns structured placeholder; LSP/process integration not wired)

### Connector Actions (external API)

| Action | Connectors | Status |
|--------|-----------|--------|
| `read_task` | jira, github | IMPLEMENTED |
| `create_comment` | jira, github, teams | IMPLEMENTED |
| `update_status` | jira | IMPLEMENTED |
| `send_message` | teams, slack | IMPLEMENTED |
| `create_pr_comment` | github | IMPLEMENTED |
| `create_pr` | github | IMPLEMENTED |
| `merge_pr` | github | IMPLEMENTED |
| `list_prs` | github | IMPLEMENTED |
| `send_email` | email | STUBBED (Gmail/Outlook OAuth pending) |

---

## 5. LLM Integration

### Supported Providers

| Provider Key | Default Model | Base URL |
|-------------|--------------|---------|
| `openai` | `gpt-4o-mini` | `https://api.openai.com/v1` |
| `azure_openai` | (configured) | (configured) — API version `2024-06-01` |
| `github_models` | (configured) | `https://models.inference.ai.azure.com` |
| `anthropic` | `claude-3-5-sonnet-latest` | `https://api.anthropic.com` — API version `2023-06-01` |
| `google` | `gemini-1.5-flash` | `https://generativelanguage.googleapis.com/v1beta` |
| `xai` | `grok-beta` | `https://api.x.ai/v1` |
| `mistral` | `mistral-small-latest` | `https://api.mistral.ai/v1` |
| `together` | `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo` | `https://api.together.xyz/v1` |
| `agentfarm` | (internal) | (internal) |
| `auto` | dynamically selected | health-score + per-task-type history routing |

### Provider Health Scoring

- Health window: 5-minute sliding window, max 20 entries/provider
- Cooldown persistence: `.agent-runtime/provider-cooldowns.json`
- Routing history: in-memory per task type
- Failover reason codes: `rate_limit | auth_failure | billing_disabled | timeout | provider_unavailable | unclassified`

### Token Budget

- State persistence: `.agent-runtime/token-budget-state.json`
- Env: `AF_TOKEN_BUDGET_DAILY_LIMIT`, `AF_TOKEN_BUDGET_WARNING_THRESHOLD` (also `AGENTFARM_` prefixed variants)
- Scope: per-day by workspace/tenant

### Task Complexity Tiers

`simple | moderate | complex` — affects prompt strategy and model selection.

---

## 6. Connector Layer

### connector-gateway (`services/connector-gateway`)

- OAuth token lifecycle (refresh, rotation, expiry)
- Connector health checks
- Action dispatch with PII stripping
- Error classification and remediation hints

### External Connectors

| Connector | Auth | Status |
|-----------|------|--------|
| Jira | OAuth 2.0 | IMPLEMENTED |
| GitHub | PAT / GitHub App (`GITHUB_TOKEN`) | IMPLEMENTED |
| Teams | Graph API OAuth | IMPLEMENTED |
| Slack | Bot token (`SLACK_BOT_TOKEN`) | IMPLEMENTED |
| Email (Gmail/Outlook) | OAuth 2.0 | STUBBED — pending OAuth config |

### CRM Adapters (`packages/crm-service`)

| Adapter | System |
|---------|--------|
| `SalesforceAdapter` | Salesforce |
| `HubspotAdapter` | HubSpot |
| `ZohoAdapter` | Zoho CRM |
| `DynamicsAdapter` | Microsoft Dynamics |
| `PipedriveAdapter` | Pipedrive |

Interface: `getRecord`, `queryRecords`, `createRecord`, `updateRecord`, `deleteRecord`, `testConnection`

### ERP Adapters (`packages/erp-service`)

| Adapter | System |
|---------|--------|
| `SAPAdapter` | SAP |
| `OracleAdapter` | Oracle ERP |
| `Dynamics365Adapter` | Microsoft Dynamics 365 |
| `NetSuiteAdapter` | NetSuite |
| `OdooAdapter` | Odoo |

Interface: `getDocument`, `queryDocuments`, `createDocument`, `updateDocument`, `deleteDocument`, `testConnection`

### Notification Adapters (`packages/notification-service`)

| Adapter | Channel | Status |
|---------|---------|--------|
| `WebhookAdapter` | Generic HTTP POST | IMPLEMENTED |
| `SlackAdapter` | Slack Incoming Webhook | IMPLEMENTED |
| `TeamsAdapter` | Microsoft Teams Webhook | IMPLEMENTED |
| `EmailAdapter` | SMTP (nodemailer) | DECLARED — test confirms NOT implemented in dispatcher |

---

## 7. Data Models

**Database:** PostgreSQL | **ORM:** Prisma 6.x | **Schema:** `packages/db-schema/prisma/schema.prisma`

### Core Entities

| Model | Purpose |
|-------|---------|
| `Tenant` | Root tenant (status: pending→terminated) |
| `TenantUser` | Tenant user with bcrypt password hash |
| `Workspace` | Workspace within a tenant |
| `Bot` | Agent bot assigned to workspace (role, status) |

### Provisioning

| Model | Purpose |
|-------|---------|
| `ProvisioningJob` | Azure VM + container provisioning (12-state FSM) |
| `RuntimeInstance` | Running agent-runtime Docker instance (heartbeat) |
| `BotCapabilitySnapshot` | Frozen capability snapshot (role, actions, brain config) |

### Actions & Approvals

| Model | Purpose |
|-------|---------|
| `ActionRecord` | Individual action (type, risk, status, correlationId) |
| `Approval` | Approval lifecycle with P95 SLA fields (`decisionLatencySeconds`) |
| `AuditEvent` | Immutable audit trail (7 types, 4 severity levels) |
| `ConnectorAction` | Connector API call record |
| `ConnectorAuthMetadata` | Per-connector OAuth state (12-state FSM) |
| `ConnectorAuthSession` | OAuth PKCE/state nonce for in-flight flows |
| `ConnectorAuthEvent` | OAuth flow audit history |
| `TaskExecutionRecord` | LLM execution metrics (tokens, latency, outcome) |

### Workspace Continuity (Phase 1 VM Realism)

| Model | Purpose |
|-------|---------|
| `WorkspaceSessionState` | Persistent workspace state (versioned JSON) |
| `WorkspaceCheckpoint` | Rollback checkpoints with state digest |
| `DesktopProfile` | Browser profile (tabs, token rotation) |
| `IdeState` | IDE open files, active file, breakpoints |
| `TerminalSession` | Shell, CWD, command history |
| `ActivityEvent` | Unified activity stream with ack/sequence |
| `EnvProfile` | Toolchain reconciler + drift report |
| `DesktopAction` | Desktop GUI action (screenshot refs, retry class) |

### Sprint 3/4 Features

| Model | Purpose |
|-------|---------|
| `PrDraft` | PR auto-driver (branch, title, body, checklist, reviewer suggestions) |
| `CiTriageReport` | CI failure triage (root cause, patch proposal, blast radius) |
| `WorkMemory` | Workspace work memory and next-action plans |
| `RunResume` | Crash recovery resume strategy |
| `ReproPack` | Repro pack export with signed download URL |

### Agent Memory

| Model | Purpose |
|-------|---------|
| `AgentShortTermMemory` | 7-day TTL task memory (actions, approvals, connectors, provider, summary) |
| `AgentLongTermMemory` | Pattern learning (confidence + observed count) |

### Browser Audit System

| Model | Purpose |
|-------|---------|
| `AgentSession` | Root audit session (recording URL, action count, retention policy) |
| `BrowserActionEvent` | Browser action with before/after screenshots, DOM hash, network log |
| `RetentionPolicy` | Customer retention config (never_delete / manual_delete / auto_delete_after_days) |

### Agent Q&A

| Model | Purpose |
|-------|---------|
| `AgentQuestion` | Async Q&A (park + resume, 4-hour default timeout, 3 channels) |

### Prisma Enums

`TenantStatus`, `WorkspaceStatus`, `BotStatus`, `ProvisioningJobStatus` (12), `RuntimeStatus` (8), `CapabilitySnapshotSource` (3), `ApprovalDecision` (4), `ConnectorAuthStatus` (12), `ConnectorScopeStatus` (3), `ConnectorErrorClass` (8), `ConnectorActionType` (6), `ConnectorActionStatus` (3), `ConnectorActionErrorCode` (7), `AuditEventType` (7), `AuditSeverity` (4), `ActionStatus` (5), `RiskLevel` (3), `TaskExecutionOutcome` (3), `BrowserActionType` (10), `SessionAuditStatus` (4), `RetentionPolicyAction` (3), `RetentionPolicyScope` (3), `RetentionPolicyStatus` (3), `AgentQuestionStatus` (3), `AgentQuestionChannel` (3), `AgentQuestionTimeoutPolicy` (3)

---

## 8. Test Summary

> All tests run with `pnpm --filter "*" run test`. All pass, 0 failures.

| Package | Tests | Pass | Fail | Runner |
|---------|-------|------|------|--------|
| `apps/agent-runtime` | 678 | 678 | 0 | tsx / Node test runner |
| `apps/api-gateway` | 398 | 398 | 0 | tsx / Node test runner |
| `apps/dashboard` | 118 | 118 | 0 | tsx / Node test runner |
| `apps/orchestrator` | 62 | 62 | 0 | tsx / Node test runner |
| `apps/trigger-service` | 14 | 14 | 0 | tsx / Node test runner |
| `services/connector-gateway` | 36 | 36 | 0 | tsx / Node test runner |
| `services/evidence-service` | 24 | 24 | 0 | tsx / Node test runner |
| `services/notification-service` | 31 | 31 | 0 | tsx / Node test runner |
| `services/meeting-agent` | 23 | 23 | 0 | tsx / Node test runner |
| `services/provisioning-service` | 15 | 15 | 0 | tsx / Node test runner |
| `services/approval-service` | 12 | 12 | 0 | tsx / Node test runner |
| `services/memory-service` | 11 | 11 | 0 | tsx / Node test runner |
| `services/agent-observability` | 11 | 11 | 0 | tsx / Node test runner |
| `services/policy-engine` | 2 | 2 | 0 | tsx / Node test runner |
| `services/audit-storage` | 0 | — | — | tsx (no tests yet) |
| `packages/crm-service` | 37 | 37 | 0 | Vitest |
| `packages/erp-service` | 44 | 44 | 0 | Vitest |
| `packages/notification-service` | 17 | 17 | 0 | Vitest |
| `services/agent-question-service` | 8 | 8 | 0 | Vitest |
| **TOTAL** | **1,542** | **1,542** | **0** | |

**Quality gate:** `node scripts/quality-gate.mjs` — 52 checks, **PASS**
**E2E:** Playwright Chromium — `apps/dashboard/scripts/workspace-tab-e2e.mjs` — **PASS**
**DB smoke:** `apps/agent-runtime` `test:db-smoke` — requires `.env` with `DATABASE_URL`, run manually.

---

## 9. Gaps and TODOs

### Stubbed Workspace Actions (production wiring needed)

| Action | Location | Gap |
|--------|---------|-----|
| `workspace_rename_symbol` | local-workspace-executor.ts L3474 | Requires LSP integration |
| `workspace_extract_function` | local-workspace-executor.ts L3508 | Simple text replace only |
| `workspace_go_to_definition` | local-workspace-executor.ts L3548 | No LSP |
| `workspace_hover_type` | local-workspace-executor.ts L3575 | TypeScript placeholder only |
| `workspace_analyze_imports` | local-workspace-executor.ts L3597 | grep-based only |
| `workspace_complexity_metrics` | local-workspace-executor.ts L3634 | Hardcoded stub values |
| `workspace_security_scan` | local-workspace-executor.ts L3656 | Grep for common patterns only |
| `workspace_dependency_tree` | local-workspace-executor.ts L3860 | Simple import parser |
| `workspace_test_impact_analysis` | local-workspace-executor.ts L3889 | Grep for changed file only |
| `workspace_search_docs` | local-workspace-executor.ts L3922 | Hardcoded mock results |
| `workspace_package_lookup` | local-workspace-executor.ts L3947 | Mock package info |
| `workspace_ai_code_review` | local-workspace-executor.ts L3973 | LLM not wired |
| `workspace_repl_start/execute` | local-workspace-executor.ts L3996 | No REPL process spawned |
| `workspace_debug_breakpoint` | local-workspace-executor.ts L4057 | No debugger wiring |
| `workspace_profiler_run` | local-workspace-executor.ts L4069 | Not implemented |

### Other Stubs

| File | Gap |
|------|-----|
| `apps/agent-runtime/src/desktop-operator-factory.ts` L126 | Native desktop adapter TODO — needs AppleScript/xdg-open/PowerShell |
| `services/connector-gateway/src/connectors/email-connector.ts` | Gmail and Outlook adapters stubbed pending OAuth config |
| `services/meeting-agent/src/voice-pipeline.ts` L23,29 | STT (Whisper API) and TTS (VoxCPM) stubs for production voice |
| `packages/notification-service` EmailAdapter | SMTP dispatcher not implemented |

### Missing Test Coverage

| Package | Gap |
|---------|-----|
| `services/audit-storage` | 0 tests |
| `services/policy-engine` | Only 2 tests — minimal coverage |
| `services/browser-actions` | Not in test output |
| `services/compliance-export` | Not in test output |
| `services/retention-cleanup` | Not in test output |
| `services/identity-service` | Not in test output |

### Architecture Notes

- `apps/api-gateway/src/agent-runtime-stubs.ts` provides typed stub fallbacks for `@agentfarm/agent-runtime` sub-modules — cross-package import boundary managed via stubs.
- DB smoke test lane (`test:db-smoke`) requires manual `.env` file and is excluded from standard `pnpm test`.
- Git worktrees at `.claude/worktrees/` — exclude from grep searches.
- `services/retention-cleanup`: `manual_delete` policy returns `false` (not implemented per service code comment).

---

## 10. Environment Variable Reference

### apps/agent-runtime

| Variable | Purpose |
|----------|---------|
| `AF_WORKSPACE_BASE` | Base directory for local workspace operations |
| `AF_ADVANCED_STATE_DIR` | Advanced runtime state persistence directory |
| `AF_TASK_INTELLIGENCE_PATH` | Task intelligence memory store path |
| `AF_PROVIDER_COOLDOWN_STATE_PATH` / `AGENTFARM_PROVIDER_COOLDOWN_STATE_PATH` | LLM provider cooldown persistence |
| `AF_TOKEN_BUDGET_STATE_PATH` / `AGENTFARM_TOKEN_BUDGET_STATE_PATH` | Token budget state persistence |
| `AF_TOKEN_BUDGET_DAILY_LIMIT` / `AGENTFARM_TOKEN_BUDGET_DAILY_LIMIT` | Daily token cap |
| `AF_TOKEN_BUDGET_WARNING_THRESHOLD` / `AGENTFARM_TOKEN_BUDGET_WARNING_THRESHOLD` | Token warning threshold |
| `AF_LOCAL_ALLOWED_APPS` | Allowlisted desktop applications |
| `AF_LOCAL_ALLOWED_BROWSERS` | Allowlisted browser executables |
| `AF_LOCAL_ALLOWED_MEETING_HOSTS` | Allowlisted meeting host URLs |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `GITHUB_TOKEN` | GitHub PAT |
| `GITHUB_OWNER` | GitHub repository owner |
| `GITHUB_REPO` | GitHub repository name |
| `GITHUB_DEFAULT_BASE_BRANCH` | Default base branch for PRs |
| `SLACK_BOT_TOKEN` | Slack bot token |
| `AGENT_OBSERVABILITY_BLOB_ACCOUNT_URL` | Azure Blob account URL |
| `AGENT_OBSERVABILITY_BLOB_CONTAINER` | Azure Blob container |
| `AGENT_OBSERVABILITY_BLOB_WRITE_SAS_TOKEN` | Write SAS token |
| `AGENT_OBSERVABILITY_BLOB_READ_SAS_TOKEN` | Read SAS token |
| `BROWSER_PROFILE_DIR` | Browser profile directory |
| `CUSTOMER_ID` | Customer identifier |
| `DESKTOP_OPERATOR` | Desktop operator mode |
| `DESKTOP_OPERATOR_SESSION_ID` | Desktop operator session |
| `DATABASE_URL` | PostgreSQL connection string (Prisma) |
| `HOME` | Home directory |
| `RUNTIME_BASE_URL` / `RUNTIME_PORT` | Runtime HTTP endpoint |

### apps/api-gateway

| Variable | Purpose |
|----------|---------|
| `API_GATEWAY_PORT` | Server port (default: 3000) |
| `API_REQUIRE_AUTH` | Enable session auth (`true`/`false`) |
| `OPS_MONITORING_TOKEN` | Token for ops endpoints (`x-ops-token`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | JWT signing secret |

### apps/trigger-service

| Variable | Purpose |
|----------|---------|
| `TRIGGER_SERVICE_PORT` | Server port (default: 3002) |
| `TRIGGER_CONFIG_PATH` | Path to JSON config file |
| `TRIGGER_CONFIG` | Inline JSON config |
| `TRIGGER_TENANT_ID` | Single-tenant fallback tenant ID |
| `TRIGGER_DEFAULT_AGENT_ID` | Single-tenant fallback agent ID |
| `AGENT_RUNTIME_URL` | Target agent-runtime URL |
| `ANTHROPIC_API_KEY` | Anthropic key for multi-tenant routing |
| `ANTHROPIC_API_VERSION` | Anthropic API version |
| `WEBHOOK_HMAC_SECRET` | HMAC secret for webhook validation |

### apps/orchestrator

| Variable | Purpose |
|----------|---------|
| `ORCHESTRATOR_STATE_PATH` | State persistence path |
| `ORCHESTRATOR_STATE_BACKEND` | Backend: `auto` / `file` / `memory` |
| `ORCHESTRATOR_GATEWAY_API_URL` / `API_GATEWAY_URL` | API gateway base URL |
| `ORCHESTRATOR_GATEWAY_BEARER_TOKEN` | Bearer token for gateway |
| `ORCHESTRATOR_GATEWAY_OPS_TOKEN` | Ops token (`x-ops-token`) |
| `ORCHESTRATOR_SESSION_API_URL` | Workspace session API URL |
| `RUNTIME_SESSION_SHARED_TOKEN` | Shared token for session API |

---

*Report generated from full source scan of `apps/`, `services/`, `packages/`. `.claude/worktrees/` excluded.*
