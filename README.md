# AgentFarm

> Operate AI agents with enterprise control gates — human approval, audit trails, and governed autonomy from day one.

AgentFarm is a TypeScript pnpm monorepo that delivers a production-grade AI agent platform. The MVP ships one high-quality Developer Agent role with 18 live connectors across 4 categories, risk-based autonomy, a full approval enforcement stack, and a complete audit/evidence path for compliance.

**Sprint 1 status (as of 2026-05-01): 24/24 local tasks completed. 3 tasks blocked on external Azure/GitHub secrets (Tasks 7.1, 8.2, 8.3).**

---

## Full Documentation

→ **[read.md](read.md)** — complete technical overview, architecture, flows, quality posture, and quick start

---

## Architecture at a Glance

```
apps/
  api-gateway/          ← control-plane API: auth, approvals, audit, connector execution,
                          budget policy, roles, snapshots, plugin loading, LLM config,
                          governance workflows, task lease, provisioning workers
                          209 tests passing | typecheck clean
  agent-runtime/        ← per-tenant execution engine: risk classification, action dispatch,
                          10 LLM providers (incl. Auto mode), 12 tiers of workspace actions
                          118 tests passing | typecheck clean
  dashboard/            ← operator UI: approval queue, evidence panel, runtime observability,
                          LLM config, governance workflows, plugin loading, budget panel,
                          workspace switcher, deep links
                          typecheck clean
  website/              ← 51 pages: onboarding, connector dashboard, approval inbox, evidence,
                          marketplace, admin, superadmin, docs, blog, pricing, auth flows
                          43 API routes across 12 route groups | SQLite-backed | port 3002
                          28+ tests across 9 suites | typecheck clean
  orchestrator/         ← multi-agent workflow coordinator: task scheduler (heartbeat wake
                          model with coalescing), routine scheduler, plugin capability guard,
                          state persistence (file/db backend)
                          typecheck clean

services/
  provisioning-service/ ← Azure VM lifecycle, 11-step state machine, SLA monitoring, cleanup
  approval-service/     ← approval enforcement, kill-switch, governance workflow manager
  connector-gateway/    ← OAuth, token refresh, adapter registry, adapter dispatch
  policy-engine/        ← governance routing policy and rule resolution
  evidence-service/     ← governance KPI calculator, evidence chain completeness
  identity-service/     ← tenant, workspace, user lifecycle (stub)
  notification-service/ ← approval and ops notifications (stub)

packages/
  shared-types/         ← 10 versioned contract types, enums, and kill-switch types
  connector-contracts/  ← 18-connector registry, 18 normalized action types, 12 role policies
  queue-contracts/      ← queue event type definitions
  db-schema/            ← Prisma schema and migrations
  observability/        ← structured telemetry helpers
```

---

## Quick Start

```bash
# Install dependencies
pnpm install

# Website (port 3002) — auth, connectors, approval inbox, evidence dashboard
pnpm --filter @agentfarm/website dev

# API gateway (control-plane)
pnpm --filter @agentfarm/api-gateway dev

# Dashboard (operator UI)
pnpm --filter @agentfarm/dashboard dev

# Run all tests
pnpm test

# Run typechecks across workspace
pnpm typecheck

# Full quality gate (33 checks)
pnpm quality:gate

# E2E smoke lane
pnpm smoke:e2e
```

Copy `.env.example` to `.env` and fill in values before running. Enable local signup with `AGENTFARM_ALLOWED_SIGNUP_DOMAINS=agentfarm.local`.

---

## What Was Built — Sprint 1 Summary

### Workstream 1 — Signup and Tenant Lifecycle
- POST `/auth/signup` creates tenant, workspace, bot, and queues provisioning job atomically
- HMAC-SHA256 session tokens, `agentfarm_session` cookie, workspace-scoped row-level security
- Dashboard provisioning status card with live state transitions and remediation hints

### Workstream 2 — Azure Runtime Provisioning
- 11-step provisioning state machine: `queued → validating → creating_resources → ... → completed`
- VM bootstrap script: installs Docker, pulls bot image, sets env vars via secure references (no inline secrets)
- Failure recovery: rollback, cleanup, audit log, dashboard error alert with next-step hints
- SLA monitoring: 10-minute target, 24-hour timeout, stuck-state alerts after 1 hour

