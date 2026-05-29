> **Status:** Sprint 18 complete. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for the authoritative status tracker.
# AgentFarm Agent System

> Last updated: 2026-05-29 (Sprint 18)

Full reference for the agent execution pipeline in `apps/agent-runtime`.

---

## Overview

The agent runtime is a Fastify v5 server (port 4000) that receives task envelopes, classifies the intended action via LLM, executes that action, manages approvals, memory, escalation, and post-task closeout. Each agent instance is bound to a single workspace and a single role.

**Core pipeline per task:**
1. Pre-task scout (codebase context gathering)
2. LLM classification â†’ `ActionDecision`
3. Risk evaluation â†’ approve inline, queue for human approval, or reject
4. Action execution
5. Post-quality gate (AF_TEST_AFTER_EDIT)
6. Memory write
7. Post-task closeout (Jira comment, Slack message, GitHub PR)
8. Escalation if retries exhausted

---

## Agent Roles

All 12 roles are defined in `apps/agent-runtime/src/role-system-prompts.ts` with full system prompt text. Each prompt encodes mindset, priorities, and hard constraints.

| Role Key | Display Name | Specialization |
|---|---|---|
| `recruiter` | Recruiter | Candidate sourcing, evaluation, communications |
| `developer` | Developer | Code writing, refactoring, code review |
| `fullstack_developer` | Fullstack Developer | End-to-end features across frontend and backend |
| `tester` | Tester | Test writing, coverage analysis, flakiness reporting |
| `business_analyst` | Business Analyst | Requirements, specs, acceptance criteria |
| `technical_writer` | Technical Writer | Documentation, accuracy review |
| `content_writer` | Content Writer | Marketing copy, blog posts, long-form content |
| `sales_rep` | Sales Representative | CRM updates, outreach drafting, opportunity tracking |
| `marketing_specialist` | Marketing Specialist | Campaign planning, content calendars |
| `corporate_assistant` | Corporate Assistant | Scheduling, coordination, internal comms |
| `customer_support_executive` | Customer Support | Ticket resolution, escalation routing |
| `project_manager_product_owner_scrum_master` | PM / PO / Scrum Master | Sprint planning, backlog management, ceremonies |

### Role System Prompt Structure (invariant across all roles)
Each prompt follows this pattern:
```
You are a <Role> agent in AgentFarm.
Primary goal: <one-line objective>
1â€“5 ordered priorities
Never: hard constraints (3 rules)
Always think step by step. Scout before you code. Test after every change.
```

### Role Resolution
`getRoleSystemPrompt(roleKey: string, repoName?: string): string`
- Falls back to a generic `developer` prompt if the role key is unknown.
- Appends `\n\nRepository scope: ${repoName}` if `repoName` is provided.

---

## Action Types

### High-Risk Actions (require human approval)
| Action | Description |
|---|---|
| `merge_release` | Merge to a release branch |
| `merge_pr` | Merge a PR |
| `delete_resource` | Delete any resource |
| `change_permissions` | Modify access controls |
| `deploy_production` | Production deployment |
| `git_push` | Push to remote |
| `run_shell_command` | Arbitrary shell execution |
| `workspace_repl_start` | Start a workspace REPL |
| `workspace_repl_execute` | Execute in REPL |
| `workspace_dry_run_with_approval_chain` | Dry-run with approval gate |
| `workspace_browser_open` | Open a browser tab |
| `workspace_app_launch` | Launch a desktop app |
| `workspace_meeting_join` | Join a meeting |
| `workspace_meeting_speak` | Speak in a meeting |
| `workspace_meeting_interview_live` | Conduct a live interview |
| `workspace_subagent_spawn` | Spawn a subagent |
| `workspace_github_issue_fix` | Full GitHub issue fix cycle |

### Medium-Risk Actions (logged, may require approval by policy)
| Action | Description |
|---|---|
| `update_status` | Update ticket/task status |
| `create_comment` | Create a comment |
| `create_pr_comment` | Comment on a PR |
| `create_pr` | Open a PR |
| `send_message` | Send a Slack/Teams message |
| `code_edit` | Edit a file |
| `code_edit_patch` | Apply a patch |
| `code_search_replace` | Search and replace in codebase |
| `run_build` | Run a build |
| `run_tests` | Run test suite |
| `git_commit` | Create a commit |
| `autonomous_loop` | Multi-step autonomous loop |
| `create_pr_from_workspace` | Create PR from workspace changes |
| `workspace_memory_write` | Write to agent memory |
| `git_stash` | Stash changes |
| `apply_patch` | Apply a diff patch |
| `file_move` | Move a file |
| `file_delete` | Delete a file |
| `run_linter` | Run linter |
| `workspace_install_deps` | Install dependencies |
| `workspace_checkpoint` | Save workspace checkpoint |

