# Quality Gates

Seven complementary mechanisms that prevent false completions, validate output correctness, reduce LLM context costs, improve output quality through parallel sampling, enable continuous self-improvement, and recover long-running tasks from mid-run failures. Inspired by the MiMo-Code open-source framework, adapted for AgentFarm's multi-tenant architecture.

---

## 1. Goal Judge

**File:** `apps/agent-runtime/src/goal-judge.ts`

### Purpose

After a task reports `status: 'success'`, an independent LLM call reads the task spec alongside the agent's output and returns a structured verdict: satisfied, not-yet, or impossible. This catches "optimistic stops" — agents that mark a task complete before the actual objective is met.

### How It Works

```
Task completes (status: 'success')
        ↓
GoalJudge.evaluate(spec, agentOutput)
        ↓
  {ok, confidence, reason, impossible?}
        ↓
  ok=true + confidence≥threshold → accept
  ok=false + impossible          → mark ABANDONED, surface reason
  ok=false                       → re-queue with judge feedback injected
```

The judge runs as a **separate, cold LLM call** with no shared context from the working agent. This is intentional — a second opinion only has value if it isn't anchored to the same reasoning chain.

### Verdict Schema

```typescript
type GoalVerdict = {
  ok: boolean           // true = goal satisfied, false = not yet or impossible
  confidence: number    // 0.0–1.0; below CONFIDENCE_THRESHOLD triggers re-queue
  reason: string        // must quote evidence from agentOutput when ok=true
  impossible?: boolean  // true = goal is structurally unreachable; stop retrying
}
```

### Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `AF_GOAL_JUDGE_ENABLED` | `false` | Enable/disable the judge |
| `AF_GOAL_JUDGE_MODEL` | `claude-haiku-4-5-20251001` | Model for judge calls (cheaper than worker) |
| `AF_GOAL_JUDGE_CONFIDENCE_THRESHOLD` | `0.7` | Min confidence to accept as satisfied |
| `AF_GOAL_JUDGE_MAX_REQUEUE` | `2` | Max re-queues before forced stop |

### Integration Point

Called from `execution-engine.ts` → `processApprovedTask` and `processDeveloperTask` after a successful result, before `recordEpisode`. Returns the original result unchanged when judge is disabled or on any error (fail-safe, never blocks execution).

### Which Tasks Are Judged

- All tasks where `payload.goal_spec` is set (explicit spec string)
- Falls back to `payload.summary` or `payload.description` when no explicit spec
- Skipped for: read-only action types (`code_read`, `workspace_read_file`, etc.), tasks with `payload.skip_goal_judge = true`

---

## 2. Completion Gate

**File:** `apps/agent-runtime/src/completion-gate.ts`

### Purpose

Before a task is marked complete, the Completion Gate checks the DB for any sub-tasks or child actions that are still open. If the agent self-reports success but open sub-tasks remain, the gate re-queues with a structured nudge listing the incomplete items.

This is the "DB truth beats self-report" pattern: the task DB is the authoritative source, not what the agent says in its output.

### How It Works

```
Agent reports success
        ↓
CompletionGate.check(taskId, tenantId, workspaceId)
        ↓
  Queries AgentTask table for non-terminal children
        ↓
  Empty → pass through (accept success)
  Has open children → build reentry text → re-queue task
        ↓
  Re-queue cap (MAX_REENTRY=2) reached → downgrade to 'partial'
```

### Reentry Nudge Format

When open children exist, the reentry text injected into the re-queued payload looks like:

```
You reported completion, but these sub-tasks are still open:
- T1.2 (in_progress): Write unit tests for auth endpoint
- T1.3 (open): Update API documentation

For EACH: complete the work, then mark it done or abandoned.
Then re-submit your result.
```

### Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `AF_COMPLETION_GATE_ENABLED` | `false` | Enable/disable the gate |
| `AF_COMPLETION_GATE_MAX_REENTRY` | `2` | Max re-queues before downgrade to 'partial' |

### Integration Point

