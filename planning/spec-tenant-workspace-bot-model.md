# AgentFarm Spec: Tenant, Workspace, and Bot Model

## Purpose
Finalize the relationship between tenants, workspaces, and bots for v1.

## Final Decision
Use a one-bot-per-workspace model.

### What this means
1. A tenant is the customer account boundary.
2. A workspace is the operational unit for one bot configuration and one runtime.
3. A bot belongs to exactly one workspace.
4. A tenant can own one or more workspaces based on plan.
5. At signup, v1 creates one default workspace and one default bot.

## Why this model is the right choice
1. Better than one-bot-per-tenant
- One-bot-per-tenant becomes too rigid once a customer wants a second role, second team, or second environment.
2. Better aligned with future scale
- Workspaces allow clean expansion to Developer Bot, QA Bot, or Manager Bot later without reworking tenant identity.
3. Cleaner isolation
- Workspace becomes the runtime, policy, and connector boundary.
4. Easier plan design
- Plans can define number of workspaces, runtime type, and connector limits.

## Core Definitions
### Tenant
Represents the customer organization.

Fields:
1. tenant_id
2. tenant_name
3. plan_id
4. billing_status
5. tenant_status
6. created_at

### Workspace
Represents an isolated operational environment under a tenant.

Fields:
1. workspace_id
2. tenant_id
3. workspace_name
4. role_type
5. runtime_tier
6. workspace_status
7. created_at

### Bot
Represents the actual runtime identity and behavior attached to a workspace.

Fields:
1. bot_id
2. workspace_id
3. bot_name
4. bot_status
5. policy_pack_version
6. connector_profile_id
7. created_at

## Approved v1 State Contract
### tenant_status
1. pending
- Tenant record exists, but provisioning has not started.
2. provisioning
- Signup is complete and the provisioning job has been accepted by the queue.
3. ready
- Default workspace runtime is healthy and customer can proceed with setup.
4. degraded
- Runtime or required tenant services are impaired but not fully unavailable.
5. suspended
- Tenant access or runtime activity is intentionally paused by policy or billing control.
6. terminated
- Tenant is closed and cannot resume runtime activity without re-provisioning.

### bot_status
1. created
- Bot record exists and is attached to a workspace, but runtime bootstrap has not started.
2. bootstrapping
- Runtime host or container startup is in progress for this bot.
3. connector_setup_required
- Runtime is reachable, but at least one required connector still needs activation.
4. active
- Runtime is healthy and able to execute approved actions.
5. paused
- Bot is intentionally stopped from executing work while records and history remain intact.
6. failed
- Bot runtime failed provisioning or runtime health checks and needs remediation.

### workspace_status
1. pending
2. provisioning
3. ready
4. degraded
5. suspended
6. failed

### State Rules
1. The approved tenant_status values are: pending, provisioning, ready, degraded, suspended, terminated.
2. The approved bot_status values are: created, bootstrapping, connector_setup_required, active, paused, failed.
3. The dashboard must not invent extra bot statuses such as provisioning or degraded.
4. Provisioning progress is shown through provisioning job state and workspace_status, not through a new bot_status.
5. Any future state change requires an ADR update and same-day contract update in all references.

## Relationship Rules
1. tenant 1 -> many workspaces
2. workspace 1 -> 1 bot in v1
3. bot 1 -> 1 isolated runtime
4. connector configuration is scoped to workspace
5. policies and approvals are scoped to workspace
6. audit and evidence records include tenant_id, workspace_id, and bot_id

## v1 Defaults
1. Signup creates:
- 1 tenant
- 1 default workspace
- 1 default bot
2. Default workspace name:
- Primary Workspace
3. Default bot role:
- Developer Agent
4. Default runtime tier:
- Dedicated VM isolation for approved plans

## Plan Model Implications
### Starter Plan
1. 1 workspace
2. 1 bot
3. Fixed connector limits
4. Shared future runtime tier when available

### Growth Plan
1. Multiple workspaces
2. One bot per workspace
3. Expanded connector limits
4. Dedicated or reserved runtime option

### Enterprise Plan
1. Multiple workspaces
2. Dedicated runtime isolation per workspace
3. Custom policies and approvals
4. Stronger audit and access controls

## Lifecycle Behavior
### On Signup
1. Create tenant
2. Create default workspace
3. Create default bot
4. Enqueue runtime provisioning for that workspace

### Signup-to-Provisioning Transition Contract
Event name:
1. provisioning.requested

Produced when:
1. POST /signup/complete finishes tenant, workspace, and bot record creation successfully.

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
10. trigger_source

Status updates at handoff:
1. tenant_status changes from pending to provisioning.
2. workspace_status changes from pending to provisioning.
3. bot_status remains created until runtime bootstrap starts.
4. provisioning_jobs record is inserted with job state queued.

Dashboard visibility requirement:
1. Tenant dashboard shows tenant_status = provisioning immediately after queue acceptance.
2. Workspace provisioning view shows job_status = queued immediately after queue acceptance.
3. Bot summary continues to show bot_status = created until bootstrap begins.

### On Add Workspace
1. Create new workspace under existing tenant
2. Create bot for selected role
3. Provision new isolated runtime if plan allows

### On Suspend Workspace
1. Pause runtime
2. Disable connector actions
3. Preserve audit and evidence history

## API Implications
1. GET /tenants/{tenantId}
2. GET /tenants/{tenantId}/workspaces
3. POST /tenants/{tenantId}/workspaces
4. GET /workspaces/{workspaceId}
5. GET /workspaces/{workspaceId}/bot
6. GET /workspaces/{workspaceId}/connectors
7. GET /workspaces/{workspaceId}/approvals

## Data Ownership Rules
1. Tenant-level data
- Billing, subscription, account admins
2. Workspace-level data
- Role config, connector state, runtime status, approvals, usage
3. Bot-level data
- Runtime identity, health, action state, task execution state

## Decision Outcome
This spec closes Open Decision #1.

Final v1 rule:
A customer signs up as a tenant, receives one default workspace, and that workspace gets one bot. Future scale happens by adding more workspaces, not by overloading the tenant itself.

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).
