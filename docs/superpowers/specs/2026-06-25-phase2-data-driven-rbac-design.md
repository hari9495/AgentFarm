# Phase 2 — Data-Driven RBAC (Design Spec)

**Date:** 2026-06-25
**Source plan:** `docs/audit/2026-06-25/GOVERNANCE-POLICY-ENGINE-IMPLEMENTATION-PLAN.md` (Phase 2)
**Depends on:** Phase 1 (shipped & live) — `GovernancePolicy` model, `PolicyDocument`, OPA evaluator, runtime `policyEvaluateFn`.

## Goal

Make role enforcement (RBAC) data-driven and applied to **all** roles, not just `developer`, unifying the three overlapping block-list mechanisms that exist today, and letting a customer `GovernancePolicy(scope=role)` **tighten** (never loosen) the result.

### Current reality (verified 2026-06-25)

Blocked-action data already exists for almost all roles, in three inconsistent, partially-wired mechanisms:

| Mechanism | Location | Coverage | Wired |
|---|---|---|---|
| `enforceRole` Set check | `role-enforcer.ts:102` | `developer` only (gated on `=== 'developer'`) | yes |
| `is<Role>BlockedAction` helpers | `runtime-server.ts:1007-1030`, called at `3226/3242/3258/3928` | `tester`, `technical_writer`, `content_writer` | yes (ad-hoc if-ladder) |
| `*_ROLE_BLOCKED_ACTIONS` arrays | `*-agent-profile.ts` | 11 roles | mostly **un**wired |
| `*_BLOCKED_ACTIONS` Sets | `*-role-profile.ts` | 8 roles (overlap above) | only developer |

The hard-block vocabulary is the **domain action_type** vocabulary (`create_job_posting`, `find_leads`, `workspace_mob_*`) — NOT the `workspace_*`/`code_*` `LocalWorkspaceActionType` vocabulary in `allowedActions`. So blocklists must be sourced from the curated `*_ROLE_BLOCKED_ACTIONS` sets, **not** derived from `allowedActions`.

Phase 2 aggregates the existing curated per-role blocklists into one registry, routes all 14 roles through a single lookup (removing the developer special-case and the 3-role if-ladder), and adds the tenant `scope=role` overlay.

## Guiding principle

Customer policy *overrides by tightening only*. Absence of a customer policy must never weaken current safety, and must keep existing `developer` behavior byte-identical (fail-closed, superset guarantee).

## Architecture

```
curated *_ROLE_BLOCKED_ACTIONS (arrays, 11 roles)  +  *_BLOCKED_ACTIONS (sets, 8 roles)
        │  (aggregated once at module load, per-role union)
        ▼
BLOCKED_ACTIONS_BY_ROLE: Record<RoleKey, ReadonlySet<string>>   ── role-action-registry.ts
        │
        └─ getBlockedActionsForRole(roleKey): ReadonlySet<string>

GovernancePolicy(scope=role, scopeRef=roleKey, status=active)
        │  getActiveRolePolicy(prisma, tenantId, roleKey)  ── role-policy-store.ts
        ▼
   RoleRuleOverlay { blockedActions: string[] }   (fail-safe → null)

enforceRole(task, roleKey, { blockedActionsOverride })   ── role-enforcer.ts (all 14 roles)
   effective blocklist = getBlockedActionsForRole(roleKey) ∪ override   (union = tighten-only)
```

## Components

### 1. `apps/agent-runtime/src/role-action-registry.ts` (new)

