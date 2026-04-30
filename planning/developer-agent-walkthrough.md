# AgentFarm — Developer Agent Walkthrough

**Last updated:** 2026-04-30  
**Role key:** `developer` / `fullstack_developer`  
**Role profile aliases:** `developer`, `developer_agent`, `fullstack_developer`, `full_stack_developer`  
**Source files:** `execution-engine.ts`, `runtime-server.ts`, `llm-decision-adapter.ts`, `developer-bot-architecture.md`

---

## What the Developer Agent Is

The Developer Agent is an AI bot deployed inside a Docker container on a tenant-provisioned Azure VM. Its purpose is to act as a software engineering assistant — performing code review, writing test plans, creating PRs, commenting on issues, tracking Jira tickets, and notifying teams via Teams or email.

It supports **two execution surfaces**:
1. **Connector actions** — calls external services (GitHub, Jira, Teams, Email) through the API Gateway connector layer.
2. **Local workspace actions** — directly manipulates files, runs commands, manages git history, and reads/writes workspace context within a sandboxed workspace directory on the VM.

Both surfaces are enforced by the same frozen capability snapshot — no task can execute outside the frozen permission boundary regardless of what the payload says.

---

## Developer Agent Capabilities

### Connector Actions

The `developer` role is granted access to all four connectors and all engineering actions:

| Connector | Allowed Actions |
|---|---|
| **GitHub** | `create_pr_comment`, `create_pr`, `merge_pr`, `list_prs` |
| **Jira** | `read_task`, `create_comment`, `update_status` |
| **Teams** | `send_message` |
| **Email** | `send_email` |

No other role gets full GitHub write access. This is enforced at the frozen capability snapshot level — it cannot be overridden by a task payload.

### Local Workspace Actions

The `developer` and `fullstack_developer` roles are also granted the full set of local workspace actions. These execute directly in the sandboxed workspace directory (`/tmp/agentfarm-workspaces/<tenantId>/<botId>/<workspaceKey>`):

| Action | Risk | Description |
|---|---|---|
| `git_clone` | low | Clone a remote repository into the workspace |
| `git_branch` | low | Create or switch branches; supports `auto_name` for semantic branch generation |
| `git_commit` | medium | Stage and commit changes; supports `auto_message` for semantic commit messages |
| `git_push` | **high** | Push branch to remote (requires approval) |
| `git_stash` | medium | Push/pop/list/drop git stash entries for safe WIP checkpointing |
| `git_log` | low | Return structured JSON commit history `[{hash, subject, author_name, date}]` |
| `code_read` | low | Read a file from the workspace |
| `code_edit` | medium | Overwrite a workspace file with new content |
| `code_edit_patch` | medium | Replace an exact text snippet inside a file |
| `code_search_replace` | medium | Regex search-and-replace across files |
| `apply_patch` | medium | Apply a unified diff (`git apply`) to workspace files |
| `file_move` | medium | Rename or move a file/directory within the workspace |
| `file_delete` | medium | Delete a file or directory from the workspace |
| `run_build` | medium | Run the project build command (auto-detected or explicit) |
| `run_tests` | medium | Run the test suite (auto-detected or explicit); supports `max_time_ms` |
| `run_linter` | medium | Run ESLint/Prettier/black/gofmt; supports `fix` mode |
| `workspace_install_deps` | medium | Install dependencies using auto-detected package manager |
| `workspace_list_files` | low | Return JSON array of workspace file paths (with optional glob filter) |
| `workspace_grep` | low | Regex search across workspace files; returns `[{file, line, col, text}]` |
| `workspace_scout` | low | Compact project summary: language, framework, package manager, README excerpt, scripts |
| `workspace_checkpoint` | medium | Save WIP to a temp git branch for safe rollback |
| `autonomous_loop` | medium | Iterative test-fix loop: run tests, apply fixes, retry up to N attempts |
| `workspace_cleanup` | low | Remove the workspace directory |
| `workspace_diff` | low | Show git diff of current workspace changes |
| `workspace_memory_write` | medium | Write key-value notes to `.agentfarm/workspace-memory.json` |
| `workspace_memory_read` | low | Read notes from `.agentfarm/workspace-memory.json` |
| `run_shell_command` | **high** | Run an arbitrary allowlisted shell command (requires approval) |
| `create_pr_from_workspace` | medium | Generate a PR title/body from current workspace git diff |
| `workspace_create_pr` | medium | Create a pull request from the current workspace branch with generated title/body, reviewers, and labels |
| `workspace_run_ci_checks` | medium | Trigger CI checks and return structured pass/fail summaries with impacted file links |
| `workspace_fix_test_failures` | medium | Parse failing tests, apply targeted patches, rerun failing tests in a loop (approval required before commit/push) |
| `workspace_security_fix_suggest` | medium | Convert security scan findings into concrete patch suggestions; routes destructive changes through approval |
| `workspace_pr_review_prepare` | low | Generate PR review summary: risk level, diff hotspots, missing test coverage |
| `workspace_dependency_upgrade_plan` | medium | Scan outdated dependencies, produce upgrade plan with semver risk labels (patch/minor/major) |
| `workspace_release_notes_generate` | medium | Generate release notes from a commit range plus PR merge metadata |
| `workspace_incident_patch_pack` | medium | Build emergency patch bundle with rollback checkpoint and impact summary |
| `workspace_memory_profile` | medium | Persist and read per-repo coding conventions (naming, lint style, test style) |
| `workspace_autonomous_plan_execute` | medium | Structured plan → staged execution → checkpoint → verify → propose PR with full audit trail |
| `workspace_policy_preflight` | low | Simulate risk and approval routing for any action without executing it |