Called from `execution-engine.ts` after `executeTaskWithRetries` returns `status: 'success'`, before the result is returned to the caller. No DB write required — reads `AgentTask` where `parentTaskId = taskId AND status NOT IN ('done','abandoned','cancelled')`.

### Task Status Semantics

Only these statuses are considered "open" for gate purposes:
- `todo` — not started
- `in_progress` — started but not finished
- `blocked` — waiting (still incomplete)

These are excluded (terminal):
- `done`, `abandoned`, `cancelled`, `failed`

---

## 3. Microcompact

**File:** `apps/agent-runtime/src/microcompact.ts`

### Purpose

After Headroom compresses a conversation (lossy summarization), Microcompact makes a complementary pass: it finds tool-call results in the tail whose **output is regeneratable** and replaces them with a lightweight placeholder. This recovers 10–25K tokens per session without losing any semantic state.

The key insight: if an agent ran `read_file("src/auth.ts")` 20 turns ago, the file content in that tool result is regeneratable on demand — the agent can re-read the file. Storing 3,000 tokens of file content in every compressed context is waste.

### Regeneratable vs. State-Bearing

| Tool result type | Strategy | Rationale |
|-----------------|----------|-----------|
| `workspace_read_file` | Compact → placeholder | File content regeneratable |
| `workspace_grep` | Compact → placeholder | Search results regeneratable |
| `workspace_list_files` | Compact → placeholder | Directory listing regeneratable |
| `workspace_run_tests` | Compact → placeholder | Test output regeneratable |
| `code_read` | Compact → placeholder | Code content regeneratable |
| `web_research` | Compact → placeholder | Research regeneratable |
| Task decisions | **Keep** | Route/risk classification carries policy state |
| Approval outcomes | **Keep** | Approval grants are non-regeneratable |
| Connector results | **Keep** | External system responses carry state |
| Error messages | **Keep** | Error context required for retry logic |

### Placeholder Format

Compacted tool results are replaced with:
```
[Compacted: workspace_read_file result — re-invoke to restore content]
```

The tool name is preserved so the agent knows what was compacted and can re-invoke if needed.

### When Microcompact Runs

Microcompact runs **after** Headroom compression, not instead of it. The sequence is:

```
Context approaches token limit
        ↓
Headroom.compress() — summarizes old turns (lossy)
        ↓
Microcompact.compact() — clears regeneratable tool outputs (lossless at semantic level)
        ↓
Net savings: Headroom savings + Microcompact savings
```

### Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `AF_MICROCOMPACT_ENABLED` | `false` | Enable/disable microcompact |
| `AF_MICROCOMPACT_MIN_SAVINGS` | `500` | Minimum tokens saved to apply (avoids no-op runs) |

### Integration Point

Exported as `microcompact(messages, model)` — takes OpenAI-format messages, returns compacted messages + stats. Called from the same sites as `compressOpenAiMessages` in `headroom-compress.ts`.

---

## 4. Token-Budgeted RAG

**File:** `apps/agent-runtime/src/agents/shared/rag-context-limiter.ts`

### Purpose

Every agent retriever assembles a `## Context` block from three parallel paths (prior work, templates, lessons). Without a budget, a workspace with thousands of prior cases can produce a context block exceeding 20,000 tokens — consuming most of the model's working window before the task prompt even begins.

The RAG context limiter caps the assembled context block at a character limit and trims at clean section boundaries so the model always receives complete sections, never a heading without content.

### How It Works

```
build*RagContext() assembles contextBlock from 3 paths
        ↓
applyRagContextBudget(contextBlock, maxChars?)
        ↓
  within budget → return unchanged
  over budget   → trim at last \n---\n boundary
                  append "(additional context trimmed for token budget)"
        ↓
contextBlock injected into system prompt
```

Trimming at section boundaries (`\n---\n`) means the model always receives semantically complete sections. A degenerate block with a single oversized section is hard-truncated at the character limit as a fallback.

### Configuration

| Env Var | Default | Description |
|---|---|---|
| `AF_RAG_CONTEXT_MAX_CHARS` | `8000` | Max chars for the assembled RAG context block (≈2000 tokens) |

