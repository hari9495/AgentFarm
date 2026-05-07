# AgentFarm

> Operate AI agents with enterprise control gates — human approval, audit trails, and governed autonomy from day one.

AgentFarm is a TypeScript pnpm monorepo that delivers a production-grade AI agent platform. The MVP ships one high-quality Developer Agent role with 18 live connectors across 4 categories, risk-based autonomy, a full approval enforcement stack, a complete audit/evidence path for compliance, and a desktop-operator abstraction for browser, app, and meeting automation.

**Quality gate: PASS (47 checks, 46 passing, 1 skipped: DB smoke lane). 1,392 tests passing across all packages.**

## Current Build Status (2026-05-08)

- Sprint 6 hardening completed — quality gate report at `operations/quality/8.1-quality-gate-report.md`
- Desktop Operator abstraction added: frozen `DesktopOperator` interface in `shared-types`, `MockDesktopOperator` factory in `agent-runtime`, and mock short-circuits wired into all four Tier 11/12 desktop action cases
- All 1,392 tests pass across 14 packages; 0 failures
- Latest full quality gate: PASS (2026-05-06T18:03:49 → 18:08:14)

---

## Full Documentation

→ **[read.md](read.md)** — complete technical reference: architecture, contracts, flows, tier table, quality posture, and quick start

---

## Architecture at a Glance

```
apps/
  api-gateway/          ← control-plane API: auth, approvals, audit, connector execution,
                          budget policy, roles, snapshots, plugin loading, LLM config,
                          governance workflows, task lease, provisioning workers,
                          SSE task-stream with auto-recovery
                          388 tests passing | typecheck clean | ≥80% line coverage enforced

  agent-runtime/        ← per-tenant execution engine: risk classification, action dispatch,
                          10 LLM providers (incl. Auto mode), 12 tiers of workspace actions,
                          skills crystallization (Hermes pattern), desktop-action governance,
                          DesktopOperator mock factory (DESKTOP_OPERATOR env var)
                          661 tests passing | typecheck clean | ≥80% line coverage enforced

  dashboard/            ← operator UI: approval queue, evidence panel, runtime observability,
                          LLM config, governance workflows, plugin loading, budget panel,
                          workspace switcher, deep links, Kanban board
                          118 tests passing | typecheck clean

  website/              ← 51 pages: onboarding, connector dashboard, approval inbox, evidence,
                          marketplace, admin, superadmin, docs, blog, pricing, auth flows
                          43 API routes across 12 route groups | SQLite-backed | port 3002
                          118 tests across 9 suites | typecheck clean

  orchestrator/         ← multi-agent workflow coordinator: task scheduler (heartbeat wake
                          model with coalescing), routine scheduler, plugin capability guard,
                          state persistence (file/db backend), GOAP A* goal planner
                          62 tests passing | typecheck clean

services/
  provisioning-service/ ← Azure VM lifecycle, 11-step state machine, SLA monitoring, cleanup
                          15 tests passing | typecheck clean
  approval-service/     ← approval enforcement, kill-switch, governance workflow manager
                          12 tests passing | typecheck clean
  connector-gateway/    ← OAuth, token refresh, adapter registry, adapter dispatch,
                          mTLS certificate verification, PII-strip middleware
                          36 tests passing | typecheck clean
  policy-engine/        ← governance routing policy and rule resolution
                          2 tests passing | typecheck clean
  evidence-service/     ← governance KPI calculator, evidence chain completeness,
                          HNSW vector index for approximate nearest-neighbor evidence search
                          24 tests passing | typecheck clean
  agent-observability/  ← action interception, browser action capture with diff verification,
                          correctness scoring, audit log writer
                          9 tests passing | typecheck clean
  notification-service/ ← approval-scoped notification gateway: Telegram, Slack, Discord,
                          Webhook, Voice (VoxCPM/VoIP), per-trigger allowlists,
                          dispatchApprovalAlert (approval-only entry point)
                          31 tests passing | typecheck clean
  meeting-agent/        ← meeting lifecycle state machine, voice pipeline, STT/TTS adapters
                          23 tests passing | typecheck clean
  memory-service/       ← long-term memory store: read/write/update, post-task crystallization
                          11 tests passing | typecheck clean
  agent-question-service/ ← async agent Q&A with human teammates, expiry sweeper
  audit-storage/        ← Azure Blob screenshot uploader, audit evidence persistence
  compliance-export/    ← JSON/CSV compliance evidence packs, 365-day/730-day retention
  retention-cleanup/    ← scheduled retention cleanup job (active/archive policy)
  identity-service/     ← tenant, workspace, user lifecycle (stub)

packages/
  shared-types/         ← 100+ versioned contract types, enums, kill-switch types,
                          GOAP plan types, skills crystallization types, voice/meeting types,
                          NotificationChannelConfig, DesktopOperator interface (frozen 2026-05-08)
  connector-contracts/  ← 18-connector registry, 18 normalized action types, 12 role policies
  queue-contracts/      ← queue event type definitions
  db-schema/            ← Prisma schema and 10 migrations
  observability/        ← structured telemetry helpers
```

