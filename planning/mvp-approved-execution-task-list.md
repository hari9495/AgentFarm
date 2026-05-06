# AgentFarm MVP Approved Execution Task List

## Purpose
Define execution tasks limited to already approved MVP items.

## Scope Rule
Only tasks that map to approved MVP documentation are allowed.

## Approved Task Backlog

## Epic 1: Tenant and Workspace Lifecycle
### Task 1.1: Finalize tenant and bot state contract
1. Define and freeze allowed tenant_status and bot_status values.
2. Align state names across architecture and execution design docs.
3. Acceptance criteria:
- All state values are identical across referenced docs.
- No additional states introduced outside approved list.
4. Source references:
- planning/engineering-execution-design.md
- planning/spec-tenant-workspace-bot-model.md

### Task 1.2: Define signup-to-provisioning transition contract
1. Confirm event handoff from signup completion to provisioning queue.
2. Confirm required identifiers and status updates at handoff.
3. Acceptance criteria:
- Handoff contract is explicit and testable.
- Dashboard status visibility is covered.
4. Source references:
- planning/engineering-execution-design.md
- planning/spec-tenant-workspace-bot-model.md
- planning/spec-dashboard-data-model.md

## Epic 2: Azure Provisioning and Runtime Contract
### Task 2.1: Freeze provisioning state machine
1. Confirm state sequence from queued to completed or failed.
2. Confirm retry and failure policy semantics.
3. Acceptance criteria:
- Full state sequence documented without ambiguity.
- Failure reason and cleanup expectations documented.
4. Source references:
- planning/engineering-execution-design.md
- planning/spec-azure-provisioning-workflow.md

### Task 2.2: Finalize Docker runtime contract fields
1. Confirm runtime inputs and runtime responsibilities.
2. Confirm host responsibilities and security boundaries.
3. Acceptance criteria:
- Runtime contract includes startup, health, restart, and kill-switch behavior.
- No privileged-mode requirement.
4. Source references:
- planning/engineering-execution-design.md
- planning/spec-docker-runtime-contract.md

## Epic 3: Connector Auth and Contract Integrity
### Task 3.1: Lock connector auth lifecycle for approved connectors
1. Confirm auth initiation, token storage, token refresh, revoke, and error handling.
2. Confirm connector health states and transitions.
3. Acceptance criteria:
- OAuth and token lifecycle is complete for Jira, Teams, GitHub, and company email.
- No new connectors added.
4. Source references:
- planning/engineering-execution-design.md
- planning/spec-connector-auth-flow.md

### Task 3.2: Freeze normalized connector action contract
1. Confirm common connector fields and normalized action list.
2. Validate mapping consistency across docs.
3. Acceptance criteria:
- Common fields and actions are stable and versioned.
- No contract drift across references.
4. Source references:
- planning/engineering-execution-design.md
- planning/product-architecture.md

## Epic 4: Approval and Risk Controls
### Task 4.1: Finalize risk classification and approval routing contract
1. Confirm low, medium, high risk behavior.
2. Confirm mandatory approval injection for medium and high risk.
3. Acceptance criteria:
- Risk behavior matches approved ADR and MVP gates.
- Approval flow paths are complete and auditable.
4. Source references:
- planning/product-architecture.md
- planning/architecture-decision-log.md
- mvp/mvp-scope-and-gates.md

### Task 4.2: Finalize approval record schema
1. Confirm required approval fields and timestamps.
2. Confirm latency field for SLA tracking.
3. Acceptance criteria:
- Schema supports full decision traceability.
- Schema supports P95 latency reporting.
4. Source references:
- planning/engineering-execution-design.md
- planning/spec-dashboard-data-model.md

## Epic 5: Audit Evidence and Dashboard Read Models
### Task 5.1: Lock audit and evidence minimum fields
1. Confirm required action, approval, and evidence fields.
2. Confirm retention and freshness policy references.
3. Acceptance criteria:
- Evidence model supports release-gate audits.
- Freshness target reference is explicit.
4. Source references:
- planning/product-architecture.md
- planning/architecture-decision-log.md
- research/competitive-gold-standards.md

### Task 5.2: Finalize dashboard read-model mapping
1. Confirm mapping of dashboard sections to read models and APIs.
2. Confirm status and approval visibility requirements.
3. Acceptance criteria:
- Every dashboard section maps to a defined read model and endpoint.
- No unowned dashboard section remains.
4. Source references:
- planning/engineering-execution-design.md
- planning/spec-dashboard-data-model.md

