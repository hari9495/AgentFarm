# Dashboard Internal Operations Notes

This internal dashboard includes:

- Left sidebar navigation and top bar shell
- Tabs for Overview, Approvals, Observability, and Audit
- Compact equal-height metric cards row in Overview
- Runtime observability controls and telemetry panels
- Internal login policy visibility metrics in Observability
- Incident drilldown actions for heartbeat, state, and connector failures
- Deep-link copy actions for workspace/tab views and item-level contexts
- Internal-only session enforcement for dashboard API routes

## Environment Variables

Set these variables when running the dashboard with runtime observability enabled:

- AGENT_RUNTIME_BASE_URL
  - Runtime base URL used by dashboard runtime proxy routes.
  - Default: http://localhost:8080

- AGENT_RUNTIME_TOKEN
  - Optional bearer token forwarded from dashboard runtime proxy routes to runtime endpoints.
  - Only required if runtime endpoints enforce bearer auth.

- DASHBOARD_API_BASE_URL
  - Base URL for API gateway calls from server components and route handlers.
  - Default: http://localhost:3000

## Internal Login Policy (API Gateway)

The internal dashboard login flow uses:

- POST /auth/internal-login

Internal login only succeeds when the account matches policy rules configured on api-gateway.

- API_INTERNAL_LOGIN_ALLOWED_DOMAINS
  - CSV list of email domains allowed for internal login.
  - Example: agentfarm.com,corp.agentfarm.com

- API_INTERNAL_LOGIN_ADMIN_ROLES
  - CSV list of TenantUser.role values treated as internal-admin access.
  - Example: internal_admin,platform_admin,owner

Additional policy-related behavior now available in api-gateway:

- Startup warning when both policy lists are empty.
- Internal diagnostics endpoint: GET /v1/auth/internal-login-policy.

Policy behavior:

- Internal login is deny-by-default.
- Access is granted only if email domain is allowed OR role is in admin roles.
- Non-matching accounts receive 403 with error code internal_access_denied.

Example local configuration:

- API_INTERNAL_LOGIN_ALLOWED_DOMAINS=agentfarm.com
- API_INTERNAL_LOGIN_ADMIN_ROLES=internal_admin,owner

## Navigation and Tab Behavior

The internal dashboard supports tab navigation in two places:

- Sidebar links
- Top tab row

Supported tabs:

- overview
- approvals
- observability
- audit

Tab routing behavior:

- URL query params control dashboard context:
  - /?workspaceId=ws_primary_001&tab=overview
- Top bar workspace selector submits workspaceId and preserves current tab.
- Sidebar workspace selector also supports quick workspace switches and preserves current tab.
- Deep-link actions are available to copy current view and per-tab workspace links.
- Approval items support copy links using `approvalId` query context.
- Audit items support copy links using `correlationId` query context.
- Last selected workspace is persisted in local storage key:
  - agentfarm.dashboard.activeWorkspaceId
- Last selected tab is persisted per workspace in local storage key:
  - agentfarm.dashboard.activeTab.<workspaceId>
- If URL does not include tab, stored tab is restored automatically.
- If URL does not include workspaceId, stored workspace is restored automatically.
- Legacy key migration:
  - If workspace key is missing and legacy key agentfarm.dashboard.activeTab exists, the value is migrated to the active workspace key.

## Dashboard Commands

From the repository root:

- Start dashboard dev server
  - pnpm --filter @agentfarm/dashboard dev

- Run dashboard tests
  - pnpm --filter @agentfarm/dashboard test

- Run dashboard browser e2e for workspace/tab behavior
  - pnpm --filter @agentfarm/dashboard test:e2e:workspace-tabs

- Run dashboard typecheck
  - pnpm --filter @agentfarm/dashboard typecheck

- Run internal login policy smoke checks in api-gateway
  - pnpm --filter @agentfarm/api-gateway test:internal-login-policy

- Run root smoke checks (includes dashboard tab persistence smoke)
  - pnpm smoke:e2e

- Run dashboard CI lane locally (same checks as workflow)
  - pnpm --filter @agentfarm/dashboard typecheck
  - pnpm --filter @agentfarm/dashboard exec next build --no-lint
  - pnpm --filter @agentfarm/dashboard exec playwright install chromium
  - pnpm --filter @agentfarm/dashboard test:e2e:workspace-tabs http://127.0.0.1:3101

Regression coverage includes:

- Query-preservation contract tests for tab/workspace URL updates.
- Workspace-scoped tab storage and legacy migration tests.
- Browser e2e for per-workspace tab memory and sticky workspace restore.

## Runtime Proxy Routes in Dashboard

The dashboard proxies runtime observability calls through:

- /api/runtime/[botId]/logs
- /api/runtime/[botId]/state
- /api/runtime/[botId]/health
- /api/runtime/[botId]/kill

These routes require internal scope and return 403 when internal scope is not present.