Set to a higher value for models with larger context windows; lower for cost-sensitive deployments.

### Stats

`applyRagContextBudgetWithStats(contextBlock, maxChars?)` returns:

```ts
{
  contextBlock: string;      // trimmed (or unchanged) block
  wasTrimmed: boolean;       // true if content was dropped
  originalChars: number;     // chars before trimming
  finalChars: number;        // chars after trimming
}
```

Used by retrievers that want to log trimming events for observability.

### Integration

All 16 agent RAG retrievers call `applyRagContextBudget()` at the end of `build*RagContext()`. Adding a new retriever: import from `../shared/rag-context-limiter.js` and wrap the final context block assembly.

```ts
import { applyRagContextBudget } from '../shared/rag-context-limiter.js';

// ...assemble sections...
return {
    contextBlock: sections.length > 0
        ? applyRagContextBudget(`## MyAgent Context\n\n${sections.join('\n---\n\n')}`)
        : '',
};
```

---

## 5. Dream/Distill

**File:** `apps/agent-runtime/src/dream-distill.ts`

### Purpose

After a task completes successfully and passes Goal Judge verification, Dream/Distill makes a fire-and-forget LLM call to extract a generalizable lesson from the interaction. The lesson is written to long-term memory (`/v1/memory/patterns`) where all 16 agent RAG retrievers can retrieve it on future runs.

This is the "self-reflection" layer: agents learn not just from human feedback (the flywheel) but from their own successful completions. Over time, a workspace accumulates a library of distilled best-practices specific to its domain and working style.

### How It Works

```
GoalJudge returns { action: 'accept' }
        ↓
distillLesson({ payload, agentOutput, workspaceId, tenantId, taskId })
        ↓ (fire-and-forget — result never awaited)
  Anthropic Haiku → extract generalizable lesson
        ↓
  POST /v1/memory/patterns
    pattern: dream:{actionType}:{workspaceId}:{uuid}
    confidence: 0.65
        ↓
  RAG retrievers surface lesson on future runs
```

The LLM is prompted to produce a two-sentence reusable lesson — not a summary of what happened, but a generalizable principle that would help the same agent handle similar tasks better in the future.

### Configuration

| Env Var | Default | Description |
|---|---|---|
| `AF_DREAM_DISTILL_ENABLED` | `false` | Enable/disable dream/distill |
| `AF_DREAM_DISTILL_MODEL` | `claude-haiku-4-5-20251001` | Cheap model for lesson extraction |

Read-only action types (`code_read`, `workspace_read_file`, etc.) are skipped — no lesson value in read operations.

### Lesson Schema

```ts
{
  pattern: string;       // dream:{actionType}:{workspaceId}:{uuid}
  summary: string;       // two-sentence generalizable lesson from the LLM
  confidence: number;    // always 0.65 (lower than human-validated lessons at 0.75)
  observedCount: number; // always 1
  lastSeen: string;      // ISO timestamp
  metadata: {
    sourceTaskId: string;
    actionType: string;
    workspaceId: string;
    tenantId: string;
    distilledAt: string;
  }
}
```

### Integration Point

Called fire-and-forget from `execution-engine.ts` after `evaluateGoal` returns `{ action: 'accept' }`. Errors are swallowed — Dream/Distill never blocks task completion or return value.

```ts
// fire-and-forget — never awaited, never throws
distillLesson({ payload: taskWithAuditContext.payload, agentOutput, workspaceId, tenantId, taskId: task.taskId })
    .catch(() => {});
```

---

## 6. Max Mode

**File:** `apps/agent-runtime/src/max-mode.ts`

### Purpose

For tasks where output quality matters more than cost, Max Mode runs N parallel LLM candidates for the same task and lets Goal Judge score each one. The highest-scoring successful candidate is returned. Failed candidates are discarded.

The key insight: running three independent LLM chains for the same task and picking the best one is cheaper and faster than asking a human to review every output, yet dramatically improves the hit rate on complex tasks.

### How It Works

```
executeTaskWithRetries called N times in parallel
        ↓