### Low-Risk Actions (read-only, no approval required)
All other actions including: `workspace_scout`, `workspace_grep`, `workspace_list_files`, `read_file`, `search_codebase`, `get_status`, `workspace_memory_read`, `workspace_memory_search`, `workspace_explain_code`, etc.

---

## Shell Command Allowlist (`run_shell_command`)

The `run_shell_command` action validates the executable against `ALLOWED_COMMANDS` before spawning.

**Allowed commands** *(expanded 2026-05-21, Gap 5 fix)*:
`node`, `npm`, `npx`, `pnpm`, `yarn`, `python3`, `python`, `pip`, `pip3`, `tsc`, `tsx`, `jest`, `vitest`, `mocha`, `pytest`, `cargo`, `go`, `java`, `mvn`, `gradle`, `deno`, `bun`, `ruby`, `gem`, `bundle`, `swift`, `docker`, `dotnet`, `make`, `bash`, `sh`, `git`, `gh`, `curl`, `wget`, `jq`, `cat`, `ls`, `cp`, `mv`, `mkdir`, `rm`, `echo`, `env`, `which`, `find`, `grep`, `sed`, `awk`, `sort`, `uniq`, `head`, `tail`, `wc`, `xargs`, `zip`, `unzip`, `tar`, `gzip`, `gunzip`

Previously the list only covered ~20 commands; multi-language projects (Ruby, Swift, .NET, Gradle, Deno, Bun, Docker) would fail with `command_not_allowed`.

---

## Code Explanation (`workspace_explain_code`)

**File:** `apps/agent-runtime/src/local-workspace-executor.ts`

The `workspace_explain_code` action performs **static analysis** of a code file and returns a structured JSON report *(rewritten, Gap 4 fix, 2026-05-21)*.

### Output Fields
| Field | Description |
|---|---|
| `file_kind` | Detected file kind (`test file`, `service module`, `utility module`, `route handler`, etc.) based on filename patterns |
| `purpose_summary` | Prose summary built from file kind, exports, imports, top comment, function list, and class names |
| `imports` | Deduplicated module paths extracted from `import` statements and `require()` calls |
| `exports` | Named export identifiers |
| `functions` | List of `{ name, async, exported, params }` for all function/arrow/Python def declarations |
| `classes` | List of `{ name, extends?, implements? }` for class definitions |
| `top_comment` | Leading JSDoc, Python docstring, or line-comment block (â‰¤300 chars) |
| `structural` | Counts: `branch_points`, `loops`, `async_operations`, `error_handling` |
| `language` | File extension used as language hint |

Previously the action returned only raw regex match counts with no structural analysis or prose summary.

---

## LLM Decision Adapter

**File:** `apps/agent-runtime/src/llm-decision-adapter.ts`

### Supported Providers

| Provider Key | Default Model | Notes |
|---|---|---|
| `openai` | `gpt-4o-mini` | |
| `azure_openai` | From `AZURE_OPENAI_DEPLOYMENT_NAME` | Requires `AZURE_OPENAI_ENDPOINT` |
| `github_models` | From model profile | Uses GitHub Models API |
| `anthropic` | `claude-3-5-sonnet-latest` | |
| `google` | `gemini-1.5-flash` | |
| `xai` | `grok-beta` | |
| `mistral` | `mistral-small-latest` | |
| `together` | `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo` | |
| `auto` | (health-score-based) | Fails over across all providers |

### Model Profiles
| Profile | Description |
|---|---|
| `quality_first` | Best available model; higher latency and cost |
| `speed_first` | Smallest/fastest model |
| `cost_balanced` | Default â€” balances quality vs cost |
| `custom` | Use `CUSTOM_MODEL_NAME` env var |

### Auto Mode (Provider Failover)
- Maintains a **5-minute rolling health window** (max 20 entries per provider)
- Failed calls reduce provider health score; successful calls recover it
- Provider cooldown state persisted to `.agent-runtime/provider-cooldowns.json`
- Token budget state persisted to `.agent-runtime/token-budget-state.json`
- Cooldown period: 5 minutes after health score drops below threshold

