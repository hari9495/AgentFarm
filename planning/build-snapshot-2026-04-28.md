# AgentFarm Build Snapshot (As of 2026-04-28, updated 2026-05-05)

## Executive Status
- Sprint 1 delivery status: 24 of 24 tasks completed (core sprint), plus 11 Tier 1/2 workspace action tasks completed (Workstream 9).
- Sprint 2 delivery status: **10/10 autonomous intelligence and notification features built and tested (2026-05-04)**.
- Sprint 3 delivery status: **Skill Marketplace — 21-skill catalog, execution engine, invoke endpoint, dashboard proxy (2026-05-05)**.
- Remaining: Task 7.1 (Website SWA production rollout), Task 8.2 and 8.3 (deployment and pre-launch gates).
- Quality gate status: **PASS — EXIT_CODE=0** (51 checks, 50 passing, 1 skipped: DB runtime smoke).
- Agent Runtime test count: **299 tests, 0 failures** (as of 2026-05-05).
- API Gateway test count: **351 tests, 0 failures** (as of 2026-05-04).
- Dashboard test count: **69 tests, 0 failures** (as of 2026-05-04).
- Notification service test count: **31 tests, 0 failures** (as of 2026-05-04).

---

## Sprint 3 Features Built (2026-05-05) — Skill Marketplace

### Feature 11 — 21-Skill Marketplace Catalog (`apps/agent-runtime/marketplace/skills.json`)
- 21 developer-agent skills with SHA-256 integrity digests
- Categories: Code Review (5), Testing (3), CI/CD (1), Incident Response (4), Documentation (2), Project Management (6)
- Each entry: `{ id, name, version, description, category, permissions[], source, digest }`
- Digest formula: `sha256(JSON.stringify({id, name, version, permissions: [...permissions].sort(), source}))`

### Feature 12 — Skill Execution Engine (`apps/agent-runtime/src/skill-execution-engine.ts`)
- `SKILL_HANDLERS: Readonly<Record<string, SkillHandler>>` — registry of all 21 pure-TypeScript handlers
- `SkillOutput { ok, skill_id, summary, result, risk_level, requires_approval, actions_taken, duration_ms }`
- `getSkillHandler(skillId)` — O(1) lookup, `undefined` for unknown
- `listRegisteredSkillIds()` — returns all 21 IDs
- All handlers operate on structured input with no external API dependencies
- **Handlers:** pr-reviewer-risk-labels, code-review-summarizer, pr-comment-drafter, issue-autopilot, branch-manager, commit-diff-explainer, test-coverage-reporter, flaky-test-detector, test-generator, ci-failure-explainer, dependency-audit, release-notes-generator, incident-patch-pack, error-trace-analyzer, rollback-advisor, docstring-generator, readme-updater, api-diff-notifier, slack-incident-notifier, jira-issue-linker, pr-description-generator

### Feature 13 — Marketplace Invoke Endpoint and Dashboard Proxy
- `AdvancedRuntimeFeatures.executeInstalledSkill({ skillId, inputs, workspaceKey? })`:
  - Validates skill is installed in workspace (reads `installed-skills.json`)
  - Dispatches to handler via `getSkillHandler()`
  - Records `invoke` usage via `recordMarketplaceUsage()`
  - Returns 404-style output for not-installed, 501-style for no-handler
- `POST /runtime/marketplace/invoke` — Fastify endpoint; 400 on missing skill_id, full SkillOutput on success
- `buildMarketplaceInvokeUrl()` in `runtime-proxy-utils.ts`
- `buildMarketplaceInvokeRouteContract()` in `route-contract.ts`
- Next.js proxy: `apps/dashboard/app/api/runtime/[botId]/marketplace/invoke/route.ts` — session-authenticated

### Feature 14 — Skill Execution Engine Tests (`apps/agent-runtime/src/skill-execution-engine.test.ts`)
- **56 new tests** covering all 21 handlers individually (2–4 cases each)
- Registry tests: 21 handlers registered, all expected IDs present, `getSkillHandler` for unknown returns `undefined`
- Cross-cutting invariants: `duration_ms >= 0` for all handlers, `skill_id` matches registry key
- Fixed: `dependency-audit` version major parsing (regex `^(\d+)` correctly extracts major version from semver strings)
- Total agent-runtime test count after Sprint 3: **299 passing, 0 failing**

---

## Sprint 2 Features Built (2026-05-04)

Ten open-source-inspired features were built, tested, and integrated:

### Feature 1 — Messaging Gateway (notification-service)
- **File:** `services/notification-service/src/notification-dispatcher.ts`
- **Adapters:** Telegram (`telegram-adapter.ts`), Slack (`slack-adapter.ts`), Discord (`discord-adapter.ts`), Webhook (inline), Voice (`voice-adapter.ts`)
- **API:** `dispatch(record, configs, fetcher?)` — routes by channel, respects `allowedTriggers`
- **Tests:** 31 tests in `notification-dispatcher.test.ts`

### Feature 2 — GOAP A* Goal Planner (orchestrator)
- **File:** `apps/orchestrator/src/goap-planner.ts`
- **Exports:** `GoapPlanner` class, `planGoal()` function
- **Pattern:** A* search over `GoalWorldState` with action preconditions/effects
- **Tests:** 13 tests passing

### Feature 3 — SSE Task Stream with Auto-Recovery (api-gateway)
- **File:** `apps/api-gateway/src/routes/sse-tasks.ts`
- **Exports:** `SseTaskQueue`, `registerSseTaskRoutes()`, `formatSseEvent()`, `channelKey()`
- **Behaviour:** Per-bot SSE channel, 512-event buffer, reconnect drain, heartbeat keep-alive
- **Tests:** Covered in api-gateway 351-test suite

### Feature 4 — Skills Crystallization (agent-runtime)
- **File:** `apps/agent-runtime/src/skills-registry.ts`
- **Exports:** `SkillsRegistry` class
- **Lifecycle:** `draft → active → deprecated`; `crystallize()` auto-generates templates from runs
- **Tests:** Covered in agent-runtime 239-test suite

### Feature 5 — Graphify Dev Tool (scripts)
- **File:** `scripts/graphify.mjs`
- **Usage:** `node scripts/graphify.mjs [--json|--dot]`
- **Output:** Mermaid/DOT/JSON dependency graph of all pnpm workspace packages

### Feature 6 — Agent Federation mTLS + PII Filter (connector-gateway)
- **Files:** `services/connector-gateway/src/mtls-verifier.ts`, `services/connector-gateway/src/pii-filter.ts`
- **Exports:** `MtlsVerifier`, `verifyMtlsCert()`, `stripPii()`, `containsPii()`
- **Security:** Certificate CN/SAN allowlist, recursive PII field redaction

### Feature 7 — HNSW Vector Search (evidence-service)
- **File:** `services/evidence-service/src/hnsw-index.ts`
- **Exports:** `HnswIndex` class, `cosineSimilarity()`
- **Pattern:** Pure-TypeScript HNSW approximate nearest-neighbour search for evidence retrieval

### Feature 8 — Kanban Board (dashboard)
- **File:** `apps/dashboard/app/components/kanban-board-utils.ts`
- **Exports:** `createBoard()`, `addCard()`, `moveCard()`, `removeCard()`, `getColumnCards()`, `filterCards()`
- **Pattern:** Pure logic (no UI), WIP limits, priority-based filtering
- **Tests:** Covered in dashboard 69-test suite

### Feature 9 — Voice Notification Channel (notification-service)
- **File:** `services/notification-service/src/channels/voice-adapter.ts`
- **Exports:** `sendVoice()`, `buildVoiceRequest()`
- **Integration:** VoxCPM/VoIP API; TTS synthesis using title+body concatenation

### Feature 10 — Approval-Only Messaging Gateway (notification-service)
- **File:** `services/notification-service/src/notification-dispatcher.ts`
- **Exports:** `dispatchApprovalAlert()`, `APPROVAL_TRIGGERS` set
- **Behaviour:** Returns `[]` for non-approval triggers; enforces `approval_requested | approval_decided` filter before dispatching
- **Shared-types change:** `NotificationChannelConfig.allowedTriggers?: NotificationEventTrigger[]` added
- **Tests:** 5 new tests in `dispatchApprovalAlert` suite

---

## Quality Gate Fixes Applied (2026-05-04)
- `apps/website/lib/auth-store.ts`: Added `PRAGMA busy_timeout = 5000` to reduce `SQLITE_BUSY` under parallel test load
- `apps/website/tests/signup-flow.test.ts`: Per-test `DatabaseSync` instances with `SQLITE_BUSY` retry loop
- `apps/dashboard/scripts/workspace-tab-e2e.mjs`: Retry loop on tab-click navigation assertion to handle transient client-navigation races



## What Is Built End-to-End

### 0. Local Workspace Execution Engine (Added 2026-04-30)
28 local workspace actions are now fully implemented in `apps/agent-runtime/src/local-workspace-executor.ts`:

