# AgentFarm Developer Agent Sprint Board

## Purpose
Provide a sprint-ready board derived from the MVP implementation backlog, with explicit execution metadata for immediate delivery planning.

## Planning Sources
1. planning/developer-agent-mvp-implementation-backlog.md
2. planning/future-agent-build-playbook.md
3. mvp/mvp-scope-and-gates.md
4. planning/mvp-approved-execution-task-list.md
5. planning/developer-agent-sprint-program.md

## Board Rules
1. Do not start implementation for tasks with unresolved dependency.
2. Any scope check marked Fail must be escalated before work continues.
3. Every task must attach test and evidence links before closure.
4. Medium and high risk mutations require approval routing verification in DoD.

## Sprint Board (Recommended Initial Sequencing)

| Task ID | Sprint | Task Name | Owner | Estimate | Dependency | Priority | Scope Check | Definition of Done |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DA-P0-001 | Sprint A | Unify Developer task contract across dashboard, API, runtime | Engineering Lead | 3d | None | P0 | Pass | Contract schema merged in shared types, intake validation added, integration tests pass, evidence fields mapped. |
| DA-P0-002 | Sprint A | Enforce capability snapshot on all execution paths | Runtime Lead | 2d | DA-P0-001 | P0 | Pass | Capability check invoked pre-execution on connector and workspace actions, blocked task tests added, no bypass path remains. |
| DA-P0-003 | Sprint A | Standardize low-risk execute and medium/high approval route | Security and Safety Lead | 3d | DA-P0-001, DA-P0-002 | P0 | Pass | Risk route matrix implemented and tested, low-risk direct path works, medium/high cannot execute without approval record. |
| DA-P0-004 | Sprint A | Stabilize workspace action chain reliability | Runtime Lead | 4d | DA-P0-002 | P0 | Pass | Scout-read-edit-validate-checkpoint flow works in regression suite, sandbox path tests pass, typed failure codes returned. |
| DA-P0-005 | Sprint A | Add deterministic command fallback for build/test/lint | Runtime Lead | 2d | DA-P0-004 | P1 | Pass | Fallback command sequence implemented, timeout/error handling tested, failure hint text visible in operator output. |
| DA-P0-006 | Sprint A | Enforce pre-PR validation and evidence summary | QA Lead | 3d | DA-P0-003, DA-P0-004 | P0 | Pass | Mutation workflows run lint/tests where available, evidence record includes validation result, negative tests verify missing-command path. |
| DA-P0-007 | Sprint A | Build escalation packet for failed quality gates | Product Engineering Lead | 2d | DA-P0-006 | P1 | Pass | Escalation packet includes risk, failing checks, impacted files, rollback hint, UI/API contract tests pass. |
| DA-P0-008 | Sprint A | Harden approval-only notification trigger discipline | Integration Lead | 2d | DA-P0-003 | P1 | Pass | Non-approval events are filtered, duplicate suppression window tested, approval latency metrics exposed. |
| DA-P1-001 | Sprint B | Add Shadow Mode (plan-only no mutation) | Architecture Owner | 4d | DA-P0-003, DA-P0-006 | P0 | Pass | Shadow path produces plan and evidence only, no connector/workspace mutation side effects, comparison report baseline generated. |
| DA-P1-002 | Sprint B | Build context-rich approval packet (diff, tests, rollback, what-if) | Product Engineering Lead | 3d | DA-P1-001 | P1 | Pass | Approval payload includes all required context fields, approver rationale persisted, query endpoint returns rationale by task. |
| DA-P1-003 | Sprint B | Add monorepo impact analysis and test recommendations | Runtime Lead | 5d | DA-P0-004 | P1 | Pass | Dependency graph integration complete, impacted test suggestions generated, boundary warnings shown pre-mutation, precision benchmark captured. |
| DA-P2-001 | Sprint C | Implement project-scoped memory store and retrieval | Engineering Lead | 4d | DA-P1-001 | P1 | Pass | Memory entries persisted with provenance, read/write APIs tested, tenant/project isolation tests pass. |
| DA-P2-002 | Sprint C | Add approval-gated memory promotion to org scope | Security and Safety Lead | 3d | DA-P2-001 | P1 | Pass | Promotion requires approval record, policy checks enforced, audit trail includes approver and policy version. |
| DA-P2-003 | Sprint C | Generate compliance evidence export starter (SOC2/ISO map) | Compliance Engineering Lead | 4d | DA-P0-006, DA-P2-001 | P1 | Pass | Export bundle contains approvals, actions, policy decisions, validation outcomes, hash verification test passes. |

