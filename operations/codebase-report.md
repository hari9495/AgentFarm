# AgentFarm Codebase Report

Generated: 2026-05-09T00:00:00Z  
Scanned by: Claude (full read — no guesses from filenames)

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

---

## 1. Monorepo Structure

**Root**: `D:\AgentFarm`  
**Package manager**: pnpm 9.12.0  
**Workspace globs**: `apps/*`, `services/*`, `packages/*`

### Apps

| Name (npm) | Location | Port | Purpose |
|---|---|---|---|
| `@agentfarm/api-gateway` | `apps/api-gateway` | 3000 | Central REST API. Auth, roles, connectors, approvals, tasks, memory, audit, governance. 76+ route files. |
| `@agentfarm/agent-runtime` | `apps/agent-runtime` | 4000 | LLM decision engine + action executor. Handles all bot task execution. Core of the system. |
| `@agentfarm/trigger-service` | `apps/trigger-service` | 3002 | Ingests webhooks (GitHub, Jira, Slack, email, PagerDuty) and dispatches tasks to agent-runtime. |
| `@agentfarm/dashboard` | `apps/dashboard` | 3001 | Next.js internal dashboard. Marketplace panel, workspace tabs, mobile drawer. |
| `@agentfarm/website` | `apps/website` | 3002 | Next.js marketing site. Waitlist, auth, 3D hero (Three.js), Framer Motion. |
| `@agentfarm/orchestrator` | `apps/orchestrator` | 3011 | Multi-workspace orchestrator. File-based or Prisma state store. Routes tasks across workspaces. |

### Packages

| Name (npm) | Location | Purpose |
|---|---|---|
| `@agentfarm/shared-types` | `packages/shared-types` | All shared TypeScript interfaces, type contracts, storage paths, retention policies, telemetry, skill composition types |
| `@agentfarm/connector-contracts` | `packages/connector-contracts` | Connector registry, all connector action schemas, contract version constants |
| `@agentfarm/queue-contracts` | `packages/queue-contracts` | Queue name constants (`queue_runtime_tasks`, `queue_approval`, etc.) and lease action types |
| `@agentfarm/db-schema` | `packages/db-schema` | Prisma schema + migrations. PostgreSQL. 34 models, 15 enums. |
| `@agentfarm/observability` | `packages/observability` | `ObservabilityEventStore` — in-memory event emit/list with severity filtering |
| `@agentfarm/notification-adapters` | `packages/notification-service` | Webhook, Email, Slack, Teams notification adapters. `NotificationService`, `AdapterFactory`, `CustomerNotificationStore` |
| `@agentfarm/crm-adapters` | `packages/crm-service` | Salesforce, HubSpot, Zoho, Dynamics, Pipedrive adapters. `CRMService`, `CRMAdapterFactory` |
| `@agentfarm/erp-adapters` | `packages/erp-service` | SAP, Oracle, Dynamics 365, NetSuite, Odoo adapters. `ERPService`, `ERPAdapterFactory` |

### Services (under `services/`)

| Directory | Purpose |
|---|---|
| `services/connector-gateway` | Connector execution gateway. Implements `GitHubConnector` with raw `fetch` to `api.github.com`. Uses `GITHUB_TOKEN`. |
| `services/memory-service` | `AgentShortTermMemory` + `AgentLongTermMemory` CRUD. 7-day TTL for short-term. |
| `services/retention-cleanup` | Scheduled cleanup job. Deletes expired sessions/memories per `RetentionPolicy`. `manual_delete` policy NOT implemented (silently returns false). |
| `services/notification-service` | Notification dispatcher (separate from the package). Email dispatch is NOT implemented (test file confirms). |

---

## 2. Agent Roles

Defined in `apps/api-gateway/src/routes/roles.ts` — `ROLE_CATALOG` array.  
All roles use `defaultPolicyPackVersion: 'rbac-rolepack-v1'` and `roleVersion: 'v1'`.

| roleKey | Display Name | Description |
|---|---|---|
| `recruiter` | Recruiter | Sources candidates, evaluates profiles, and coordinates hiring workflows |
| `developer` | Developer | Implements scoped engineering changes with connector-backed execution |
| `fullstack_developer` | Fullstack Developer | Delivers frontend and backend implementation workflows end to end |
| `tester` | Tester | Designs and runs validation plans, and reports regressions and risks |
| `business_analyst` | Business Analyst | Creates requirement clarity, acceptance criteria, and process insights |
| `technical_writer` | Technical Writer | Produces technical documentation, release notes, and operational guides |
| `content_writer` | Content Writer | Builds product content, messaging, and campaign copy across channels |
| `sales_rep` | Sales Representative | Supports lead follow-up, outreach, and sales pipeline progression |
| `marketing_specialist` | Marketing Specialist | Runs campaign execution, messaging experiments, and outreach loops |
| `corporate_assistant` | Corporate Assistant | Coordinates day-to-day scheduling, notes, and follow-up workflows |
| `customer_support_executive` | Customer Support Executive | Handles customer tickets, responses, and support escalation handoffs |
| `project_manager_product_owner_scrum_master` | Project Manager / Product Owner / Scrum Master | Coordinates execution plans, backlog flow, and cross-team delivery cadence |

### Role → Allowed Local Actions (from `runtime-server.ts` → `LOCAL_WORKSPACE_ACTION_POLICY`)

| Role | Local Actions Allowed |
|---|---|
| `developer` | All ~100 actions in the executor (read + write + git + shell + tests + browser + sub-agent) |
| `fullstack_developer` | Same as `developer` |
| `tester` | Read-only + test subset (46 actions — see list in `tester-agent-profile.ts`). Blocked from: `merge_pr`, `deploy_production`, `run_shell_command`, `code_edit_patch`, `workspace_bulk_refactor`, `workspace_subagent_spawn` |
| All other roles | `['code_read']` only (or empty set for pure connector-based roles) |