Promise.allSettled([candidate1, candidate2, ... candidateN])
        ↓
  Filter for status: 'success' results
        ↓
  0 successes → return first settled result (any status)
  1 success   → return it directly (no scoring needed)
  N successes → score each via judgeScore(spec, output)
                pick highest-confidence candidate
        ↓
Return winning result to quality gates pipeline
```

Scoring uses `judgeScore()` from `goal-judge.ts` — the same Haiku call as the Goal Judge, but here used purely to produce a confidence number rather than a pass/fail verdict. If the judge is unavailable (no API key), Max Mode falls back to picking the candidate with the longest `actionOutput` as a heuristic proxy for effort.

### Configuration

| Env Var | Default | Description |
|---|---|---|
| `AF_MAX_MODE_ENABLED` | `false` | Enable/disable Max Mode |
| `AF_MAX_MODE_CANDIDATES` | `3` | Number of parallel candidates to run |

**Cost note:** Max Mode multiplies LLM cost by N. At N=3, a task that normally costs $0.01 costs $0.03. Enable only for high-value tasks or workspaces where output quality justifies the cost.

### Skip Conditions

Max Mode is skipped (single candidate path taken) when:
- `AF_MAX_MODE_ENABLED` is not `true`
- `payload.skip_max_mode = true`
- Read-only action types (`code_read`, `workspace_read_file`, `workspace_list_files`, `workspace_grep`, `workspace_scout`, etc.) — no quality gain from multiple parallel reads

### Integration Point

Called from `execution-engine.ts` in place of the single `executeTaskWithRetries` call when Max Mode is enabled. The quality gates pipeline (CompletionGate → GoalJudge → Dream/Distill) runs on the winning candidate result, exactly as in normal mode.

```ts
import { runMaxMode, isMaxModeEnabled, getMaxModeCandidates } from './max-mode.js';
import { judgeScore, resolveSpec } from './goal-judge.js';

const spec = resolveSpec(taskWithAuditContext.payload);
const result = isMaxModeEnabled() && !shouldSkipMaxMode(payload)
    ? await runMaxMode(
          () => executeTaskWithRetries(...),
          (output) => judgeScore(spec, output),
          getMaxModeCandidates(),
      )
    : await executeTaskWithRetries(...);
```

---

## 7. Structured Checkpoints

**File:** `apps/agent-runtime/src/checkpoint.ts`

### Purpose

Long-running agent tasks (e.g., a developer implementing a large feature across many files) can run for tens of minutes. If the agent is requeued by the Completion Gate or Goal Judge, the next run starts cold with no memory of what was already done.

Structured Checkpoints save the agent's partial output after each requeue and inject it back as context at the start of the next run. The agent sees "here's what you produced before — continue from here" rather than starting from scratch.

### How It Works

```
Task runs → status: 'success'
        ↓
CompletionGate or GoalJudge → requeue
        ↓
saveCheckpoint({ taskId, stepIndex, partialOutput, actionType, savedAt })
  stored in Redis with 24h TTL
        ↓
Next task run starts
        ↓
loadCheckpoint(taskId) → found
        ↓
injectCheckpointIntoPayload() — prepends prior-progress block to prompt field
        ↓
Agent receives: "[CHECKPOINT: step N] Prior progress: ... Continue from here."
        ↓
Task completes + GoalJudge accepts
        ↓
clearCheckpoint(taskId) — removed from Redis
```

### Checkpoint Schema

```ts
type TaskCheckpoint = {
    taskId: string;
    stepIndex: number;      // which requeue iteration (1 = first requeue)
    partialOutput: string;  // trimmed to 2000 chars before injection
    actionType: string;
    savedAt: string;        // ISO timestamp
};
```

### Injection Format

When a checkpoint is found, the following block is prepended to the task's primary prompt field (`goal_spec` → `prompt` → `description` → `summary`, in priority order):

```
[CHECKPOINT: step 1, saved 2026-06-18T10:23:45.000Z]
Prior progress:
<partialOutput, truncated at 2000 chars>
---
Continue from where you left off. Do not repeat completed work.

