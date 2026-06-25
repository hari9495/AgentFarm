# Phase 4 — TDD Task Breakdown (env / time / webhook-domain governance)

**Spec:** `docs/superpowers/specs/2026-06-26-phase4-env-time-webhook-governance-design.md`
**Method:** TDD — failing test first. `node:test`.

## A. Time-window evaluator — `time-window.test.ts` (riskiest, do first)
- A1: now inside a same-day window (09:00–17:00) → within; outside → not.
- A2: overnight window (22:00–06:00) wraps midnight: 23:30 within, 12:00 not.
- A3: day-of-week filter honored in the target tz.
- A4: tz boundary — a UTC instant that is a different local day/hour resolves in `tz`.
- A5: unknown/invalid tz → falls back to UTC (no throw).
- A6: `isTimeDenied` — rule denies when now is OUTSIDE window; no `timeWindow` → not denied.

## B. Env + rules loader/matchers — `action-governance.test.ts`
- B1: `isEnvDenied` matches a deny rule with env==='production' when ctx.env==='production'; no match when env differs or rule has no env.
- B2: actionType/connector scoping — unscoped rule matches any; scoped matches only its target.
- B3: `getActiveGovernanceRules` merges tenant+role active rules; fail-safe `[]` on error/no DB.
- B4: `isActionTimeDenied` integrates time-window matching with action scoping.

## C. Runtime enforcement — wire in processOneTask
- C1: a task with payload.environment='production' + a prod-deny rule → blocked policy_violation.
- C2: outside-hours rule blocks; within-hours allows.
- C3: no env/time rules → task proceeds (regression). (Verified live + via runtime-server suite.)

## D. Webhook domain — `webhook-domain-policy.test.ts` (api-gateway)
- D1: deny-list blocks a listed domain; allows others.
- D2: allow-list mode (any allow rule present) blocks unlisted; allows listed.
- D3: suffix match — '.example.com' matches 'a.example.com'.
- D4: SSRF precedence — a private host is rejected by the SSRF floor even if domain-allowed.
- D5: getWebhookDomainPolicy reads tenant active policy; fail-safe empty.

## E. api + UI
- E1: `policy.ts` POST accepts envRules/timeRules/webhookDomains → combined document; tests + 401s.
- E2: GovernancePolicyPanel sections (env & time, webhook domains); proxy unchanged; preview e2e.

## Order
A → B → C (enforcement) → D (webhook) → E (api+UI). Live-verify env/time merge against
real Postgres + webhook domain block; UI in dashboard preview.
