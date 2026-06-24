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

### C4 — Task-pull source: tracker poller ⬜
**Problem:** Intake is push-only (email/slack/webhook). No "agent picks assigned tickets."
**Build:** New `trigger-service/src/sources/tracker-poller.ts` — polls Jira/Linear/GitHub Issues for tickets assigned to the agent's persona, dispatches each as a task. Cron-driven via existing scheduler.
**Acceptance:**
- [ ] Poller pulls assigned issues from ≥1 tracker and dispatches tasks.
- [ ] Dedup (no double-dispatch of same ticket).
- [ ] Per-tenant config + secret-backed credentials.

### C5 — Shift enforcement ⬜
**Problem:** `AgentPersona.workingHours` is cosmetic — never read at runtime.
**Build:** A shift gate consulted before task execution (timezone + workingHours) → defer/queue tasks outside shift; surface `availability` status.
**Acceptance:**
- [ ] Task outside shift is deferred to next shift window, not dropped.
- [ ] Availability status readable via API.

---

## HIGH

### H1 — VM lifecycle tied to shift ⬜
Start workspace VM at shift start, deallocate at shift end (platform-driven, not external Logic App). Acceptance: VM power state follows persona shift; state persists across stop/start.

### H2 — Org identity fields ⬜
Add `employeeId`, `department`, `managerId` to `AgentPersona`/`Bot` + migration + surface in UI. Acceptance: org chart queryable.

### H3 — Agent→agent collaboration workflow (proof) ⬜
Wire one end-to-end multi-agent handoff via orchestrator (`agent-handoff-manager.ts`). Acceptance: Sales→Developer→Support chain demoed with `AgentMessage` trail.

### H4 — MCP multi-step sequencing ⬜
Implement the `bc21f3fc` design spec. Acceptance: agent chains ≥2 MCP tool calls in one task.

### H5 — Finance agent role ⬜
Create finance role (profile, handler, RAG, lessons) over `erp-service`. Acceptance: registered + invoice/reconciliation actions.

### H6 — Reconcile execution-path vs managed connectors ⬜
Single connector abstraction; delete the duplicate. Acceptance: one code path, no dead classes.

### H7 — Autonomy proof ⬜
Demonstrate one guarded autonomous loop run end-to-end with audit. Acceptance: recorded run + guardrails doc.

### H8 — Deploy action depth ⬜
Verify/finish real deploy execution (Azure/k8s) beyond planning. Acceptance: one real deploy through the agent.

---

## MEDIUM

### M1 — Connector secret onboarding UX ⬜ (Key Vault refs are operator-hostile)
### M2 — Expand managed MCP catalog beyond 8 ⬜
### M3 — Agent→agent delegation (not just agent→human) ⬜
### M4 — Shift calendar UX over `ScheduledJob` ⬜
### M5 — Task throughput/SLA load test + published numbers ⬜

---

## LOW

### L1 — Per-agent inbound mailbox wiring (persona.emailAddress) ⬜
### L2 — Collaboration audit (`AgentMessage`) operator visualization ⬜
### L3 — Repo hygiene: remove build logs, cloudflared.exe, scratch files, untrack .auth.sqlite ⬜
### L4 — Refresh CLAUDE.md/README counts (106 models, 109 routes, 54 migrations) ⬜

---

## Change Log
| Date | Item | Result |
|---|---|---|
| 2026-06-24 | Plan created | Tracker initialized from 2026-06-24 audit |
| 2026-06-24 | C1 done | Connector execution now fails closed; simulator opt-in via AF_CONNECTOR_SIMULATE; 53/53 tests green |
| 2026-06-24 | C2 done | Real GitLab + Linear executors; slack route unblocked; 8 connector types now execute; typecheck clean |
| 2026-06-24 | C3 done | Connector coverage guard test; 12 unrunnable connectors explicitly catalogued; CI fails on uncategorized connector |