<original prompt follows>
```

### Configuration

| Env Var | Default | Description |
|---|---|---|
| `AF_CHECKPOINT_ENABLED` | `false` | Enable/disable structured checkpoints |
| `AF_CHECKPOINT_TTL_SECONDS` | `86400` | Redis TTL for stored checkpoints (24h default) |

Checkpoints require Redis (`REDIS_URL`). When Redis is unavailable, save/load/clear fail silently — execution continues normally without checkpoint context.

### When Checkpoints Are Saved / Cleared

| Event | Action |
|---|---|
| CompletionGate fails (open sub-tasks) | `saveCheckpoint` with current `actionOutput` |
| GoalJudge returns `requeue` | `saveCheckpoint` with current `agentOutput` |
| GoalJudge returns `accept` | `clearCheckpoint` |
| GoalJudge returns `abandon` | `clearCheckpoint` |

Checkpoints are **not** saved on transient execution failures — only on structured requeues where the agent produced meaningful partial output.

### Integration Point

Called from `execution-engine.ts` in both `processApprovedTaskInner` and `processDeveloperTaskInner`:

```ts
import { isCheckpointEnabled, loadCheckpoint, saveCheckpoint, clearCheckpoint, injectCheckpointIntoPayload } from './checkpoint.js';

// Before execution — inject prior progress if checkpoint exists
if (isCheckpointEnabled()) {
    const ckpt = await loadCheckpoint(task.taskId).catch(() => null);
    if (ckpt) {
        payload = injectCheckpointIntoPayload(payload, ckpt);
    }
}

// After GoalJudge requeue — save checkpoint
if (isCheckpointEnabled()) {
    await saveCheckpoint({ taskId: task.taskId, stepIndex: judgeResult.requeueCount, partialOutput: agentOutput, ... }).catch(() => {});
}

// After GoalJudge accept — clear checkpoint
if (isCheckpointEnabled()) {
    clearCheckpoint(task.taskId).catch(() => {});
}
```

---

## Combined Flow

When all seven are enabled, the full quality pipeline for a completed task is:

```
loadCheckpoint(taskId)       ← inject prior progress if requeued before (Structured Checkpoints)
        ↓
Max Mode: run N parallel candidates, pick highest-scoring
        ↓
executeTaskWithRetries → status: 'success'  (winning candidate)
        ↓
CompletionGate.check()       ← DB truth validation
  (re-queue if open children → saveCheckpoint)
        ↓
GoalJudge.evaluate()         ← independent LLM verification
  (requeue → saveCheckpoint | abandon → clearCheckpoint | accept → clearCheckpoint)
        ↓
distillLesson()              ← fire-and-forget lesson extraction (Dream/Distill)
        ↓
recordEpisode()              ← write to episodic memory
        ↓
Return result to caller
```

Context compression (Headroom + Microcompact) runs at the LLM call layer, before results are produced, not after.

Token-Budgeted RAG runs at the retrieval layer, before the system prompt is assembled for each LLM call.

---

## Testing

Each module has its own test file:
- `apps/agent-runtime/src/goal-judge.test.ts`
- `apps/agent-runtime/src/completion-gate.test.ts`
- `apps/agent-runtime/src/microcompact.test.ts`
- `apps/agent-runtime/src/dream-distill.test.ts`
- `apps/agent-runtime/src/max-mode.test.ts`
- `apps/agent-runtime/src/checkpoint.test.ts`
- `apps/agent-runtime/src/agents/shared/rag-context-limiter.test.ts`

Run with:
```bash
pnpm --filter @agentfarm/agent-runtime test src/goal-judge.test.ts
pnpm --filter @agentfarm/agent-runtime test src/completion-gate.test.ts
pnpm --filter @agentfarm/agent-runtime test src/microcompact.test.ts
pnpm --filter @agentfarm/agent-runtime test src/dream-distill.test.ts
pnpm --filter @agentfarm/agent-runtime test src/max-mode.test.ts
pnpm --filter @agentfarm/agent-runtime test src/checkpoint.test.ts
pnpm --filter @agentfarm/agent-runtime test src/agents/shared/rag-context-limiter.test.ts
```