### Environment Variables
| Variable | Purpose |
|---|---|
| `LLM_PROVIDER` | Active provider key (default: `openai`) |
| `OPENAI_API_KEY` | OpenAI key |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint URL |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | Deployment name |
| `AZURE_OPENAI_API_KEY` | Azure API key |
| `ANTHROPIC_API_KEY` | Anthropic key |
| `GOOGLE_API_KEY` | Google AI key |
| `XAI_API_KEY` | xAI/Grok key |
| `MISTRAL_API_KEY` | Mistral key |
| `TOGETHER_API_KEY` | Together AI key |
| `GITHUB_MODELS_TOKEN` | GitHub Models PAT |

---

## Pre-Task Scout

**File:** `apps/agent-runtime/src/pre-task-scout.ts`

Before the LLM classifies any code-touching task, the agent runs a lightweight codebase scout to inject real file context into the prompt. This mirrors what a human developer does before editing.

### Scout Trigger Actions
Scout runs for these action types:
- `code_edit`, `code_edit_patch`, `code_search_replace`
- `workspace_bulk_refactor`, `workspace_atomic_edit_set`
- `workspace_generate_test`, `workspace_fix_test_failures`
- `create_pr_from_workspace`, `workspace_create_pr`
- `autonomous_loop`, `workspace_github_issue_fix`
- `workspace_generate_from_template`

### Scout Sequence
1. `workspace_scout` â€” structural overview of the repo
2. `workspace_grep` â€” grep for task-related symbols/terms
3. `workspace_list_files` â€” list relevant directories

### Output
- Single formatted string, capped at **4,000 characters**
- Prepended to the LLM classification prompt
- Returns empty string for non-scout action types or if all scout calls fail (best-effort)

---

## Escalation Engine

**File:** `apps/agent-runtime/src/escalation-engine.ts`

### Escalation Conditions (evaluated in priority order)

| Reason | Condition | Suggested Action |
|---|---|---|
| `max_retries_exceeded` | `attemptCount >= max_attempts` (default: 3) | `ask_human` |
| `approval_rejected_twice` | `_approval_rejection_count >= 2` | `request_approval` |
| `ambiguous_task` | Task description is too short or contains ambiguous markers | `ask_human` |
| `scope_too_large` | Estimated file count or change scope exceeds threshold | `reduce_scope` |
| `test_failures_unresolved` | `lastError` matches test failure pattern | `stop` |

### `EscalationDecision` Interface
```typescript
interface EscalationDecision {
  shouldEscalate: boolean;
  reason?: EscalationReason;
  message: string;
  suggestedAction: 'ask_human' | 'reduce_scope' | 'request_approval' | 'stop';
}
```

### Usage
```typescript
const decision = evaluateEscalation(task, attemptCount, lastError);
if (decision.shouldEscalate) {
  // Route to human approval queue
}
```

---

## Post-Task Closeout

**File:** `apps/agent-runtime/src/post-task-closeout.ts`

After every completed task, the agent generates structured closeout artifacts for all active connectors.

### Closeout Functions

| Function | Output | Used For |
|---|---|---|
| `buildCloseOutComment(task, result, language?)` | Plain text with status, action taken, outcome | Jira comment, Slack message |
| `buildCloseOutSummary(task, result, language?)` | One-liner with emoji status (`âœ…` / `âŒ`) | Dashboard notification |
| `buildPRDescription(task, result)` | Markdown PR body with Summary/Motivation/Changes/Tests sections | GitHub/GitLab/Azure DevOps PR |

### Closeout Delivery (postTaskCloseOutV2)
- Jira: comment on linked issue
- Slack: message to workspace channel
- GitHub/GitLab/Azure DevOps: create PR or comment on issue
- Language-aware: uses `resolveTaskLanguage()` to format in the agent's language

---

## Quality Gate Loop (`AF_TEST_AFTER_EDIT`)

After any code-touching action, if `AF_TEST_AFTER_EDIT=true` in env:
1. Agent runs `run_tests` action automatically
2. If tests fail: up to 2 retry loops (re-edit â†’ re-test)
3. If tests still fail after 2 loops: task is escalated via `test_failures_unresolved`
4. Pass/fail result is recorded in `ActionResultRecord.approvalSummary`

---

## Approval Packet

**File:** `apps/api-gateway/src/lib/approval-packet.ts`

When a high-risk or medium-risk action reaches human review, the agent generates a structured approval packet stored in `Approval.actionSummary`.

### Packet Fields
| Field | Description |
|---|---|
| `change_summary` | One-line description of the proposed change |
| `impacted_scope` | Files, services, or systems affected |
| `risk_reason` | Why this action is considered risky |
| `proposed_rollback` | How to undo this change if approved and then failed |
| `lint_status` | Lint result (`pass` / `fail` / `skipped`) |
| `test_status` | Test result (`pass` / `fail` / `skipped`) |
| `packet_complete` | Boolean â€” all required fields are present |

