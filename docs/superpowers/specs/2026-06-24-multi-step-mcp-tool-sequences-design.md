# Multi-step MCP tool sequences (Option B) — Phase 1 design

Status: **Draft for review** · Author: agent-runtime · Date: 2026-06-24

## 1. Context & problem

Agents can already discover, choose, get approval for, and execute a **single**
registered MCP tool call (`actionType=mcp_tool_call`). Proven end-to-end with the
`echo` server (`add` → `42`) and `chrome-devtools` (`navigate_page` → success).

What does **not** work: tasks that need a **sequence** of tool calls against the
same server, e.g. *"open a page and report its title"* = `navigate_page` then
`evaluate_script`.

**Empirically verified blocker (2026-06-24):** browser/tool state does NOT
persist across our calls. Two separate `invokeMcpTool` calls (navigate, then
`() => document.title`) returned `""` — the second call got a *fresh, blank
browser*. Cause: `invokeMcpTool` opens a new MCP session (fresh `initialize`)
every call, and the `supergateway` bridge runs **stateless**, so each call gets
its own isolated Chrome.

Therefore multi-step MCP requires a **persistent session** for the duration of a
task's tool sequence — not just agent-side looping.

## 2. Goals / non-goals

**Goals (Phase 1):**
- An agent can run an ordered sequence of MCP tool calls against one server,
  sharing one live session so state persists between steps.
- The sequence is approved **once** (not per step).
- The customer sees a readable per-step transcript as the task output.
- Fully backward compatible: single `mcp_tool_call` is unchanged.

**Non-goals (Phase 1 — deferred to Phase 2):**
- Adaptive/agentic looping where the LLM picks the next step *after seeing each
  result*. Phase 1 pre-plans the whole step list upfront.
- Cross-server sequences in one task (Phase 1 = one server per sequence).
- Parallel tool calls.

## 3. Architecture

### 3.1 Persistent MCP session (core change)
`McpProtocolClient` gains an explicit session lifecycle:
- `connect()` — performs `initialize` once, captures the `mcp-session-id`
  response header (MCP streamable-HTTP spec), and sends `notifications/initialized`.
- subsequent `callTool()` calls reuse the same client and send the captured
  `mcp-session-id` header (instead of re-initializing each call).
- `close()` — best-effort session teardown.

Today `initialize()` runs on every `callTool`; we keep that path for the
single-call case and add the reuse path for sequences.

### 3.2 Stateful bridge
The bridge wrapping a stdio server must run **`supergateway --stateful`** so the
server keeps one process/session (one Chrome) per `mcp-session-id`. The
dev/operator launch command and (later) the managed-runner config set this.
Servers that are natively HTTP/stateful need no bridge change.

### 3.3 New action type: `mcp_tool_sequence`
- Decision LLM may return `actionType=mcp_tool_sequence` with
  `payloadOverrides.mcpServerUrl` and `payloadOverrides.steps`:
  `steps: [{ toolName, toolArgs }, ...]` (bounded, e.g. ≤ 8 steps).
- The catalog/prompt gains a short note: for tasks needing several tool calls
  against one server, use `mcp_tool_sequence` with the ordered steps.
- Added to `MEDIUM_RISK_ACTIONS` (one approval for the whole sequence) and to
  every role's allowed-action allowlist (`getAllowedActionsForRole`), mirroring
  `mcp_tool_call`.

### 3.4 Sequence executor
New handler in `local-workspace-executor.ts` for `mcp_tool_sequence`:
1. `connect()` one client to `mcpServerUrl`.
2. For each step: `callTool(toolName, toolArgs)`, append `{ step, ok, output }`
   to a transcript. On a step error: stop, mark the sequence failed, record which
   step failed and why.
3. `close()` the session in a `finally`.
4. Return the assembled transcript as the action output (→ `outputSummary`).

### 3.5 Approval
Classified MEDIUM → routed through the existing approval queue **once** for the
whole sequence. The approval summary lists the planned steps so the operator
sees what will run. Per-step re-approval is explicitly out of scope (bad UX). A
high-risk tool name in any step bumps the whole sequence to HIGH (policy floor).

## 4. Data flow
```
task → decision LLM → actionType=mcp_tool_sequence
     → classifyRisk MEDIUM → approval (one decision, steps shown)
     → approved → sequence executor:
          connect(session) → step1 → step2 → ... → close()
     → transcript stored as outputSummary (customer-visible)
```

## 5. Components / files touched
- `apps/agent-runtime/src/mcp-protocol-client.ts` — session lifecycle (connect/reuse/close, mcp-session-id header).
- `apps/agent-runtime/src/mcp-registry-client.ts` — `invokeMcpSequence(serverUrl, headers, steps)` helper using one client; catalog note about sequences.
- `apps/agent-runtime/src/local-workspace-executor.ts` — `mcp_tool_sequence` action handler + type union entry.
- `apps/agent-runtime/src/domain/risk-policy.ts` — add `mcp_tool_sequence` to MEDIUM_RISK_ACTIONS.
- `apps/agent-runtime/src/runtime-server.ts` — `getAllowedActionsForRole` includes `mcp_tool_sequence`.
- `apps/agent-runtime/src/llm-decision-adapter.ts` — schema + policy + `sanitizePayloadOverrides` support for `steps`.
- Dev/operator bridge command → add `--stateful`.

## 6. Error handling
- Step failure → stop, sequence = failed, `outputSummary` names the failing step
  and the tool error (reuses the failure-reason surfacing already shipped).
- Session always closed in `finally` (no leaked Chrome).
- Per-step timeout = existing `AGENTFARM_MCP_TIMEOUT_MS`; add an overall sequence
  budget so a stuck sequence can't run unbounded.
- If `connect()` fails (server down) → fail fast with a clear reason.

## 7. Security
- Session is tenant-scoped (server discovered via the tenant's registry; same
  isolation as single calls).
- Step count cap + overall time budget bound resource use.
- `steps` sanitized like other payload overrides (toolName string; toolArgs a
  bounded object) — no arbitrary fields pass through.

## 8. Testing
- Unit: session lifecycle (connect once, reuse session id, close); sequence
  executor with an injectable client (success path, mid-sequence failure,
  transcript assembly); `steps` sanitization; risk classification = MEDIUM.
- Integration (dev): stateful bridge + chrome-devtools; sequence
  `[navigate_page{type:url,url:example.com}, evaluate_script{function:"() => document.title"}]`
  → expect title `"Example Domain"` (the exact case that returns `""` today).
- Regression: single `mcp_tool_call` unchanged.

## 9. Phasing
- **Phase 1 (this spec):** pre-planned sequence in one persistent session.
  Covers "open then read title" and similar deterministic chains.
- **Phase 2 (later):** agentic loop — LLM chooses each next step from prior
  results; for flows where steps depend on intermediate output. Reuses the
  persistent session + approval model from Phase 1.

## 10. Risks / open questions
- **Bridge statefulness in production:** the managed MCP runner must launch
  bridges with `--stateful`; native HTTP MCP servers must advertise session
  support. Track per-server "supports sessions" capability.
- **`mcp-session-id` propagation through supergateway** needs verification (the
  integration test is the gate).
- **Prompt budget:** `mcp_tool_sequence` adds schema text to the decision prompt;
  keep it concise.
- **LLM planning quality:** pre-planned sequences assume the model can lay out
  the right steps upfront; if that proves unreliable for browser tasks, that is
  the signal to prioritise Phase 2.
