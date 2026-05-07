# AgentFarm — Agent Function Walkthrough

**Last updated:** 2026-04-30  
**Scope:** `apps/agent-runtime` + `apps/api-gateway` (connector layer)  
**Source files:** `execution-engine.ts`, `runtime-server.ts`, `llm-decision-adapter.ts`, `local-workspace-executor.ts`, `provider-clients.ts`, `connector-actions.ts`

---

## Overview

An AgentFarm bot is a Docker container that runs inside a VM provisioned per tenant. Once started, the bot:

1. Receives tasks from the control plane or user
2. Decides what action to take and how risky it is
3. Executes safe actions immediately; routes risky actions for human approval
4. For **connector tasks**: calls real external systems (GitHub, Jira, Teams, Email) via the API Gateway connector layer
5. For **local workspace tasks**: executes directly in a sandboxed workspace directory on the VM (`/tmp/agentfarm-workspaces/<tenantId>/<botId>/<workspaceKey>`)
6. Logs every event and sends heartbeats to the control plane

---

## End-to-End Flow

```
Task arrives (POST /tasks/intake)
         │
         ▼
  Normalize action type
  Score confidence (0–1)
  Classify risk (policy table)
         │
    ┌────┴────┐
  LOW       MEDIUM / HIGH
    │             │
  Execute     Send to approval queue
  (retry 3x)  ← human reviews dashboard
    │             │
    │         approved / rejected
    │             │
    └─────┬───────┘
          │
    ┌─────┴──────────────────────────────────┐
    │  Is it a LOCAL WORKSPACE action?        │
    │  (LOCAL_WORKSPACE_ACTION_TYPES set)     │
    └─────┬───────────────────────────────┬───┘
       YES │                           NO │
          ▼                              ▼
  executeLocalWorkspaceAction()    API Gateway → connector policy check
  (sandboxed in workspace dir)     → real API call (GitHub/Jira/Teams/Email)
          │                              │
          └──────────────┬───────────────┘
                         ▼
          Write ActionResultRecord + emit event to /logs
```

---

## Local Workspace Execution Branch

When the action type is in `LOCAL_WORKSPACE_ACTION_TYPES`, the task is dispatched to `executeLocalWorkspaceAction()` in `local-workspace-executor.ts` instead of the connector path.

### Sandbox Model

Every action operates inside a workspace directory:
```
/tmp/agentfarm-workspaces/<tenantId>/<botId>/<workspaceKey>
```

Path traversal is blocked by `safeChildPath()`. All file operations are restricted to this directory. Shell output is filtered through `redactSecrets()` before returning.

### Execution Categories

**Git operations** (`git_clone`, `git_branch`, `git_commit`, `git_push`, `git_stash`, `git_log`): Run git commands via `execa`. `git_log` returns structured JSON. `git_stash` supports push/pop/list/drop.

**Code read/write** (`code_read`, `code_edit`, `code_edit_patch`, `code_search_replace`, `apply_patch`, `file_move`, `file_delete`): File operations within the sandbox. `apply_patch` writes a temp diff file and applies via `git apply`.

**Execution** (`run_build`, `run_tests`, `run_linter`, `workspace_install_deps`, `run_shell_command`): Run commands in the workspace. `workspace_install_deps` auto-detects pnpm/yarn/npm/pip/go/cargo from lockfiles. `run_linter` defaults to ESLint with optional fix mode.

**Intelligence** (`workspace_list_files`, `workspace_grep`, `workspace_scout`, `workspace_checkpoint`, `workspace_diff`, `workspace_cleanup`): Read-only intelligence and navigation. `workspace_scout` returns a compact JSON project summary. `workspace_checkpoint` creates/restores rollback branches.

**Memory & PR** (`workspace_memory_write`, `workspace_memory_read`, `create_pr_from_workspace`, `autonomous_loop`): Persistent scratchpad in `.agentfarm/workspace-memory.json`. `autonomous_loop` iterates test-fix cycles up to N attempts.

### Risk Classification for Local Actions

