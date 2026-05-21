# AgentFarm — Implementation Status

> **Source of truth** for what's actually shipped vs. planned in the codebase.
> Updated whenever a Sprint closes a gap. Last updated: Sprint — Gap 6 disclosure rollout.

## Legend
- ✅ **Shipped** — code in `main`, typechecked, tested, used in the production task path.
- 🚧 **In progress** — partial implementation; some call-sites still bypass it.
- 📋 **Planned** — designed/specified but no production code yet.
- ⚠️ **Known gap** — identified weakness vs. human-equivalence baseline.

---

## 100% Human-Equivalence Gap Tracker

The six gaps surfaced in the May audit comparing AgentFarm tester + developer agents to a human equivalent.

| # | Gap | Status | Notes |
|---|-----|--------|-------|
| 6 | Persona disclosure on every outbound channel | ✅ Shipped | `outbound-disclosure.ts` chokepoint applied in connector dispatcher (`runtime-server.ts` `executeConnectorActionForTask`, progress sinks for jira/teams/email) and direct-API send-sites (`local-workspace-executor.ts`: `workspace_slack_notify`, `workspace_create_bug`, `workspace_post_pr_review`, `workspace_meeting_speak`). 12 unit tests in `outbound-disclosure.test.ts`. EU AI Act Art. 52 / FTC / CA SB 1001 compliant. |
| 5 | Tester scoped patch ability (test-files only, not source) | ✅ Shipped | `tester-edit-guard.ts` enforces test-file-only policy on `code_edit` / `code_edit_patch` for the tester role; wired into both runtime gate paths (`executeApprovedTask` + main task loop). 18 unit tests cover TS/JS/Python/Go/Java conventions, common test directories, Windows path separators, and parent-dir-escape rejection. |
| 4 | Episodic memory for per-person context | ✅ Shipped | EpisodicMemoryStore now dual-indexes by `workspaceId` and normalized `personKey` (email/Slack/CRM id/phone). Universal `processDeveloperTask` extracts the person from each payload via `person-key-extractor.ts`, injects `_episodic_person_context` into the LLM prompt, and records the outcome under both buckets. pg backend round-trips `personKey`/`personLabel` through the `summary` JSON column on `AgentLongTermMemory` (no schema migration required). 18 unit tests cover normalization, recall ordering, dual-index, and right-to-be-forgotten via `clearPerson`. |
| 3 | Real-time PR review polling loop | ✅ Shipped | `workspace_pr_review_poll` action exposed end-to-end (LLM policy hint, role allowlists, MEDIUM_RISK gating, scout trigger). |
| 2 | Auto-generated tests + type-coverage check | ✅ Shipped | `generateTestsWithLLM` + `runTypeCoverageWithTsc` wired into `autonomous-loop-orchestrator`. |
| 1 | Full desktop VM (noVNC) for visual operation | ✅ Shipped | docker/desktop-agent container (Xvfb + x11vnc + websockify/noVNC + vision loop with Anthropic/OpenAI/Ollama) wired through NativeDesktopOperator, gateway desktop-sessions proxy, and dashboard DesktopStreamPanel. Generic `workspace_visual_task` action lets any role dispatch arbitrary GUI goals (POST /v1/sessions → POST /v1/sessions/:id/task → poll). |

---

## Per-System Status

### Agent Runtime (`apps/agent-runtime`)
- ✅ Task queue + execution loop
- ✅ Approval packet generation in `processOneTask`
- ✅ Post-change quality gate loop
- ✅ Risk-tier routing (HIGH / MEDIUM / LOW)
- ✅ Per-role local-action allowlists (`LOCAL_WORKSPACE_ACTION_POLICY`)
- ✅ Persona context loader with 60s cache + role fallback
- ✅ Outbound disclosure chokepoint (Gap 6)
- ✅ Episodic memory hooks (universal — workspace + per-person dual index)
- ✅ Full desktop VM mode

### API Gateway (`apps/api-gateway`)
- ✅ Approval routes with structured packet parser
- ✅ Persona CRUD routes (`/v1/personas/:botId`)
- ✅ Workspace slice exposes structured packet fields

### Dashboard (`apps/dashboard`)
- ✅ Approval queue panel with structured packet detail drawer
- ✅ Agent persona settings panel
- 📋 Marketplace browse UI
- 📋 Self-service setup wizard
- 📋 Live VM screen-stream view

### Connectors
- ✅ Jira / Teams / Email / Slack / GitHub via `connectorActionExecuteClient`
- ✅ MCP protocol client
- 🚧 Connector readiness pre-checks (subset of connectors)
- 📋 OAuth flows for customer-owned MCP servers

### Roles
- ✅ Developer agent (reference implementation)
- ✅ Tester agent profile (`tester-agent-profile.ts`, ~110 actions)
- ✅ Sales agent (reference)
- 📋 9 remaining roles (FullStack, BA, Tech Writer, Content Writer, Corp Asst, Customer Support, PM/PO, Marketing, Recruiter)

### Compliance
- ✅ AI disclosure on every outbound channel (Gap 6)
- ✅ Channel-aware formatting (email / slack / pr / meeting / chat)
- ✅ Idempotent disclosure injection (no double-stamp)
- ✅ Audible meeting disclosure announcement
- 🚧 Audit trail surface in dashboard (logged but not yet rendered)

### Infrastructure
- ✅ Control-plane Bicep (`infrastructure/control-plane`)
- ✅ Runtime-plane Bicep (`infrastructure/runtime-plane`)
- 📋 VM lifecycle on agent hire/fire

---

## How to update this file
1. Close a gap → flip the row to ✅ in the gap tracker.
2. Add a per-system bullet describing what shipped.
3. Reference test files, action types, or modules so the next reader can verify.
4. Stamp `Last updated:` at the top.

If a doc under `docs/` describes behavior that lives in this matrix as 🚧 / 📋, that doc should say so via the banner at its top.