### Workstream 3 — Docker Runtime and Bot Execution
- Runtime server with `/startup`, `/health`, `/kill` (5-second graceful shutdown), `/logs`, heartbeat
- Execution engine with risk classification: `HIGH_RISK_ACTIONS` (merge_pr, delete_resource, change_permissions, deploy_production, git_push, run_shell_command, workspace_browser_open, workspace_subagent_spawn, workspace_github_issue_fix + Tier 5/11/12 high-risk actions) and `MEDIUM_RISK_ACTIONS` (update_status, create_comment, create_pr, send_message, code_edit, git_commit, autonomous_loop, and all Tier 2-10 mutating actions)
- **10 LLM providers**: OpenAI, Azure OpenAI, GitHub Models, Anthropic, Google, xAI, Mistral, Together AI, AgentFarm native, Auto (health-score failover)
- Auto mode: 5-minute rolling health-score composite (error rate + latency), per-profile priority lists
- Model profiles: `quality_first`, `speed_first`, `cost_balanced`, `custom` — configurable per workspace
- Provider failover trace: full `ProviderFailoverTraceRecord[]` on every decision for debugging
- Dashboard LLM config panel: per-provider settings, profile presets, redacted key display
- **12 tiers of local workspace actions** (Tier 1–12 + original set) — see [read.md](read.md) for full table

### Workstream 4 — Connector Auth and Action Execution
- OAuth 2.0 flow for Jira, Linear, Asana, Monday, ClickUp, Teams, Slack, GitHub, GitLab, Azure DevOps, Outlook, Gmail with CSRF nonce validation
- API key / basic auth / generic REST for Trello, Generic SMTP, and all custom REST connectors
- Token lifecycle worker: auto-refresh before expiry, revoke, permission_invalid → re-consent routing, `ScopeStatus` tracking (full/partial/insufficient)
- Normalized action execution with exponential backoff retry and role-policy enforcement
- Adapter registry (`connector-gateway`): register/unregister/discover/health-check, audit-logged, tenant-scoped
- **18 connectors in plugin registry** (`packages/connector-contracts`):

| Category | Named Connectors | Custom |
|----------|-----------------|--------|
| Task Tracker | Jira, Linear, Asana, Monday, Trello, ClickUp | Generic REST |
| Messaging | Microsoft Teams, Slack | Generic REST |
| Code | GitHub, GitLab, Azure DevOps | Generic REST |
| Email | Outlook (Graph), Gmail | Generic REST, Generic SMTP |

- **18 normalized action types**: `get_task`, `create_task`, `update_task_status`, `add_comment`, `assign_task`, `list_tasks`, `send_message`, `create_channel`, `mention_user`, `create_pr`, `add_pr_comment`, `merge_pr`, `list_prs`, `list_emails`, `read_email`, `send_email`, `reply_email`, `read_thread`
- **12 agent role keys**: recruiter, developer, fullstack_developer, tester, business_analyst, technical_writer, content_writer, sales_rep, marketing_specialist, corporate_assistant, customer_support_executive, project_manager_product_owner_scrum_master
- Connector dashboard UI at `/connectors` — add/configure/disconnect, OAuth initiation, config schema forms, status badges
- Connector health probes: monthly scope validation, error remediation (re-auth, re-consent, backoff)

### Workstream 5 — Approval and Risk Controls
- Risk evaluator + approval routing: low → execute immediately, medium/high → approval queue, escalation after 1 hour
- Approval queue UI at `/dashboard/approvals`: pending by risk level, approve/reject with reason capture, decision latency display
- `ApprovalEnforcer` (approval-service): kill-switch activation/resume, 30-second control window, multi-stakeholder governance
- Approval enforcement: risky actions blocked until signed approval; rejected actions return 403 with reason to caller
- Immutability enforcement: 409 on re-decision; `decisionLatencySeconds` tracked per record