| Risk | Actions |
|---|---|
| **high** | `git_push`, `run_shell_command` |
| **medium** | `git_commit`, `git_stash`, `code_edit`, `code_edit_patch`, `code_search_replace`, `apply_patch`, `file_move`, `file_delete`, `run_build`, `run_tests`, `run_linter`, `workspace_install_deps`, `workspace_checkpoint`, `autonomous_loop`, `workspace_memory_write`, `create_pr_from_workspace` |
| **low** | `git_clone`, `git_branch`, `git_log`, `code_read`, `workspace_list_files`, `workspace_grep`, `workspace_scout`, `workspace_diff`, `workspace_cleanup`, `workspace_memory_read` |

---

## Step 1 — Task Arrives

A task is posted to the runtime's intake endpoint:

```
POST /tasks/intake
{
  "taskId": "t-001",
  "payload": {
    "action_type": "create_pr",
    "summary": "Create PR for feature branch",
    "target": "acme/backend"
  }
}
```

The task lands in the worker loop's in-memory queue (`workerLoop.queuedTasks`). The worker polls every **250 ms**.

---

## Step 2 — Decision Making

For each task the engine runs `processDeveloperTask()`, which has three sub-steps.

### 2A — Normalize Action Type

Reads `action_type` from the payload. Falls back to `intent` field if missing. Defaults to `read_task` if neither is present.

### 2B — Score Confidence

Starts at `0.92` and applies deductions:

| Condition | Deduction |
|---|---|
| `summary` missing or shorter than 8 characters | −0.18 |
| `target` missing or empty | −0.10 |
| `complexity = high` | −0.16 |
| `complexity = medium` | −0.08 |
| `ambiguous = true` | −0.20 |

Result is clamped to `[0, 1]` with two decimal places.

### 2C — Classify Risk

Policy-driven lookup applied in order:

| Action Type | Risk Level | Route |
|---|---|---|
| `merge_pr`, `merge_release`, `delete_resource`, `change_permissions`, `deploy_production` | **high** | → approval queue |
| `create_pr`, `update_status`, `create_comment`, `create_pr_comment`, `send_message` | **medium** | → approval queue |
| Payload has `risk_hint = high` | **high** | → approval queue |
| Payload has `risk_hint = medium` | **medium** | → approval queue |
| Payload has `risk_hint = low` | **low** | → execute |
| Confidence < 0.6 (any action) | **medium** | → approval queue |
| Everything else | **low** | → execute |

### 2D — Optional LLM Override

If an LLM provider is configured, the heuristic decision is sent to the model with a structured classification prompt. The model can upgrade or downgrade the risk level and route.

- If the LLM responds within the timeout (default **5 s**), its decision is used.
- If the LLM call fails, times out, or returns an unparseable response, the heuristic decision is used as fallback — the agent never crashes.

Supported providers:

| Provider | Config key | Notes |
|---|---|---|
| `openai` | `openai.model`, `openai.api_key` | Defaults to `gpt-4o-mini` |
| `azure_openai` | `azure_openai.endpoint`, `azure_openai.deployment` | Defaults to API version `2024-06-01` |
| `github_models` | `github_models.model`, `github_models.api_key` | OpenAI-compatible, defaults to `openai/gpt-4.1-mini` |
| `anthropic` | `anthropic.model`, `anthropic.api_key` | Defaults to `claude-3-5-sonnet-latest` |
| `google` | `google.model`, `google.api_key` | Gemini; defaults to `gemini-1.5-flash` |
| `xai` | `xai.model`, `xai.api_key` | Grok; defaults to `grok-beta` |
| `mistral` | `mistral.model`, `mistral.api_key` | Defaults to `mistral-small-latest` |
| `together` | `together.model`, `together.api_key` | Defaults to `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo` |
| `auto` | `auto.profile_providers` | Multi-provider fallback chain with health-score reordering (see below) |
| `agentfarm` | _(built-in)_ | Heuristic-only, no external call |

#### Auto Mode — Multi-Provider Fallback Chain