---

## Quick Start

```bash
# Install dependencies
pnpm install

# Website (port 3002) — auth, connectors, approval inbox, evidence dashboard
pnpm --filter @agentfarm/website dev

# API gateway (control-plane, port 3001)
pnpm --filter @agentfarm/api-gateway dev

# Dashboard (operator UI, port 3000)
pnpm --filter @agentfarm/dashboard dev

# Run all tests
pnpm test

# Run typechecks across workspace
pnpm typecheck

# Full quality gate (47 checks)
pnpm quality:gate

# E2E smoke lane
pnpm smoke:e2e
```

Copy `.env.example` to `.env` and fill in values before running. Enable local signup with `AGENTFARM_ALLOWED_SIGNUP_DOMAINS=agentfarm.local`. Set `DESKTOP_OPERATOR=mock` to route Tier 11/12 desktop actions through the mock adapter.

---

## What Was Built

### Workstream 1 — Signup and Tenant Lifecycle
- `POST /auth/signup` creates tenant, workspace, bot, and queues provisioning job atomically
- HMAC-SHA256 session tokens, `agentfarm_session` cookie, workspace-scoped row-level security
- Dashboard provisioning status card with live state transitions and remediation hints

### Workstream 2 — Azure Runtime Provisioning
- 11-step provisioning state machine: `queued → validating → creating_resources → ... → completed`
- VM bootstrap script: installs Docker, pulls bot image, sets env vars via secure references (no inline secrets)
- Failure recovery: rollback, cleanup, audit log, dashboard error alert with next-step hints
- SLA monitoring: 10-minute target, 24-hour timeout, stuck-state alerts after 1 hour

### Workstream 3 — Docker Runtime and Bot Execution
- Runtime server with `/startup`, `/health`, `/kill` (5-second graceful shutdown), `/logs`, heartbeat
- Execution engine with risk classification: `HIGH_RISK_ACTIONS` (17 items) and `MEDIUM_RISK_ACTIONS` (40+ items); confidence < 0.6 escalates to medium
- **10 LLM providers**: OpenAI, Azure OpenAI, GitHub Models, Anthropic, Google, xAI, Mistral, Together AI, AgentFarm native, Auto (health-score failover)
- Auto mode: 5-minute rolling health-score composite (error rate + latency), per-profile priority lists
- Model profiles: `quality_first`, `speed_first`, `cost_balanced`, `custom` — configurable per workspace
- Provider failover trace: full `ProviderFailoverTraceRecord[]` on every decision for debugging
- Dashboard LLM config panel: per-provider settings, profile presets, redacted key display
- **12 tiers of local workspace actions** (Tier 1–12 + original set) — see [read.md](read.md) for full table

