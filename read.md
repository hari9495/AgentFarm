# AgentFarm — Technical Overview

AgentFarm is a TypeScript pnpm monorepo for operating AI agents with enterprise control gates. The platform delivers one production-grade Developer Agent role backed by 13 connectors across 4 categories, risk-based autonomy with human approval enforcement, and a complete audit and evidence path for compliance teams.

**Sprint 1 complete as of 2026-05-01.** All 24 local tasks are finished and validated. Three tasks (7.1 SWA deployment, 8.2 Azure production deployment, 8.3 security/load gates) are blocked on external Azure and GitHub secrets and are tracked in [operations/runbooks/mvp-launch-ops-runbook.md](operations/runbooks/mvp-launch-ops-runbook.md).

---

## What We Built

### MVP Outcome
- One production-grade Developer Agent role operating across Jira, Teams, GitHub, and email
- 13 connectors in the plugin registry (task trackers, messaging, code, email)
- Risk-based autonomy: low-risk actions execute immediately, medium/high actions route to the human approval queue
- Full audit and evidence path: append-only audit log, compliance export (JSON and CSV), evidence freshness dashboard
- 19 Tier 1/2 local workspace actions for the Developer Agent (file, git, shell, search)
- 9 LLM providers with Auto mode health-score failover

### Core Product Capabilities
- Tenant and workspace onboarding with HMAC-SHA256 session auth and workspace-scoped row-level security
- Runtime provisioning: 11-step Azure VM state machine with SLA monitoring, failure recovery, and rollback
- Connector authentication, token lifecycle (auto-refresh, revoke, re-consent), and monthly health probes
- Normalized connector action execution with exponential backoff retry and role-policy enforcement
- Approval intake, queue, decision enforcement, escalation, kill-switch, and decision webhook fanout
- Append-only audit log, retention policy (365-day active / 730-day archive), and compliance query API
- Evidence and compliance dashboard: live KPIs, P95 latency, audit event timeline, compliance export
- Website onboarding surfaces: signup, connector dashboard, marketplace, approval inbox, evidence view

---

## System Architecture

### Monorepo Boundaries

```
apps/         deployable surfaces and runtime entrypoints
services/     domain services (provisioning, approvals, connectors, evidence, identity, notifications)
packages/     shared types, contracts, schema, observability
infrastructure/  Azure control-plane and runtime-plane IaC
```

### Applications

| App | Port | Purpose | Test Count |
|-----|------|---------|-----------|
| `apps/api-gateway` | 3001 | Control-plane API: auth, session, connector execution, approvals, audit | 209 |
| `apps/agent-runtime` | — | Per-tenant execution engine: risk classification, LLM dispatch, workspace actions | 118 |
| `apps/dashboard` | 3000 | Operator UI: approval queue, evidence, runtime health, LLM config panel | — |
| `apps/website` | 3002 | Product surface: onboarding, connectors, approval inbox, evidence dashboard | 28+ |
| `apps/orchestrator` | — | Multi-agent workflow coordinator | — |

### Domain Services

| Service | Purpose | Tests |
|---------|---------|-------|
| `services/provisioning-service` | 11-step VM provisioning state machine, bootstrap, SLA | 15 |
| `services/approval-service` | Approval enforcement, kill-switch, governance workflow manager | 12+ |
| `services/connector-gateway` | OAuth flows, token lifecycle, adapter dispatch, health probes | passing |
| `services/policy-engine` | Policy routing and governance rule checks | passing |
| `services/evidence-service` | Governance KPI events, evidence records | passing |
| `services/identity-service` | Tenant, workspace, user lifecycle | — |
| `services/notification-service` | Approval and ops notifications | — |

### Shared Packages

| Package | Purpose |
|---------|---------|
| `packages/shared-types` | Shared TypeScript contracts, enums, and kill-switch types |
| `packages/connector-contracts` | 13-connector registry, normalized action types, role policies |
| `packages/queue-contracts` | Queue event type definitions |
| `packages/db-schema` | Prisma schema and migrations |
| `packages/observability` | Structured telemetry helpers |

---

## Connector Plugin Registry

`packages/connector-contracts/src/index.ts` exports a typed `CONNECTOR_REGISTRY` of 13 (+ generic) connectors:

| Category | Connectors |
|----------|-----------|
| `task_tracker` | Jira, Linear, Asana, Monday, Trello, ClickUp, Generic REST |
| `messaging` | Microsoft Teams, Slack, Discord, Google Chat, Generic REST |
| `code` | GitHub, GitLab, Bitbucket, Azure DevOps, Generic REST |
| `email` | Outlook (Graph), Gmail, Exchange, Generic SMTP, Generic REST |

Each `ConnectorDefinition` carries: `tool`, `label`, `category`, `authMethod`, `configSchema`, `allowedRoles`, `defaultActionPolicyByRole`, and `oauthInitUrl` (for OAuth connectors).

Helper functions: `getConnectorDefinition(tool)`, `getConnectorsByCategory(category)`.

### Normalized Action Types (15)
`read_task`, `create_task`, `update_task`, `delete_task`, `create_comment`, `update_status`, `send_message`, `create_pr`, `create_pr_comment`, `merge_pr`, `send_email`, `read_email`, `deploy_production`, `delete_resource`, `change_permissions`

### Agent Role Keys (12)
`recruiter`, `developer`, `fullstack_developer`, `tester`, `business_analyst`, `technical_writer`, `content_writer`, `devops_engineer`, `security_engineer`, `data_analyst`, `project_manager`, `support_agent`

---

## Key Runtime Flows

### 1. Signup to Operational Workspace
1. POST `/auth/signup` → atomic transaction creates: Tenant (status `provisioning`), TenantUser (role `owner`), Workspace, Bot (status `created`), ProvisioningJob (status `queued`)
2. Session token (HMAC-SHA256) returned as `agentfarm_session` HttpOnly cookie
3. Provisioning worker polls for `queued` jobs and runs 11-step state machine
4. Steps: `queued → validating → creating_resource_group → creating_vm → bootstrapping_docker → registering_runtime → health_checking → completed` (with failure/cleanup paths)
5. Dashboard provisioning card reflects live state with remediation hints on failure

### 2. Connector Action Execution with Governance
1. Agent runtime requests a normalized action via api-gateway
2. Role policy and connector policy checked against `defaultActionPolicyByRole`
3. `classifyRisk()` evaluates: `HIGH_RISK_ACTIONS` = `[merge_pr, merge_release, delete_resource, change_permissions, deploy_production]`, `MEDIUM_RISK_ACTIONS` = `[update_status, create_comment, create_pr_comment, create_pr, send_message]`; confidence < 0.6 escalates to medium
4. Low-risk: executes immediately, writes success audit event
5. Medium/high: creates immutable approval record (status `pending`), returns 201 to runtime
6. Approved action: executes with `executionToken`, writes audit event
7. Rejected action: returns 403 with reason to caller, writes rejection audit event

### 3. Approval Lifecycle
1. Risky action enters `POST /v1/approvals/intake` — immutable approval record created
2. `ApprovalsQueue` UI at `/dashboard/approvals` shows pending items grouped by risk level (HIGH first)
3. Approver submits decision via `PATCH /api/approvals/[id]` with optional reason (required on rejection, minimum 8 characters)
4. `decisionLatencySeconds` computed and stored; P95 latency shown on evidence dashboard
5. `POST /v1/approvals/escalate` marks overdue pending approvals per `escalationTimeoutSeconds` (default 3600s)
6. Kill-switch: `ApprovalEnforcer.activateKillSwitch()` blocks all new medium/high actions within 30-second control window; resume requires `incidentRef` + `authorizedBy`

### 4. Audit and Evidence
1. `writeAuditEvent()` appends to `company_audit_events` SQLite table (no UPDATE/DELETE paths)
2. Events emitted on: signup, login, connector add/remove, approval request, approval decision, action executed, action blocked, provisioning state changes
3. Query API `GET /api/audit/events?actorEmail=&action=&from=&to=&limit=` with tenant isolation
4. Evidence summary `GET /api/evidence/summary?windowHours=24` computes: requests, pending, approved, rejected, escalated, P95 latency, freshness seconds
5. Compliance export `GET /api/evidence/export?format=json|csv` returns full `ComplianceEvidencePack` with 365-day active / 730-day archive retention policy