---

## Execution Engine Types

**File:** `apps/agent-runtime/src/execution-engine.ts`

### `TaskEnvelope`
```typescript
interface TaskEnvelope {
  taskId: string;
  payload: {
    action_type: string;
    tenantId: string;
    workspaceId: string;
    botId: string;
    [key: string]: unknown;
  };
}
```

### `ActionDecision`
```typescript
interface ActionDecision {
  actionType: string;
  riskLevel: 'low' | 'medium' | 'high';
  reasoning: string;
  connectorType?: string;
}
```

### `LlmDecisionMetadata`
```typescript
interface LlmDecisionMetadata {
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs: number;
}
```

### `ProcessedTaskResult`
```typescript
interface ProcessedTaskResult {
  taskId: string;
  actionType: string;
  outcome: 'success' | 'failed' | 'approval_queued';
  actorId?: string;
  routeReason?: string;
  evidenceLink?: string;
  approvalSummary?: string;
}
```

---

## Memory Integration

Per task, the agent:
1. **Reads** short-term memory from `AgentShortTermMemory` (last 20 entries, ranked by repo match + recency)
2. **Reads** repo knowledge from `AgentRepoKnowledge` (tech patterns, conventions)
3. Prepends memory context to LLM prompt
4. **Writes** outcome back to `AgentShortTermMemory` after task completion
5. TTL: 7 days by default; null = permanent

See [MEMORY_SYSTEM.md](./MEMORY_SYSTEM.md) for full memory reference.

### Local Workspace Memory (`workspace_memory_*`)

The agent runtime also maintains a **per-workspace flat JSON store** at `{workspace_dir}/memory.json`. This is independent of the database-backed `AgentShortTermMemory` and is used for lightweight, persistent key/value state within a workspace run.

| Action | Description |
|---|---|
| `workspace_memory_write` | Writes a key/value pair. Stores metadata in `_sessions_index[key]` (session ID, bot ID, tenant ID, written-at timestamp). |
| `workspace_memory_read` | Reads a specific key or returns all non-meta entries as JSON. |
| `workspace_memory_search` | **New (Gap 1 fix, 2026-05-21):** Keyword-frequency search over all stored keys and values. Returns top-N results ranked by match score (key match = +2, value match = +1). Skips internal meta keys (`_updated_at`, `_sessions_index`). |

The `_sessions_index` sub-object in `memory.json` allows auditing which session, bot, and tenant wrote each entry without changing the flat value format consumed by existing code.

---

## Debug Session Tracking

**File:** `apps/agent-runtime/src/local-workspace-executor.ts`

The `workspace_debug_breakpoint` action starts a debug server (Node.js inspector or Python debugpy) and **registers the process in the module-level `_debugSessions` Map** *(Gap 2 fix, 2026-05-21)*.

- `_debugSessions` is keyed by `sessionId` (`dbg_bp_{timestamp}_{random6}`)
- Each entry stores `{ proc: ChildProcess; port: number; output: string[] }` matching the type expected by other debug session actions (`workspace_debug_session_start`, `workspace_debug_session_run`, etc.)
- The process is automatically deregistered from the map on exit
- The `session_id` and `debug_port` are returned in the action output so subsequent debug actions can reference the correct session

Previously, the spawned debug process was detached and untracked, making `workspace_debug_session_stop` unable to find or terminate it.

---

## Tenant Credential Isolation (`connector-dispatcher`)

**File:** `apps/agent-runtime/src/connector-dispatcher.ts`

All outbound connector calls (GitHub, Jira, TestRail, Zephyr) pass through `dispatchConnectorAction`, which enforces tenant credential isolation *(Gap 6 fix, 2026-05-21)*.

### `assertTenantCredentialIsolation(payload)`

Called before every connector dispatch. Rules:
- If `payload.tenant_id` is non-empty **and not in the dev-bypass set** AND `payload.credentials` is absent â†’ throws `CREDENTIAL_ISOLATION_REQUIRED`
- Dev-bypass tenants: `dev`, `test`, `local`, `default`, `ci`, `localhost` â€” these may fall back to env-var credentials for local development
- Production tenants must supply explicit `payload.credentials` or the dispatch returns `{ ok: false, error: 'CREDENTIAL_ISOLATION_REQUIRED: ...' }`

This prevents credential bleed where one tenant's env-var token could be used to act on behalf of another tenant's resource.

---

## Desktop Operator Integration

For workspace automation tasks (browser, app launch, REPL), the agent delegates to:
- `MockDesktopOperator` â€” in test/dev mode
- `PlaywrightDesktopOperator` â€” in production