**Path safety:** All file operations are restricted to the workspace sandbox. Path traversal (`../`, absolute paths) is blocked by `safeChildPath()`.

**Secret redaction:** All shell stdout/stderr is filtered through `redactSecrets()` before being returned.

---

## Full Walkthrough — What Happens Step by Step

---

### Phase 1 — Startup

When the VM bootstraps the Docker container, it calls:

```
POST /startup
```

The runtime:
1. Reads all environment variables (`AF_TENANT_ID`, `AF_BOT_ID`, `AF_ROLE_PROFILE`, `AF_POLICY_PACK_VERSION`, connector URLs, tokens, etc.)
2. Resolves `roleKey` from `AF_ROLE_KEY` env var, or by matching `AF_ROLE_PROFILE` against known aliases (e.g. `"Developer Agent"` → `developer`)
3. Checks whether a persisted capability snapshot exists in the database for this bot ID
   - If found and compatible (role key, role version, policy pack version, allowed connectors all match) → uses the persisted snapshot
   - If not found or incompatible → freezes a new snapshot from the current role policy and persists it
4. Fetches the workspace LLM config from the API Gateway (`GET /v1/workspaces/{id}/runtime/llm-config`) to wire up the LLM decision resolver
5. Probes the approval API dependency (`GET /health`) — if it fails, state transitions to `degraded` instead of `active`
6. Starts the **worker loop** (every 250 ms) and **heartbeat loop** (every 30 s)
7. State: `created → starting → ready → active`

**Capability snapshot** is a versioned, checksummed record that freezes exactly which connectors and actions this bot is authorized to use at startup. A SHA-256 checksum prevents tampered snapshots from being loaded from DB.

---

### Phase 2 — A Task Arrives

A task is submitted to the bot:

```
POST /tasks/intake
{
  "taskId": "t-dev-001",
  "payload": {
    "action_type": "create_pr",
    "summary": "Create PR for feature/auth-hardening branch into main",
    "target": "acme/backend",
    "connector_type": "github",
    "owner": "acme",
    "repo": "backend",
    "title": "Harden auth middleware",
    "head": "feature/auth-hardening",
    "base": "main"
  }
}
```

The task is pushed into the worker loop queue (`workerLoop.queuedTasks`). The worker picks it up on the next 250 ms tick.

---

### Phase 3 — Capability Policy Check

Before any decision logic runs, the runtime checks the **frozen capability snapshot**:

1. Reads `connector_type` from the payload (`github`)
2. Checks that `github` is in `snapshot.allowedConnectorTools` — it is, for `developer`
3. Checks that `create_pr` is in `snapshot.allowedActions` — it is
4. If either check fails → task immediately fails with `capability_policy_blocked` event, no external call is made