### Tester Role — Allowed Actions (from `tester-agent-profile.ts`)
```
code_read, run_tests, run_linter, workspace_list_files, workspace_grep,
workspace_scout, git_log, workspace_cleanup, workspace_diff,
workspace_memory_read, workspace_find_references, workspace_go_to_definition,
workspace_hover_type, workspace_analyze_imports, workspace_generate_test,
workspace_run_ci_checks, workspace_fix_test_failures, workspace_code_coverage,
workspace_complexity_metrics, workspace_security_scan, workspace_test_impact_analysis,
workspace_search_docs, workspace_package_lookup, workspace_language_adapter_python,
workspace_language_adapter_java, workspace_language_adapter_go,
workspace_language_adapter_csharp, workspace_change_impact_report,
workspace_git_blame, workspace_outline_symbols, workspace_security_fix_suggest,
workspace_pr_review_prepare, workspace_dependency_upgrade_plan,
workspace_policy_preflight, workspace_connector_test, workspace_explain_code,
workspace_refactor_plan, workspace_semantic_search, workspace_diff_preview,
workspace_approval_status, workspace_audit_export
```

### Role → Connector Policy (from `runtime-server.ts` → `ROLE_CONNECTOR_POLICY`)

| Role | Allowed Connectors |
|---|---|
| `developer`, `fullstack_developer` | `jira`, `github`, `teams`, `email` |
| `tester` | `jira`, `teams`, `github`, `email` (from `TESTER_ROLE_ALLOWED_CONNECTORS`) |
| `recruiter` | (HR connectors — configured separately) |
| `sales_rep` | CRM connectors |
| Other roles | Subset of `jira`, `teams`, `email` |

### System Prompts

System prompts are **not stored as static strings** for each role. They are assembled dynamically:

- **`apps/trigger-service/src/trigger-router.ts`** — `buildSystemPrompt(config)`: builds a prompt listing all tenants and their registered agents (ID + description). Used by the trigger router to decide which agent to dispatch to.
- **`apps/agent-runtime/src/task-planner.ts`** — `PLANNER_SYSTEM_PROMPT`: instructs an LLM to parse a natural language task into a structured `ActionPlan` JSON with specific available action types.
- **Memory injection** (`execution-engine.ts` → `processDeveloperTaskWithMemory()`): injects `_memory_context` (recent memories, approval rejection rate, common connectors, code review patterns) into the task payload before LLM decision.

> **Gap**: No per-role static system prompts found. Role identity is carried via `roleKey` in the payload and enforced via the action policy tables, not via LLM prompting.

---

## 3. Full Execution Pipeline

### Step-by-step: Webhook → Task Result

```
1. INBOUND TRIGGER
   trigger-service/src/main.ts (port 3002)
   └── POST /webhook/:provider  (or Slack bolt / IMAP email / PagerDuty)
       ├── Verify HMAC-SHA256 signature (WEBHOOK_HMAC_SECRET)
       ├── Parse provider payload (GitHub, Jira, Linear, Sentry, PagerDuty, email)
       └── TriggerEngine.dispatch(event)

2. ROUTING
   trigger-service/src/trigger-engine.ts
   └── TriggerRouter.route(event)
       ├── buildSystemPrompt(config) → tenant + agent descriptions
       ├── Match event to tenant + agentId via routing rules
       └── POST http://agent-runtime:4000/run-task  { taskId, payload, enqueuedAt }

3. TASK RECEIPT
   agent-runtime/src/runtime-server.ts  POST /run-task
   └── validateTaskEnvelope(body)
       ├── Check task lease (if enforceTaskLease=true)
       ├── Validate roleKey, policyPackVersion, contractVersion
       ├── enrichTaskWithRuntimeContext() → inject tenantId, workspaceId, botId, roleKey
       └── processDeveloperTask(task, { llmDecisionResolver })

4. HEURISTIC DECISION
   agent-runtime/src/execution-engine.ts  buildDecision(task)
   ├── normalizeActionType(payload)  → reads action_type or intent field
   ├── scoreConfidence(payload)       → 0.92 base, deduct for missing summary/target/high complexity
   ├── classifyRisk(actionType, confidence)
   │   ├── HIGH_RISK: merge_release, merge_pr, delete_resource, git_push,
   │   │             run_shell_command, workspace_repl_*, workspace_browser_open,
   │   │             workspace_app_launch, workspace_meeting_*, workspace_subagent_spawn,
   │   │             workspace_github_issue_fix
   │   ├── MEDIUM_RISK: code_edit, code_edit_patch, run_build, run_tests, git_commit,
   │   │               autonomous_loop, create_pr_from_workspace, workspace_memory_write,
   │   │               workspace_bulk_refactor, workspace_generate_test, workspace_create_pr,
   │   │               workspace_run_ci_checks, workspace_slack_notify, +30 more
   │   └── LOW_RISK: everything else (confidence >= 0.6)
   └── route = 'approval' (medium/high) | 'execute' (low)

5. LLM DECISION OVERRIDE (optional)
   agent-runtime/src/llm-decision-adapter.ts
   ├── createLlmDecisionResolverFromConfig(config)
   ├── Select provider: OpenAI | Azure OpenAI | GitHub Models | Anthropic |
   │                    Google | xAI | Mistral | Together AI | Auto (failover)
   ├── Health scoring: track failure rate per provider, apply cooldown
   ├── Build prompt from task payload + heuristic decision
   ├── Call provider API (text completion — no tools:[])
   ├── Parse LLM response → refined ActionDecision + optional payloadOverrides
   └── Return decision + metadata (provider, model, tokens, failover trace)

6a. IF APPROVAL REQUIRED
    runtime-server.ts → POST approvalApiUrl (approval intake)
    ├── Store Approval record in DB (status: pending)
    ├── Return { status: 'approval_required' } to caller
    └── Wait for decision webhook POST /decision-webhook
        └── On approval → processApprovedTask(task) → continue to step 7

6b. IF LOW RISK (execute directly)
    Continue to step 7

7. ACTION DISPATCH
   agent-runtime/src/local-workspace-executor.ts  executeLocalWorkspaceAction(action)
   ├── Validate action type against LOCAL_WORKSPACE_ACTION_TYPES set
   ├── Check role permission via getAllowedActionsForRole(roleKey)
   ├── Rate-limit check (workspace-rate-limiter.ts)
   └── switch(action.type) → dispatch to handler (see Action Registry below)

8. RESULT PERSISTENCE
   agent-runtime/src/action-result-writer.ts
   └── Append NDJSON record to AF_ACTION_RESULT_LOG_PATH
       { taskId, actionType, status, input, output, durationMs, timestamp }

   agent-runtime/src/evidence-assembler.ts + evidence-record-writer.ts
   └── Write evidence record (audit trail) to AF_EVIDENCE_API_URL

   agent-runtime/src/action-observability.ts
   └── Write to SQLite (AGENT_OBSERVABILITY_DB_PATH) or
       Azure Blob Storage (AGENT_OBSERVABILITY_BLOB_ACCOUNT_URL)

9. TASK INTELLIGENCE MEMORY
   agent-runtime/src/task-intelligence-memory.ts  recordTaskIntelligence()
   └── Write AgentShortTermMemory (actions taken, approval outcomes, connectors used)
       Expires after 7 days. Used for context injection in future tasks.

10. NOTIFICATION
    agent-runtime/src/notification-hook.ts  maybeNotify()
    ├── Only fires if payload.notify === true
    ├── Resolve customer notification config from customerNotificationStore
    └── Dispatch via NotificationService (Webhook | Email | Slack | Teams)

11. CRM / ERP UPDATE
    agent-runtime/src/crm-hook.ts  maybePushCRMUpdate()
    agent-runtime/src/erp-hook.ts  maybePushERPUpdate()
    └── Fire if connector result includes CRM/ERP record type

12. EVALUATOR WEBHOOK (optional)
    agent-runtime/src/evaluator-webhook.ts  fireEvaluatorWebhook()
    └── POST RUNTIME_BASE_URL/evaluate with task result (quality scoring)
```

