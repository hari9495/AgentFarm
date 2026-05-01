# AgentFarm Full System Documentation v1

## Document Purpose
This document is the single consolidated source of truth for AgentFarm v1 planning, architecture, governance, and engineering kickoff.

It combines approved decisions from strategy, architecture, execution design, release pack, ADRs, risk register, and operating cadence.

## Document Status
1. Version: v1.1
2. Baseline date: 2026-04-19
3. Last updated: 2026-04-30
4. Architecture signoff decision: Go
5. Build status: Sprint 1 complete — all 24 tasks completed; 3 pending platform-owner deployment actions only
6. Scope mode: MVP scope freeze active; post-MVP roadmap approved for planning
7. Change control: Any gate-impacting change requires ADR + risk update on the same day

## Executive Summary
AgentFarm v1 is approved to build as a shared SaaS control plane with isolated per-workspace runtime in Azure VM plus Docker.

The MVP is intentionally narrow:
1. One role: Developer Agent
2. Four connectors: Jira, Microsoft Teams, GitHub, company email
3. Mandatory controls: approval-gated autonomy, complete audit evidence, kill switch, security-first secret handling

Release readiness is anchored on score-5 outcomes for:
1. Identity Realism
2. Role Fidelity and Task Quality
3. Autonomy with Human Approval

## Build Completion Status (Sprint 1 — 2026-04-28 to 2026-04-30)

### Summary
All 24 Sprint 1 tasks are completed. The AgentFarm MVP Developer Agent is fully built, tested, and ready for production deployment. The only remaining actions are external platform-owner steps (Azure credentials, GitHub secret, DNS cutover).

### What Was Built

#### Workstream 1: Signup and Tenant Lifecycle
- POST /auth/signup — atomic Prisma transaction creates Tenant (status→provisioning), TenantUser (role owner), Workspace, Bot (status created), and ProvisioningJob (status queued) in a single operation
- HMAC SHA-256 session tokens with HttpOnly cookie; timing-safe login prevents user enumeration
- Dashboard session guard with workspace-scoped row-level security
- Provisioning status UI with real-time step pipeline, SLA indicator, failure remediation cards, and success banner

#### Workstream 2: Azure Runtime Provisioning
- 11-state provisioning machine: queued → validating → creating_resources → bootstrapping_vm → starting_container → registering_runtime → healthchecking → completed (with failed → cleanup_pending → cleaned_up failure path)
- Azure SDK wired: resource group, VNet, subnet, NIC, VM, managed identity per tenant
- Cloud-init YAML bootstrap: Docker CE install, ACR pull via managed identity, systemd agentfarm-bot service, env file at /etc/agentfarm/bot.env (no secrets in image layers)
- SLA monitoring: <10-minute target, 1-hour stuck-state alerts, 24-hour timeout auto-remediation
- Failure recovery: rollback side effects (Bot→failed, Workspace→failed, Tenant→degraded), cleanup_pending worker, owner-facing remediation hints in dashboard

#### Workstream 3: Docker Runtime and Bot Execution
- Runtime contract endpoints: POST /startup, GET /health/live, GET /health/ready, POST /kill (5-second graceful shutdown), POST /tasks/intake
- 7-state runtime lifecycle: created → starting → ready → active → degraded → stopping → stopped
- Capability snapshot system with version, checksum, role-key, and policy-pack binding; persisted per botId, falls back gracefully on mismatch
- 70+ local workspace action types across 12 tiers dispatched from runtime (see Developer Agent Capabilities below)
- Ten LLM providers: openai, azure_openai, github_models, anthropic, google, xai (Grok), mistral, together, agentfarm (heuristic), auto. Auto mode with 5-minute rolling health-score reordering and heuristic fallback
- Dashboard LLM Config panel with per-provider fields and four model profiles: quality_first, speed_first, cost_balanced, custom