This check is non-bypassable. Even if the LLM or the task payload says otherwise, the snapshot is the authority.

---

### Phase 4 — Decision Making

The engine runs `processDeveloperTask()` with three sub-steps:

#### 4A — Normalize Action Type

Reads `action_type` from payload → `"create_pr"`.  
Falls back to `intent` field if `action_type` is missing or whitespace.  
Falls back to `"read_task"` if both are absent.  
Normalized to lowercase snake_case.

#### 4B — Score Confidence

Starts at `0.92` and applies deductions based on payload quality:

| Condition | Deduction |
|---|---|
| `summary` missing or shorter than 8 characters | −0.18 |
| `target` missing or empty | −0.10 |
| `complexity = high` | −0.16 |
| `complexity = medium` | −0.08 |
| `ambiguous = true` | −0.20 |

Example: payload has a good `summary` and `target` → confidence stays at `0.92`.

#### 4C — Classify Risk

Policy lookup (in order):

| Action | Risk | Route |
|---|---|---|
| `create_pr` | **medium** | → approval queue |
| `merge_pr` | **high** | → approval queue |
| `list_prs` | **low** | → execute |
| `read_task`, `create_pr_comment` | **low** → medium (if confidence < 0.6) | → execute or approval |
| `create_comment`, `update_status`, `send_message` | **medium** | → approval queue |
| `send_email` | **low** | → execute |
| Payload `risk_hint = high/medium/low` | Overrides classification | Applies override |
| Confidence < 0.6 (any action) | **medium** | → approval queue |

`create_pr` → **medium risk** → the decision is `route: 'approval'`. No execution yet.

#### 4D — LLM Override (if configured)

If the workspace has an LLM configured (e.g. Azure OpenAI), the heuristic decision is sent to the model:

```json
{
  "objective": "Classify AgentFarm task for action type, confidence, risk and route.",
  "task": { "taskId": "t-dev-001", "payload": { ... } },
  "heuristicDecision": { "actionType": "create_pr", "riskLevel": "medium", "route": "approval", ... },
  "policy": [
    "For medium or high risk, route must be approval.",
    ...
  ]
}
```

The model responds with a structured JSON decision. If it upgrades `create_pr` to `high` risk, that decision is used. If the LLM call times out (5 s) or fails, the heuristic is used as fallback — the agent never crashes due to LLM unavailability.

---

### Phase 5A — Low Risk Path (e.g. `list_prs`, `read_task`)

If route = `execute`:

1. Task passes the capability snapshot check
2. If `connector_type` is present and the action is a known connector action → calls the API Gateway connector endpoint directly
3. Up to **3 retry attempts** with transient error detection
4. On success: emits `task_processed` event, writes `ActionResultRecord`, records latency and outcome in `TaskExecutionRecord`

Example low-risk developer task:

```
POST /tasks/intake
{
  "taskId": "t-dev-010",
  "payload": {
    "action_type": "list_prs",
    "connector_type": "github",
    "owner": "acme",
    "repo": "backend",
    "state": "open"
  }
}
```

→ Classified as **low risk** → executes immediately → calls GitHub `GET /repos/acme/backend/pulls?state=open` → returns list of open PRs.

---

### Phase 5B — Medium/High Risk Path (e.g. `create_pr`, `merge_pr`)

If route = `approval`:

1. Task does **not** execute
2. Runtime sends approval intake request to API Gateway:

```
POST /v1/approvals/intake
x-approval-intake-token: <token>
{
  "tenant_id": "tenant-abc",
  "bot_id": "bot-001",
  "task_id": "t-dev-001",
  "action_type": "create_pr",
  "action_summary": "Create PR for feature/auth-hardening → main",
  "risk_level": "medium",
  "requested_by": "developer-bot",
  "policy_pack_version": "v1"
}
```

3. Approval intake request retries up to **3 times** with backoff (200 ms) on rate limit (429) or server errors (5xx)
4. Task is held in `pendingApprovals` list in runtime memory
5. If no decision arrives within **1 hour** → task auto-escalates (`escalated = true`), dashboard shows a visual alert
6. Emits `approval_required` event to `/logs`

