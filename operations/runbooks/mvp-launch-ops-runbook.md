# MVP Launch Operations Runbook (Tasks 7.1, 8.2, 8.3)

## Purpose
Operational execution guide to close final MVP launch blockers after engineering completion.

## Engineering Completion Status (as of 2026-05-01)

All 24 local Sprint 1 tasks are **completed and validated**. The three tasks below remain blocked on external Azure and GitHub prerequisites:

| Task | Status | Blocker |
|------|--------|---------|
| 7.1 — Website SWA deployment | ⏳ Blocked | GitHub secret `AZURE_STATIC_WEB_APPS_API_TOKEN_WEBSITE` not set |
| 8.2 — Production deployment | ⏳ Blocked | Azure extension context not signed in |
| 8.3 — Security/load/evidence gates | ⏳ Blocked | Requires deployed environment (8.2 first) |

### Pre-Launch Engineering Evidence
- API Gateway: 209 tests passing, typecheck clean
- Agent Runtime: 118 tests passing, typecheck clean
- Website: 28+ tests across 9 suites, typecheck clean
- Quality gate: 33 checks — 32 PASS, 1 SKIP (DB snapshot, needs Docker)
- Approval enforcement + kill-switch: implemented and tested in `services/approval-service`
- Audit and evidence dashboard: implemented and tested in `apps/website`
- 18 connector plugin registry: implemented in `packages/connector-contracts` (13 named + 5 generic REST)

## Current Blockers
1. Azure extension context in this workspace is signed out.
2. GitHub repository secret `AZURE_STATIC_WEB_APPS_API_TOKEN_WEBSITE` is not confirmed.
3. Production deployment evidence for infrastructure and security/load gates is not yet recorded.

## Task 7.1: Website SWA Production Rollout
### Preconditions
1. Confirm `AZURE_STATIC_WEB_APPS_API_TOKEN_WEBSITE` exists in repository secrets.
2. Confirm workflow file is present: `.github/workflows/website-swa.yml`.
3. Confirm runbook baseline: `operations/runbooks/website-swa-runbook.md`.

### Execution
1. Push or merge target commit to `main` (paths affecting `apps/website/**` or workflow).
2. In GitHub Actions, verify job `Website SWA Deploy` completed with success.
3. Validate production endpoints return HTTP 200:
- `/`
- `/signup`
- `/target`
4. Complete custom domain and TLS checks from the website SWA runbook.

### Evidence to Record
1. Workflow run URL and run number.
2. Production SWA hostname and timestamped HTTP checks.
3. Domain/TLS verification screenshot or text evidence.

## Task 8.2: Production Deployment and Runbooks
### Preconditions
1. Sign into Azure tools context in VS Code.
2. Confirm target subscription and resource groups.
3. Confirm `.azure/deployment-plan.md` status is `Validated`.

### Execution
1. Run pre-deployment validation snapshot:
- `pnpm quality:gate`
2. Execute deployment commands using approved pipeline tooling (azd preferred path if project is azd-ready):
- `azd provision --preview`
- `azd up` or `azd deploy` (based on whether infra already exists)
3. Verify deployed services are reachable and health endpoints respond.
4. Capture and approve operational runbooks for:
- Incident response
- Scale-up and saturation handling
- Failover/rollback path

### Evidence to Record
1. Deployment command transcript and result.
2. Resource identifiers and public endpoints.
3. Runbook signoff by Cloud Ops and DevOps.

## Task 8.3: Pre-Launch Security and Quality Gates
### Security Gate
1. Run SAST in CI and capture findings summary.
2. Run DAST or equivalent external scan against deployed endpoints.
3. Confirm critical findings count is zero.

### Load Gate
1. Run representative load scenario against runtime and API paths.
2. Track throughput, latency, and error budget.
3. Confirm launch threshold is met (target profile from release criteria).

### Evidence Freshness Gate
1. Confirm latest quality and audit evidence artifacts are under 90 days old.
2. Export final evidence pack for launch signoff.

### Evidence to Record
1. Security scan report IDs and timestamps.
2. Load test artifact path and key metrics.
3. Final launch signoff checklist with owners.