## Capacity and Scheduling Template
Use this table before each sprint start.

| Sprint | Available Capacity (person-days) | Planned Load (person-days) | Buffer | Notes |
| --- | --- | --- | --- | --- |
| Sprint A |  |  |  |  |
| Sprint B |  |  |  |  |
| Sprint C |  |  |  |  |
| Sprint 1 (Persona Layer) | — | — | — | Completed 2026-05-15 |
| Sprint 2 (Role Enforcement) | — | — | — | Completed 2026-05-15 |
| Sprint 3 (Episodic Memory) | — | — | — | Completed 2026-05-15 |
| Sprint 4 (Setup Wizard Backend) | — | — | — | Completed 2026-05-15 |
| Sprint 5 (Setup Wizard Frontend) | — | — | — | Completed 2026-05-15 |
| Sprint 6 (Marketplace) | — | — | — | Completed 2026-05-15 |
| Sprint 7 (Billing Metering) | — | — | — | Completed 2026-05-15 |
| Sprint 8 (Vertical Hardening) | — | — | — | Completed 2026-05-16 |
| Sprint 9 (Fire-Agent + Semantic Memory) | — | — | — | Completed 2026-05-16 |
| Sprint 10 (Full Desktop VM) | — | — | — | Completed 2026-05-18 |
| Sprint 11 (Voicebox Meeting Audio) | — | — | — | Completed 2026-05-18 |
| Sprint 12 (OAuth Connectors + Episodic Memory UI) | — | — | — | Completed 2026-05-18 |
| Sprint 13 (Billing Checkout + AI Disclosure Compliance) | — | — | — | Completed 2026-05-18 |
| Sprint 15 (Dashboard Wiring + Per-Agent Billing) | — | — | — | Completed 2026-05-19 |
| Sprint 16 (Stripe Webhook Fix + Tester Marketplace) | — | — | — | Completed 2026-05-20 |
| Sprint 17 (Tester Full QA Platform) | — | — | — | Completed 2026-05-20 |

## Execution Status Template
Update this block continuously during execution.