---

### Phase 6 — Human Approval on Dashboard

The **Approval Queue panel** on the AgentFarm dashboard shows:

- Task ID and action summary
- Risk level (medium / high badge)
- How long it has been waiting
- Escalation indicator if > 1 hour

The approver clicks **Approve** or **Reject**, provides an optional reason, and the dashboard calls the API Gateway decision endpoint.

---

### Phase 7 — Decision Delivered Back to Runtime

API Gateway fans out the decision to the runtime via webhook:

```
POST /decision
x-runtime-decision-token: <token>
{
  "taskId": "t-dev-001",
  "decision": "approved",
  "actor": "hari@company.com",
  "reason": "Branch reviewed and test coverage confirmed"
}
```

**If approved:**
1. Runtime checks decision cache — if this `taskId` was already approved before, it skips straight to execution (cache hit path)
2. Re-runs capability snapshot policy check
3. Executes the connector action via API Gateway:

```
POST /v1/connectors/actions/execute
x-connector-exec-token: <token>
{
  "connector_type": "github",
  "action_type": "create_pr",
  "payload": {
    "owner": "acme",
    "repo": "backend",
    "title": "Harden auth middleware",
    "head": "feature/auth-hardening",
    "base": "main"
  }
}
```

4. GitHub API: `POST /repos/acme/backend/pulls` → PR created
5. Emits `runtime.connector_action_executed` event
6. Writes `ActionResultRecord` (success) and `TaskExecutionRecord`

**If rejected / timeout:**
1. Writes `ActionResultRecord` with status `cancelled`
2. Emits `approval_resolved` event with `decision: rejected`
3. Optionally emits bot-notification runtime event so the dashboard can show the bot why it was blocked

---

### Phase 8 — Connector Execution Detail (API Gateway side)

When the runtime calls the gateway's connector execute endpoint, the gateway enforces two layers:

**Layer 1 — Role policy:** `developer` → allowed connectors are `[jira, teams, github, email]`  
If `connector_type = github` → allowed ✅

**Layer 2 — Connector action policy:** `github` → allowed actions are `[create_pr_comment, create_pr, merge_pr, list_prs]`  
If `action_type = create_pr` → allowed ✅

Then the real GitHub call:

```
POST https://api.github.com/repos/acme/backend/pulls
Authorization: Bearer <token from Key Vault>
Accept: application/vnd.github+json

{
  "title": "Harden auth middleware",
  "head": "feature/auth-hardening",
  "base": "main",
  "body": "...",
  "draft": false
}
```

Gateway uses **exponential backoff retries** (50 ms → 100 ms) for transient failures before returning the result to the runtime.

---

## Developer Agent Task Scenarios

### Scenario 1 — Code Review (Low Risk, executes immediately)

```json
{
  "taskId": "t-dev-101",
  "payload": {
    "intent": "Code Review",
    "summary": "Review PR #41 for security and quality checks",
    "target": "PR-41"
  }
}
```

- `action_type` normalized from `intent` → `code_review`
- Not in any risk set → **low risk**
- Confidence 0.92 (good summary + target) → **execute**
- No connector call needed (internal decision action)
- Result: `success`

---

### Scenario 2 — Read a Jira Task (Low Risk)

```json
{
  "taskId": "t-dev-102",
  "payload": {
    "action_type": "read_task",
    "connector_type": "jira",
    "issue_key": "PROJ-55",
    "summary": "Read current status of PROJ-55",
    "target": "PROJ-55"
  }
}
```

- `read_task` → **low risk** → execute immediately
- Calls `GET /rest/api/3/issue/PROJ-55` on Jira
- Result: issue data returned in action summary

---

### Scenario 3 — Comment on a PR (Medium Risk, needs approval)

```json
{
  "taskId": "t-dev-103",
  "payload": {
    "action_type": "create_pr_comment",
    "connector_type": "github",
    "owner": "acme",
    "repo": "backend",
    "issue_number": 41,
    "body": "Reviewed. Auth logic looks correct. Approved from bot side.",
    "summary": "Post review comment on PR #41",
    "target": "acme/backend"
  }
}
```