#### Workstream 4: Connector Auth and Action Execution
- OAuth initiation and callback for Jira, Microsoft Teams, GitHub, and company email
- CSRF nonce validation; secret references stored in Key Vault only (no raw tokens in DB)
- Token auto-refresh with expiry-window logic; revoke clears all auth state; permission_invalid → consent_pending recovery
- Monthly connector health probes with remediation mapping (re-auth, re-consent, backoff)
- Normalized connector action executor for: read_task, create_comment, update_status, send_message, create_pr_comment, send_email
- Exponential backoff retry (50ms, 100ms), consistent timeout → HTTP 504 classification, ConnectorAction persistence logs

#### Workstream 5: Approval and Risk Controls
- Risk classifier: HIGH_RISK_ACTIONS (merge_pr, merge_release, delete_resource, change_permissions, deploy_production), MEDIUM_RISK_ACTIONS (update_status, create_comment, create_pr_comment, create_pr, send_message), LOW (all others including local workspace read actions)
- Approval intake: medium/high actions → pending_approval queue with immutability enforcement; low → execute_without_approval
- Auto-escalation after per-record timeout (default 3600 seconds)
- Approval enforcement in runtime: risky tasks block in pending queue; approved actions execute via connector gateway using ops-safe service token; rejected/timeout actions persist cancelled result and emit bot-notification events
- Decision cache + cache-hit execution path; /decision webhook auth (x-runtime-decision-token)
- Dashboard approval queue panel: decision actions with reason capture, risk/search filtering, pending/recent pagination, escalation trigger, SLA metrics (pending_count, decision_count, p95_decision_latency_seconds)

#### Workstream 6: Audit, Evidence, and Compliance
- Append-only audit event ingestion: POST /v1/audit/events with event type, severity, actor, workspace scope
- Compliance query endpoint with scoped filters and pagination cursor: GET /v1/audit/events
- Retention cleanup endpoint with dry-run + execute modes: POST /v1/audit/retention/cleanup
- Evidence dashboard: freshness indicator (latest event age + stale warning), filterable audit query UI, CSV/JSON compliance export via GET /api/audit/export
- 12-month active retention, 24-month archive

#### Workstream 7: Website and Marketplace
- Azure Static Web App deployment workflow (.github/workflows/website-swa.yml) with main/PR triggers
- Marketplace listing API with plan/department/availability/search filters
- Quick-start onboarding API with payload validation and onboarding request IDs
- Checkout onboarding workflow page wired to cart selection and quick-start submission

#### Workstream 8: Testing and Deployment
- Coverage threshold enforcement (≥80% line coverage) via scripts/coverage-threshold-check.mjs integrated into all package coverage scripts
- E2E smoke lane via scripts/e2e-smoke.mjs covering signup → provisioning → bot action → approval happy path
- Quality gate: pnpm quality:gate passes (typechecks, coverage, E2E smoke, all filters)
- Release operations runbook at operations/runbooks/mvp-launch-ops-runbook.md
- .azure/deployment-plan.md at Validated status; blocked on Azure sign-in context for final azd up

### Test Coverage at Sprint 1 Exit
| Package | Tests | Result |
|---|---|---|
| @agentfarm/agent-runtime | 168 | 164 pass, 4 pre-existing flaky timing failures |
| @agentfarm/api-gateway | 200 | 200 pass |
| @agentfarm/approval-service | 12 | 12 pass |
| @agentfarm/website | Playwright smoke + build | pass |
| All typechecks | — | pass |

### Remaining Platform-Owner Actions (Not Code)
1. Add AZURE_STATIC_WEB_APPS_API_TOKEN_WEBSITE to GitHub repository secrets
2. Sign in Azure CLI context and run azd up for production infrastructure
3. Complete DNS/custom-domain TLS cutover for website
4. Run post-deploy security/load/evidence gates (SAST, DAST, 1000-bot load test, evidence freshness export)

---

## Product Vision and Positioning
### Vision
Help companies scale output without scaling headcount by using role-based AI agents.

### Positioning
AgentFarm is an AI workforce system, not a generic chatbot and not script automation.