## Out-of-Scope Rejection Rule
Reject any proposed task that includes:
1. New role beyond Developer Agent.
2. New connector beyond Jira, Teams, GitHub, company email.
3. Live meeting voice participation.
4. HR interview automation mode.
5. Multi-region architecture expansion in MVP.

## Tracking Fields
Use these fields for each task during execution planning:
1. Task ID
2. Owner
3. Status
4. Source reference
5. Acceptance criteria met: Yes or No
6. Scope check: Pass or Fail
7. Priority: P0, P1, or P2
8. Dependency: prerequisite task IDs or None

## Execution Tracking (Initial Assignment)
| Task ID | Task Name | Owner | Status | Priority | Dependency | Due Date | Scope Check | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1.1 | Finalize tenant and bot state contract | Engineering Lead | Completed | P0 | None | 2026-04-21 | Pass | State values frozen across tenant/workspace/bot spec, engineering execution design, dashboard model, shared types, and Prisma schema. |
| 1.2 | Define signup-to-provisioning transition contract | Engineering Lead | Completed | P0 | 1.1 | 2026-04-21 | Pass | Handoff payload, status transitions, API response contract, and dashboard visibility rules are now explicit. |
| 2.1 | Freeze provisioning state machine | Engineering Lead | Completed | P0 | 1.2 | 2026-04-21 | Pass | 11-state machine frozen in engineering-execution-design.md Section 2 + ProvisioningJob model in Prisma schema + ProvisioningJobStatus type in shared-types. |
| 2.2 | Finalize Docker runtime contract fields | Engineering Lead | Completed | P0 | 2.1 | 2026-04-21 | Pass | Runtime config inputs, 9-state machine, startup/restart/kill-switch contracts frozen in engineering-execution-design.md Section 3 + RuntimeInstance model in Prisma schema + RuntimeStatus type in shared-types. |
| 3.1 | Lock connector auth lifecycle for approved connectors | Engineering Lead | Completed | P1 | 2.1 | 2026-04-21 | Pass | 11-state auth machine, OAuth activation flow, secure storage contract, token lifecycle (refresh/expiry/revoke), scope model, error classes, and runtime execution contract frozen in engineering-execution-design.md Section 4. ConnectorAuthMetadata, ConnectorAuthSession, ConnectorAuthEvent models in Prisma. ConnectorAuthMetadataRecord type in shared-types. |
| 3.2 | Freeze normalized connector action contract | Engineering Lead | Completed | P1 | 3.1 | 2026-04-21 | Pass | 6 normalized actions with support matrix (Jira: read_task/create_comment/update_status; Teams: send_message; GitHub: read_task/create_pr_comment; Email: send_email). Common request/response fields, error codes, retry rules, and contract versioning (semver) frozen in engineering-execution-design.md Section 4. ConnectorActionType, ConnectorActionStatus, ConnectorActionErrorCode enums and ConnectorAction model in Prisma. ConnectorActionRecord type in shared-types. |
| 4.1 | Finalize risk classification and approval routing contract | Security and Safety Lead | Completed | P0 | 2.2 | 2026-04-21 | Pass | Risk criteria, routing paths (medium/high), approval decision states, escalation timeout (3600s), and all 15 record fields frozen in engineering-execution-design.md Section 6 + Approval model in Prisma + ApprovalRecord/ApprovalDecision in shared-types. |
| 4.2 | Finalize approval record schema | Security and Safety Lead | Completed | P1 | 4.1 | 2026-04-21 | Pass | Approval record now has 17 fields including workspace_id (for dashboard filtering) and policy_pack_version (for traceability). All fields are immutable after created_at per spec. Indexes added on workspaceId, riskLevel, and decisionLatencySeconds to support P95 latency SLA reporting (target <300s for medium-risk). Immutability rules frozen in engineering-execution-design.md Section 6. ApprovalRecord interface enhanced with P95 and immutability documentation. |
| 5.1 | Lock audit and evidence minimum fields | Engineering Lead | Completed | P0 | 4.2 | 2026-04-21 | Pass | Minimum action, audit event, and approval evidence fields frozen in engineering-execution-design.md Section 7; 12/24-month retention policy and 90-day freshness target locked; ActionRecord + AuditEvent models in Prisma; ActionRecord + AuditEventRecord types in shared-types. |
| 5.2 | Finalize dashboard read-model mapping | Engineering Lead | Completed | P1 | 5.1, 3.2 | 2026-04-21 | Pass | All 6 API endpoints now use Prisma queries instead of mock payloads: /v1/dashboard/summary (tenant/workspace counts), /v1/workspaces/:workspaceId/provisioning (ProvisioningJob), /v1/workspaces/:workspaceId/connectors (ConnectorAuthMetadata), /v1/workspaces/:workspaceId/approvals (Approval), /v1/workspaces/:workspaceId/activity (AuditEvent), /v1/dashboard/workspace/:workspaceId (composed slice). Helper functions getTenantSummary, getWorkspaceBotSummaries, getProvisioningStatus, getConnectorHealth, getApprovals, getActivityEvents map Prisma models to dashboard data contracts. TypeScript typecheck passes clean. |
| W9.1 | Implement workspace_list_files | Engineering Lead | Completed | P1 | None | 2026-04-30 | Pass | Recursive walk with depth/pattern/include_dirs. Skips .git/node_modules/dist/build. Returns JSON string array. 118/118 tests pass. |
| W9.2 | Implement workspace_grep | Engineering Lead | Completed | P1 | None | 2026-04-30 | Pass | Regex search with context_lines and max_results. Returns [{file,line,col,text}]. 118/118 tests pass. |
| W9.3 | Implement file_move | Engineering Lead | Completed | P1 | None | 2026-04-30 | Pass | Sandbox-safe rename with parent dir creation. safeChildPath enforced both ends. 118/118 tests pass. |
| W9.4 | Implement file_delete | Engineering Lead | Completed | P1 | None | 2026-04-30 | Pass | Sandbox-safe rm with recursive flag. force:true prevents missing-file errors. 118/118 tests pass. |
| W9.5 | Implement workspace_install_deps | Engineering Lead | Completed | P1 | None | 2026-04-30 | Pass | Auto-detects pnpm/yarn/npm/pip/go/cargo from lockfiles. Explicit command override supported. 118/118 tests pass. |
| W9.6 | Implement run_linter | Engineering Lead | Completed | P1 | None | 2026-04-30 | Pass | ESLint default with fix mode, file targeting, max_time_ms. Auto command detection. 118/118 tests pass. |
| W9.7 | Implement apply_patch | Engineering Lead | Completed | P1 | None | 2026-04-30 | Pass | git apply via temp diff file in .agentfarm/. Supports check_only dry-run. Cleans up on success/failure. 118/118 tests pass. |
| W9.8 | Implement git_stash | Engineering Lead | Completed | P1 | None | 2026-04-30 | Pass | push/pop/list/drop stash operations. Windows CRLF safe in tests. 118/118 tests pass. |
| W9.9 | Implement git_log | Engineering Lead | Completed | P1 | None | 2026-04-30 | Pass | Structured JSON [{hash,short_hash,subject,author_name,author_email,date}] via --pretty=format. limit/branch/since filters. 118/118 tests pass. |
| W9.10 | Implement workspace_scout | Engineering Lead | Completed | P1 | None | 2026-04-30 | Pass | JSON summary: language, framework, package_manager, scripts, readme_excerpt. Reads package.json/README/go.mod/requirements.txt. 118/118 tests pass. |
| W9.11 | Implement workspace_checkpoint | Engineering Lead | Completed | P1 | None | 2026-04-30 | Pass | Creates agentfarm/checkpoints/<name> branch. restore_from: git reset --hard <ref>. 118/118 tests pass. |

