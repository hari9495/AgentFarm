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

---

## Secrets & Key Rotation Pre-Launch Checklist

> Complete this section **before** any production deployment. These items address credentials
> that appeared in git history or in docker-compose before the 2026-05-13 remediation pass.

### Credentials to rotate before going live

| Credential | Where it appeared | Action required |
|------------|-------------------|-----------------|
| `POSTGRES_PASSWORD` (was `agentfarm`) | `docker-compose.yml` git history — commit `b6a2a1f` | Set a strong random password in your production secret store. Update `DATABASE_URL` to match. |
| `agentfarm_test` (test DB password) | `docker-compose.test.yml` git history — commit `cdd775fe` | Rotate the test DB password before running integration tests against any shared environment. |
| `API_SESSION_SECRET` | `docker-compose.yml` — was already using `${API_SESSION_SECRET}` | Verify this is set in CI secrets and production secret store; generate via `openssl rand -base64 64`. |
| `DASHBOARD_API_TOKEN` | Same | Same. |

### How to set a strong random password (Linux/macOS)
```bash
openssl rand -base64 32
```

### Dev vs prod key separation (rule 11)
- All dev work uses `.env` (gitignored) pointing to a local `agentfarm` DB.
- All prod deployments use a separate DB named `agentfarm_prod` (see `.env.production.example`).
- API keys for external services (Stripe, OpenAI, Twilio, etc.) must be sandbox/test keys in `.env` and separate live keys in the production secret store. Never share a key between environments.

---

## Authentication & Authorization Security Checklist (items 13–16)

### 13 — Auth provider: hand-rolled (acknowledged tech debt)

AgentFarm uses a hand-rolled auth stack in `apps/api-gateway/src/routes/auth.ts` and
`apps/website/lib/auth-store.ts`. The implementation includes:

- Password hashing via scrypt with a random salt (not bcrypt/plain MD5)
- Timing-safe password comparison plus a dummy hash to prevent user enumeration
- HMAC-SHA-256 signed session tokens (not unsigned JWTs)
- Configurable session TTL (default 8 h) with expiry enforced on every read

**Gaps vs a managed provider (Auth0/Clerk/Supabase):**

| Feature | Current status |
|---------|---------------|
| Email verification | Not implemented |
| Password reset flow | Stubbed (`forgot-password` route exists, no email delivery) |
| Credential breach detection | Not implemented |
| Account lockout / rate limiting on login | Not implemented (rely on gateway rate limiter) |
| MFA / passkey support | Not implemented |

**Required before production:**
- [ ] Implement account lockout after N failed login attempts (recommend: 10 attempts → 15 min lockout, stored in session/Redis)
- [ ] Deliver password-reset emails (wire `forgot-password` route to a transactional email provider)
- [ ] Add verified-email gate on first login

**Future migration:**  
A sprint to migrate to Clerk or Auth0 is recommended. The `AuthRepo` interface in `auth.ts` is
already dependency-injected; replacing `getPrismaRepo()` with a managed-provider adapter is the
migration path.

---

### 14 — Cross-tenant isolation ("logged in as A, hit B's URL")

**Status: Enforced at the route level. Tests exist.**

Every API route that accepts a `tenantId` or `workspaceId` checks it against the authenticated
session before reading or writing data:

| Route file | Enforcement |
|------------|-------------|
| `routes/roles.ts` | `tenantId !== session.tenantId → 403 tenant_scope_violation` |
| `routes/workspace-session.ts` | `canAccessWorkspace(session, workspaceId)` (checks `session.workspaceIds`) |
| `routes/governance-workflows.ts` | `session.workspaceIds.includes(workspaceId) → 403 workspace_scope_violation` |
| `routes/plugin-loading.ts` | `session.workspaceIds.includes(workspaceId) → 403 workspace_scope_violation` |

Tests covering this isolation:
- `routes/roles.test.ts` — "role subscriptions endpoint enforces tenant scope" (403 for tenant_2 while session is tenant_1)
- `routes/workspace-session.test.ts` — "returns forbidden when session cannot access requested workspace" (403 for ws_2 while session only has ws_1)

