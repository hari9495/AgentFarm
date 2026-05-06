# Sprint 7 — Week 1: Agent Memory Service

**Status:** CLOSED  
**Closed at:** 2026-05-07  
**Sprint identifier:** sprint-7-week-1-agent-memory  
**Theme:** Short-Term Agent Memory — Workspace-Scoped Task Context

---

## Objective

Introduce a persistent short-term memory layer for the agent runtime so that prior task execution context (connectors used, approval outcomes, LLM providers, execution status) can be injected back into subsequent LLM decisions within the same workspace. Memory records expire after 7 days (TTL) and are fully RLS-scoped by `workspaceId` + `tenantId`.

---

## Deliverables

### 1. Prisma Schema — `AgentShortTermMemory` Model

**File:** `packages/db-schema/prisma/schema.prisma` (679 lines)

- Added `AgentShortTermMemory` model with TTL-based expiry via `expiresAt: DateTime`
- RLS-enforced via `workspaceId` + `tenantId` fields
- `actionsTaken`, `approvalOutcomes`, `connectorsUsed` stored as `Json` for schema flexibility
- Composite index on `(workspaceId, createdAt)` and `(workspaceId, expiresAt)` for read performance
- Single-column index on `tenantId` for tenant-level scans

### 2. Shared Type Contracts — `@agentfarm/shared-types`

**File:** `packages/shared-types/src/index.ts` (1,419 lines)

- Registered `AGENT_MEMORY: '1.0.0'` in `CONTRACT_VERSIONS`
- Added `ApprovalOutcome` interface: `{ action, decision: 'approved' | 'rejected', reason? }`
- Added `AgentShortTermMemoryRecord` interface matching Prisma model fields
- Added `AgentMemoryInjectionContext` interface for LLM prompt enrichment:
  - `recentMemories[]`, `memoryCountThisWeek`, `mostCommonConnectors[]`, `approvalRejectionRate`

### 3. Memory Service — `@agentfarm/memory-service` (NEW)

**Directory:** `services/memory-service/`

| File | Lines | Purpose |
|---|---|---|
| `src/memory-types.ts` | ~90 | `IMemoryStore` interface + `MemoryReadResponse` / `MemoryWriteRequest` types + helper signatures |
| `src/memory-store.ts` | ~217 | `MemoryStore` (Prisma-backed) + `InMemoryMemoryStore` (test double) + helper fns |
| `src/index.ts` | 15 | Public barrel export |
| `src/memory-store.test.ts` | ~220 | 6 test suites, 7 assertions |
| `package.json` | — | `@agentfarm/memory-service@0.1.0`, deps: `@agentfarm/shared-types`, `@prisma/client ^6.0.1` |
| `tsconfig.json` | — | Extends `tsconfig.base.json`, `moduleResolution: bundler` |

**`IMemoryStore` contract:**
```typescript
readMemoryForTask(workspaceId: string): Promise<MemoryReadResponse>
writeMemoryAfterTask(req: MemoryWriteRequest): Promise<void>
cleanupExpiredMemories(): Promise<number>
```

**Helper functions:**
- `calculateRejectionRate(outcomes: ApprovalOutcome[]): number` — fraction of rejected approvals
- `extractCommonConnectors(records: AgentShortTermMemoryRecord[], topN?: number): string[]` — most-used connectors by frequency

### 4. Execution Engine Integration Hook

**File:** `apps/agent-runtime/src/execution-engine.ts` (430 lines)

- Added `processDeveloperTaskWithMemory(task, workspaceId?, memoryStore?)` function
- Reads recent memory via `memoryStore.readMemoryForTask(workspaceId)` before task classification
- Injects `AgentMemoryInjectionContext` as `_memory_context` into task execution payload
- Gracefully degrades: if no `workspaceId` or `memoryStore`, proceeds without memory context
- Returns standard `ProcessedTaskResult` with optional memory context in `executionPayload`

---

## Quality Gate Results

| Metric | Result |
|---|---|
| Total tests | 577 |
| Tests PASS | **577** |
| Tests FAIL | **0** |
| Memory service tests (isolated) | **7 / 7 PASS** |
| Code coverage — statements | 81.74% (threshold: 80%) |
| Code coverage — branches | 62.88% |
| Code coverage — functions | 86.02% (threshold: 80%) |
| Regressions introduced | **ZERO** |
| DB smoke lane | SKIPPED — `DATABASE_URL` not configured (expected, not a blocker) |

**Quality gate verdict: OVERALL PASS**

---

## Test Evidence

### Memory Service Unit Tests (`pnpm --filter @agentfarm/memory-service test`)

```
▶ Agent Memory Service
  ✔ should write memory after task execution
  ✔ should calculate rejection rate correctly
  ✔ should extract most common connectors
  ✔ should cleanup expired memories
  ✔ should isolate memories by workspace
  ✔ should record and retrieve approval outcomes
✔ Agent Memory Service (8ms)
ℹ tests 7 | pass 7 | fail 0
```

### Agent Runtime Regression Check (`pnpm --filter @agentfarm/agent-runtime test`)

```
ℹ tests 577 | suites 79 | pass 577 | fail 0
```

---

## Architecture Decisions

| Decision | Rationale |
|---|---|
| `Json` for array fields | Avoids separate relation tables; memory records are read-only blobs |
| 7-day TTL via `expiresAt` | Balances relevance vs. storage growth; aligns with weekly sprint cadence |
| `InMemoryMemoryStore` test double | Keeps tests hermetic; no DB required for unit coverage |
| Graceful degradation in engine hook | Memory context is additive, not load-bearing; agent must work without it |
| Separate `memory-service` package | Follows existing service boundary convention; isolable and independently deployable |

---

## Known Gaps & Follow-On Work

| Item | Sprint | Priority |
|---|---|---|
| Audit event on memory write (`writeAuditEvent()` TODO in `memory-store.ts`) | Week 2 start | HIGH |
| Scheduled cleanup job in orchestrator (`cleanupExpiredMemories()` every 24h) | Week 2 | MEDIUM |
| Prisma migration file for `AgentShortTermMemory` (requires `DATABASE_URL`) | Pre-deploy | HIGH |
| Week 2: Proactive Signal Detector (`stale_pr`, `stale_ticket`, `budget_warning`) | Sprint 7 Week 2 | HIGH |

---

## Files Changed Summary

| File | Change Type | Lines |
|---|---|---|
| `packages/db-schema/prisma/schema.prisma` | Modified — added model | 679 |
| `packages/shared-types/src/index.ts` | Modified — added types + version | 1,419 |
| `services/memory-service/src/memory-types.ts` | Created | ~90 |
| `services/memory-service/src/memory-store.ts` | Created | ~217 |
| `services/memory-service/src/memory-store.test.ts` | Created | ~220 |
| `services/memory-service/src/index.ts` | Created | 15 |
| `services/memory-service/package.json` | Created | — |
| `services/memory-service/tsconfig.json` | Created | — |
| `apps/agent-runtime/src/execution-engine.ts` | Modified — added hook fn | 430 |

---

<!-- doc-sync: 2026-05-07 sprint-7-week-1 -->
> Sprint 7 Week 1 closed. Next: Sprint 7 Week 2 — Proactive Signal Detector.
