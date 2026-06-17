# Quality Gates

Three complementary mechanisms that prevent false completions, validate output correctness, and reduce LLM context costs. Inspired by the MiMo-Code open-source framework, adapted for AgentFarm's multi-tenant architecture.

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

## Combined Flow

When all three are enabled, the full quality pipeline for a completed task is:

```
executeTaskWithRetries → status: 'success'
        ↓
CompletionGate.check()       ← DB truth validation
  (re-queue if open children)
        ↓
GoalJudge.evaluate()         ← independent LLM verification
  (re-queue if not satisfied)
        ↓
recordEpisode()              ← write to episodic memory
        ↓
Return result to caller
```

Context compression (Headroom + Microcompact) runs at the LLM call layer, before results are produced, not after.

---

## Testing

Each module has its own test file:
- `apps/agent-runtime/src/goal-judge.test.ts`
- `apps/agent-runtime/src/completion-gate.test.ts`
- `apps/agent-runtime/src/microcompact.test.ts`

Run with:
```bash
pnpm --filter @agentfarm/agent-runtime test src/goal-judge.test.ts
pnpm --filter @agentfarm/agent-runtime test src/completion-gate.test.ts
pnpm --filter @agentfarm/agent-runtime test src/microcompact.test.ts
pnpm --filter @agentfarm/agent-runtime test src/agents/shared/rag-context-limiter.test.ts
```

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
