# AgentFarm Engineering Execution Design

## Purpose
Translate the approved product architecture into a build-ready engineering design for v1.

## Scope
1. Covers the shared control plane and isolated execution plane.
2. Covers tenant lifecycle from signup to live bot operations.
3. Covers runtime provisioning, Docker isolation, connector auth, logs, approvals, and observability.
4. Does not include implementation code or final IaC templates yet.

## Implementation Snapshot Link (2026-05-07)
1. Latest implementation closure for cross-service behavior alignment is documented in planning/build-snapshot-2026-05-07.md.
2. This includes memory model evolution, proactive signal expansion, approval batching, tester policy hardening, quality feedback routing, and handoff protocol normalization.

## MVP Scope Freeze (Original Zone)
1. One role only: Developer Agent.
2. One integration set only: Jira, Microsoft Teams, GitHub, and company email.
3. Core promise only: role fidelity, approval-controlled autonomy, and audit evidence.
4. Core architecture only: shared control plane plus isolated runtime.
5. Any feature outside this scope is post-MVP and cannot enter active build backlog without explicit architecture gate approval.

## Design Goals
1. Ship a secure v1 that can onboard customers without manual infrastructure work.
2. Preserve strict human approval for risky actions.
3. Maintain full auditability for bot actions, approvals, and provisioning events.
4. Support premium-grade tenant isolation from day one.
5. Keep the platform evolvable from VM isolation to future container-native scale.

## System Boundaries
1. Shared control plane
2. Isolated execution plane
3. External systems
- Jira
- Microsoft Teams
- GitHub
- Company email provider
- Azure control plane and Key Vault

## Engineering Workstreams
1. Tenant lifecycle and account provisioning
2. Azure runtime provisioning and VM bootstrap
3. Docker runtime and bot process design
4. Connector auth and integration contracts
5. Dashboard APIs and log model
6. Approval and policy enforcement
7. Observability, incidents, and operational safety

## 1. Tenant Lifecycle Design
### Signup Flow
1. User signs up on website.
2. Auth service creates user identity.
3. Tenant service creates tenant, workspace, plan, and billing state.
4. Bot service creates bot record based on selected role and plan.
5. Provisioning workflow is scheduled asynchronously.
6. Dashboard shows provisioning state immediately.

### Tenant State Model
1. tenant_status
- pending
- provisioning
- ready
- degraded
- suspended
- terminated
2. bot_status
- created
- bootstrapping
- connector_setup_required
- active
- paused
- failed

### State Semantics
1. tenant_status = pending means tenant records exist, but provisioning handoff has not yet been accepted.
2. tenant_status = provisioning begins only after the provisioning job is accepted and recorded.
3. bot_status = created remains valid from record creation until runtime bootstrap starts.
4. bot_status = bootstrapping begins when VM bootstrap or container startup starts.
5. Provisioning progress must be represented by provisioning job state and workspace runtime state, not by introducing a new bot status.

### Signup-to-Provisioning Transition Contract
Event name:
1. provisioning.requested

Producer:
1. POST /signup/complete after tenant, default workspace, and default bot creation succeed.

Required payload:
1. tenant_id
2. workspace_id
3. bot_id
4. plan_id
5. runtime_tier
6. role_type
7. correlation_id
8. requested_at
9. requested_by
10. trigger_source = signup_complete

Acceptance rules:
1. Provisioning queue must acknowledge the job before tenant_status moves to provisioning.
2. On accepted handoff, workspace_status becomes provisioning and bot_status stays created.
3. provisioning_jobs must persist the same tenant_id, workspace_id, bot_id, and correlation_id values as the event payload.
4. Dashboard provisioning visibility must be available immediately after the job is queued.

### Required Tables
1. tenants
2. tenant_users
3. plans
4. bots
5. bot_roles
6. provisioning_jobs
7. tenant_runtime_resources
8. bot_connector_states