Controlled by `DESKTOP_OPERATOR` env var. See [DESKTOP_OPERATOR.md](./DESKTOP_OPERATOR.md).

---

## Language Integration

All agent output (comments, PR descriptions, Slack messages) is language-aware via `resolveTaskLanguage()`:
- Cascades: audio â†’ text detection â†’ user profile â†’ workspace config â†’ tenant default â†’ `en`
- 5 Unicode detection ranges: `ja`, `ko`, `ar`, `hi`, `en`

See [LANGUAGE_SYSTEM.md](./LANGUAGE_SYSTEM.md).

---

## Sprint 15 â€” Tester Agent Gap Fixes (2026-05-21)

Three real gaps were validated against the live codebase (no hallucinations) and fixed.  
Two previously-reported gaps (ImageMagick visual diff, ZAP passive DAST) were confirmed already resolved in Sprint 13.

### Gap 1 â€” Exploratory Session Dispatcher (`workspace_exploratory_session`)

**Root cause:** The executor loop iterated over SFDPOT charter actions but never dispatched any browser action.  Every action was unconditionally marked `status = 'passed'` with a comment `"executor doesn't deep-evaluate each step"`.

**Fix â€” `tester-exploration-engine.ts`:**  
Added `mapActionToExecutableSteps(action, appUrl)` which maps each SFDPOT heuristic description to either:
- `navigate_screenshot` â†’ 2 steps: `workspace_web_navigate` + `workspace_screenshot`
- `screenshot_only` â†’ 1 step: `workspace_screenshot`
- `skip` â†’ 0 steps + a `skipReason` explaining why (e.g. multi-browser, clock manipulation, keyboard-only)

**Fix â€” `local-workspace-executor.ts`:**  
The exploratory loop now calls `mapActionToExecutableSteps` per action, dispatches each step via `executeLocalWorkspaceAction`, records failures as `findings[]`, and sets `next.status = 'skipped' | 'passed' | 'failed'` correctly.  Non-automatable actions (Platform / Time dimension steps) receive a `skipped` status with an explanatory note instead of a false `passed`.

### Gap 2 â€” Appium Fallback (`workspace_appium_test_run`)

**Root cause:** When `APPIUM_SERVER_URL` was not set, the case immediately returned `{ ok: false, errorOutput: '...' }` â€” no fallback, hard fail.

**Fix â€” `local-workspace-executor.ts`:**  
1. Default the URL to `http://localhost:4723` when env var is absent (standard Appium default).
2. Health-check the server with `fetch(.../status, { signal: AbortSignal.timeout(3_000) })`.
3. If the health-check fails â†’ fall back to **Playwright device emulation**: runs `npx playwright test --device="Pixel 5"` (Android) or `--device="iPhone 12"` (iOS) depending on `payload.platform`.  Returns the Playwright result as the action result.
4. If Appium is reachable â†’ proceed with original WebdriverIO / pytest path as before.

### Gap 3 â€” SAST LLM Semantic Analysis (`workspace_sast_scan`)

**Root cause:** The SAST scan used 30+ regex patterns + optional Semgrep.  Neither engine can detect logic-level vulnerabilities: auth/authz bypass, IDOR, race conditions, TOCTOU, privilege escalation, or missing authorization checks.

**Fix â€” new file `sast-semantic-analyzer.ts`:**  
Exports four functions:
- `buildSastSemanticPrompt(fileContent, filename)` â€” crafts an LLM prompt targeting 7 logic vulnerability categories, truncates to 6 000 chars, enforces JSON-array response format.
- `parseSastSemanticResponse(rawResponse, filename)` â€” tolerantly extracts a JSON array from prose-wrapped LLM responses; validates severity, normalises unknowns to `medium`, skips entries without a message.
- `callSastLlmIfConfigured(prompt, filename)` â€” returns `null` (graceful no-op) when `SAST_LLM_ENDPOINT` or `SAST_LLM_API_KEY` env vars are absent.  Uses `SAST_LLM_MODEL` (default `gpt-4o-mini`).  OpenAI-compatible chat completions format.  Never throws.
- `selectFilesForSemanticAnalysis(files, topN)` â€” prioritises auth/controller/middleware/permission files by pattern score, returns top-N candidates.

**Fix â€” `local-workspace-executor.ts` (`workspace_sast_scan`):**  
When `payload.llm_analysis === true`, after the regex + Semgrep passes:
1. Select top-5 files via `selectFilesForSemanticAnalysis`.
2. For each, call `callSastLlmIfConfigured` (no-op when env not set).
3. Merge LLM findings into `allFindings`.
4. Add `'llm_semantic'` to `engines_used` when any LLM findings are returned.

