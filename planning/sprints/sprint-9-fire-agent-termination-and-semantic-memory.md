# Sprint 9 — Fire-Agent Termination + Semantic Memory RAG

Status: CLOSED
Closed at: 2026-05-16
Sprint identifier: sprint-9-fire-agent-termination-and-semantic-memory

## Objective

Two critical infrastructure features needed for the AI staffing platform product direction:
1. Graceful VM deprovisioning when a customer fires an agent (VM lifecycle end).
2. Company knowledge base with semantic search so agents can answer questions about the company before starting tasks.

---

## Feature 1 — Fire-Agent Graceful Deprovision

### Why
Agents run in isolated per-tenant VMs. When a customer fires an agent, the VM must be torn down gracefully — cleanup data, revoke credentials, archive logs. Previously there was no API for this.

### What was built

**New: `apps/api-gateway/src/routes/agent-lifecycle.ts`**
- `POST /v1/agents/:botId/terminate` — Creates a `ProvisioningJob` with:
  - `status: 'cleanup_pending'`
  - `triggerSource: 'termination'`
  - `planId: 'termination'`
  - Returns HTTP 202 `{ reused: boolean, jobId: string, status: string }`
  - Guards duplicate: if a `cleanup_pending` job already exists, returns `reused: true`
  - Tenant isolation: rejects cross-tenant requests unless `session.scope === 'internal'`
- `GET /v1/agents/:botId/terminate/status` — Returns latest termination job; HTTP 404 if none

**Design note:** Plugs into the existing `processCleanupPendingJob()` poller — no new background worker needed.

**New: `apps/api-gateway/src/routes/agent-lifecycle.test.ts`** — 10 tests:
- POST: 401 (no session), 404 (bot not found), 404 (workspace not found), 403 (cross-tenant), 202 (reused=true), 202 (reused=false), 202 (internal scope)
- GET: 401 (no session), 404 (no job), 200 (with job)

**Modified: `apps/api-gateway/src/main.ts`** — registered `registerAgentLifecycleRoutes`

---

## Feature 2 — Semantic Memory / Company Knowledge RAG

### Why
Agents need company context before starting tasks. A Developer agent should know the tech stack, coding standards, and architecture of the company. This knowledge is stored as vector embeddings and retrieved via cosine similarity.

### What was built

**New: `packages/shared-types/src/semantic-memory.ts`**
- `SemanticMemoryRecord` — stored knowledge chunk with metadata
- `SemanticSearchResult` — search hit with similarity score
- `SemanticWriteRequest` — write payload (content, sourceUrl, sourceType, botId?)
- `SemanticSearchRequest` — search payload (query, botId?, topK?, minSimilarity?)

CONTRACT_VERSIONS addition: `SEMANTIC_MEMORY: '1.0.0'`

**New: `services/memory-service/src/semantic-write-hook.ts`** + test
- `writeSemanticMemory(request, embed, prisma, deployment): Promise<SemanticMemoryRecord>`
- Calls `embed(content)` to get vector, then `$queryRaw` INSERT with `::vector` cast + RETURNING
- Uses `randomUUID()` from `node:crypto` for ID generation

**New: `services/memory-service/src/semantic-search-hook.ts`** + test
- `searchSemanticMemory(request, embed, prisma): Promise<SemanticSearchResult[]>`
- Cosine similarity: `1 - (embedding <=> ${vectorLiteral}::vector)`, `topK = 5` (default), `minSimilarity = 0.70` (default)

**Modified: `services/memory-service/src/index.ts`** — exports `writeSemanticMemory`, `searchSemanticMemory`

**New: `apps/api-gateway/src/routes/knowledge-base.ts`**
- `POST /v1/knowledge-base/write` — 201 on success, 400 on missing fields/invalid sourceType, 401 on no session, 503 on embed failure
- `POST /v1/knowledge-base/search` — 200 with results array, 400 on missing query, 401, 503 on embed failure
- Injectable `_writeHook`/`_searchHook` options for test isolation

**New: `apps/api-gateway/src/routes/knowledge-base.test.ts`** — 9 tests:
- Write: 401, 503, 400-missing-content, 400-invalid-sourceType, 201
- Search: 401, 503, 400-missing-query, 200

**Modified: `apps/agent-runtime/src/runtime-server.ts`**
- Pre-task semantic recall: before every task execution, calls `searchSemanticMemory` and attaches top-5 results as `task.payload._semantic_context`
- Non-blocking: wrapped in try/catch; a failed embedding lookup never blocks task execution
- New options: `semanticEmbed?: EmbedFn`, `semanticDeployment?: string`

**Modified: `apps/api-gateway/src/main.ts`** — registered `registerKnowledgeBaseRoutes`, imported `createEmbedFn`

**New: DB migration `20260522000000_semantic_knowledge_base`**
- Creates `AgentKnowledgeBase` table
- Fields: `id`, `tenantId` (not null), `botId` (nullable), `content`, `sourceUrl`, `sourceType`, `embeddingModel`, `embedding` (Unsupported("vector(1536)")), `createdAt`
- Indexes: `tenantId`, `(tenantId, botId)`

---

## Quality Evidence

- Tests: `node:test` + `assert/strict` (no vitest)
- API gateway tests: **1181 / 1181 PASS**
- Typechecks: `@agentfarm/api-gateway` PASS, `@agentfarm/agent-runtime` PASS, `@agentfarm/shared-types` PASS
- Quality gate: `node scripts/quality-gate.mjs` — **47 / 47 lanes PASS**
- Report: `operations/quality/9.1-quality-gate-report.md`

---

## Files Changed

### New
- `apps/api-gateway/src/routes/agent-lifecycle.ts`
- `apps/api-gateway/src/routes/agent-lifecycle.test.ts`
- `apps/api-gateway/src/routes/knowledge-base.ts`
- `apps/api-gateway/src/routes/knowledge-base.test.ts`
- `services/memory-service/src/semantic-write-hook.ts`
- `services/memory-service/src/semantic-write-hook.test.ts`
- `services/memory-service/src/semantic-search-hook.ts`
- `services/memory-service/src/semantic-search-hook.test.ts`
- `packages/shared-types/src/semantic-memory.ts`
- `packages/db-schema/prisma/migrations/20260522000000_semantic_knowledge_base/migration.sql`
- `operations/quality/9.1-quality-gate-report.md`

### Modified
- `apps/api-gateway/src/main.ts`
- `apps/agent-runtime/src/runtime-server.ts`
- `services/memory-service/src/index.ts`
- `packages/shared-types/src/index.ts`
- `packages/db-schema/prisma/schema.prisma`
- `scripts/quality-gate.mjs` (report path bumped to `9.1-quality-gate-report.md`)

---

## Notes

- `node:test` + `assert/strict` pattern enforced — no vitest anywhere in api-gateway
- `randomUUID()` from `node:crypto` — no external ID library dependency
- Semantic recall is non-blocking by design — agent tasks never fail due to missing context
- Cosine similarity threshold 0.70 is configurable via `minSimilarity` in `SemanticSearchRequest`
- `_writeHook`/`_searchHook` injection pattern allows clean unit tests without Azure OpenAI calls

<!-- doc-sync: 2026-05-16 sprint-9 -->