## 2. Azure Runtime Provisioning Design
### Provisioning Sequence
1. Provisioning service receives job with tenant_id and plan.
2. Azure adapter creates per-tenant resource group.
3. Azure adapter creates managed identity.
4. Azure adapter provisions VM, NIC, disk, NSG, and monitoring agent.
5. VM bootstrap installs Docker and runtime dependencies.
6. VM authenticates to container registry using managed identity.
7. Bot image is pulled and started with tenant-specific configuration.
8. Health check confirms runtime availability.
9. Control plane updates tenant and bot status to ready.

### Provisioning Job States
Canonical source: planning/spec-azure-provisioning-workflow.md — frozen as of 2026-04-21.
1. queued — job accepted, not yet started
2. validating — entitlement and quota checks running
3. creating_resources — Azure resource group, identity, VM, NIC, NSG, and disk creation in progress
4. bootstrapping_vm — Docker and runtime dependencies installing on VM
5. starting_container — bot image pulled, container starting
6. registering_runtime — bot runtime calling control plane registration endpoint
7. healthchecking — liveness and readiness checks running
8. completed — runtime healthy, bot marked active
9. failed — terminal failure; failure_reason and remediation_hint persisted
10. cleanup_pending — cleanup workflow triggered for failed or deprovisioned job
11. cleaned_up — all partial Azure resources deleted and logged

Note: Azure sub-steps (resource_group_created, identity_created, vm_created) are internal adapter implementation details, not job state machine states. They are not exposed via the API or dashboard.

### Workspace Runtime States
Canonical source: planning/spec-azure-provisioning-workflow.md — frozen as of 2026-04-21.
1. pending — workspace record exists, provisioning not yet started
2. provisioning — provisioning job accepted and running
3. ready — runtime healthy and accepting tasks
4. degraded — runtime reachable but dependency health failing
5. failed — runtime unrecoverable; requires reprovisioning
6. suspended — tenant or admin suspended the workspace

### Provisioning Failure Policy
1. Retry transient Azure API failures with exponential backoff.
2. Mark job failed only after retry threshold is reached.
3. Persist failure_reason and remediation_hint in provisioning_jobs record.
4. Keep partial resources tagged cleanup_policy=inspect for non-destructive failures.
5. Auto-cleanup resources for known bootstrap failures when safe.
6. Record cleanup result in provisioning_jobs.cleanup_result.

### Azure Resource Naming Pattern
1. Resource group: rg-af-tenant-{tenantShortId}
2. VM: vm-af-bot-{tenantShortId}
3. Managed identity: id-af-bot-{tenantShortId}
4. NSG: nsg-af-bot-{tenantShortId}

## 3. Docker Runtime Design
### Runtime Principles
1. Bot process runs inside Docker only.
2. Runtime container must not require privileged mode.
3. Secrets are injected at runtime, not baked into the image.
4. Runtime logs stream to control plane and local monitoring.

### Container Responsibilities
1. Run OpenClaw-based bot runtime.
2. Execute role-specific task logic.
3. Enforce policy hooks before action execution.
4. Route medium/high-risk actions for approval.
5. Emit action, approval, and health events.

### Host Responsibilities
1. Run Docker daemon.
2. Restrict inbound access.
3. Provide managed identity and monitoring agent.
4. Support secure image pull and restart policy.

### Runtime Config Inputs
Canonical source: planning/spec-docker-runtime-contract.md — frozen as of 2026-04-21.
1. tenant_id
2. workspace_id
3. bot_id
4. role_profile
5. policy_pack_version
6. connector_config_refs
7. approval_service_endpoint
8. evidence_api_endpoint
9. observability_endpoints
10. runtime_contract_version

### Runtime State Machine
Canonical source: planning/spec-docker-runtime-contract.md — frozen as of 2026-04-21.
1. created — container record exists, not yet started
2. starting — startup sequence running
3. ready — startup complete, no tasks yet
4. active — processing tasks
5. degraded — running but dependency health failing; no new task intake
6. paused — kill switch or admin pause; existing loops suspended
7. stopping — graceful shutdown in progress
8. stopped — container stopped cleanly
9. failed — non-recoverable failure; incident tag triggered

### Startup Contract
1. Pre-start: validate required env vars, managed identity token, connector secret refs, policy pack fetch.
2. Startup sequence events: runtime.init_started → runtime.config_loaded → runtime.policy_loaded → runtime.connector_bindings_loaded → runtime.worker_loops_started → runtime.ready.
3. Startup failure: emit runtime.init_failed, exit non-zero, escalate to failed after retry threshold.

