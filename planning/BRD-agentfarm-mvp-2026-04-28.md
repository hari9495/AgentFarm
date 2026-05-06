# Business Requirements Document (BRD)

## Document Control
- Product: AgentFarm MVP
- Date: 2026-04-28
- Version: 2.0
- Status: Updated from implemented workspace baseline

## 1. Purpose
Define business requirements for the current AgentFarm MVP baseline and the remaining release-completion requirements for launch.

## 2. Business Problem
Teams need autonomous agent execution for developer and operational workflows, but must preserve governance, tenant isolation, risk controls, and audit evidence for compliance and production trust.

## 3. Business Objectives
1. Deliver tenant-scoped autonomous workflow execution with safe defaults.
2. Enforce approval gating for risky actions before external side effects occur.
3. Provide compliance-ready evidence with audit traceability and exportability.
4. Operationalize onboarding, provisioning, and runtime controls through usable dashboard experiences.
5. Publish a production-ready external website and marketplace experience for adoption.

## 4. Scope Baseline (As Built)

### 4.1 Implemented Scope
1. Signup/login/session and workspace-scoped dashboard access.
2. Provisioning orchestration state machine with failure rollback and cleanup flows.
3. Runtime service with readiness/liveness, logs, state history, and graceful kill behavior.
4. Connector platform for Jira, Teams, GitHub, and Email with OAuth/token lifecycle and normalized actions.
5. Risk and approval routing with escalation and decision enforcement.
6. Audit and evidence APIs with retention management and dashboard export flows.
7. Internal dashboard with overview, approvals, observability, and audit tabs.
8. Public website pages and marketplace quick-start experience.

### 4.2 In-Progress Release Scope
1. Website SWA production rollout completion (secrets, DNS/TLS, deployment evidence).
2. Production deployment evidence and runbook signoff.
3. Security/load/freshness launch gates and final signoff evidence.

### 4.3 Out of Scope (Current MVP)
1. Non-approved multi-agent role expansion beyond frozen Sprint scope.
2. Major architecture refactors across monorepo boundaries.
3. Additional cloud platform support outside current Azure-first baseline.

## 5. Stakeholders
- Product Lead
- Engineering Lead
- Cloud Ops and DevOps
- Security and Safety Lead
- Compliance Lead
- Frontend Lead
- QA Lead

## 6. Business Requirements

### BR-01 Identity and Access
The platform shall support signup/login/session workflows and protect internal routes by authenticated session and workspace scope.

### BR-02 Tenant and Workspace Isolation
The platform shall isolate tenant and workspace operations so user actions and data are scoped to authorized workspace context.

### BR-03 Provisioning Governance
The platform shall run provisioning through a controlled multi-state lifecycle with visible progress, timeout handling, and cleanup on failure.

### BR-04 Runtime Operability
The platform shall expose runtime health, logs, state transitions, and safe shutdown controls for operator visibility.

### BR-05 Connector Interoperability
The platform shall support connector auth lifecycle (initiate, callback, refresh, revoke, consent recovery), normalized action execution, and health/remediation visibility.

### BR-06 Human Approval Governance
The platform shall route medium/high risk actions to approval workflows and block risky execution until approved.

### BR-07 Audit and Evidence
The platform shall capture append-only operational and decision events, retain them according to policy, and support filtered export.

### BR-08 UX Readiness
The platform shall provide internal operator UX for provisioning, approvals, observability, and audit; and external UX for website and onboarding.

### BR-09 Operational Readiness
The platform shall provide runbooks, CI quality gates, and release evidence required for launch approval.

## 7. Success Metrics and Targets
1. Provisioning telemetry and SLA state visible in dashboard for active jobs.
2. Risky actions never execute without required approval decision.
3. Connector failures produce actionable remediation states.
4. Audit events are queryable and exportable for compliance review.
5. Quality gate run passes required typecheck/test/coverage lanes for release candidate.

## 8. Non-Functional Requirements
1. Security: no plaintext secret persistence in code, image, or database fields intended for references.
2. Reliability: retry and rollback behavior for transient and terminal failures.
3. Observability: structured runtime and orchestration visibility with operator-friendly views.
4. Maintainability: boundaries across apps/services/packages remain explicit.
5. Performance: runtime and provisioning paths provide operationally acceptable startup and health response windows.

## 9. Dependencies and Constraints
1. Azure auth context must be active for deployment operations.
2. Repository secret AZURE_STATIC_WEB_APPS_API_TOKEN_WEBSITE must be configured.
3. DNS/custom-domain/TLS completion required for final website rollout evidence.
4. OAuth provider credentials and secret-store connectivity required for connector production readiness.

## 10. Risks and Mitigations
1. Deployment readiness delay due to cloud auth context.
Mitigation: explicit preflight and sign-in checks in runbook.
2. Connector provider rate-limit and permission drift.
Mitigation: retry/backoff and consent recovery states with remediation guidance.
3. Evidence gap near launch.
Mitigation: enforce runbook evidence checklist and gate-based closure.

## 11. Acceptance Criteria
1. Baseline implemented capabilities validated by quality gate and regression checks.
2. Remaining launch blockers resolved with evidence artifacts.
3. Product, Engineering, and Security approve launch closure.


<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).