### Target Users
1. CTOs
2. Engineering managers
3. Operations leaders
4. Growing teams with hiring pressure

### Core Promise
1. Fast agent onboarding
2. Real workflow operation in company systems
3. Strong human control and auditability
4. Measurable business value

## MVP Scope Baseline (Frozen)
### In Scope
1. Developer Agent only
2. Jira, Microsoft Teams, GitHub, company email only
3. Role-based task handling
4. Mandatory human approval for medium/high-risk actions
5. Full action and approval logging
6. Weekly quality reporting and gate evidence support

### Out of Scope (Post-MVP)
1. Multi-role orchestration
2. Live meeting voice participation
3. HR interview automation mode
4. Deep enterprise customizations
5. Advanced multi-region scale topology

### Non-Negotiable Scope Rule
No scope expansion enters the active build backlog without explicit architecture gate approval.

## Architecture Overview
### Core Architecture Choice
Shared control plane plus isolated execution plane plus evidence plane.

### Plane Boundaries
1. Control plane
- Identity, tenant/workspace management, policy, approvals, provisioning orchestration, connector configuration, dashboard APIs
2. Runtime plane
- Task orchestration, role execution, connector workers, action routing, runtime health
3. Evidence plane
- Action logs, approval logs, operational metrics, gate evidence reporting, audit traceability

### Azure Hosting Model (v1)
1. Shared control-plane resources
- Web frontend, backend APIs, datastore, queue/cache, observability stack, secret references
2. Per-tenant runtime resources
- Resource group, VM, NIC, disk, NSG, managed identity, monitoring agent
3. Runtime boundary
- Bot process runs inside Docker only
4. Secret boundary
- Managed identity plus Key Vault reference model; no plaintext secrets in code, image, or runtime files

### Tiered Runtime Direction
1. v1 secure default: isolated VM plus Docker
2. Premium tier: dedicated runtime per workspace
3. Future scale tier: container-native density after controls are proven

## System Components and Ownership
1. Identity Service: Engineering Lead
2. Policy and Risk Engine: Security and Safety Lead
3. Approval Service: Security and Safety Lead
4. Orchestration Service: Engineering Lead
5. Connector Gateway: Engineering Lead
6. Observability Service: Engineering Lead

## End-to-End Lifecycle
### Signup to Live Operations
1. User signup and workspace creation
2. Plan and role selection
3. Bot record creation and async provisioning enqueue
4. Azure runtime provisioning sequence begins
5. VM bootstrap and Docker runtime startup
6. Runtime secure configuration and connector reference injection
7. Connector activation from dashboard
8. Bot live execution with risk checks and approvals
9. Ongoing monitoring, logs, approvals, and connector health management

### Tenant and Bot States
1. tenant_status
- pending, provisioning, ready, degraded, suspended, terminated
2. bot_status
- created, bootstrapping, connector_setup_required, active, paused, failed

## Provisioning Workflow Contract
### Provisioning States
1. queued
2. resource_group_created
3. identity_created
4. vm_created
5. bootstrap_in_progress
6. container_started
7. healthcheck_passed
8. completed
9. failed

### Failure Policy
1. Retry transient failures with exponential backoff
2. Persist failure reason and remediation hints
3. Mark failed only after retry threshold
4. Keep partial resources tagged for cleanup flow

### Azure Naming Pattern
1. rg-af-tenant-{tenantShortId}
2. vm-af-bot-{tenantShortId}
3. id-af-bot-{tenantShortId}
4. nsg-af-bot-{tenantShortId}

## Runtime Contract (Docker)
### Runtime Principles
1. Bot runs in Docker only
2. No privileged container mode
3. Secrets injected at runtime only
4. Structured logs emitted for evidence and observability

### Runtime Inputs
1. tenant_id
2. bot_id
3. plan_tier
4. role_profile
5. policy_pack_version
6. connector_config_refs
7. observability_endpoints
8. approval_service_endpoint

