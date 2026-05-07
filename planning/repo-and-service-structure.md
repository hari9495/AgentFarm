# AgentFarm Repo and Service Structure

## Purpose
Define the monorepo folder layout, service names, package names, and file conventions
that every engineer uses from day one. This is the source of truth for "where does X live."

## Authority
- Architecture baseline: planning/product-architecture.md
- Engineering design: planning/engineering-execution-design.md
- Toolset: TypeScript + Node.js LTS, NestJS/Fastify, Next.js/Tailwind, PostgreSQL/Prisma, Redis/BullMQ, OPA, OpenTelemetry

## Latest Build Snapshot
- Current cross-service implementation closure reference: planning/build-snapshot-2026-05-07.md
- Current continuation and blocker reference: planning/session-handoff-2026-05-07-d-drive.md

---

## Top-Level Monorepo Structure

```
agentfarm/
├── apps/                        # Deployable applications
│   ├── api-gateway/             # NestJS — control plane API entry point
│   ├── dashboard/               # Next.js + Tailwind — operator and tenant UI
│   ├── agent-runtime/           # OpenClaw agent runner (Docker image, per-VM)
│   │                            # Skills crystallization (Hermes pattern), 239 tests
│   ├── orchestrator/            # Paperclip multi-agent workflow coordinator
│   │                            # GOAP A* planner, heartbeat wake, routine scheduler
│   └── website/                 # Next.js 14 — public/tenant-facing web
│
├── services/                    # Internal domain services (NestJS/Fastify)
│   ├── agent-question-service/  # Human-in-the-loop question lifecycle and timeout sweep helpers
│   ├── agent-observability/     # Browser/desktop evidence capture primitives and audit wrappers
│   ├── identity-service/        # Tenant, workspace, user, plan management
│   ├── provisioning-service/    # Azure VM lifecycle and bootstrap (11-step state machine)
│   ├── approval-service/        # Approval routing, records, kill-switch, multi-stakeholder
│   ├── policy-engine/           # OPA-based risk classification sidecar
│   ├── connector-gateway/       # Connector auth, token lifecycle, action dispatch,
│   │                            # mTLS cert verifier, PII-strip middleware
│   ├── audit-storage/           # Azure Blob-backed evidence artifact storage and signed URL helpers
│   ├── memory-service/          # Short-term and long-term memory read/write service layer
│   ├── evidence-service/        # Audit record and evidence writes, HNSW vector index,
│   │                            # governance KPI calculator
│   ├── compliance-export/       # Compliance evidence export packaging
│   ├── notification-service/    # Approval notification gateway: Telegram, Slack, Discord,
│   │                            # Webhook, Voice (VoxCPM), dispatchApprovalAlert(),
│   │                            # per-trigger allowlists, 31 tests
│   ├── retention-cleanup/       # Retention enforcement and cleanup routines
│   └── meeting-agent/           # AI-facilitated meeting lifecycle, voice pipeline (STT/TTS)
│
├── packages/                    # Shared internal libraries (not deployed independently)
│   ├── shared-types/            # TypeScript interfaces and enums shared across all services
│   ├── db-schema/               # Prisma schema, migrations, and seed scripts
│   ├── queue-contracts/         # BullMQ job type definitions
│   ├── connector-contracts/     # Normalized connector action and event types
│   └── observability/           # OpenTelemetry tracer, logger, and metrics setup
│
├── infrastructure/              # Infrastructure as Code
│   ├── control-plane/           # Bicep/Terraform for shared resource group
│   └── runtime-plane/           # Bicep/Terraform per-tenant VM template
│
├── scripts/                     # Developer utility scripts
│   ├── quality-gate.mjs         # CI orchestrator — 47 checks
│   ├── graphify.mjs             # Monorepo package dependency graph (Mermaid/DOT/JSON)
│   ├── e2e-smoke.mjs            # E2E smoke tests (dashboard + website)
│   ├── coverage-threshold-check.mjs  # Coverage summary validator
│   ├── a4-contract-validation.mjs    # Contract versioning validator
│   ├── a4-import-boundary-check.mjs  # Import boundary enforcer
│   └── website-swa-verify.mjs   # SWA deployment verifier
├── docs/                        # README index pointing to planning/ docs
├── .github/                     # CI/CD workflows, PR templates, branch rules
├── docker-compose.yml           # Local development stack (PostgreSQL, Redis, OPA)
├── pnpm-workspace.yaml          # pnpm monorepo workspace definition
├── tsconfig.base.json           # Shared TypeScript base config
├── .eslintrc.js                 # Shared lint rules
├── .prettierrc                  # Shared format rules
└── package.json                 # Root scripts: build, lint, test, dev
```

---

## Application Detail