### 5. Connector Setup and Token Lifecycle
1. User visits `/connectors` → connector dashboard UI shows available connectors by category
2. Click "Connect" → OAuth flow initiates via `oauthInitUrl` with CSRF state nonce
3. Callback: nonce validated, token stored as Key Vault reference (never in DB), `TenantConnector` record created
4. Token lifecycle worker: auto-refreshes before expiry, routes `permission_invalid` / `insufficient_scope` → `consent_pending`
5. Health probe: monthly scope validation, maps remediation: re-auth / re-consent / backoff

### 6. LLM Decision Adapter
1. Execution engine calls `LLMDecisionAdapter` with action context
2. Provider chain resolved by `profile` setting: `ultra_low_cost`, `balanced`, `premium_quality`, or `auto`
3. Auto mode: iterates priority list ordered by 5-minute rolling health score (composite error-rate + latency)
4. Heuristic fallback fires if all providers fail
5. Supported: `openai`, `azure_openai`, `github_models`, `anthropic`, `google`, `xai`, `mistral`, `together`, `agentfarm`

---

## Developer Agent — Tier 1/2 Local Workspace Actions

Implemented in `apps/agent-runtime/src/local-workspace-executor.ts` with `safeChildPath` sandbox enforcement on all file and shell operations.

| Action | Risk | Description |
|--------|------|-------------|
| `workspace_list_files` | low | Recursive dir walk, configurable depth, pattern filter, skips .git/node_modules/dist |
| `workspace_grep` | low | Regex search, optional context lines, returns `[{file, line, col, text}]` |
| `workspace_tree` | low | Directory tree with depth limit |
| `workspace_summary` | low | Token-budget-aware project summary |
| `workspace_search_symbol` | low | Symbol search across workspace |
| `file_read` | low | Read file with optional line range |
| `file_write` | medium | Write/overwrite file, creates parents |
| `file_patch` | medium | Apply unified diff patch |
| `file_move` | medium | Rename/move within sandbox |
| `file_delete` | medium | Delete file/directory, recursive flag |
| `workspace_replace` | medium | Find-and-replace across workspace |
| `workspace_apply_patch` | medium | Apply multi-file patch bundle |
| `git_status` | low | Git status output |
| `git_diff` | low | Git diff with optional path filter |
| `git_create_branch` | medium | Create new branch |
| `git_checkout` | medium | Checkout branch |
| `git_commit` | medium | Stage and commit with message |
| `git_push` | high | Push to remote (requires approval) |
| `shell_run` | high | Execute shell command in sandbox (requires approval) |

---

## Security and Reliability Posture

- No connector secrets stored in relational records — only Key Vault `kv://` references persisted
- Workspace and tenant scoping enforced at session and route level with workspace RLS
- Approval immutability: `409 Conflict` returned on any attempt to re-decide a concluded approval
- Kill-switch governance: 30-second control window halts risky execution; authorized resume requires incident reference
- CSRF nonce validation on all OAuth connector callback flows with replay rejection
- Timing-safe password hash comparison on login to prevent user enumeration
- Exponential backoff (50ms → 100ms) on transient connector action failures
- State-machine cleanup and rollback on provisioning failures

---

## Quality and Test Discipline

### Monorepo Quality Commands

```bash
pnpm build               # build all packages
pnpm test                # run all tests
pnpm typecheck           # typecheck all packages
pnpm quality:gate        # run full 32-check quality gate
pnpm smoke:e2e           # E2E auth/session smoke lane
pnpm verify:website:prod # production website verification
```

### Quality Gate Summary (as of 2026-05-01)

