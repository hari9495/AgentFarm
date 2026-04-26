# AgentFarm Development Kickoff Plan

## Purpose
Provide the engineering team a precise, unambiguous starting point for development execution.
This document bridges the completed planning pack to the first lines of working code.

## Authority
- Planning pack status: Fully closed. Go decision recorded 2026-04-19.
- Scope: MVP only — Developer Agent role, four approved connectors.
- Source of truth: planning/mvp-approved-execution-task-list.md P0 task sequence.
- Scope enforcement: Any work not traceable to an approved execution task is blocked under MVP scope freeze.

---

## Sprint 0: Environment and Contract Finalization
**Dates:** 2026-04-21 to 2026-04-28
**Goal:** Every engineer can run the local stack end-to-end. Every contract is frozen before Sprint 1 build begins.
**Exit criteria:** All Sprint 0 checklist items are checked. No contract ambiguity remains.

### Sprint 0 Checklist

#### Repository Setup
- [ ] Monorepo initialized (pnpm workspaces, TypeScript project references)
- [ ] Lint, format, and pre-commit hooks active (ESLint, Prettier, Husky)
- [ ] CI pipeline skeleton in place (build, lint, test gates — no product logic yet)
- [ ] Branch protection on main: require PR, require passing CI, no direct push
- [ ] Secrets policy: no credentials in source, .env.example files only, real secrets to Vault/Key Vault

#### Local Development Stack
- [ ] docker-compose.yml boots full control-plane dependencies: PostgreSQL, Redis, OPA sidecar
- [ ] Prisma schema connects and migrates against local PostgreSQL successfully
- [ ] BullMQ connects to Redis and enqueues/consumes test jobs
- [ ] Next.js dashboard boots and reaches a placeholder home page
- [ ] NestJS API gateway boots and returns health check at /health

#### Contract Closure (maps to P0 execution tasks)
- [ ] Task 1.1 complete: tenant_status and bot_status values frozen and identical across all referenced docs
- [ ] Task 1.2 complete: signup-to-provisioning event handoff payload defined, testable, and documented
- [ ] Task 2.1 complete: provisioning state machine sequence frozen including failure and retry policy
- [ ] Task 2.2 complete: Docker runtime contract finalized (startup, health, restart, kill-switch)
- [ ] Task 4.1 complete: risk classification rules and approval routing contract finalized
- [ ] Task 5.1 complete: audit and evidence minimum field set locked

#### Shared Package Foundations
- [ ] packages/shared-types: TypeScript interfaces for tenant, bot, provisioning job, approval, evidence
- [ ] packages/db-schema: Prisma schema with all Sprint 1 tables defined and validated
- [ ] packages/queue-contracts: BullMQ job type definitions for provisioning and approval queues
- [ ] packages/connector-contracts: normalized action types for Jira, Teams, GitHub, company email
- [ ] packages/observability: OpenTelemetry tracer and logger setup, shared across all services

#### Infrastructure Baseline
- [ ] infrastructure/control-plane: Bicep or Terraform skeleton for shared resource group, Key Vault, container registry, PostgreSQL, Redis
- [ ] infrastructure/runtime-plane: Bicep or Terraform per-tenant template for VM, NIC, disk, NSG, managed identity, monitoring agent
- [ ] Both templates pass lint and what-if analysis before Sprint 1 provisioning work begins

#### Definition of Done for Sprint 0
- All checklist items checked.
- docker-compose stack boots with zero errors.
- All six contract closure tasks are marked complete in execution task list.
- No TODO or TBD in any shared package interface file.
- CI pipeline passes on main.

### Sprint 0 Day-by-Day Execution Plan (Owner + Due Date)