- `create_pr_comment` → **medium risk** → approval queue
- Waits for human decision
- If approved → calls `POST /repos/acme/backend/issues/41/comments`

---

### Scenario 4 — Merge a PR (High Risk, needs approval)

```json
{
  "taskId": "t-dev-104",
  "payload": {
    "action_type": "merge_pr",
    "connector_type": "github",
    "owner": "acme",
    "repo": "backend",
    "pull_number": 41,
    "merge_method": "squash",
    "commit_title": "Harden auth middleware (#41)",
    "summary": "Merge approved PR #41 into main via squash",
    "target": "acme/backend"
  }
}
```

- `merge_pr` → **high risk** → approval queue
- Escalates after 1 hour without decision
- If approved → calls `PUT /repos/acme/backend/pulls/41/merge`
- If rejected → task cancelled, reason recorded

---

### Scenario 5 — Notify Team on Teams (Low Risk)

```json
{
  "taskId": "t-dev-105",
  "payload": {
    "action_type": "send_message",
    "connector_type": "teams",
    "channel_id": "19:...",
    "message": "Deployment completed. PR #41 is now live on main.",
    "summary": "Send deployment notification to engineering channel",
    "target": "teams/engineering-channel"
  }
}
```

- `send_message` → **medium risk** (policy) → approval queue
- If approved → calls Teams API to send message

---

## Risk Classification Reference for Developer

### Connector Actions

| Action | Risk | Requires Approval? |
|---|---|---|
| `code_review` (intent) | low | No |
| `test_planning` (intent) | low | No |
| `read_task` (Jira) | low | No |
| `list_prs` (GitHub) | low | No |
| `send_email` | low | No |
| `update_status` (Jira) | medium | **Yes** |
| `create_comment` (Jira) | medium | **Yes** |
| `create_pr_comment` (GitHub) | medium | **Yes** |
| `create_pr` (GitHub) | medium | **Yes** |
| `send_message` (Teams) | medium | **Yes** |
| `merge_pr` (GitHub) | high | **Yes** |
| `merge_release` | high | **Yes** |
| `delete_resource` | high | **Yes** |
| `deploy_production` | high | **Yes** |
| Any action with confidence < 0.6 | medium | **Yes** |

### Local Workspace Actions

| Action | Risk | Requires Approval? |
|---|---|---|
| `git_clone` | low | No |
| `git_branch` | low | No |
| `git_log` | low | No |
| `code_read` | low | No |
| `workspace_list_files` | low | No |
| `workspace_grep` | low | No |
| `workspace_scout` | low | No |
| `workspace_cleanup` | low | No |
| `workspace_diff` | low | No |
| `workspace_memory_read` | low | No |
| `git_commit` | medium | **Yes** |
| `git_stash` | medium | **Yes** |
| `code_edit` | medium | **Yes** |
| `code_edit_patch` | medium | **Yes** |
| `code_search_replace` | medium | **Yes** |
| `apply_patch` | medium | **Yes** |
| `file_move` | medium | **Yes** |
| `file_delete` | medium | **Yes** |
| `run_build` | medium | **Yes** |
| `run_tests` | medium | **Yes** |
| `run_linter` | medium | **Yes** |
| `workspace_install_deps` | medium | **Yes** |
| `workspace_checkpoint` | medium | **Yes** |
| `autonomous_loop` | medium | **Yes** |
| `workspace_memory_write` | medium | **Yes** |
| `create_pr_from_workspace` | medium | **Yes** |
| `workspace_create_pr` | medium | **Yes** |
| `workspace_run_ci_checks` | medium | **Yes** |
| `workspace_fix_test_failures` | medium | **Yes** |
| `workspace_security_fix_suggest` | medium | **Yes** |
| `workspace_dependency_upgrade_plan` | medium | **Yes** |
| `workspace_release_notes_generate` | medium | **Yes** |
| `workspace_incident_patch_pack` | medium | **Yes** |
| `workspace_memory_profile` | medium | **Yes** |
| `workspace_autonomous_plan_execute` | medium | **Yes** |
| `workspace_pr_review_prepare` | low | No |
| `workspace_policy_preflight` | low | No |
| `git_push` | **high** | **Yes** |
| `run_shell_command` | **high** | **Yes** |

