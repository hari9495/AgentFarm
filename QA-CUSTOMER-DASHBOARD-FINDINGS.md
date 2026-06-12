# Customer Dashboard — Manual QA Findings

**Date:** 2026-06-12
**Tester:** Manual QA (UI-driven, Developer Agent reference)
**App under test:** `apps/website` customer dashboard (`/dashboard/*`), served on `localhost:3005`
**Backend:** Docker stack (api-gateway 3000, agent-runtime 4000, postgres, redis, opa)
**Accounts used:**
- Seeded owner `admin@agentfarms.in` / tenant `agentfarms`
- Fresh self-signup `qa.tester@qatestco.example.com` / tenant `qa-test-co-5a945d` (full signup → email-verify → login → dashboard path exercised)

---

## Summary

The customer-facing surface (signup, email verification, login, dashboard shell, navigation, and most read-only pages) **works**. Auth is solid — every `/api/*` route rejects unauthenticated requests with 401, and tenant isolation holds (a customer cannot read another tenant's agent).

However, the **two flows that make the product actually do work are broken end-to-end**: submitting a task to an agent, and the approvals pipeline. Both are blocked by infrastructure/config gaps, not UI bugs. New customers also never get a working agent because provisioning never runs. These are the priority fixes.

Severity legend: 🔴 Blocker · 🟠 Major · 🟡 Minor · 🔵 Cosmetic/UX

---

## 🔴 Blockers

### 1. Task submission fails — `AGENT_RUNTIME_URL` not set on api-gateway
- **Where:** `/dashboard/tasks` → "Run Task"; API `POST /api/portal/agents/:botId/tasks` → gateway `POST /portal/data/agents/:botId/tasks` → runtime `/run-task`.
- **Symptom:** UI shows a bare `runtime_unreachable` (and earlier `Not Found`) under the form; no task is created.
- **Root cause:** In `docker-compose.yml`, the `api-gateway` service block does **not** define `AGENT_RUNTIME_URL` (only `worker-runner` and `trigger-service` do). The route in `apps/api-gateway/src/routes/admin/portal-data.ts` falls back to `http://localhost:4000`, which inside the gateway container is the gateway itself — nothing listens on :4000 there, so `fetch` throws `TypeError: fetch failed`.
- **Proof:** `docker exec agentfarm-api-gateway printenv AGENT_RUNTIME_URL` → empty. A direct POST from inside the gateway container to `http://agent-runtime:4000/run-task` succeeds (`{"status":"queued"}`). The task itself runs fine — when I called the runtime directly the execution succeeded (`TaskExecutionRecord.outcome = success`, OpenAI, ~5.5s).
- **Fix:** add `AGENT_RUNTIME_URL: http://agent-runtime:4000` to the `api-gateway` environment block in `docker-compose.yml`.

### 2. The gateway route for portal task submission was missing from the running container
- **Where:** same route as #1.
- **Symptom:** Before I rebuilt, `POST /portal/data/agents/:botId/tasks` returned **404 "Route not found"** — the UI surfaced `Not Found`.
- **Root cause:** The running `agentfarm-api-gateway` image was built ~1.5h **before** commit `5d69055e "feat: add portal task submission UI"` landed, so the route didn't exist in the deployed image. After `docker compose build api-gateway`, the route resolves (it now 502s for reason #1, not 404).
- **Fix:** rebuild/redeploy api-gateway whenever portal routes change. Worth a CI/deploy check so the running image can't lag the schema/routes.

### 3. Agent provisioning never completes — no `worker-runner` container
- **Where:** signup → "Provisioning Progress" card on `/dashboard`; bot stays `status = created`.
- **Symptom:** A brand-new customer's Developer Agent never becomes usable. The runtime reports `runtime_not_ready / state: created`, so even with #1 and #2 fixed, `/run-task` is rejected until the agent is bootstrapped.
- **Root cause:** api-gateway runs with `AF_WORKERS_DISABLED=1` ("workers disabled — expecting standalone worker-runner process"), but **no `worker-runner` container is running** (`docker ps` shows none; it's defined in compose but not up). The provisioning worker that would move the job `queued → … → ready` and POST `/startup` to the runtime never runs.
- **Proof:** I had to manually flip the bot/workspace/tenant to active and `curl -X POST http://localhost:4000/startup` to get the runtime into `active` before a task would run.
- **Fix:** either start the `worker-runner` service in the compose stack, or run workers in-process on the gateway (unset `AF_WORKERS_DISABLED`) for the single-host deployment.

### 4. Portal approvals are a silent no-op (create + list both fake)
- **Where:** Agent detail → "Request High-Risk Approval" (Approval Simulation); `/dashboard/approvals` inbox; home "Approval Queue"; `POST`/`GET /api/approvals`.
- **Symptom:** Clicking "Request High-Risk Approval" shows a success toast ("Request approval-… created"), but the approval **never appears** in the Approvals inbox, the agent's approval list, or the home queue — all permanently show "Inbox clear / 0 pending".
- **Root cause:** `apps/website/app/api/approvals/route.ts` proxies to gateway `/portal/data/approvals`, but **that route does not exist in the gateway** (no handler in `portal-data.ts`). On the non-2xx/missing response the website route falls back to a **stub** that returns a fabricated `201` approval object for `POST` and an empty array for `GET`. So creation always "succeeds" with fake data and the list is always empty.
- **Proof:** `POST /api/approvals` → `201 {approval: {id: "approval-1781251256229", …}}`, immediately followed by `GET /api/approvals?status=pending` → `{"approvals":[]}`.
- **Fix:** implement `GET`/`POST /portal/data/approvals` (tenant-scoped) in the gateway and remove the stub fallback, or wire the portal to the real approvals intake the agent-runtime already uses.

---

## 🟠 Major

### 5. Billing page shows "No active plan" despite an active subscription
- **Where:** `/dashboard/billing`.
- **Symptom:** Header reads "No active plan on file" / "No renewal date on file", even though signup created an **active Starter subscription** (confirmed: `GET /api/portal/billing/subscription` → `status: active, planId: starter, expiresAt: 2027-…`).
- **Root cause:** `apps/website/app/dashboard/billing/page.tsx` computes the current plan **only from paid `orders`** (`latestPaidOrder`), ignoring the `subscription` object it already fetches. Free/system subscriptions create no order, so `currentPlan` is `null` and seat limits / renewal all render empty.
- **Fix:** derive current plan from `subscription.planId` (fall back to orders), and use `subscription.expiresAt` for the renewal date.

### 6. Settings & Reports say "No agents deployed yet" while an agent exists
- **Where:** `/dashboard/settings` (Shift Schedule, Current Approval Policy), `/dashboard/reports` (Agent Output).
- **Symptom:** Both pages claim no agents are deployed, but the Developer Agent exists and shows on `/dashboard/agents` and the home page.
- **Likely cause:** these panels treat a bot in `status = created` (not yet provisioned) as "not deployed." Tied to #3 — once provisioning works this may resolve, but the empty-state copy is misleading when an agent is clearly present. Worth confirming the agent-list query/threshold these panels use.

---

## 🟡 Minor

### 7. Every customer **owner** sees an "INTERNAL → Admin Console" nav section
- **Where:** sidebar `components/layout/AppSidebar.tsx`; the INTERNAL group renders for any `userRole !== "member"`, and `/admin` loads for the customer owner.
- **Concern:** "Admin Console / Tenant Superadmin" framing reads like staff-only tooling exposed to ordinary customers. The underlying APIs (`/api/admin/users`) are tenant-scoped so it's not a data leak I could trigger, but the surface/labeling invites confusion and accidental privileged-looking actions. Recommend gating INTERNAL behind a real staff/operator flag, not "not a member."

### 8. `/portal/login?verified=1` silently drops the success state
- **Where:** post-email-verification "Sign in →" link points to `/portal/login?verified=1`, which redirects to `/login` and **loses the `verified` flag** — the user gets no "email verified, please sign in" confirmation on the login screen.
- **Fix:** carry the flag through the redirect (or show a verified banner on `/login`).

### 9. Team "Add Member" creates a member that can't actually log in
- **Where:** `/dashboard/team` → Add Member.
- **Symptom:** Adding "Team Member QA" reports success and shows them in the roster, but the new member is **not created as a portal account** — `GET /api/portal/auth/lookup-tenant?email=member.qa@…` returns `{"tenants":[]}`, and they don't appear in `TenantPortalAccount`. The roster is backed by the legacy `auth-store` (sqlite/`agentfarm_session`), separate from the portal accounts (Postgres `TenantPortalAccount`) that actually authenticate.
- **Impact:** invited teammates cannot sign in. Two parallel user stores (`portal_session`/Postgres vs `agentfarm_session`/auth-store) are used inconsistently across the dashboard.

### 10. Agent status label inconsistency
- **Where:** `/dashboard/agents/:id` shows the agent as **"Active"** in the header while the Configuration block shows **Status: Created**. The bot is actually `created` (not provisioned). Pick one source of truth.

---

## 🔵 Cosmetic / UX

### 11. "Add AI Teammate" / "Manage Plan" leave the dashboard for public marketing pages
- Home CTAs link to `/marketplace` and `/checkout`, which render the **public marketing site** (logged-out "Sign in / Get Started" header), not an in-dashboard hire/upgrade flow. Jarring context switch for a signed-in customer.

### 12. Verification/reset emails use the production domain in local dev
- The signup success "backup verify link" points to `https://agentfarms.in/portal/verify-email?...` even on localhost (`PORTAL_APP_BASE_URL` not set for the gateway in dev). The equivalent local path worked, but the surfaced link is unusable locally.

### 13. Provisioning card polls aggressively
- `ProvisioningProgressCard` polls `/api/provisioning/status` every **2s** indefinitely (the network log filled with hundreds of identical calls). Since the portal status endpoint is a static stub, consider backing off or stopping once status is terminal.

---

## What works (verified)

- Signup → email verification → login → dashboard redirect (happy path).
- Auth on all `/api/*` routes: unauthenticated → 401 (checked dashboard/agents, activity, admin/bots, governance, webhooks, mcp, support, marketplace; only `/api/billing/plans` is intentionally public).
- Tenant isolation: customer cannot read another tenant's agent (`/api/portal/agents/<other-bot>/tasks` → 404).
- Pages that render correctly with live/empty data: Overview, Agents list, Agent detail (+ Approvals sub-page), Tasks (form), Activity, Audit Log, Deployments, Bot Status (Manage Bots — shows seeded demo bots), Evidence, Reports, Integrations, Webhooks, MCP Servers, Custom APIs (page renders; underlying `/v1/workspaces/:id/adapters` 404s — see note), Governance, Team, Roles & Permissions, Billing, Security, API Keys, Support, Notifications, Settings.
- **API Keys create** — `POST /api/security/api-keys` (role `viewer`) returns a real key, persists across gateway restart. (Note: UI offers role "member" but the API only accepts `viewer/operator/admin` → 400 `invalid_role`; minor mismatch.)
- **Support issue create** — `POST /api/support/issues` persists and survives a gateway restart.
- **Connector request** — `POST /api/portal/connectors/request` returns 201.
- **Task execution itself** — once the runtime is bootstrapped, a Developer Agent task runs to `success` against OpenAI.

---

## Fixes applied (2026-06-12, same session)

All findings above were fixed in one pass:

| # | Finding | Fix |
|---|---------|-----|
| 1 | `AGENT_RUNTIME_URL` missing on api-gateway | Added to `docker-compose.yml` api-gateway env |
| 2 | Stale gateway image | Rebuilt `api-gateway` + `agent-runtime` images |
| 3 | Provisioning never runs | Workers now run in-process on api-gateway (`AF_WORKERS_DISABLED` defaults empty); `worker-runner` moved behind `split-workers` compose profile; `AF_SKIP_PROVISIONING=true` default for single-host (no Azure) so signup jobs activate the bot directly; agent-runtime now self-bootstraps on boot (`AF_RUNTIME_AUTOSTART=1` + retry loop in `runtime-server.ts`); runtime healthcheck asserts `"ok":true` |
| 4 | Approvals were a silent no-op | Implemented `GET/POST /portal/data/approvals` + `POST /portal/data/approvals/:id/decide` in the gateway (`portal-data.ts`), DB-backed on the `Approval` table, tenant-scoped, with audit events and best-effort runtime decision webhook; removed all fake-success stubs from the website approvals routes |
| 5 | Billing "No active plan" | Billing page now reads `{subscription}` shape correctly and derives the current plan from the subscription (fallback: latest paid order) |
| 6 | Settings/Reports "No agents deployed" | Settings populates shift schedule + policy from `/portal/data/agents`; Reports is now fully live from `/portal/data/usage/agents` + `/portal/data/approvals` |
| 7 | INTERNAL nav for customer owners | Sidebar INTERNAL group now renders only for `superadmin` (platform staff) |
| 8 | `verified=1` dropped on login | `/portal/login` preserves query params; `/login` shows an "Email verified!" banner |
| 9 | Team members couldn't log in | New gateway portal team API (`GET/POST/PATCH /portal/data/team/members`) creates pre-verified `TenantPortalAccount` rows — the store portal login authenticates against; Team page + roster client rewired |
| 10 | Active/Created status mismatch | `created` now renders as "Provisioning" on agents list, agent detail, and Bot Status pages; reliability shows "—" until tasks exist |
| 11 | CTAs to marketing pages | "Manage Plan" → `/dashboard/billing` ("Add AI Teammate" intentionally stays on `/marketplace` — that is the hire flow) |
| 12 | Prod-domain verify links / port inconsistency | `PORTAL_APP_BASE_URL` default unified to `:3002` in compose and `portal-auth.ts`; **security**: `/portal/auth/register` no longer returns `verifyUrl` in production responses |
| 13 | 2s runaway polling | Provisioning card polls 3s while a job is active, 60s when idle/terminal; `/api/provisioning/status` is now a real proxy to the new gateway `GET /portal/data/provisioning/status` (live `ProvisioningJob` + SLA metrics) |
| — | Bot Status fake demo bots | New `/api/dashboard/bot-status` joins real agents with real usage; page no longer reads sqlite demo data |
| — | Audit page blind to platform events | New gateway `GET /portal/data/audit/events` (tenant-scoped `AuditEvent` log) merged into `/api/audit/events` alongside local auth events |
| — | Custom APIs 404 | Website adapter routes now call the real gateway paths (`/v1/adapters[...]`) |
| — | Governance KPIs 403 | Stopped passing `tenantId` as `workspace_id` (param is optional and session is tenant-scoped) |
| — | OPA unhealthy | Compose now uses `openpolicyagent/opa:0.68.0-debug` (the `-static` image has no shell for healthchecks) |

Verification: `pnpm --filter @agentfarm/{api-gateway,website,agent-runtime} typecheck` clean; portal-data + portal-auth tests 41/41 pass. (`connector-actions.test.ts` has one pre-existing failure on a clean tree — unrelated.)

## Notes / smaller items observed
- `/v1/workspaces/:tenantId/adapters` (Custom APIs page) returns 404 from the gateway — adapter routes are registered as `/v1/adapters` (session-scoped), so the website's path shape doesn't match. Custom API listing will always be empty.
- `/api/governance/kpis` returns `403 "Workspace outside session scope"` while sibling governance endpoints (workflows/plugins/retention) return 200 — the KPIs page tile shows perpetual "loading".
- OPA container is **unhealthy** (`/bin/sh` missing for its healthcheck exec); didn't surface in customer UI but policy evaluation may be affected.
- Two infra incidents during testing, unrelated to the product: the C: drive filled to 0 bytes (Docker build cache had grown to ~44 GB) which aborted the first gateway rebuild; cleared via `docker builder prune` + WSL restart.