When `provider = auto`, the runtime tries providers in priority order per active model profile (`quality_first`, `speed_first`, `cost_balanced`, or `custom`). If the first provider returns an error, the next one is tried automatically.

Priority order is dynamically adjusted by a **provider health score** computed from a 5-minute rolling window of recent calls:

```
score = errorRate × 0.7 + (min(avgLatency, 10 000 ms) / 10 000) × 0.3
```

Providers with lower scores are tried first. Providers with no recent data score 0 and preserve their configured order. Health data is in-memory per runtime process.

**Dashboard presets** (set in the LLM Config panel) apply a one-click provider order:

| Profile | Optimises for |
|---|---|
| `quality_first` | Anthropic → OpenAI → Azure OpenAI (highest capability) |
| `speed_first` | Google → GitHub Models → Mistral (lowest latency) |
| `cost_balanced` | Mistral → Together → xAI (cost vs quality balance) |
| `custom` | User-defined per-provider model selection |

Each provider within Auto mode also supports per-profile model overrides via `model_profiles.{profile}` config keys.

---

## Step 3A — Low Risk: Execute Immediately

If route = `execute`, the action runs directly with **up to 3 retry attempts**:

- Attempt throws a `TRANSIENT_*` error → retried automatically
- Attempt throws a non-retryable error → stopped, result recorded as `failed`
- Success → emits `task_processed` event, writes `ActionResultRecord`

---

## Step 3B — Medium / High Risk: Approval Queue

The task does **not** execute. Instead:

1. Runtime calls `POST /v1/approvals/intake` on the API Gateway with the action summary and risk level.
2. Task is held in the runtime's `pendingApprovals` list.
3. After **1 hour** without a decision, the task auto-escalates (`escalated = true`) — the dashboard shows a visual alert.
4. A human approver reviews the item in the Approval Queue panel on the dashboard.

**Human approves or rejects** → API Gateway calls back to the runtime:

```
POST /decision
x-runtime-decision-token: <token>
{
  "taskId": "t-001",
  "decision": "approved",
  "actor": "hari@company.com",
  "reason": "Reviewed and verified branch is clean"
}
```

| Decision | Outcome |
|---|---|
| `approved` | Task moves to execute queue → runs via real connector → result written |
| `rejected` | Task cancelled → `cancelled` result persisted → bot notified |
| `timeout_rejected` | Same as rejected — fires after escalation window |

**Decision cache:** Approved decisions are cached. If the same task is re-submitted within the window, it executes immediately without requiring a duplicate approval.

---

## Step 4 — Connector Execution

Once a task is approved (or was low-risk), the runtime calls the API Gateway connector action endpoint:

```
POST /v1/connectors/actions/execute
x-connector-exec-token: <service-token>
{
  "tenantId": "tenant-abc",
  "workspaceId": "ws-xyz",
  "botId": "bot-001",
  "connectorType": "github",
  "actionType": "create_pr",
  "payload": {
    "owner": "acme",
    "repo": "backend",
    "title": "Add feature X",
    "head": "feature/x",
    "base": "main"
  }
}
```

The gateway enforces **two policy layers before any external call is made**:

**Layer 1 — Role → Connector policy** (which connectors this bot role is allowed to use):

| Role | Jira | Teams | GitHub | Email |
|---|---|---|---|---|
| `developer` | ✅ | ✅ | ✅ | ✅ |
| `fullstack_developer` | ✅ | ✅ | ✅ | ✅ |
| `tester` | ✅ | ✅ | ✅ | ✅ |
| `project_manager_product_owner_scrum_master` | ✅ | ✅ | ✅ | ✅ |
| `business_analyst` | ✅ | ✅ | ❌ | ✅ |
| `customer_support_executive` | ✅ | ✅ | ❌ | ✅ |
| `recruiter` | ❌ | ✅ | ❌ | ✅ |
| `technical_writer` | ❌ | ✅ | ❌ | ✅ |
| `content_writer` | ❌ | ✅ | ❌ | ✅ |
| `sales_rep` | ❌ | ✅ | ❌ | ✅ |
| `marketing_specialist` | ❌ | ✅ | ❌ | ✅ |
| `corporate_assistant` | ❌ | ✅ | ❌ | ✅ |