---

## Capability Snapshot — What Locks Developer Agent Permissions

On startup the runtime freezes a `BotCapabilitySnapshotRecord`:

```json
{
  "id": "bot-001:snapshot:1714377600000",
  "botId": "bot-001",
  "roleKey": "developer",
  "roleVersion": "v1",
  "policyPackVersion": "v1",
  "allowedConnectorTools": ["jira", "teams", "github", "email"],
  "allowedActions": ["read_task", "create_comment", "update_status", "send_message", "create_pr_comment", "create_pr", "merge_pr", "list_prs", "send_email", "workspace_create_pr", "workspace_run_ci_checks", "workspace_fix_test_failures", "workspace_security_fix_suggest", "workspace_pr_review_prepare", "workspace_dependency_upgrade_plan", "workspace_release_notes_generate", "workspace_incident_patch_pack", "workspace_memory_profile", "workspace_autonomous_plan_execute", "workspace_policy_preflight"],
  "snapshotChecksum": "sha256:abc123...",
  "frozenAt": "2026-04-29T00:00:00.000Z"
}
```

- The checksum is SHA-256 over all policy fields — if a row is tampered with in the database, the checksum fails and the snapshot is rejected
- If the snapshot's `roleKey`, `roleVersion`, or `policyPackVersion` no longer matches the environment, it is considered incompatible and a new one is frozen
- **No task can execute outside these frozen permissions**, regardless of what the payload says

---

## Environment Variables Required to Run Developer Agent

| Variable | Purpose |
|---|---|
| `AF_TENANT_ID` | Tenant identifier |
| `AF_WORKSPACE_ID` | Workspace identifier |
| `AF_BOT_ID` | Bot identifier |
| `AF_ROLE_PROFILE` | e.g. `"Developer Agent"` or `"developer"` |
| `AF_POLICY_PACK_VERSION` | e.g. `"v1"` |
| `AF_APPROVAL_API_URL` | API Gateway base URL for approval intake |
| `AF_CONNECTOR_API_URL` | API Gateway base URL for connector execution |
| `AF_APPROVAL_INTAKE_SHARED_TOKEN` | Service token for approval intake auth |
| `AF_CONNECTOR_EXEC_SHARED_TOKEN` | Service token for connector execute auth |
| `AF_RUNTIME_DECISION_SHARED_TOKEN` | Token to validate incoming `/decision` webhooks |
| `AF_EVIDENCE_API_URL` | Evidence/audit API endpoint |
| `AF_HEALTH_PORT` | Port for HTTP server (health probes) |
| `AF_LOG_LEVEL` | e.g. `"info"` |
| `AF_RUNTIME_CONTRACT_VERSION` | e.g. `"v1"` |
| `AF_MODEL_PROVIDER` _(optional)_ | `openai`, `azure_openai`, or `agentfarm` (default) |
| `AF_CONTROL_PLANE_HEARTBEAT_URL` _(optional)_ | Where heartbeats are sent |
| `DATABASE_URL` _(optional)_ | Enables snapshot + execution record persistence |

---

## Current Delivery Status and Pending Items

### What is already built (functional scope)

1. Connector execution with policy enforcement for Jira, Teams, GitHub, and company email
2. Local workspace execution in sandbox with path traversal protection and secret-redacted command output
3. Risk classification (low/medium/high), approval routing, escalation timeout, and decision webhook fanout
4. Capability snapshot freeze with checksum validation and compatibility checks
5. Multi-provider LLM decision routing with fallback behavior
6. Full runtime observability endpoints (`/logs`, health, readiness, state history)
7. **Tier 9 — Developer Productivity Wave (2026-04-30):** `workspace_create_pr`, `workspace_run_ci_checks`, `workspace_fix_test_failures`, `workspace_security_fix_suggest`, `workspace_pr_review_prepare`, `workspace_dependency_upgrade_plan`, `workspace_release_notes_generate`, `workspace_incident_patch_pack`, `workspace_memory_profile`, `workspace_autonomous_plan_execute`, `workspace_policy_preflight` — 11 actions, 179/179 tests passing, typecheck clean
8. **Tier 10 — Connector Hardening, Code Intelligence & Observability (2026-05-01):** `workspace_connector_test`, `workspace_pr_auto_assign`, `workspace_ci_watch`, `workspace_explain_code`, `workspace_add_docstring`, `workspace_refactor_plan`, `workspace_semantic_search`, `workspace_diff_preview`, `workspace_approval_status`, `workspace_audit_export` — 10 actions, 190/190 tests passing, typecheck clean