**Pre-launch manual test (item 14 attack):**
1. Sign up as user A (tenant A).
2. In a separate browser / incognito, sign up as user B (tenant B).
3. While logged in as user A, attempt: `GET /v1/tenants/<tenant_B_id>/role-subscriptions`
4. Expected: `403 tenant_scope_violation`.
5. Attempt: `GET /v1/workspaces/<ws_B_id>/session-state`
6. Expected: `403 forbidden`.
7. Repeat for any new route added that accepts a user/tenant/workspace URL parameter.

---

### 15 — Session cookie flags

**Status: Fixed in this sprint.**

| Cookie | App | HttpOnly | SameSite | Secure |
|--------|-----|----------|----------|--------|
| `agentfarm_session` (API gateway) | `api-gateway` | ✅ | Strict | ✅ (production or `COOKIE_SECURE=true`) |
| `agentfarm_session` (website) | `website` | ✅ | Strict | ✅ (`NODE_ENV=production`) |
| `agentfarm_internal_session` | `website` | ✅ | Strict | ✅ (`NODE_ENV=production`) |
| `agentfarm_gateway_session` | `website` | ✅ | Strict | ✅ (`NODE_ENV=production`) |

**To enable `Secure` in a non-production environment** (e.g. staging over HTTPS):
```bash
COOKIE_SECURE=true  # set in .env or secret store
```

---

### 16 — Re-authentication for destructive actions

**Status: No destructive endpoints exist yet. Requirement documented here.**

When any of the following endpoints are implemented, they **must** require the user to
re-enter their current password (or complete a re-auth challenge) before proceeding:

| Action | Why re-auth is required |
|--------|------------------------|
| Delete account / tenant | Irreversible data loss; blocks attacker on unlocked device |
| Change login email | Would lock out legitimate owner |
| Export all data (GDPR / bulk export) | Sensitive; limits damage from session hijack |
| Transfer workspace / tenant ownership | Irreversible privilege change |
| Revoke all active sessions | Prevents attacker from locking out owner |

**Implementation pattern:**
```typescript
// In the route handler, after session validation:
const { password } = body;
const user = await repo.findUserByEmail(session.email);
const valid = await verifyPassword(password, user.passwordHash);
if (!valid) {
    return reply.code(403).send({ error: 'reauth_required', message: 'Current password is required to perform this action.' });
}
// proceed with destructive action
```

### Confirming nothing sensitive is currently in git (run before each release)
```bash
# Full history scan — requires gitleaks installed locally
gitleaks detect --source . --config .gitleaks.toml --verbose

# Quick grep for common patterns
git log --all -p | grep -iE "(password|secret|api_key)\s*[:=]\s*['\"][^'\"]{8,}"
```

The CI `secret-scan` job (`.github/workflows/ci.yml`) runs gitleaks on every push and PR automatically.

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

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).


## Current Implementation Pointer (2026-05-07)
1. For the latest built-state summary and file map, see planning/build-snapshot-2026-05-07.md.

---

## Security Checklist: Admin Panel & Internal Tools (Items 17–21)

### Item 17 — Real Admin Panel with DB Exports

**Status**: Implemented

#### Export Endpoints
| Endpoint | Description | Auth |
|---|---|---|
| `GET /api/admin/export/sql` | Full SQL INSERT dump of all tables | admin / superadmin |
| `GET /api/admin/export/csv?table=users` | Users table CSV (password_hash redacted) | admin / superadmin |
| `GET /api/admin/export/csv?table=bots` | Bots table CSV | admin / superadmin |
| `GET /api/admin/export/csv?table=approvals` | Approvals table CSV | admin / superadmin |
| `GET /api/admin/export/csv?table=company_audit_events` | Audit log CSV | admin / superadmin |

Export buttons are available on the Admin Console page (`/admin`) in the "Data Exports" section.

**Notes:**
- SQL export uses INSERT statements (not binary file copy) to avoid SQLite locking issues.
- `password_hash` and `token_hash` fields are redacted from CSV exports.
- All export requests are gated behind the session role check; unauthenticated or member-role requests receive 403.

---

### Item 18 — Admin Panel Behind Its Own Login, Non-Obvious Path, 2FA