---

## 4. Complete Action Registry

All handlers live in `apps/agent-runtime/src/local-workspace-executor.ts`.  
Risk levels from `apps/agent-runtime/src/execution-engine.ts`.

### Tier 0 — Repository Setup

| Action | Input | Output | Status |
|---|---|---|---|
| `git_clone` | `{ repo_url, branch?, depth? }` | `{ cloned: true, path }` | ✅ IMPLEMENTED |
| `git_branch` | `{ branch_name?, from? }` | `{ branch, created: true }` | ✅ IMPLEMENTED |

### Tier 1 — Read / Inspect (LOW RISK)

| Action | Input | Output | Status |
|---|---|---|---|
| `code_read` | `{ path }` | `{ content, lines, size }` | ✅ IMPLEMENTED |
| `workspace_read_file` | `{ path }` | `{ content }` (1 MB limit) | ✅ IMPLEMENTED |
| `workspace_list_files` | `{ path?, pattern?, recursive? }` | `{ files: string[] }` | ✅ IMPLEMENTED |
| `workspace_grep` | `{ pattern, path?, context_lines?, file_pattern? }` | `{ matches: [{file,line,text}] }` | ✅ IMPLEMENTED |
| `workspace_scout` | `{ query }` | `{ summary, relevant_files[] }` | ✅ IMPLEMENTED |
| `workspace_diff` | `{ base?, head? }` | `{ diff_text }` | ✅ IMPLEMENTED |
| `workspace_memory_read` | `{ key? }` | `{ memories[] }` | ✅ IMPLEMENTED |
| `workspace_memory_org_read` | `{ key? }` | `{ org_memories[] }` | ✅ IMPLEMENTED |
| `workspace_find_references` | `{ symbol, file? }` | `{ references[] }` | ✅ IMPLEMENTED |
| `workspace_go_to_definition` | `{ symbol, file }` | `{ definition_location }` | ✅ IMPLEMENTED |
| `workspace_hover_type` | `{ symbol, file, line }` | `{ type_info }` | ✅ IMPLEMENTED |
| `workspace_analyze_imports` | `{ file }` | `{ imports[], unused[] }` | ✅ IMPLEMENTED (MEDIUM RISK) |
| `workspace_outline_symbols` | `{ file }` | `{ symbols[] }` | ✅ IMPLEMENTED |
| `workspace_git_blame` | `{ file, line_start?, line_end? }` | `{ blame[] }` | ✅ IMPLEMENTED |
| `git_log` | `{ limit?, branch? }` | `{ commits[] }` | ✅ IMPLEMENTED |
| `workspace_cleanup` | `{}` | `{ cleaned: true }` | ✅ IMPLEMENTED |

### Tier 2 — Write / Mutate (MEDIUM RISK)

