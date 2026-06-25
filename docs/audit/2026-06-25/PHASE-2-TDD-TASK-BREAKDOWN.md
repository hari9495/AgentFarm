# Phase 2 — TDD Task Breakdown (Data-Driven RBAC)

**Date:** 2026-06-25
**Source plan:** `GOVERNANCE-POLICY-ENGINE-IMPLEMENTATION-PLAN.md` (Phase 2)
**Design spec:** `docs/superpowers/specs/2026-06-25-phase2-data-driven-rbac-design.md`
**Method:** TDD — failing test first, minimum code to pass, refactor. `node:test` + `node:assert/strict`.

**Phase 2 goal:** Hard-block role enforcement applies to all 14 roles (not just `developer`), with each role's block-list derived structurally from the existing allow-lists and tightenable by a customer `GovernancePolicy(scope=role)`. No customer policy ⇒ developer behavior byte-identical to today.

**Definition of done:**
- [ ] `role-action-registry.ts` derives per-role blocklists from `ROLE_PROFILES`; developer ⊇ legacy set; no self-block.
- [ ] `enforceRole` hard-blocks for all roles (the `=== 'developer'` gate removed).
- [ ] `getActiveRolePolicy` reads `scope=role` overlay, tenant-scoped, fail-safe.
- [ ] Overlay can only tighten (union); existing role-enforcer + auth-regression suites pass unchanged.

---

## Task group A — Role-action registry

**A1. Ownership map** — `role-action-registry.test.ts`
- Test: `ACTION_OWNERS` maps a known recruiter action (e.g. `create_job_posting`) to `{recruiter}`; a co-owned/generic action is owned by ≥1 role or none accordingly.
- Code: build `Map<string, Set<RoleKey>>` from `ROLE_PROFILES[*].allowedActions`.

**A2. `getBlockedActionsForRole`**
- Test: for `recruiter`, a developer-owned action is blocked; recruiter's own action is not; a generic unowned action (`workspace_subagent_spawn`) is not blocked.
- Test: `getBlockedActionsForRole('developer')` is a **superset** of legacy `DEVELOPER_BLOCKED_ACTIONS`.
- Test: no role blocks any action in its own `allowedActions` (loop all 14 — no self-block).
- Code: owner-set excludes role ⇒ blocked; union legacy developer set.

**A3. `getSuggestedRoleForAction`**
- Test: a recruiter-owned action suggests `recruiter`; an unowned action → null.
- Code: first owner from `ACTION_OWNERS`.

---

## Task group B — Role policy store

**B1. Read active role overlay** — `role-policy-store.test.ts`
- Test: with a mocked prisma returning a `scope=role` active row, `getActiveRolePolicy` returns `{ blockedActions }` parsed from `rulesJson`; highest version wins; missing row → null.
- Test: prisma throws → null (fail-safe).
- Test: malformed `rulesJson` (no `blockedActions` array) → `{ blockedActions: [] }` or null (defensive).
- Code: tenant-scoped query, defensive parse.

---

## Task group C — Enforcer integration

**C1. Remove developer gate** — extend `role-enforcer.test.ts`
- Test (regression of the gate): a `recruiter` task whose `action_type` is a developer-owned action is hard-blocked with `declineCode: 'action_blocked'`.
- Test: existing developer hard-block cases still decline identically.
- Code: replace `roleKey === 'developer' && DEVELOPER_BLOCKED_ACTIONS.has(...)` with `getBlockedActionsForRole(roleKey).has(...)`.

**C2. Overlay tighten-only**
- Test: `enforceRole(task, 'sales_rep', { blockedActionsOverride: new Set(['send_email']) })` blocks `send_email` even though code registry allows it.
- Test: an override that omits a code-registry block does NOT un-block it (union semantics).
- Code: `EnforceRoleOptions.blockedActionsOverride`; effective = registry ∪ override.

**C3. Suggested-role fallback**
- Test: a blocked foreign action populates `suggestedRole` via registry when no keyword match exists.
- Code: `resolveSuggestedRole` → registry then keyword map.

---

## Task group D — Runtime wiring + acceptance

**D1. Wire overlay load in `processOneTask`**
- Test: integration in `runtime-server.test.ts` — task for a tenant with a `scope=role` overlay adding a block is declined; without overlay it proceeds past hard-block.
- Code: best-effort `getActiveRolePolicy(prisma, config.tenantId, config.roleKey)` → pass as `blockedActionsOverride`; DB error → no override.

**D2. No-regression gate**
- Test: full `role-enforcer` + `auth-regression` suites pass unchanged; `pnpm --filter @agentfarm/agent-runtime test` green.

---

## Suggested execution order

1. A1 → A2 → A3 (registry; everything depends on it)
2. B1 (store)
3. C1 → C2 → C3 (enforcer)
4. D1 → D2 (wiring + regression gate)

Each task = one red→green→refactor cycle / commit.

---

## Out of scope (later phases)

- Verb-level MCP/connector ACLs (Phase 3); webhook/env/time (Phase 4); doc parsing (Phase 5); store durability (Phase 6).
- Dashboard authoring UI for `scope=role` policies (follow-up).