### What is pending before production go-live (not code gaps)

1. Add repo secret: `AZURE_STATIC_WEB_APPS_API_TOKEN_WEBSITE`
2. Sign in Azure context and execute final deployment (`az login`, `azd up`)
3. Complete DNS/custom-domain TLS cutover for website
4. Run final post-deploy gates: SAST, DAST, load test, evidence freshness export

### What we can add next (Developer Agent roadmap backlog)

Tier 9 is complete — all 11 previously planned actions have been built, tested (179/179 pass), and integrated into the risk, policy, and snapshot layers. Tier 10 is also complete — 10 new actions (190/190 tests passing) adding connector health probing, PR reviewer assignment, CI watching, code explanation, docstring scaffolding, structured refactor planning, semantic workspace search, diff preview, approval status query, and audit evidence export. The following represents the next wave.

#### Priority 1 — Real connector hardening

1. **workspace_connector_test** — End-to-end integration test of a connector config (GitHub token, Jira credentials) without side effects
2. **workspace_pr_auto_assign** — Auto-assign reviewers based on CODEOWNERS file and recent contributor activity
3. **workspace_ci_watch** — Long-poll CI status until completion and return final pass/fail with log excerpt

#### Priority 2 — Multi-agent coordination

1. **workspace_delegate_task** — Submit a sub-task to a peer agent (QA Agent, Manager Agent) with structured context handoff
2. **workspace_wait_for_agent** — Block current plan step until a delegated task resolves (with timeout + escalation)

#### Priority 3 — Advanced autonomy

1. **workspace_refactor_plan** — Produce a structured multi-step refactor plan before any edits are applied
2. **workspace_explain_code** — Return an LLM-generated explanation of a code block for onboarding or review purposes
3. **workspace_add_docstring** — Generate and insert docstrings/JSDoc comments for public APIs

### Functional requirements for any new action

Every new Developer Agent action must include:

1. `LocalWorkspaceActionType` update and inclusion in `LOCAL_WORKSPACE_ACTION_TYPES`
2. Risk classification mapping in execution engine (high/medium/low)
3. Role policy updates (`developer`, `fullstack_developer`, and `tester` if read-only)
4. Unit tests in `local-workspace-executor.test.ts`
5. Capability snapshot fixture update in `runtime-server.test.ts` if action is role-allowed
6. Secret-safe output handling and workspace boundary checks

---

## Summary Flow for Developer Agent

```
Developer task submitted
         │
         ▼
 1. Capability snapshot check
    (is github/create_pr in frozen policy?)
         │ YES
         ▼
 2. Normalize action type → "create_pr"
 3. Score confidence → 0.92
 4. Classify risk → MEDIUM (policy: create_pr = medium)
         │
         ▼
 5. LLM override (if Azure OpenAI configured)
    → may keep or upgrade risk level
         │
         ▼
 6. Route = APPROVAL
    → POST /v1/approvals/intake (retries 3x)
    → Task held in pendingApprovals
    → After 1h: auto-escalate
         │
         ▼ (human approves on dashboard)
         │
 7. POST /decision → runtime webhook
    → Check decision cache (skip approval if cached)
    → Re-run snapshot policy check
         │
         ▼
 8. Execute via API Gateway
    POST /v1/connectors/actions/execute
    → Gateway: role policy check → connector policy check
    → GitHub API: POST /repos/{owner}/{repo}/pulls
    → Retry with backoff on transient errors
         │
         ▼
 9. Write ActionResultRecord + TaskExecutionRecord
    Emit runtime.connector_action_executed event
    Log entry appears at GET /logs
```