| Action | Input | Output | Status |
|---|---|---|---|
| `code_edit` | `{ path, content }` | `{ written: true, size }` | ✅ IMPLEMENTED |
| `code_edit_patch` | `{ path, old_string, new_string, replace_all? }` | `{ patched: true, replacements }` | ✅ IMPLEMENTED |
| `code_search_replace` | `{ path, search, replace }` | `{ replaced: true }` | ✅ IMPLEMENTED |
| `workspace_memory_write` | `{ key, value }` | `{ written: true }` | ✅ IMPLEMENTED |
| `workspace_memory_promote_request` | `{ key, value }` | `{ requested: true }` | ✅ IMPLEMENTED |
| `workspace_memory_promote_decide` | `{ requestId, decision }` | `{ decided: true }` | ✅ IMPLEMENTED |
| `run_shell_command` | `{ command, timeout_ms? }` | `{ exit_code, stdout, stderr }` | ✅ IMPLEMENTED (HIGH RISK) |
| `git_stash` | `{ label? }` | `{ stashed: true }` | ✅ IMPLEMENTED |
| `apply_patch` | `{ patch_text }` | `{ applied: true }` | ✅ IMPLEMENTED |
| `file_move` | `{ from, to }` | `{ moved: true }` | ✅ IMPLEMENTED |
| `file_delete` | `{ path }` | `{ deleted: true }` | ✅ IMPLEMENTED |
| `run_linter` | `{ path? }` | `{ issues[], exit_code }` | ✅ IMPLEMENTED |
| `workspace_install_deps` | `{ manager? }` | `{ installed: true }` | ✅ IMPLEMENTED |
| `workspace_checkpoint` | `{ label }` | `{ checkpoint_id }` | ✅ IMPLEMENTED |

### Tier 3 — IDE Refactoring (MEDIUM RISK)

| Action | Input | Output | Status |
|---|---|---|---|
| `workspace_rename_symbol` | `{ symbol, new_name, file? }` | `{ renamed: true, files_changed[] }` | ✅ IMPLEMENTED |
| `workspace_extract_function` | `{ file, start_line, end_line, fn_name }` | `{ extracted: true }` | ✅ IMPLEMENTED |
| `workspace_security_scan` | `{ path? }` | `{ vulnerabilities[] }` | ✅ IMPLEMENTED |

### Tier 4 — Multi-file Coordination (MEDIUM RISK)

| Action | Input | Output | Status |
|---|---|---|---|
| `workspace_bulk_refactor` | `{ operations[] }` | `{ results[] }` | ✅ IMPLEMENTED |
| `workspace_atomic_edit_set` | `{ edits[] }` | `{ applied: true }` | ✅ IMPLEMENTED |
| `workspace_generate_from_template` | `{ template, vars }` | `{ generated_files[] }` | ✅ IMPLEMENTED |
| `workspace_migration_helper` | `{ from_version, to_version }` | `{ migration_steps[] }` | ✅ IMPLEMENTED |
| `workspace_summarize_folder` | `{ path }` | `{ summary }` | ✅ IMPLEMENTED |
| `workspace_dependency_tree` | `{ path? }` | `{ tree }` | ✅ IMPLEMENTED |
| `workspace_test_impact_analysis` | `{ changed_files[] }` | `{ affected_tests[] }` | ✅ IMPLEMENTED |

### Tier 5 — Code Intelligence (MEDIUM RISK)

| Action | Input | Output | Status |
|---|---|---|---|
| `workspace_search_docs` | `{ query }` | `{ results[] }` | ✅ IMPLEMENTED |
| `workspace_package_lookup` | `{ package_name }` | `{ info }` | ✅ IMPLEMENTED |
| `workspace_ai_code_review` | `{ file?, diff? }` | `{ review_comments[] }` | ✅ IMPLEMENTED |
| `workspace_repl_start` | `{ language }` | `{ session_id }` | ✅ IMPLEMENTED (HIGH RISK) |
| `workspace_repl_execute` | `{ session_id, code }` | `{ output, exit_code }` | ✅ IMPLEMENTED (HIGH RISK) |
| `workspace_repl_stop` | `{ session_id }` | `{ stopped: true }` | ✅ IMPLEMENTED |
| `workspace_debug_breakpoint` | `{ file, line }` | `{ set: true }` | ✅ IMPLEMENTED |
| `workspace_profiler_run` | `{ target }` | `{ status: 'profiler:stub', message }` | ⚠️ STUBBED |

### Tier 6 — Language Adapters (LOW RISK)

| Action | Input | Output | Status |
|---|---|---|---|
| `workspace_language_adapter_python` | `{ code, action }` | `{ result }` | ✅ IMPLEMENTED |
| `workspace_language_adapter_java` | `{ code, action }` | `{ result }` | ✅ IMPLEMENTED |
| `workspace_language_adapter_go` | `{ code, action }` | `{ result }` | ✅ IMPLEMENTED |
| `workspace_language_adapter_csharp` | `{ code, action }` | `{ result }` | ✅ IMPLEMENTED |

### Tier 7 — Governance / Dry-run (HIGH/MEDIUM RISK)

| Action | Input | Output | Status |
|---|---|---|---|
| `workspace_dry_run_with_approval_chain` | `{ actions[] }` | `{ approval_chain }` | ✅ IMPLEMENTED (HIGH RISK) |
| `workspace_change_impact_report` | `{ branch? }` | `{ impact_summary }` | ✅ IMPLEMENTED |
| `workspace_rollback_to_checkpoint` | `{ checkpoint_id }` | `{ rolled_back: true }` | ✅ IMPLEMENTED |

### Tier 8 — Code Generation (MEDIUM RISK)

| Action | Input | Output | Status |
|---|---|---|---|
| `workspace_generate_test` | `{ file, fn? }` | `{ test_file, content }` | ✅ IMPLEMENTED |
| `workspace_format_code` | `{ path? }` | `{ formatted: true }` | ✅ IMPLEMENTED |
| `workspace_version_bump` | `{ type: patch\|minor\|major }` | `{ new_version }` | ✅ IMPLEMENTED |
| `workspace_changelog_generate` | `{ from?, to? }` | `{ changelog }` | ✅ IMPLEMENTED |

### Tier 9 — Pilot Productivity (MEDIUM RISK)

