# AgentFarm Open-Source Function Adoption Catalog

## Purpose
Provide a clear list of open-source products that are useful for AgentFarm and map each product to concrete functions we can adopt.

## Product Alignment
1. Independent role bots per purchased role.
2. LLM is the primary brain per bot.
3. Governance, approvals, and audit are mandatory.
4. Memory and caching are required to reduce unnecessary LLM calls and token cost.

---

## Where Existing Lists Are
1. [planning/role-bot-engineering-ticket-map-and-oss-adoption.md](planning/role-bot-engineering-ticket-map-and-oss-adoption.md)
2. [planning/independent-role-bot-operating-model.md](planning/independent-role-bot-operating-model.md)

This file is the detailed function adoption catalog used for execution planning.

---

## Open-Source Shortlist by Function

## A) LLM Gateway, Routing, and Cost Control
1. LiteLLM
- Adopt functions:
  - Model routing per role bot.
  - Fallback model chain.
  - Request and response logging hooks.
  - Budget and usage policy enforcement.
- Why useful:
  - Central control plane for all role bots using different model profiles.

2. Helicone (self-host, evaluate fit)
- Adopt functions:
  - Request analytics and latency breakdown.
  - Cost dashboards per bot/tenant.
- Why useful:
  - Fast visibility for model cost and quality tuning.

## B) LLM Tracing, Evaluation, and Prompt Lifecycle
1. Langfuse
- Adopt functions:
  - Trace each bot run end-to-end.
  - Prompt version tracking.
  - Evaluation datasets and score capture.
  - Correlate tool calls with final outcome.

2. Promptfoo
- Adopt functions:
  - Prompt regression tests per role.
  - Safety and quality assertions in CI.

## C) Authorization and Policy
1. OpenFGA
- Adopt functions:
  - Tenant and bot-level authorization checks.
  - Role subscription entitlement checks.
  - Fine-grained access relationships.

2. OPA
- Adopt functions:
  - Risk policy decisions (low, medium, high).
  - Approval-required decisions before execution.
  - Deny-by-default policy fallback.

## D) Durable Job Execution
1. BullMQ (already in baseline)
- Adopt functions:
  - Async task dispatch and retries.
  - Delayed execution and dead-letter handling.

2. Hatchet (POC candidate)
- Adopt functions:
  - Durable workflow runs with retry visibility.
  - Better long-running orchestration than simple queue chains.

3. Temporal (phase-2 candidate)
- Adopt functions:
  - Deterministic workflow replay.
  - Strong durability for complex long-running processes.

## E) Secrets and Credential Safety
1. OpenBao or Vault
- Adopt functions:
  - Connector credential storage.
  - Key rotation and lease controls.
  - Centralized secret access policy.

## F) Memory and Retrieval (Reduce LLM Usage)
1. Redis
- Adopt functions:
  - Exact-response cache for repeated prompts.
  - Semantic cache key index for high-frequency intents.
  - Session short-term memory state.

2. PostgreSQL + pgvector
- Adopt functions:
  - Long-term bot memory store per tenant/workspace/bot.
  - Similarity retrieval for context injection.
  - Memory retention and governance with SQL controls.

3. Qdrant (alternative vector store)
- Adopt functions:
  - High-performance semantic memory retrieval.
  - Metadata filtering by tenant, role, and bot.

4. Weaviate (alternative vector store)
- Adopt functions:
  - Hybrid retrieval patterns.
  - Rich metadata indexing.

5. Zep (memory platform, evaluate)
- Adopt functions:
  - Conversation memory APIs.
  - Summarization and retrieval primitives.

6. Mem0 (evaluate licensing and fit)
- Adopt functions:
  - Memory extraction from conversations.
  - Compact memory storage for future context reuse.

## G) Observability Stack
1. OpenTelemetry + Prometheus + Grafana + Loki + Tempo
- Adopt functions:
  - Standard metrics, logs, and traces.
  - Cross-service correlation with bot_id and correlation_id.
  - Incident triage and SLO dashboards.

## H) OpenClaw Fit (Dedicated)
1. OpenClaw
- Fit for AgentFarm:
  - Useful as runtime foundation patterns for LLM-centric agent execution.
  - Useful gateway and long-running assistant operation patterns.
  - Useful operational hardening references for stateful agent lifecycle handling.
- Adopt functions:
  - Runtime process lifecycle patterns (startup, health, recovery).
  - Agent workspace and execution boundary patterns.
  - Tool-call orchestration patterns as inspiration for controlled connector execution.
  - Operator runbook patterns for diagnostics and reliability.
- Avoid for MVP core path:
  - Public skill marketplace style extensibility.
  - Dynamic third-party plugin installation and execution.
  - Broad consumer channel scope not tied to role-bot SKU needs.
