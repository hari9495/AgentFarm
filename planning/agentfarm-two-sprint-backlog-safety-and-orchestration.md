# AgentFarm Two-Sprint Backlog (Safety and Orchestration)

## Purpose
Define a concrete 2-sprint execution backlog with exact epics, owners, dependencies, acceptance criteria, and quality-gate wiring.

## Scope Guard
- Keep MVP scope freeze intact.
- No new role expansion.
- No connector expansion beyond Jira, Teams, GitHub, company email.

## Sprint Window
- Sprint A: 2026-05-01 to 2026-05-14
- Sprint B: 2026-05-15 to 2026-05-28

## Execution Status Update (2026-04-30)
1. Epic C2 hardening sequence completed for orchestrator safety baseline:
- Step 1: Orchestrator control-plane HTTP surface implemented and validated.
- Step 2: Durable lifecycle with file-backed scheduler state implemented and validated.
- Step 3: DB-backed scheduler state backend added via Prisma-backed audit ledger store.
2. New backend selection controls are now available for rollout:
- `ORCHESTRATOR_STATE_BACKEND=auto|file|db`
- `ORCHESTRATOR_STATE_PATH` (file backend override)
3. Operational runbook updated with rollout defaults and troubleshooting:
- `operations/runbooks/db-integration-testing-runbook.md`

## Sprint A (Foundations)

### Epic A1: Atomic Task Checkout and Lease Contract
- Owner: Engineering Lead
- Supporting owners: AI/LLM Lead, Platform Lead
- Goal: enforce single-claimer execution semantics across orchestrator/runtime paths.
- Components:
  - apps/orchestrator
  - apps/api-gateway
  - packages/shared-types
  - packages/queue-contracts
- Dependencies: none
- Acceptance criteria:
1. `claimTask` endpoint/API supports idempotency key and returns deterministic conflict for concurrent claims.
2. Lease lifecycle exists: claimed -> renewed -> released or expired.
3. Expired lease causes safe requeue with correlation continuity.
4. Concurrency test suite includes at least 10 race-condition scenarios and all pass.
5. No direct service-to-service type leakage; contracts come from `packages/shared-types` only.

### Epic A2: Budget Policy and Hard-Stop Enforcement
- Owner: Security and Safety Lead
- Supporting owners: Engineering Lead, Product Lead
- Goal: block risky/autonomous execution when spend thresholds are exceeded.
- Components:
  - services/approval-service
  - services/evidence-service
  - apps/agent-runtime
  - apps/api-gateway
  - apps/dashboard
  - packages/shared-types
- Dependencies: Epic A1 contract IDs for event linkage
- Acceptance criteria:
1. Budget policy supports tenant/workspace/bot scopes and includes warning/hard-stop thresholds.
2. Runtime blocks medium/high execution when hard-stop applies and returns deterministic denial reason.
3. Budget decisions are logged as append-only evidence records.
4. Dashboard shows current budget state and block reason.
5. Hard-stop bypass attempts fail and are auditable.

### Epic A3: Provider Failover Reason Taxonomy and Cooldown Persistence
- Owner: AI/LLM Lead
- Supporting owners: Engineering Lead
- Goal: make Auto provider behavior explainable and recoverable under outage conditions.
- Components:
  - apps/agent-runtime
  - apps/api-gateway
  - services/evidence-service
  - packages/shared-types
- Dependencies: none (builds on ADR-007 implementation)
- Acceptance criteria:
1. Each failed provider attempt maps to one normalized reason code.
2. Cooldown windows are persisted for failover-worthy classes.
3. Auto mode skip decisions record explicit skip reasons.
4. Existing routing behavior remains backward-compatible when no cooldown data exists.
5. Runtime and API tests for taxonomy/cooldown paths pass.

### Epic A4: Shared Contract Hardening and Compatibility Tests
- Owner: Platform Lead
- Supporting owners: Engineering Lead
- Goal: lock cross-service contracts before wider rollout.
- Components:
  - packages/shared-types
  - packages/queue-contracts
  - apps/api-gateway
  - apps/agent-runtime
  - apps/orchestrator
- Dependencies: Epics A1-A3 draft schemas
- Acceptance criteria:
1. Versioned payloads include `contract_version` and correlation identifiers.
2. Contract compatibility tests pass across runtime, orchestrator, and gateway.
3. CI fails on direct cross-service private type imports.
4. Existing API behavior remains compatible for current dashboard flows.

## Sprint B (Enforcement and Operations)

### Epic B1: Heartbeat Wake Model with Coalescing
- Owner: Engineering Lead
- Supporting owners: AI/LLM Lead
- Goal: stabilize execution loops by standardizing wake triggers and dedupe behavior.
- Components:
  - apps/agent-runtime
  - apps/orchestrator
  - apps/api-gateway
  - packages/shared-types
  - packages/queue-contracts
- Dependencies: Epic A1
- Acceptance criteria:
1. Wake sources supported: timer, assignment, on_demand, automation.
2. Active runs coalesce duplicate wakeups instead of spawning duplicate runs.
3. Run records contain wake source, run status, and dedupe metadata.
4. Timeout/cancel paths produce deterministic terminal statuses.

### Epic B1A: Adapter Registry (Server + Dashboard Surface)
- Owner: Engineering Lead
- Supporting owners: Integration Lead, Frontend Lead
- Goal: introduce registry-driven adapter management for runtimes/connectors.
- Components:
  - apps/api-gateway
  - apps/dashboard
  - apps/orchestrator
  - services/connector-gateway
  - packages/shared-types
  - packages/connector-contracts