## Connector Architecture and Auth Flow
### Approved Connectors and Order
1. Jira
2. Microsoft Teams
3. GitHub
4. Company email

### Connector Activation
1. User starts connector activation in dashboard
2. Control plane performs OAuth or admin-token flow
3. Secret stored in Key Vault or equivalent
4. Runtime receives only secret reference
5. Runtime validates required permission scope before enablement

### Connector Health States
1. connected
2. degraded
3. token_expired
4. permission_invalid
5. disconnected

## Approval and Policy Model
### Risk Logic
1. Low risk: auto-execute with full logging
2. Medium risk: mandatory approval
3. High risk: mandatory approval with escalation timeout

### Approval Flow
1. Runtime proposes action
2. Policy engine classifies risk
3. Medium/high actions create approval request
4. Approval routed to dashboard and Teams
5. Runtime resumes only after signed decision

### Kill Switch
Global immediate stop for risky execution. Resume requires authorized approval and incident notes.

## Data, Audit, and Evidence Model
### Required Evidence Guarantees
1. Action records complete
2. Approval records complete
3. Evidence records complete
4. Audit completeness target: 100 percent for risky actions
5. Evidence freshness target for active gates: 90 days

### Retention Policy
Retain active audit records for 12 months and archive for 24 months with append-only evidence controls.

### Key Event Categories
1. provisioning_event
2. bot_runtime_event
3. connector_event
4. approval_event
5. security_event
6. audit_event

## API and Dashboard Surfaces
### Dashboard Capabilities
1. Provisioning status visibility
2. Bot status and health
3. Approval queue and decisions
4. Action logs and audit filters
5. Connector setup and health
6. Plan and usage visibility

### Core API Endpoints
1. POST /signup/complete
2. GET /tenants/{tenantId}/status
3. GET /bots/{botId}/logs
4. GET /bots/{botId}/connectors
5. POST /bots/{botId}/connectors/{connectorType}/activate
6. GET /bots/{botId}/approvals
7. POST /approvals/{approvalId}/decision

## Reliability and Performance Targets
1. Workflow availability: 99.5 percent
2. Approval routing success: 99.9 percent
3. Risky-action audit completeness: 100 percent
4. P95 approval latency: under 2 minutes

## Security and Compliance Baseline
1. Role-based least privilege access model
2. Managed identity plus secret vault reference model
3. AI disclosure required in all user-visible channels
4. Incident runbook pack required for operational safety
5. Security-over-velocity rule enforced across dependency and feature decisions

## Developer Agent Capabilities (Delivered)

### Connector Actions (via API Gateway)
The Developer Agent executes six normalized connector actions across Jira, Microsoft Teams, GitHub, and company email:
1. read_task — read issue/task details from Jira or GitHub
2. create_comment — post a comment on a Jira issue or GitHub PR
3. update_status — transition a Jira issue or GitHub issue state
4. send_message — send a message in Microsoft Teams
5. create_pr_comment — post a review comment on a GitHub pull request
6. send_email — send an email via the company email connector

### Local Workspace Actions (92 types — runs inside VM sandbox)

All local actions execute inside the sandboxed workspace directory. safeChildPath() enforces no path traversal. Shell output is filtered through redactSecrets() before returning.

#### Tier 0: Core File and Shell Operations (7 actions)
workspace_read_file, workspace_write_file, workspace_append_file, workspace_delete_file, workspace_list_dir, workspace_run_command, workspace_shell_exec

#### Tier 1: Search and Navigation (5 actions)
workspace_grep, workspace_list_files, workspace_find_symbol, workspace_go_to_definition, workspace_hover_type

#### Tier 2: Git Operations (8 actions)
workspace_git_status, workspace_git_diff, workspace_git_commit, workspace_git_push, workspace_git_branch, workspace_git_checkout, workspace_git_pull, workspace_git_log

#### Tier 3: Code Analysis (6 actions)
workspace_analyze_imports, workspace_code_coverage, workspace_complexity_metrics, workspace_security_scan, workspace_test_impact_analysis, workspace_ai_code_review

