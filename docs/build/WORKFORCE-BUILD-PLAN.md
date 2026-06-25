# AI Workforce — Build Plan & Progress Tracker

> **Single source of truth** for closing the human-replacement gaps found in the 2026-06-24 audit (`docs/audit/2026-06-24/FULL-PRODUCT-AUDIT.md`).
> We build **Critical → High → Medium → Low**. Each item has acceptance criteria and a status box. Update the box + "Log" when an item lands.
>
> Status legend: ⬜ not started · 🟦 in progress · ✅ done · ⏸️ blocked
>
> **Baseline correction (verified 2026-06-24):** `provider-clients.ts` executes **6 connector types for real** — jira, teams, github, email, slack, **custom_api/generic_rest (universal REST escape hatch)**. The remaining ~13 named registry connectors lack first-class executors, and the 12 `connector-gateway/src/connectors/` classes are built but unwired (duplication).

---

## CRITICAL

### C1 — Fail-closed connector execution (kill the silent simulator) ✅
**Problem:** With no `secretStore`, `connector-actions.ts` fell back to a simulator that returned `ok:true` for *any* action. Production could silently no-op while reporting success.
**Built:**
- New `failClosedProviderExecutor` — default fallback; returns honest `provider_unavailable` "action was NOT executed" error.
- Simulator renamed `simulateProviderExecutor`, **opt-in only** via `AF_CONNECTOR_SIMULATE=1` (tests/dev) or explicit injection. Production fails closed by default.
- Documented `AF_CONNECTOR_SIMULATE` in `.env.example`.
**Acceptance:**
- [x] No secretStore + no executor + flag off → honest failure, never fake success.
- [x] Simulator available via `AF_CONNECTOR_SIMULATE=1` / explicit injection.
- [x] `connector-actions.test.ts` green (53/53) incl. new `failClosedProviderExecutor` safety test.
**Files:** `apps/api-gateway/src/routes/connectors/connector-actions.ts`, `...connector-actions.test.ts`, `.env.example`

### C2 — First-class executors for high-demand named connectors ✅
**Problem:** gitlab/linear (and others) had no first-class executor; agent path only ran jira/teams/github/email/custom_api. Also discovered `slack` had an executor but was blocked by the route allowlist.
**Built:**
- `executeGitLab` (REST v4): create_pr→MR, merge_pr, list_prs, create_pr_comment/create_comment→MR note, read_task→issue; self-hosted `base_url` supported; Bearer auth.
- `executeLinear` (GraphQL): read_task, create_comment, update_status; raw `api_key` Authorization; PR actions correctly rejected as unsupported.
- Dispatch + health-probe branches (`probeGitLab`, `probeLinear`) added.
- Route unblocked: added slack/gitlab/linear to `ConnectorType`, `SUPPORTED_CONNECTORS`, `CONNECTOR_TOOL_ALIAS`, and `CREDENTIAL_VALIDATORS`. **Now 8 connector types execute through the agent path** (was effectively 5).
**Acceptance:**
- [x] gitlab + linear execute real API calls (URL/method/auth asserted via capturing fetcher).
- [x] 6 new executor tests; missing-field and error-path coverage.
- [x] `pnpm --filter @agentfarm/api-gateway typecheck` clean.
**Files:** `apps/api-gateway/src/lib/provider-clients.ts`, `...connector-actions.ts`, `...connector-actions.test.ts`

### C3 — Connector coverage guard test ✅
**Built:** `connector-coverage.test.ts` — iterates `CONNECTOR_REGISTRY` and asserts every advertised connector is categorized into exactly one of: `FIRST_CLASS` (real executor: jira, github, slack, teams, gitlab, linear), `GENERIC_REST_BACKED` (generic_rest*/generic_smtp), or `KNOWN_UNIMPLEMENTED` (12 connectors the UI must hide/disable). Adding/advertising a connector without categorizing it now fails CI.
**Acceptance:**
- [x] Guard test passes (3 tests); uncategorized connector breaks the build.
- [x] Documents exactly which 12 connectors are advertised-but-unrunnable (the C2/H-tier backlog).

