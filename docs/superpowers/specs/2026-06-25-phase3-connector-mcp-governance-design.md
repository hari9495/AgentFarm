# Phase 3 — Verb-level MCP/Connector Governance (Design Spec)

**Date:** 2026-06-25
**Source plan:** `docs/audit/2026-06-25/GOVERNANCE-POLICY-ENGINE-IMPLEMENTATION-PLAN.md` (Phase 3)
**Depends on:** Phases 1 & 2 (shipped). Reuses `GovernancePolicy` model + `getActivePolicy`.

## Goal

Let customers govern connector actions and MCP tools at the **verb** level: deny
specific verbs, deny specific MCP tools, or put a connector in **read-only** mode
(all write verbs blocked). Rules apply at **both** tenant and role scope, merged
strictest-wins. Customer policy can only **tighten** — never loosen the built-in
role allow-list or the `mcp_tool_call` MEDIUM→approval floor.

## Decisions (from brainstorming)

- **Scope:** both `scope=tenant` and `scope=role`, union/strictest-wins merge.
- **Deliverable:** enforcement + UI, landed as two chunks (enforcement first,
  verified live; then api-gateway routes + UI).

## Rule model (no migration)

`GovernanceRule` already has `connector?`, `tool?`, `env?`. Add one optional field
to `@agentfarm/shared-types`: `mode?: 'read_only' | 'full'`. Connector/MCP rule
shapes (all `effect:'deny'`):

| Shape | Meaning |
|---|---|
| `{ connector, actionType, effect:'deny' }` | deny one verb on a connector |
| `{ connector, mode:'read_only', effect:'deny' }` | deny **all write verbs** on a connector |
| `{ connector?, tool, effect:'deny' }` | deny a specific MCP tool by name |

## Vocabulary gotcha

The runtime connector executor uses a **9-value** actionType union
(`read_task`, `create_comment`, `update_status`, `send_message`,
`create_pr_comment`, `create_pr`, `merge_pr`, `list_prs`, `send_email`) — NOT the
34 `NormalizedActionType`. The classifier covers **both** vocabularies. Unknown
verb → treated as **write** (fail-safe: `read_only` never accidentally permits an
unclassified action).

## Components (Chunk 1 — enforcement)

### A. `connector-verb-classifier.ts` (new, agent-runtime)
- `isWriteVerb(actionType: string): boolean` — read set is explicit; everything
  else (incl. unknown) is a write. Covers the 9 runtime verbs + 34 normalized.
- Pure, no I/O.

### B. `connector-policy-store.ts` (new, agent-runtime) + shared-types `mode`
- Add `mode?` to `GovernanceRule` (rebuild shared-types dist).
- `getActiveConnectorPolicy(prisma, tenantId, roleKey): Promise<ConnectorPolicy>`
  reads active `scope=tenant` (scopeRef '') **and** `scope=role` (scopeRef roleKey),
  merges rules with `connector` or `tool` set into:
  ```
  ConnectorPolicy {
    perConnector: Map<connector, { deniedVerbs: Set<string>; readOnly: boolean }>;
    deniedTools: Set<string>;   // MCP tool names
  }
  ```
  Strictest-wins: union denied verbs/tools; `readOnly` if **either** scope sets it.
- `getActiveConnectorPolicyForTenant(tenantId, roleKey)` — cached-prisma runtime
  entry, fail-safe empty (mirrors Phase 2 `getActiveRoleBlocklistForTenant`).
- `isConnectorActionDenied(policy, connector, actionType)` helper: true if
  `deniedVerbs.has(actionType)` OR (`readOnly` AND `isWriteVerb(actionType)`).

### C. Connector enforcement — `executeConnectorActionForTask` (runtime-server)
- Before `connectorActionExecuteClient`: load the policy (cached), and if
  `isConnectorActionDenied(policy, connectorType, actionType)` → return a failed
  `ProcessedTaskResult` (`failureClass:'policy_violation'`), emit
  `runtime.connector_action_policy_blocked`, persist. Role allow-list still applies underneath.

### D. MCP enforcement — inject + executor check
- In `processOneTask`, when an MCP catalog is attached, load the policy and inject
  `payload._mcp_denied_tools = [...deniedTools]` (mirrors `_persona` / `_mcp_tool_catalog`).
- In `local-workspace-executor.ts`:
  - `case 'mcp_tool_call'`: if `_mcp_denied_tools` includes `toolName` → block
    (`ok:false`, policy reason) before `invokeMcpTool`.
  - `case 'mcp_tool_sequence'`: block if any step's `toolName` is denied.
- `mcp_tool_call` keeps its MEDIUM→approval floor (unchanged).

## Components (Chunk 2 — api + UI)

### E. api-gateway — generalize policy routes
- Extend governance policy routes to author connector/MCP rules at tenant or role
  scope: `POST /v1/governance/connector-policies` { scope, scopeRef?, connector,
  mode?, deniedVerbs?[], deniedTools?[] } → writes `GovernanceRule[]`. List/archive
  mirror the role-policy routes. Session-auth, tenant from session, tighten-only
  (only `deny`/`read_only` written). Tests + 401 regression.

### F. Dashboard — extend Role Policies panel
- Add a scope selector (role | tenant) and a "Connector access" editor: pick a
  connector, toggle read-only, add denied verbs / denied tools. Proxy routes +
  panel section. Verified in dashboard preview.

## Invariants

1. Tighten-only — customer rules only add denies / read-only; never grant.
2. Fail-safe — DB/Prisma absent or error → empty policy → built-ins stand.
3. Unknown verb under read-only → blocked (treated as write).
4. No `tenantId` from request body — from session.
5. `mcp_tool_call` keeps its MEDIUM→approval floor.

## Testing (TDD per group)

- **A:** known reads return false; known writes + unknown return true; both vocabularies.
- **B:** merge unions tenant+role denies; readOnly if either; `mode` field parses;
  fail-safe empty; `isConnectorActionDenied` (explicit verb, read-only write, read-only read allowed).
- **C:** denied verb / read-only write → failed `policy_violation`; allowed verb passes; no policy → unchanged.
- **D:** denied tool blocks `mcp_tool_call` + sequence step; non-denied passes; empty injection = no-op.
- **Live:** rebuild runtime image; a real connector task under a `read_only` policy is blocked.
- **E/F:** route tests + 401 regression; dashboard preview e2e.

## Out of scope (later phases)

- env/time policy (Phase 4); policy-doc parsing (Phase 5); store durability (Phase 6).
- Baseline-block read-only display (shared registry extraction) — still a Phase 2 follow-up.