Env vars required to activate: `SAST_LLM_ENDPOINT`, `SAST_LLM_API_KEY`.  Feature degrades silently when absent.

### Test Coverage Added

| File | Tests | All pass |
|------|-------|----------|
| `apps/agent-runtime/src/tester-exploration-engine.test.ts` | 18 | âœ… |
| `apps/agent-runtime/src/sast-semantic-analyzer.test.ts` | 17 | âœ… |

New test assertions:
- `mapActionToExecutableSteps`: navigate_screenshot â†’ 2 steps; screenshot_only â†’ 1 step; missing appUrl â†’ screenshot only; platform/time actions â†’ skipped with reason.
- `buildSastSemanticPrompt`: contains all 7 vuln categories; truncates at 6 000 chars; instructs JSON response.
- `parseSastSemanticResponse`: parses valid array; returns `[]` for invalid JSON; extracts array from prose; normalises severity; skips items without message.
- `callSastLlmIfConfigured`: returns `null` when env vars absent; returns `null` when only one env var set.
- `selectFilesForSemanticAnalysis`: scores auth/controller files higher; respects topN; handles small file lists.

### Quality Gate â€” Sprint 15 Baseline

| Metric | Result |
|--------|--------|
| Total tests | **3093 pass / 0 fail** |
| New tests added | +35 |
| TypeScript errors | 0 |
| Exit code | 0 |

---

## Sprint 13 â€” Tester Agent Gap Fixes

> Applied: May 20, 2026

Six validated gaps in the Tester Agent were found and fixed. Three gaps were confirmed not real (T5 already fixed in Sprint 12, T9 episodic memory already wired, T8 is infrastructure-level). All changes were validated against actual codebase code before implementation.

### Gap Validation Matrix

| Gap | Claim | Verdict | Action |
|-----|-------|---------|--------|
| T1 | Cannot write test code (`code_edit` blocked) | **REAL** | Added `code_edit` to `TESTER_ROLE_ALLOWED_LOCAL_ACTIONS` |
| T2 | Cannot push to Git or create PRs | **REAL** | Added `git_commit`, `git_push` to tester allowed list |
| T3 | No persistent memory (`workspace_memory_search` missing) | **REAL** | Added `workspace_memory_write` + `workspace_memory_search` |
| T4 | SAST is 9-rule regex heuristics only | **REAL** | Extended to 30+ patterns across 8 categories + Semgrep CLI integration |
| T5 | `workspace_explain_code` is stubs | **NOT REAL** | Fixed in Sprint 12 (Developer Gap 4) |
| T6 | Visual regression is pixel diff only | **REAL** (worse â€” was file-size ratio) | SHA256 exact match â†’ ImageMagick RMSE â†’ size fallback |
| T7 | DAST silently fails without ZAP | **REAL** | Passive DAST fallback: HTTP header checks + sensitive path exposure |
| T8 | No browser screenshot streaming | **REAL but out of scope** | Requires noVNC container wiring (infrastructure sprint) |
| T9 | No episodic memory | **NOT REAL** | `tester-episodic-hooks.ts` already wired in `runtime-server.ts` |

### T1 + T2 + T3 â€” Tester Code Write, Git, and Memory

**File:** `apps/agent-runtime/src/tester-agent-profile.ts`

Added to `TESTER_ROLE_ALLOWED_LOCAL_ACTIONS`:
- `code_edit` â€” enables test file creation and editing directly
- `git_commit`, `git_push` â€” enables test branch commits and pushes
- `workspace_memory_write`, `workspace_memory_search` â€” enables persistent working memory across tasks

PR creation via GitHub connector was already allowed via `ROLE_CONNECTOR_ACTION_OVERRIDES.tester.github`.

### T4 â€” SAST Enhancement (30+ patterns + Semgrep)

**File:** `apps/agent-runtime/src/local-workspace-executor.ts` â€” `workspace_sast_scan` case

Extended from 9 regex patterns to 30+ patterns across 8 security categories:
- **Injection**: SQL template, NoSQL, command, LDAP, XPath
- **XSS**: innerHTML, outerHTML, document.write, dangerouslySetInnerHTML
- **Path traversal**: file path concat, path.join with user input
- **SSRF**: fetch/axios with user-controlled URL
- **Open redirect**: res.redirect from user input
- **Cryptography**: weak ciphers, hardcoded IV, Math.random, JWT none-alg, hardcoded JWT secret
- **Prototype pollution**: `__proto__` assignment, Object.assign from user input
- **Information disclosure**: stack trace and raw error message in responses, CORS misconfig