## Connector Token Lifecycle Readiness (Task 4.2)
### Preconditions
1. OAuth connector client credentials are configured in deployment environment:
- `CONNECTOR_GITHUB_CLIENT_ID`, `CONNECTOR_GITHUB_CLIENT_SECRET`
- `CONNECTOR_JIRA_CLIENT_ID`, `CONNECTOR_JIRA_CLIENT_SECRET`, `CONNECTOR_JIRA_CLOUD_ID`
- `CONNECTOR_TEAMS_CLIENT_ID`, `CONNECTOR_TEAMS_CLIENT_SECRET`, `CONNECTOR_TEAMS_TENANT_ID`
2. Secret store is reachable from api-gateway runtime (`kv://...` or `https://.../secrets/...`).

### Execution
1. Start api-gateway and verify worker startup log contains `connector token lifecycle worker started`.
2. Create/seed one OAuth connector with `tokenExpiresAt` inside 5-minute window and valid `refresh_token` in secret store.
3. Wait for worker cycle (up to 60s) and verify:
- metadata moves to `connected`
- `tokenExpiresAt` and `lastRefreshAt` are updated
- `oauth_refresh` event with `result=refreshed` exists
4. Validate re-consent path:
- set connector to `permission_invalid` or `scopeStatus=insufficient`
- verify status transitions to `consent_pending` and `oauth_refresh` event contains `requires_reconsent`
5. Validate revoke path from dashboard Connectors page:
- click `Disconnect` for an OAuth connector
- verify status `revoked`, secret reference cleared, and connector actions are blocked

### Evidence to Record
1. Runtime log excerpt showing worker start and at least one refresh attempt.
2. Before/after `ConnectorAuthMetadata` snapshot for refreshed connector.
3. `ConnectorAuthEvent` rows proving `refreshed`, `requires_reconsent`, and `oauth_revoke` cases.

## Normalized Connector Action Execution Readiness (Task 4.3)
### Preconditions
1. Connector auth metadata exists and is scoped to target workspace.
2. Role policy mapping is loaded from `@agentfarm/connector-contracts`.
3. Secret store references resolve for connected connectors.

### Execution
1. Validate successful action execution paths:
- Jira: `read_task`, `create_comment`, `update_status`
- Teams: `send_message`
- GitHub: `create_pr_comment`
- Email: `send_email`
- custom_api: at least one normalized action (`send_message` baseline)
2. Validate transient retry behavior:
- trigger retryable provider response
- verify max attempts = 3 and exponential backoff progression
3. Validate permission failure handling:
- force provider 403 path
- verify metadata transitions to `permission_invalid` and `scopeStatus=insufficient`
4. Validate action logging:
- verify `ConnectorAction` row contains action metadata, result status, provider response code, and error code where applicable

### Evidence to Record
1. API test run output showing connector action suites pass.
2. Example `ConnectorAction` records for one success and one failure.
3. Metadata snapshot proving permission failure path updates connector auth state.

## Connector Health Recovery and Scope Validation Readiness (Task 4.4)
### Preconditions
1. `connector-health-worker` is enabled via api-gateway startup.
2. Secret store is reachable for live probe paths.
3. Dashboard Connectors page is reachable for remediation UI validation.

### Execution
1. Verify worker startup log contains `connector health worker started`.
2. Validate monthly scope check behavior:
- set `lastHealthcheckAt` older than 30 days for test connector
- verify worker picks it up and writes fresh `lastHealthcheckAt`
3. Validate recovery mappings:
- simulate auth failure => connector moves to `permission_invalid` with re-auth remediation
- simulate rate limit => connector moves to `degraded` with backoff remediation
- simulate network timeout => connector moves to `degraded` with backoff remediation
4. Validate manual dashboard trigger:
- use `Run Health Check Now`
- verify connector cards reflect updated status and remediation hints
5. Validate re-auth path UX:
- for OAuth connectors in `permission_invalid` or `consent_pending`, use `Connect via OAuth` and ensure flow starts

### Evidence to Record
1. Worker log excerpt showing health check cycle and result counts.
2. Before/after metadata snapshots for each mapped outcome.
3. Dashboard screenshot or text evidence of remediation status surfacing.

## Fast Resume Commands
1. `pnpm quality:gate`
2. `pnpm --filter @agentfarm/website exec next build --no-lint`
3. `pnpm --filter @agentfarm/website test:permissions`