| Task ID | Status | Owner | Start Date | End Date | Evidence Link | Scope Check | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DA-P0-001 | Completed | Engineering Lead | 2026-04-28 | 2026-04-30 | planning/build-snapshot-2026-04-28.md | Pass | Unified task contract shipped Sprint 1 |
| DA-P0-002 | Completed | Runtime Lead | 2026-04-28 | 2026-04-30 | planning/build-snapshot-2026-04-28.md | Pass | Capability snapshot enforcement wired Sprint 1 |
| DA-P0-003 | Completed | Security and Safety Lead | 2026-04-28 | 2026-04-30 | planning/build-snapshot-2026-04-28.md | Pass | Risk route matrix implemented Sprint 1 |
| DA-P0-004 | Completed | Runtime Lead | 2026-04-28 | 2026-04-30 | planning/build-snapshot-2026-04-28.md | Pass | Workspace action chain reliability Sprint 1 |
| DA-P0-005 | Completed | Runtime Lead | 2026-04-30 | 2026-04-30 | planning/build-snapshot-2026-04-28.md | Pass | Tier 9 fallback shipped Sprint 1 |
| DA-P0-006 | Completed | QA Lead | 2026-04-28 | 2026-04-30 | planning/build-snapshot-2026-04-28.md | Pass | Pre-PR validation + evidence summary wired Sprint 1 |
| DA-P0-007 | Completed | Product Engineering Lead | 2026-04-30 | 2026-04-30 | planning/build-snapshot-2026-04-28.md | Pass | Escalation packet shipped Sprint 1 |
| DA-P0-008 | Completed | Integration Lead | 2026-05-04 | 2026-05-04 | planning/build-snapshot-2026-05-07.md | Pass | ADR-010 dispatchApprovalAlert shipped |
| DA-P1-001 | Completed | Architecture Owner | 2026-04-30 | 2026-05-01 | planning/build-snapshot-2026-04-28.md | Pass | Shadow mode + approval batching shipped Sprint 2 |
| DA-P1-002 | Completed | Product Engineering Lead | 2026-04-30 | 2026-05-07 | planning/build-snapshot-2026-05-07.md | Pass | Context-rich approval packet shipped (ADR-016) |
| DA-P1-003 | Completed | Runtime Lead | 2026-05-01 | 2026-05-07 | planning/build-snapshot-2026-05-07.md | Pass | Monorepo impact + test recommendations shipped |
| DA-P2-001 | Completed | Engineering Lead | 2026-05-07 | 2026-05-07 | planning/build-snapshot-2026-05-07.md | Pass | Long-term memory store + runtime hooks shipped (ADR-016) |
| DA-P2-002 | Completed | Security and Safety Lead | 2026-05-07 | 2026-05-07 | planning/build-snapshot-2026-05-07.md | Pass | Approval-gated memory promotion wired |
| DA-P2-003 | Completed | Compliance Engineering Lead | 2026-05-01 | 2026-05-04 | planning/build-snapshot-2026-05-07.md | Pass | Compliance export shipped in services/compliance-export |
| SPRINT-1-PERSONA | Completed | Engineering Lead | 2026-05-15 | 2026-05-15 | planning/build-snapshot-2026-05-16.md | Pass | AgentPersona model, persona-context-loader.ts, /v1/personas/:botId, agent-persona-panel.tsx |
| SPRINT-2-ROLE | Completed | Runtime Lead | 2026-05-15 | 2026-05-15 | planning/build-snapshot-2026-05-16.md | Pass | role-enforcer.ts, task-classifier.ts, developer-role-profile.ts |
| SPRINT-3-EPISODIC | Completed | Engineering Lead | 2026-05-15 | 2026-05-15 | planning/build-snapshot-2026-05-16.md | Pass | AgentLongTermMemory vector(1536), episodic read/write hooks, memory-context-injector.ts |
| SPRINT-4-WIZARD-BE | Completed | Engineering Lead | 2026-05-15 | 2026-05-15 | planning/build-snapshot-2026-05-16.md | Pass | SetupWizardSession model, /v1/setup-wizard routes, hire-handler.ts |
| SPRINT-5-WIZARD-FE | Completed | Product Engineering Lead | 2026-05-15 | 2026-05-15 | planning/build-snapshot-2026-05-16.md | Pass | apps/website/app/onboarding/wizard/page.tsx, connector-auth.ts OAuth |
| SPRINT-6-MARKETPLACE | Completed | Product Engineering Lead | 2026-05-15 | 2026-05-15 | planning/build-snapshot-2026-05-16.md | Pass | apps/website/app/marketplace/ pages, bots-catalogue.ts (12 roles) |
| SPRINT-7-BILLING | Completed | Engineering Lead | 2026-05-15 | 2026-05-15 | planning/build-snapshot-2026-05-16.md | Pass | billing-metering.ts, platformFeeUsd on TaskExecutionRecord, /v1/billing/metering/period |
| SPRINT-8-HARDENING | Completed | Runtime Lead | 2026-05-15 | 2026-05-16 | operations/quality/8.1-quality-gate-report.md | Pass | evaluator-webhook.ts, agent-handoff-manager.ts durable persistence. 47/47 gate lanes PASS |
| SPRINT-9-FIRE-SEMANTIC | Completed | Engineering Lead | 2026-05-16 | 2026-05-16 | operations/quality/9.1-quality-gate-report.md | Pass | agent-lifecycle.ts (terminate API), knowledge-base.ts (RAG write/search), semantic-write-hook.ts, semantic-search-hook.ts. 47/47 lanes, 1181/1181 api-gateway tests |
| SPRINT-10-DESKTOP-VM | Completed | Engineering Lead | 2026-05-18 | 2026-05-18 | planning/build-snapshot-2026-05-16.md | Pass | docker/desktop-agent/Dockerfile (Xvfb+noVNC), services/desktop-agent/app.py (Python Flask vision loop), desktop-agent-contracts.ts, desktop-sessions.ts route, desktop-stream-panel.tsx, desktop-panel.tsx, vm-lifecycle-manager.ts + tests |
| SPRINT-11-VOICEBOX | Completed | Engineering Lead | 2026-05-18 | 2026-05-18 | operations/quality/12.1-quality-gate-report.md | Pass | PulseAudio virtual audio in desktop-agent, join-meeting+speak+capture-audio routes in app.py, VoiceboxClient.createVoiceProfile()+createVoiceProfileFromDescription(), speaking-agent.ts migrated off VoxCPM2, runMeetingParticipation(), voice-profile-seeder.ts (12 roles), seedVoiceProfiles() startup hook, VOICEBOX_URL in docker-compose |
| SPRINT-12-OAUTH-CONNECTORS | Completed | Engineering Lead | 2026-05-18 | 2026-05-18 | operations/quality/13.1-quality-gate-report.md | Pass | connector-auth.ts (full OAuth2 Jira/GitHub/Teams/Email — initiate, callback, refresh, revoke, health-summary, internal token), connector-auth.test.ts (22 tests), episodic-memory.ts (paginated browse + GDPR redact), episodic-memory.test.ts (9 tests), dashboard connectors page + connector-config-panel.tsx + connector-marketplace page, dashboard memory page + agent-episodic-memory-panel.tsx, Next.js proxy routes for connectors + episodic-memory |
| SPRINT-13-BILLING-DISCLOSURE | Completed | Engineering Lead | 2026-05-18 | 2026-05-18 | operations/quality/14.1-quality-gate-report.md | Pass | createStripeCheckoutSession(), POST /v1/billing/checkout-session, GET /v1/billing/invoices/:invoiceId/download, disclosure.ts (4 routes: GET/PATCH config, POST ack, GET audit), disclosure-guard.ts (enforceDisclosure per channel), billing checkout page + disclosure-settings-panel.tsx, dashboard proxy routes, 39 new tests (13 disclosure + 8 billing + 18 guard). 1225/1225 api-gateway, 1096/1096 agent-runtime |
| SPRINT-14-DEV-AGENT-GAP-CLOSURE | Completed | Engineering Lead | 2026-05-16 | 2026-05-16 | operations/quality/15.1-quality-gate-report.md | Pass | workspace_ai_code_review real static analysis (pattern scan + ESLint best-effort), GET /v1/workspaces/:workspaceId/pull-requests list endpoint, GET /v1/workspaces/:workspaceId/ci-failures list endpoint, dashboard proxy routes for [botId]/pr-drafts and [botId]/ci-runs, 10 new tests. 1237/1237 api-gateway. Developer agent production-ready. |
| SPRINT-15-WIRING-BILLING | Completed | Engineering Lead | 2026-05-19 | 2026-05-19 | planning/build-snapshot-2026-05-16.md | Pass | Fixed decommission button wiring (DELETE → POST /terminate); added GET /v1/billing/metering/agent per-agent endpoint; AgentBillingCard component wired into agent detail page. Both typechecks clean. |
| SPRINT-16-STRIPE-WEBHOOK-TESTER-ROLE | Completed | Engineering Lead | 2026-05-20 | 2026-05-20 | planning/build-snapshot-2026-05-16.md | Pass | verifyStripeWebhook handles checkout.session.completed; Stripe init moved inside try block (security fix); POST /v1/billing/checkout-session persists Order before redirecting; 3 new webhook route tests (21/21 pass); Tester marketplace page (apps/website/app/marketplace/tester/page.tsx). Both typechecks clean. |
| SPRINT-17-TESTER-FULL-QA-PLATFORM | Completed | Engineering Lead | 2026-05-20 | 2026-05-20 | planning/build-snapshot-2026-05-16.md | Pass | Fixed Stripe webhook 500 (empty-key guard + route try/catch — 21/21 billing tests pass); Tier 20 testing tool integrations (13 new actions: selenium_test_run, cypress_test_run, appium_test_run, playwright_test_run, load_test_run, load_test_report, api_test_run, api_test_report, dast_scan, security_test_report, test_case_sync, test_run_publish, visual_regression); k6/mvn/java added to ALLOWED_COMMANDS; TESTER_ROLE_ALLOWED_CONNECTORS expanded to 18 tools; TESTER_ROLE_ALLOWED_LOCAL_ACTIONS expanded to cover all QA disciplines; tester marketplace page rewritten with 6 testing-discipline cards + 18 connector pills. Agent-runtime typecheck clean. |

## Release Exit Checklist
1. All P0 tasks are completed with evidence links.
2. Quality gate scripts pass in all impacted workspaces.
3. Approval routing tests pass for medium and high risk paths.
4. Kill-switch behavior verified and documented for affected services.
5. MVP scope boundaries remain intact or approved exceptions are recorded.

<!-- doc-sync: 2026-05-20 sprint-17 -->
> Last synchronized: 2026-05-20 (Sprint 17 closed: Stripe webhook 500 fixed (21/21 billing tests); Tier 20 — 13 testing tool actions added to local-workspace-executor.ts; tester-agent-profile.ts expanded to 18 connectors + full QA action set; marketplace/tester page rewritten with 6 testing-discipline sections. All typechecks clean).


## Current Implementation Pointer (2026-05-07)
1. For the latest built-state summary and file map, see planning/build-snapshot-2026-05-07.md.