### apps/api-gateway
- Framework: Fastify
- Role: Single entry point for all control-plane API calls from the dashboard and external clients.
- Responsibilities: Authentication, authorization, rate limiting, request routing, SSE task-stream.
- Port: 3000 (local), proxied via Azure Load Balancer in production.
- Key routes: auth, approvals, audit, connectors, budget, roles, snapshots, plugins, LLM config, governance, task lease, provisioning workers, SSE `/sse/tasks/:botId`.
- Tests: 351 passing.

### apps/dashboard
- Framework: Next.js (App Router) + Tailwind CSS
- Role: Operator and tenant-facing web UI.
- Responsibilities: Provisioning status, approval queue, evidence log, bot health views.
- Port: 3001 (local).
- API dependency: apps/api-gateway exclusively. No direct service calls.
- Pages (Sprint 1): /status/:tenantId, /provision (Sprint 1). /approvals, /evidence (Sprint 2).

### apps/agent-runtime
- Runtime: OpenClaw agent runner.
- Role: Runs inside per-tenant Docker container on the isolated Azure VM.
- Responsibilities: Receive task assignment from orchestrator, execute role steps, call connector-gateway, emit action events.
- Key modules: `runtime-server.ts` (70+ types, 12 tiers workspace actions, risk classification), `skills-registry.ts` (crystallization lifecycle).
- Not deployed to control plane. Deployed as Docker image pulled to per-tenant VM.
- Config source: Environment variables injected at container start by bootstrap script.
- Health endpoint: /health (used by provisioning health-check loop).
- Tests: 239 passing.

### apps/orchestrator
- Runtime: Paperclip multi-agent workflow coordinator.
- Role: Routes tasks from API intake to the correct agent-runtime instance.
- Responsibilities: Task assignment, lifecycle coordination, escalation routing, kill-switch propagation, goal planning.
- Key modules: `goap-planner.ts` (A* GOAP), `task-scheduler.ts` (heartbeat wake with coalescing), `routine-scheduler.ts` (feature-flagged routines), `plugin-capability-guard.ts`, `orchestrator-state-store.ts` (file/DB backend).
- Communicates with agent-runtime via internal RPC (control plane to VM over private network).

---

## Service Detail

### services/identity-service
- Plane: Control plane.
- Domain: Tenant, workspace, user, and plan lifecycle.
- Key tables: tenants, tenant_users, plans, workspaces.
- Key events produced: tenant.created, user.created, plan.assigned.
- Key jobs consumed: None in Sprint 1.
- API (internal): Used by api-gateway only. Not exposed externally.

### services/provisioning-service
- Plane: Control plane (orchestrates runtime plane).
- Domain: Azure VM lifecycle, bootstrap, and status tracking.
- Key tables: provisioning_jobs, tenant_runtime_resources.
- Key jobs consumed: ProvisioningJob (from BullMQ provisioning queue).
- Key events produced: provisioning.state_changed, provisioning.completed, provisioning.failed.
- Azure SDK calls: Resource group, managed identity, VM, NIC, disk, NSG, monitoring agent.
- Sprint 1 primary service.

### services/approval-service
- Plane: Control plane.
- Domain: Approval request routing, approval records, kill-switch.
- Key tables: approval_requests, approval_records.
- Key events consumed: action.approval_required.
- Key events produced: approval.granted, approval.denied, killswitch.activated.
- SLA: Approval notification delivery P95 target from planning/architecture-decision-log.md.
- Sprint 2 primary service.

### services/policy-engine
- Plane: Control plane (sidecar pattern).
- Domain: OPA-based risk rule evaluation.
- Runtime: OPA server process alongside policy-engine wrapper.
- Input: Action type, action metadata, bot role, connector context.
- Output: Risk level (low, medium, high), decision reason, policy version.
- OPA policy bundles: stored in infrastructure/control-plane/opa-policies/.
- Sprint 2 primary service.

### services/connector-gateway
- Plane: Control plane (proxied through to runtime plane actions).
- Domain: Connector auth, token lifecycle, normalized action dispatch.
- Key additions (Sprint 2): mTLS certificate verification (`mtls-verifier.ts`), PII-strip middleware (`pii-filter.ts`).
- Supported connectors (MVP only): 18-connector registry in `@agentfarm/connector-contracts`.
- Key tables: bot_connector_states, connector_tokens (encrypted at rest).
- Key flows: OAuth initiation, callback, token storage, token refresh, revocation, health check.
- Action dispatch: receives normalized ConnectorAction, routes to connector-specific adapter.