### Restart Contract
1. Always-restart policy for process crashes.
2. Bounded backoff between restart attempts.
3. max_restart_attempts_window: 5 within 15 minutes.
4. Escalate to failed state after threshold breach; trigger incident tag.

### Kill Switch Contract
1. Kill switch source of truth is control plane.
2. Runtime polls or receives signed kill-switch event.
3. On trigger: stop action execution loops, reject new medium/high-risk actions, emit runtime.killswitch_engaged.
4. Resume requires authorized control-plane signal only.

### Security Constraints
1. No privileged container mode.
2. No hardcoded secrets in image or compose file.
3. Secrets injected at runtime via secure references only.
4. Only approved ports exposed.

## 4. Connector Authentication and Integration Design
Frozen 2026-04-21 — canonical source: planning/spec-connector-auth-flow.md.

### Auth Principles
1. Least privilege scopes only.
2. Tokens and secrets are never persisted in plaintext application logs.
3. Connector activation is incomplete until scope validation succeeds.
4. Revocation disables connector actions immediately.

### Connector Auth State Machine
Frozen 2026-04-21 — 11 states.
1. not_configured — connector record exists, no activation attempted
2. auth_initiated — OAuth flow started, awaiting redirect
3. consent_pending — user redirected to provider; awaiting callback
4. token_received — callback received, exchange in progress
5. validation_in_progress — scope validation running
6. connected — scopes valid, connector healthy and active
7. degraded — partial scopes; feature-gated execution only
8. token_expired — access token expired; refresh or re-consent required
9. permission_invalid — insufficient scopes; admin remediation required
10. revoked — admin or provider revoked; full reactivation required
11. disconnected — explicitly disconnected by tenant admin

### Connector Activation Flow (OAuth)
1. User selects connector in dashboard.
2. Control plane creates auth session and nonce; status → auth_initiated.
3. User redirected to provider consent page; status → consent_pending.
4. Provider returns auth code with state parameter.
5. Control plane validates state and nonce match.
6. Control plane exchanges auth code for access token (and refresh token where available); status → token_received.
7. Token reference persisted in secure store; plaintext token never persisted in DB.
8. Scope validation runs against required capability matrix; status → validation_in_progress.
9. If scopes sufficient: status → connected.
10. If scopes partial: status → degraded (feature-gated).
11. If scopes insufficient: status → permission_invalid; activation blocked.

### Secure Storage Contract
1. Store provider credentials in Key Vault or equivalent secure secret store.
2. Persist only secret reference IDs in connector database records; never the raw token.
3. Rotate secrets or references per policy schedule.
4. Audit every create, rotate, and revoke action.

### Token Lifecycle Management
Refresh:
1. Refresh before expiration threshold using stored refresh token.
2. Use bounded exponential backoff on transient refresh errors.
3. On repeated refresh failure: status → token_expired.

Expiration:
1. Detect expired token on proactive checks or runtime call failure.
2. Status → token_expired; connector actions blocked until refresh or re-consent.

Revocation:
1. Tenant admin or provider-side revoke: status → revoked immediately.
2. Connector actions blocked; full reactivation required to return to connected.

### Permission Scope Model
Required fields per connector:
1. connector_type
2. required_scopes
3. optional_scopes
4. granted_scopes
5. effective_scope_status (full | partial | insufficient)

Scope outcome mapping:
- full → connected (if health is good)
- partial → degraded (feature-gated execution)
- insufficient → permission_invalid

### Error Model
Standard error classes:
1. oauth_state_mismatch
2. oauth_code_exchange_failed
3. token_refresh_failed
4. token_expired
5. insufficient_scope
6. provider_rate_limited
7. provider_unavailable
8. secret_store_unavailable

Error handling rules:
1. Every auth error writes a connector_event with error_class and correlation_id.
2. Retry only transient classes (provider_rate_limited, provider_unavailable, token_refresh_failed).
3. Non-transient classes require user or admin remediation.

