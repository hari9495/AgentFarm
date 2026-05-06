# AgentFarm Spec: Independent Role Bot Operating Model

## Purpose
Capture the canonical product intent for AgentFarm role bots so future sessions and teams do not drift.

## Canonical Product Understanding
1. AgentFarm is a role-based AI workforce platform.
2. Customers purchase one or more role bots.
3. Each purchased role bot operates independently by default.
4. No cross-bot orchestration is required for MVP or default operations.
5. Governance, approvals, and auditability are mandatory per bot.

## Product Model Decision
1. Default operating mode: independent role bots.
2. Optional future mode: cross-bot handoff workflow (disabled by default).
3. Marketplace plugins and dynamic third-party skill installs: out of scope for MVP.

## LLM-First Brain Model (Canonical)
1. The LLM is the primary reasoning brain for every role bot.
2. Connectors, policies, approvals, and audit services are control and execution boundaries around the LLM brain.
3. Every role bot uses the same core brain architecture but with role-specific prompts, tool permissions, and risk policies.
4. The platform must treat prompt stack, model routing, and inference guardrails as first-class product configuration.

### Brain Runtime Contract
1. Input context:
- tenant context
- workspace context
- bot role profile
- allowed actions and integrations
- recent bot-scoped memory
- explicit user request
2. LLM decision output:
- reasoning result (non-persisted summary)
- proposed action plan
- structured tool calls
- confidence and risk hints
3. Control checks after LLM output:
- capability validation
- policy decision
- approval injection for medium/high risk
- connector execution
- evidence write

### Brain Safety Rules
1. LLM cannot execute tools directly without gateway validation.
2. LLM cannot expand permissions beyond role capability snapshot.
3. LLM outputs must be transformed into normalized action contracts before execution.
4. High-risk actions must never bypass approval even if LLM confidence is high.

### Brain Configuration by Role
1. role_system_prompt_version
2. role_tool_policy_version
3. role_risk_policy_version
4. default_model_profile (for example: quality-first, speed-first, cost-balanced)
5. fallback_model_profile

All five values are bot-scoped and versioned for auditability.

## LLM-Centric Implementation Plan
### Phase A: Brain Contract Foundation
1. Add bot-scoped brain config fields to shared types and bot read models.
2. Define normalized LLM decision envelope for runtime.
3. Persist model profile and prompt version in action and evidence records.

### Phase B: Role-Brain Alignment
1. Create role prompt packs for each role in role_catalog.
2. Bind role prompt packs to capability snapshots at provisioning time.
3. Enforce that runtime loads only approved prompt and policy versions.

### Phase C: Brain Governance and Observability
1. Track per-bot brain metrics:
- task success rate
- approval-required rate
- approval rejection rate
- hallucination/invalid-tool-call rate
- cost and latency per task
2. Add incident triggers for abnormal invalid-tool-call spikes.

### Phase D: Commercial Brain Profiles
1. Allow plan-based model profiles (for example starter vs enterprise quality mode).
2. Keep role capability enforcement unchanged across plans.
3. Expose transparent model profile and limits in dashboard.

## Scope and Non-Goals
### In Scope
1. Per-role bot templates.
2. Per-role connector and tool allowlists.
3. Tenant purchase entitlement checks.
4. Bot-scoped policy and approval enforcement.
5. Bot-scoped dashboard visibility.

### Out of Scope
1. Automatic collaboration between different role bots.
2. Shared multi-agent task graph across roles.
3. Public plugin ecosystem.
4. User-provided arbitrary code extension runtime.

## Role Catalog (Current Business Direction)
1. Recruiter
2. Developer
3. FullStack Developer
4. Tester
5. Business Analyst
6. Technical Writer
7. Content Writer
8. Sales Rep
9. Marketing Specialist
10. Corporate Assistant
11. Customer Support Executive (Voice/Chat/Email)
12. Project Manager/Product Owner/Scrum Master

## Independent Bot Operating Model
1. One purchased role SKU creates one or more bot instances according to plan limits.
2. Each bot instance has isolated runtime config, policy profile, connector bindings, and audit stream.
3. Runtime execution is role-aware and refuses actions outside the role capability profile.
4. Approval checks are performed per action and per bot.
5. Evidence records are immutable and scoped to tenant, workspace, and bot.