- Dependencies: Epic A4
- Acceptance criteria:
1. Server-side adapter registry supports register, unregister, discover, and health-check operations.
2. Dashboard exposes adapter list, status, and capability summary from registry APIs.
3. Runtime/orchestrator lookup uses registry keys instead of hardcoded adapter maps for new additions.
4. Registry operations are audit logged and tenant-scoped where applicable.

### Epic B2: Approval Gate Runtime Enforcement and Kill-Switch Precedence
- Owner: Security and Safety Lead
- Supporting owners: Engineering Lead
- Goal: eliminate risky-action bypass in runtime execution.
- Components:
  - services/approval-service
  - services/policy-engine
  - apps/agent-runtime
  - apps/orchestrator
  - packages/shared-types
- Dependencies: Epic A2
- Acceptance criteria:
1. Medium/high actions cannot execute without signed approval artifact.
2. Kill-switch event halts new risky execution within control window.
3. Resume requires authorized control-plane signal and incident note reference.
4. All deny/allow decisions are traceable in evidence chain.

### Epic B3: Evidence Chain Completeness and Governance KPI Views
- Owner: Engineering Lead
- Supporting owners: Product Lead, Security and Safety Lead
- Goal: expose trusted governance metrics and complete audit trails.
- Components:
  - services/evidence-service
  - services/approval-service
  - apps/dashboard
  - apps/api-gateway
  - packages/observability
  - packages/shared-types
- Dependencies: Epics A2, A3, B2
- Acceptance criteria:
1. Risky actions achieve 100% attempt-chain evidence completeness in acceptance dataset.
2. Dashboard governance views show approval P95 latency, risky-action completeness, budget block rate, and provider fallback degradation rate.
3. Quality report export includes all KPI snapshots with timestamps.
4. KPI queries remain tenant/workspace scoped.

### Epic B4: Feature-Flagged Routine Scheduler (Controlled Pilot)
- Owner: Engineering Lead
- Supporting owners: Product Lead
- Goal: enable recurring task intake without affecting core assignment path.
- Components:
  - apps/orchestrator
  - apps/api-gateway
  - apps/dashboard
  - packages/queue-contracts
  - packages/shared-types
- Dependencies: Epic B1
- Acceptance criteria:
1. Scheduler is disabled by default via feature flag.
2. Enabled pilot workspace receives scheduled tasks with dedupe and concurrency policy.
3. Scheduler failures do not block manual task assignment path.
4. Scheduled runs emit the same evidence/approval contracts as manual runs.

## Phase 3 Runway (Immediately After Sprint B)

### Epic C1: Stronger Org-Level Governance Workflows
- Owner: Security and Safety Lead
- Supporting owners: Product Lead, Engineering Lead
- Goal: strengthen org-level approval controls beyond single action approval.
- Components:
  - services/approval-service
  - services/policy-engine
  - apps/dashboard
  - apps/api-gateway
  - packages/shared-types
- Acceptance criteria:
1. Governance workflow templates support escalations, multi-approver chains, and policy-based approver routing.
2. Workflow decisions include policy version, reason code taxonomy, and immutable evidence links.
3. Dashboard governance views expose workflow SLA and bottleneck diagnostics.

### Epic C2: Optional External Adapter/Plugin Loading with Capability Boundaries
- Owner: Engineering Lead
- Supporting owners: Security and Safety Lead, Integration Lead
- Goal: allow extension loading without violating control-plane safety boundaries.
- Components:
  - services/connector-gateway
  - apps/api-gateway
  - apps/dashboard
  - apps/orchestrator
  - packages/shared-types
  - packages/connector-contracts
  - packages/observability
- Acceptance criteria:
1. External adapter/plugin loading is feature-flagged and disabled by default.
2. Plugin manifest declares capabilities; runtime enforces allowlists per tenant/workspace.
3. Loading path validates provenance/signature metadata and rejects untrusted artifacts.
4. Kill-switch can disable a plugin globally and produce complete audit evidence.

## Quality-Gate Wiring

### Required Validation Script Coverage
- Existing gate runner: `scripts/quality-gate.mjs`
- Existing smoke lane: `scripts/e2e-smoke.mjs`

### Required Additions to Quality Gate
1. Add `orchestrator` typecheck and test lane to `scripts/quality-gate.mjs`.
2. Add targeted concurrency lane for task lease race tests.
3. Add approval enforcement regression lane (deny without approval artifact).
4. Add evidence completeness lane (synthetic risky-action dataset).
5. Add budget hard-stop regression lane.

### Done Definition (per epic)
1. Acceptance criteria pass.
2. Typecheck passes for changed workspaces.
3. Tests pass in affected workspace filters.
4. Updated quality-gate report documents executed checks and pass/fail outcomes.
5. Docs updated in planning and operations when behavior changes architecture-level flows.

## Delivery Risks and Mitigations
1. Risk: cross-service contract drift.
- Mitigation: contract tests + CI import boundary checks.
2. Risk: runtime performance regression from added gating.
- Mitigation: feature-flag rollout + shadow-mode evaluation before enforcement.
3. Risk: dashboard lag for governance KPIs.
- Mitigation: pre-aggregated read models for KPI panels.