### C6 — Self-describing Custom API connectors (OpenAPI → agent tool catalog) ✅
**Why:** The platform can't predict each customer's stack. Two universal paths exist: **MCP** (any MCP server, self-describing, agent auto-discovers) and **Custom API / generic REST** (any REST API). The custom_api executor could already call any `method`+`path`, but the agent had no way to *know* a customer's endpoints — so it wasn't autonomous. C6 makes Custom API self-describing like MCP.
**Built:**
- `openapi-catalog.ts` engine: `parseOpenApiToToolCatalog(spec)` → flat tool list (name, description, method, path template, path/query/required params, hasBody); `resolveOperation(tool, args)` → concrete `{ method, path, body }` (path-param substitution, query string, body split, fail-closed on missing required params). Pure + fully unit-tested (7 tests).
- Custom API executor now supports **operation mode**: agent passes `openapi_operation` + `args`, executor resolves via the engine (falls back to raw method/path for back-compat).
- Route `POST /v1/connectors/openapi/parse` — dashboard previews a spec → catalog; agent tool list source. Auth-gated.
**Acceptance:**
- [x] Any OpenAPI 3.x REST API → agent-usable tool catalog.
- [x] Operation invocation resolves path/query/body correctly; fails closed on missing params.
- [x] typecheck clean; 73/73 connector+engine tests pass.
**Follow-up (C6.2 ✅):** Done. `ConnectorAuthMetadata.openapiCatalog` column + migration; `PUT /v1/connectors/:id/openapi` persists the parsed catalog; `GET /v1/connectors/custom-api-catalog` (session OR service-token+`x-tenant-id`) serves it; agent-runtime `custom-api-catalog-client.ts` fetches + formats + injects `_custom_api_tool_catalog` into the planner payload (alongside `_mcp_tool_catalog`). The agent now auto-discovers Custom API ops without being handed the operation. Tests: 80 (76 gateway + 4 runtime), both typechecks clean.
**Recommended guidance:** For new integrations prefer **MCP** (fully autonomous today); use **Custom API + OpenAPI** when the customer has no MCP server. First-class connectors (jira/github/slack/teams/gitlab/linear) stay for the common, high-polish cases.
**Files:** `apps/api-gateway/src/lib/openapi-catalog.ts(+test)`, `...provider-clients.ts`, `...connector-actions.ts(+test)`, dashboard connector type/UI (`connector-config-panel.tsx`, `connectors-hub-client.tsx`, `connectors/page.tsx`).

### C4 — Task-pull source: tracker poller ✅
**Problem:** Intake is push-only (email/slack/webhook). No "agent picks assigned tickets."
**Built:**
- `trigger-service/src/sources/tracker-poller.ts` — pure per-tracker query fns `pollJira` (JQL `assignee=… AND statusCategory != Done`, Bearer), `pollLinear` (GraphQL assignee+open-state filter, raw Authorization), `pollGithub` (`/repos/owner/repo/issues?assignee=…`, Bearer, excludes PRs) → `NormalizedTicket[]`.
- `runTrackerPollSweep()` — loads enabled `TrackerPollSource`, respects per-source `intervalSec` cadence, resolves secret-backed token (`defaultCredentialResolver`: `env://` + literal; fail-closed on unresolvable `kv://`/vault refs), dedups against `TrackerPollDispatch`, dispatches new tickets to agent-runtime `/run-task`, advances cursor + records `lastError`. `startTrackerPollSweep()` wired into `main.ts` (60s interval, clean shutdown).
- DB: `TrackerPollSource` (per-tenant config + secretRef + cadence) + `TrackerPollDispatch` (unique `[sourceId, externalId]` dedup ledger, cascade-delete) + migration `20260625010000_add_tracker_poll_source`.
**Acceptance:**
- [x] Poller pulls assigned issues from 3 trackers (Jira/Linear/GitHub) and dispatches tasks.
- [x] Dedup — seen `externalId` never re-dispatched; unique constraint guards races; failed dispatch is NOT recorded (retried next sweep).
- [x] Per-tenant `TrackerPollSource` config + secret-backed credentials (fail-closed when token missing).
- [x] typecheck clean; 11 new tests (94/94 trigger-service tests green).
**Files:** `apps/trigger-service/src/sources/tracker-poller.ts(+test)`, `...main.ts`, `packages/db-schema/prisma/schema.prisma`, migration `20260625010000_add_tracker_poll_source`.
**Follow-up (C4.2 ✅) — management API + dashboard UIs:** Operators can now configure poll sources without touching the DB. `apps/api-gateway/.../tracker-poll-sources.ts` — tenant-scoped CRUD (`GET/POST /v1/tracker-poll-sources`, `PATCH/DELETE /:id`), role-gated (viewer read / operator write), validates tracker + custom spec + github owner/repo, masks the secret (`hasSecret` only, never returns the token), preserves the secret on PATCH-omit. 9 route tests. UI shipped in **both** dashboards: operator (`apps/dashboard/app/task-sources/`) and customer (`apps/website/app/dashboard/task-sources/`), each with its own proxy routes + sidebar link — add/enable-disable/delete sources, tracker dropdown, and a JSON editor for the custom field-map.
**Follow-up (C4.1 ✅) — universal poll source:** The 3 first-class adapters can't cover every customer's tracker (Asana/ClickUp/Azure DevOps/Shortcut/ServiceNow…). Added `tracker='custom'` driven by a `CustomPollSpec` (`customConfig` Json column + migration `20260625020000`): list endpoint (templated `{{assignee}}`/`{{projectFilter}}`/`{{baseUrl}}`, URL-encoded), pluggable auth (`bearer`/`token`/`raw`/`header`/`none`), optional POST body (GraphQL), and a dot-path field map (`itemsPath`/`idField`/`titleField`/`urlField`/`bodyField`/`idPrefix`) → `NormalizedTicket[]`. `pollCustom` + `getByPath` are pure/unit-tested; `auth='none'` sources poll without credentials, all others still fail-closed. **Any REST tracker now works without per-vendor code** — mirrors the C6 Custom API philosophy. 6 new tests (100/100 green), typecheck clean.