- `BLOCKED_ACTIONS_BY_ROLE: Record<RoleKey, ReadonlySet<string>>` — aggregates each role's existing curated blocklist: the `*_ROLE_BLOCKED_ACTIONS` array (canonical, 11 roles) **union** the `*_BLOCKED_ACTIONS` set (8 roles) where both exist. Roles with neither map to an empty set. Built once at module load.
- `getBlockedActionsForRole(roleKey: RoleKey): ReadonlySet<string>` — lookup into the map (empty set for unknown).
- The map is the single source of truth that replaces: the `roleKey === 'developer'` special-case in `role-enforcer.ts` **and** the `isTesterBlockedAction` / `isTechnicalWriterBlockedAction` / `isContentWriterBlockedAction` helpers in `runtime-server.ts`.
- **Back-compat guarantee:** for `developer`, `tester`, `technical_writer`, `content_writer`, the aggregated set is a **superset** of what is wired today → zero regression (asserted by test).
- Pure, no I/O.

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
- `resolveSuggestedRole` keeps the existing keyword `SUGGEST_ROLE_FOR_BLOCKED` fallback (unchanged behavior).

### 4. `apps/agent-runtime/src/runtime-server.ts` (wire + consolidate)

- In `processOneTask`, before `enforceRole(task, config.roleKey)`, best-effort load the overlay via `getActiveRolePolicy(prisma, config.tenantId, config.roleKey)` and pass `blockedActions` as `blockedActionsOverride`. Prisma absent / DB error → no override (code registry stands). Mirrors Phase 1's `getPolicyEvaluateFn` degradation.
- **Consolidate:** the `isTesterBlockedAction` / `isTechnicalWriterBlockedAction` / `isContentWriterBlockedAction` helpers and their call sites (`3226/3242/3258/3928`) are now redundant — `enforceRole` covers those roles. Remove the helpers and their imports; the existing decline path through `enforceRole` (`role_enforcement_blocked`) replaces them. Preserve the existing decline telemetry/shape.

## Invariants

1. No customer role policy → behavior = code registry; for `developer` that's a **superset** of today (union) → regression test asserts byte-identical developer declines.
2. Customer role policy can only **add** blocks (union), never remove.
3. No `tenantId` from request body — always from runtime config / session, scoped DB queries.
4. Evaluator/DB failure → no weakening (fail toward the code registry).

## Testing (TDD — red→green→refactor per task)

- **Registry:** `getBlockedActionsForRole('developer')` ⊇ legacy `DEVELOPER_BLOCKED_ACTIONS`; `tester`/`technical_writer`/`content_writer` aggregated set ⊇ their `*_ROLE_BLOCKED_ACTIONS`; unknown role → empty set; a role never blocks one of its own curated actions.
- **Per-role coverage:** every `RoleKey` resolves to a set (no missing key); a representative role with previously-unwired data (e.g. `recruiter`, `sales_rep`, `devops`) now returns its curated blocklist.
- **Enforcer:** a non-developer role (e.g. `recruiter`) now hard-blocks a foreign action — proves the old gate is gone; existing developer decline cases unchanged.
- **Overlay:** a customer overlay adds a block; an overlay cannot un-block a code-registry entry.
- **Consolidation no-regression:** a `tester` blocked action still declines after the `isTesterBlockedAction` helper is removed (now via `enforceRole`).
- **No-regression:** existing `role-enforcer` + `runtime-server` + `auth-regression` suites pass unchanged.

## Out of scope (later phases)

- Verb-level MCP/connector ACLs (Phase 3).
- Webhook/env/time policy (Phase 4).
- Policy-document parse → role rules (Phase 5).
- Moving in-memory governance/budget stores to Postgres (Phase 6).
- Dashboard UI for authoring `scope=role` policies (follow-up; Phase 2 is runtime enforcement of policies that exist).

## Risks / watch-items

- **Consolidation blast radius** — removing the `runtime-server.ts` if-ladder touches the `buildDecision` path. Mitigate: keep the `enforceRole` decline shape identical; lean on the existing `runtime-server` test suite as the regression gate before rebuild.
- **Same action curated-blocked by a role that should allow it** — possible if the legacy array and set disagree. The "no role blocks its own curated action" test guards the obvious case; a full audit of the 19 curated sets is out of scope (we trust existing curation, only aggregate it).
- **agent-runtime is a pre-built image** — runtime changes require rebuild + force-recreate (separate commands) to take effect in Docker.
- **rulesJson schema drift** — keep the overlay parser defensive (ignore unknown keys, validate `blockedActions` is `string[]`).
