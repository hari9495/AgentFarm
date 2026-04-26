# AgentFarm Full System Documentation v1

## Document Purpose
This document is the single consolidated source of truth for AgentFarm v1 planning, architecture, governance, and engineering kickoff.

It combines approved decisions from strategy, architecture, execution design, release pack, ADRs, risk register, and operating cadence.

## Document Status
1. Version: v1.0
2. Baseline date: 2026-04-19
3. Architecture signoff decision: Go
4. Scope mode: MVP scope freeze active
5. Change control: Any gate-impacting change requires ADR + risk update on the same day

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

## ADR Baseline (Approved)
1. ADR-001: MVP scope and role boundaries
2. ADR-002: Risk taxonomy and approval thresholds
3. ADR-003: Connector contract model
4. ADR-004: Audit schema and evidence freshness
5. ADR-005: Kill switch and rollback strategy

Review date for ADR set: 2026-05-03

## Risk Register Baseline (Open Risks)
1. R-001 Connector scope drift (High) - Owner: Product Lead
2. R-002 Approval workflow latency (High) - Owner: Security and Safety Lead
3. R-003 Incomplete audit evidence (High) - Owner: Engineering Lead
4. R-004 Identity policy ambiguity (Medium) - Owner: Security and Safety Lead
5. R-005 Weak ownership on architecture changes (Medium) - Owner: Architecture Owner

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
Execute Sprint 0 checklist in planning/development-kickoff-plan.md. All contract closure tasks (1.1, 1.2, 2.1, 2.2, 4.1, 5.1) must be completed before Sprint 1 build begins.
