# AgentFarm Build Snapshot (As of 2026-04-28, updated 2026-04-30)

## Executive Status
- Sprint 1 delivery status: 22 of 24 tasks completed (core sprint), plus 11 Tier 1/2 workspace action tasks completed (Workstream 9).
- Remaining in progress: Task 7.1 (Website SWA production rollout), Task 8.2 and 8.3 (deployment and pre-launch gates).
- Quality gate status: PASS for core checks with DB runtime smoke skipped due to missing DB environment.
- Agent Runtime test count: **118 tests, 0 failures** (as of 2026-04-30).

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