## Sprint 0 Day-by-Day Status Template (Execution Ops)
Use this section daily from 2026-04-21 to 2026-04-28.
Update the table at end of day with evidence links and blocker ownership.

| Day | Date | Primary Owner | Planned Task Focus | Task IDs | End-of-Day Status | Scope Check | Evidence Updated | Blockers | Recovery Plan |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Day 1 | 2026-04-21 | Engineering Lead | Repo and environment baseline; kickoff dependencies for contract closure | 1.1, 1.2 (prep) | In progress | Pass | Yes | Docker Linux engine unavailable because WSL is not installed and elevation is required | Run elevated wsl --install, reboot machine, start Docker Desktop, then rerun compose startup |
| Day 2 | 2026-04-22 | Engineering Lead | Close state contract and finalize handoff payload draft | 1.1, 1.2 | Not started | Pass | No | None | N/A |
| Day 3 | 2026-04-23 | Engineering Lead | Close handoff contract and freeze provisioning state machine | 1.2, 2.1 | Not started | Pass | No | None | N/A |
| Day 4 | 2026-04-24 | Engineering Lead | Finalize Docker runtime contract fields and shared-type alignment | 2.2 | Not started | Pass | No | None | N/A |
| Day 5 | 2026-04-25 | Security and Safety Lead | Finalize risk classification and approval routing behavior | 4.1 | Not started | Pass | No | None | N/A |
| Day 6 | 2026-04-26 | Engineering Lead | Lock audit and evidence minimum fields with retention references | 5.1 | Not started | Pass | No | None | N/A |
| Day 7 | 2026-04-27 | Engineering Lead + Security and Safety Lead | Cross-doc consistency sweep and drift resolution | 1.1, 1.2, 2.1, 2.2, 4.1, 5.1 | Not started | Pass | No | None | N/A |
| Day 8 | 2026-04-28 | Engineering Lead + Architecture Owner + Product Lead | Sprint 0 exit gate and Sprint 1 start authorization | 1.1, 1.2, 2.1, 2.2, 4.1, 5.1 | Not started | Pass | No | None | N/A |