### Workstream 4 — Connector Auth and Action Execution
- OAuth 2.0 flow for all named connectors with CSRF nonce validation
- API key / basic auth / generic REST for remaining connectors
- Token lifecycle worker: auto-refresh, revoke, permission_invalid → re-consent routing, `ScopeStatus` tracking (full/partial/insufficient)
- Normalized action execution with exponential backoff retry and role-policy enforcement
- Adapter registry (`connector-gateway`): register/unregister/discover/health-check, audit-logged, tenant-scoped
- **18 connectors in plugin registry** (`packages/connector-contracts`):

| Category | Named Connectors | Custom |
|----------|-----------------|--------|
| Task Tracker | Jira, Linear, Asana, Monday, Trello, ClickUp | Generic REST |
| Messaging | Microsoft Teams, Slack | Generic REST |
| Code | GitHub, GitLab, Azure DevOps | Generic REST |
| Email | Outlook (Graph), Gmail | Generic REST, Generic SMTP |

- **18 normalized action types** and **12 agent role keys** — see [read.md](read.md)

### Workstream 5 — Approval and Risk Controls
- Risk evaluator + approval routing: low → execute immediately, medium/high → approval queue, escalation after 1 hour
- Approval queue UI at `/dashboard/approvals`: pending by risk level, approve/reject with reason capture, decision latency display
- `ApprovalEnforcer`: kill-switch activation/resume, 30-second control window, multi-stakeholder governance
- Immutability enforcement: 409 on re-decision; `decisionLatencySeconds` tracked per record

### Workstream 6 — Audit, Evidence, and Observability
- `writeAuditEvent()` — append-only SQLite audit log (no update/delete path)
- Query API: filter by actorEmail, action, tenantId, date range, limit
- Evidence dashboard: live KPIs (P95 latency, escalation count, freshness score), audit timeline, compliance export
- Compliance export: JSON and CSV with 365-day active / 730-day archive retention

### Workstream 7 — Website and Marketplace
- Bot marketplace at `/marketplace` with 179 agents across 29 departments
- 51 pages, 43 API routes, superadmin portal
- Website SWA deployment (blocked: needs GitHub secret `AZURE_STATIC_WEB_APPS_API_TOKEN_WEBSITE`)

### Workstream 8 — Testing and Deployment
- 1,392 tests passing across 14 packages; 47-check quality gate passing
- Coverage enforced ≥80% on critical modules (execution-engine: 95%, runtime-server: 81%, provisioning-monitoring: 94%)
- Production deployment blocked on Azure sign-in (tracked in ops runbook)

### Workstream 9 — Tier 1–12 Local Workspace Actions
- 12 tiers of Developer Agent workspace actions in `apps/agent-runtime/src/local-workspace-executor.ts`
- Sandbox path enforcement (`safeChildPath`) on all file and shell operations
- Tier 1–12 summary: file ops → autonomous ops → IDE intelligence → multi-file → REPL → language adapters → governance → release → productivity → observability → desktop/meeting (HIGH) → sub-agent/GitHub (HIGH)

### Sprint 2 — Autonomous Intelligence and Notification Features
1. **Messaging gateway** — Notification-service with Telegram/Slack/Discord/Webhook/Voice adapters
2. **GOAP planner** — A* goal planner in orchestrator
3. **SSE task stream** — Async Server-Sent Events queue with auto-recovery in api-gateway
4. **Skills crystallization** — Hermes Agent pattern in agent-runtime
5. **Graphify** — Monorepo package dependency graph visualiser
6. **Agent federation security** — mTLS cert verifier + PII-strip middleware in connector-gateway
7. **HNSW vector search** — Approximate nearest-neighbour index in evidence-service
8. **Kanban board** — Pure drag-and-drop Kanban logic in dashboard
9. **Voice notification** — VoxCPM/VoIP voice channel adapter in notification-service
10. **Approval-only gateway** — `dispatchApprovalAlert()` scopes messaging to approval triggers only

