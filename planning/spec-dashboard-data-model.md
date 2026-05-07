# AgentFarm Spec: Dashboard Data Model

## Purpose
Define the data model and read views needed to power the customer dashboard for v1.

## Scope
1. Covers provisioning state, bot health, approvals, logs, connectors, and plan visibility.
2. Covers read models and API response shapes.
3. Does not define pixel-level UI design.

## Dashboard Goals
1. Show customers whether their bot is provisioning, healthy, degraded, or paused.
2. Show recent actions, approvals, and connector status.
3. Provide enough transparency for trust without exposing infrastructure internals directly.
4. Keep data scoped by tenant and workspace.

## Core Dashboard Entities
1. Tenant
2. Workspace
3. Bot
4. Provisioning Job
5. Connector State
6. Approval Request
7. Audit Event
8. Usage Summary

## Primary Read Models
### 1. tenant_dashboard_summary
Fields:
1. tenant_id
2. tenant_name
3. plan_name
4. tenant_status
5. total_workspaces
6. active_bots
7. degraded_workspaces
8. pending_approvals
9. created_at

### 2. workspace_bot_summary
Fields:
1. workspace_id
2. tenant_id
3. workspace_name
4. role_type
5. bot_id
6. bot_name
7. bot_status
8. workspace_status
9. runtime_tier
10. last_heartbeat_at
11. provisioning_status
12. latest_incident_level

### 3. provisioning_status_view
Fields:
1. job_id
2. workspace_id
3. bot_id
4. job_status
5. current_step
6. started_at
7. completed_at
8. error_code
9. error_message

### 4. connector_health_view
Fields:
1. connector_id
2. workspace_id
3. connector_type
4. status
5. permission_scope
6. last_healthcheck_at
7. last_error_code
8. last_error_message

### 5. approval_queue_view
Fields:
1. approval_id
2. workspace_id
3. bot_id
4. action_summary
5. risk_level
6. decision_status
7. requested_at
8. decided_at
9. decision_reason

### 6. audit_event_view
Fields:
1. event_id
2. tenant_id
3. workspace_id
4. bot_id
5. event_type
6. severity
7. summary
8. source_system
9. created_at
10. correlation_id

### 7. usage_summary_view
Fields:
1. tenant_id
2. workspace_id
3. billing_period
4. action_count
5. approval_count
6. connector_error_count
7. runtime_restart_count
8. estimated_cost

## Dashboard Sections
### Overview
Data source:
1. tenant_dashboard_summary
2. workspace_bot_summary
3. usage_summary_view

### Provisioning
Data source:
1. provisioning_status_view

### Connectors
Data source:
1. connector_health_view

### Approvals
Data source:
1. approval_queue_view

### Activity and Logs
Data source:
1. audit_event_view

## API Response Shapes
### GET /dashboard/summary
Returns:
1. tenant summary
2. list of workspace bot summaries
3. usage summary

### GET /workspaces/{workspaceId}/provisioning
Returns:
1. current provisioning job status
2. step history
3. failure hint if any

### GET /workspaces/{workspaceId}/connectors
Returns:
1. connector list
2. health state
3. permission and token status

### GET /workspaces/{workspaceId}/approvals
Returns:
1. pending approvals
2. recent decisions

### GET /workspaces/{workspaceId}/activity
Returns:
1. filtered audit events
2. cursor-based pagination

## Visibility Rules
1. Tenant admins can view all workspaces under their tenant.
2. Workspace-scoped users can view only assigned workspace data.
3. Dashboard must not expose raw VM IPs or direct infrastructure credentials.
4. Sensitive error details should be redacted into customer-safe summaries.

## Status Vocabulary
### Bot status
1. created
2. bootstrapping
3. connector_setup_required
4. active
5. paused
6. failed

Bot status rule:
1. provisioning progress must be shown through provisioning_status_view and workspace_status, not through a separate bot_status value.
2. Degraded customer visibility is represented by workspace_status or incident level, not by an extra bot_status.

### Connector status
1. connected
2. degraded
3. token_expired
4. permission_invalid
5. disconnected

### Approval status
1. pending
2. approved
3. rejected
4. expired

## Refresh and Delivery Model
1. Dashboard overview refreshes on polling or websocket updates.
2. Approvals should support near-real-time updates.
3. Activity feed should support cursor pagination and filtering by type and date.
4. Provisioning status should update step-by-step during initial bot creation.

## v1 Non-Goals
1. No raw terminal access from dashboard.
2. No direct VM management actions for customers.
3. No custom report builder in v1.
4. No complex multi-bot board in first launch.

## Success Condition
The dashboard gives the customer confidence that the bot is provisioned, healthy, connected, auditable, and under control without exposing internal infrastructure complexity.

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).


## Current Implementation Pointer (2026-05-07)
1. For the latest built-state summary and file map, see planning/build-snapshot-2026-05-07.md.