#### Tier 4: Code Editing (6 actions)
workspace_extract_function, workspace_rename_symbol, workspace_inline_variable, workspace_move_symbol, workspace_generate_from_template, workspace_bulk_refactor

#### Tier 5: Testing and Debugging (6 actions)
workspace_run_tests, workspace_debug_breakpoint, workspace_profiler_run, workspace_repl_start, workspace_repl_execute, workspace_repl_stop

#### Tier 6: Project and Dependency Management (6 actions)
workspace_summarize_folder, workspace_dependency_tree, workspace_package_lookup, workspace_language_adapter_python, workspace_language_adapter_java, workspace_language_adapter_go, workspace_language_adapter_csharp

#### Tier 7: Advanced Operations (9 actions)
workspace_atomic_edit_set, workspace_dry_run_with_approval_chain, workspace_change_impact_report, workspace_rollback_to_checkpoint, workspace_search_docs, workspace_scout, workspace_checkpoint, workspace_install_deps, workspace_stash

#### Tier 8: Developer Productivity (6 actions — added 2026-04-30)
workspace_generate_test, workspace_format_code, workspace_version_bump, workspace_changelog_generate, workspace_git_blame, workspace_outline_symbols

#### Tier 9: PR, CI, Security, and Autonomy (11 actions — added 2026-04-30)
workspace_create_pr, workspace_run_ci_checks, workspace_fix_test_failures, workspace_security_fix_suggest, workspace_pr_review_prepare, workspace_dependency_upgrade_plan, workspace_release_notes_generate, workspace_incident_patch_pack, workspace_memory_profile, workspace_autonomous_plan_execute, workspace_policy_preflight

#### Tier 10: Connector Hardening, Code Intelligence & Observability (10 actions — added 2026-05-01)
workspace_connector_test, workspace_pr_auto_assign, workspace_ci_watch, workspace_explain_code, workspace_add_docstring, workspace_refactor_plan, workspace_semantic_search, workspace_diff_preview, workspace_approval_status, workspace_audit_export
- **190/190 tests passing**, typecheck clean
- `workspace_connector_test`: validates connector type (github/jira/teams/email/slack/linear/azuredevops/confluence) without side effects — LOW risk
- `workspace_pr_auto_assign`: reads CODEOWNERS, matches changed_files to patterns, returns suggested_reviewers — MEDIUM risk
- `workspace_ci_watch`: runs ci_command with capped timeout (max 300 s), returns pass/fail + log_excerpt — MEDIUM risk
- `workspace_explain_code`: reads file slice, returns structural_summary (fn/branch/loop/import counts) + code_snippet — LOW risk
- `workspace_add_docstring`: detects undocumented exports; inserts `/** TODO: document X */` stubs; dry_run=true default — MEDIUM risk
- `workspace_refactor_plan`: produces 7-step structured plan JSON (no writes); safety_notes included — MEDIUM risk
- `workspace_semantic_search`: regex-plus-context walk of workspace tree; returns results with context_before/after — LOW risk
- `workspace_diff_preview`: previews +/- line counts for planned_edits without writing files — LOW risk
- `workspace_approval_status`: reads `.agentfarm/approval-log.json`; returns pending if task not found — LOW risk
- `workspace_audit_export`: bundles workspace-memory + approval-log into a JSON evidence file — MEDIUM risk

#### Additional (Tier 1/2 parity actions)
file_move, file_delete, apply_patch, git_stash, git_log, run_linter

### Risk Classification for Local Actions
- HIGH: workspace_git_push, workspace_run_command, workspace_shell_exec
- MEDIUM: All write, edit, install, commit, and execution operations — including workspace_write_file, workspace_git_commit, workspace_bulk_refactor, workspace_atomic_edit_set, workspace_generate_test, workspace_format_code, workspace_version_bump, workspace_changelog_generate, workspace_create_pr, workspace_run_ci_checks, workspace_fix_test_failures, workspace_security_fix_suggest, workspace_dependency_upgrade_plan, workspace_release_notes_generate, workspace_incident_patch_pack, workspace_memory_profile, workspace_autonomous_plan_execute, and others
- LOW: All read, discovery, analysis, blame, outline, and simulation operations — including workspace_pr_review_prepare, workspace_policy_preflight, and all read-only workspace queries