## Tenant Configuration Rules
1. Entitlement rule:
- A tenant can create or activate only roles included in purchased subscriptions.
2. Provisioning rule:
- Bot provisioning requires tenant entitlement plus plan capacity.
3. Role-capability rule:
- Each role maps to a capability profile that defines integrations, actions, and risk behavior.
4. Connector binding rule:
- A connector can be attached to a bot only if the role profile allows that connector.
5. Action enforcement rule:
- Execution path must check entitlement -> role capability -> connector health -> policy decision -> approval (if required).
6. Isolation rule:
- No action, memory, or execution state is shared across different bots unless future handoff mode is explicitly enabled.

## Role-Based Integration and Tool Visibility
1. Integrations shown in dashboard must be bot-scoped, not tenant-global by default.
2. For each selected bot, the UI must show:
- allowed integrations for that role
- current connector status for that bot
- allowed action list for that role
3. Unsupported connectors/actions for that role should be hidden instead of shown as disabled where possible.
4. If a tenant owns multiple roles, each role bot has its own integrations page and health telemetry.

## Reference Role Capability Matrix (Initial)
This matrix is the product baseline and can be refined per tenant or plan tier.

1. Developer
- Integrations: GitHub, Jira, Teams, Email
- Core actions: list_prs, create_pr, add_pr_comment, get_task, update_task_status, send_message, send_email

2. FullStack Developer
- Integrations: GitHub, Jira, Teams, Email
- Core actions: same as Developer + broader repo and release workflow actions

3. Tester
- Integrations: GitHub, Jira, Teams, Email
- Core actions: get_task, add_comment, send_message, send_email, test report posting actions

4. Business Analyst
- Integrations: Jira, Teams, Email
- Core actions: get_task, create_task, add_comment, send_message, send_email

5. Project Manager/Product Owner/Scrum Master
- Integrations: Jira, Teams, Email, GitHub (read-focused)
- Core actions: list_tasks, create_task, update_task_status, mention_user, send_message, send_email

6. Technical Writer
- Integrations: GitHub, Teams, Email
- Core actions: add_pr_comment, send_message, send_email, documentation workflow actions

7. Content Writer
- Integrations: Teams, Email
- Core actions: send_message, send_email, content drafting workflow actions

8. Sales Rep
- Integrations: Teams, Email
- Core actions: send_message, send_email, lead follow-up workflow actions

9. Marketing Specialist
- Integrations: Teams, Email
- Core actions: send_message, send_email, campaign workflow actions

10. Corporate Assistant
- Integrations: Teams, Email
- Core actions: send_message, send_email, meeting and admin workflow actions

11. Customer Support Executive (Voice/Chat/Email)
- Integrations: Teams, Email, ticketing via generic_rest
- Core actions: send_message, send_email, list_emails, read_email, read_thread, reply_email

12. Recruiter
- Integrations: Teams, Email, ATS via generic_rest
- Core actions: send_message, send_email, list_emails, read_email, reply_email

## Data Model Changes (Required)
### New Tables
1. role_catalog
- role_key (pk)
- display_name
- role_version
- description
- default_policy_pack_version
- active

2. role_capability_profiles
- id (pk)
- role_key (fk -> role_catalog.role_key)
- connector_tool
- allowed_actions (jsonb array)
- allowed_auth_methods (jsonb array)
- risk_overrides (jsonb)

3. tenant_role_subscriptions
- id (pk)
- tenant_id
- role_key
- purchased_quantity
- status (active, expired, suspended)
- active_from
- active_to

4. bot_capability_snapshots
- id (pk)
- bot_id
- role_key
- role_version
- allowed_connector_tools (jsonb array)
- allowed_actions (jsonb array)
- policy_pack_version
- frozen_at

### Changes to Existing Tables
1. bots
- ensure role_type is normalized to role_key in role_catalog

2. bot_connector_states
- add bot-scoped enforcement fields:
  - role_key
  - capability_profile_version

3. action and audit records
- ensure every action record contains tenant_id, workspace_id, bot_id, role_key, and correlation_id.