### services/evidence-service
- Plane: Evidence plane.
- Domain: Audit record writes, evidence immutability, retention tagging, semantic evidence retrieval.
- Key tables: action_records, approval_evidence, provisioning_evidence.
- Key modules: `hnsw-index.ts` (HNSW approximate nearest-neighbour vector index), `governance-kpi.ts` (KPI calculator, evidence chain completeness).
- Write policy: Evidence is append-only. No update or delete operations allowed.
- Retention tag: Set at write time. Active: 12 months. Archive: 24 months.

### services/audit-storage
- Plane: Evidence plane.
- Domain: Blob-backed storage for screenshots and other audit artifacts.
- Key modules: `azure-blob-storage.ts`, `screenshot-uploader.ts`.
- Current role: uploads browser evidence artifacts and returns signed URLs for dashboard/session replay consumption.
- Workspace note: package metadata is source-first so fresh workspace installs resolve without a prior build.

### services/agent-observability
- Plane: Runtime/evidence boundary.
- Domain: Browser and desktop action capture, assertion helpers, and audit-log writing.
- Key modules: `browser-agent-wrapper.ts`, `browser-action-with-upload.ts`, `desktop-agent-wrapper.py`, `audit-log-writer.ts`, `diff-verifier.ts`.
- Current role: provides browser action executors, desktop sidecar evidence capture, and accessibility-tree collection for Windows/Linux.

### services/memory-service
- Plane: Evidence/control-plane bridge.
- Domain: Short-term task memory and long-term learned-pattern storage.
- Key modules: `memory-store.ts`, `memory-types.ts`.
- Current role: injects memory into runtime decisions, persists post-task memory, and records code-review learned patterns.

### services/agent-question-service
- Plane: Control plane.
- Domain: Human follow-up questions raised by agents and resolved through dashboard/webhook paths.
- Current role: create, answer, list pending, and sweep expired questions for orchestrator/runtime workflows.

### services/notification-service
- Plane: Control plane.
- Domain: Approval-scoped notification dispatch gateway.
- Channel adapters: Telegram, Slack, Discord, Webhook (generic HTTP), Voice (VoxCPM/VoIP).
- Key exports: `dispatch()`, `dispatchApprovalAlert()`, `APPROVAL_TRIGGERS`, channel adapter send/build functions.
- `NotificationChannelConfig.allowedTriggers?: NotificationEventTrigger[]` — optional per-channel trigger scope.
- `dispatchApprovalAlert()` enforces approval-only trigger filter; returns `[]` for non-approval calls.
- Tests: 31 passing.

---

## Package Detail

### packages/shared-types
- Content: TypeScript interfaces and enums for every cross-service contract (100+ types).
- Key types:
  - Tenant, TenantStatus, Bot, BotStatus, ProvisioningJob, ProvisioningState
  - ApprovalRequest, ApprovalRecord, ApprovalDecision
  - ActionRecord, EvidenceRecord
  - ConnectorAction, ConnectorActionResult, RiskLevel
  - GOAP types: GoalPlan, GoalAction, GoalWorldState
  - Skills types: SkillRecord, SkillCrystallizationRecord
  - Voice/Meeting types: MeetingSessionRecord, VoicePipelineConfig
  - Notification types: NotificationRecord, NotificationChannelConfig (with `allowedTriggers?: NotificationEventTrigger[]`), NotificationDispatchResult
- Rule: No service imports types from another service. All shared types live here only.

### packages/db-schema
- Content: Prisma schema file, all migrations, seed scripts.
- Schema file: packages/db-schema/prisma/schema.prisma.
- Tables in scope for Sprint 1: tenants, tenant_users, plans, workspaces, bots, bot_roles, provisioning_jobs, tenant_runtime_resources.
- Tables added in Sprint 2: bot_connector_states, connector_tokens, approval_requests, approval_records, action_records, approval_evidence.
- Rule: All schema changes require a versioned migration file. Never use prisma db push in production.

### packages/queue-contracts
- Content: BullMQ job type definitions and queue name constants.
- Queues defined:
  - QUEUE_PROVISIONING: jobs of type ProvisioningJob.
  - QUEUE_APPROVAL: jobs of type ApprovalNotificationJob.
  - QUEUE_EVIDENCE: jobs of type EvidenceWriteJob.
- Rule: Queue names are string constants here only. No magic strings in service code.

### packages/connector-contracts
- Content: Normalized connector action and event type definitions.
- ConnectorAction fields: connector, action_type, actor_bot_id, tenant_id, payload, risk_hint, correlation_id.
- ConnectorActionResult fields: success, connector, action_type, timestamp, evidence_ref, error_code.
- Connector identifiers (enum): jira, teams, github, company_email.
- Rule: No connector-specific payload types leak into shared-types. Connector-specific shapes stay inside connector-gateway.