**Tier 1 (Claude Code / Codex parity — 2026-04-30):**
- `workspace_list_files` — Recursive file listing with depth/pattern/include_dirs filters → JSON string array
- `workspace_grep` — Regex search across workspace files → `[{file, line, col, text}]` with context
- `file_move` — Sandbox-safe file/directory rename with parent dir creation
- `file_delete` — Sandbox-safe file/directory deletion with recursive flag
- `workspace_install_deps` — Auto-detects pnpm/yarn/npm/pip/go/cargo from lockfiles

**Tier 2 (autonomous agent capabilities — 2026-04-30):**
- `run_linter` — ESLint (default) with fix mode, file targeting, auto command detection
- `apply_patch` — Unified diff application via `git apply`; supports check_only dry-run
- `git_stash` — push/pop/list/drop stash operations for WIP isolation
- `git_log` — Structured JSON commit history `[{hash, short_hash, subject, author_name, author_email, date}]`
- `workspace_scout` — Compact project summary: language, framework, package_manager, scripts, readme_excerpt
- `workspace_checkpoint` — Creates rollback git branches; restore via `git reset --hard`

**Previously implemented (17 actions):** `git_clone`, `git_branch`, `git_commit`, `git_push`, `code_read`, `code_edit`, `code_edit_patch`, `code_search_replace`, `run_build`, `run_tests`, `run_shell_command`, `autonomous_loop`, `workspace_cleanup`, `workspace_diff`, `workspace_memory_write`, `workspace_memory_read`, `create_pr_from_workspace`

All 28 actions are covered by 118 tests (0 failures). Risk classification and role policies updated in `execution-engine.ts` and `runtime-server.ts`.

### 1. Tenant Signup, Auth, Session, and Workspace Isolation
- Signup and login flows implemented with session token issuance.
- Session validation and route guards enforce authenticated access.
- Workspace-level row-level isolation behavior validated in tests.

### 2. Provisioning Orchestrator and Runtime Bring-Up
- Provisioning state machine implemented from queued through completion/failure and cleanup.
- Azure provisioning steps integrated with VM bootstrap and Docker startup contract.
- Failure rollback and cleanup paths implemented, including remediation visibility.
- SLA monitoring implemented (latency tracking, stuck-job alerting, timeout enforcement).

### 3. Runtime Service and Agent Execution Engine
- Runtime endpoints implemented for startup, health, state, logs, and graceful kill.
- Agent execution engine implemented with risk classification and routing behavior.
- Runtime observability and state transitions implemented and surfaced in dashboard UX.

### 4. Connector Platform (OAuth, Token Lifecycle, Actions, Health)
- OAuth initiation and callback flows implemented for Jira, Teams, GitHub, and company email.
- Token lifecycle behaviors implemented: refresh, revoke, consent recovery.
- Normalized connector action execution implemented with retries and consistent error classification.
- Connector health checks and remediation mapping implemented and exposed for dashboard use.

### 5. Approval and Risk Controls
- Risk-based approval routing and immutable approval decision model implemented.
- Approval workflow connected to runtime execution and cancellation paths.
- Decision handling includes cache path, timeout/escalation path, and audit linkage.

### 6. Audit, Evidence, and Compliance UX
- Audit ingestion and query APIs implemented with retention controls.
- Evidence and compliance dashboard views implemented with filters and exports.

### 7. Website and Marketplace
- Website app modernized and conversion pages improved (home, pricing, product, marketplace).
- Marketplace listing and quick-start onboarding APIs/pages implemented.
- SWA deployment workflow and production verification script added.

### 8. Internal Dashboard Professionalization
- Layout system and visual hierarchy significantly improved.
- Sidebar, topbar, KPI cards, provisioning timeline, deep links, and action controls polished.
- Runtime observability panel completed with additional desktop and mobile polish passes.

## Testing and Quality Summary
- Quality gate report indicates PASS across typechecks, coverage gates, and smoke lanes.
- Agent Runtime coverage gate exceeded target on critical modules.
- API Gateway monitoring module line threshold checks passed.
- DB runtime smoke skipped due to unavailable DATABASE_URL in the execution context.

## Current Gaps to Launch
- Azure auth context and deployment execution evidence still pending for production release steps.
- SWA production secret and DNS/custom-domain completion are external platform-owner dependencies.
- Final security/load/freshness launch artifacts still required for complete launch signoff.

## Recommended Immediate Next Milestones
1. Complete production deployment run and capture evidence artifacts.
2. Finish SWA production rollout prerequisites and first green release.
3. Execute 8.3 security and load gates, then perform final launch signoff.
