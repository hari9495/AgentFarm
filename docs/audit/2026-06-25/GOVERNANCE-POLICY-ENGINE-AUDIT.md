# Governance & Policy Engine Audit — AgentFarm

**Date:** 2026-06-25
**Scope:** Policy management, runtime enforcement, customer-uploaded policies, MCP/connector/webhook governance, RBAC, auditability, compliance readiness.
**Method:** Source-level verification across `apps/`, `services/`, `packages/db-schema`.

---

## Headline finding (the question that matters most)

**Customer-uploaded policies do NOT influence agent behavior at runtime. They cannot even be uploaded.**

There is no policy-document ingestion pipeline anywhere in the codebase — no upload endpoint, no PDF/DOCX parser, no indexing, no attachment to agents, and no enforcement hook that reads them. This is **NOT IMPLEMENTED** (not "stored but unused" — the storage doesn't exist either).

The platform today enforces a **single, hardcoded, global governance model** baked into TypeScript source. The "Customer A vs Customer B / same agent, different behavior" requirement is **not supported**.

### Overall Governance Maturity: **38 / 100**

---

## Evidence

### 1. The "Policy Engine" is essentially a stub
- `services/policy-engine/src/index.ts` exports only `resolveApproverIds` — approver routing, nothing else. There is no policy-evaluation service.
- The real "policy" is a **hardcoded data file**: `apps/agent-runtime/src/domain/risk-policy.ts` contains two static `Set`s — `HIGH_RISK_ACTIONS` and `MEDIUM_RISK_ACTIONS`. Risk tiers are global constants. The file header states: *"To add a new action or change its risk tier: edit the sets below."* → **changing policy = changing code + redeploying.**

### 2. OPA is provisioned but never called
- `OPA_BASE_URL` appears in `docker-compose.yml`, `.env.example`, CLAUDE.md, and docs. CLAUDE.md advertises *"OPA (8181) — policy evaluation."*
- **No application `.ts` file makes any request to OPA.** A grep for OPA / `/v1/data/` across `apps/**` returns only unrelated string matches (`opaque`, `propagate`). OPA is dead infrastructure — a container that runs and is never queried.

### 3. There is no policy storage model
Across ~130 Prisma models there is **no** `GovernancePolicy`, `PolicyDocument`, `CustomerPolicy`, `AgentPermission`, or `ConnectorAllowlist` model. What exists is narrow/operational:
`Approval`, `AgentBudgetConfig`, `RetentionPolicy`, `PluginKillSwitch`, `PluginAllowlist`, `CircuitBreakerState`, `AgentRateLimit`, `TenantMcpServer`.
→ Policies **cannot be stored centrally, versioned, or made customer/role/agent-specific** through data. They live in code.

### 4. Role-based permissions are hardcoded, and only enforced for one role
- Role permissions live in code: `agents/<role>/<role>-role-profile.ts` (connector allowlist + blocklist + allowed actions). Not customer-editable.
- Critical limitation in `apps/agent-runtime/src/execution-engine.ts:647`: `enforceRole(taskWithAuditContext, 'developer', …)` — the role key is **hardcoded to `'developer'`**. And `role-enforcer.ts:102` hard-block phase is gated on `roleKey === 'developer'`. The hard blocklist is effectively only wired for the developer role; other roles get only the soft semantic classifier.

### 5. The runtime flow exists — but it is global, not policy-driven
Pipeline in `execution-engine.ts`: audit context → **kill-switch** → **role enforce** → **heuristic risk classify** (`buildDecision`) → optional LLM re-classify → **approval routing**. Structurally matches the requested flow, but every gate reads global hardcoded rules. There is no "Policy Retrieval" or "Governance Validation against customer config" step.

### 6. MCP governance is coarse and code-defined
- `mcp-registry-client.ts:157`: MCP servers are filtered by the **role's hardcoded `allowedConnectorTools`** list. Not customer-configurable.
- `TenantMcpServer` lets a tenant *register* servers, but there is **no per-tool allow/deny** ("Read Jira ✅ / Delete Jira ❌"). The whole server is in or out.
- `mcp_tool_call` is force-classified to MEDIUM → approval (good blanket safety), but not customer-tunable.

### 7. Connector governance — no read-only/full-access distinction
Allowlisting is by hardcoded role profile. There is **no customer-facing "Salesforce read allowed / delete blocked"** capability. Verb-level connector restrictions per customer do not exist.

### 8. Webhook governance is a global env allowlist
`apps/trigger-service/src/ssrf-guard.ts` blocks private IPs / cloud metadata and honors `WEBHOOK_CALLBACK_ALLOWLIST` — a single global env var, **not per-customer** outbound-domain policy.

### 9. Some governance stores are in-memory (not durable)
- `governance-workflows.ts:27` uses `new Map()` for templates/workflows/decisions.
- `budget-policy.ts:48` `budgetStore = new Map()`.
- These reset on process restart — a real concern for hard-stop enforcement and approval-workflow integrity.

### What is genuinely solid
- **Approvals**: durable `Approval` records, decision locking (409 on re-decide), latency tracking, HMAC intake.
- **Audit**: append-only `AuditEvent` + `ActionRecord` + decision history + best-effort Axiom mirror. Administrators can largely trace agent actions. Most mature area.
- **Kill-switch / circuit breakers / budget warnings**: present and checked before LLM spend.

---

## Governance Maturity Scorecard

| Dimension | Score | Basis |
|---|---:|---|
| Policy Management (store/version/customer-specific/no-code) | 12 / 100 | Policy lives in code; no model, no versioning, no per-customer config |
| Policy Enforcement (runtime gating) | 45 / 100 | Real pipeline exists but global & hardcoded; role enforce wired only for `developer` |
| Approval Workflows | 70 / 100 | Durable, locked, audited; workflow *templates* are in-memory |
| Role-Based Access Control | 30 / 100 | Hardcoded role profiles; enforceRole pinned to one role |
| MCP Governance | 35 / 100 | Server-level allowlist by role; no per-tool allow/deny; not customer-config |
| Connector Governance | 28 / 100 | Role allowlist only; no read-only vs full-access, no verb-level control |
| Webhook Governance | 40 / 100 | Solid SSRF guard, but global env allowlist, not per-tenant |
| Auditability | 75 / 100 | Append-only audit, action/approval history, Axiom mirror |
| Compliance Readiness | 22 / 100 | No policy docs, no per-customer attestation, in-memory gaps |

**Overall: 38 / 100.** The platform has the scaffolding of governance (approvals, audit, kill-switch, risk tiers) and enforces it at runtime — but it is a one-size-fits-all model defined in source code. The core requirement — customers configuring/uploading policies that automatically govern agents at runtime — is absent.

---

## Requirement-by-requirement verdict

| Requirement | Verdict |
|---|---|
| Policies stored centrally | ❌ (in code) |
| Policies versioned | ❌ |
| Policies updated without code changes | ❌ |
| Policies customer-specific | ❌ |
| Policies role-specific | ⚠️ (hardcoded per role) |
| Policies agent-specific | ⚠️ (hardcoded per role profile) |
| Runtime per-action evaluation | ⚠️ (global rules only) |
| Approval required check | ✅ |
| Escalation check | ⚠️ (approver routing only) |
| Audit logging required check | ✅ (always on) |
| Spending limits | ⚠️ (in-memory, configurable per workspace) |
| Time restrictions | ❌ |
| Environment restrictions (staging vs prod) | ❌ (no per-customer env policy; `deploy_production` is globally high-risk) |
| Customer-uploaded PDF/DOCX policies | ❌ NOT IMPLEMENTED |
| Documents parsed/indexed/attached/enforced | ❌ |
| Per-tool MCP allow/deny | ❌ |
| Read-only vs full-access connectors | ❌ |
| Outbound webhook domain restrictions (per customer) | ❌ (global env allowlist only) |
| Complete audit trail | ✅ |

---

## Conclusion

Customer-uploaded policies are **not stored, not displayed, and not enforced** — the capability does not exist. Governance is real but global and code-defined. To meet the business requirement, AgentFarm needs a policy data model, a runtime evaluator (OPA is already running and unused), and a document-ingestion pipeline that produces structured, enforceable rules. See `GOVERNANCE-POLICY-ENGINE-IMPLEMENTATION-PLAN.md` in this folder for the build plan.