**Status**: Partially implemented. 2FA is a known gap.

#### Current controls
- Every `/admin/*` page is wrapped in a server-component layout (`apps/website/app/admin/layout.tsx`) that runs on every request.
- The layout reads the session cookie, calls `getSessionUser()`, and redirects to `/login` if no session or to `/dashboard` if the role is not `admin` or `superadmin`.
- There is no client-side-only guard; the check is server-side and cannot be bypassed via JavaScript.

#### Path obfuscation
- The admin route is currently `/admin` (visible). For production, consider adding an env-var-gated path prefix (e.g., `AGENTFARM_ADMIN_PATH_TOKEN`) and validating it in the layout or middleware. This is documented as future work.

#### 2FA — Known gap
- TOTP (RFC 6238) 2FA is not currently implemented.
- **Recommendation**: Add a `totp_secret` column to the `users` table and enforce OTP validation for `admin`/`superadmin` logins using a library such as `otpauth`.
- Until 2FA is live, enforce strong password requirements and consider IP-allowlisting the admin path in Azure Front Door or NGINX.

---

### Item 19 — Admin Role = DB Flag, Not Hardcoded Email

**Status**: Implemented

- The authoritative role source is the `users.role` column in the SQLite DB (values: `"superadmin"`, `"admin"`, `"member"`).
- No hardcoded email check exists in the admin gate.
- **Bootstrap mechanism**: `AGENTFARM_ADMIN_EMAILS` and `AGENTFARM_ADMIN_DOMAINS` env vars grant `admin` role on first successful login if the user record has no prior role. This is intentional for initial provisioning only.
- After first login, role is read from and written to the DB via `updateUserRole()` in `auth-store.ts`.
- The admin UI (`/admin/users`) allows superadmins to promote/demote roles; every change calls `writeAuditEvent()`.

---

### Item 20 — Append-Only Audit Log for Every Admin Action

**Status**: Implemented

#### Table
`company_audit_events` (SQLite) — schema:
```
id, actor_id, actor_email, action, target_type, target_id,
tenant_id, before_state, after_state, reason, created_at
```

#### Covered actions
| Action | Trigger |
|---|---|
| `user.role_change` | `PATCH /api/admin/users/[id]` |
| `session.revoked` | Session revocation API |
| `tenant.created` / `tenant.update` | Tenant management APIs |
| `incident.assigned` / `incident.resolved` | Incident management APIs |
| `bot.status_change` | `PATCH /api/admin/bots/[slug]` |
| `bot.config_change` | `PATCH /api/admin/bots/[slug]` |

#### Viewing the log
- Admin UI: `/admin/audit` — real-time fetch from `GET /api/admin/audit-log`, supports action-filter tabs and free-text search.
- Export: `/api/admin/export/csv?table=company_audit_events`

#### Append-only guarantee
- `company_audit_events` rows are INSERT-only; no UPDATE or DELETE path exists in `auth-store.ts`.
- For a hard append-only guarantee at the DB level, run: `REVOKE UPDATE, DELETE ON company_audit_events FROM app_user;` if migrating to PostgreSQL.

---

### Item 21 — Staging Admin Account; Never Test Destructive Features as Founder

**Status**: Procedure documented

#### Creating a staging admin account
```powershell
# 1. Register a staging account via the normal signup flow:
#    Email: staging-admin@agentfarm.local  (or a real alias you own)
#    Password: use a strong random password stored in your password manager

# 2. Promote to admin using the superadmin API (replace TOKEN and USER_ID):
$body = '{"role":"admin"}'
Invoke-RestMethod -Method PATCH `
    -Uri "https://your-domain/api/admin/users/USER_ID" `
    -Headers @{ Cookie = "agentfarm_session=TOKEN"; "Content-Type" = "application/json" } `
    -Body $body