| Action | Input | Output | Status |
|---|---|---|---|
| `workspace_create_pr` | `{ title, body, base? }` | `{ pr_metadata }` (**no API call**) | ⚠️ METADATA ONLY |
| `workspace_run_ci_checks` | `{ branch? }` | `{ ci_status }` | ✅ IMPLEMENTED |
| `workspace_fix_test_failures` | `{ test_output }` | `{ fixes_applied[] }` | ✅ IMPLEMENTED |
| `workspace_release_notes_generate` | `{ from, to }` | `{ release_notes }` | ✅ IMPLEMENTED |
| `workspace_incident_patch_pack` | `{ incident_id }` | `{ patch_pack }` | ✅ IMPLEMENTED |
| `workspace_memory_profile` | `{}` | `{ memory_stats }` | ✅ IMPLEMENTED |
| `workspace_autonomous_plan_execute` | `{ goal }` | `{ plan_result }` | ✅ IMPLEMENTED (MEDIUM RISK) |

### Tier 10 — Connector / Observability (MEDIUM/LOW RISK)

| Action | Input | Output | Status |
|---|---|---|---|
| `workspace_pr_auto_assign` | `{ pr_id }` | `{ assigned: true }` | ✅ IMPLEMENTED |
| `workspace_ci_watch` | `{ run_id }` | `{ status }` | ✅ IMPLEMENTED |
| `workspace_add_docstring` | `{ file, fn }` | `{ docstring }` | ✅ IMPLEMENTED |
| `workspace_diff_preview` | `{ patch }` | `{ preview }` | ✅ IMPLEMENTED |
| `workspace_audit_export` | `{ format? }` | `{ export_ref }` | ✅ IMPLEMENTED |
| `workspace_security_fix_suggest` | `{ vulnerability }` | `{ suggestions[] }` | ✅ IMPLEMENTED |
| `workspace_pr_review_prepare` | `{ pr_id }` | `{ review_prep }` | ✅ IMPLEMENTED |
| `workspace_dependency_upgrade_plan` | `{ package? }` | `{ upgrade_plan }` | ✅ IMPLEMENTED |
| `workspace_policy_preflight` | `{ action }` | `{ allowed, reason }` | ✅ IMPLEMENTED |
| `workspace_connector_test` | `{ connector_type }` | `{ health }` | ✅ IMPLEMENTED |
| `workspace_explain_code` | `{ file, fn? }` | `{ explanation }` | ✅ IMPLEMENTED |
| `workspace_refactor_plan` | `{ goal }` | `{ plan }` | ✅ IMPLEMENTED |
| `workspace_semantic_search` | `{ query }` | `{ results[] }` | ✅ IMPLEMENTED |
| `workspace_approval_status` | `{ approval_id? }` | `{ status }` | ✅ IMPLEMENTED |

### Tier 11 — Desktop / Browser (HIGH RISK)

| Action | Input | Output | Status |
|---|---|---|---|
| `workspace_browser_open` | `{ url, browser? }` | `{ session_id }` | ✅ IMPLEMENTED (Playwright) |
| `workspace_app_launch` | `{ app, args? }` | `{ launched: true }` | ⚠️ NATIVE TODO (mock fallback) |
| `workspace_meeting_join` | `{ meeting_url, mode? }` | `{ joined: true }` | ⚠️ NATIVE TODO (mock fallback) |
| `workspace_meeting_speak` | `{ text }` | `{ spoken: true }` | ⚠️ NATIVE TODO (Playwright unsupported) |
| `workspace_meeting_interview_live` | `{ config }` | `{ session }` | ⚠️ NATIVE TODO |

### Tier 12 — Sub-agent / GitHub Intelligence (HIGH/MEDIUM RISK)

| Action | Input | Output | Status |
|---|---|---|---|
| `workspace_subagent_spawn` | `{ role, task }` | `{ subagent_result }` | ✅ IMPLEMENTED (HIGH RISK) |
| `workspace_github_issue_fix` | `{ issue_url }` | `{ fix_result }` | ✅ IMPLEMENTED (HIGH RISK) |
| `workspace_github_pr_status` | `{ pr_url }` | `{ pr_status }` | ✅ IMPLEMENTED |
| `workspace_github_issue_triage` | `{ issue_url }` | `{ triage }` | ✅ IMPLEMENTED |
| `workspace_slack_notify` | `{ message, channel? }` | `{ sent: true }` | ✅ IMPLEMENTED |

### Git / Test / PR (MEDIUM/HIGH RISK)

| Action | Input | Output | Status |
|---|---|---|---|
| `run_build` | `{ command? }` | `{ exit_code, output }` | ✅ IMPLEMENTED |
| `run_tests` | `{ command?, timeout_ms? }` | `{ exit_code, output }` | ✅ IMPLEMENTED |
| `git_commit` | `{ message?, author?, email? }` | `{ sha, committed: true }` | ✅ IMPLEMENTED |
| `git_push` | `{ remote?, branch? }` | `{ pushed: true }` | ✅ IMPLEMENTED (HIGH RISK) |
| `autonomous_loop` | `{ test_commands[], fix_attempts[], max_attempts? }` | `{ passed, attempts[] }` | ✅ IMPLEMENTED |
| `create_pr_from_workspace` | `{ base_branch? }` | `{ pr_title, pr_body, head_branch, diff_stat }` | ⚠️ METADATA ONLY (no API call) |

---

## 5. LLM Integration

**File**: `apps/agent-runtime/src/llm-decision-adapter.ts` (2,271 lines)

### Providers Supported

| Provider Key | API Endpoint | Auth |
|---|---|---|
| `openai` | `https://api.openai.com/v1/chat/completions` | `OPENAI_API_KEY` |
| `azure_openai` | `https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions` | `AZURE_OPENAI_API_KEY` |
| `github_models` | `https://models.inference.ai.azure.com/chat/completions` | `GITHUB_TOKEN` |
| `anthropic` | `https://api.anthropic.com/v1/messages` | `ANTHROPIC_API_KEY` |
| `google` | `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | `GOOGLE_API_KEY` |
| `xai` | `https://api.x.ai/v1/chat/completions` | `XAI_API_KEY` |
| `mistral` | `https://api.mistral.ai/v1/chat/completions` | `MISTRAL_API_KEY` |
| `together` | `https://api.together.xyz/v1/chat/completions` | `TOGETHER_API_KEY` |
| `auto` | All of the above with failover | Best available |

