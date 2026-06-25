# Phase 1 — TDD Task Breakdown (Policy Model + OPA Evaluator + Runtime Hook)

**Date:** 2026-06-25
**Source plan:** `GOVERNANCE-POLICY-ENGINE-IMPLEMENTATION-PLAN.md` (Phase 1)
**Method:** Test-Driven Development — for each task write the failing test first, then the minimum code to pass, then refactor. Framework is `node:test` + `node:assert/strict` (per CLAUDE.md).

**Phase 1 goal:** A tenant policy that says `deploy_production = deny` blocks a developer-agent prod deploy at runtime — verified by test. With *no* tenant policy, behavior is byte-identical to today (fail-closed, never weaker than the hardcoded floor).

**Definition of done for Phase 1:**
- [ ] Policy can be stored per tenant in Postgres (versioned).
- [ ] `policy-engine.evaluate()` calls OPA and returns a typed decision.
- [ ] Evaluator failure or missing policy ⇒ no weakening of current behavior (fail-closed).
- [ ] Execution engine merges OPA decision with heuristic decision using max-strictness.
- [ ] All existing agent-runtime tests still pass unchanged.

---

## Task group A — Schema & migration

**A1. `GovernancePolicy` model**
- Test: a migration test / Prisma client test that creates a `GovernancePolicy` row with `tenantId, scope, scopeRef, version, status, rulesJson` and reads it back; unique constraint `(tenantId, scope, scopeRef, version)` rejects a duplicate.
- Code: add model + `prisma migrate dev --name governance_policy`.

**A2. `PolicyDocument` model** (storage only in Phase 1; ingestion is Phase 5)
- Test: create + read a `PolicyDocument` row (`tenantId, fileName, mimeType, storageKey, sha256, status`).
- Code: add model to same migration.

**A3. Shared types**
- Test: type-level — `PolicyDecision`, `PolicyEvaluationInput`, `GovernanceRule` compile and are exported from `@agentfarm/shared-types`.
- Code: add contracts to `packages/shared-types`; rebuild its `dist`.

---

## Task group B — OPA evaluator (`services/policy-engine`)

**B1. Decision contract + fail-closed default**
- Test: `evaluate()` with OPA unreachable (bad URL / network error) returns a fail-closed decision (`require_approval` or `deny`, never `allow`).
- Code: implement `evaluate(input): Promise<PolicyDecision>` with try/catch → fail-closed.

**B2. Happy-path OPA call**
- Test: with a stubbed/fetch-mocked OPA returning `{result: {effect:'deny', reasonCode:'policy_violation'}}`, `evaluate()` maps it to the typed `PolicyDecision`.
- Code: POST to `${OPA_BASE_URL}/v1/data/agentfarm/governance/decision`, parse `result`.

**B3. Input contract assembly**
- Test: given `{tenantId, workspaceId, roleKey, actionType, connector?, env?, estimatedCost?, time}`, the OPA request body matches the documented input shape.
- Code: input builder function (pure, unit-testable).

**B4. Default Rego bundle parity**
- Test (integration, can be a Rego unit test via `opa test` in CI, or a node test that runs the policy via the eval endpoint): the default bundle reproduces today's tiers — `deploy_production` → high/deny-without-approval, `mcp_tool_call` → require_approval, an unknown safe action → allow.
- Code: author `policy/agentfarm/governance.rego` + a seed/load script that loads the bundle into OPA on startup.

**B5. Per-tenant data overlay**
- Test: with tenant data document `{deploy_production: "deny"}` pushed for tenant X, `evaluate()` for tenant X returns deny while tenant Y (no overlay) returns the default.
- Code: function to push/update per-tenant data documents in OPA (`PUT /v1/data/agentfarm/tenants/<id>`).

---

## Task group C — Policy store + cache

**C1. Read active policy for tenant**
- Test: `getActivePolicy(tenantId, scope, scopeRef)` returns the highest-version `status='active'` row, or null.
- Code: Prisma query, tenant-scoped (never from request body).

**C2. Publish policy → push to OPA + bump version**
- Test: publishing a draft sets it active, archives the prior active version, and triggers an OPA overlay push (mock the push, assert called once with correct payload).
- Code: `publishPolicy()` transaction + OPA sync.

**C3. Redis cache + invalidation**
- Test: two `evaluate()` calls for the same `(tenant, policyVersion, actionType)` hit OPA once (second served from cache); publishing a new version invalidates the cache key.
- Code: Redis cache keyed by policy version; clear on publish.

---

## Task group D — Runtime integration (`apps/agent-runtime/src/execution-engine.ts`)

**D1. Merge heuristic + OPA decision (max strictness)**
- Test: heuristic says `low/execute`, OPA says `deny` ⇒ final is deny. Heuristic says `high/approval`, OPA says `allow` ⇒ final stays `high/approval` (never downgraded below floor).
- Code: merge function; call `policyEngine.evaluate()` after `buildDecision()`.

**D2. Fail-closed in the hot path**
- Test: when `evaluate()` throws/fails, execution keeps the heuristic decision unchanged (no crash, no downgrade).
- Code: wrap evaluator call; on error fall back to heuristic (which already carries the hardcoded floor).

**D3. No-policy parity (regression)**
- Test: with no tenant policy and OPA returning default-bundle decisions, a representative set of existing tasks produce the *same* `riskLevel`/`route` as today. Re-run the existing `execution-engine` test suite — must pass unchanged.
- Code: ensure default path is behavior-preserving.

**D4. End-to-end Phase 1 acceptance test**
- Test: tenant X policy `deploy_production = deny` ⇒ a developer-agent `deploy_production` task is blocked with a policy reason + emits a deny audit event; tenant Y (no policy) ⇒ routes to approval as today.
- Code: glue + a distinct `AuditEvent` on deny (carry `matchedPolicyId`, version).

---

## Suggested execution order

1. A1 → A2 → A3 (schema + types — everything else depends on these)
2. B1 → B2 → B3 (evaluator skeleton, fail-closed first)
3. B4 → B5 (default bundle + tenant overlay)
4. C1 → C2 → C3 (store + cache)
5. D1 → D2 → D3 → D4 (runtime wiring, ending on the acceptance test)

Each task = one red→green→refactor cycle, ideally one commit. Group D3 + D4 are the gates that prove "no regression" and "per-customer override works."

---

## Out of scope for Phase 1 (deferred)

- Data-driven RBAC / removing the hardcoded `'developer'` role (Phase 2).
- Per-tool MCP & connector verb-level ACLs (Phase 3).
- Webhook/env/time policy (Phase 4).
- Policy-document parsing/ingestion (Phase 5) — Phase 1 only adds the `PolicyDocument` table.
- Moving in-memory governance/budget stores to Postgres (Phase 6).

---

## Risks / watch-items

- **Hot-path latency:** OPA call is in the execution path — the Redis cache (C3) is mandatory, not optional. Measure added latency in D4.
- **Classification cache interaction:** the existing Redis classification cache (`af:class:v1:*`) must not let a cached low-risk result bypass a new tenant deny — verify the merge (D1) runs *after* cache lookup. (See memory: classification-cache approval-bypass fix.)
- **agent-runtime is a pre-built image:** runtime changes require rebuild + force-recreate of the container to take effect (separate commands).
