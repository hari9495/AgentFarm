# AgentFarm — LLM Configuration & Functionality Reference

**Service:** `apps/agent-runtime`  
**Date:** 2026-05-29

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Supported Providers](#2-supported-providers)
3. [How to Configure a Provider](#3-how-to-configure-a-provider)
4. [Model Profiles — Three Cost Tiers](#4-model-profiles--three-cost-tiers)
5. [Built-in Default Models per Provider](#5-built-in-default-models-per-provider)
6. [Subsystem A — Task Decision LLM](#6-subsystem-a--task-decision-llm)
7. [Subsystem B — Code Generation LLM](#7-subsystem-b--code-generation-llm)
8. [Subsystem C — Agent Direct Callers](#8-subsystem-c--agent-direct-callers)
9. [Calling Utilities — streamLLM and callLLMWithTools](#9-calling-utilities--streamllm-and-callllmwithtools)
10. [Anthropic Model Registry & Auto-Fallback](#10-anthropic-model-registry--auto-fallback)
11. [auto Mode — Multi-Provider Failover](#11-auto-mode--multi-provider-failover)
12. [Model Router — Action-Type Overrides](#12-model-router--action-type-overrides)
13. [Task Complexity Engine](#13-task-complexity-engine)
14. [System Prompt Builder](#14-system-prompt-builder)
15. [Context Enrichment Pipeline](#15-context-enrichment-pipeline)
16. [Prompt Truncation Safeguards](#16-prompt-truncation-safeguards)
17. [Token Budget System](#17-token-budget-system)
18. [Quality Tracker](#18-quality-tracker)
19. [Routing History Advisor](#19-routing-history-advisor)
20. [Loop Learning Store](#20-loop-learning-store)
21. [Task Intelligence Memory](#21-task-intelligence-memory)
22. [Code Review Learning](#22-code-review-learning)
23. [Episodic Summarizer](#23-episodic-summarizer)
24. [Batch Classifier](#24-batch-classifier)
25. [Anthropic Prompt Caching](#25-anthropic-prompt-caching)
26. [Provider Health Scoring & Cooldowns](#26-provider-health-scoring--cooldowns)
27. [State Files Written to Disk](#27-state-files-written-to-disk)
28. [Complete Environment Variable Reference](#28-complete-environment-variable-reference)

---

## 1. Architecture Overview

The LLM system in `apps/agent-runtime` has three distinct subsystems and two shared utilities, all driven by the same provider selection layer.

```
Incoming task
     │
     ├─► Subsystem A: Task Decision LLM          (llm-decision-adapter.ts)
     │      Classifies every task into an action type, risk level,
     │      route, and payload overrides before execution.
     │
     ├─► Subsystem B: Code Generation LLM        (infrastructure/llm-provider-factory.ts)
     │      Generates the step-by-step implementation plan (file edits,
     │      test/build commands) when a developer action executes.
     │
     ├─► Subsystem C: Agent Direct Callers       (infrastructure/anthropic-caller.ts)
     │      16 sales agent modules + task-planner + test-generator +
     │      meeting-transcription + speaking-agent + skill-execution-engine
     │      — all call Anthropic directly for domain-specific generation.
     │
     ├─► Utility: streamLLM                      (llm-decision-adapter.ts)
     │      Streaming token generator used by content-writer, technical-writer,
     │      full-stack-developer enricher modules.
     │
     └─► Utility: callLLMWithTools               (llm-decision-adapter.ts)
            Single-turn function/tool calling for any agent that needs
            structured tool invocations.
```

All three subsystems read the same provider selection env var (`AF_MODEL_PROVIDER`) and support the same set of 11 providers.

---

## 2. Supported Providers

| Value for `AF_MODEL_PROVIDER` | API | Default base URL |
|---|---|---|
| `anthropic` (or `claude`) | Anthropic Messages API | `https://api.anthropic.com` |
| `openai` | OpenAI Chat Completions API | `https://api.openai.com/v1` |
| `azure_openai` (or `azure-openai`) | Azure OpenAI | Configured via `AF_AZURE_OPENAI_ENDPOINT` |
| `github_models` (or `github`) | GitHub Models inference endpoint | `https://models.inference.ai.azure.com` |
| `google` (or `gemini`) | Google Generative Language API | `https://generativelanguage.googleapis.com/v1beta` |
| `xai` (or `grok`, `x.ai`) | xAI API | `https://api.x.ai/v1` |
| `mistral` | Mistral AI API | `https://api.mistral.ai/v1` |
| `together` (or `togetherai`) | Together AI API | `https://api.together.xyz/v1` |
| `deepseek` | DeepSeek API | `https://api.deepseek.com` |
| `auto` | Tries all configured providers in priority order | — |
| `mock` (or `mock_llm`) | Deterministic no-API mock — for testing and demos | — |
| `agentfarm` (default) | No LLM; heuristic-only classification | — |

When `AF_MODEL_PROVIDER` is not set or set to `agentfarm`, the runtime uses keyword-based heuristics for task classification and returns empty results for code generation — no API calls are made.

---

## 3. How to Configure a Provider

Every provider requires exactly one API key env var plus optional model overrides. The runtime accepts both `AF_` and `AGENTFARM_` prefixes for every variable; `AF_` takes precedence when both are set.

**Anthropic:**
```
AF_MODEL_PROVIDER=anthropic
AF_ANTHROPIC_API_KEY=sk-ant-...
AF_ANTHROPIC_MODEL=claude-sonnet-4-6          # optional; default: claude-sonnet-4-6
AF_ANTHROPIC_BASE_URL=https://api.anthropic.com  # optional
AF_ANTHROPIC_API_VERSION=2023-06-01              # optional
```

**OpenAI:**
```
AF_MODEL_PROVIDER=openai
AF_OPENAI_API_KEY=sk-...
AF_OPENAI_MODEL=gpt-4o-mini                   # optional; default: gpt-4o-mini
AF_OPENAI_BASE_URL=https://api.openai.com/v1  # optional
```

**Azure OpenAI:**
```
AF_MODEL_PROVIDER=azure_openai
AF_AZURE_OPENAI_ENDPOINT=https://myresource.openai.azure.com
AF_AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini
AF_AZURE_OPENAI_API_KEY=...
AF_AZURE_OPENAI_API_VERSION=2024-06-01        # optional; default: 2024-06-01
```

**GitHub Models:**
```
AF_MODEL_PROVIDER=github_models
AF_GITHUB_MODELS_API_KEY=ghp_...
AF_GITHUB_MODELS_MODEL=openai/gpt-4.1-mini    # optional
```

**Google:**
```
AF_MODEL_PROVIDER=google
AF_GOOGLE_API_KEY=AIza...
AF_GOOGLE_MODEL=gemini-1.5-flash              # optional; default: gemini-1.5-flash
```

**xAI:**
```
AF_MODEL_PROVIDER=xai
AF_XAI_API_KEY=xai-...
AF_XAI_MODEL=grok-beta                        # optional
```

**Mistral:**
```
AF_MODEL_PROVIDER=mistral
AF_MISTRAL_API_KEY=...
AF_MISTRAL_MODEL=mistral-small-latest         # optional
```

**Together AI:**
```
AF_MODEL_PROVIDER=together
AF_TOGETHER_API_KEY=...
AF_TOGETHER_MODEL=meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo   # optional
```

**DeepSeek:**
```
AF_MODEL_PROVIDER=deepseek
AF_DEEPSEEK_API_KEY=sk-...
AF_DEEPSEEK_MODEL=deepseek-chat               # optional
```

**Mock (testing/demos):**
```
AF_MODEL_PROVIDER=mock
MOCK_LLM_DELAY_MS=0                          # optional artificial delay
ALLOW_MOCK_FALLBACK=true                     # optional: fall back to mock when all auto providers fail
```

---

## 4. Model Profiles — Three Cost Tiers

Every provider supports three model profiles that map to different model tiers. The profile for a given task is chosen automatically based on task complexity — but can be overridden per-task by setting `model_profile` in the task payload.

| Profile | When selected automatically | Purpose |
|---|---|---|
| `quality_first` | High-impact action type, high risk level, prompt >2,000 chars, plan depth >3 steps, or retry attempt | Complex tasks; best reasoning model |
| `cost_balanced` | Default for moderate tasks | General-purpose mid-tier model |
| `speed_first` | Read-only action type (`workspace_grep`, `workspace_list_files`, etc.) or `complexity_hint: low` | Cheap + fast; classification tasks |

**Complexity scoring (from `llm-decision-adapter.ts`):**

| Signal | Score contribution |
|---|---|
| High-impact action type (deploy, push, spawn) | +3 |
| High risk level | +3 |
| Payload field `complexity: high` | +3 |
| Retry attempt (`retry_attempt > 0`) | +2 |
| Prompt length >2,000 chars | +2 |
| Plan depth >3 steps | +2 |
| Medium risk level | +1 |
| Other mutating action | +1 |
| Read-only action type | -1 |
| Payload field `complexity: low` | -1 |

Score ≥5 → `complex` → `quality_first`  
Score 2–4 → `moderate` → `cost_balanced`  
Score <2 → `simple` → `speed_first`

**Per-tier model overrides (env vars):**  
For each provider and profile, set `AF_<PROVIDER>_MODEL_<PROFILE>`:

```
AF_ANTHROPIC_MODEL_QUALITY_FIRST=claude-opus-4-8
AF_ANTHROPIC_MODEL_COST_BALANCED=claude-sonnet-4-7
AF_ANTHROPIC_MODEL_SPEED_FIRST=claude-haiku-4-6
AF_OPENAI_MODEL_QUALITY_FIRST=gpt-4.1
AF_OPENAI_MODEL_SPEED_FIRST=gpt-4.1-mini
# etc. — same pattern for GOOGLE, MISTRAL, TOGETHER, DEEPSEEK, XAI, GITHUB_MODELS, AZURE_OPENAI
```

Operator overrides always win over built-in defaults.

---

## 5. Built-in Default Models per Provider

These are the hardcoded defaults in the code (from `llm-decision-adapter.ts` and `infrastructure/llm-provider-factory.ts`). Every entry is overridable via env var.

| Provider | `quality_first` | `cost_balanced` | `speed_first` |
|---|---|---|---|
| **Anthropic** | `claude-opus-4-7` | `claude-sonnet-4-6` | `claude-haiku-4-5` |
| **OpenAI** | `gpt-4o` | `gpt-4o` | `gpt-4o-mini` |
| **Azure OpenAI** | per `DEPLOYMENT_QUALITY_FIRST` | per `DEPLOYMENT_COST_BALANCED` | per `DEPLOYMENT_SPEED_FIRST` |
| **GitHub Models** | `gpt-4o` | `gpt-4o-mini` | `gpt-4o-mini` |
| **Google** | `gemini-1.5-pro` | `gemini-1.5-flash` | `gemini-1.5-flash` |
| **xAI** | `grok-beta` | `grok-beta` | `grok-beta` |
| **Mistral** | `mistral-large-latest` | `mistral-small-latest` | `mistral-small-latest` |
| **Together** | `meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo` | `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo` | `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo` |
| **DeepSeek** | `deepseek-reasoner` | `deepseek-chat` | `deepseek-chat` |

---

## 6. Subsystem A — Task Decision LLM

**File:** [`apps/agent-runtime/src/llm-decision-adapter.ts`](apps/agent-runtime/src/llm-decision-adapter.ts)

### What it does

Every incoming task is classified by this subsystem before any action executes. The LLM receives the task and must return a JSON decision that tells the executor what to do.

### What the LLM receives

The task prompt is a JSON object containing (in order of priority):

| Field | Content | Size cap |
|---|---|---|
| `codebaseContext` | `_scout_context` from task payload — codebase map built by the workspace scouter | 12,000 chars (hoisted above truncation cap) |
| `recentTaskHistory` | `_episodic_context` from task payload — compressed history of recent task outcomes | 12,000 chars (hoisted) |
| `personTaskHistory` | `_episodic_person_context` — context specific to the calling user | 12,000 chars (hoisted) |
| `requiredResponseSchema` | JSON schema the LLM must match | always included |
| `policy` | 10 routing rules the LLM must follow | always included |
| `taskComplexity` | Complexity score + reasons (see Section 4) | always included |
| `workspaceConventions` | Package manager, test/build commands, import style | always included |
| `trajectoryHints` | Historical success/failure count for this action type in this workspace | always included |
| `learnedWorkspaceRules` | Code review lessons from past PR reviews | always included |
| `learnedWorkspaceRulePrompt` | Formatted workspace rule prompt from past reviews | always included |
| `agentRejectionRate` | Fraction of tasks that got approval-routed in recent history | included when available |
| `recentTaskOutcomes` | Last 3 task outcomes: actions taken, execution status, connectors used | included when available |
| `learnedSkillSequence` | Most successful skill sequence for this workspace (if success_rate ≥ 0.7) | included when available |
| `devopsPayloadRule` | Per-action payload schema for the heuristically chosen DevOps action | included for DevOps actions only — saves ~6,700 tokens |
| `task` | The task payload (truncated per Section 16) | variable |
| `heuristicDecision` | The baseline decision from keyword heuristics — LLM refines this | always included |

Context blocks (`codebaseContext`, `recentTaskHistory`, `personTaskHistory`) are hoisted above the per-string 4,000-char truncation cap and receive their own 12,000-char budget each. **Simple tasks skip all context blocks entirely** to save ~9,000 tokens per classification call.

### What the LLM must return

```json
{
  "actionType": "workspace_subagent_spawn",
  "confidence": 0.92,
  "riskLevel": "low | medium | high",
  "route": "execute | approval",
  "reason": "brief explanation",
  "payloadOverrides": {
    "actionType": "workspace_subagent_spawn",
    "prompt": "natural language task description",
    "target_files": ["src/foo.ts"],
    "initial_plan": [
      {
        "description": "what this step does",
        "actions": [
          { "action": "code_edit_patch", "file_path": "src/foo.ts", "old_text": "exact text", "new_text": "replacement" }
        ]
      }
    ],
    "fix_attempts": []
  }
}
```

### LLM call parameters

- `max_tokens: 256` — deliberately small; the LLM only classifies, it does not generate content
- `temperature: 0` — deterministic
- System prompt: built by `buildSystemPrompt()` — role-specific prompt + language instruction + agent persona identity block (persona block is omitted for classification calls with `isExternalFacing: false` to save ~100 tokens)

### Token budget guard

Every resolver is wrapped with `withTokenBudgetGuard()`. Before making the LLM call, it checks the daily token limit for the `tenantId:workspaceId:botId` scope. If the budget is exhausted, it returns an approval-routed decision without calling the LLM and fires a `token_budget_exhausted` event to the notification service. See [Section 17](#17-token-budget-system) for full details.

---

## 7. Subsystem B — Code Generation LLM

**File:** [`apps/agent-runtime/src/infrastructure/llm-provider-factory.ts`](apps/agent-runtime/src/infrastructure/llm-provider-factory.ts)

### What it does

When a developer action executes (e.g., `workspace_subagent_spawn`, `workspace_github_issue_fix`), the executor calls `createCodeGenFn()` to get a function that generates the step-by-step implementation plan.

### Factory signature

```typescript
createCodeGenFn(env?: NodeJS.ProcessEnv, profile?: LlmCodeGenProfile): LlmCodeGenFn | undefined
```

Returns `undefined` when no provider is configured. Callers fall back to keyword-based plan inference when undefined.

### Profiles

| Profile | Use case |
|---|---|
| `quality_first` | Initial plan generation (planner call) |
| `cost_balanced` | Fix-attempt generation after test failures (worker call) |
| `speed_first` | Classification / lightweight tasks |

### What the code gen LLM receives

- System prompt: "expert software developer, return ONLY valid JSON array"
- User message: task description + target file paths + current file contents (up to 3,000 chars per file for Anthropic, untruncated for OpenAI-compatible)

### What it returns

```json
[
  {
    "description": "what this step does",
    "actions": [
      { "action": "code_edit_patch", "file_path": "src/foo.ts", "old_text": "exact text", "new_text": "replacement" },
      { "action": "run_tests", "command": "pnpm test" }
    ]
  }
]
```

Allowed action shapes: `code_edit`, `code_edit_patch`, `run_tests`, `run_build`.

### Call parameters

- `max_tokens: 4096`
- `stream: true`
- `temperature: 0`
- Timeout: 120 seconds (`AbortSignal.timeout(120_000)`)

### Streaming early-stop

The response is streamed and the read loop aborts as soon as the outer JSON `[...]` bracket is closed, eliminating any padding tokens the model emits after the valid JSON. This is implemented in `streamJsonArray()` with bracket-balance tracking that correctly handles characters inside string literals.

### Supported providers in this subsystem

Anthropic + all OpenAI-compatible providers (OpenAI, Azure OpenAI, GitHub Models). Google, xAI, Mistral, Together, DeepSeek are not yet supported — `resolveProviderConfig()` falls back to OpenAI-compatible for those.

---

## 8. Subsystem C — Agent Direct Callers

**File:** [`apps/agent-runtime/src/infrastructure/anthropic-caller.ts`](apps/agent-runtime/src/infrastructure/anthropic-caller.ts)

### What it does

22 files across the runtime (16 sales agent modules + task-planner + test-generator + meeting-transcription + speaking-agent + skill-execution-engine × 4 functions) call Anthropic directly to generate domain-specific content. All of these route through `callAnthropic()`, which provides model-deprecation resilience via the registry.

### API

```typescript
callAnthropic(params: {
    tier: 'quality' | 'balanced' | 'speed';
    system?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    maxTokens?: number;
    temperature?: number;
    signal?: AbortSignal;
    apiKey?: string;          // defaults to ANTHROPIC_API_KEY env var
}): Promise<{
    content: AnthropicContentBlock[];
    modelUsed: string;
    usage?: { input_tokens: number; output_tokens: number };
}>
```

A convenience helper `extractText(content)` concatenates all `type: 'text'` blocks into a single string.

### Tier-to-caller mapping

| Tier | Who uses it |
|---|---|
| `quality` | `task-planner.ts` (complex task planning) |
| `balanced` | All 16 sales agent modules, `meeting-transcription.ts`, `speaking-agent.ts` |
| `speed` | `test-generator.ts`, `skill-execution-engine.ts` (4 functions) |

---

## 9. Calling Utilities — streamLLM and callLLMWithTools

Both are exported from `llm-decision-adapter.ts` and used by individual agent modules.

### streamLLM

```typescript
streamLLM(
    provider: RuntimeModelProvider,
    messages: StreamLLMMessage[],
    options?: {
        model?: string;
        maxTokens?: number;
        temperature?: number;   // default: 0.2
        signal?: AbortSignal;
        apiKey?: string;
        baseUrl?: string;
        apiVersion?: string;
    }
): AsyncGenerator<string, void, unknown>
```

Yields string chunks (token fragments) as an async generator. Falls back to `process.env` for all connection parameters when options are omitted. Used by:
- `content-writer/llm-prose-writer.ts` — prose generation
- `technical-writer/llm-enhancer.ts` — document enhancement
- `full-stack-developer/fsd-llm-enricher.ts` — spec enrichment

Supports: all 11 providers. For `mock` and `agentfarm`, returns the literal string `'mock-stream-response'` split into 3 chunks.

### callLLMWithTools

```typescript
callLLMWithTools(
    provider: RuntimeModelProvider,
    messages: Array<{ role: 'user' | 'assistant' | 'system' | 'tool'; content: string; tool_call_id?: string }>,
    tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>,
    options?: LLMWithToolsOptions
): Promise<{
    content: string | null;
    toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
    finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
}>
```

Maps tools to provider-native format:
- **Anthropic:** `tools[].type = 'tool_use'`, `input_schema` for parameters
- **Google:** `functionDeclarations[]` under a `tools[]` array
- **OpenAI-compatible:** `tools[].type = 'function'` with `function.parameters`

Returns parsed tool calls with arguments already JSON-parsed from string. `finishReason: 'error'` is returned (not thrown) when the API call fails, so callers can decide whether to surface or ignore the failure.

---

## 10. Anthropic Model Registry & Auto-Fallback

**Files:**
- [`apps/agent-runtime/src/infrastructure/anthropic-model-registry.ts`](apps/agent-runtime/src/infrastructure/anthropic-model-registry.ts)
- [`apps/agent-runtime/src/infrastructure/anthropic-caller.ts`](apps/agent-runtime/src/infrastructure/anthropic-caller.ts)

### Problem solved

When Anthropic retires a model version (like the dated snapshot `claude-sonnet-4-20250514`), every caller that hardcodes that string gets a `404 model_not_found` error with no recovery. The registry + caller combination solves this without requiring a code deploy.

### Registry — single source of truth

All model names used by Subsystem C are defined in one place:

```typescript
// Built-in chains (ordered: preferred → fallback)
quality:  ['claude-opus-4-7',  'claude-opus-4-5',  'claude-sonnet-4-6']
balanced: ['claude-sonnet-4-6', 'claude-haiku-4-5']
speed:    ['claude-haiku-4-5',  'claude-sonnet-4-6']
```

### Env var override — no code deploy needed

Set a comma-separated fallback chain for any tier:

```
AF_ANTHROPIC_MODEL_QUALITY=claude-opus-4-8,claude-opus-4-7
AF_ANTHROPIC_MODEL_BALANCED=claude-sonnet-5-0,claude-sonnet-4-6
AF_ANTHROPIC_MODEL_SPEED=claude-haiku-4-6,claude-haiku-4-5
```

The first model in the list is tried first. When Anthropic retires a model, simply remove it from the front of the chain — the runtime picks up the change on next restart (or even live if the process re-reads env vars).

### Auto-retry on 404 model_not_found

`callAnthropic()` walks the fallback chain automatically:

1. Try model at index 0
2. `200 OK` → return result, done
3. `404` with `error.type === 'not_found_error'` → log warning, try index 1
4. Any other non-2xx → throw immediately (rate limit, auth error, server error — not a deprecation issue)
5. All models exhausted → throw `AnthropicModelExhaustedError` with the list of tried models

The existing `try/catch` blocks in each caller already handle this error by returning their domain-specific fallback content.

---

## 11. auto Mode — Multi-Provider Failover

**File:** [`apps/agent-runtime/src/llm-decision-adapter.ts`](apps/agent-runtime/src/llm-decision-adapter.ts) — `createAutoResolver()`

When `AF_MODEL_PROVIDER=auto`, all configured providers are tried in a composite-scored order until one succeeds.

### Default provider priority order

Each profile has its own default provider priority (defined directly in code):

| Profile | Default order |
|---|---|
| `quality_first` | `anthropic → deepseek → openai → azure_openai → xai → google → mistral → github_models → together` |
| `speed_first` | `deepseek → together → mistral → google → github_models → xai → openai → azure_openai → anthropic` |
| `cost_balanced` | `deepseek → together → mistral → github_models → google → xai → openai → azure_openai → anthropic` |

Override with env vars:
```
AF_AUTO_PROVIDERS_QUALITY_FIRST=anthropic,openai     # comma-separated
AF_AUTO_PROVIDERS_SPEED_FIRST=deepseek,together,mistral
AF_AUTO_PROVIDERS_COST_BALANCED=deepseek,github_models
```

### Composite routing score

At call time, the provider list is re-sorted by a composite score (lower wins):

```
composite_score = availability_score × 0.6 + quality_penalty × 0.4
```

**Availability score** (5-minute rolling window, max 20 entries per provider):  
`error_rate × 0.7 + (avg_latency_ms / 10,000) × 0.3`

**Quality penalty** (7-day rolling window, from quality tracker):  
`1 - average_quality_score`

**Budget tie-breaker** (when `AF_TOKEN_BUDGET_WARNING_THRESHOLD` is hit):  
Cheaper providers move forward when scores are within 0.0001 of each other.

| Provider group | Cost weight |
|---|---|
| DeepSeek, Together, Mistral, GitHub Models | 0.1 |
| Google, xAI | 0.25 |
| OpenAI, Anthropic, Azure OpenAI | 0.4 |

**DB-backed routing history:**  
After scoring, a DB query (`getRoutingAdvice()`) adjusts provider scores based on the last 7 days of `TaskExecutionRecord` history for the workspace. Score delta: `−0.15` if provider had ≥5 successes, `+0.20` if provider had ≥3 failures. This query has a 200ms timeout; routing continues with the health-based sort if it times out.

### Failover behaviour

- Up to 2 retry attempts per provider before moving on
- **Permanent errors** (auth failure, billing disabled, rate limit) skip the second attempt immediately — retrying the same endpoint cannot recover them
- **Cooldown periods** are applied after failure:
  - `rate_limit` → 5 minutes
  - `provider_unavailable` → 3 minutes
  - `timeout` → 2 minutes
  - `billing_disabled` → 30 minutes
  - `unclassified` → no cooldown (0 ms)
- Cooldown state is persisted to disk (see [Section 27](#27-state-files-written-to-disk)) and loaded on startup
- If `ALLOW_MOCK_FALLBACK=true` and all providers are exhausted/cooling down, falls back to mock resolver

---

## 12. Model Router — Action-Type Overrides

**File:** [`apps/agent-runtime/src/model-router.ts`](apps/agent-runtime/src/model-router.ts)

The model router is an integration point called **before** `processOneTask` to override the workspace-default provider + profile for specific action types.

### Routing table

| Action types | Forced provider | Forced profile | Reason |
|---|---|---|---|
| `code_edit`, `code_edit_patch`, `workspace_generate_test`, `workspace_fix_test_failures`, `workspace_bulk_refactor`, `workspace_autonomous_plan_execute`, `workspace_github_issue_fix`, `workspace_github_review_pr` | `anthropic` | `quality_first` | Code-intensive — requires strongest code model |
| `workspace_security_scan`, `workspace_sast_scan`, `workspace_dependency_audit`, `workspace_architecture_review`, `workspace_performance_profile`, `workspace_threat_model` | `openai` | `quality_first` | Reasoning-intensive — structured analysis |
| `workspace_grep`, `workspace_list_files`, `workspace_read_file`, `workspace_search_symbol`, `workspace_read_logs`, `workspace_tail_logs` | workspace default | `speed_first` | Read-only — cheapest model sufficient |
| everything else | workspace default | workspace default | No override |

### Public API

```typescript
routeModelForTask(
    actionType: string,
    workspaceProvider: ModelProviderKey,
    workspaceProfile: ModelProfileKey,
): ModelRouteDecision    // { provider, profile, reason, overridden: boolean }

resolveModelProfileForTask(
    actionType: string,
    workspaceProfile: ModelProfileKey,
): ModelProfileKey       // convenience wrapper — profile only
```

---

## 13. Task Complexity Engine

**File:** [`apps/agent-runtime/src/llm-decision-adapter.ts`](apps/agent-runtime/src/llm-decision-adapter.ts) — `evaluateTaskComplexity()`

Scores every task independently before the LLM call. The score is used for:
1. Selecting the model profile (quality_first / cost_balanced / speed_first)
2. Deciding whether to include or skip expensive context blocks (simple tasks skip all context)
3. Included in the LLM prompt as `taskComplexity` so the LLM can calibrate its output

**Inputs checked:**
- `action_type` — is it in the high-impact, read-only, or other set?
- `riskLevel` from the heuristic baseline decision
- `complexity` field in the task payload — accepts `'high'`, `'complex'`, `'low'`, `'simple'`
- Length of `prompt` + `summary` + `objective` fields combined
- Length of `initial_plan` array
- `retry_attempt` number in the payload

---

## 14. System Prompt Builder

**File:** [`apps/agent-runtime/src/system-prompt-builder.ts`](apps/agent-runtime/src/system-prompt-builder.ts)

Constructs the final system prompt string for every LLM call in Subsystem A.

### How it works

1. Starts with the role-specific base prompt from `getRoleSystemPrompt()` (`role-system-prompts.ts`)
2. **Persona block:** If `persona` is set AND `isExternalFacing: true`, prepends an identity block:
   ```
   You are {persona.displayName}, an AI {role} working at AgentFarm.
   Your email address is {persona.emailAddress}. Communication style: {persona.communicationStyle}.
   Always append "{persona.disclosureStatement}" to any external-facing message.
   ---
   ```
   Internal classification calls pass `isExternalFacing: false` — the persona block is omitted, saving ~100 tokens per call.
3. **Language instruction:** If `language` is not `'en'`, appends a language instruction block at the END of the prompt (so it takes precedence over any earlier instructions):
   ```
   ---
   LANGUAGE INSTRUCTION: You MUST respond entirely in {language name} ({code}).
   Do not use English unless the user writes to you in English.
   All explanations, code comments, error messages, and summaries must be in {language name}.
   ```

**Supported language codes** with mapped names: `ja` (Japanese), `ko` (Korean), `ar` (Arabic), `hi` (Hindi), `zh` (Chinese), `fr` (French), `de` (German), `es` (Spanish), `pt` (Portuguese). All other codes fall through with the code itself as the name.

### Role-specific base prompts

`role-system-prompts.ts` defines per-role system prompts that encode the mindset, priorities, and constraints of each role so the LLM classifies tasks as a domain specialist would. The DevOps payload schemas (`DEVOPS_PAYLOAD_RULES`) are exported separately and injected into the task prompt on demand — not the system prompt — to save ~6,700 tokens per classification call.

---

## 15. Context Enrichment Pipeline

Before the LLM is called for task classification, the task payload may carry pre-computed context fields. These are assembled by the calling code upstream (workspace scouter, episodic memory service) and attached as `_scout_context`, `_episodic_context`, and `_episodic_person_context`.

### Context fields and their treatment

| Payload field | Content | How it's injected |
|---|---|---|
| `_scout_context` | Codebase structure map built by workspace scout — file tree, key files, conventions | Hoisted to `codebaseContext` key at the top level of the LLM prompt. Cap: 12,000 chars. **Skipped for simple tasks.** |
| `_episodic_context` | Compressed history of recent task outcomes for the workspace | Hoisted to `recentTaskHistory`. Cap: 12,000 chars. **Skipped for simple tasks.** |
| `_episodic_person_context` | Recent task history for the specific user | Hoisted to `personTaskHistory`. Cap: 12,000 chars. **Skipped for simple tasks.** |
| `_memory_context.codeReviewPatterns` | Code review lessons from past PR reviews (string array) | Injected as `learnedWorkspaceRules` |
| `_memory_context.codeReviewPrompt` | Formatted workspace rule prompt string | Injected as `learnedWorkspaceRulePrompt` |
| `_memory_context.approvalRejectionRate` | Number 0–1 — fraction of recent tasks approval-routed | Injected as `agentRejectionRate`. If ≥0.3, LLM is instructed to prefer approval routing. |
| `_memory_context.recentMemories` | Last 3 task outcome records | Summarised as `action → status [connectors]` strings |

Hoisting is critical: these fields can easily exceed the per-string truncation cap (4,000 chars). By extracting them before `truncatePayloadValue()` runs and injecting them as top-level JSON keys, the LLM receives the full content without the `[truncated: N chars]` placeholder.

---

## 16. Prompt Truncation Safeguards

**File:** [`apps/agent-runtime/src/llm-decision-adapter.ts`](apps/agent-runtime/src/llm-decision-adapter.ts)

Two safety limits prevent the classification prompt from exceeding the LLM's context window.

### Per-string limit: 4,000 characters

`truncatePayloadValue()` recursively walks the task payload (depth limit: 4) and replaces any string longer than 4,000 chars with `[truncated: N chars]`. Arrays are capped at 50 elements.

Context fields (`_scout_context`, `_episodic_context`, `_episodic_person_context`) are stripped from the payload before this step to avoid double-representation — they appear at the top level of the prompt in full (up to 12,000 chars each).

### Total prompt limit: 80,000 bytes

After serialising the full prompt to JSON, if the result exceeds 80,000 bytes, the entire `task.payload` is replaced with `{ _truncated: true, _original_size: N }`. The context blocks (`codebaseContext`, `recentTaskHistory`, `personTaskHistory`) are always preserved — they are the most actionable information for routing even when the payload is stripped.

---

## 17. Token Budget System

**File:** [`apps/agent-runtime/src/llm-decision-adapter.ts`](apps/agent-runtime/src/llm-decision-adapter.ts) — `withTokenBudgetGuard()`

A daily token budget can be configured per `tenantId:workspaceId:botId` scope.

### Thresholds

| Threshold | Env var | Default | Behaviour |
|---|---|---|---|
| Warning | `AF_TOKEN_BUDGET_WARNING_THRESHOLD` | `0.8` (80%) | Logs warning to stdout; fires `token_budget_warning` event to notification service; continues execution; adds `_budget_decision: 'warning'` to response metadata |
| Critical | `AF_TOKEN_BUDGET_CRITICAL_THRESHOLD` | `0.9` (90%) | Logs critical to stdout; fires `token_budget_warning` event; continues execution |
| Exhausted | — | 100% | **Blocks the LLM call entirely**; returns an approval-routed heuristic decision with `_budget_denial_reason: 'token_budget_exhausted'`; fires `token_budget_exhausted` event |

### Configuration

```
AF_TOKEN_BUDGET_DAILY_LIMIT=1000000      # token count; 0 or unset = disabled
AF_TOKEN_BUDGET_WARNING_THRESHOLD=0.8   # fraction 0–1
AF_TOKEN_BUDGET_CRITICAL_THRESHOLD=0.9  # fraction 0–1
```

### State persistence

Token consumption is persisted to JSON on every call (see [Section 27](#27-state-files-written-to-disk)). The state resets automatically at midnight UTC — each scope's count is tagged with the ISO date string `YYYY-MM-DD` and a new day starts fresh.

### Budget alert notifications

`budget-alert-emitter.ts` fires a `POST /v1/notifications/log` to the API gateway on warning and exhausted events. The gateway URL defaults to `http://localhost:3000` (`API_GATEWAY_URL` env var). The alert also logs to stdout so it is visible even when the gateway is unreachable. If `BILLING_ALERT_EMAIL` is set, it is included in the notification payload for the gateway to forward.

---

## 18. Quality Tracker

**File:** [`apps/agent-runtime/src/llm-quality-tracker.ts`](apps/agent-runtime/src/llm-quality-tracker.ts)

Tracks a rolling quality score per `(provider, action_type)` pair. The score feeds into the `auto` mode provider sorting (40% weight) as `quality_penalty = 1 − average_quality_score`.

### Recording signals

```typescript
recordQualitySignal({
    provider: 'anthropic',
    actionType: 'workspace_subagent_spawn',
    signal: 'action_succeeded',     // or a numeric score
    source: 'runtime_outcome',      // runtime_outcome | user_feedback | evaluator | manual
    weight: 1,                      // optional multiplier
    taskId: '...',
    correlationId: '...',
})
```

### Signal base scores

| Signal | Base score |
|---|---|
| `action_succeeded` | 0.9 |
| `action_approved` | 0.8 |
| `action_retried` | 0.45 |
| `action_escalated` | 0.35 |
| `action_rejected` | 0.2 |

When a numeric `score` field is provided directly, the base score lookup is skipped. The `weight` parameter scales the delta from 0.5: `final_score = 0.5 + (base_score − 0.5) × weight`.

### Retention

- Window: 7 days (604,800,000 ms)
- Max samples per `(provider, action_type)` key: 100
- Max total events in the event log: 500

### Querying

```typescript
getProviderQualityPenalty(provider, actionType)  // 0–1 — lower is better
getProviderQualityScore(provider)                // 0–1 — higher is better
listQualitySignals({ provider, actionType, source, limit })
getQualitySignalSummary({ provider, actionType })
getQualitySignalSnapshot()
```

---

## 19. Routing History Advisor

**File:** [`apps/agent-runtime/src/routing-history-advisor.ts`](apps/agent-runtime/src/routing-history-advisor.ts)

Adjusts `auto` mode provider scores based on actual task outcome history stored in PostgreSQL.

### How it works

1. Queries `TaskExecutionRecord` grouped by `modelTier` and `outcome` for the workspace, last 7 days
2. Applies score deltas:
   - Provider with ≥5 successes for a tier: `−0.15` (prefer it)
   - Provider with ≥3 failures for a tier: `+0.20` (deprioritise it)
3. Returns a `Map<provider, delta>` that `createAutoResolver()` applies before dispatching
4. **200ms query timeout** — if the DB is slow, routing continues with the health-based sort unchanged
5. Never throws — returns empty Map on any error

---

## 20. Loop Learning Store

**File:** [`apps/agent-runtime/src/loop-learning-store.ts`](apps/agent-runtime/src/loop-learning-store.ts)

An in-process (in-memory) store that records successful skill execution sequences across autonomous loop runs. The store is exposed as a singleton `globalLearningStore`.

### What it stores

```typescript
{
    pattern_id: string,
    input_fingerprint: string,       // workspace key used as lookup key
    successful_sequence: string[],   // e.g. ['workspace_grep', 'code_edit_patch', 'run_tests']
    success_rate: number,            // 0.0–1.0
    use_count: number,
    last_used: number,               // epoch ms
    created_at: number,
}
```

### How it feeds the LLM

In `createTaskPrompt()`, if a pattern exists for the workspace key AND `success_rate >= 0.7`, it is injected into the prompt as `learnedSkillSequence`:

```json
{
  "learnedSkillSequence": {
    "sequence": ["workspace_grep", "code_edit_patch", "run_tests"],
    "successRate": 0.87,
    "useCount": 12
  }
}
```

This gives the LLM a proven path to follow instead of inferring from scratch.

### Lifecycle

- `recordSuccess(fingerprint, sequence)` — creates or increments an existing pattern; success_rate increases by 0.1 per success (capped at 1.0)
- `recordFailure(fingerprint)` — decreases success_rate by 0.1 (floor 0.0)
- `pruneOldPatterns(maxAgeDays)` — removes patterns older than N days with zero use count; default: 30 days
- State is **in-memory only** — does not survive process restarts

---

## 21. Task Intelligence Memory

**File:** [`apps/agent-runtime/src/task-intelligence-memory.ts`](apps/agent-runtime/src/task-intelligence-memory.ts)

A persistent file-based store (JSON) that records workspace-level execution history and coding conventions. The data is injected into every LLM classification prompt as `workspaceConventions` and `trajectoryHints`.

### What it records

**Trajectories** (keyed by `workspaceKey:actionType`):
- Success and failure counts
- Risk level
- Last execution status

**Conventions** (keyed by `workspaceKey`):
- Package manager (`pnpm` / `npm` / `yarn`)
- Test command (e.g., `pnpm test`)
- Build command (e.g., `pnpm build`)
- Import style (`esm` / `cjs` / `mixed`)

**Task records** (keyed by `taskId`):
- Description, complexity, estimated minutes
- Actual minutes (for calibrating future estimates)

### How conventions are detected

- Package manager: detected from `test_command` or `build_command` fields in the task payload
- Import style: detected from `target_files` extensions (`.mjs` → ESM, `.cjs` → CJS, both → mixed)

### Storage path

Default: `<os.tmpdir()>/agentfarm-task-intelligence-memory.json`  
Override: `AF_TASK_INTELLIGENCE_PATH` env var

---

## 22. Code Review Learning

**File:** [`apps/agent-runtime/src/code-review-learning.ts`](apps/agent-runtime/src/code-review-learning.ts)

Ingests PR review comments from GitHub webhooks and stores them as `ReviewLesson` objects. Before the agent writes new code, relevant lessons are retrieved and injected into the LLM prompt as workspace coding rules.

### Loop

```
Agent creates PR
→ Reviewer leaves comments
→ GitHub webhook fires → ingestReviewFeedback()
→ Lessons stored in long-term memory (via memory-service)
→ Next task: getRelevantLessons() called before classification prompt
→ Injected as learnedWorkspaceRules in the task prompt
→ Agent follows workspace conventions from day one
```

### Lesson categories (heuristic classifier — no LLM required)

| Category | Detected when comment contains |
|---|---|
| `security` | sql injection, xss, auth, sanitize, validate, escape, csp, token, secret, password, encrypt |
| `performance` | performance, slow, memory leak, O(n), cache, memoize, debounce, throttle |
| `architecture` | architecture, coupling, dependency, interface, abstraction, pattern, design, solid |
| `testing` | test, spec, coverage, mock, stub, assert, expect, vitest, jest |
| `naming` | name, rename, variable, function, class, method, identifier |
| `style` | const, var, let, semicolon, indent, format, camelCase, snake_case (default fallback) |

### Prompt injection format

Up to 10 lessons are injected per prompt call:
```
Workspace coding rules (from past PR reviews):
- [style] don't use var, use const
- [security] always validate inbound payloads at service boundaries
```

---

## 23. Episodic Summarizer

**File:** [`apps/agent-runtime/src/infrastructure/episodic-summarizer.ts`](apps/agent-runtime/src/infrastructure/episodic-summarizer.ts)

Compresses large episodic context blocks before they are injected into classification prompts. Episodic context can grow to thousands of characters for active workspaces; injecting it raw on every call is expensive.

### How it works

1. If `raw.length <= 2,000 chars` — return as-is (no compression needed)
2. Hash the raw context (SHA-256, first 16 hex chars) and check Redis for a cached summary
3. **Cache hit** — return cached summary (TTL: 15 minutes, prefix: `af:ep_sum:v1:{workspaceId}:{hash}`)
4. **Cache miss** — call `claude-haiku-4-5` (`AF_ANTHROPIC_MODEL_SPEED_FIRST` override accepted) to summarise in ≤300 words (max_tokens: 400, timeout: 8 seconds)
5. Store result in Redis and return
6. If Anthropic key is missing or the call fails — truncate to first 2,000 chars

### Cost profile

~$0.0003 per compression call (Haiku speed tier). Since results are cached for 15 minutes, the cost only recurs when new task outcomes arrive for the workspace.

---

## 24. Batch Classifier

**File:** [`apps/agent-runtime/src/infrastructure/batch-classifier.ts`](apps/agent-runtime/src/infrastructure/batch-classifier.ts)

Classifies multiple tasks from the same tenant/agent in a single LLM call, rather than N separate calls. This is useful when the trigger service receives a burst of similar tasks (e.g., 10 files to patch from a webhook).

### When to use

Call `classifyTasksBatch()` before dispatching tasks to `processOneTask()`. All tasks in the batch must share the same `tenantId` and `botId`.

### How it works

1. Sends all tasks as a JSON array in a single prompt
2. Uses `speed_first` model (Haiku for Anthropic, gpt-4o-mini for OpenAI-compatible)
3. **Prompt caching** on Anthropic: the system prompt gets `cache_control: { type: 'ephemeral' }` — with N tasks, the cache hit saves N−1 system prompt ingestions
4. Parses the JSON array response, matching decisions back to task IDs
5. Tasks with no LLM result fall back to the heuristic decision
6. Returns a `Map<taskId, BatchClassifiedTask>` with either `source: 'llm_batch'` or `source: 'heuristic_fallback'`

### Returns routing decisions only

Batch classification does not return `payloadOverrides` or `initial_plan`. For plan generation, still call `processOneTask()` per task.

---

## 25. Anthropic Prompt Caching

When the provider is `anthropic`, the task decision adapter enables the Anthropic prompt caching beta via the `anthropic-beta: prompt-caching-2024-07-31` header. The static system prompt is sent as a cacheable block:

```json
{
  "type": "text",
  "text": "<system_prompt_content>",
  "cache_control": { "type": "ephemeral" }
}
```

**Cache TTL:** 5 minutes from last use.  
**Cost on cache hit:** 10% of normal input token price for cached tokens.  
**Cost on cache write:** 125% of normal input token price (to write to cache).

Token tracking accounts for all three categories separately:
- `input_tokens` — uncached prompt tokens (billed at 100%)
- `cache_creation_input_tokens` — tokens written to cache (billed at 125%)
- `cache_read_input_tokens` — tokens read from cache (billed at 10%)

All three are summed into `promptTokens` for budget tracking. This ensures the daily token budget correctly reflects the weighted cost even when cache reads dominate.

The batch classifier also enables prompt caching for its system prompt, multiplying the cache benefit across all tasks in a batch.

---

## 26. Provider Health Scoring & Cooldowns

**File:** [`apps/agent-runtime/src/llm-decision-adapter.ts`](apps/agent-runtime/src/llm-decision-adapter.ts)

### Health score (in-process, per provider)

Rolling window: 5 minutes, max 20 entries.

```
health_score = error_rate × 0.7 + (avg_latency_ms / 10,000) × 0.3
```

Lower is better (0 = perfect health). Recorded after every API call: `recordProviderCall(provider, latencyMs, success)`.

### Cooldown store (persisted to disk)

After a failed call, `classifyFailoverReason()` reads the error message to identify the failure type:
- HTTP 429 or `rate_limit` → `rate_limit`
- HTTP 401/403 or `auth` → `auth_failure`
- HTTP 402 or `billing` → `billing_disabled`
- `timeout` or `aborted` → `timeout`
- HTTP 500/502/503/504 or `unavailable` → `provider_unavailable`
- anything else → `unclassified`

Cooldown durations per reason:
| Reason | Duration |
|---|---|
| `rate_limit` | 5 minutes |
| `provider_unavailable` | 3 minutes |
| `timeout` | 2 minutes |
| `billing_disabled` | 30 minutes |
| `auth_failure` | 0 — not put on cooldown (permanent error) |
| `unclassified` | 0 — not put on cooldown |

Cooldown state is loaded from disk on first call (`cooldownStateLoaded` flag) and persisted on every change. Expired cooldowns are pruned before loading them into the in-process map.

### Observability endpoints

```typescript
getProviderHealthScores()  // { provider: { avgLatencyMs, errorRate, score, sampleCount } }
getProviderCooldownState() // { provider: { reasonCode, cooldownUntil } }
resetProviderRoutingMemory()  // clear health + cooldown + routing history (in-process)
resetProviderRoutingState()   // same + persist empty cooldown state to disk
```

---

## 27. State Files Written to Disk

The runtime writes three JSON state files during operation:

| File | Default path | Env var override | Content |
|---|---|---|---|
| Cooldown state | `.agent-runtime/provider-cooldowns.json` | `AF_PROVIDER_COOLDOWN_STATE_PATH` | Provider cooldown entries: `{ version, providers: { [provider]: { reasonCode, cooldownUntil, updatedAt } } }` |
| Token budget state | `.agent-runtime/token-budget-state.json` | `AF_TOKEN_BUDGET_STATE_PATH` | Daily token consumption: `{ version, byScope: { [scope]: { day, consumedTokens, updatedAt } } }` |
| Task intelligence | `<tmpdir>/agentfarm-task-intelligence-memory.json` | `AF_TASK_INTELLIGENCE_PATH` | Workspace trajectories, conventions, task records (see Section 21) |

These files survive process restarts. Cooldown state ensures a provider that was rate-limited before a restart does not immediately get hammered again on startup. Token budget state ensures the daily limit is enforced across restarts.

---

## 28. Complete Environment Variable Reference

Both `AF_` and `AGENTFARM_` prefixes are accepted for every variable. `AF_` takes precedence.

### Provider selection

| Variable | Values | Default |
|---|---|---|
| `AF_MODEL_PROVIDER` | `openai`, `azure_openai`, `github_models`, `anthropic`, `google`, `xai`, `mistral`, `together`, `deepseek`, `auto`, `mock`, `agentfarm` | `agentfarm` |

### API keys and endpoints

| Variable | Required for |
|---|---|
| `AF_ANTHROPIC_API_KEY` | Anthropic provider |
| `AF_ANTHROPIC_BASE_URL` | Anthropic provider (default: `https://api.anthropic.com`) |
| `AF_ANTHROPIC_API_VERSION` | Anthropic provider (default: `2023-06-01`) |
| `AF_OPENAI_API_KEY` | OpenAI provider |
| `AF_OPENAI_BASE_URL` | OpenAI provider (default: `https://api.openai.com/v1`) |
| `AF_AZURE_OPENAI_API_KEY` | Azure OpenAI provider |
| `AF_AZURE_OPENAI_ENDPOINT` | Azure OpenAI provider |
| `AF_AZURE_OPENAI_DEPLOYMENT` | Azure OpenAI provider |
| `AF_AZURE_OPENAI_API_VERSION` | Azure OpenAI provider (default: `2024-06-01`) |
| `AF_GITHUB_MODELS_API_KEY` | GitHub Models provider |
| `AF_GITHUB_MODELS_BASE_URL` | GitHub Models provider (default: `https://models.inference.ai.azure.com`) |
| `AF_GOOGLE_API_KEY` | Google provider |
| `AF_GOOGLE_BASE_URL` | Google provider (default: `https://generativelanguage.googleapis.com/v1beta`) |
| `AF_XAI_API_KEY` | xAI provider |
| `AF_XAI_BASE_URL` | xAI provider (default: `https://api.x.ai/v1`) |
| `AF_MISTRAL_API_KEY` | Mistral provider |
| `AF_MISTRAL_BASE_URL` | Mistral provider (default: `https://api.mistral.ai/v1`) |
| `AF_TOGETHER_API_KEY` | Together provider |
| `AF_TOGETHER_BASE_URL` | Together provider (default: `https://api.together.xyz/v1`) |
| `AF_DEEPSEEK_API_KEY` | DeepSeek provider |
| `AF_DEEPSEEK_BASE_URL` | DeepSeek provider (default: `https://api.deepseek.com`) |

### Model selection — per provider, per profile

Pattern: `AF_<PROVIDER>_MODEL_<PROFILE>` where PROFILE is `QUALITY_FIRST`, `COST_BALANCED`, `SPEED_FIRST`, or `CUSTOM`.

```
AF_ANTHROPIC_MODEL                         # base model for all profiles
AF_ANTHROPIC_MODEL_QUALITY_FIRST           # override quality tier
AF_ANTHROPIC_MODEL_COST_BALANCED           # override balanced tier
AF_ANTHROPIC_MODEL_SPEED_FIRST             # override speed tier
AF_ANTHROPIC_MODEL_CUSTOM                  # custom tier model

AF_OPENAI_MODEL                            # base
AF_OPENAI_MODEL_QUALITY_FIRST
AF_OPENAI_MODEL_COST_BALANCED
AF_OPENAI_MODEL_SPEED_FIRST
AF_OPENAI_MODEL_CUSTOM

# Same pattern for: GITHUB_MODELS, GOOGLE, XAI, MISTRAL, TOGETHER, DEEPSEEK
# Azure: AF_AZURE_OPENAI_DEPLOYMENT_QUALITY_FIRST / _COST_BALANCED / _SPEED_FIRST
```

### Anthropic model registry (Subsystem C fallback chains)

```
AF_ANTHROPIC_MODEL_QUALITY=claude-opus-4-7,claude-opus-4-5,claude-sonnet-4-6
AF_ANTHROPIC_MODEL_BALANCED=claude-sonnet-4-6,claude-haiku-4-5
AF_ANTHROPIC_MODEL_SPEED=claude-haiku-4-5,claude-sonnet-4-6
```

### auto mode provider priority

```
AF_AUTO_PROVIDERS_QUALITY_FIRST=anthropic,openai     # comma-separated
AF_AUTO_PROVIDERS_SPEED_FIRST=deepseek,together
AF_AUTO_PROVIDERS_COST_BALANCED=deepseek,github_models
AF_AUTO_PROVIDERS_CUSTOM=anthropic
```

### Timeout

```
AF_LLM_TIMEOUT_MS=5000        # decision LLM timeout; max 20,000ms; default 5,000ms
```

### Token budget

```
AF_TOKEN_BUDGET_DAILY_LIMIT=1000000        # token count; 0 = disabled
AF_TOKEN_BUDGET_WARNING_THRESHOLD=0.8      # fraction 0–1; default 0.8
AF_TOKEN_BUDGET_CRITICAL_THRESHOLD=0.9     # fraction 0–1; default 0.9
```

### State file paths

```
AF_PROVIDER_COOLDOWN_STATE_PATH=.agent-runtime/provider-cooldowns.json
AF_TOKEN_BUDGET_STATE_PATH=.agent-runtime/token-budget-state.json
AF_TASK_INTELLIGENCE_PATH=/tmp/agentfarm-task-intelligence-memory.json
```

### Budget alerts

```
API_GATEWAY_URL=http://localhost:3000    # where to post notification events
BILLING_ALERT_EMAIL=ops@example.com     # included in budget alert payloads
```

### Miscellaneous

```
AF_SYNTHESIS_MODEL=claude-haiku-4-5     # model for autonomous-coding-loop synthesis
SAST_LLM_MODEL=gpt-4o-mini             # model for SAST semantic analysis
LLM_MODEL=llama3                       # model for chat-service (legacy)
MOCK_LLM_DELAY_MS=0                    # artificial delay in mock resolver
ALLOW_MOCK_FALLBACK=true               # fall back to mock if all auto providers fail
```

---

## File Map

| File | Purpose |
|---|---|
| `llm-decision-adapter.ts` | Subsystem A (decision LLM) — all 11 provider resolvers, auto mode, token budget guard, streamLLM, callLLMWithTools |
| `model-router.ts` | Action-type-to-provider routing overrides |
| `infrastructure/llm-provider-factory.ts` | Subsystem B (code generation LLM) — factory function |
| `infrastructure/anthropic-model-registry.ts` | Tier → fallback chain resolution; env var overrides |
| `infrastructure/anthropic-caller.ts` | Subsystem C wrapper — auto-retry on model_not_found |
| `infrastructure/batch-classifier.ts` | Multi-task batch classification in one LLM call |
| `infrastructure/episodic-summarizer.ts` | Redis-cached episodic context compression (Haiku) |
| `system-prompt-builder.ts` | System prompt assembly — persona block + language instruction |
| `role-system-prompts.ts` | Per-role base prompts + DevOps payload schemas |
| `llm-quality-tracker.ts` | Rolling quality score per (provider, action_type) |
| `llm-context-hoisting.ts` | Test coverage for context field hoisting logic |
| `routing-history-advisor.ts` | DB-backed provider score adjustments from task history |
| `loop-learning-store.ts` | In-process learned skill sequence store |
| `task-intelligence-memory.ts` | Persistent workspace conventions + trajectory hints |
| `code-review-learning.ts` | PR review lesson ingestion + prompt injection |
| `budget-alert-emitter.ts` | Token budget warning/exhausted notification events |