### packages/observability
- Content: OpenTelemetry tracer factory, structured logger factory, Prometheus metrics setup.
- Every service imports createTracer(serviceName) and createLogger(serviceName) from this package.
- Trace context propagation: W3C TraceContext headers on all inter-service HTTP calls.
- Log format: JSON structured log with trace_id, span_id, service, level, message, timestamp.
- Metrics: Prometheus counters and histograms registered per service for key operations.

---

## Current Documentation Notes (2026-05-08)

1. The browser/desktop evidence foundation is present in repo via `services/audit-storage`, `services/agent-observability`, dashboard session replay pages, and `apps/agent-runtime/src/runtime-audit-integration.ts`.
2. The question and learned-pattern continuation work is present in `apps/api-gateway/src/routes/questions.ts`, `apps/api-gateway/src/routes/webhooks.ts`, and `services/memory-service`.
3. Repo-wide `pnpm quality:gate` is currently blocked by two failing tests in `apps/api-gateway/src/routes/questions.test.ts`; do not treat the entire workspace as green until that regression is fixed.

---

## Infrastructure Detail

### infrastructure/control-plane/
- Purpose: Shared resource group used by all tenants.
- Resources: Azure PostgreSQL Flexible Server, Azure Cache for Redis, Azure Container Registry, Azure Key Vault, Azure Monitor workspace, Azure Load Balancer.
- Tooling: Bicep (preferred) or Terraform.
- Secrets: Key Vault references only. No credentials in template files.
- State file (if Terraform): Stored in Azure Storage Account, never in repo.

### infrastructure/runtime-plane/
- Purpose: Per-tenant resource group template instantiated by provisioning-service.
- Resources: VM, NIC, managed disk, NSG, user-assigned managed identity, Azure Monitor agent.
- Parameterized by: tenant_id, workspace_id, vm_size (from plan), region.
- VM size default (MVP): Standard_B2s (cost-optimized for MVP pilot).
- NSG rules: Inbound: blocked except health-check port from control plane IP. Outbound: HTTPS to container registry and Key Vault only.
- Bootstrap script: injected as VM custom data. Installs Docker, pulls agent image, starts container.

---

## File and Naming Conventions

### TypeScript
- Files: kebab-case. Example: tenant-service.ts, provisioning-job.consumer.ts.
- Classes: PascalCase. Example: TenantService, ProvisioningJobConsumer.
- Interfaces: PascalCase with no "I" prefix. Example: Tenant, ProvisioningJob.
- Enums: PascalCase. Example: TenantStatus, BotStatus.
- Constants: SCREAMING_SNAKE_CASE. Example: QUEUE_PROVISIONING.

### NestJS
- Module file: [domain].module.ts
- Service file: [domain].service.ts
- Controller file: [domain].controller.ts
- Consumer file: [domain].consumer.ts
- Each domain lives in a folder matching the module name.

### Database
- Table names: snake_case plural. Example: tenants, provisioning_jobs.
- Column names: snake_case. Example: tenant_status, created_at.
- Foreign keys: referenced_table_id. Example: tenant_id, bot_id.
- Enum types in Prisma: PascalCase matching TypeScript enum. Example: TenantStatus.

### API Routes
- Versioned: /v1/[resource]
- REST conventions: POST to create, GET to read, PATCH to update state, DELETE only where explicitly approved in scope.
- Status codes: 201 for creation, 200 for reads, 202 for async operations (provisioning), 409 for conflict, 422 for validation.

### Environment Variables
- Prefix by service: API_GATEWAY_, IDENTITY_, PROVISIONING_, APPROVAL_, CONNECTOR_, EVIDENCE_.
- Never hardcode values. Always read from process.env with validation at startup.
- .env.example committed to repo. .env files in .gitignore.

---

## Service Communication Rules
1. Dashboard → api-gateway only. HTTP/REST.
2. api-gateway → identity-service, provisioning-service, approval-service, evidence-service, connector-gateway. HTTP/REST (internal).
3. provisioning-service → BullMQ. Async job dispatch and consumption.
4. approval-service → notification-service. Event via BullMQ approval queue.
5. agent-runtime → connector-gateway. HTTP/REST over Azure private network.
6. agent-runtime → orchestrator. RPC over Azure private network.
7. policy-engine: OPA sidecar on localhost within approval-service or orchestrator process. No external HTTP call.
8. No service calls evidence-service directly except through api-gateway or through the internal evidence write queue.
9. No service imports the Prisma client of another service. Each service owns its own Prisma client scoped to its tables.

---

## Document Status
- Status: Active — monorepo baseline.
- Effective date: 2026-04-20.
- Owner: Engineering Lead.
- Next review: 2026-04-28 (end of Sprint 0).
- Change control: Any structural change to service boundaries requires Architecture Owner approval.
- Canonical source map entry: planning/repo-and-service-structure.md.

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).