- Integration stance:
  - Use OpenClaw as inspiration and selective runtime kernel input, not as the full product control plane.
  - Keep AgentFarm differentiation in role entitlements, independent role bots, bot-scoped integrations, policy approvals, and evidence audit.

## I) Paperclip Fit (Dedicated)
1. Paperclip
- Fit for AgentFarm:
  - Strong fit for control-plane patterns around governance, approvals, cost controls, and durable run tracking.
  - Good reference for heartbeat-based execution lifecycle and agent operations UX.
  - Useful for multi-company isolation patterns that map to tenant isolation needs.
- Adopt functions:
  - Heartbeat run lifecycle patterns: invoke, status, cancel, event log streaming.
  - Cost and budget controls per agent or role bot with hard-stop behavior.
  - Approval service patterns with activity logs and idempotent approval transitions.
  - Activity and dashboard patterns: pending approvals, run statuses, cost utilization, failures.
  - Adapter contract patterns for external runtimes and webhook-based agents.
  - Org and role metadata model ideas for role bot management surfaces.
- Avoid for MVP core path:
  - Full multi-agent org-chart delegation model as default runtime behavior.
  - Plugin framework complexity and dynamic plugin surface area in early releases.
  - Product assumptions built for zero-human company orchestration.
- Integration stance:
  - Reuse control-plane and governance mechanisms, not the end-to-end product model.
  - Keep AgentFarm default as independent role bots purchased by SKU.

## J) Claw3D Fit (Dedicated)
1. Claw3D
- Fit for AgentFarm:
  - Strong fit as an inspiration source for operator visualization, live status surfaces, and rich interaction UX.
  - Useful for runtime-profile abstraction and adapter seam design.
  - Useful for agent fleet operations, analytics panels, and event-driven UI cues.
- Adopt functions:
  - Runtime profile abstraction: local, custom backend, gateway-backed modes.
  - Same-origin proxy and upstream allowlist approach for safer runtime connectivity.
  - Fleet management UX: agent roster, status badges, run history, approvals, and analytics panels.
  - Office-level operational views: task board, history panel, inbox panel, run debug overlays.
  - Connection diagnostics and guided error semantics for supportability.
- Avoid for MVP core path:
  - 3D immersive office as a required primary interface.
  - Consumer/gamified interaction patterns that can dilute enterprise workflow focus.
  - Runtime assumptions tied to multi-agent office simulation when role bots are independent.
- Integration stance:
  - Reuse UI patterns and runtime adapter seams; keep your main dashboard business-first and role-scoped.
  - Consider immersive visual mode as optional phase-2 operator experience.

---

## Memory Strategy to Reduce LLM Calls (Recommended)

## Tier 1: Request Cache (Immediate Savings)
1. Use Redis for exact-match caching of normalized requests.
2. Cache key dimensions:
- role_key
- bot_id
- prompt_version
- normalized_intent
- tool_context_hash
3. TTL policy:
- 5 to 60 minutes for operational prompts.
- shorter TTL for volatile data.

## Tier 2: Semantic Cache (Near-Duplicate Savings)
1. Store embeddings for request fingerprints.
2. Reuse recent high-confidence answer when similarity threshold is met.
3. Always bypass for high-risk actions requiring fresh reasoning.

## Tier 3: Long-Term Memory Retrieval
1. Store summarized artifacts in pgvector or Qdrant.
2. Retrieve top-k relevant memories for each new request.
3. Inject only compact memory snippets to reduce token size.

## Tier 4: Conversation Compression
1. Summarize long threads into durable memory records.
2. Keep raw transcripts for audit, but pass summaries to LLM by default.
3. Trigger re-summarization when drift or stale memory is detected.

---

## Adopt-Now Stack (Practical)
1. LiteLLM for routing and budget controls.
2. Langfuse for trace and prompt lifecycle.
3. OpenFGA for entitlements and authz.
4. OPA for risk policy decisions.
5. Redis for exact and short-term cache.
6. PostgreSQL + pgvector for long-term memory.
7. OpenTelemetry stack for observability.

## Evaluate-Next Stack
1. Hatchet for durable orchestration upgrades.
2. Qdrant if pgvector retrieval performance becomes a bottleneck.
3. Promptfoo for CI-grade prompt regression and safety test coverage.

## Avoid in MVP Core Path
1. Public skill marketplaces.
2. Dynamic third-party plugin execution.
3. Cross-role default orchestration.

---