| Day | Date | Owner | Planned Work | P0 Task Link | Due By | Deliverable |
| --- | --- | --- | --- | --- | --- | --- |
| Day 1 | 2026-04-21 | Engineering Lead | Monorepo bootstrap, workspace config, lint/format hooks, CI skeleton, branch protection checklist, initial docker-compose baseline | 1.1 (kickoff dependency) | 2026-04-21 EOD | Repo foundation commit and local stack boot proof |
| Day 2 | 2026-04-22 | Engineering Lead | Finalize Task 1.1 state contract and publish unified state enum table across specs; begin Task 1.2 handoff payload draft | 1.1, 1.2 | 2026-04-22 EOD | Signed state contract section + handoff payload v1 |
| Day 3 | 2026-04-23 | Engineering Lead | Close Task 1.2 with testable signup-to-provisioning contract; freeze Task 2.1 provisioning state machine including retry/failure semantics | 1.2, 2.1 | 2026-04-23 EOD | Event handoff contract + provisioning state diagram v1 final |
| Day 4 | 2026-04-24 | Engineering Lead | Finalize Task 2.2 Docker runtime contract fields (startup, restart, health, kill-switch boundaries) and shared package type stubs | 2.2 | 2026-04-24 EOD | Runtime contract final table + shared types package baseline |
| Day 5 | 2026-04-25 | Security and Safety Lead | Finalize Task 4.1 risk classification and approval routing rules; validate medium/high mandatory approval behavior | 4.1 | 2026-04-25 EOD | Approved risk-to-approval routing matrix |
| Day 6 | 2026-04-26 | Engineering Lead | Finalize Task 5.1 audit/evidence minimum field set and retention references; align evidence schema with ADR baseline | 5.1 | 2026-04-26 EOD | Evidence minimum schema and field dictionary |
| Day 7 | 2026-04-27 | Engineering Lead + Security and Safety Lead | Integration consistency sweep across all Sprint 0 contracts; resolve drift between specs and execution design; validate scope-freeze compliance | 1.1 to 5.1 | 2026-04-27 EOD | Cross-doc consistency signoff note |
| Day 8 | 2026-04-28 | Engineering Lead + Architecture Owner + Product Lead | Sprint 0 exit gate review: verify all checklist items complete and authorize Sprint 1 start condition | 1.1 to 5.1 complete | 2026-04-28 EOD | Sprint 0 closure record and Sprint 1 start approval |

### Daily Operating Cadence (Sprint 0)
1. 09:30 to 09:45: Contract standup (blockers, dependencies, same-day closure target).
2. 13:00 to 13:20: Midday dependency check (handoffs between Engineering Lead and Security and Safety Lead).
3. 17:30 to 17:45: Evidence-based closeout (update task status, attach artifacts, confirm scope check pass).

### Mandatory Daily Artifact Update
1. Update planning/mvp-approved-execution-task-list.md status and notes for tasks touched that day.
2. Attach the exact doc section changed for each contract closure item.
3. Mark Scope Check as Pass or Fail before end-of-day closure.
4. If any item slips, record reason and next-day recovery action.

---

## Sprint 1: Tenant Lifecycle and Azure Provisioning
**Dates:** 2026-04-29 to 2026-05-12
**Goal:** A tenant can sign up, trigger provisioning, and reach a "ready" state with a running agent VM.
**Exit criteria:** End-to-end provisioning test passes. Bot status transitions from created → bootstrapping → active verified by integration test.

### Sprint 1 Objectives
1. Implement tenant and user creation (identity-service).
2. Implement provisioning job dispatch from signup event (provisioning-service + BullMQ).
3. Implement Azure VM provisioning sequence through Azure SDK (provisioning-service).
4. Implement VM bootstrap script: Docker install, image pull, container start.
5. Implement health-check confirmation loop that updates control plane bot status to active.
6. Implement provisioning status visibility on dashboard (read model, API endpoint, dashboard page).
7. Write integration tests covering full provisioning state machine.

### Sprint 1 Service Boundary
| Service | Responsibility in Sprint 1 | Owner |
| --- | --- | --- |
| identity-service | Create tenant, workspace, user record, assign plan | Engineering Lead |
| provisioning-service | Consume provisioning job, execute Azure steps, update status | Engineering Lead |
| api-gateway | Expose tenant status endpoint and provisioning status endpoint | Engineering Lead |
| dashboard | Provisioning status page with live state polling | Engineering Lead |
| db-schema | tenants, bots, provisioning_jobs, tenant_runtime_resources tables | Engineering Lead |
| queue-contracts | ProvisioningJob type, retryable failure shape | Engineering Lead |

### Sprint 1 Out of Scope
- Connector auth (Sprint 2)
- Approval flows (Sprint 2)
- Audit evidence collection beyond provisioning events (Sprint 2)
- Any role beyond Developer Agent
- Any connector beyond the four approved connectors

---

## Sprint 2: Connector Auth, Approval Controls, and Audit Evidence
**Dates:** 2026-05-13 to 2026-05-26
**Goal:** An active agent can authenticate to all four connectors, execute role tasks, route actions through the approval engine, and produce complete audit evidence.
**Exit criteria:** Full action lifecycle test passes: task intake → risk classification → approval (for medium/high) → action execution → evidence record written.

### Sprint 2 Objectives
1. Implement OAuth and token lifecycle for Jira, Teams, GitHub, and company email (connector-gateway).
2. Implement normalized connector action routing (connector-gateway).
3. Implement OPA-based risk classification for Developer Agent action set (policy-engine).
4. Implement approval routing and approval record creation (approval-service).
5. Implement kill-switch and emergency-stop behavior (approval-service + orchestrator).
6. Implement audit and evidence record writing for every action and approval (evidence-service).
7. Implement dashboard approval queue view and evidence log view.
8. Write integration tests for full action lifecycle including medium-risk and high-risk paths.

