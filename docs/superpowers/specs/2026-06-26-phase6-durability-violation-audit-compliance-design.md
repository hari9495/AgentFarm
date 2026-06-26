# Phase 6 — Durability + Violation Audit + Compliance Export (Design + TDD)

**Date:** 2026-06-26
**Goal:** close the governance audit's lowest-scoring areas (Auditability, Compliance Readiness) and harden durability.

Three deliverables:
1. **Policy-violation history** — every enforcement `deny` is recorded in a queryable `PolicyViolation` table with the matched policy id + version.
2. **Compliance export** — a per-tenant report: active policies (all scopes), applied policy documents, and violation history.
3. **Durability** — move the in-memory governance-workflows + budget stores to Postgres so they survive restarts.

## Recording approach (single chokepoint, no new hot path)
All policy denies already converge on the runtime's `persistActionResultRecord` with `failureClass:'policy_violation'` and an `errorMessage` carrying the policy provenance (e.g. `[POLICY_DENIED] … policy=<id>@v<n>`). Record `PolicyViolation` there — one insertion point captures connector / env-time / role / document-applied denies. Best-effort, fire-and-forget, via a lazy prisma singleton (mirrors `policy-runtime.ts`). No per-deny surgery.

## TDD groups

### A — schema + types + recorder
- A1: `PolicyViolation` model (tenantId, workspaceId?, botId?, taskId?, actionType, connector?, riskLevel?, effect='deny', reason, matchedPolicyId?, policyVersion?, source, correlationId?, createdAt) + migration. Verify live.
- A2: shared-types `PolicyViolationRecord`.
- A3: `recordPolicyViolation(prisma, input)` + `parsePolicyProvenance(errorMessage)` (extracts `policy=<id>@v<n>`). Unit tests: parse hit/miss, persist shape, best-effort no-throw.

### B — wire recording into runtime
- B1: lazy prisma singleton in a `policy-violation-recorder.ts` runtime module; call from `persistActionResultRecord` when `failureClass==='policy_violation'`. Rebuild + live-verify a recorded row.

### C — compliance export
- C1: `getComplianceExport(prisma, tenantId)` → { generatedAt, activePolicies[], policyDocuments[], violations[] (recent N) }. Tenant-scoped. Unit tests w/ prisma double.
- C2: `GET /v1/governance/compliance-export` (session-authed, tenant from session) + optional `?format=json`. 401 regression.
- C3: dashboard — "Compliance" tab/section: summary counts + violations table + "Download JSON" button. Proxy route. Live-verify.

### D — durability
- D1: budget — replace the in-memory `budgetStore` Map in `budget-policy.ts` with a `WorkspaceBudgetState` Postgres table (or reuse an existing budget model if present); preserve the ledger-event behavior. Tests + live.
- D2: governance-workflows — persist templates/workflows/decisions Maps to Postgres. (Larger; may be split.)

## Invariants
- Recording is best-effort: a violation-write failure never affects enforcement or task flow.
- Export is read-only and tenant-locked (tenantId from session, never request body).
- Durability migration must not change existing budget/workflow behavior — only where the state lives.