### C5 — Shift enforcement ✅
**Problem:** `AgentPersona.workingHours` is cosmetic — never read at runtime.
**Built:**
- `@agentfarm/shared-types/shift.ts` — pure, timezone-aware (IANA via `Intl`) shift engine: `isWithinShift`, `nextShiftStart`, `evaluateShift`, `normalizeWorkingHours`. Handles weekday filtering, overnight windows, DST; empty/invalid workingHours → always-on (back-compat). 13 unit tests.
- `trigger-service/src/shift-enforcer.ts` — `evaluateAgentShift(prisma, agentId)` loads persona timezone+workingHours (fail-open on lookup error), `deferTask()` persists a `DeferredTask`.
- Tracker poller now gates each source's agent once per sweep: off-shift tickets are parked as `DeferredTask(runAfter=nextShiftStart)` and still recorded for dedup (not re-polled, not dropped). Fixed a real C4 bug: `/run-task` parses `goal` as JSON, so the poller now packs the prompt into a JSON `goal` string.
- `trigger-service/src/deferred-task-sweep.ts` — releases due `DeferredTask`s to the runtime, durable across restarts (Postgres-backed), gives up after 5 attempts. Wired into `main.ts`.
- DB: `DeferredTask` model + migration `20260625030000`.
- API: `GET /v1/personas/:botId/availability` (api-gateway, session+tenant-scoped) → `{ available, nextWindowStart, timezone, workingHours }`.
**Acceptance:**
- [x] Task outside shift is deferred to next shift window (durable), not dropped — released automatically when the shift opens.
- [x] Availability status readable via API (`/v1/personas/:botId/availability`).
- [x] typecheck clean (shared-types, trigger-service, api-gateway); 18 new tests (13 shift + 5 sweep/poller), 105/105 trigger-service green.
**Files:** `packages/shared-types/src/shift.ts(+test)`, `apps/trigger-service/src/{shift-enforcer,deferred-task-sweep,sources/tracker-poller,main}.ts(+tests)`, `apps/api-gateway/src/routes/agents/personas.ts`, `schema.prisma`, migration `20260625030000_add_deferred_task`.

---

## HIGH