| Check | Status |
|-------|--------|
| API Gateway coverage gate | ✅ PASS |
| Agent Runtime coverage gate | ✅ PASS |
| API Gateway typecheck | ✅ PASS |
| Agent Runtime typecheck | ✅ PASS |
| Dashboard typecheck | ✅ PASS |
| Provisioning service typecheck + regression | ✅ PASS |
| Website signup regression | ✅ PASS |
| Website provisioning worker regression | ✅ PASS |
| Website session auth + RLS regression | ✅ PASS |
| Website provisioning progress UI regression | ✅ PASS |
| Website deployment flow regression | ✅ PASS |
| Website deployment UI regression | ✅ PASS |
| **Website approvals regression (Task 5.2/5.3)** | ✅ PASS |
| **Website evidence compliance regression (Task 6.1/6.2)** | ✅ PASS |
| Website E2E smoke lane | ✅ PASS |
| Contract versioning and compatibility | ✅ PASS |
| Import boundary enforcement | ✅ PASS |
| Orchestrator typecheck + tests | ✅ PASS |
| API Gateway task lease race-condition tests | ✅ PASS |
| Connector Gateway typecheck + tests | ✅ PASS |
| Approval Service typecheck + tests | ✅ PASS |
| Evidence Service typecheck + tests | ✅ PASS |
| Shared Types typecheck | ✅ PASS |
| Connector Contracts typecheck | ✅ PASS |
| Observability package typecheck | ✅ PASS |
| Policy Engine typecheck + tests | ✅ PASS |
| DB Runtime snapshot smoke lane | ⏭ SKIP (no Docker) |

### Coverage Thresholds (≥80% line coverage enforced)

| Module | Coverage |
|--------|---------|
| `execution-engine.ts` | 95.04% |
| `provisioning-monitoring.ts` | 94.44% |
| `action-result-writer.ts` | 93.10% |
| `runtime-server.ts` | 81.45% |
| `api-gateway` (overall) | 72.07% (critical modules enforced) |
| `agent-runtime` (overall) | 79.91% |

---

## Repository Quick Start

### Prerequisites
- Node.js LTS (v20+) or Node.js v24
- pnpm (workspace package manager)
- Optional: Docker for full integration paths, Azure CLI for production deployment

### Install and Run

```bash
# 1. Install all workspace dependencies
pnpm install

# 2. Copy and fill environment variables
cp .env.example .env

# 3. Enable local signup (add to .env)
AGENTFARM_ALLOWED_SIGNUP_DOMAINS=agentfarm.local

# 4. Start website (port 3002) — full product surface
pnpm --filter @agentfarm/website dev

# 5. Start API gateway (port 3001)
pnpm --filter @agentfarm/api-gateway dev

# 6. Start operator dashboard (port 3000)
pnpm --filter @agentfarm/dashboard dev
```

### Key Test Commands

```bash
# Run all website tests
pnpm --filter @agentfarm/website test:signup
pnpm --filter @agentfarm/website test:approvals
pnpm --filter @agentfarm/website test:evidence
pnpm --filter @agentfarm/website test:permissions
pnpm --filter @agentfarm/website test:session-auth

# Run all api-gateway tests (209)
pnpm --filter @agentfarm/api-gateway test

# Run all agent-runtime tests (118)
pnpm --filter @agentfarm/agent-runtime test

# Full quality gate (32 checks)
pnpm quality:gate
```

---

## Environment and Configuration

| Variable | Purpose |
|----------|---------|
| `AGENTFARM_ALLOWED_SIGNUP_DOMAINS` | Comma-separated domains allowed to self-serve signup (e.g. `agentfarm.local`) |
| `AGENTFARM_COMPANY_EMAILS` | Specific emails allowed company portal access |
| `AGENTFARM_COMPANY_DOMAINS` | Domain allowlist for company portal access |
| `CONNECTOR_GITHUB_CLIENT_ID/SECRET` | GitHub OAuth app credentials |
| `CONNECTOR_JIRA_CLIENT_ID/SECRET` | Jira OAuth app credentials |
| `CONNECTOR_TEAMS_CLIENT_ID/SECRET` | Microsoft Teams OAuth app credentials |
| `SESSION_SECRET` | HMAC-SHA256 signing key for session tokens |
| `WEBSITE_AUTH_DB_PATH` | SQLite database path for website auth store (default: `.auth.sqlite`) |

Never commit secrets to source. All connector tokens are stored as Key Vault references at runtime.

---

## Deployment and Operations

- **Infrastructure**: separated into `infrastructure/control-plane/` (PostgreSQL, Redis, Container Registry, Key Vault, monitoring) and `infrastructure/runtime-plane/` (per-tenant VM, NIC, disk, NSG, managed identity)
- **Website**: Azure Static Web App via `.github/workflows/website-swa.yml` — blocked on `AZURE_STATIC_WEB_APPS_API_TOKEN_WEBSITE` GitHub secret
- **Production deployment**: tracked in [operations/runbooks/mvp-launch-ops-runbook.md](operations/runbooks/mvp-launch-ops-runbook.md)
- **Operations docs**: quality reports and runbooks maintained under `operations/`