## Traceability Evidence (Current)
1. Dashboard flow and live wiring in page.tsx:
- apps/dashboard/app/page.tsx now resolves session token, fetches /v1/dashboard/summary, and consumes composed slice /v1/dashboard/workspace/{workspaceId}.
2. Target UI direction in page.tsx:
- apps/dashboard/app/page.tsx includes target KPI cards and keeps provisioning, connectors, approvals, and evidence blocks visible in a single operational view.
3. API slice for dashboard data in main.ts:
- apps/api-gateway/src/main.ts now exposes /v1/dashboard/workspace/:workspaceId and keeps route-level auth scope + rate-limit preHandler.
4. Planning-to-execution traceability:
- This document Task 5.2 notes now references the composed dashboard slice and execution state.
5. Data contract alignment already done:
- Tenant/workspace/bot status model stays aligned with previously closed Task 1.1 and 1.2 baseline.

## Daily Update Rules (Mandatory)
1. Set End-of-Day Status to one of: Completed, In progress, Blocked.
2. If any task is blocked, write owner and exact blocker in Blockers column.
3. Update Recovery Plan before close of day for each blocked item.
4. Set Evidence Updated to Yes only after source docs are updated and cross-checked.
5. If Scope Check changes to Fail, stop execution and escalate in same day governance check.

## Deferred Work (Built but Parked — Resume After Sprint 0 Exit Gate)
| Item | Location | Why Deferred | Resume Trigger |
| --- | --- | --- | --- |
| Marketing website | apps/website | Out of Sprint 0 scope. Built and typechecks clean. Not part of any MVP task. | After Sprint 0 exit gate is cleared (2026-04-28) and Sprint 1 is authorized. |
| Bot marketplace | apps/website/app/marketplace | Same as above — part of the marketing website copy. | Same as above. |

**Rule:** Do not touch apps/website or add new non-task work until all Sprint 0 P0 tasks (2.1, 2.2, 4.1, 5.1) are marked Completed and the exit gate is passed.

## Current Status
1. List status: **ALL SPRINT 0 P0/P1 TASKS COMPLETED** — Approved for MVP exit gate (2026-04-28).
2. Execution dates: 2026-04-21 (all tasks frozen in one engineering day).
3. Next review date: 2026-04-28 Sprint 0 exit gate + Sprint 1 authorization.
4. Sprint 0 exit gate deadline: 2026-04-28.
5. Immediate next action: Sprint 0 exit gate signoff meeting (2026-04-28) before resuming apps/website and apps/marketplace (Sprint 1).

## Post-MVP Developer Agent Extension Planning (No Auto-Start)
This section is planning-only and does not alter MVP scope rules above.

### Required Planning Inputs
1. planning/developer-agent-mvp-implementation-backlog.md
2. planning/future-agent-build-playbook.md
3. mvp/mvp-scope-and-gates.md

### Execution Rule for Future Agent Work
1. Future work may begin only after explicit architecture and safety signoff confirms scope and risk coverage.
2. Any proposed expansion that adds new roles, connectors, or privileged runtime actions must be reviewed as out-of-scope by default until approved.
3. Every post-MVP task must include owner, dependency, acceptance criteria, scope check, and evidence references before implementation begins.