### H1 — VM lifecycle tied to shift ✅
Platform-driven (not external Logic App): the workspace VM powers on when any agent comes on-shift and **deallocates** (releases compute billing, keeps disk + private IP) when all agents are off-shift — the partner to C5.
**Built:**
- `azure-provisioning-steps.ts: setWorkspaceVmPower(rg, vm, 'running'|'deallocated')` via Azure SDK `beginStartAndWait`/`beginDeallocateAndWait`.
- `lib/shift-vm-reconciler.ts` — pure decision logic: desired ON if any persona within shift (reuses C5 `isWithinShift`; null workingHours = always-on; union across personas); diff vs current status → start/deallocate/none.
- `services/shift-vm-worker.ts` — 5-min sweep: DB join (WorkspaceVm + bots' personas) → reconciler → Azure power → persist status. Status only updated on a successful power call (fail-closed).
- Wired into `worker-manager.ts`, gated on `AZURE_SUBSCRIPTION_ID`.
**Acceptance:**
- [x] VM power follows persona shift (start at open, deallocate at close); timezone-aware.
- [x] Disk/IP preserved (deallocate, not delete) → state persists across stop/start.
- [x] 12 tests (reconciler + worker), api-gateway typecheck clean.
**Files:** `apps/api-gateway/src/lib/shift-vm-reconciler.ts(+test)`, `services/shift-vm-worker.ts(+test)`, `services/azure-provisioning-steps.ts`, `worker-manager.ts`.

### H2 — Org identity fields ✅
**Built:** `employeeId`, `department`, `managerId` on `AgentPersona` (migration `20260625040000`, applied). Threaded through `@agentfarm/shared-types` `AgentPersonaRecord` + the persona API (GET/POST/PATCH via a shared `toPersonaRecord` helper). New `GET /v1/personas/org-chart` returns every persona's org identity + a manager→reports tree (tenant-scoped, viewer-gated) — **org chart queryable**. Surfaced in the operator persona editor (`agent-persona-panel.tsx`): Employee ID / Department / Manager fields, loaded + saved.
**Acceptance:**
- [x] `employeeId`/`department`/`managerId` persisted + surfaced in UI.
- [x] Org chart queryable (`/v1/personas/org-chart` → nodes + roots + reports tree).
- [x] typecheck clean (gateway, dashboard, shared-types); 4 new tests, 1896/1896 gateway green.
**Files:** `schema.prisma` + migration `20260625040000_add_persona_org_identity`, `packages/shared-types/src/persona.ts`, `apps/api-gateway/src/routes/agents/personas.ts(+test)`, `apps/dashboard/app/components/agent-persona-panel.tsx`.

### H3 — Agent→agent collaboration workflow ✅
Recording a handoff was bookkeeping only — the target agent never got work and there was no message trail. Now `/v1/handoffs/initiate`, once the orchestrator records the handoff, **delivers** it.
**Built:**
- `lib/handoff-delivery.ts` — pure builder: from a handoff it derives (a) an `AgentMessage` (from→to, `HANDOFF_REQUEST`, reason + context) and (b) a follow-on task targeted at the recipient bot (handoff metadata + context merged into payload).
- `routes/agents/handoffs.ts` — after the orchestrator 2xx, writes the AgentMessage trail + enqueues the task (drain sweep → runtime `/tasks/intake`). Fire-safe; delivery outcome returned in the response. Side-effects injectable for tests.
**Acceptance:**
- [x] Handoff delivers a message trail + a real task to the target agent (Sales→Developer→Support chain works end-to-end).
- [x] No delivery when the orchestrator rejects; auth + workspace-scope enforced.
- [x] 8 handoff tests + 4 builder tests; typecheck clean.
**Files:** `apps/api-gateway/src/lib/handoff-delivery.ts(+test)`, `routes/agents/handoffs.ts(+test)`.

### H4 — MCP multi-step sequencing ✅
Implements the Phase-1 spec (`docs/superpowers/specs/2026-06-24-multi-step-mcp-tool-sequences-design.md`): an agent runs an ordered sequence of MCP tool calls against one server over a single **persistent session**, so server state (e.g. one browser) survives between steps — fixing the "navigate then read title → blank" blocker.
**Built:**
- `mcp-protocol-client.ts` — session lifecycle: `connect()` (initialize once, capture `mcp-session-id`, send `notifications/initialized`), session-id reused on every `callTool`, `close()` teardown.
- `mcp-registry-client.ts` — `invokeMcpSequence(url, headers, steps)`: one client, per-step transcript, stop-on-first-failure, overall time budget, session always closed.
- `local-workspace-executor.ts` — `mcp_tool_sequence` action (≤8 steps, validated) returning a readable per-step transcript.
- Risk: added to `MEDIUM_RISK_ACTIONS` (one approval for the whole sequence; high-risk step → policy floor still applies). Allowed for every role (`getAllowedActionsForRole`). `steps` sanitized in `llm-decision-adapter` (toolName+toolArgs only, bounded).
**Acceptance:**
- [x] Agent chains ≥2 MCP calls in one task over a shared session (proven: 2 calls reuse one `mcp-session-id`).
- [x] Mid-sequence failure stops + reports the failing step; session closed even on connect failure.
- [x] Single `mcp_tool_call` unchanged (regression: mcp-tool-catalog + decision-adapter tests green). 5 H4 tests; typecheck clean.
**Note:** live browser integration also requires the stdio bridge to run `supergateway --stateful` (spec §3.2) — code is complete; that's an operator/runner config flag. Phase 2 (adaptive per-step looping) remains deferred per the spec.
**Files:** `apps/agent-runtime/src/mcp-protocol-client.ts`, `mcp-registry-client.ts`, `local-workspace-executor.ts`, `domain/risk-policy.ts`, `runtime-server.ts`, `llm-decision-adapter.ts` + `mcp-sequence.test.ts`, `mcp-protocol-session.test.ts`.

### H5 — Finance agent role ❌ REMOVED (out of scope)
Not part of the product plan. It appeared only as an *example role* in the audit-request template and was mistakenly carried into this tracker. The actual roster has no Finance agent and never did; `erp-service` is an integration library (SAP/Oracle/Dynamics/NetSuite/Odoo adapters), not an agent. Dropped 2026-06-25 at user's direction. If a finance agent is ever wanted, follow CLAUDE.md "Adding RAG to a New Agent" + the erp-service adapters — a fresh product decision, not a gap.

### H6 — Reconcile execution-path vs managed connectors ✅
Verified the live connector execution path is `apps/api-gateway/src/lib/provider-clients.ts`. The `services/connector-gateway/src/connectors/*` classes (github/jira/gitlab/linear/slack/teams/email/notion/confluence/sentry/pagerduty/azure-devops) were **dead** — imported only by their own tests, never by any app, and connector-gateway is not a deployed service.
**Done:** deleted the entire `connector-gateway/src/connectors/` directory + its now-orphaned tests. The live, used parts of connector-gateway (adapter-registry, plugin-loader, pii-filter, mtls-verifier) remain.
**Acceptance:**
- [x] One connector execution path (provider-clients.ts); no duplicate classes.
- [x] connector-gateway typecheck clean; 36 tests green.

### H7 — Autonomy proof ✅
The autonomous loop + guardrails already existed and were tested (13 tests); the audit ask was a *proof + doc* of the safety controls, which were not explicitly asserted.
**Done:** `autonomous-loop-guardrails.test.ts` proves the runaway hard-cap clamp (1,000,000 requested → ≤25), always-terminal state, and a complete per-step audit trace. `docs/AUTONOMY-GUARDRAILS.md` documents all 9 controls (hard cap, terminal state, audit trace, cost-awareness, approval, kill-switch, budget, shift bounds) with file citations — layered defense across iterations/money/time/blast-radius.
**Acceptance:**
- [x] Guarded loop run proven end-to-end with auditable trace; 3 guardrail tests.
- [x] Guardrails doc published.

### H8 — Deploy action depth ✅
**Finding:** deploy actions were NOT shallow — `workspace_devops_k8s_deploy` runs real `kubectl apply` (with `--dry-run=client` support), `deploy_verify` polls real K8s readiness + HTTP health checks + auto-rollback, `tf_apply` runs real `terraform apply`. The audit's "unverified" was a verification gap, not missing capability.
**Done:** `devops-deploy-execution.test.ts` proves real execution via injected `runCommand` (asserts the exact `kubectl apply -f … -n …` command, dry-run flag, non-zero-exit failure surfacing, fail-closed when runCommand absent) and that deploy actions are HIGH-risk (approval-gated). No new deploy code manufactured — capability already real.
**Acceptance:**
- [x] Real deploy execution verified (kubectl/terraform), not planning-only.
- [x] HIGH-risk gating confirmed; 5 tests green.

---

## MEDIUM

### M1 — Connector secret onboarding UX ✅ (already addressed)
The "operator-hostile Key Vault refs" concern is already solved: `dashboard/app/components/connector-config-panel.tsx` shows a **typed per-connector credential form** (e.g. token/base_url fields with placeholders + help text) and POSTs to `/v1/connectors/:id/credentials`. The backend stores the value in the secret store (Key Vault) and persists only the `secretRefId` — the operator never sees or types a raw `kv://` ref. C2 already extended this form to slack/gitlab/linear. No rebuild needed.

### M2 — Expand managed MCP catalog ✅
Grew the managed catalog from 6 → **12** connectors: added gitlab, sentry, asana, postgres, google-drive, hubspot (each with required/optional fields, tool list, supported roles). Activatable from the setup wizard with just a token.
- [x] 4 catalog tests (well-formed entries, unique ids, new connectors discoverable, header mapping). typecheck clean.
**Files:** `apps/api-gateway/src/lib/managed-mcp-catalog.ts(+test)`.

### M3 — Agent→agent delegation ✅ (covered by H3)
Agent→agent task delivery already shipped in **H3**: a handoff writes an `AgentMessage` trail and enqueues a real follow-on task for the target agent (Sales→Developer→Support works end-to-end). The schema's `delegatedToUserId/By` is a separate, existing agent→**human** delegation feature. A "delegate-and-await-result" variant (delegator blocks on the delegate's output) is a thin future extension on the same infra — not a current gap.