---

## Sprint 1 Task Completion Summary

| Workstream | Tasks | Status |
|-----------|-------|--------|
| 1 — Signup and Tenant Lifecycle | 1.1, 1.2, 1.3 | ✅ All completed |
| 2 — Azure Runtime Provisioning | 2.1, 2.2, 2.3, 2.4 | ✅ All completed |
| 3 — Docker Runtime and Bot Execution | 3.1, 3.2, 3.3 | ✅ All completed |
| 4 — Connector Auth and Action Execution | 4.1, 4.2, 4.3, 4.4 | ✅ All completed |
| 5 — Approval and Risk Controls | 5.1, 5.2, 5.3 | ✅ All completed |
| 6 — Audit, Evidence, and Observability | 6.1, 6.2 | ✅ All completed |
| 7 — Website and Marketplace | 7.2 | ✅ Completed; 7.1 blocked on Azure/GitHub |
| 8 — Testing and Deployment | 8.1 | ✅ Completed; 8.2, 8.3 blocked on Azure |
| 9 — Tier 1/2 Workspace Actions | 9.1–9.11+ | ✅ All completed |

---

## Who This Repository Is For

- **Platform engineers** building controlled AI agent systems
- **AI runtime engineers** implementing governed autonomy with human oversight
- **Security and compliance teams** requiring auditable decision and execution traces
- **Product and operations leads** preparing pilot-ready enterprise delivery

## What We Built

### MVP Outcome
- One high-quality Developer Agent role
- Four production connectors for action execution
  - Jira
  - Microsoft Teams
  - GitHub
  - Company email workflow
- Risk-based autonomy model
  - Low-risk actions execute directly
  - Medium and high-risk actions are routed through human approval
- Full audit and evidence path
  - Action events
  - Approval decisions
  - Query and export capabilities for compliance

### Core Product Capabilities
- Tenant and workspace onboarding with authenticated sessions
- Runtime provisioning lifecycle and monitoring
- Connector authentication, token lifecycle, and health remediation
- Normalized connector action execution API
- Approval intake, queue, decisions, escalation, and decision webhooks
- Append-only audit ingestion, query, retention cleanup
- Evidence and compliance dashboard views
- Website and dashboard user experience for operators and approvers

## Product Goals and Gates

The MVP is intentionally governance-first.

### Included in MVP
- Role-based task handling
- Identity setup behavior standards
- Human approval flow for risky actions
- Action logs and audit trail
- Weekly quality reporting
- Connector contracts for Jira, Teams, GitHub, and company email
- Evidence records for active release gates

### Explicitly Not Included in MVP
- Multi-role launch at once
- Deep enterprise customizations
- Large analytics suite
- Advanced multi-region scaling
- Live meeting voice participation
- HR interview automation mode

### Launch Gate Themes
- Identity realism
- Role fidelity and task quality
- Autonomy with human approval
- No critical security issues
- Pilot readiness
- Architecture gate approvals
- Architecture exit criteria complete

## System Architecture

AgentFarm is organized into control-plane, runtime-plane, and evidence-plane concerns.

### Monorepo Boundaries
- apps
  - Deployable app surfaces and runtime entrypoints
- services
  - Domain services for identity, provisioning, approvals, policies, connectors, evidence, notifications
- packages
  - Shared types, contracts, schema, and observability
- infrastructure
  - Azure control-plane and runtime-plane IaC

### Main Applications
- apps/api-gateway
  - Primary API surface
  - Auth, session scope, route orchestration, connector execution, approvals, audit endpoints
- apps/agent-runtime
  - In-runtime execution engine for the Developer Agent
  - Risk classification and action orchestration
- apps/dashboard
  - Operator and governance interface
  - Approval queue, evidence views, runtime and deployment visibility
- apps/website
  - Product and onboarding web experience
- apps/orchestrator
  - Workflow coordination layer for multi-agent/runtime orchestration

