# Phase 2 — Data-Driven RBAC (Design Spec)

**Date:** 2026-06-25
**Source plan:** `docs/audit/2026-06-25/GOVERNANCE-POLICY-ENGINE-IMPLEMENTATION-PLAN.md` (Phase 2)
**Depends on:** Phase 1 (shipped & live) — `GovernancePolicy` model, `PolicyDocument`, OPA evaluator, runtime `policyEvaluateFn`.

## Goal

Make role enforcement (RBAC) data-driven and applied to **all** roles, not just `developer`. Today:

- `role-enforcer.ts:102` hard-gates the action-blocklist phase on `roleKey === 'developer'`. The other 13 roles get only the semantic soft-block.
- Only `developer-role-profile.ts` defines a `*_BLOCKED_ACTIONS` set. Other roles have an allow-list (`ROLE_PROFILES[x].allowedActions`) but no authored block-list.

Phase 2 extends hard-block enforcement to every role, sourcing each role's block-list structurally from the allow-lists that already exist, and lets a customer `GovernancePolicy(scope=role)` **tighten** (never loosen) it.

## Guiding principle

Customer policy *overrides by tightening only*. Absence of a customer policy must never weaken current safety, and must keep existing `developer` behavior byte-identical (fail-closed, superset guarantee).

## Architecture

```
ROLE_PROFILES[*].allowedActions
        │  (built once at module load)
        ▼
ACTION_OWNERS: Map<actionType, Set<RoleKey>>   ── role-action-registry.ts
        │
        ├─ getBlockedActionsForRole(roleKey)  = actions owned by OTHER roles only
        │                                       (∪ legacy DEVELOPER_BLOCKED_ACTIONS)
        └─ getSuggestedRoleForAction(action)  = first owning role

GovernancePolicy(scope=role, scopeRef=roleKey, status=active)
        │  getActiveRolePolicy(prisma, tenantId, roleKey)  ── role-policy-store.ts
        ▼
   RoleRuleOverlay { blockedActions: string[] }   (fail-safe → null)

enforceRole(task, roleKey, { blockedActionsOverride })   ── role-enforcer.ts
   effective blocklist = getBlockedActionsForRole(roleKey) ∪ override   (union = tighten-only)
```

## Components

### 1. `apps/agent-runtime/src/role-action-registry.ts` (new)

- `ACTION_OWNERS: Map<string, Set<RoleKey>>` — built from every `ROLE_PROFILES[role].allowedActions`.
- `getBlockedActionsForRole(roleKey: RoleKey): ReadonlySet<string>` — every action whose owner-set is non-empty **and excludes** `roleKey`. Actions owned by nobody (generic — `code_edit`, `workspace_subagent_spawn`, etc.) or co-owned by this role are **never** blocked. For `developer`, the result is union-ed with the legacy `DEVELOPER_BLOCKED_ACTIONS` set so today's curated behavior is a guaranteed subset.
- `getSuggestedRoleForAction(actionType: string): RoleKey | null` — first owner in `ACTION_OWNERS`, generalizing the marketplace upsell beyond developer.
- Pure, no I/O. Computed lazily/memoized at first use.

### 2. `apps/agent-runtime/src/role-policy-store.ts` (new)

- `getActiveRolePolicy(prisma, tenantId, roleKey): Promise<RoleRuleOverlay | null>`
  - Query `GovernancePolicy` where `scope='role'`, `scopeRef=roleKey`, `status='active'`, order by `version desc`, take first.
  - Parse `rulesJson` → `{ blockedActions: string[] }` (extensible later for allow-list tightening / approval thresholds).
  - **Tenant-scoped** from caller's session/config — never from request body.
  - Fail-safe: any error or missing row → `null` (fall back to code registry; never weakens).
- `RoleRuleOverlay` shape lives in `@agentfarm/shared-types` (or local type if not cross-package).

### 3. `apps/agent-runtime/src/role-enforcer.ts` (modify)

- **Remove** the `roleKey === 'developer'` gate (line 102). The hard-block phase runs for all roles using `getBlockedActionsForRole(roleKey)`.
- `EnforceRoleOptions` gains `blockedActionsOverride?: ReadonlySet<string>`. Effective blocklist = `getBlockedActionsForRole(roleKey) ∪ override`. **Union only** — no code path removes a code-registry block.
- `resolveSuggestedRole` falls back to `getSuggestedRoleForAction` (registry), then the existing keyword `SUGGEST_ROLE_FOR_BLOCKED` for description matches.

### 4. `apps/agent-runtime/src/runtime-server.ts` (wire)

- In `processOneTask`, before `enforceRole(task, config.roleKey)`, best-effort load the overlay via `getActiveRolePolicy(prisma, config.tenantId, config.roleKey)` and pass `blockedActions` as `blockedActionsOverride`.
- Prisma absent / DB error → no override (code registry stands). Mirrors Phase 1's `getPolicyEvaluateFn` degradation.

## Invariants

1. No customer role policy → behavior = code registry; for `developer` that's a **superset** of today (union) → regression test asserts byte-identical developer declines.
2. Customer role policy can only **add** blocks (union), never remove.
3. No `tenantId` from request body — always from runtime config / session, scoped DB queries.
4. Evaluator/DB failure → no weakening (fail toward the code registry).

## Testing (TDD — red→green→refactor per task)

- **Registry:** ownership-map correctness; `getBlockedActionsForRole('developer')` ⊇ legacy `DEVELOPER_BLOCKED_ACTIONS`; no role is blocked from its own `allowedActions` (no self-block); generic shared actions are never blocked.
- **Per-role:** each of the 14 roles hard-blocks an action owned by another role and allows one of its own.
- **Enforcer:** a non-developer role (e.g. `recruiter`) now hard-blocks a foreign action — proves the old gate is gone.
- **Overlay:** a customer overlay adds a block; an overlay cannot un-block a code-registry entry.
- **No-regression:** existing `role-enforcer` + `auth-regression` suites pass unchanged.

## Out of scope (later phases)

- Verb-level MCP/connector ACLs (Phase 3).
- Webhook/env/time policy (Phase 4).
- Policy-document parse → role rules (Phase 5).
- Moving in-memory governance/budget stores to Postgres (Phase 6).
- Dashboard UI for authoring `scope=role` policies (follow-up; Phase 2 is runtime enforcement of policies that exist).

## Risks / watch-items

- **Shared actions across roles** (e.g. devops + developer both own a git/deploy action) → owner-set includes both → not blocked for either. Verified safe by the no-self-block + per-role tests.
- **agent-runtime is a pre-built image** — runtime changes require rebuild + force-recreate (separate commands) to take effect in Docker.
- **rulesJson schema drift** — keep the overlay parser defensive (ignore unknown keys, validate `blockedActions` is `string[]`).