### Sprint 2 Service Boundary
| Service | Responsibility in Sprint 2 | Owner |
| --- | --- | --- |
| connector-gateway | OAuth, token storage, token refresh, normalized action dispatch | Engineering Lead |
| policy-engine | OPA risk rule evaluation for Developer Agent tasks | Security and Safety Lead |
| approval-service | Approval routing, record creation, latency tracking, kill-switch | Security and Safety Lead |
| evidence-service | Audit record write, retention tag, immutability flag | Engineering Lead |
| orchestrator | Task intake, action lifecycle coordination, escalation routing | Engineering Lead |
| dashboard | Approval queue view, evidence log view, kill-switch control | Engineering Lead |

### Sprint 2 Out of Scope
- Additional roles
- Additional connectors
- Advanced analytics beyond MVP dashboard
- Multi-region infrastructure

---

## Critical Path (P0 Task Sequence)
These tasks gate all Sprint 1 work. They must be fully closed in Sprint 0.

```
1.1 (tenant + bot state contract)
  └─► 1.2 (signup-to-provisioning handoff)
        └─► 2.1 (provisioning state machine)
              └─► 2.2 (Docker runtime contract)
                    └─► 4.1 (risk classification + approval routing)
                          └─► 5.1 (audit evidence field lock)
```

No Sprint 1 implementation begins until 1.1 and 1.2 are closed.
No Sprint 2 implementation begins until 2.1, 2.2, 4.1, and 5.1 are closed.

---

## First Implementation Order (Sprint 1 Sequence)

### Week 1 of Sprint 1 (2026-04-29 to 2026-05-05)
1. packages/db-schema: finalize Prisma schema for tenants, bots, provisioning_jobs, tenant_runtime_resources.
2. identity-service: tenant create, user create, plan assignment, workspace create.
3. provisioning-service: job consumer, provisioning state writer, Azure SDK adapter (resource group, identity, VM, NIC, disk, NSG).
4. api-gateway: POST /tenants, GET /tenants/:id/status.

### Week 2 of Sprint 1 (2026-05-06 to 2026-05-12)
1. VM bootstrap script: Docker install, image pull, container start, health check.
2. provisioning-service: health-check confirmation loop, status update to "active".
3. dashboard: provisioning status page with live polling.
4. Integration test: full provisioning lifecycle from job creation to active status.

---

## Engineering Rules Active During Development

### Scope Rules (from mvp-refinement-charter.md)
1. Work only on approved MVP documentation and execution tasks.
2. Do not add any feature beyond current MVP boundaries.
3. Create execution tasks only for already approved MVP items.

### Architecture Rules
1. Control plane and runtime plane must remain isolated at all times. No cross-plane direct calls.
2. Every agent action must pass through the risk engine before execution. No bypass path allowed.
3. Approval records are immutable once written. No update or delete.
4. Audit evidence must be written before action completion is confirmed to caller.
5. Kill-switch must halt all active agent actions within the same request cycle.

### Quality Rules
1. No feature merges without passing integration tests for the covered lifecycle.
2. All Prisma schema changes require migration files. No auto-apply in production.
3. OpenTelemetry traces must be emitted for every service-to-service call.
4. Every API endpoint must have a defined contract (request/response types in shared-types).
5. Secrets must never appear in logs, traces, or error messages.

---

## Pre-Development Verification Checklist
Use this checklist the morning Sprint 0 begins.

- [ ] All engineers have read planning/full-system-architecture-and-execution-v1.md.
- [ ] All engineers have read planning/engineering-execution-design.md.
- [ ] All engineers have read planning/spec-docker-runtime-contract.md and planning/spec-azure-provisioning-workflow.md.
- [ ] All engineers have read planning/spec-connector-auth-flow.md.
- [ ] All engineers have read mvp/mvp-scope-and-gates.md.
- [ ] Architecture decision log reviewed: ADR-001 through ADR-005.
- [ ] Risk register reviewed: all risks are closed.
- [ ] Local environment setup instructions confirmed to work on each engineer's machine.
- [ ] Azure subscription and access confirmed for provisioning work.
- [ ] Container registry access confirmed.
- [ ] Key Vault / Vault-equivalent service confirmed accessible.

---

## Document Status
- Status: Active — development kickoff baseline.
- Effective date: 2026-04-20.
- Owner: Engineering Lead.
- Next review: 2026-04-28 (end of Sprint 0).
- Change control: Any change to sprint scope or critical path requires Architecture Owner and Product Lead sign-off.
- Canonical source map entry: planning/development-kickoff-plan.md.