### Domain Services
- services/identity-service
  - Tenant/workspace/user lifecycle
- services/provisioning-service
  - Provisioning state machine, bootstrap, cleanup, SLA checks
- services/approval-service
  - Approval enforcement and kill-switch governance
- services/policy-engine
  - Policy routing and governance checks
- services/connector-gateway
  - Connector auth and adapter flows
- services/evidence-service
  - Evidence and KPI governance events
- services/notification-service
  - Approval and ops notifications

### Shared Packages
- packages/shared-types
  - Shared contracts and enums
- packages/connector-contracts
  - Connector action and result contract definitions
- packages/queue-contracts
  - Queue event contracts
- packages/db-schema
  - Prisma schema and migrations
- packages/observability
  - Structured telemetry and observability helpers

## Key Runtime Flows

### 1. Signup to Operational Workspace
1. User signs up
2. Tenant and workspace entities are created
3. Provisioning job is enqueued
4. Runtime resources move through state transitions
5. Dashboard reflects live provisioning status and remediation hints on failure

### 2. Connector Action Execution with Governance
1. Runtime requests action execution through API gateway
2. Role policy and connector policy are checked
3. Action risk is classified
4. For medium/high actions, approval is required when approval enforcement is configured
5. Approved actions execute and write success audit events
6. Failed actions write failure audit events with mapped severity and reason

### 3. Approval Lifecycle
1. Risky action enters approval intake
2. Approval record is created and remains immutable for guarded fields
3. Approver decides approve/reject/timeout reject with required rationale on rejecting outcomes
4. Decision can notify runtime by webhook
5. Escalation endpoint marks overdue pending approvals according to timeout policy

### 4. Audit and Evidence
1. Events are appended to audit storage
2. Query API supports filtering and cursor pagination
3. Retention cleanup supports dry-run and delete execution
4. Dashboard supports freshness tracking, filtering, and export for compliance

## Security and Reliability Posture

- No connector secrets stored directly in relational records; references are persisted and resolved through secret storage flows
- Workspace and tenant scoping enforced through session and route checks
- Approval immutability and kill-switch patterns included
- Error classification for connector failures (permission, timeout, provider limits, transient failures)
- Retry and backoff paths for transient execution errors
- State-machine cleanup and rollback handling for provisioning failures

## Quality and Test Discipline

### Monorepo Quality Commands
- pnpm build
- pnpm test
- pnpm typecheck
- pnpm quality:gate
- pnpm smoke:e2e
- pnpm verify:website:prod

### Current Validation Profile
- Dedicated quality gate report with broad checks across API gateway, runtime, dashboard, website, services, contracts, and policy modules
- Coverage thresholds enforced on critical backend targets
- E2E smoke lane validates core auth/session and protected route behavior

## Repository Quick Start

### Prerequisites
- Node.js LTS
- pnpm (workspace package manager)
- Optional local database/runtime dependencies for full integration paths

### Install
1. pnpm install

### Run Common Workflows
- API gateway dev mode
  - pnpm dev
- Full workspace test sweep
  - pnpm test
- Workspace typecheck
  - pnpm typecheck
- Release quality gate
  - pnpm quality:gate

## Environment and Configuration Notes

- Use .env.example as baseline for environment setup
- Keep secrets out of source files and environment examples
- Follow least-privilege assumptions for connector credentials and identity paths
- Keep app to service boundaries explicit through shared contracts in packages

## Deployment and Operations

- Infrastructure is separated by control-plane and runtime-plane boundaries
- Website includes static web app deployment workflow and production verification script
- Operations runbooks and quality reports are maintained under operations

## Current Delivery Snapshot

- Most MVP build tracks are complete and validated in local quality gates
- Remaining launch-readiness work is primarily release-operations execution and external platform steps (production deployment wiring, domain and DNS, and final security/load/evidence signoff artifacts)

## Who This Repository Is For

- Platform engineers building controlled AI agent systems
- AI runtime engineers implementing governed autonomy
- Security and compliance teams requiring auditable decision and execution traces
- Product and operations leads preparing pilot-ready enterprise delivery

---

If you want, the next step is to add a concise README.md that links to this detailed read.md plus a docs index for Architecture, Runbooks, and Quality Evidence.