### Runtime Connector Execution Contract
1. Runtime executes connector actions only in connected or degraded (approved) states.
2. Runtime blocks connector operations in token_expired, permission_invalid, revoked, or disconnected states.
3. Runtime includes connector state in action failure evidence.

### Connector Auth APIs
Frozen 2026-04-21.
1. POST /bots/{botId}/connectors/{connectorType}/activate — start OAuth activation
2. POST /connectors/auth/callback/{connectorType} — process provider callback and token exchange
3. POST /bots/{botId}/connectors/{connectorType}/validate — validate effective scopes and connection health
4. POST /bots/{botId}/connectors/{connectorType}/refresh — trigger refresh flow
5. POST /bots/{botId}/connectors/{connectorType}/revoke — revoke connector and disable actions
6. GET /bots/{botId}/connectors — return connector state and last auth health status

### Connector Contract Model
1. Common connector fields
- connector_id
- tenant_id
- workspace_id
- connector_type (jira | teams | github | company_email)
- auth_mode
- status (full auth state machine above)
- permission_scope
- last_healthcheck_at

### Normalized Connector Action Contract
Frozen 2026-04-21 — canonical source: product-architecture.md Step 6 (all connector contracts approved).

Contract Version: v1.0 (semver format; must increment on breaking API changes).

Six canonical normalized actions:
1. read_task — fetch task/issue/message details
2. create_comment — add comment to task/issue
3. update_status — change task/issue state
4. send_message — send message to channel/user
5. create_pr_comment — add comment to pull request
6. send_email — send email

Common action request fields:
1. action_id (UUID)
2. action_type (one of six above)
3. connector_type (jira | teams | github | company_email)
4. correlation_id (links action to approval record or action record)
5. request_body (connector-specific input, schema versioned with contract)

Common action response fields:
1. action_id
2. result_status (success | failed | timeout)
3. provider_response_code (http code from provider or connector-specific code)
4. result_summary (human-readable description)
5. error_code (if result_status = failed; e.g., rate_limit, permission_denied, invalid_format)
6. error_message
7. remediation_hint (actionable recovery guidance for operator)
8. completed_at (ISO 8601 timestamp)

Connector action support matrix (frozen):
- Jira: read_task, create_comment, update_status
- Microsoft Teams: send_message (read_message implied)
- GitHub: read_task (pull requests), create_pr_comment
- Company Email: send_email

Error handling rules:
1. All errors logged with error_code, correlation_id, and result_summary.
2. Transient error classes: rate_limit, timeout, provider_unavailable.
3. Non-transient error classes: permission_denied, invalid_format, unsupported_action.
4. Retry behavior: transient errors trigger bounded exponential backoff (max 3 retries).
5. Non-transient errors fail immediately with remediation_hint.

Contract versioning rule:
1. Action contract version is recorded immutably in every action record.
2. Breaking changes (new required field, removed field, action behavior change) require contract_version increment.
3. Old version actions continue to execute for 30 days after new version deployment.
4. After 30 days, old version actions are rejected with upgrade_required error.

### v1 Connector Order
1. Jira
2. Microsoft Teams
3. GitHub
4. Company email

### Connector Health Monitoring Signals
1. connector_auth_success_rate
2. token_refresh_success_rate
3. token_expiry_incidents
4. permission_validation_failures
5. mean_time_to_recover_connector

## 5. Dashboard and API Design
### Dashboard Capabilities
1. Provisioning state visibility
2. Bot status and health
3. Approval queue and decisions
4. Action log and audit filters
5. Connector setup and health
6. Plan and usage visibility

### Core APIs
1. POST /signup/complete
- Finalize tenant creation and enqueue provisioning.
- Response must include tenant_id, workspace_id, bot_id, tenant_status, bot_status, provisioning_job_id, and provisioning_job_status.
2. GET /tenants/{tenantId}/status
- Return tenant and bot lifecycle status.
3. GET /bots/{botId}/logs
- Return action and runtime logs.
4. GET /bots/{botId}/connectors
- Return connector status.
5. POST /bots/{botId}/connectors/{connectorType}/activate
- Start connector activation.
6. GET /bots/{botId}/approvals
- Return pending and completed approvals.
7. POST /approvals/{approvalId}/decision
- Approve or reject a risky action.