**Layer 2 — Connector → Action policy** (which actions each connector supports):

| Connector | Allowed Actions |
|---|---|
| `github` | `create_pr_comment`, `create_pr`, `merge_pr`, `list_prs` |
| `jira` | `read_task`, `create_comment`, `update_status` |
| `teams` | `send_message` |
| `email` | `send_email` |

A bot **cannot** exceed its role's connector permissions regardless of what the task payload says. Any violation returns HTTP 403 before any external API is contacted.

If allowed, the gateway calls the real external API with **exponential backoff retries** (50 ms → 100 ms).

### GitHub Actions — HTTP mapping

| Action | HTTP Method | Endpoint |
|---|---|---|
| `create_pr` | `POST` | `/repos/{owner}/{repo}/pulls` |
| `merge_pr` | `PUT` | `/repos/{owner}/{repo}/pulls/{pull_number}/merge` |
| `list_prs` | `GET` | `/repos/{owner}/{repo}/pulls?state={state}` |
| `create_pr_comment` | `POST` | `/repos/{owner}/{repo}/issues/{issue_number}/comments` |

---

## Step 5 — Background Observability Loops

Two background loops run in parallel throughout the bot's life:

### Heartbeat Loop

- Runs every **30 seconds**
- Sends a ping to the control plane heartbeat URL
- Tracks `heartbeat_sent`, `heartbeat_failed`, `last_heartbeat_at`
- Failure is logged but does **not** kill the bot

### Structured Log Feed

Every significant event is written as structured JSON to a bounded in-memory log (max **200 entries**), queryable at:

```
GET /logs
```

Event types emitted:

| Event | When |
|---|---|
| `task_classified` | After risk classification |
| `task_processed` | After successful execution |
| `task_failed` | After all retries exhausted |
| `approval_required` | When task routed to approval queue |
| `approval_resolved` | When human decision received |
| `heartbeat_sent` | Each heartbeat success |
| `heartbeat_failed` | Each heartbeat failure |
| `runtime.worker_loops_started` | On startup |
| `runtime.state_transition` | On every state change |

---

## Step 6 — Runtime State Machine

The bot transitions through these states:

```
created → starting → ready → active → stopping → stopped
                         ↘ degraded (dependency failure)
                                  ↘ failed
```

State history is queryable at:

```
GET /state/history
```

Each entry records: `from`, `to`, `at` (ISO timestamp), `reason`.

---

## Step 7 — Shutdown

```
POST /kill
```

1. State: `active → stopping`
2. 5-second grace window for in-flight tasks to complete
3. State: `stopping → stopped`
4. Process exits cleanly (`exit 0`)

---

## Key Endpoints Reference

| Endpoint | Method | Purpose |
|---|---|---|
| `/tasks/intake` | POST | Submit a task for the bot to process |
| `/decision` | POST | Deliver an approval/rejection decision from the gateway |
| `/health` | GET | Liveness probe (compatible alias) |
| `/health/live` | GET | Kubernetes liveness probe |
| `/health/ready` | GET | Kubernetes readiness probe (returns `active` or `degraded`) |
| `/logs` | GET | Query structured event log (last 200 entries) |
| `/state/history` | GET | Query runtime state transition history |
| `/kill` | POST | Initiate graceful shutdown |
| `/startup` | POST | Called by VM bootstrap to start the worker loop |

---

## Security Boundaries

- All connector tokens are stored in **Azure Key Vault** — never in the database or bot process
- The approval intake uses a **service token** (`x-connector-exec-token`) scoped to runtime-to-gateway calls only
- The decision webhook uses a separate **runtime decision token** (`x-runtime-decision-token`)
- Approval records are **immutable** after creation — no modification, only append
- A bot cannot exceed its role's connector access regardless of payload content

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).


## Current Implementation Pointer (2026-05-07)
1. For the latest built-state summary and file map, see planning/build-snapshot-2026-05-07.md.
