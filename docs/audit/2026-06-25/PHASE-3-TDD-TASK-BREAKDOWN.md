# Phase 3 — TDD Task Breakdown (Verb-level MCP/Connector Governance)

**Spec:** `docs/superpowers/specs/2026-06-25-phase3-connector-mcp-governance-design.md`
**Method:** TDD — failing test first, minimal code, refactor. `node:test`.

## Chunk 1 — enforcement

### A. Verb classifier — `connector-verb-classifier.test.ts`
- A1: known reads (`read_task`, `list_prs`, `get_task`, `list_emails`, `read_email`, `get_call_status`) → `isWriteVerb` false.
- A2: known writes (`create_pr`, `merge_pr`, `send_email`, `update_status`, `send_message`, `create_comment`) → true.
- A3: unknown verb → true (fail-safe).

### B. mode field + store/merge — `connector-policy-store.test.ts`
- B1: `getActiveConnectorPolicy` merges tenant+role deny verbs (union) for a connector.
- B2: `readOnly` true if either tenant OR role sets `mode:'read_only'`.
- B3: deniedTools union from both scopes.
- B4: no active policy / DB error → empty policy (fail-safe).
- B5: `isConnectorActionDenied` — explicit verb denied; read-only blocks a write; read-only allows a read.
- B6 (types): `mode?` compiles on `GovernanceRule`.

### C. Connector enforcement — `runtime-server.test.ts` (or focused)
- C1: a connector task whose verb is denied → failed `policy_violation` (no exec).
- C2: read-only connector + write verb → blocked; read verb → allowed.
- C3: no policy → connector task proceeds unchanged (regression).

### D. MCP enforcement — `local-workspace-executor` + inject
- D1: `mcp_tool_call` with `toolName` in `_mcp_denied_tools` → `ok:false`, not invoked.
- D2: `mcp_tool_sequence` with a denied step tool → blocked.
- D3: empty/absent `_mcp_denied_tools` → no-op (regression).

### Live verification
- Rebuild + force-recreate agent-runtime image; submit a real connector task under a tenant `read_only` policy; observe `connector_action_policy_blocked`.

## Chunk 2 — api + UI

### E. api-gateway connector-policy routes — `connector-policy.test.ts` + auth-regression
- list / create (tenant|role) / archive; session-auth; tighten-only; 401s.

### F. Dashboard — Role Policies panel: scope selector + connector editor; proxy routes; preview e2e.