### Desktop Operator Abstraction
- Frozen `DesktopOperator` interface in `packages/shared-types/src/desktop-operator.ts` (2026-05-08): `browserOpen`, `appLaunch`, `meetingJoin`, `meetingSpeak`
- `MockDesktopOperator` and `getDesktopOperator()` factory in `apps/agent-runtime/src/desktop-operator-factory.ts` — reads `DESKTOP_OPERATOR` env var
- Mock short-circuits wired into all four Tier 11 cases in `local-workspace-executor.ts` — native paths untouched when `DESKTOP_OPERATOR` is unset or `native`

---

## Key Workflows

| Flow | Description |
|------|-------------|
| **Signup → Provisioning** | User signs up → tenant/workspace/bot created atomically → provisioning job queued → 11-step VM state machine → dashboard shows live progress |
| **Connector Action** | Runtime requests normalized action → role policy checked → risk classified → low: execute immediately → medium/high: routed to approval queue → approved: execute + audit event |
| **Approval Lifecycle** | Risky action enters intake → immutable approval record created → approver decides → decision latency tracked → optional webhook to bot → escalation after 1-hour SLA |
| **Audit and Evidence** | All events appended to audit log → query API with filters → evidence dashboard shows freshness score → compliance export as CSV/JSON pack |
| **Connector Setup** | User adds connector → OAuth flow initiates → token stored in Key Vault reference → health probe validates monthly → dashboard shows status/remediation |
| **Kill-Switch** | Admin activates kill-switch → all new medium/high actions blocked within 30-second control window → resume requires incident reference + authorized signal |
| **Budget Enforcement** | Per-task cost estimate evaluated → workspace daily/monthly limits checked → hard stop blocks execution → budget events ledger-appended for audit |
| **LLM Failover** | Auto provider mode iterates health-score-ordered chain → failover trace records each skip → heuristic fallback fires if all providers fail |
| **Plugin Loading** | External connector plugin submitted with manifest + signature → verified against trusted publisher list → capability allowlist created → orchestrator plugin guard enforces per-capability decisions |
| **Orchestrator Wake** | Wake source (timer/assignment/on_demand/automation) triggers run → dedupeKey coalesces duplicate wakeups → run state persisted to file/db backend |
| **GOAP Planning** | Goal world-state diffed against target → A* search selects optimal action sequence → planner replans on partial completion or world-state change |
| **Approval Notification** | Approval event emitted → `dispatchApprovalAlert()` enforces approval-trigger filter → routed to Telegram/Slack/Discord/Webhook/Voice channel |
| **SSE Task Stream** | Client opens `/sse/tasks/:botId` → `SseTaskQueue` buffers events per channel → auto-recovery sends queued events on reconnect → heartbeat keeps connection alive |
| **Skills Crystallization** | Successful run completion → `SkillsRegistry.crystallize()` extracts template → draft → active lifecycle → `findMatching()` accelerates future similar tasks |
| **Desktop Operator** | `DESKTOP_OPERATOR=mock` → Tier 11/12 browser/app/meeting actions short-circuit to `MockDesktopOperator` before native logic; `native` or unset → existing platform execution path |

---

## Planning and Operations