## Internal Dashboard Access Policy (Auth Hardening)
### Purpose
Prevent customer accounts from obtaining internal-scoped session tokens via `/auth/internal-login`.

### Required Configuration (api-gateway)
1. Set domain allowlist:
- `API_INTERNAL_LOGIN_ALLOWED_DOMAINS=agentfarm.com,corp.agentfarm.com`
2. Set admin role allowlist:
- `API_INTERNAL_LOGIN_ADMIN_ROLES=internal_admin,platform_admin,owner`

### Enforcement Behavior
1. Internal login is deny-by-default.
2. Access is granted only if either condition is true:
- User email domain is in `API_INTERNAL_LOGIN_ALLOWED_DOMAINS`
- User role is in `API_INTERNAL_LOGIN_ADMIN_ROLES`
3. Disallowed users receive:
- HTTP 403
- error code: `internal_access_denied`
4. Startup warning behavior:
- api-gateway logs a warning when both policy lists are empty.

### Internal Diagnostics Endpoint
1. Endpoint:
- `GET /v1/auth/internal-login-policy`
2. Access control:
- Internal scope session required.
3. Output:
- Sanitized effective policy values and counts.
- Includes `deny_all_mode` for empty-policy visibility.

### Validation Steps
1. Positive test (allowed account):
- Call `/auth/internal-login` with allowed domain or admin role.
- Confirm returned token has `scope=internal`.
2. Negative test (customer account):
- Call `/auth/internal-login` with non-allowed domain and non-admin role.
- Confirm HTTP 403 with `internal_access_denied`.
3. Regression test (customer login path):
- Call `/auth/login` for same customer account.
- Confirm customer login still succeeds and returns customer session token.
4. Focused smoke command:
- `pnpm --filter @agentfarm/api-gateway test:internal-login-policy`
- Confirms auth policy allow/deny and diagnostics endpoint behavior.

### Evidence to Record
1. Final api-gateway env values used for policy.
2. One successful internal login response (sanitized).
3. One denied internal login response (403 + `internal_access_denied`).

## Internal Dashboard Multi-Workspace Tab Persistence
### Purpose
Ensure each workspace in the internal dashboard remembers its own last active tab without leaking tab choice between workspaces.

### Behavior
1. Dashboard supports workspace-aware URLs:
- `/?workspaceId=<workspace_id>&tab=<overview|approvals|observability|audit>`
2. Top bar and sidebar workspace selectors update `workspaceId` while preserving current `tab`.
3. Tab selection persists in local storage per workspace key:
- `agentfarm.dashboard.activeTab.<workspaceId>`
4. Workspace selection persists in local storage key:
- `agentfarm.dashboard.activeWorkspaceId`
5. Legacy migration:
- If legacy key `agentfarm.dashboard.activeTab` exists and scoped key is missing, value is migrated into the active workspace key.
6. Deep links:
- Operators can copy current view links and tab-specific links from the dashboard deep-link bar.
- Approval links include `approvalId`; audit links include `correlationId`.

## Internal Dashboard Observability Enhancements
### Runtime Incident Drilldown
1. Drilldown buttons provide focused views for:
- heartbeat incidents
- state degradation incidents
- connector incidents
2. Each drilldown includes recommended runbook action text for first response.

### Internal Login Policy Visibility
1. Observability tab shows policy health snapshot:
- `deny_all_mode`
- allowed domains count
- admin roles count
- policy check source and check timestamp

## Dashboard CI Lane
1. Workflow:
- `.github/workflows/dashboard-ci.yml`
2. Gate checks:
- Dashboard typecheck
- Dashboard production build
- Playwright Chromium install
- Workspace/tab browser e2e (`test:e2e:workspace-tabs`)

### Validation Steps
1. Open workspace A and select tab `observability`.
2. Switch to workspace B and select tab `overview`.
3. Return to workspace A and confirm it restores `observability`.
4. Run smoke checks:
- `pnpm smoke:e2e`

## Exit Criteria
1. Task 7.1 production SWA rollout complete.
2. Task 8.2 deployment evidence and runbook signoff complete.
3. Task 8.3 security, load, and freshness gates complete.
4. MVP launch signoff approved by Product, Engineering, and Security leads.
