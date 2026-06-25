# Phase 4 — Environment / Time / Webhook-Domain Governance (Design Spec)

**Date:** 2026-06-26
**Source plan:** `docs/audit/2026-06-25/GOVERNANCE-POLICY-ENGINE-IMPLEMENTATION-PLAN.md` (Phase 4)
**Depends on:** Phases 1–3 (shipped). Reuses `GovernancePolicy` + the direct-read enforcement pattern.

## Goal

Three independent sub-features, all authored into the same unified policy document
and evaluated by the **direct-read** path (consistent with Phases 2–3; not OPA):

1. **Environment restrictions** — deny an action/connector in a given `env`
   (e.g. block prod actions for a staging-only customer).
2. **Time-window restrictions** — restrict actions to working hours; deny outside.
3. **Webhook domain allow/deny** — per-tenant outbound webhook domain policy,
   layered on the non-negotiable SSRF floor.

## Why direct-read (not OPA)

Everything shipped (role blocklists, connector rules) is enforced by reading the
active policy document directly from Postgres. env/time rules live in that SAME
document, so they must be evaluated by the same engine — otherwise one rule in a
document is OPA-evaluated and its neighbour is direct-read. One coherent path,
one test surface.

## Rule model (extend `GovernanceRule`, no migration)

- **env**: `env?` already exists. `{ actionType?|connector?, env:'production', effect:'deny' }`
  denies only when the task env matches.
- **time**: add `timeWindow?: { days?: number[]; start: 'HH:MM'; end: 'HH:MM'; tz?: string }`.
  The window is the **allowed** hours; the `deny` fires when "now" is **outside** it.
  `days` = 0–6 (Sun–Sat, in `tz`), default all days. `tz` via `Intl`, default `'UTC'`.
  Overnight windows (start > end, e.g. 22:00–06:00) wrap past midnight.
- **webhook domain**: `{ connector:'webhook', domain, effect:'deny'|'allow' }`. If ANY
  `allow` webhook rule exists for the tenant → **allow-list mode** (only listed domains
  permitted); else deny-list mode (listed domains blocked). SSRF floor always applies first.

## Components

### A. `time-window.ts` (new, agent-runtime) — the risky bit, TDD-first
- `isWithinWindow(window, now): boolean` — tz-aware; handles overnight wrap + day-of-week
  in the target tz. Pure.
- `isTimeDenied(rule, now): boolean` — rule has `timeWindow` and now is OUTSIDE it.

### B. `action-governance.ts` (new, agent-runtime)
- `getActiveGovernanceRules(prisma, tenant, role): GovernanceRule[]` — merged tenant+role
  active-policy rules (cached-prisma runtime entry, fail-safe `[]`).
- `isEnvDenied(rules, { actionType, connector, env }): rule | null` — a deny rule whose
  `env` matches the task env and whose actionType/connector matches (or is unscoped).
- `isActionTimeDenied(rules, { actionType, connector, now }): rule | null`.

### C. Enforcement — `processOneTask` (runtime-server)
- After role enforcement, before execution: read `env = payload.environment`, `now = new Date()`.
- If `isEnvDenied` or `isActionTimeDenied` matches the decided `actionType` (and connector
  when present) → block: failed `policy_violation`, emit `runtime.action_env_time_blocked`,
  persist. Tighten-only; fail-safe (no rules → proceed).

### D. Webhook domain — api-gateway
- `webhook-domain-policy.ts`: `getWebhookDomainPolicy(prisma, tenant)` → `{ mode:'allow'|'deny',
  denied:Set<domain>, allowed:Set<domain> }`. `isWebhookDomainDenied(policy, url)` — extract
  hostname; allow-list mode: deny if host not in allowed; deny-list: deny if host in denied.
  Domain match = exact host or suffix (`.example.com` matches `a.example.com`).
- Enforce in `outbound-webhooks` create AND `webhook-dispatcher` dispatch, **after** the SSRF
  check (SSRF rejects first, unconditionally).

### E. UI — extend `GovernancePolicyPanel`
- "Environment & time" section: deny action/connector in env X; restrict to working hours
  (days, start, end, tz).
- "Webhook domains" section: mode (allow-list | deny-list) + domain list.
- Same unified document; api `policy.ts` POST extended to accept `envRules`, `timeRules`,
  `webhookDomains`.

## Invariants

1. **SSRF floor never loosened** — webhook allow-list only further restricts.
2. Tighten-only; fail-safe → no extra restriction; unknown tz → UTC.
3. env rule matches only when the task carries `environment` (targeted, not universal).
4. No `tenantId` from request body.

## Testing (TDD)

- **A (time):** within/outside window; overnight wrap; day-of-week in tz; tz boundary
  (e.g. 23:00 UTC = next-day local); unknown tz → UTC; missing window → not denied.
- **B (env/rules):** env match vs mismatch; actionType/connector scoping; merge tenant+role;
  fail-safe `[]`.
- **C:** task in denied env blocked; outside-hours blocked; allowed env/time proceeds (regression).
- **D (webhook):** deny-list blocks listed; allow-list blocks unlisted; SSRF still rejects a
  private host even if domain-allowed; suffix match.
- **E:** route accepts new rule types; panel round-trips; 401s. Live verify like Phases 2-3.

## Out of scope (later)

- Phase 5 (policy-doc upload→parse), Phase 6 (durability/audit/export).
- Per-workspace/agent env defaults; budget-time interplay.