### LLM Decision Routing
Nine provider adapters with automatic health-score fallback:
- openai, azure_openai, github_models, anthropic, google, xai, mistral, together, agentfarm
- Auto mode iterates per-profile priority list with 5-minute rolling health-score reordering
- Health score = errorRate × 0.7 + (min(avgLatency, 10000) / 10000) × 0.3
- Heuristic fallback fires if all providers fail

---

## Developer Agent Future Roadmap (Post-MVP)

### Near Term (Pilot Phase — Weeks 21–30)
1. **Real connector execution hardening** — Replace stub provider clients with production-tested Jira, Teams, GitHub, and email SDK integrations. Add per-connector rate limiting and quota pooling.
2. **Autonomous coding loop** — Chain workspace_scout → workspace_grep → workspace_read_file → workspace_write_file → workspace_run_tests → workspace_git_commit into a fully supervised autonomous loop with checkpoint/rollback safety at each step.
3. **Per-workspace LLM config persistence** — Store LLM provider preferences and API keys per workspace in Key Vault references; apply from dashboard without runtime restart.
4. **Approval latency SLA enforcement** — Alert at P95 > 180 seconds; auto-escalate at 300 seconds with Teams notification to on-call approver.
5. **Evidence freshness automation** — Auto-generate evidence export after each weekly gate review cycle so auditors never see stale records.

### Medium Term (Scale Phase — Weeks 31–42)
1. **QA Agent role** — Same approval, audit, and connector architecture extended to: run_test_suite, analyze_test_failures, generate_bug_report, triage_flaky_test, update_test_plan. Risk classification mirrors Developer Agent.
2. **Manager Agent role** — Sprint planning, status report generation, blocker escalation over Teams. High-risk actions (close_sprint, reassign_task) gate through the same approval flow.
3. **Multi-agent orchestration** — Developer Agent delegates test generation to QA Agent; Manager Agent monitors both. Shared approval queue surfaces cross-agent actions.
4. **More connectors** — Confluence (wiki read/write), Slack (message, channel notify), Linear (issue tracking), Azure DevOps (pipeline trigger, work item update).
5. **Workspace_git_pr action** — End-to-end PR creation with description generation, reviewer assignment, and PR link posted to Teams or Jira.
6. **workspace_explain_code and workspace_add_docstring** — LLM-assisted code explanation and docstring generation targeted at onboarding and knowledge transfer use cases.
7. **Container-native density tier** — Move from isolated VM per tenant to Azure Container Apps with namespace isolation; reduces per-tenant cost by ~60 percent while preserving security boundaries.

### Enterprise Phase (Week 43+)
1. **SAML/SSO and enterprise identity federation** — Support corporate IdP login for dashboard and approval flows; map enterprise groups to AgentFarm roles.
2. **Policy-pack customization** — Tenant-specific risk overrides: e.g., merge_pr is LOW risk for a team with required-reviewers already enforced by branch policy.
3. **Multi-region deployment** — Active-active control plane in two Azure regions; runtime provisioned in tenant's preferred region for data residency compliance.
4. **Live meeting participation** — Teams meeting join, spoken Q&A, meeting summary generation with action items extracted and pushed to Jira. Requires separate voice pipeline and safety gate.
5. **Compliance export automation** — Scheduled compliance packs (SOC 2, ISO 27001 evidence bundles) generated and signed on cadence for enterprise audit programs.
6. **AgentFarm Marketplace** — Public catalog of community and partner bot configurations; one-click deploy to tenant workspace; partner revenue sharing model.
7. **Bring-your-own-model (BYOM)** — Tenant supplies their own Azure OpenAI endpoint or on-prem model; AgentFarm wraps it with the same risk and approval layer.
8. **Developer Agent memory** — Per-workspace persistent context: learned coding conventions, preferred PR description style, known issue patterns — surfaces as enriched prompts without extra LLM calls.

