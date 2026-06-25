# Governance Policy Engine — Implementation Plan

**Date:** 2026-06-25
**Goal:** Make governance customer-configurable and runtime-enforced, so the same agent behaves differently per customer based on their policies (including uploaded policy documents). Replaces the hardcoded global model documented in `GOVERNANCE-POLICY-ENGINE-AUDIT.md`.

**Guiding principle:** Keep the existing hardcoded rules (`risk-policy.ts`, role profiles) as the **default/fallback bundle**. Customer policy *overrides* the default; absence of customer policy must never weaken current safety (fail-closed).

---

## Target architecture

```
Customer (Dashboard)                          Agent Runtime (per action)
  upload policy doc / edit rules                  buildDecision()
        │                                              │
        ▼                                              ▼
  Policy ingestion (parse → rules + RAG)        Policy Retrieval (cache)
        │                                              │
        ▼                                              ▼
  GovernancePolicy (Postgres, versioned) ─────► OPA evaluate  (already running, port 8181)
                                                       │
                                                       ▼
                                          allow / require_approval / deny / escalate
                                                       │
                                                       ▼
                                              kill-switch → approval → execute → audit
```

OPA is the evaluator (container exists, currently unused). Default policy bundle is loaded into OPA at startup; per-tenant overlays are pushed as OPA data.

---

## Phase 1 — Policy data model + evaluator wiring (foundation)

**1.1 Schema** (`packages/db-schema/prisma/schema.prisma`, new migration):
- `GovernancePolicy` — `id, tenantId, scope (tenant|workspace|role|agent), scopeRef, version, status (draft|active|archived), rulesJson, createdBy, createdAt`. Unique `(tenantId, scope, scopeRef, version)`; index `(tenantId, status)`.
- `GovernancePolicyVersion` history (or rely on append-only rows with `version` + `status`).
- `PolicyDocument` — `id, tenantId, fileName, mimeType, storageKey, sha256, status (uploaded|parsed|failed), extractedRulesJson, createdAt`.

**1.2 OPA wiring** (`services/policy-engine/`):
- Add `evaluate(input): PolicyDecision` that POSTs to `${OPA_BASE_URL}/v1/data/agentfarm/governance/decision`. Fail-closed on error (deny or require_approval, never silent allow).
- Ship a default Rego bundle that reproduces today's `HIGH_RISK_ACTIONS` / `MEDIUM_RISK_ACTIONS` tiers and role allow/block lists. Seed script to load the bundle + push per-tenant data documents.
- Input contract: `{ tenantId, workspaceId, roleKey, actionType, connector?, mcpTool?, env?, estimatedCost?, time, payloadMeta }`.
- Output: `{ effect: allow|deny|require_approval, requireApproval, escalate, reasonCode, matchedPolicyId, version }`.

**1.3 Runtime integration** (`apps/agent-runtime/src/execution-engine.ts`):
- After `buildDecision()`, call `policyEngine.evaluate(...)`. Merge: final risk/route = **max(strictness)** of heuristic decision and OPA decision (never downgrade below the hardcoded floor — keep the existing cache-bypass policy floor).
- Add a per-tenant policy cache (Redis, short TTL) keyed by policy version; invalidate on policy publish.

**Exit criteria:** A tenant policy that says `deploy_production = deny` blocks a developer-agent prod deploy at runtime, verified by test; with no tenant policy, behavior is byte-identical to today.

---

## Phase 2 — RBAC made data-driven

- Parameterize `enforceRole` by the task's **actual** role (remove the hardcoded `'developer'` in `execution-engine.ts:647`).
- Load each role's allow/block lists from `GovernancePolicy` (scope=role) with the code-defined `*-role-profile.ts` as fallback bundle.
- Extend hard-block enforcement to all roles (currently gated on `roleKey === 'developer'` in `role-enforcer.ts:102`).
- Regression: per-role 401/decline tests; ensure existing developer behavior unchanged.

---

## Phase 3 — MCP & connector governance (verb-level)

- Add `mcpToolPolicy` / `connectorPolicy` rule types: `{ connector, allow: [verbs], deny: [verbs], mode: read_only|full }`.
- Enforce in `mcp-registry-client.ts` (per-tool, not just per-server) and in the connector gateway execution path.
- Map normalized connector action verbs (already 34 in `connector-contracts`) to read vs write so `mode: read_only` is mechanically enforceable (e.g. Salesforce read ✅ / delete ❌).
- `mcp_tool_call` keeps its MEDIUM→approval floor; customer policy can only tighten, not loosen.

---

## Phase 4 — Webhook + environment + time governance

- Per-tenant outbound webhook domain allow/deny in policy (replace reliance on the single global `WEBHOOK_CALLBACK_ALLOWLIST`; keep SSRF guard as the non-negotiable floor).
- Environment restrictions: policy can scope actions by `env` (staging vs production) so Customer A "staging only" vs Customer B "prod allowed" works on the same agent.
- Time restrictions: working-hours windows in policy, evaluated in OPA input (`time`).

---

## Phase 5 — Customer-uploaded policy documents (the explicit ask)

- Upload endpoint (api-gateway) → store to object storage → `PolicyDocument` row.
- Parse pipeline: PDF/DOCX → text (reuse evidence/meeting parsing where possible).
- **Dual output:**
  1. **RAG grounding** — embed into `AgentKnowledgeBase` so agents are *aware* of the policy in-context (soft influence).
  2. **Structured extraction** — LLM extracts candidate rules → human review in Dashboard → on approval, written as a versioned `GovernancePolicy` (hard enforcement via OPA). Display-only is explicitly insufficient.
- Dashboard: upload UI, extracted-rule review/approve, version history, "test this policy against a sample action" simulator.

---

## Phase 6 — Durability + hardening

- Move in-memory governance stores to Postgres: `governance-workflows.ts` (`Map`) and `budget-policy.ts` (`budgetStore Map`). Currently lost on restart.
- Policy-violation audit events: emit a distinct `AuditEvent` type on every `deny`/`escalate` with `matchedPolicyId` + version for compliance traceability.
- Compliance export: per-tenant report of active policies, versions, and violation history.

---

## Sequencing & effort (rough)

| Phase | Deliverable | Effort |
|---|---|---|
| 1 | Model + OPA evaluator + runtime hook (fail-closed, default bundle) | L |
| 2 | Data-driven RBAC, all-role enforcement | M |
| 3 | MCP/connector verb-level governance | M |
| 4 | Webhook/env/time policy | M |
| 5 | Policy-document upload → parse → structured rules + RAG | L |
| 6 | Durability + violation audit + compliance export | M |

Phase 1 is the unlock (turns OPA from dead infra into the evaluator and proves per-customer override). Phase 5 satisfies the literal "upload your policies" requirement but depends on Phases 1–2 to be enforceable rather than cosmetic.

---

## Non-negotiable invariants

1. **Fail-closed**: evaluator error or missing policy ⇒ no weakening of the hardcoded floor.
2. **Customer policy can only tighten**, never loosen, the built-in safety tiers (`mcp_tool_call`, prod deploy, etc.).
3. **Every deny/escalate is audited** with the matched policy id + version.
4. **No `tenantId` from request body** — always from session, scoped DB queries (per CLAUDE.md auth pattern).
