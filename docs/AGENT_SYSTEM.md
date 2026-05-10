# AgentFarm Agent System

> Last updated: May 10, 2026 | AgentFarm monorepo audit

Full reference for the agent execution pipeline in `apps/agent-runtime`.

---

## Overview

The agent runtime is a Fastify v5 server (port 3003) that receives task envelopes, classifies the intended action via LLM, executes that action, manages approvals, memory, escalation, and post-task closeout. Each agent instance is bound to a single workspace and a single role.

**Core pipeline per task:**
1. Pre-task scout (codebase context gathering)
2. LLM classification → `ActionDecision`
3. Risk evaluation → approve inline, queue for human approval, or reject
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
1–5 ordered priorities
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
All other actions including: `workspace_scout`, `workspace_grep`, `workspace_list_files`, `read_file`, `search_codebase`, `get_status`, etc.

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
| `cost_balanced` | Default — balances quality vs cost |
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
1. `workspace_scout` — structural overview of the repo
2. `workspace_grep` — grep for task-related symbols/terms
3. `workspace_list_files` — list relevant directories

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
| `buildCloseOutSummary(task, result, language?)` | One-liner with emoji status (`✅` / `❌`) | Dashboard notification |
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
2. If tests fail: up to 2 retry loops (re-edit → re-test)
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
| `packet_complete` | Boolean — all required fields are present |

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

---

## Desktop Operator Integration

For workspace automation tasks (browser, app launch, REPL), the agent delegates to:
- `MockDesktopOperator` — in test/dev mode
- `PlaywrightDesktopOperator` — in production

Controlled by `DESKTOP_OPERATOR` env var. See [DESKTOP_OPERATOR.md](./DESKTOP_OPERATOR.md).

---

## Language Integration

All agent output (comments, PR descriptions, Slack messages) is language-aware via `resolveTaskLanguage()`:
- Cascades: audio → text detection → user profile → workspace config → tenant default → `en`
- 5 Unicode detection ranges: `ja`, `ko`, `ar`, `hi`, `en`

See [LANGUAGE_SYSTEM.md](./LANGUAGE_SYSTEM.md).