### Provider Selection Strategy

- **Health scoring**: each provider tracks failure rate; degraded providers enter a **cooldown period**
- **Failover trace**: every LLM call records a `ProviderFailoverTraceRecord[]` for observability
- **Model profiles**: `quality_first`, `speed_first`, `cost_balanced`, `custom`
- **Token budget**: configurable per task; tracked and enforced across attempts
- **Task complexity inference**: `evaluateTaskComplexity()` classifies task before provider selection

### How LLM Calls Work

```
1. createLlmDecisionResolverFromConfig(config) → returns LlmDecisionResolver function
2. processDeveloperTask() calls resolver({ task, heuristicDecision })
3. Resolver builds a text prompt from task payload + heuristic classification
4. Calls provider API (text completion / chat — NO tools:[] array)
5. Parses response text → extracts ActionDecision + optional payloadOverrides
6. Returns { decision, metadata, payloadOverrides }
```

> **Important**: No `tools: [...]` / function-calling pattern is used anywhere in the codebase.  
> LLM decisions are made via **structured text generation** (prompt → parse JSON from response).

### Task Planner (separate LLM call)

**File**: `apps/agent-runtime/src/task-planner.ts`

Uses `PLANNER_SYSTEM_PROMPT` — instructs LLM to emit a JSON `ActionPlan`. Available action types listed in the prompt:
- `workspace_web_login`, `workspace_web_navigate`, `workspace_web_click`,
  `workspace_web_fill`, `workspace_web_submit`, `workspace_web_screenshot`,
  `workspace_web_extract`, `workspace_web_wait`

The planner is a **web automation planner** (not the same as the code execution planner).

---

## 6. Connector Layer

### Connector Types (from `connector-auth.ts`)
```
ConnectorType = 'jira' | 'teams' | 'github' | 'email'
```

### Connector Actions (from `packages/connector-contracts/src/index.ts`)

Each connector exposes a standardized `CONNECTOR_REGISTRY` with supported actions:

| Connector | Supported Actions |
|---|---|
| GitHub | `read_task`, `create_comment`, `create_pr_comment`, `create_pr`, `update_status`, `send_message` |
| GitLab | `read_task`, `create_comment`, `create_pr_comment`, `create_pr`, `update_status` |
| Azure DevOps | `read_task`, `create_comment`, `create_pr`, `update_status` |
| Jira | `read_task`, `create_comment`, `update_status` |
| Teams | `send_message`, `create_comment` |
| Email | `send_email`, `read_task` |
| Linear | `read_task`, `create_comment`, `update_status` |
| PagerDuty | `read_task`, `update_status` |
| Sentry | `read_task`, `create_comment` |
| Generic REST | `read_task`, `create_comment`, `create_pr`, `update_status`, `send_message` |

### GitHub Connector Implementation

**File**: `services/connector-gateway/src/connectors/github-connector.ts`

- Uses **raw `fetch`** to `https://api.github.com/repos/...`
- Auth: `Bearer ${process.env.GITHUB_TOKEN}` (no Octokit SDK)
- `create_pr` action: calls `POST https://api.github.com/repos/{owner}/{repo}/pulls`
- Required env: `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`

### Notification Adapters (`packages/notification-service`)

| Adapter | Channel | Status |
|---|---|---|
| `WebhookAdapter` | Generic HTTP POST | ✅ IMPLEMENTED |
| `SlackAdapter` | Slack Incoming Webhook | ✅ IMPLEMENTED |
| `TeamsAdapter` | Microsoft Teams Incoming Webhook | ✅ IMPLEMENTED |
| `EmailAdapter` | SMTP via nodemailer | ⚠️ DECLARED, test confirms NOT IMPLEMENTED in dispatcher |

### CRM Adapters (`packages/crm-service`)

| Adapter | System | Methods |
|---|---|---|
| `SalesforceAdapter` | Salesforce | `getRecord`, `queryRecords`, `createRecord`, `updateRecord`, `deleteRecord`, `testConnection` |
| `HubspotAdapter` | HubSpot | Same interface |
| `ZohoAdapter` | Zoho CRM | Same interface |
| `DynamicsAdapter` | Microsoft Dynamics | Same interface |
| `PipedriveAdapter` | Pipedrive | Same interface |

### ERP Adapters (`packages/erp-service`)

| Adapter | System | Methods |
|---|---|---|
| `SAPAdapter` | SAP | `getDocument`, `queryDocuments`, `createDocument`, `updateDocument`, `deleteDocument`, `testConnection` |
| `OracleAdapter` | Oracle ERP | Same interface |
| `Dynamics365Adapter` | Microsoft Dynamics 365 | Same interface |
| `NetSuiteAdapter` | NetSuite | Same interface |
| `OdooAdapter` | Odoo | Same interface |

---

## 7. Data Models

**Database**: PostgreSQL  
**ORM**: Prisma 6.x  
**Schema location**: `packages/db-schema/prisma/schema.prisma`  
**Migration command**: `pnpm db:migrate:deploy`

### All Prisma Models