## API Contract Changes (Required)
### Catalog and Entitlement APIs
1. GET /v1/catalog/roles
- Returns active role catalog with versions and summaries.

2. GET /v1/catalog/roles/:roleKey/capabilities
- Returns allowed connectors/actions for role.

3. GET /v1/tenants/:tenantId/entitlements
- Returns purchased role subscriptions and limits.

### Bot Lifecycle APIs
1. POST /v1/tenants/:tenantId/bots
- Input includes role_key.
- Must reject if tenant has no entitlement.

2. GET /v1/tenants/:tenantId/bots
- Returns all tenant bot instances with role and runtime status.

3. GET /v1/bots/:botId
- Returns bot identity, role, capability snapshot, and health.

### Bot Capability and Integration APIs
1. GET /v1/bots/:botId/capabilities
- Returns frozen capability snapshot used by runtime.

2. GET /v1/bots/:botId/integrations/available
- Returns only integrations allowed by the bot role.

3. POST /v1/bots/:botId/connectors
- Creates a bot-specific connector binding.
- Must validate role compatibility.

4. GET /v1/bots/:botId/connectors
- Lists connector bindings and health for selected bot.

### Execution API
1. POST /v1/bots/:botId/actions/execute
- Required checks in order:
  1) tenant entitlement
  2) bot role capability
  3) connector binding and health
  4) policy decision
  5) approval decision when required

### Approval and Evidence APIs
1. GET /v1/bots/:botId/approvals
2. GET /v1/bots/:botId/activity
3. GET /v1/bots/:botId/evidence

All results are bot-scoped by default.

## Dashboard Behavior Changes (Required)
1. Add bot selector as primary context.
2. Connectors page becomes bot-scoped.
3. Show only role-allowed integration catalog for selected bot.
4. Show role-allowed action chips and policy notes.
5. Keep approvals, activity, and evidence scoped to selected bot.

## Repository Mapping (Where to Implement)
1. Role and capability contracts:
- packages/shared-types/src/index.ts
- packages/connector-contracts/src/index.ts

2. API enforcement and endpoint evolution:
- apps/api-gateway/src/routes/connector-actions.ts
- apps/api-gateway/src/main.ts

3. Runtime role-based execution checks:
- apps/agent-runtime/src/runtime-server.ts

4. Bot-scoped integrations UI:
- apps/website/app/connectors/page.tsx

5. Orchestrator scope update:
- apps/orchestrator/src/main.ts
- Keep as task router and lifecycle coordinator, not cross-role coordinator in default mode.

## Migration Plan (Developer-Only -> Role-Purchase Model)
### Phase 1: Compatibility Foundation
1. Introduce role_catalog and role capability tables.
2. Map existing Developer Agent to role_key developer.
3. Keep current APIs working with backward-compatible defaults.

### Phase 2: Bot-Scoped Capability Enforcement
1. Add bot capability snapshots.
2. Enforce role checks in connector and execution APIs.
3. Add rejection codes for unauthorized role actions.

### Phase 3: Dashboard Scope Shift
1. Introduce bot selector context in dashboard and connectors UI.
2. Move from tenant-global connector list to bot-scoped connector list.

### Phase 4: Commercial Entitlements
1. Add tenant role subscriptions and plan limits.
2. Enforce purchase checks during bot creation and activation.

### Phase 5: Role Expansion Waves
1. Wave 1: Developer, FullStack Developer, Tester, PM/PO/SM
2. Wave 2: Business Analyst, Technical Writer, Customer Support Executive
3. Wave 3: Recruiter, Sales Rep, Marketing Specialist, Content Writer, Corporate Assistant

## Session Continuity Rules
Use this file as the canonical source for future chats when discussing:
1. Independent bot model
2. Role entitlements
3. Role-based integration and action visibility
4. Data model changes for role purchases
5. API behavior for bot-scoped governance and audit

If another document conflicts, this file is the decision source until formally superseded.

## Change Log
1. 2026-04-25: Created canonical model for independent role bots, role-based UI/integration behavior, data model updates, API contracts, and migration plan.
2. 2026-04-25: Added canonical LLM-first brain model, runtime safety rules, role-brain config requirements, and phased LLM-centric implementation plan.

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).