## Function Adoption Matrix (Execution View)
| Function | OSS candidate | Adopt phase | Owner | Notes |
| --- | --- | --- | --- | --- |
| Model routing and fallback | LiteLLM | Week 1 | Runtime team | Per-role model profiles |
| Prompt and run tracing | Langfuse | Week 1 | Runtime + evidence | Track prompt_version |
| Entitlement authz | OpenFGA | Week 2 | Gateway team | Role purchase checks |
| Risk policy decisioning | OPA | Week 2 | Policy team | approval_required logic |
| Exact request cache | Redis | Week 1 | Runtime team | Fast token savings |
| Long-term memory retrieval | pgvector | Week 2 | Data platform | Bot-scoped memory |
| Durable workflow (optional) | Hatchet | Week 3 POC | Orchestration | Upgrade trigger-based |
| Prompt regression in CI | Promptfoo | Week 3 POC | QA platform | Role prompt packs |

## Direct Source-to-Implementation Mapping
Use this table for sprint planning and implementation sequencing.

| Function to adopt | Source project | AgentFarm target service or file | Priority week |
| --- | --- | --- | --- |
| Heartbeat run lifecycle (invoke, status, cancel, events) | Paperclip | apps/agent-runtime/src/runtime-server.ts | Week 1 |
| Approval transition and idempotent decision flow | Paperclip | services/approval-service and apps/api-gateway/src/main.ts | Week 2 |
| Cost hard-stop guardrails by bot | Paperclip | services/policy-engine and apps/agent-runtime/src/runtime-server.ts | Week 2 |
| Activity stream event model for operations | Paperclip | services/evidence-service and packages/shared-types/src/index.ts | Week 2 |
| Adapter contract boundary for external runtimes | Paperclip | apps/api-gateway/src/routes/connector-actions.ts | Week 2 |
| Tenant or company isolation patterns | Paperclip | services/identity-service and packages/db-schema/prisma/schema.prisma | Week 3 |
| Runtime profile abstraction (local or custom backend) | Claw3D | apps/api-gateway/src/main.ts and apps/dashboard/app/page.tsx | Week 3 |
| Same-origin upstream proxy and allowlist safety | Claw3D | apps/api-gateway (gateway proxy boundary) | Week 3 |
| Fleet status UX (running, idle, error, approvals) | Claw3D | apps/dashboard/app/page.tsx | Week 3 |
| Run history and debug overlays UX patterns | Claw3D | apps/dashboard/app/page.tsx and operations/runbooks | Week 4 |
| Connection diagnostics and guided error semantics | Claw3D | apps/api-gateway/src/main.ts and apps/dashboard/app/page.tsx | Week 4 |
| Runtime startup and recovery patterns | OpenClaw | apps/agent-runtime/src/runtime-server.ts | Week 1 |
| Tool execution lifecycle guardrails | OpenClaw | apps/agent-runtime/src/runtime-server.ts and apps/api-gateway/src/routes/connector-actions.ts | Week 2 |
| Model routing and fallback chain | LiteLLM | apps/agent-runtime (LLM call boundary) | Week 1 |
| Prompt and run trace instrumentation | Langfuse | apps/agent-runtime and services/evidence-service | Week 1 |
| Role entitlement authorization graph | OpenFGA | apps/api-gateway/src/main.ts and services/identity-service | Week 2 |
| Action risk policy evaluation | OPA | services/policy-engine | Week 2 |
| Exact cache and short-term memory state | Redis | apps/agent-runtime and services/connector-gateway | Week 1 |
| Long-term semantic memory retrieval | PostgreSQL + pgvector | packages/db-schema and services/evidence-service | Week 2 |
| Prompt regression checks in CI | Promptfoo | scripts and .github/workflows | Week 4 |

---

## Success Metrics for Memory-Driven Savings
1. LLM call reduction target:
- 20 to 35 percent reduction in repeat requests by enabling exact plus semantic cache.
2. Token reduction target:
- 25 percent average prompt token reduction using memory summaries.
3. Quality guardrail:
- No drop in task success rate after cache and memory activation.
4. Safety guardrail:
- Cache disabled automatically for high-risk action classes.

## Traceability
This catalog operationalizes:
1. [planning/independent-role-bot-operating-model.md](planning/independent-role-bot-operating-model.md)
2. [planning/role-bot-engineering-ticket-map-and-oss-adoption.md](planning/role-bot-engineering-ticket-map-and-oss-adoption.md)

## Change Log
1. 2026-04-25: Created open-source function adoption catalog and memory strategy for LLM usage reduction.
2. 2026-04-25: Added dedicated OpenClaw section with explicit fit, adopt, avoid, and integration stance notes.
3. 2026-04-25: Added dedicated Paperclip and Claw3D sections with explicit fit, adopt, avoid, and integration stance notes.
4. 2026-04-25: Added direct source-to-implementation mapping table with AgentFarm targets and week priorities.

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).
