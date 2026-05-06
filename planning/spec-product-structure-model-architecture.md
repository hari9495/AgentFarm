# AgentFarm Spec: Product Structure and Model Architecture

## Purpose
Provide a granular architecture structure for MVP so engineering can build without boundary confusion.

## Scope
1. Covers control plane, runtime plane, and evidence plane for MVP.
2. Covers module boundaries, ownership boundaries, and interface boundaries.
3. Covers request and event flows for core user journeys.
4. Does not introduce any new MVP scope.

## MVP Scope Guardrail
1. Developer Agent only.
2. Connectors limited to Jira, Microsoft Teams, GitHub, and company email.
3. Medium and high-risk actions always require human approval.
4. Any meeting voice behavior or HR interview mode remains post-MVP.

## Architecture Layers
### 1. Experience Layer
1. Admin Console
2. Approval Inbox
3. Customer Dashboard

Responsibilities:
1. Collect user input.
2. Display lifecycle status and health.
3. Route actions to control plane APIs.

### 2. Control Plane Layer
1. Identity Service
2. Tenant and Plan Service
3. Bot and Role Service
4. Policy and Risk Service
5. Approval Service
6. Connector Gateway
7. Provisioning Service
8. Evidence API

Responsibilities:
1. Own tenant and workspace state.
2. Enforce policy and approvals.
3. Orchestrate runtime provisioning.
4. Publish auditable events.

### 3. Runtime Plane Layer
1. Bot Runtime Container
2. Runtime Worker Loops
3. Connector Workers

Responsibilities:
1. Execute planned actions.
2. Request approvals for risky actions.
3. Emit structured action and health events.

### 4. Evidence Plane Layer
1. Event Ingestion Pipeline
2. Audit Record Store
3. Metrics Aggregation Jobs
4. Read Models for dashboard and release gates

Responsibilities:
1. Store immutable-like action and approval history.
2. Build traceable evidence for release gates.
3. Feed quality and safety score reporting.

## Bounded Contexts and Ownership
### Identity and Access Context
Owns:
1. tenant_users
2. user roles
3. control-plane API auth

Does not own:
1. provisioning state
2. bot execution state

### Tenant and Workspace Context
Owns:
1. tenants
2. workspaces
3. plan linkage

Does not own:
1. action logs
2. connector tokens

### Bot Orchestration Context
Owns:
1. bots
2. task lifecycle
3. action planning state

Does not own:
1. final approval decisions
2. connector OAuth grant metadata

### Policy and Approval Context
Owns:
1. risk classification rules
2. approval requests and decisions
3. kill switch state

Does not own:
1. task source data
2. connector health checks

### Connector Context
Owns:
1. connector activation state
2. token and permission validation result
3. connector health status

Does not own:
1. tenant billing state
2. policy risk taxonomy

### Provisioning Context
Owns:
1. provisioning jobs
2. runtime resource mapping
3. runtime readiness status

Does not own:
1. approval queues
2. connector permission scope definitions

### Evidence Context
Owns:
1. audit_events
2. evidence_records
3. score computation inputs

Does not own:
1. runtime command dispatch
2. provisioning retries

## Core Domain Entities
1. tenant
2. workspace
3. bot
4. task
5. action
6. approval
7. connector_state
8. provisioning_job
9. runtime_resource
10. audit_event
11. evidence_record

## Service Contracts (MVP)
### Identity Service
Inputs:
1. signup request
2. login request

Outputs:
1. authenticated identity token
2. actor context for audit events

### Tenant and Plan Service
Inputs:
1. signup completion
2. workspace creation

Outputs:
1. tenant/workspace records
2. plan enforcement context

### Bot and Role Service
Inputs:
1. selected role
2. workspace configuration

Outputs:
1. bot profile
2. runtime config package reference

### Policy and Risk Service
Inputs:
1. proposed action payload
2. actor and context metadata

