# AgentFarm Master Plan
## Purpose
Build role-based AI agents for companies with clear ownership, clear release gates, and simple weekly execution.
Planning-first rule: no feature development starts until architecture baseline and decision gates are approved.
## Main Goals
1. Build AI agents that behave like real team members.
2. Keep strict safety and approval controls.
3. Launch only when gold-standard quality is proven.
## Phases
1. Validation and Architecture (Weeks 1-6) � **COMPLETED 2026-04-19**
- Validate customer need and workflow fit.
- Confirm top gold standards and evidence rules.
- Finalize MVP role scope.
- Finalize product architecture and decision records.
- Approve architecture gates before implementation.
2. MVP Build (Weeks 7-20) � **COMPLETED 2026-04-30**
- Built Developer Agent with 70+ local workspace action types across 12 tiers and 6 connector actions.
- Ten LLM providers with health-score fallback routing (openai, azure_openai, github_models, anthropic, google, xai, mistral, together, agentfarm, auto).
- Full approval and risk enforcement (HIGH/MEDIUM/LOW) with audit evidence.
- Azure runtime provisioning, VM bootstrap, Docker runtime lifecycle.
- Connector auth (Jira, Teams, GitHub, email) with OAuth, token refresh, health monitoring.
- Dashboard with provisioning status, approval queue, evidence panel, LLM config, marketplace.
- Quality gate passing: 179/179 agent-runtime tests passing, 200/200 api-gateway, all typechecks clean.
- Tier 9 Developer Productivity Wave shipped (2026-04-30): workspace_create_pr, workspace_run_ci_checks, workspace_fix_test_failures, workspace_security_fix_suggest, workspace_pr_review_prepare, workspace_dependency_upgrade_plan, workspace_release_notes_generate, workspace_incident_patch_pack, workspace_memory_profile, workspace_autonomous_plan_execute, workspace_policy_preflight.
- Tier 10 Connector Hardening + Code Intelligence + Observability shipped (2026-05-01): workspace_connector_test, workspace_pr_auto_assign, workspace_ci_watch, workspace_explain_code, workspace_add_docstring, workspace_refactor_plan, workspace_semantic_search, workspace_diff_preview, workspace_approval_status, workspace_audit_export. 190/190 tests passing.
- **Skill Marketplace shipped (2026-05-05)**: 21 developer-agent skills cataloged, all 21 execution handlers implemented in skill-execution-engine.ts, POST /runtime/marketplace/invoke endpoint, dashboard Skill Marketplace Panel with install and invoke flows. **299 tests passing, 0 failing.** ADR-015 approved.
- **Six-priority spec-alignment wave shipped (2026-05-07)**: long-term memory model + hooks, proactive CI/CVE signals, approval batching end-to-end, tester policy hardening, quality feedback loop into provider routing, and handoff protocol normalization. See planning/build-snapshot-2026-05-07.md.
- **Question escalation + memory continuation shipped (2026-05-07)**: question creation/answer/pending/sweep routes, webhook answer handling, and code-review memory ingestion are wired in api-gateway and memory-service.
- **Browser/Desktop evidence foundation shipped (2026-05-08)**: Azure Blob screenshot uploader, browser-action upload wrapper scaffold, desktop accessibility-tree capture, runtime audit integration scaffold, and dashboard session replay/evidence viewer are in repo. Targeted package tests/typechecks pass; repo-wide `pnpm quality:gate` is currently blocked by two failing question-route tests in api-gateway.
3. Pilot (Weeks 21-30) � **ACTIVE**
- Run with 1-2 customers per operations/company-access-rollout.md.
- Track quality, safety, and business value weekly.
- Harden production connector SDK integrations.
- Implement autonomous coding loop chaining.
- Convert pilot feedback into near-term roadmap items.
- Close the current API gateway question-route regression and finish runtime execution wiring for screenshot upload plus BrowserActionEvent persistence.
4. Scale (Weeks 31-42)
- Add QA Agent and Manager Agent (each requires dedicated ADR and safety gate).
- Multi-agent orchestration with shared approval queue.
- Additional connectors: Confluence, Slack, Linear, Azure DevOps.
- Container-native density migration: VM ? Azure Container Apps (requires separate ADR).
- Keep same score-5 gates per role.
5. Enterprise (Week 43+)
- SAML/SSO and enterprise identity federation.
- Policy-pack customization per tenant.
- Multi-region deployment for data residency compliance.
- Live meeting participation (requires separate voice pipeline safety gate).
- Compliance export automation (SOC 2, ISO 27001 evidence bundles).
- AgentFarm Marketplace with partner ecosystem and revenue sharing.
- Bring-your-own-model (BYOM) with same risk and approval wrapper.
- Developer Agent persistent workspace memory (? delivered as workspace_memory_profile in Tier 9).
## Architecture Baseline (Must Finish Before Build)
1. System boundaries
- Control plane: identity, policy, approval, and configuration.
- Runtime plane: role execution engine, task orchestration, and connector actions.
- Evidence plane: audit logs, score evidence, and reporting.
2. Core architecture components
- Identity service for agent profile, account mapping, and disclosure enforcement.
- Policy engine for risk classification and action permission checks.
- Approval workflow service for medium and high risk actions.
- Connector layer for Jira, Microsoft Teams, GitHub, and company email.
- Observability stack for logs, traces, gate metrics, and incident triggers.
3. Data and audit model
- Unified action record: actor, role, system, action, timestamp, reason, risk level, approval state.
- Immutable approval log with approver identity and decision latency.
- Score evidence table tied to gold-standard category and freshness date.
4. Non-functional targets
- Reliability target for MVP critical paths: 99.5 percent.
- Approval decision latency target: under 2 minutes for human step.
- Full audit completeness on all risky actions: 100 percent.
- Security baseline: no critical findings at release gate.
## Architecture Decision Gates
1. Gate A: Architecture scope freeze
- MVP boundaries and out-of-scope items signed off by Product Lead.
2. Gate B: Safety and control signoff
- Security and Safety Lead confirms policy model, approval model, and kill switch design.
3. Gate C: Integration readiness signoff
- Engineering Lead confirms connector contracts for Jira, Microsoft Teams, GitHub, and email.
4. Gate D: Evidence readiness signoff
- Product and Security confirm scoring evidence schema, freshness policy, and reporting cadence.
Rule: development starts only after all architecture gates are approved.
## Planning Artifacts
1. Product architecture baseline: planning/product-architecture.md
2. Architecture decision log: planning/architecture-decision-log.md
3. Architecture risk register: planning/architecture-risk-register.md
4. Production-ready v1 pack: planning/v1-release-pack.md
5. Engineering execution design: planning/engineering-execution-design.md
6. Gap matrix (current vs desired): planning/agentfarm-gap-matrix-current-vs-desired.md
7. Two-sprint backlog (safety and orchestration): planning/agentfarm-two-sprint-backlog-safety-and-orchestration.md
8. Low-risk migration plan (boundary-safe): planning/agentfarm-low-risk-migration-plan.md
9. Six-priority implementation snapshot with 2026-05-08 continuation updates: planning/build-snapshot-2026-05-07.md
## Non-Negotiable Release Gates
1. Identity Realism = 5
2. Role Fidelity and Task Quality = 5
3. Autonomy with Human Approval = 5
## Competitive Decision Framework
1. Weighted scoring is the default decision model in research/competitive-gold-standards.md.
2. MVP decisions use re-based active-standard weights for standards 1-3.
3. Enterprise decisions use full 1-8 weighted model.
4. Any active no-go trigger overrides weighted score and blocks release.
5. Score evidence freshness and confidence labels are mandatory for gate decisions.
## Ownership
1. Product Lead
- Owns roadmap, priorities, and gate decisions.
2. Engineering Lead
- Owns build quality and delivery.
3. Security and Safety Lead
- Owns approval policies, audit logs, and incident controls.
4. Customer Success Lead
- Owns pilot onboarding, adoption, and feedback loop.
5. Architecture Owner (assigned by Product Lead)
- Owns architecture document quality, dependency map, and decision log integrity.
6. Competitive Intelligence Owner (assigned by Product Lead)
- Owns competitor scoring quality, citation integrity, and monthly score refresh.
## Update Rules
1. If timeline slips, update this plan the same day.
2. If new risk appears, update risk log within 4 hours.
3. If customer feedback changes direction, update plan within 1 week.
4. If competitor makes major move, update research notes within 48 hours.
5. If architecture decision changes, update architecture doc and decision log the same day.
## Weekly Rhythm
1. Sunday: leadership planning
2. Monday: team kickoff
3. Tuesday to Thursday: daily standups
4. Friday: demo, metrics, and next-week plan
## Monthly Decision Review
1. Recompute MVP or enterprise weighted score with latest evidence.
2. Confirm active disqualifier status.
3. Publish go, conditional-go, or no-go recommendation with owner signoff.
4. Assign remediation owners for each score below threshold.
## Pre-Development Final Approval
1. Run v1 pack review sequence from planning/v1-release-pack.md.
2. Complete final approval checklist from planning/v1-release-pack.md.
3. Development may start only after all checklist items are complete.

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).

<!-- doc-sync: 2026-05-07 six-priority-closure -->
> Last synchronized: 2026-05-07 (Six-priority implementation closure and validation snapshot).

<!-- doc-sync: 2026-05-08 observability-and-question-continuation -->
> Last synchronized: 2026-05-08 (Question/memory continuation plus browser-desktop evidence foundation, with current quality-gate blocker recorded).