### Dashboard Read Models
1. bot_summary_view
2. provisioning_status_view
3. approval_queue_view
4. connector_health_view
5. audit_event_view

## 6. Approval and Policy Enforcement Design
Frozen 2026-04-21 — consistent with ADR-002, product-architecture.md Step 5, and mvp/mvp-scope-and-gates.md.

### Risk Classification Criteria
Low risk — auto-execute with full logging. Examples:
1. Read-only queries (Jira issue fetch, GitHub file read, Teams message read)
2. Non-destructive status updates with no external side-effect
3. Draft creation with no publish/send action

Medium risk — mandatory human approval before execution. Examples:
1. Creating or updating a Jira ticket or GitHub PR
2. Sending a message on behalf of the bot in Teams
3. Committing code changes to a branch
4. Updating task status in a shared workspace

High risk — mandatory human approval with escalation timeout. Examples:
1. Merging a pull request
2. Deploying or triggering a CI/CD pipeline
3. Sending email to external recipients
4. Deleting or archiving any resource
5. Any action classified as potentially irreversible

### Risk Evaluation Flow
1. Runtime proposes action.
2. Policy engine evaluates action context against versioned policy pack.
3. Action classified as low, medium, or high risk.
4. Low risk: execute directly, log action record immediately.
5. Medium risk: create approval request, block execution, notify dashboard and Teams deep link.
6. High risk: create approval request, block execution, notify dashboard and Teams deep link, start escalation timeout.
7. Runtime resumes only after receiving signed approval decision.

### Approval Routing Contract
Frozen 2026-04-21.

Medium risk path:
1. Runtime emits approval_requested event.
2. Approval service creates approval record with status = pending.
3. Dashboard shows pending item in approval queue view.
4. Teams notification sent with action summary and dashboard deep link.
5. Approver submits decision via dashboard (approved or rejected).
6. Approval service signs and returns decision to runtime.
7. Runtime executes (if approved) or discards and logs (if rejected).

High risk path — same as medium risk plus:
1. Escalation timer starts at approval request creation.
2. escalation_timeout_seconds: 3600 (1 hour); configurable per plan tier.
3. On timeout: escalate to secondary approver if configured, else auto-reject and log escalation_event.
4. Timeout outcome is logged as decision = timeout_rejected with reason.

### Approval Decision States
1. pending — waiting for approver
2. approved — approver confirmed; runtime may execute
3. rejected — approver denied; runtime discards action and logs reason
4. timeout_rejected — escalation timer expired; runtime discards action

### Approval Record Fields
Frozen 2026-04-21 — canonical source: planning/engineering-execution-design.md Section 6. Supports full decision traceability and P95 latency reporting per product-architecture.md Step 8.
1. approval_id (unique identifier)
2. tenant_id (required for multi-tenant isolation)
3. workspace_id (required for dashboard scope filtering; per spec-dashboard-data-model.md approval_queue_view)
4. bot_id (which agent requested approval)
5. action_id (links to the action record)
6. risk_level (low | medium | high)
7. action_summary (human-readable description of the proposed action)
8. requested_by (bot identity)
9. approver_id (user who decided, null if timeout)
10. decision (pending | approved | rejected | timeout_rejected)
11. decision_reason (free text, mandatory for rejected and timeout_rejected)
12. decision_latency_seconds (decided_at minus created_at; null if pending; supports P95 latency SLA tracking, target <300 sec for medium-risk)
13. policy_pack_version (versioned policy in effect at request time; for traceability)
14. escalation_timeout_seconds (how many seconds before high-risk escalates; default 3600)
15. escalated_at (timestamp of escalation to secondary approver, null if not escalated)
16. created_at (request timestamp; immutable)
17. decided_at (approval decision timestamp; null if pending; immutable after set)

### Approval Record Immutability Rules
Frozen 2026-04-21 — canonical source: planning/engineering-execution-design.md Section 7 (Evidence Pipeline).
1. All approval record fields are append-only; no updates after created_at.
2. Once decided_at is set, no field modifications are permitted.
3. Deletion of approval records is prohibited; compliance requirement.
4. These rules are enforced at database layer via triggers or application layer guards.
5. Violations are logged as security_events with correlation_id.

