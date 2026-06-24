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

### C2 — First-class executors for high-demand named connectors ⬜
**Problem:** asana, gitlab, linear, clickup, trello, monday, gmail, outlook have no first-class executor; the rich `connector-gateway` classes (azure-devops, confluence, gitlab, linear, notion, pagerduty, sentry) are unwired.
**Build:** Wire `connector-gateway` connector classes into `provider-clients.ts` dispatch (or map to `generic_rest` with per-connector request templates). Start with: **gitlab, linear** (classes already exist).
**Acceptance:**
- [ ] gitlab + linear execute real API calls through the agent path.
- [ ] Integration test per connector (mocked fetch).

### C3 — Connector coverage guard test ⬜
**Build:** A test that iterates `CONNECTOR_REGISTRY` and asserts every entry either (a) has a real executor branch, or (b) is explicitly flagged `executor: 'generic_rest'`. Fails CI if a connector is advertised but unrunnable.
**Acceptance:**
- [ ] Test exists and passes; advertising a dead connector breaks the build.

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