### M4 — Shift calendar UX ✅ (already present)
Shift display + editing already exist: `website/app/dashboard/bots/page.tsx` renders "Works {shiftStart}–{shiftEnd} on {activeDays}", `website/app/admin/bots/page.tsx` has shiftStart/shiftEnd editors, `dashboard/app/scheduled-tasks/*` provides cron-task scheduling UX, and the personas API (`routes/agents/personas.ts`) supports `workingHours`/`timezone` via PATCH (consumed by C5/H1 enforcement). No new build needed.

### M5 — Task throughput/SLA load test + published numbers ✅
Closed the "scalability unproven" gap with measured evidence. `decision-load-test.ts` benchmarks the per-task hot path (`buildDecision`: normalize + score + classify + route) — **~2.1–2.9M decisions/sec, p99 ≤ 0.0007 ms** single-core. Published in `docs/SCALABILITY-BENCHMARKS.md` with methodology + an honest map of the real downstream limits (LLM latency, approvals, DB, connectors) and the next-step full-stack HTTP load test. A regression-guard test enforces a ≥100k/sec floor in CI.
**Files:** `apps/agent-runtime/src/decision-load-test.ts(+test)`, `docs/SCALABILITY-BENCHMARKS.md`.

---

## LOW

### L1 — Per-agent inbound mailbox wiring (persona.emailAddress) ✅
Inbound email now routes to the agent whose persona mailbox matches the recipient (mail to `recruiter@acme.com` → the recruiter agent), instead of always LLM-guessing or hitting the tenant default.
**Built:** capture the `To` address in `email-trigger.ts`; new `recipient?` on the trigger event; pure `matchAgentByEmail()` + `normalizeEmail()` resolver in `trigger-router.ts` consulted as a deterministic fast-path before the LLM/default; `AgentConfig.email` config field.
- [x] 5 tests (normalize, match, no-match, router fast-path, fallback). trigger-service 110 tests green; typecheck clean.
**Files:** `apps/trigger-service/src/{types.ts, trigger-router.ts, trigger-engine.ts, sources/email-trigger.ts}` + `trigger-router-email.test.ts`.