New Semgrep CLI integration: when `semgrep: true` (default) and Semgrep is installed, runs `semgrep scan --config auto --json` and merges findings. Falls back gracefully when Semgrep is not available. All findings now include `engine: 'regex' | 'semgrep'` field.

Supported file extensions extended to include `.py`, `.java`, `.go`, `.cs`, `.rb`.

### T6 â€” Visual Regression: SHA256 + ImageMagick + Fallback

**File:** `apps/agent-runtime/src/local-workspace-executor.ts` â€” `workspace_visual_regression` case

3-tier comparison replacing the previous file-size ratio heuristic:

1. **SHA256 exact match** (fast path) â€” `method: 'sha256_exact'`. If hashes match, no regression. Zero false positives for identical screenshots.
2. **ImageMagick pixel diff** â€” `compare -metric RMSE` when ImageMagick (`compare`) is available. Produces quantitative `diff_pct` and a `diff_image` path on regression. Method: `imagemagick_pixel_diff`.
3. **Size-ratio fallback** â€” when ImageMagick is absent. Returns `method: 'size_fallback'` with advisory to install ImageMagick.

### T7 â€” DAST Passive Fallback (no ZAP required)

**File:** `apps/agent-runtime/src/local-workspace-executor.ts` â€” `workspace_dast_scan` case

When `ZAP_API_URL` is not set, performs a lightweight passive scan instead of returning an error:

- **HTTP security headers** â€” checks for missing HSTS, X-Frame-Options, X-Content-Type-Options, CSP, Referrer-Policy, Permissions-Policy; detects Server banner and X-Powered-By disclosure
- **Sensitive path exposure** â€” probes `/.git/HEAD`, `/.env`, `/wp-admin`, `/phpinfo.php`, `/admin`, `/swagger.json`, `/openapi.json`, `/api-docs`
- Returns `{ ok: true, mode: 'passive_fallback', findings: [...] }` with severity-tagged findings

Full ZAP active scan remains available when `ZAP_API_URL` is configured.

### New Tests Added (Sprint 13)

7 new tests in `apps/agent-runtime/src/local-workspace-executor.test.ts`:
- `workspace_sast_scan` â€” SQL template injection, command injection, CORS wildcard, engine field presence
- `workspace_visual_regression` â€” missing URL returns error
- `workspace_dast_scan` â€” passive fallback returns `ok: true` with `mode: 'passive_fallback'`; missing `target_url` returns error

---

## Sprint 14 â€” Developer Agent Gap Fixes

Sprint 14 validated and fixed three confirmed Developer agent gaps. No guessing â€” every gap
was verified against source code before any changes were made.

### Gap 1 â€” `workspace_generate_test` wrote TODO stubs instead of real assertions

**Root cause**: The original implementation iterated over symbol names and emitted
`// TODO: implement test for ${sym}\n  assert.ok(true);` for every function â€” semantically
useless tests that would pass vacuously regardless of what the function did.

**Fix**: New module `apps/agent-runtime/src/test-generator.ts` added with smart assertion
generation:
- `extractSignatures(src)` â€” regex-parses exported functions and arrow-function constants from
  TypeScript source. Falls back to symbol names for classes or unexported identifiers.
- `categorise(name, returnType)` â€” infers category from return type (strips `Promise<>`) then
  name prefix heuristics. Categories: `boolean | number | string | array | nullable | object | void | unknown`.
- `inferArgs(rawParams)` â€” maps parameter names to realistic values
  (`email â†’ 'user@example.com'`, `name â†’ 'Alice'`, `id â†’ 'id-1'`, numeric â†’ `42`, etc.).
- `buildNodeTestCases(sig)` / `buildJestCases(sig, isVitest)` â€” generate 3 meaningful assertions
  per function. Example for `add(a, b): number`: `assert.equal(add(2, 3), 5)` and
  `assert.equal(add(0, 0), 0)`. For `sub`: `assert.equal(sub(5, 3), 2)` and
  `assert.equal(sub(4, 4), 0)`.
- `generateTestFile(opts)` â€” top-level entry point, returns `{ content, symbols, framework }`.
  Supports `node:test`, `jest`, and `vitest` frameworks.

`local-workspace-executor.ts` `workspace_generate_test` case now calls `generateTestFile()` and
returns `ok: false` with a clear error when no exports are found.

### Gap 2 â€” `DESKTOP_OPERATOR=native` bypassed the vision loop

