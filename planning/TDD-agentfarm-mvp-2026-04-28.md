# Technical Design Document (TDD)

## Document Control
- Product: AgentFarm MVP
- Date: 2026-04-28
- Version: 2.0
- Status: Updated from current implementation baseline

## 1. Technical Goals
1. Provide an end-to-end control-plane to runtime-plane path for tenant automation.
2. Enforce approval governance on risky connector actions.
3. Maintain auditable events and operational visibility for provisioning, runtime, and compliance.

## 2. Monorepo System Context
The workspace is a TypeScript pnpm monorepo with:
1. Apps: website, dashboard, api-gateway, agent-runtime, orchestrator.
2. Services: approval, provisioning, connector, evidence, identity, notification, policy-engine.
3. Packages: shared-types, connector-contracts, queue-contracts, observability, db-schema.
4. Infrastructure directories for control-plane and runtime-plane deployment assets.

## 3. Architecture Layers

### 3.1 Control Plane
Responsibilities:
1. Identity, tenant/workspace lifecycle, session validation.
2. Provisioning orchestration and state reporting.
3. Connector auth/actions/health management.
4. Approval decision intake and enforcement.
5. Audit and retention APIs.

Primary runtime:
- Fastify-based API gateway as control-plane entrypoint.

### 3.2 Runtime Plane
Responsibilities:
1. Agent task intake and processing loop.
2. Health/readiness/liveness signaling.
3. Runtime state transitions and logs.
4. Graceful termination support.

Primary runtime:
- Fastify-based agent runtime running in VM-hosted Docker.

### 3.3 Experience Layer
Responsibilities:
1. Internal operations dashboard for observability/approvals/audit.
2. Public website and marketplace onboarding surfaces.

## 4. Core Technical Flows

### 4.1 Auth and Session Flow
1. User signs up or logs in.
2. Session token and cookie issued.
3. Protected routes validate session and workspace access.
4. Internal routes apply internal policy controls.

### 4.2 Provisioning Lifecycle Flow
State progression:
queued -> validating -> creating_resources -> bootstrapping_vm -> starting_container -> registering_runtime -> healthchecking -> completed.

Failure progression:
failed -> cleanup_pending -> cleaned_up.

Supporting controls:
1. SLA latency calculations.
2. Stuck-job and timeout thresholds.
3. Cleanup retry behavior and rollback recording.

### 4.3 Runtime Lifecycle Flow
1. Startup sequence initializes config/policy/connectors.
2. Worker loop accepts and processes tasks.
3. Health endpoints expose live and ready status.
4. Log and state endpoints provide operator visibility.
5. Kill endpoint triggers graceful stop semantics.

### 4.4 Connector Flow
1. OAuth initiate and callback for supported providers.
2. Token lifecycle worker handles refresh/revoke/reconsent.
3. Normalized action execution maps provider-specific calls.
4. Health checks classify remediation state.

### 4.5 Approval and Enforcement Flow
1. Runtime or gateway classifies risk.
2. Medium/high actions are queued for approval.
3. Approval decision updates immutable records.
4. Approved actions execute; rejected/timeout decisions cancel with event logging.

### 4.6 Audit and Evidence Flow
1. Events are appended to audit store.
2. Filtered query endpoints return compliance subsets.
3. Export pathways support CSV/JSON evidence handoff.
4. Retention endpoint supports cleanup policy execution.

## 5. Component Responsibilities

### 5.1 API Gateway
1. Route composition for auth, provisioning, connectors, approvals, audit.
2. Session and internal access enforcement.
3. Proxy/backing endpoint behaviors for dashboard/website app APIs.

### 5.2 Agent Runtime
1. Execution engine and action result handling.
2. Runtime status/log/state endpoints.
3. Kill and startup lifecycle controls.

### 5.3 Dashboard App
1. Workspace-scoped tab navigation and persistence.
2. Approval queue UX and runtime observability panel.
3. Deep-link copy and audit/evidence interactions.

### 5.4 Website App
1. Marketing and conversion pages.
2. Signup and onboarding paths.
3. Marketplace listing and quick-start flows.

## 6. Data and Contract Strategy
1. Shared package contracts are source of truth for connector and queue payloads.
2. Database schema models tenant, workspace, bot, approval, connector, audit entities.
3. Secret references are persisted; raw secrets are not expected in business tables.
4. Capability/config snapshots support deterministic runtime configuration history.

## 7. API Grouping (Logical Surface)
1. Auth routes: signup/login/logout/internal login policy diagnostics.
2. Provisioning routes: status/progress/timeline/worker-driven state transitions.
3. Connector routes: OAuth lifecycle, action execution, health summary/check.
4. Approval routes: intake, pending list, decision, escalation, metrics.
5. Audit routes: append/query/export/retention.
6. Runtime routes: health/live, health/ready, logs, state, kill.

## 8. Security and Governance Design
1. Session and workspace scope checks are mandatory for protected operations.
2. Internal dashboard access follows allowlist policy controls.
3. Approval gating is required for medium/high risk actions.
4. Error and decision outcomes are traceable through audit events.
5. Secret access is abstracted through secret-store interface and reference model.

## 9. Observability and Operability
1. Dashboard surfaces provisioning SLA, state histories, and runtime signals.
2. Runtime panel includes health, transitions, logs, drilldown actions, and kill status.
3. Runbooks define rollout, validation, security/load, and evidence closure steps.
4. CI workflows include dashboard and website focused lanes.

## 10. Testing and Quality Strategy
1. Typecheck enforced in app/service targets.
2. Quality gate aggregates coverage, regression, and smoke checks.
3. Coverage threshold checks target critical modules.
4. Website and dashboard regression suites validate key UX/control flows.
5. Optional DB smoke lane depends on DATABASE_URL availability.

## 11. Traceability to BRD
1. BR-01 and BR-02 -> auth/session and workspace-scoped guards.
2. BR-03 -> provisioning state machine and SLA monitoring.
3. BR-04 -> runtime health/log/state/kill endpoints.
4. BR-05 -> connector OAuth/token/actions/health subsystem.
5. BR-06 -> approval routing and decision enforcement.
6. BR-07 -> audit ingest/query/export and retention.
7. BR-08 and BR-09 -> dashboard/website UX, CI gates, and runbook closure.

## 12. Open Technical Items for Launch Closure
1. Production deployment execution evidence and environment validation.
2. Website SWA secret and DNS/TLS completion evidence.
3. Final security/load/freshness artifact completion for signoff.


<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).