| Model | Purpose | Key Fields |
|---|---|---|
| `Tenant` | Root tenant entity | `id`, `name`, `status` (pending→terminated) |
| `TenantUser` | User within tenant | `email`, `passwordHash`, `role` |
| `Workspace` | Isolated workspace per tenant | `tenantId`, `status` (pending→failed) |
| `Bot` | Agent bot instance | `workspaceId`, `role` (roleKey), `status` (created→failed) |
| `ProvisioningJob` | Azure VM provisioning job | `planId`, `runtimeTier`, `roleType`, 11-step status enum |
| `RuntimeInstance` | Live runtime container | `botId`, `endpoint`, `heartbeatAt`, `contractVersion` |
| `BotCapabilitySnapshot` | Frozen capability set at task time | `roleKey`, `allowedConnectorTools[]`, `allowedActions[]`, `brainConfig (JSON)`, avatar/speech/translation settings |
| `ActionRecord` | Every action taken by a bot | `actionType`, `riskLevel`, `inputSummary`, `outputSummary`, `approvalId` |
| `Approval` | Human approval request | `taskId`, `riskLevel`, `decision` (pending→rejected), `decisionLatencySeconds` |
| `AuditEvent` | Immutable audit log entry | `eventType` (7 types), `severity`, `sourceSystem` |
| `ConnectorAuthMetadata` | OAuth token state per connector | `authMode`, `status` (11-state machine), `grantedScopes[]`, `tokenExpiresAt` |
| `ConnectorAuthSession` | Temporary OAuth state session | `stateNonce`, `expiresAt` |
| `ConnectorAuthEvent` | OAuth flow audit events | `eventType`, `result`, `errorClass` |
| `ConnectorAction` | Executed connector call | `actionType` (6 types), `requestBody`, `resultStatus`, `errorCode` |
| `TaskExecutionRecord` | LLM execution metadata | `modelProvider`, `modelProfile`, `promptTokens`, `completionTokens`, `latencyMs`, `outcome` |
| `WorkspaceSessionState` | Current workspace state snapshot | `version`, `state (JSON)` |
| `WorkspaceCheckpoint` | Named state checkpoint | `label`, `stateDigest`, `sessionVersion` |
| `DesktopProfile` | Browser profile / tab state | `browser`, `tabState (JSON)`, `tokenVersion` |
| `IdeState` | IDE open files / breakpoints | `openFiles (JSON)`, `activeFile`, `breakpoints (JSON)` |
| `TerminalSession` | Shell session continuity | `shell`, `cwd`, `lastCommand`, `history (JSON)` |
| `ActivityEvent` | Notification/activity stream | `category`, `title`, `body`, `sequence`, `status` (unread/acked) |
| `EnvProfile` | Toolchain reconciliation profile | `toolchain (JSON)`, `reconcileStatus`, `driftReport (JSON)` |
| `DesktopAction` | Desktop GUI action record | `actionType`, `result`, `riskLevel`, `screenshotRef`, `approvalId` |
| `PrDraft` | PR auto-driver draft | `branch`, `title`, `body`, `checklist (JSON)`, `reviewersSuggested (JSON)`, `status` |
| `CiTriageReport` | CI failure triage record | `runId`, `failedJobs (JSON)`, `rootCauseHypothesis`, `patchProposal`, `confidence` |
| `WorkMemory` | Persistent work memory for agent | `entries (JSON)`, `summary`, `memoryVersion` |
| `RunResume` | Crash recovery resume record | `runId`, `strategy`, `resumedFrom`, `status` |
| `ReproPack` | Reproducibility pack for incidents | `manifest (JSON)`, `downloadRef`, `expiresAt` |
| `AgentShortTermMemory` | 7-day task memory for context injection | `actionsTaken (JSON)`, `approvalOutcomes (JSON)`, `connectorsUsed (JSON)`, `summary`, `expiresAt` |
| `AgentLongTermMemory` | Long-term behavior patterns | `pattern`, `confidence`, `observedCount`, `lastSeen` |
| `AgentSession` | Browser audit session | `agentInstanceId`, `recordingUrl`, `actionCount`, `retentionExpiresAt` |
| `BrowserActionEvent` | Individual browser action | `actionType` (10 types), `targetSelector`, `screenshotBeforeUrl`, `screenshotAfterUrl`, `networkLog (JSON)` |
| `RetentionPolicy` | Customer data retention config | `scope` (tenant/workspace/role), `action` (never_delete/manual_delete/auto_delete_after_days), `deletionSchedule` |
| `AgentQuestion` | Human-in-the-loop question | `question`, `options[]`, `askedVia` (slack/teams/dashboard), `status`, `onTimeout` policy, `expiresAt` |

### What Gets Stored After Each Task Run

1. `ActionRecord` — the action taken, risk level, input/output summary
2. `TaskExecutionRecord` — LLM provider, model, token counts, latency, outcome
3. `AgentShortTermMemory` — compact summary for future context injection (7-day TTL)
4. NDJSON line in `AF_ACTION_RESULT_LOG_PATH` (file-based fallback)
5. Evidence record at `AF_EVIDENCE_API_URL`
6. `AuditEvent` rows (provisioning, bot runtime, connector, approval, security events)

---

## 8. Test Summary

Run: `pnpm --filter "*" run test` (selected packages with test scripts)

| Package | Test Runner | Tests | Pass | Fail | Notes |
|---|---|---|---|---|---|
| `@agentfarm/agent-runtime` | tsx --test | 678 | 678 | 0 | ~47s — covers executor, decision engine, hooks, observability, skill pipeline, multi-agent, autonomous loop |
| `@agentfarm/notification-adapters` | vitest | 17 | 17 | 0 | Webhook, Slack, Teams adapters |
| `@agentfarm/crm-adapters` | vitest | 37 | 37 | 0 | All 5 CRM vendors |
| `@agentfarm/erp-adapters` | vitest | 44 | 44 | 0 | All 5 ERP vendors |
| **TOTAL** | | **776** | **776** | **0** | |

> Other packages (`@agentfarm/api-gateway`, `@agentfarm/website`, `@agentfarm/dashboard`) also have test scripts but were not run in this scan (require DB connection or browser environment).

---

## 9. Gaps and TODOs

### Critical Gaps