```

#### Rules
1. Never use your founder / superadmin account to test destructive features (role stripping, user deletion, data exports in prod).
2. The staging admin account must not be granted `superadmin` role — use `admin` only.
3. Rotate the staging account password after every destructive test.
4. The staging account should be excluded from any real tenant data in production by operating under a dedicated staging tenant.



---

## Items 22–25: Input Validation, File Safety, Rate Limiting & XSS

### Item 22 — Server-Side Input Validation

All API routes validate inputs on the server regardless of frontend constraints. Standard caps applied:

| Field type           | Max length |
|----------------------|-----------|
| Email                | 254 chars (RFC 5321) |
| Password             | 128 chars |
| Name / company       | 100 chars |
| Title                | 100 chars |
| Reason / description | 1 000 chars |
| Agent slug           | 64 chars |
| GitHub org           | 64 chars |
| tenantId / orderId   | 64 chars, no whitespace |

Routes hardened: uth/login, uth/signup, uth/forgot-password, pprovals (GET limit capped at 500, POST fields capped), onboarding/complete, dmin/provision.

### Item 23 — File Upload Safety

No file upload routes exist in the current codebase. When uploads are added:
- Set maxSize hard limit (e.g. 10 MB) in the route before reading the body.
- Maintain a content-type allowlist; reject by both MIME header and magic-bytes inspection.
- Never trust the client-supplied filename; generate a safe random name server-side.
- Store uploaded files outside the webroot (e.g. Azure Blob, not public/).

### Item 24 — Rate Limiting

**Module**: pps/website/lib/rate-limit.ts — in-memory sliding-window, no Redis required.

Two exported functions:
- checkRateLimit(userId) — general 60 req / 1 min per authenticated user.
- checkAuthRateLimit(key, windowMs, maxRequests) — customisable, keyed by arbitrary string (e.g. IP or email).

Limits applied to unauthenticated auth endpoints:

| Endpoint               | Key scheme         | Window   | Max |
|------------------------|--------------------|----------|-----|
| POST /api/auth/login   | login:<IP>       | 15 min   | 10  |
| POST /api/auth/signup  | signup:<IP>      | 60 min   | 5   |
| POST /api/auth/forgot-password | orgotpw-ip:<IP> | 60 min | 5 |
| POST /api/auth/forgot-password | orgotpw-email:<email> | 60 min | 3 |

All 429 responses include a Retry-After header (seconds to next allowed request).

**Ops note**: Rate-limit state is process-local and resets on server restart. For multi-instance deployments, replace the Map with a Redis-backed store (e.g. ioredis sliding-window) and update checkAuthRateLimit.

### Item 25 — XSS / User-Generated Content

Next.js JSX text interpolation is safe by default (HTML-escapes all values). Audit findings:

- layout.tsx uses dangerouslySetInnerHTML in two places:
  1. Inline theme-detection script — hardcoded string literal, no user data. ✅ Safe.
  2. JSON.stringify(jsonLd) for structured data — static constant, no user data. ✅ Safe.
- No other dangerouslySetInnerHTML found across the codebase.
- No innerHTML = assignments found.

**Rules going forward**:
- Never pass user-supplied strings to dangerouslySetInnerHTML.
- If rich-text user content must be rendered as HTML (e.g. markdown previews), add isomorphic-dompurify and sanitize with DOMPurify.sanitize(html, { ALLOWED_TAGS: [...] }) before rendering.
- Approval titles, reasons, bot names, and user names are always rendered as JSX text nodes — no sanitization needed beyond max-length enforcement.


---

## Items 26–29: Costs & Spending Limits

### Item 26 — Hard spending limits on every paid service

Spending limits must be set in each provider's billing portal **before** going live.
No service stops charging automatically — the cap is yours to set and maintain.

| Service | Where to set the cap |
|---------|---------------------|
| OpenAI | platform.openai.com → Billing → Limits → "Set a hard limit" |
| Azure OpenAI | Azure Portal → Cost Management + Billing → Budgets (set budget action = Stop) |
| Anthropic | console.anthropic.com → Plans & Billing → Usage Limits |
| AWS | CloudWatch Billing Alarm → SNS alert at 80% + Cost Budget action at 100% |
| Google Cloud | console.cloud.google.com → Billing → Budgets → "Actions" → disable billing |
| Twilio | console.twilio.com → Account → Balance Alerts |
| SendGrid | app.sendgrid.com → Settings → Mail Settings → Send Frequency |

Record the USD values you set as commented-out reference vars in .env.example
(section "External service spending limits" at the bottom of the file). This makes
the caps visible in version control next to the code that calls each service.

### Item 27 — Per-bot daily token limit

AgentFarm uses an in-process sliding-window token budget inside gent-runtime.
The budget is scoped per 	enant:workspace:bot and persisted to a JSON state file.

**Enforcement**: every LLM resolver is wrapped in withTokenBudgetGuard() in
pps/agent-runtime/src/llm-decision-adapter.ts. When the daily limit is exhausted,
tasks are routed to the approval queue instead of executing.

**Required env vars** (all must be set before launch):

| Var | Purpose | Launch value |
|-----|---------|-------------|
| AF_TOKEN_BUDGET_DAILY_LIMIT | Max tokens per bot per day | 500000 |
| AF_TOKEN_BUDGET_WARNING_THRESHOLD | Fraction to emit warning | 0.8 |
| AF_TOKEN_BUDGET_CRITICAL_THRESHOLD | Fraction to critical-throttle | 0.9 |

Raise AF_TOKEN_BUDGET_DAILY_LIMIT deliberately per bot, not globally. Start low
(500 000) and increase only after validating actual usage patterns.

### Item 28 — Hard iteration ceiling on agent loops

AutonomousLoopOrchestrator.execute() enforces a hard cap of **25 iterations** per
loop run regardless of the caller-supplied max_iterations value. The constant
MAX_LOOP_ITERATIONS_HARD_CAP = 25 is defined at the top of
pps/agent-runtime/src/autonomous-loop-orchestrator.ts.

Additional ceilings already in place:
- utonomous-coding-loop.ts: max_fix_attempts defaults to **3** (fix-retry sub-loop).
- planner-loop.ts: maxReplans defaults to **3** (replan sub-loop).
- All loop configs also accept 	imeout_seconds and max_cost_tokens kill-switches.

**Ops rule**: any new loop that calls a paid API must include an explicit max_iterations
with maxReplans/max_fix_attempts set to ≤ 5 and a 	imeout_seconds kill-switch.

### Item 29 — Billing alert email

Set BILLING_ALERT_EMAIL in .env to an address that pushes a phone notification.
Use a team alias (not a personal inbox) for resilience, and confirm the alias is
connected to a push-notification service (PagerDuty, OpsGenie, Slack mobile push, etc.).

**Budget alerts are emitted by** pps/agent-runtime/src/budget-alert-emitter.ts:
- On every call to emitBudgetAlert() the target email is logged to stdout (visible
  in any log aggregator) and included in the gateway notification payload.
- If BILLING_ALERT_EMAIL is not set, a warning is logged: "BILLING_ALERT_EMAIL not set".

**Pre-launch checklist for this item:**
1. Set BILLING_ALERT_EMAIL in .env.production and verify it delivers within 5 minutes.
2. Configure each external service (AWS CloudWatch, OpenAI billing alert, etc.) to also
   email or call the same address at 80% of the monthly cap.
3. Confirm the recipient has a mobile push rule — not just an email notification.


---

## Items 30–50: Environments, Logging, Code & Git, Legal, Ops

---

### Item 30 — Three environments: local / staging / production

Every code change must pass through three environments in this order:

| Environment | Purpose | Data | Who touches it |
|-------------|---------|------|----------------|
| **local** | Dev and agent work | Synthetic / dev seed | You + the agent |
| **staging** | Pre-flight with prod-like data | Anonymised copy of production | You before release |
| **production** | Real users | Real data | Only after staging sign-off |

"Push straight to production" is not a workflow. Stage every change first.
NODE_ENV must be staging or production in non-local environments.
Use separate .env.staging and .env.production files (never commit secrets).

---

### Item 31 — Disable debug mode, stack traces, and verbose errors in production

**Status**: enforced by code.

- API gateway: setErrorHandler in pps/api-gateway/src/main.ts catches all 5xx
  errors and returns { error: "internal server error" } — never a stack trace.
- Website: pps/website/app/error.tsx and pps/website/app/global-error.tsx show
  a plain "Something went wrong" message — no error.message or digest rendered.
- NODE_ENV=production must be set in the hosting platform (Vercel, etc.).

**Checklist before launch:**
1. Confirm NODE_ENV=production in your hosting platform's env vars.
2. Test: trigger a 500 error in staging and verify only the generic message appears.
3. Verify the detailed error appears in Sentry/logs, not in the browser response.

---

### Item 32 — CORS: lock to actual domain, not "*"

**Status**: enforced by code in pps/api-gateway/src/main.ts.

ALLOWED_ORIGINS is read by the API gateway preHandler. If the request Origin
header is not in the allow-list, the gateway returns 403 origin not allowed.

**Launch checklist:**
1. Set ALLOWED_ORIGINS=https://app.agentfarm.ai,https://dashboard.agentfarm.ai
   in the production environment (comma-separated, exact match, no trailing slash).
2. Never set ALLOWED_ORIGINS=*. If unset in production, all cross-origin calls are blocked.
3. Add staging domains to a separate .env.staging.

---

### Item 33 — HTTPS everywhere

HTTPS is handled at the edge (Vercel, Cloudflare, Nginx termination) — not in application code.

**Pre-launch checklist:**
1. Confirm TLS certificate is valid and auto-renews (Let's Encrypt via Vercel/Cloudflare).
2. Enable HSTS in Vercel project settings: Strict-Transport-Security: max-age=31536000; includeSubDomains.
3. Redirect HTTP → HTTPS at the CDN or load balancer level — never skip this for admin panels or internal tools.
4. Verify: curl -I http://agentfarm.ai should return a 301/308 redirect, not content.

---

### Item 34 — Health-check endpoint + uptime monitoring

**Status**: endpoints exist.

| Endpoint | App | Auth required | Returns |
|----------|-----|--------------|---------|
| GET /health | api-gateway (port 3000) | No | { status, service, ts } |
| GET /health/detail | api-gateway | Internal session | DB status, uptime, memory |
| GET /api/health | website (port 3002) | No | { status, service, ts } |

**Set up uptime monitoring (free options):**
- UptimeRobot: monitor.uptimerobot.com — create HTTP monitors for each /health URL.
- BetterStack: betterstack.com/uptime — free tier covers several monitors with 3-min checks.
- Configure alert to SMS/push, not just email.

---

### Item 35 — SPF, DKIM, and DMARC for outbound email

**Why**: Without these DNS records, password-reset and notification emails land in spam or get dropped silently.

**How** (one-time, done in your DNS provider):
1. **SPF**: Add a TXT record: =spf1 include:yoursendgridprovider.com ~all
2. **DKIM**: Your email provider (Resend, SendGrid, SES) provides a CNAME or TXT record — follow their guide.
3. **DMARC**: Add a TXT record: =DMARC1; p=quarantine; rua=mailto:dmarc-reports@yourdomain.com

**Verify**: Use mail-tester.com — send a test email and confirm score is 10/10.
Do this before sending any transactional email in production.

---

### Item 36 — Error logging to a service (Sentry)

**Setup steps (one-time):**
1. Create a project at sentry.io (free tier handles ~5 000 errors/month).
2. Set SENTRY_DSN and NEXT_PUBLIC_SENTRY_DSN in .env.production.
3. Set SENTRY_ENVIRONMENT=production.
4. Install @sentry/nextjs and add the Sentry wizard config (see sentry.io/for/nextjs/).

**Minimum viable config**: even without Sentry, console.error calls in API gateway
and website are captured by Vercel's built-in log drain. Ensure log drain is enabled in
your hosting provider.

API gateway already logs all 5xx errors with console.error('[unhandled-error]', error).

---

### Item 37 — Don't log PII

**Policy:**
- Never log passwords, password hashes, session tokens, credit card numbers, or full email addresses in error-level messages.
- Login failures log only userId (not email) in structured fields.
- Rate-limit keys using IP or truncated session token — never a full token or email.

**Existing safeguards:**
- exportTableCsv in auth-store redacts password_hash and 	oken_hash columns.
- Session tokens are stored hashed (	oken_hash) — the cleartext token is never written to the DB.
- Delete-account endpoint logs nothing about the user; result is a silent 200.

**Pre-launch checklist:**
1. Grep all console.log/error/warn calls in pps/website/lib/auth-store.ts for email, password, or token references.
2. Run pnpm --filter "@agentfarm/website" test and review log output for PII.

---

### Item 38 — 30 days of logs minimum

Configure your log provider to retain logs for at least 30 days:
- **Vercel**: Functions → Log Drains → connect Papertrail, Logtail, or Datadog (free tiers start at 7 days; paid plans for 30+).
- **Datadog**: 15-day retention on the free trial; 30 days on the cheapest paid plan.
- **Logtail / Better Stack**: 3 days free, 30 days on the Starter plan.
- **Self-hosted**: logrotate with otate 30 (one file per day, keep 30).

Put a calendar reminder to verify retention settings 1 week before launch.

---

### Item 39 — Commit to git before every major agent change

**Rule**: run git add -A && git commit -m "checkpoint: before <change>" before every
agent task that modifies more than one file. This is your undo button. The agent has no
memory — "undo" means git checkout to the last commit.

---

### Item 40 — Read the diff before accepting

Before accepting an agent change, review every file it touched with git diff --staged.
If any chunk is unclear, ask the agent to explain it line-by-line before merging.
Never use "Accept All" without at least skimming auth, payment, and permission-related files.

---

### Item 41 — Plain-English product rules doc

Location: planning/master-plan.md and mvp/mvp-scope-and-gates.md.
Add a "Business Rules" section to one of these docs listing rules that must always hold:
- Users can only see their own workspace data.
- Refunds or deletions over a threshold require superadmin approval.
- Agent actions on production systems require human approval.
When the agent rewrites a feature and "forgets" a rule, this doc is how you catch it.

---

### Item 42 — Human dev review for payments, auth, and sensitive data

Before launch: hire a senior engineer for a 1-hour targeted security review of:
1. pps/website/lib/auth-store.ts — auth, sessions, role assignment
2. pps/api-gateway/src/routes/billing.ts — payment flows
3. pps/website/app/api/auth/* — all auth endpoints
4. pps/api-gateway/src/main.ts — CORS, headers, rate limits

Ask them specifically: "Are there any missing authorization checks or unsafe queries?"

---

### Item 43 — Privacy policy and terms of service

**Status**: privacy policy exists at /privacy in the website.

**Pre-launch checklist:**
1. Add a Terms of Service page at /terms (use a generator like termsfeed.com or getterms.io).
2. Link both /privacy and /terms in the footer of every page and in the signup flow.
3. Add a checkbox on the signup form: "I agree to the Terms of Service and Privacy Policy."
4. Log the timestamp and version of the ToS each user agreed to (store in users.tos_accepted_at).

---

### Item 44 — Applicable privacy laws

Identify which laws apply based on where your users are:

| Jurisdiction | Law | Key obligations |
|-------------|-----|-----------------|
| EU / EEA | GDPR | Lawful basis, data subject rights, DPA required if processing EU data |
| India | DPDP 2023 | Consent, grievance officer, data principal rights |
| California | CCPA / CPRA | Opt-out of sale, right to delete, right to know |
| US health data | HIPAA | BAA required, audit logs, encryption mandated |

**Action**: spend 2 hours before launch identifying which jurisdictions your beta users are in.
If you have EU users, you need a GDPR-compliant privacy notice and a lawful basis for processing.

---

### Item 45 — "Delete my account" feature

**Status**: implemented.

- deleteAccount(userId) in pps/website/lib/auth-store.ts — anonymises PII columns,
  deletes sessions, sets deleted_at tombstone (prevents ID reuse).
- DELETE /api/auth/delete-account route in pps/website/app/api/auth/delete-account/route.ts —
  requires valid session, rate-limited to 3/15 min, clears session cookie on success.
- Migration: ALTER TABLE users ADD COLUMN deleted_at INTEGER runs on startup.

**What this does NOT yet cover:**
- Propagating deletion to the API gateway tenant/workspace records (add when those are owned by the user).
- Backups: document in your backup runbook that backup snapshots age out after 90 days,
  after which deleted-user data cannot be restored.

**Pre-launch**: add a "Delete my account" button to account settings, confirmed by a modal.

---

### Item 46 — Cookie consent banner

**Status**: CookieConsent component exists at pps/website/components/shared/CookieConsent.tsx.

**Pre-launch checklist:**
1. Verify the banner is rendered on first visit for all pages (check pps/website/app/layout.tsx).
2. Ensure non-essential scripts (analytics, ad trackers) only load after "accepted" is stored.
3. "Declined" state must actually block non-essential cookies — not just hide the banner.
4. If using Vercel Analytics: it is privacy-preserving (no cookies), so consent is not required.

---

### Item 47 — Disaster recovery runbook: top 3 scenarios

#### Scenario A: Database corrupted / lost

1. Stop all writes: flip NEXT_PUBLIC_MAINTENANCE_MODE=true in Vercel dashboard.
2. Identify last good backup: check automated backup schedule (see backup runbook).
3. Restore: copy the backup .auth.sqlite to pps/website/ and restart the service.
4. Validate: run pnpm --filter @agentfarm/website test smoke suite against the restored DB.
5. Resume: flip NEXT_PUBLIC_MAINTENANCE_MODE=false.
6. Post-mortem: document what caused the corruption and add a guard.

#### Scenario B: Hosting / cloud provider down

1. Check provider status page (status.vercel.com, status.azure.com, etc.).
2. Enable maintenance mode on any still-running services.
3. If prolonged (> 2 hr): spin up the Docker Compose stack locally as a temporary instance.
4. Point DNS to the temporary instance (TTL 300, revert when provider recovers).
5. Communicate status via your company status page or a static "we're investigating" tweet.

#### Scenario C: Secret / credential leaked

1. Immediately rotate the leaked credential in its provider's console.
2. Invalidate all active sessions: run DELETE FROM sessions; against the auth DB.
3. Revoke and regenerate API keys in the API gateway.
4. Audit the git history for the leaked secret and remove it with git filter-repo (never just delete the line).
5. Notify affected users if the leak was of their session tokens.
6. File a security incident in operations/runbooks/ within 24 hours.

---

### Item 48 — Maintenance mode

**Status**: implemented.

Set NEXT_PUBLIC_MAINTENANCE_MODE=true in the hosting platform's environment variable
settings (Vercel: Project → Settings → Environment Variables → Override for Production).
No redeploy required — the middleware reads the env var at the edge.

- /api/health and /maintenance remain available during maintenance.
- All other routes return 503 Service Unavailable (JSON for API routes, redirect for pages).
- Set NEXT_PUBLIC_MAINTENANCE_MODE=false to resume.

---

### Item 49 — Alerting: failed payments, signup spikes, error spikes, server down

| Alert | Where to configure | Threshold |
|-------|-------------------|-----------|
| Server down | UptimeRobot / BetterStack (free) | /health non-200 for 2 min |
| Error spike | Sentry lertRules or Datadog monitor | > 10 errors/min |
| Failed payments | Stripe Dashboard → Alerts → Payment failures | Any failure sends email |
| Signup spike | Custom metric in log aggregator | > 50 signups/hr from single IP |
| Token budget hit | BILLING_ALERT_EMAIL (see items 26-29) | 80% / 100% of daily limit |

**Minimum for launch**: uptime monitor on /health + Stripe payment failure alert.
Both are free and take < 10 minutes to configure.

---

### Item 50 — Shared access and renewal reminders

**Access inventory — keep updated in a shared password manager (1Password, Bitwarden Teams):**

| System | What to share |
|--------|--------------|
| Hosting (Vercel/Azure) | Team invitation + service account credentials |
| Domain registrar | Account login with 2FA backup codes |
| Database (production) | Connection string + credentials |
| Email (account resets) | The email account that receives "forgot password" for all above |
| SSL certificates | Auto-renew enabled; calendar reminder 30 days before expiry |

**Rules:**
1. No single point of failure — at least two people can access each system.
2. Put a calendar reminder on every domain and SSL expiry date, starting 60 days out.
3. Never store production credentials only in someone's personal vault.