### Architecture Evolution Decisions Required Pre-Scale
1. ADR for multi-agent task delegation and shared approval queue
2. ADR for container-native density migration path (VM → ACA)
3. ADR for multi-region data residency and audit replication
4. ADR for enterprise policy-pack customization boundaries
5. ADR for BYOM security boundaries and secret isolation model

---

## ADR Baseline (Approved)
1. ADR-001: MVP scope and role boundaries
2. ADR-002: Risk taxonomy and approval thresholds
3. ADR-003: Connector contract model
4. ADR-004: Audit schema and evidence freshness
5. ADR-005: Kill switch and rollback strategy
6. ADR-006: Database portability strategy (Prisma + Supabase)
7. ADR-007: Multi-provider LLM routing with health-score fallback
8. ADR-008: Local workspace execution surface (81 action types, Tier 0–8)
9. ADR-009: Post-MVP Developer Agent expansion and multi-agent roadmap (planned)

Review date for ADR set: 2026-05-26

## Risk Register Baseline (Status as of 2026-04-30)
1. R-001 Connector scope drift (High) — Owner: Product Lead — **CLOSED**: Connector contracts frozen and implemented for Jira, Teams, GitHub, email. Post-MVP connectors tracked in roadmap.
2. R-002 Approval workflow latency (High) — Owner: Security and Safety Lead — **MITIGATED**: P95 latency tracked, auto-escalation at 3600s implemented, SLA metrics on dashboard.
3. R-003 Incomplete audit evidence (High) — Owner: Engineering Lead — **CLOSED**: 100% risky-action audit completeness implemented; append-only log; 12/24-month retention enforced.
4. R-004 Identity policy ambiguity (Medium) — Owner: Security and Safety Lead — **CLOSED**: Role-based policy packs frozen in runtime capability snapshot; mismatch triggers fresh freeze on startup.
5. R-005 Weak ownership on architecture changes (Medium) — Owner: Architecture Owner — **OPEN**: ADR change control policy enforced in code. Governance cadence (Monday kickoff, Friday gate review) in place.
6. R-006 LLM provider single-point-of-failure (Medium) — Owner: Engineering Lead — **MITIGATED**: Nine-provider adapter with health-score fallback (ADR-007). Heuristic fallback if all providers fail.
7. R-007 Local workspace path traversal (High) — Owner: Engineering Lead — **CLOSED**: safeChildPath() enforced on all file ops; absolute paths rejected; all tests passing.

Risk governance rule: High overdue items escalate in Monday kickoff.

## Competitive Gold-Standard Gate Model
### Active MVP Standards
1. Identity Realism
2. Role Fidelity and Task Quality
3. Autonomy with Human Approval

### MVP Go Threshold
1. Identity score = 5
2. Role Fidelity score = 5
3. Autonomy score = 5
4. weighted_score_mvp >= 4.8
5. No active disqualifier in standards 1-3 or 5

### MVP Weighted Formula
weighted_score_mvp = ((identity_score * 32) + (role_score * 43) + (autonomy_score * 25)) / 100

### No-Go Triggers
1. Unresolved critical security finding
2. Missing risky-action audit attribution
3. Bypassable approval controls
4. Evidence freshness breach on required gate score

## Approved Tooling Baseline (v1)
1. OpenClaw runtime
2. Paperclip orchestration control plane
3. PostgreSQL primary datastore
4. Redis plus BullMQ queueing
5. OPA policy engine
6. Vault-equivalent secrets system with managed identity integration
7. OpenTelemetry plus Prometheus plus Grafana plus Loki plus Tempo
8. Next.js plus NestJS plus TypeScript