### Policy Source of Truth
1. OPA policy bundles or equivalent policy service.
2. Versioned policy packs per plan and role.
3. Policy changes logged in ADR and audit trail.
4. Policy version must be recorded in every action and approval record for traceability.

## 7. Logging, Evidence, and Observability Design
Frozen 2026-04-21 — consistent with ADR-004, product-architecture.md Step 4, and research/competitive-gold-standards.md.

### Event Categories
1. provisioning_event
2. bot_runtime_event
3. connector_event
4. approval_event
5. security_event
6. audit_event

### Minimum Action Record Fields
Frozen 2026-04-21.
1. action_id
2. tenant_id
3. workspace_id
4. bot_id
5. action_type
6. risk_level (low | medium | high)
7. policy_pack_version (version of policy in effect at execution time)
8. input_summary (sanitized description of what the action received)
9. output_summary (sanitized description of what the action produced)
10. status (pending | executing | completed | rejected | failed)
11. approval_id (null for low-risk actions)
12. connector_type (which connector the action used, if any)
13. correlation_id (links to provisioning job and evidence chain)
14. created_at
15. completed_at

### Minimum Audit Event Record Fields
Frozen 2026-04-21 — canonical source: planning/spec-dashboard-data-model.md audit_event_view.
1. event_id
2. tenant_id
3. workspace_id
4. bot_id
5. event_type (provisioning_event | bot_runtime_event | connector_event | approval_event | security_event | audit_event)
6. severity (info | warn | error | critical)
7. summary (human-readable, redacted for customer safety)
8. source_system (runtime | connector | approval-service | provisioning-service | control-plane)
9. correlation_id
10. created_at

### Minimum Approval Evidence Fields
Frozen 2026-04-21 — see Section 6 Approval Record Fields for full list.
Required for gate-audit evidence:
1. approval_id
2. risk_level
3. decision
4. decision_latency_seconds
5. policy_pack_version
6. created_at
7. decided_at

### Retention and Immutability Policy
Frozen 2026-04-21 — canonical source: product-architecture.md Step 4.
1. Active audit records retained for 12 months.
2. Archived records retained for 24 months total.
3. Evidence records are append-only; no update or delete is permitted after creation.
4. Compliance with this policy is a mandatory release gate requirement.

### Evidence Freshness Target
Frozen 2026-04-21 — canonical source: ADR-004.
1. Evidence for active release gates must be dated within 90 days.
2. Stale evidence (older than 90 days) invalidates the corresponding gate score.
3. Quarterly refresh of evidence is mandatory before each gate audit.

### Evidence Pipeline
1. Runtime emits structured events with required fields above.
2. Events are ingested by evidence service with deduplication on correlation_id.
3. Evidence service stores normalized, append-only audit records.
4. Reporting jobs compute gate metrics and dashboard summaries.
5. Evidence completeness rate is a v1 monitoring signal (target: 100% for active gates).

### v1 Monitoring Signals
1. Provisioning success rate
2. Bot boot time
3. Approval latency (P95 target: under 300 seconds for medium-risk)
4. Audit completeness rate (target: 100% for active release gates)
5. Connector failure rate
6. Runtime restart rate

## 8. Security and Operations Design
### Azure Security Controls
1. Managed identity for Azure resource access.
2. Key Vault for secret retrieval.
3. Restricted NSG inbound rules.
4. Private or limited network access for runtime management.
5. VM and container logging enabled by default.

### Platform Safety Controls
1. Global kill switch per bot.
2. Tenant pause and suspend controls.
3. Runtime health watchdog.
4. Failed connector quarantine behavior.
5. Incident tagging for policy or runtime failures.

### Operational Runbooks Needed
1. Provisioning failure runbook
2. Connector token expiry runbook
3. Runtime crash recovery runbook
4. Approval service degradation runbook
5. Tenant suspension and incident response runbook

## 9. Delivery Sequence
### Phase A: Control Plane Foundation
1. Tenant, plan, bot, and provisioning job models.
2. Signup completion flow.
3. Dashboard status APIs.