**Root cause**: Four action cases in `local-workspace-executor.ts` guarded native-operator routing
with:
```typescript
if (process.env['DESKTOP_OPERATOR'] === 'mock' || process.env['DESKTOP_OPERATOR'] === 'playwright')
```
When `DESKTOP_OPERATOR=native` (the production Docker default), all four fell through to a raw
`launchDetached()` OS call, completely bypassing `NativeDesktopOperator` and the screenshot â†’
LLM â†’ action vision loop in `docker/desktop-agent/agent-entrypoint.js`.

**Fix**: All four conditions now include `=== 'native'`:
```typescript
if (op === 'mock' || op === 'playwright' || op === 'native')
```
Affected actions: `workspace_browser_open`, `workspace_app_launch`, `workspace_meeting_join`,
`workspace_meeting_speak`.

**How `native` mode works after the fix**: `NativeDesktopOperator` submits the request to the
`localhost:5003` HTTP API served by `docker/desktop-agent/agent-entrypoint.js`, which runs the
real `scrot â†’ LLM-decision â†’ xdotool` feedback loop.

### Gap 3 â€” Episodic memory silently dropped without embedding keys

**Root cause**: `episodicEmbed` is `null` when `EPISODIC_EMBEDDING_ENDPOINT` /
`EPISODIC_EMBEDDING_API_KEY` are absent (self-hosted or early-stage deployments). Both the recall
path (line ~3494) and the write path (line ~4411) in `runtime-server.ts` were gated on
`if (episodicEmbed && options.prisma)`. When the embed client was `null`, the entire episodic
memory system was a silent no-op â€” all session context was lost on every container restart.

**Fix**: New module `services/memory-service/src/episodic-text-fallback.ts` with two functions:
- `writeEpisodicMemoryNoEmbed(request, prisma)` â€” `INSERT ... ON CONFLICT DO UPDATE` with
  `embedding = NULL` and `embeddingModel = 'none:text-search-fallback'`. Durable across restarts.
- `searchEpisodicMemoryNoEmbed(request, prisma)` â€” `SELECT WHERE summary ILIKE $pattern OR pattern
  ILIKE $pattern ORDER BY lastSeen DESC LIMIT topK`. Returns fixed `similarity: 0.5` (honest
  signal that this is text-match, not cosine similarity). Vector-indexed rows (embedding IS NOT
  NULL) are still preferred in the upgrade path when embedding keys are later configured.

`runtime-server.ts` changes:
- Recall: dual-path ternary â€” vector path when `episodicEmbed && prisma`, text fallback when
  only `prisma`, `null` when neither.
- Write: separate `if (!episodicEmbed && options.prisma)` block after the vector-write block,
  calling `writeEpisodicMemoryNoEmbed(...)` fire-and-forget (`.catch` logs, never throws).

Both functions exported from `services/memory-service/src/index.ts`.

### New Tests Added (Sprint 14)

**`apps/agent-runtime/src/test-generator.test.ts`** â€” 31 unit tests:
- `extractSignatures`: regular function, async function, arrow function, multiple functions, class â†’ fallbackSymbols
- `categorise`: all categories by return type, all categories by name prefix, `find*` â†’ nullable, `filter*` â†’ array, unknown fallback
- `inferArgs`: empty params, email, name, num, multiple params
- `generateTestFile` (node:test): `add` function checks `assert.equal(add(2, 3), 5)` and no TODO, `sub`, `isEmail` boolean, `formatDate` string, `filterUsers` array
- `generateTestFile` (jest): `describe(` present, `toBe(5)`, no vitest import
- `generateTestFile` (vitest): `from 'vitest'` present
- `generateTestFile` no exports: returns empty content and empty symbols array

**`services/memory-service/src/episodic-text-fallback.test.ts`** â€” 7 unit tests:
- `writeEpisodicMemoryNoEmbed`: returns shaped `EpisodicMemoryRecord`, throws on empty rows, falls back `botId` from request
- `searchEpisodicMemoryNoEmbed`: returns shaped `EpisodicSearchResult[]` with `similarity: 0.5`, empty array for no rows, defaults `topK=5`, all similarities are 0.5

**`apps/agent-runtime/src/local-workspace-executor.test.ts`** â€” updated:
- `workspace_generate_test` test now asserts real arithmetic: `assert.equal(add(2, 3), 5)`, `assert.equal(add(0, 0), 0)`, `assert.equal(sub(5, 3), 2)`, no TODO in output
- Added jest-format variant: `describe(` present, `toBe(` assertions, no `assert.` methods

**Quality gate result**: 3058 pass / 0 fail (Sprint 13 baseline was 1178).