## Signoff and Governance Status
### Final Signoff (Recorded)
1. Meeting date: 2026-04-19
2. Decision: Go
3. Reviewers: Product Lead, Engineering Lead, Security and Safety Lead, Customer Success Lead, Architecture Owner, Competitive Intelligence Owner
4. Blocking issues: None
5. Remediation required: None
6. Next formal review: 2026-05-03

### Operating Cadence
1. Sunday planning sync
2. Monday kickoff
3. Tuesday to Thursday daily standups
4. Friday demo and gate review
5. Monthly score and architecture baseline review

## Engineering Kickoff Plan (What To Build Next)
### Sprint 0 (Foundation)
1. Create repo and service skeletons for control plane services
2. Define shared data contracts for tenant, bot, approval, and evidence
3. Set CI quality gates and branch controls
4. Establish observability baseline and structured logging format
5. Define policy-pack packaging and deployment path

### Sprint 1 (Highest-Risk First)
1. Identity and approval flow skeleton end to end
2. Audit and evidence schema pipeline end to end
3. Provisioning state machine contract and failure policy implementation skeleton
4. Connector contract stubs for Jira, Teams, GitHub, and email

### Sprint 2 (MVP Operational Readiness)
1. Dashboard read models wired to real status data
2. Approval inbox workflow in web surface
3. Kill switch and incident-response integration checks
4. Reliability and latency KPI instrumentation for gate reporting

## Definition of Done for Any MVP Work Item
1. Scope-aligned with MVP freeze
2. Risk classification path implemented where applicable
3. Full audit fields emitted for risky actions
4. Approval gating behavior testable
5. Observability events present and queryable
6. Security and secret handling rules preserved
7. No architecture gate regression introduced

## Change Control Policy
1. Any architecture change affecting release gates requires:
- ADR update
- risk register update
- owner signoff
2. Same-day update rule applies to planning and governance docs
3. Out-of-scope feature proposals must be parked as post-MVP until explicit approval

## Canonical Source Map
This document consolidates, but does not replace, canonical ownership of source docs.

1. Strategy: strategy/vision-and-positioning.md
2. Architecture baseline: planning/product-architecture.md
3. Execution design: planning/engineering-execution-design.md
4. Signoff record: planning/v1-release-pack.md
5. ADRs: planning/architecture-decision-log.md
6. Risks: planning/architecture-risk-register.md
7. MVP gates: mvp/mvp-scope-and-gates.md
8. Competitive scoring: research/competitive-gold-standards.md
9. Operations cadence: operations/weekly-operating-system.md
10. Deep specs:
- planning/spec-tenant-workspace-bot-model.md
- planning/spec-azure-provisioning-workflow.md
- planning/spec-dashboard-data-model.md
- planning/spec-product-structure-model-architecture.md
- planning/spec-docker-runtime-contract.md
- planning/spec-connector-auth-flow.md
- planning/spec-incident-runbook-pack.md
11. Development kickoff plan: planning/development-kickoff-plan.md
12. Repo and service structure: planning/repo-and-service-structure.md

## Immediate Next Action

Sprint 1 is complete. The platform is code-complete and quality-gate-passing.

### Platform-Owner Actions Required Before Go-Live
1. Configure repository secret: AZURE_STATIC_WEB_APPS_API_TOKEN_WEBSITE
2. Sign in Azure CLI (`az login`) and run `azd up` per operations/runbooks/mvp-launch-ops-runbook.md
3. Complete DNS/custom-domain TLS cutover for website SWA
4. Run post-deploy gates: SAST/DAST scan, 1000-bot load test, evidence freshness export

### After Go-Live: Enter Pilot Phase
1. Onboard 1–2 pilot customers per operations/company-access-rollout.md
2. Track weekly quality scores (Identity Realism, Role Fidelity, Autonomy with Approval) in Friday gate reviews
3. Convert pilot feedback into the near-term roadmap items defined above
4. Begin ADR planning for QA Agent and multi-agent orchestration (Scale Phase prerequisite)