### L2 — Collaboration audit (`AgentMessage`) operator visualization ✅ (already present)
Already built: `dashboard/app/components/agent-messages-panel.tsx` (651 lines), `handoffs-panel.tsx` (431 lines), `dashboard/app/handoffs/page.tsx`, and the message API proxy routes (`api/agents/[botId]/messages{,/sent,/[id]/reply}`). Operators can view/initiate handoffs and inspect the agent-to-agent message trail (including H3's `HANDOFF_REQUEST` messages). No new build needed.

### L3 — Repo hygiene ✅
Untracked the locked dev DB `apps/website/.auth.sqlite{,-shm,-wal}` and the scratch files `read.md`, `routes_raw.txt` (`git rm --cached`); added gitignore patterns for all of them so they can't return. Root build logs + `cloudflared.exe` were already gitignored (`*.log`, `cloudflared.exe`) and untracked.
- [x] `.auth.sqlite` no longer tracked (also fixes the recurring merge-block from the locked file).

### L4 — Refresh doc counts ✅
Updated stale figures to verified reality (2026-06-25): **109 models** (was 105/70), **58 migrations** (was 44) in `CLAUDE.md`, `README.md` (×2), and `docs/README.md`.

---

## Change Log
| Date | Item | Result |
|---|---|---|
| 2026-06-24 | Plan created | Tracker initialized from 2026-06-24 audit |
| 2026-06-24 | C1 done | Connector execution now fails closed; simulator opt-in via AF_CONNECTOR_SIMULATE; 53/53 tests green |
| 2026-06-24 | C2 done | Real GitLab + Linear executors; slack route unblocked; 8 connector types now execute; typecheck clean |
| 2026-06-24 | C3 done | Connector coverage guard test; 12 unrunnable connectors explicitly catalogued; CI fails on uncategorized connector |
| 2026-06-25 | C6 done | OpenAPI→tool-catalog engine + operation-mode custom_api executor + parse route; dashboard connector types/UI extended (slack/gitlab/linear); MCP set as recommended universal path; 73/73 tests, both typechecks clean |
| 2026-06-25 | C6.2 done | Persist OpenAPI catalog (migration + PUT/GET routes) + agent-runtime auto-injection (`_custom_api_tool_catalog`); Custom API now fully autonomous like MCP; 80 tests green |
| 2026-06-25 | H1 done | Shift-driven VM power (start at shift open / deallocate at close); pure reconciler + worker + Azure power op; gated on AZURE_SUBSCRIPTION_ID; 12 tests, typecheck clean |
| 2026-06-25 | H3 done | Handoff delivery: AgentMessage trail + follow-on task to target agent (Sales→Dev→Support works end-to-end); fire-safe; 12 tests |
| 2026-06-25 | H4 done | MCP multi-step sequences over one persistent session (connect/session-id/close); mcp_tool_sequence action, MEDIUM risk, one approval; 5 tests; needs supergateway --stateful for live browser |
| 2026-06-25 | H5 dropped | Finance agent out of scope (not in product plan) |
| 2026-06-25 | H6 done | Deleted dead connector-gateway/connectors/* duplicate; single execution path = provider-clients.ts; 36 tests green |
| 2026-06-25 | H7 done | Autonomy guardrail proof (hard-cap clamp, terminal state, audit trace) + AUTONOMY-GUARDRAILS.md; 3 tests |
| 2026-06-25 | H8 done | Verified real deploy execution (kubectl apply/terraform apply), HIGH-risk gated; 5 tests. Capability already real — verification gap closed |
| 2026-06-25 | MEDIUM done | M2 catalog 6→12 (+gitlab/sentry/asana/postgres/google-drive/hubspot, 4 tests); M5 decision-path benchmark ~2.1–2.9M/sec + SCALABILITY-BENCHMARKS.md + CI floor guard. M1/M3/M4 verified already-covered (credential form / H3 handoff / existing shift UI) — no rebuild |
| 2026-06-25 | LOW done | L1 per-agent inbound mail routing (recipient→persona match, 5 tests); L3 untrack .auth.sqlite + scratch files + gitignore; L4 refresh doc counts (109 models/58 migrations). L2 verified already-covered (agent-messages + handoffs panels). ALL TIERS COMPLETE. |
| 2026-06-25 | C4 done | Tracker poller (Jira/Linear/GitHub) pulls assigned tickets → /run-task; per-tenant TrackerPollSource config, secret-backed creds (fail-closed), TrackerPollDispatch dedup ledger + migration; cadence-gated sweep wired into main.ts; 11 tests, 94/94 green, typecheck clean |
| 2026-06-25 | C4.1 done | Universal `tracker='custom'` poll source (CustomPollSpec: templated list endpoint, pluggable auth incl. none, dot-path field map) → any REST tracker without per-vendor code; customConfig Json column + migration; 6 tests, 100/100 green, typecheck clean |
| 2026-06-25 | C5 done | Shift enforcement: pure timezone-aware shift engine (shared-types/shift.ts); off-shift tasks parked as DeferredTask + released at next shift open (durable); availability API; fixed C4 run-task goal-JSON bug; DeferredTask migration; 18 tests, 105/105 green, 3 typechecks clean |
| 2026-06-25 | C4.2 done | Poll-source management API (tenant-scoped CRUD, role-gated, secret-masked; 9 tests) + config UIs in both operator (apps/dashboard) and customer (apps/website) dashboards with proxy routes + sidebar links; all typechecks clean |