Outputs:
1. risk level
2. allow, block, or approval_required decision

### Approval Service
Inputs:
1. approval request
2. human decision

Outputs:
1. approval status transition
2. signed decision event

### Connector Gateway
Inputs:
1. activation command
2. connector operation request

Outputs:
1. normalized operation result
2. connector health event

### Provisioning Service
Inputs:
1. workspace and bot creation event
2. runtime tier policy

Outputs:
1. provisioning status transitions
2. runtime registration status

### Evidence API
Inputs:
1. structured runtime events
2. approval and provisioning events

Outputs:
1. queryable evidence views
2. release gate metrics

## Canonical Event Model
1. tenant.created
2. workspace.created
3. bot.created
4. provisioning.job_created
5. provisioning.completed
6. task.created
7. action.proposed
8. action.executed
9. action.blocked
10. approval.requested
11. approval.decided
12. connector.activated
13. connector.degraded
14. kill_switch.triggered
15. audit.recorded

## Critical Flows
### Flow A: Signup to Ready Bot
1. User completes signup.
2. Tenant and workspace are created.
3. Bot profile is created.
4. Provisioning job is queued.
5. Runtime resources are created and container starts.
6. Runtime health check passes.
7. Dashboard status changes to ready.

### Flow B: Task to Action with Approval
1. Task enters runtime-api.
2. Action plan is generated.
3. Policy and risk service classifies each action.
4. Low risk executes directly.
5. Medium and high risk create approval request.
6. Approval decision returns allow or reject.
7. Runtime executes or blocks action and emits audit events.

### Flow C: Connector Activation
1. User starts connector activation.
2. Connector gateway runs OAuth or token validation.
3. Secret reference is stored via secure store integration.
4. Effective permission scope is validated.
5. Connector state becomes connected or degraded.

## State Machines
### Bot State
1. created
2. bootstrapping
3. connector_setup_required
4. active
5. paused
6. degraded
7. failed

### Provisioning Job State
1. queued
2. resource_group_created
3. identity_created
4. vm_created
5. bootstrap_in_progress
6. container_started
7. healthcheck_passed
8. completed
9. failed

### Approval State
1. pending
2. approved
3. rejected
4. expired

## Interface Rules
1. Experience layer must never call runtime host directly.
2. All user operations pass through control plane APIs.
3. Runtime emits events only through approved event schema.
4. Evidence API is read-only for dashboards and reviews.
5. Any write path to audit data is append-focused and traceable.

## Security and Isolation Rules
1. Runtime workloads are isolated at workspace boundary.
2. Secrets are never hardcoded in image or source.
3. Managed identity is preferred for Azure resource access.
4. Public inbound to runtime hosts is restricted by default.
5. Every risky action includes actor, reason, and decision trace.

## Reliability Rules
1. Retries with bounded exponential backoff for transient failures.
2. Dead-letter path for non-recoverable async failures.
3. Health checks for runtime, connector gateway, and approval service.
4. Alerting on approval latency and connector failure spikes.

## Delivery Decomposition
### Build Slice 1
1. Tenant/workspace/bot core models.
2. Signup and provisioning queue handoff.

### Build Slice 2
1. Runtime action planning and risk classification.
2. Approval request and decision loop.

### Build Slice 3
1. Connector activation and health views.
2. Audit and evidence query models.

### Build Slice 4
1. Reliability hardening.
2. Security review and gate evidence completion.

## Finalization Checklist
1. Every service has a single owner assigned.
2. Every entity has a clear owning context.
3. Every critical flow has an acceptance test path.
4. Every state machine is reflected in APIs and read models.
5. Open architecture decisions are either resolved or explicitly blocked.

## Related Specs
1. planning/spec-tenant-workspace-bot-model.md
2. planning/spec-azure-provisioning-workflow.md
3. planning/spec-dashboard-data-model.md
4. planning/engineering-execution-design.md
5. planning/product-architecture.md

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).
