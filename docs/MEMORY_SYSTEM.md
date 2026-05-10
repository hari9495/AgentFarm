# AgentFarm Memory System

> Last updated: May 10, 2026 | AgentFarm monorepo audit

Full reference for the agent memory architecture spanning `apps/agent-runtime/src/prisma-memory-store.ts` and `services/memory-service`.

---

## Overview

The agent memory system has three layers:

| Layer | Model | TTL | Scope |
|---|---|---|---|
| Short-term | `AgentShortTermMemory` | 7 days (default) | Per workspace, per task |
| Long-term | `AgentLongTermMemory` | Permanent | Per tenant, per pattern |
| Repo knowledge | `AgentRepoKnowledge` | Permanent | Per (tenant, repo, role, key) |

Memory is read before each task and written after each task. It provides the LLM with historical context without requiring the full conversation history in the prompt.

---

## Short-Term Memory

**Model:** `AgentShortTermMemory`

Stores what the agent did in recent tasks within a workspace.

### Fields

| Field | Type | Description |
|---|---|---|
| `taskId` | `String` | Links to the task that created this entry |
| `workspaceId` | `String` | Scoped to workspace |
| `tenantId` | `String` | Scoped to tenant |
| `repoName` | `String?` | Optional — enables per-repo memory isolation |
| `actionsTaken` | `String[]` | List of action types executed |
| `approvalOutcomes` | `Json` | `{action, decision, reason?}[]` |
| `connectorsUsed` | `String[]` | Connector types used |
| `llmProvider` | `String?` | Which LLM executed this task |
| `executionStatus` | `String` | `success` \| `approval_required` \| `failed` |
| `summary` | `String` | Brief text injected into next task's prompt |
| `correlationId` | `String` | Tracing ID |
| `createdAt` | `DateTime` | When this memory was written |
| `expiresAt` | `DateTime?` | `createdAt + 7 days`; null = permanent |

### TTL Sweep
- `expiresAt` is set to `createdAt + 7 days` by default
- Set to `null` to make a memory permanent
- The memory-service runs a scheduled sweep to delete expired entries

---

## Long-Term Memory

**Model:** `AgentLongTermMemory`

Stores recurring patterns observed across many tasks. More persistent and aggregated than short-term memory.

### Fields

| Field | Type | Description |
|---|---|---|
| `tenantId` | `String` | Tenant scope |
| `workspaceId` | `String` | Workspace scope |
| `pattern` | `String` | The observed pattern (e.g. "always uses pnpm for this repo") |
| `repoName` | `String?` | Optional repo scope |
| `confidence` | `Float` | 0.0–1.0 confidence score |
| `observedCount` | `Int` | Number of times this pattern was observed (default: 1) |
| `lastSeen` | `DateTime` | Last time this pattern was observed |
| `createdAt` | `DateTime` | When first observed |

**Unique:** `(tenantId, pattern)`

---

## Repo Knowledge

**Model:** `AgentRepoKnowledge`

Stores structured key-value facts about a specific repository, role, and tenant. Used for code conventions, test commands, CI setup, etc.

### Fields

| Field | Type | Description |
|---|---|---|
| `tenantId` | `String` | Tenant scope |
| `workspaceId` | `String` | Workspace scope |
| `repoName` | `String` | Repository name |
| `role` | `String` | Agent role key |
| `key` | `String` | Knowledge key (e.g. `test_command`, `lint_command`) |
| `value` | `Json` | Knowledge value |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` | |

**Unique:** `(tenantId, repoName, role, key)`

---

## Relevance Ranking

**File:** `apps/agent-runtime/src/prisma-memory-store.ts`

When reading short-term memory, entries are ranked before being injected into the LLM prompt:

| Signal | Score Bonus |
|---|---|
| `repoName` matches current repo | +3 |
| `createdAt` within last 24 hours | +2 |
| `createdAt` within last 7 days | +1 |
| All others | 0 |

Top `maxResults` (default: 20) entries are returned sorted by score descending.

### Repo Name Derivation
```typescript
function deriveRepoName(): string | undefined {
  // 1. GITHUB_REPO env var (format: "owner/repo")
  // 2. Last segment of AF_WORKSPACE_BASE env var
  // 3. undefined (no repo scoping)
}
```

---

## Memory Store API

**File:** `apps/agent-runtime/src/prisma-memory-store.ts`

### `readMemoryForTask(workspaceId, maxResults?)`
```typescript
async function readMemoryForTask(
  workspaceId: string,
  maxResults?: number  // default: 20
): Promise<MemorySummary>
```
Returns recent short-term entries + long-term patterns + repo knowledge, all ranked and formatted as a single string for LLM injection.

### `writeMemoryAfterTask(request)`
```typescript
async function writeMemoryAfterTask(request: {
  workspaceId: string;
  tenantId: string;
  taskId: string;
  actionsTaken: string[];
  approvalOutcomes: { action: string; decision: string; reason?: string }[];
  connectorsUsed: string[];
  executionStatus: 'success' | 'approval_required' | 'failed';
  summary: string;
  correlationId: string;
  llmProvider?: string;
  repoName?: string;
  permanent?: boolean;  // if true, sets expiresAt = null
}): Promise<void>
```

### `getRepoKnowledge(tenantId, workspaceId, repoName, role)`
```typescript
async function getRepoKnowledge(
  tenantId: string,
  workspaceId: string,
  repoName: string,
  role: string
): Promise<RepoKnowledge[]>
```

### `setRepoKnowledge(tenantId, workspaceId, repoName, role, key, value)`
```typescript
async function setRepoKnowledge(
  tenantId: string,
  workspaceId: string,
  repoName: string,
  role: string,
  key: string,
  value: unknown
): Promise<void>
```
Uses `upsert` — creates or updates based on unique constraint `(tenantId, repoName, role, key)`.

---

## Memory API Routes

**File:** `apps/api-gateway/src/routes/memory.ts`

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/memory` | Read working memory for workspace (`?workspaceId=&maxResults=`) |
| `POST` | `/v1/memory` | Write task outcome to short-term memory |
| `GET` | `/v1/memory/repo` | Get repo knowledge (`?workspaceId=&repoName=&role=`) |
| `POST` | `/v1/memory/repo` | Upsert repo knowledge entry |

---

## Memory Service

**Package:** `services/memory-service`

Standalone service that:
1. Runs TTL sweep on `AgentShortTermMemory` (deletes entries where `expiresAt < now()`)
2. Aggregates patterns into `AgentLongTermMemory` from observed short-term entries
3. Exposes health endpoint

**Test count:** 11 tests