### Phase B: Provisioning and Runtime
1. Azure provisioning adapter.
2. VM bootstrap and Docker startup.
3. Runtime health registration.

### Phase C: Connector and Approval Path
1. Jira and Microsoft Teams activation.
2. Approval queue and decision APIs.
3. Risk policy enforcement hooks.

### Phase D: Audit and Hardening
1. Evidence ingestion and reporting.
2. Security controls and secret lifecycle.
3. Staging validation and signoff checks.

## 10. Open Decisions
1. None for MVP-critical architecture. Remaining items are tracked as post-MVP optimization choices.

## 10A. Resolved Decisions
1. Tenant and workspace model
- Finalized in planning/spec-tenant-workspace-bot-model.md.
- v1 uses one bot per workspace, with one default workspace created at signup.
2. Dedicated VM isolation by plan
- For MVP execution, all active customer workspaces run on dedicated VM isolation to reduce architecture variance during gate validation.
- Plan-based mixed runtime tiers are deferred until post-MVP.
3. Company email provider scope
- MVP starts with Microsoft Graph only.
- Gmail support is deferred until post-MVP after connector quality baseline is stable.
4. Microsoft Teams approval scope
- MVP approval system of record is dashboard-first.
- Teams sends approval notifications and deep links; direct approval actions in Teams are post-MVP.
5. Future non-premium runtime target
- ACA is the first target for post-MVP non-premium runtime due to lower operational overhead than AKS for initial scale transition.

## 11. Immediate Next Design Docs
1. Tenant and workspace model spec
- planning/spec-tenant-workspace-bot-model.md
2. Azure provisioning workflow spec
- planning/spec-azure-provisioning-workflow.md
3. Dashboard data model spec
- planning/spec-dashboard-data-model.md
4. Product structure and model architecture spec
- planning/spec-product-structure-model-architecture.md
5. Docker runtime contract spec
- planning/spec-docker-runtime-contract.md
6. Connector auth flow spec
- planning/spec-connector-auth-flow.md
7. Incident and runbook pack
- planning/spec-incident-runbook-pack.md

## 12. Post-MVP Parking Lot (Do Not Pull Into MVP)
### Feasibility
1. This is possible to add in AgentFarm.
2. It should be added as a phased capability, not as a v1 MVP requirement.

### Product Position
1. Agent joins meetings as an AI representative for a workspace bot role.
2. Agent can deliver standup updates, answer scoped status questions, and capture follow-up tasks.
3. Agent can support HR interview workflows as an AI interviewer assistant with human oversight.

### Non-Negotiable Safety and Trust Rules
1. AI disclosure is mandatory in meeting name, intro message, and responses.
2. The agent must never claim to be a human employee.
3. Recording, transcription, and retention must follow explicit consent and tenant policy.
4. High-impact HR decisions cannot be fully autonomous; human reviewer is required.
5. Every meeting response and interview decision signal must be logged as audit evidence.

### Capability Scope by Phase
1. Phase 2: Meeting listener and standup speaker
- Join Teams meeting, transcribe, summarize, and present workspace bot status updates.
- Answer only evidence-backed questions about assigned work items.
2. Phase 3: Interactive Q and A mode
- Multi-turn voice interaction for project status and blocker resolution.
- Approval policy required for sensitive responses.
3. Phase 4: HR interview assistant mode
- Ask structured, role-specific interview questions.
- Score rubric support only; final recommendation requires human confirmation.

### Technical Building Blocks
1. Microsoft Teams integration for meeting participation and chat events.
2. Speech-to-text for real-time transcription.
3. Text generation with role memory and evidence-grounded retrieval.
4. Text-to-speech for spoken responses.
5. Policy layer for response constraints and escalation.
6. Full observability for transcript, decisions, and response traceability.

### Parked Decision Record
1. Should meeting participation launch as listen-only first or listen-plus-speak first?

### Parked Design Docs
1. Teams meeting agent spec
- planning/spec-meeting-agent-teams.md
2. Teams Graph auth and consent spec
- planning/spec-teams-graph-auth-and-consent.md

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).