### Workstream 6 — Audit, Evidence, and Observability
- `writeAuditEvent()` — append-only SQLite audit log (no update/delete path)
- Audit events emitted on: signup, login, connector add/remove, approval request, approval decision, action executed/blocked
- Query API: filter by actorEmail, action, tenantId, date range, limit
- Evidence dashboard at `/dashboard/evidence`: live KPIs (P95 latency, escalation count, freshness score), audit timeline, compliance export
- Compliance export: JSON (`ComplianceEvidencePack`) and CSV download with 365-day active / 730-day archive retention

### Workstream 7 — Website and Marketplace
- Bot marketplace at `/marketplace` with discovery UI, role/connector filtering, quick-start onboarding
- Website deployed on SWA workflow (Task 7.1 blocked: needs GitHub secret `AZURE_STATIC_WEB_APPS_API_TOKEN_WEBSITE`)

### Workstream 8 — Testing and Deployment
- 209 api-gateway tests, 118 agent-runtime tests, 33-check quality gate — all passing
- Coverage enforced ≥80% on critical modules (execution-engine: 95%, runtime-server: 81%, provisioning-monitoring: 94%)
- Tasks 8.2 (Azure production deployment) and 8.3 (security/load/evidence gates) blocked on Azure sign-in

### Workstream 9 — Tier 1–12 Local Workspace Actions
- 12 tiers of Developer Agent workspace actions implemented in `apps/agent-runtime/src/local-workspace-executor.ts`
- Tier 1: file/dir operations (list, grep, move, delete, install_deps)
- Tier 2: autonomous agent ops (linter, patch, stash, log, scout, checkpoint)
- Tier 3: IDE-level (find_references, rename_symbol, extract_function, go_to_definition, hover_type, analyze_imports, code_coverage, complexity_metrics, security_scan)
- Tier 4: multi-file coordination (bulk_refactor, atomic_edit_set, generate_from_template, migration_helper, summarize_folder, dependency_tree, test_impact_analysis)
- Tier 5: external knowledge (search_docs, package_lookup, ai_code_review, repl_start/execute/stop, debug_breakpoint, profiler_run)
- Tier 6: language adapters (Python, Java, Go, C#)
- Tier 7: governance and safety (dry_run_with_approval_chain, change_impact_report, rollback_to_checkpoint)
- Tier 8: release & collaboration (generate_test, format_code, version_bump, changelog_generate, git_blame, outline_symbols)
- Tier 9: productivity pilot (create_pr, run_ci_checks, fix_test_failures, security_fix_suggest, pr_review_prepare, dependency_upgrade_plan, release_notes_generate, incident_patch_pack, memory_profile, autonomous_plan_execute, policy_preflight)
- Tier 10: observability (connector_test, pr_auto_assign, ci_watch, explain_code, add_docstring, refactor_plan, semantic_search, diff_preview, approval_status, audit_export)
- Tier 11: desktop/meeting (browser_open, app_launch, meeting_join, meeting_speak, meeting_interview_live) — HIGH risk, requires approval
- Tier 12: sub-agent delegation and GitHub intelligence (subagent_spawn, github_pr_status, github_issue_triage, github_issue_fix, azure_deploy_plan, slack_notify) — HIGH risk, requires approval
- Sandbox path enforcement (`safeChildPath`) on all file/shell operations

---

## Key Workflows

| Flow | Description |
|------|-------------|
| **Signup → Provisioning** | User signs up → tenant/workspace/bot created atomically → provisioning job queued → 11-step VM state machine → dashboard shows live progress |
| **Connector Action** | Runtime requests normalized action → role policy checked → risk classified → low: execute immediately → medium/high: routed to approval queue → approved: execute + audit event |
| **Approval Lifecycle** | Risky action enters intake → immutable approval record created → approver decides (approve/reject with reason) → decision latency tracked → optional webhook to bot → escalation after 1-hour SLA |
| **Audit and Evidence** | All events appended to audit log → query API with filters → evidence dashboard shows freshness score → compliance export as CSV/JSON pack |
| **Connector Setup** | User adds connector at `/connectors` → OAuth flow initiates → token stored in Key Vault reference → health probe validates monthly → dashboard shows status/remediation |
| **Kill-Switch** | Admin activates kill-switch → all new medium/high actions blocked within 30-second control window → resume requires incident reference + authorized signal |
| **Budget Enforcement** | Per-task cost estimate evaluated → workspace daily/monthly limits checked → hard stop blocks execution → budget events ledger-appended for audit |
| **LLM Failover** | Auto provider mode iterates health-score-ordered chain → provider failover trace records each skip → heuristic fallback fires if all providers fail |
| **Plugin Loading** | External connector plugin submitted with manifest + signature → verified against trusted publisher list → capability allowlist created → orchestrator plugin guard enforces per-capability decisions |
| **Orchestrator Wake** | Wake source (timer/assignment/on_demand/automation) triggers run → dedupeKey coalesces duplicate wakeups → run state persisted to file/db backend |

---

## Planning and Operations

| Document | Purpose |
|----------|---------|
| [mvp/mvp-scope-and-gates.md](mvp/mvp-scope-and-gates.md) | MVP scope, gates, and success metrics |
| [planning/sprint-1-execution-task-list.md](planning/sprint-1-execution-task-list.md) | Sprint 1 task tracking — 24/24 local tasks completed |
| [planning/architecture-decision-log.md](planning/architecture-decision-log.md) | Architecture decisions (ADR-001 through ADR-007) |
| [planning/product-architecture.md](planning/product-architecture.md) | Full product architecture narrative |
| [planning/engineering-execution-design.md](planning/engineering-execution-design.md) | Engineering execution design |
| [operations/quality/8.1-quality-gate-report.md](operations/quality/8.1-quality-gate-report.md) | Quality gate report (33 checks — 32 passing, 1 skip: DB-dependent smoke) |
| [operations/runbooks/mvp-launch-ops-runbook.md](operations/runbooks/mvp-launch-ops-runbook.md) | MVP launch ops runbook (Tasks 7.1, 8.2, 8.3) |
| [operations/runbooks/website-swa-runbook.md](operations/runbooks/website-swa-runbook.md) | Website SWA deployment runbook |
| [scripts/dev-setup.md](scripts/dev-setup.md) | Local development environment setup |
| [infrastructure/control-plane/README.md](infrastructure/control-plane/README.md) | Control-plane IaC notes |
| [infrastructure/runtime-plane/README.md](infrastructure/runtime-plane/README.md) | Runtime-plane IaC notes |

---

## Quality Posture

| Target | Tests | Typecheck | Coverage |
|--------|-------|-----------|---------|
| `@agentfarm/api-gateway` | 209 passing | ✅ clean | ≥80% enforced on critical modules |
| `@agentfarm/agent-runtime` | 118 passing | ✅ clean | ≥80% enforced on critical modules |
| `@agentfarm/website` | 28+ passing across 9 test files | ✅ clean | — |
| `@agentfarm/dashboard` | — | ✅ clean | — |
| `@agentfarm/provisioning-service` | 15 passing | ✅ clean | — |
| `@agentfarm/approval-service` | 12+ passing | ✅ clean | — |
| `@agentfarm/evidence-service` | passing | ✅ clean | — |
| `@agentfarm/connector-gateway` | passing | ✅ clean | — |
| `@agentfarm/orchestrator` | passing | ✅ clean | — |
| `@agentfarm/policy-engine` | passing | ✅ clean | — |

- Quality gate: 33 checks total — 32 pass, 1 skipped (DB runtime snapshot, requires Docker)
- E2E smoke lane validates auth, session, and protected route flows end-to-end

---

## Security Principles

- No connector secrets stored in relational records — only Key Vault references persisted
- Workspace and tenant scoping enforced at session and route level (workspace RLS)
- Approval immutability: guarded fields return 409 on re-decision
- Kill-switch governance: 30-second control window, incident-reference-gated resume
- CSRF nonce validation on all OAuth connector flows
- Least-privilege assumptions for all identity, connector, and provisioning paths
- Fail-safe defaults and explicit validation on all inbound payloads

---

## Who This Is For

- **Platform engineers** building governed AI agent systems
- **AI runtime engineers** implementing controlled autonomy with human oversight
- **Security and compliance teams** requiring auditable decision and execution traces
- **Product and operations leads** preparing pilot-ready enterprise delivery
- **Security and compliance teams** requiring auditable decision and execution traces
- **Product and operations leads** preparing a pilot-ready enterprise deployment