#### 1. `workspace_create_pr` / `create_pr_from_workspace` — No actual PR creation
**Files**: `local-workspace-executor.ts` lines ~2369–2447, ~4488  
**What exists**: Both actions assemble PR metadata (title, body, branch names, diff stat) and return JSON.  
**What's missing**: Neither action calls the GitHub API. The connector-gateway `GitHubConnector.create_pr` DOES have the raw fetch implementation, but it is not wired from the executor actions.  
**Fix needed**: Wire `create_pr_from_workspace` to call `services/connector-gateway/src/connectors/github-connector.ts` `create_pr` action using `GITHUB_TOKEN` + `GITHUB_OWNER` + `GITHUB_REPO`.

#### 2. `workspace_app_launch` / `workspace_meeting_join` / `workspace_meeting_speak` — Native desktop not implemented
**File**: `apps/agent-runtime/src/desktop-operator-factory.ts` line 126  
**What exists**: `case 'native'` falls through to `MockDesktopOperator` with a `// TODO: wire up a real native adapter (e.g. AppleScript / xdg-open / PowerShell)` comment. `PlaywrightDesktopOperator` only supports `browserOpen()` — `appLaunch()` and `meetingSpeak()` return `{ ok: false }`.  
**What's missing**: No real native OS automation (AppleScript, PowerShell, xdg-open).  
**Fix needed**: Implement `NativeDesktopOperator` using the appropriate OS API.

#### 3. `workspace_profiler_run` — Stub
**File**: `local-workspace-executor.ts` line ~4070  
**Returns**: `{ status: 'profiler:stub', message: 'Profiler integration not yet implemented.' }`  
**Fix needed**: Integrate a real profiler (e.g., Node.js `--prof`, Python cProfile, or a language-server-based profiler).

#### 4. Email notification dispatch — Not implemented
**File**: `services/notification-service/src/notification-dispatcher.test.ts` line 181  
**Evidence**: `describe('dispatch — email (not implemented)', ...)` — test explicitly documents the gap.  
The `packages/notification-service` `EmailAdapter` uses nodemailer and IS wired for basic sending, but the notification-service dispatcher does not route to it.  
**Fix needed**: Add email dispatch routing in the notification dispatcher.

#### 5. `manual_delete` retention policy — Silently no-ops
**File**: `services/retention-cleanup/src/retention-cleanup-job.ts` line ~159  
**Comment**: `// Only delete if explicitly triggered by user (not implemented here)`  
**Effect**: `manual_delete` retention policies never execute. Data is never cleaned up for this policy type.  
**Fix needed**: Add an API endpoint that triggers manual deletion and calls the cleanup job.

### Minor / Internal TODOs

| Location | TODO | Impact |
|---|---|---|
| `skill-execution-engine.ts` lines 444, 841, 843, 848 | `// TODO: implement` in generated test/docstring stubs | Low — these are template strings emitted as code output, not runtime gaps |
| `local-workspace-executor.ts` line ~5255 | `const stub = \`/** TODO: document ${name} */\`` | Low — auto-docstring template when LLM skips a symbol |
| `local-workspace-executor.ts` line ~4757 | `/TODO|FIXME/i.test(diffText)` — risk flag | Not a gap — this is intentional risk detection logic |

### Confirmed-Not-A-Gap (Previous Audit Corrections)

| Claim | Reality |
|---|---|
| "`workspace_read_file` declared but no handler" | **FALSE** — handler exists at line 3254 with 1 MB limit and 4 passing tests |
| "No GitHub API for PR creation" | **PARTIALLY WRONG** — `connector-gateway/github-connector.ts` has real fetch-based API call; it just isn't wired from the executor `create_pr_from_workspace` action |

---

## 10. Environment Variables Reference

### Agent Runtime (`apps/agent-runtime`)

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `AF_WORKSPACE_BASE` | — | Base dir for workspace isolation |
| `AF_TENANT_ID` / `AGENTFARM_TENANT_ID` | — | Tenant identity |
| `AF_WORKSPACE_ID` / `AGENTFARM_WORKSPACE_ID` | — | Workspace identity |
| `AF_BOT_ID` | — | Bot identity |
| `AF_ROLE_PROFILE` | — | Agent role profile name |
| `AF_POLICY_PACK_VERSION` | — | Policy pack version |
| `AF_APPROVAL_API_URL` | — | URL to approval intake service |
| `AF_EVIDENCE_API_URL` | — | URL to evidence record storage |
| `AF_ACTION_RESULT_LOG_PATH` | — | NDJSON action result log path |
| `AF_LOCAL_ALLOWED_APPS` | — | Allowlist for `workspace_app_launch` |
| `DESKTOP_OPERATOR` | `native` | `mock` \| `playwright` \| `native` |
| `RUNTIME_PORT` | `4000` | HTTP port for runtime server |
| `AGENT_OBSERVABILITY_DB_PATH` | — | SQLite path for observability |
| `GITHUB_TOKEN` | — | GitHub API auth for autonomous coding loop |
| `GITHUB_OWNER` | — | GitHub repo owner |
| `GITHUB_REPO` | — | GitHub repo name |
| `GITHUB_DEFAULT_BASE_BRANCH` | `main` | Default base branch for PRs |

### Trigger Service (`apps/trigger-service`)

| Variable | Default | Purpose |
|---|---|---|
| `TRIGGER_SERVICE_PORT` | `3002` | HTTP port |
| `WEBHOOK_HMAC_SECRET` | — | HMAC-SHA256 secret for webhook signature verification |
| `TRIGGER_CONFIG_PATH` | — | Path to JSON trigger routing config |

### API Gateway (`apps/api-gateway`)

| Variable | Default | Purpose |
|---|---|---|
| `API_GATEWAY_PORT` | `3000` | HTTP port |
| `API_REQUIRE_AUTH` | — | Enable auth enforcement |
| `DATABASE_URL` | — | PostgreSQL connection |

---

*End of report. Generated from full file reads — no inference from filenames alone.*