| Document | Purpose |
|----------|---------|
| [mvp/mvp-scope-and-gates.md](mvp/mvp-scope-and-gates.md) | MVP scope, gates, and success metrics |
| [planning/architecture-decision-log.md](planning/architecture-decision-log.md) | Architecture decisions (ADR-001 through ADR-007+) |
| [planning/product-architecture.md](planning/product-architecture.md) | Full product architecture narrative |
| [planning/engineering-execution-design.md](planning/engineering-execution-design.md) | Engineering execution design |
| [planning/master-plan.md](planning/master-plan.md) | Phases: validation → MVP → pilot → scale → enterprise |
| [planning/build-snapshot-2026-05-07.md](planning/build-snapshot-2026-05-07.md) | Six-priority spec-alignment wave snapshot |
| [operations/quality/8.1-quality-gate-report.md](operations/quality/8.1-quality-gate-report.md) | Quality gate report (47 checks — 46 passing, 1 skip: DB smoke) |
| [operations/runbooks/mvp-launch-ops-runbook.md](operations/runbooks/mvp-launch-ops-runbook.md) | MVP launch ops runbook (Tasks 7.1, 8.2, 8.3) |
| [operations/runbooks/website-swa-runbook.md](operations/runbooks/website-swa-runbook.md) | Website SWA deployment runbook |
| [scripts/dev-setup.md](scripts/dev-setup.md) | Local development environment setup |
| [infrastructure/control-plane/README.md](infrastructure/control-plane/README.md) | Control-plane IaC notes |
| [infrastructure/runtime-plane/README.md](infrastructure/runtime-plane/README.md) | Runtime-plane IaC notes |

---

## Quality Posture

| Package | Tests | Typecheck | Coverage |
|---------|-------|-----------|---------|
| `@agentfarm/agent-runtime` | **661 passing** | ✅ clean | ≥80% enforced on critical modules |
| `@agentfarm/api-gateway` | **388 passing** | ✅ clean | ≥80% enforced on critical modules |
| `@agentfarm/dashboard` | **118 passing** | ✅ clean | — |
| `@agentfarm/website` | **118 passing** across 9 suites | ✅ clean | — |
| `@agentfarm/orchestrator` | **62 passing** | ✅ clean | — |
| `@agentfarm/connector-gateway` | **36 passing** | ✅ clean | — |
| `@agentfarm/notification-service` | **31 passing** | ✅ clean | — |
| `@agentfarm/evidence-service` | **24 passing** | ✅ clean | — |
| `@agentfarm/meeting-agent` | **23 passing** | ✅ clean | — |
| `@agentfarm/provisioning-service` | **15 passing** | ✅ clean | — |
| `@agentfarm/approval-service` | **12 passing** | ✅ clean | — |
| `@agentfarm/memory-service` | **11 passing** | ✅ clean | — |
| `@agentfarm/agent-observability` | **9 passing** | ✅ clean | — |
| `@agentfarm/policy-engine` | **2 passing** | ✅ clean | — |
| **Total** | **1,392 passing** | | |

- Quality gate: **47 checks total — 46 pass, 1 skipped** (DB runtime snapshot, requires Docker/Postgres)
- E2E smoke lane validates auth, session, and protected route flows end-to-end
- Last full gate run: **2026-05-06 — EXIT_CODE=0 (PASS)**
- Pre-existing: `PrismaClient` export error in worktree (`runtime-audit-integration.ts`, `agent-question-service`, `compliance-export`, `memory-service`, `retention-cleanup`) — Prisma version mismatch in this worktree, not present in main repo

---

## Security Principles

- No connector secrets stored in relational records — only Key Vault references persisted
- Workspace and tenant scoping enforced at session and route level (workspace RLS)
- Approval immutability: guarded fields return 409 on re-decision
- Kill-switch governance: 30-second control window, incident-reference-gated resume
- CSRF nonce validation on all OAuth connector flows
- Timing-safe password comparison to prevent user enumeration
- Exponential backoff on transient connector failures
- `safeChildPath` sandbox enforcement on all file and shell workspace operations
- Plugin trust verification: cryptographic signature check before any external plugin is allowlisted

---

## Who This Is For

- **Platform engineers** building governed AI agent systems
- **AI runtime engineers** implementing controlled autonomy with human oversight
- **Security and compliance teams** requiring auditable decision and execution traces
- **Product and operations leads** preparing pilot-ready enterprise delivery

<!-- doc-sync: 2026-05-08 desktop-operator + test-count update -->
> Last synchronized: 2026-05-08 (desktop-operator abstraction, 1,392 total tests, all packages documented).
