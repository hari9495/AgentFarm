# AgentFarm Phase 1 Plan - VM Workstation Realism

## Purpose
Define a concrete Phase 1 implementation plan to make the Developer Agent behave like a realistic laptop operator while running in a VM, using the current AgentFarm architecture.

## Baseline and MVP Comparison

### MVP Scope Baseline (from mvp/mvp-scope-and-gates.md)
- In scope: one Developer Agent role
- In scope connectors: Jira, Microsoft Teams, GitHub, company email
- Required controls: human approval for risky actions, audit logs, evidence records, weekly quality reporting
- Out of scope: multi-role orchestration, live meeting voice agent, HR interview automation

### Current Build Snapshot (from read.md and sprint-1-execution-task-list.md)
- Completed: 24/24 local Sprint 1 tasks
- Blocked externally: 7.1, 8.2, 8.3 (Azure/GitHub setup)
- Exceeded MVP breadth: 18 connectors, 12 workspace-action tiers, 10 LLM providers, budget policy, plugin trust/allowlist, orchestrator wake model

### Gap This Plan Closes
The platform is strong on control gates and reliability, but lacks workstation realism primitives:
- persistent VM session continuity
- browser/desktop state continuity
- crash-safe resume and reproducibility packs
- end-to-end developer flow automation (PR/CI loops) with realistic operator experience

---

## Phase 1 Top 10 Features
1. Workspace Session State Persistence
2. Browser Profile Persistence
3. Desktop Action Runtime (GUI fidelity)
4. IDE and Terminal Continuity
5. Unified Activity/Notification Stream
6. PR Auto Driver
7. CI Failure Triage Loop
8. Environment Reconciler
9. Crash Recovery + Repro Pack Generator
10. Work Memory + Next-Action Planner

---

## Sprint-by-Sprint Execution Plan

### Sprint 1 (Weeks 1-2): State Continuity Foundation

#### Feature F1: Workspace Session State Persistence
- Owner: Engineering Lead (primary), Platform Engineer (secondary)
- Effort: 8 points
- Risk: Medium
- Acceptance criteria:
  - GET/PUT workspace session-state endpoints are implemented and tested.
  - Runtime can restore last working context (open task id, working directory, active branch, pending approvals) after restart.
  - Session snapshot writes are idempotent and bounded (max one write per 30s per workspace).
  - Audit event emitted for session restore and state update.

#### Feature F2: Browser Profile Persistence
- Owner: Engineering Lead + Security Lead
- Effort: 8 points
- Risk: High
- Acceptance criteria:
  - Browser profile metadata persists per workspace.
  - Cookie/storage references are encrypted or key-vault referenced; no raw secrets in relational records.
  - Profile rotation endpoint invalidates prior profile tokens.
  - Restore path succeeds for 95% of warm sessions in test harness.

#### Feature F4: IDE and Terminal Continuity
- Owner: Engineering Lead
- Effort: 5 points
- Risk: Medium
- Acceptance criteria:
  - Terminal sessions and IDE state are persisted and can be restored.
  - Restored sessions enforce workspace scoping and safeChildPath boundaries.
  - Terminal replay excludes secrets and blocked commands.
  - Dashboard displays terminal/IDE restore health for active workspace.

Sprint 1 Exit Gate:
- All new contracts versioned in packages/shared-types.
- API route tests passing for new endpoints.
- No secrets in logs/events from restore paths.

### Sprint 2 (Weeks 3-4): Runtime Fidelity and Observability

#### Feature F3: Desktop Action Runtime (GUI fidelity)
- Owner: Runtime Engineer (primary), Security Lead (review)
- Effort: 13 points
- Risk: High
- Acceptance criteria:
  - Desktop action route supports launch, click, type, upload/select-file, screenshot actions.
  - High-risk desktop actions require approval via existing approval flow.
  - Every action writes deterministic result payload and audit event.
  - Failure categories map to retryable/non-retryable classes with bounded retries.

#### Feature F5: Unified Activity/Notification Stream
- Owner: Frontend Lead + Engineering Lead
- Effort: 5 points
- Risk: Low
- Acceptance criteria:
  - SSE stream endpoint emits runtime, approval, CI, connector, and provisioning events.
  - Dashboard panel shows unread/read/acked states.
  - Event ordering is stable per workspace (monotonic timestamp + sequence).
  - Ack endpoint updates state and logs actor identity.

#### Feature F8: Environment Reconciler
- Owner: Platform Engineer + DevOps Lead
- Effort: 8 points
- Risk: Medium
- Acceptance criteria:
  - Environment profile endpoint supports get/update/reconcile.
  - Reconciler validates toolchain versions and core service dependencies.
  - Drift report generated for mismatched runtimes and package managers.
  - Reconcile run is fully auditable and can run in dry-run mode.

Sprint 2 Exit Gate:
- Desktop actions integrated into risk taxonomy and approval routing.
- Evidence KPI extensions added for desktop action latency and stream freshness.

### Sprint 3 (Weeks 5-6): Developer Workflow Automation

#### Feature F6: PR Auto Driver
- Owner: AI/LLM Lead + Engineering Lead
- Effort: 8 points
- Risk: Medium
- Acceptance criteria:
  - Draft PR endpoint can generate title/body/checklist from workspace diff.
  - Publish PR endpoint requires policy preflight and approval for high-risk changes.
  - Reviewer auto-assignment works with CODEOWNERS fallback.
  - Audit and evidence records include PR metadata and decision trail.

#### Feature F7: CI Failure Triage Loop
- Owner: QA Lead + Engineering Lead
- Effort: 8 points
- Risk: Medium
- Acceptance criteria:
  - CI intake endpoint stores failed run metadata and triggers triage worker.
  - Triage report includes root-cause hypothesis, repro steps, and patch suggestion.
  - Confidence score and blast-radius notes are included.
  - Auto-fix proposal is never auto-merged without approval.

#### Feature F10: Work Memory + Next-Action Planner
- Owner: AI/LLM Lead
- Effort: 5 points
- Risk: Medium
- Acceptance criteria:
  - Workspace memory endpoints support read/write/plan generation.
  - Planner summarizes failed attempts, pending approvals, and next best actions.
  - Memory records are tenant/workspace scoped and queryable.
  - Planner output can feed orchestrator wake requests.

Sprint 3 Exit Gate:
- End-to-end path: CI fail -> triage -> patch draft -> PR draft works in integration tests.
- Memory planner assists resumed sessions without policy bypass.

### Sprint 4 (Weeks 7-8): Resilience and Launch Readiness

#### Feature F9: Crash Recovery + Repro Pack Generator
- Owner: Platform Engineer + Compliance Lead
- Effort: 8 points
- Risk: Low
- Acceptance criteria:
  - Resume endpoint can recover interrupted runs from persisted state.
  - Repro pack endpoint exports logs, timeline, diffs, screenshots, and action traces.
  - Repro packs are access-controlled and export events are audited.
  - Recovery success KPI exceeds 95% in controlled failure test suite.

Hardening and Launch Tasks (cross-feature)
- Owner: Security Lead + QA Lead + DevOps Lead
- Effort: 8 points
- Risk: Medium
- Acceptance criteria:
  - Security checks for new endpoints (authz, tenancy, input validation) all pass.
  - Load test for state/stream endpoints meets target SLO.
  - Quality gate additions merged into scripts/quality-gate.mjs.
  - Ops runbook updated with recovery and repro-pack procedures.

Sprint 4 Exit Gate:
- Phase 1 readiness signoff by Engineering Lead, Security Lead, Product Lead.
- No critical security findings for new surface area.

---

## API Contract Draft (All 10 Features)

Conventions:
- Auth: existing session/service-token model
- Scope: tenant + workspace mandatory
- Content-Type: application/json unless noted
- Errors: 400 validation, 401 unauthenticated, 403 unauthorized/scope, 404 not found, 409 conflict, 422 policy block, 429 rate limit, 500 internal

### F1 Workspace Session State Persistence
- GET /v1/workspaces/:workspaceId/session-state
  - Response 200: { workspaceId, version, state, updatedAt }
- PUT /v1/workspaces/:workspaceId/session-state
  - Request: { expectedVersion, state }
  - Response 200: { workspaceId, version, updatedAt }
- POST /v1/workspaces/:workspaceId/checkpoints
  - Request: { label, reason, stateDigest }
  - Response 201: { checkpointId, createdAt }
- GET /v1/workspaces/:workspaceId/checkpoints
  - Response 200: { items: [{ checkpointId, label, createdAt, actor }] }

### F2 Browser Profile Persistence
- GET /v1/workspaces/:workspaceId/desktop-profile
  - Response 200: { profileId, browser, storageRef, tabState, updatedAt }
- PUT /v1/workspaces/:workspaceId/desktop-profile
  - Request: { browser, tabState, storageRef }
  - Response 200: { profileId, updatedAt }
- POST /v1/workspaces/:workspaceId/browser-sessions/rotate
  - Request: { reason }
  - Response 202: { previousProfileId, newProfileId, rotatedAt }

### F3 Desktop Action Runtime
- POST /v1/workspaces/:workspaceId/desktop-actions
  - Request: { actionType, payload, correlationId }
  - Response 202: { taskId, riskLevel, route }
- GET /v1/workspaces/:workspaceId/desktop-actions/:taskId
  - Response 200: { taskId, status, result, attempts, startedAt, finishedAt }
- POST /v1/workspaces/:workspaceId/desktop-actions/:taskId/cancel
  - Request: { reason }
  - Response 202: { taskId, status: "cancelling" }

### F4 IDE and Terminal Continuity
- GET /v1/workspaces/:workspaceId/ide-state
  - Response 200: { openFiles, breakpoints, activeFile, updatedAt }
- PUT /v1/workspaces/:workspaceId/ide-state
  - Request: { openFiles, breakpoints, activeFile }
  - Response 200: { updatedAt }
- GET /v1/workspaces/:workspaceId/terminal-sessions
  - Response 200: { sessions: [{ id, shell, cwd, lastCommand, status }] }

### F5 Unified Activity/Notification Stream
- GET /v1/workspaces/:workspaceId/activity/stream (text/event-stream)
  - Events: approval.pending, approval.decided, ci.failed, runtime.state, connector.health, provisioning.state
- POST /v1/workspaces/:workspaceId/notifications/:notificationId/ack
  - Request: { ackReason }
  - Response 200: { notificationId, ackedAt, ackedBy }

### F6 PR Auto Driver
- POST /v1/workspaces/:workspaceId/pull-requests/draft
  - Request: { branch, changeSummary, linkedIssueIds }
  - Response 201: { draftId, title, body, reviewersSuggested }
- POST /v1/workspaces/:workspaceId/pull-requests/:draftId/publish
  - Request: { targetBranch, reviewers, labels }
  - Response 202: { prId, status: "publishing" }
- GET /v1/workspaces/:workspaceId/pull-requests/:prId/status
  - Response 200: { prId, provider, state, checks, reviewStatus }

### F7 CI Failure Triage Loop
- POST /v1/workspaces/:workspaceId/ci-failures/intake
  - Request: { provider, runId, repo, branch, failedJobs, logRefs }
  - Response 202: { triageId, status: "queued" }
- GET /v1/workspaces/:workspaceId/ci-failures/:triageId/report
  - Response 200: { triageId, rootCauseHypothesis, reproSteps, patchProposal, confidence, blastRadius }

### F8 Environment Reconciler
- GET /v1/workspaces/:workspaceId/environment-profile
  - Response 200: { runtimes, packageManagers, services, policies, updatedAt }
- PUT /v1/workspaces/:workspaceId/environment-profile
  - Request: { runtimes, packageManagers, services, policies }
  - Response 200: { updatedAt }
- POST /v1/workspaces/:workspaceId/environment-profile/reconcile
  - Request: { dryRun, targetProfileVersion }
  - Response 202: { reconcileRunId, status }

### F9 Crash Recovery + Repro Packs
- POST /v1/runs/:runId/resume
  - Request: { strategy: "last_checkpoint" | "latest_state" }
  - Response 202: { runId, resumedFrom, status }
- POST /v1/workspaces/:workspaceId/repro-packs
  - Request: { runId, includeScreenshots, includeDiffs, includeLogs }
  - Response 201: { reproPackId, downloadRef, expiresAt }
- GET /v1/workspaces/:workspaceId/repro-packs/:reproPackId
  - Response 200: { reproPackId, manifest, downloadRef, createdAt }

### F10 Work Memory + Next-Action Planner
- GET /v1/workspaces/:workspaceId/work-memory
  - Response 200: { memoryVersion, entries, summary }
- PUT /v1/workspaces/:workspaceId/work-memory
  - Request: { entries, mergeMode }
  - Response 200: { memoryVersion, updatedAt }
- POST /v1/workspaces/:workspaceId/daily-plan
  - Request: { objective, constraints }
  - Response 200: { planId, nextActions, risks, approvalsNeeded }
- GET /v1/workspaces/:workspaceId/next-actions
  - Response 200: { items: [{ action, reason, confidence, requiresApproval }] }

---

## Gap Matrix - Current Files/Modules to Change

| Feature | Current modules to modify | New modules to add | Tests to add/update |
|---|---|---|---|
| F1 Session State | apps/api-gateway/src/routes/runtime-tasks.ts, apps/orchestrator/src/orchestrator-state-store.ts, apps/agent-runtime/src/runtime-server.ts, packages/shared-types/src/index.ts | apps/api-gateway/src/routes/workspace-session.ts, apps/orchestrator/src/session-state-store.ts | workspace-session.test.ts, runtime-server.test.ts, orchestrator-state-store.test.ts |
| F2 Browser Profile | apps/api-gateway/src/routes/snapshots.ts, apps/api-gateway/src/routes/runtime-tasks.ts, packages/shared-types/src/index.ts | apps/api-gateway/src/routes/desktop-profile.ts, apps/api-gateway/src/services/browser-profile-worker.ts | desktop-profile.test.ts, browser-profile-worker.test.ts |
| F3 Desktop Actions | apps/agent-runtime/src/local-workspace-executor.ts, apps/agent-runtime/src/execution-engine.ts, apps/api-gateway/src/routes/runtime-tasks.ts, apps/api-gateway/src/routes/approvals.ts | apps/api-gateway/src/routes/desktop-actions.ts, apps/agent-runtime/src/desktop-action-runner.ts | desktop-actions.test.ts, local-workspace-executor.test.ts, execution-engine.test.ts |
| F4 IDE/Terminal Continuity | apps/agent-runtime/src/runtime-server.ts, apps/dashboard/app/components/runtime-observability-panel.tsx, packages/shared-types/src/index.ts | apps/api-gateway/src/routes/ide-state.ts, apps/api-gateway/src/services/terminal-session-worker.ts | ide-state.test.ts, terminal-session-worker.test.ts, runtime-observability-panel.test.tsx |
| F5 Activity Stream | apps/dashboard/app/components/operational-signal-timeline.tsx, apps/api-gateway/src/routes/audit.ts, services/notification-service (module) | apps/api-gateway/src/routes/activity-stream.ts, apps/api-gateway/src/services/activity-feed-worker.ts | activity-stream.test.ts, operational-signal-timeline.test.tsx |
| F6 PR Auto Driver | apps/agent-runtime/src/local-workspace-executor.ts, apps/orchestrator/src/task-scheduler.ts, apps/api-gateway/src/routes/connector-actions.ts | apps/api-gateway/src/routes/pull-requests.ts, apps/orchestrator/src/pr-orchestration.ts | pull-requests.test.ts, task-scheduler.test.ts |
| F7 CI Triage | apps/agent-runtime/src/local-workspace-executor.ts, apps/dashboard/app/components/runtime-observability-panel.tsx | apps/api-gateway/src/routes/ci-failures.ts, apps/api-gateway/src/services/ci-triage-worker.ts | ci-failures.test.ts, ci-triage-worker.test.ts |
| F8 Env Reconciler | apps/api-gateway/src/services/provisioning-worker.ts, apps/api-gateway/src/services/provisioning-monitoring.ts, packages/shared-types/src/index.ts | apps/api-gateway/src/routes/environment-profile.ts, apps/api-gateway/src/services/environment-reconciler-worker.ts | environment-profile.test.ts, environment-reconciler-worker.test.ts |
| F9 Recovery/Repro Pack | apps/orchestrator/src/orchestrator-state-store.ts, apps/agent-runtime/src/action-result-writer.ts, apps/api-gateway/src/routes/audit.ts | apps/api-gateway/src/routes/repro-packs.ts, apps/api-gateway/src/services/run-recovery-worker.ts | repro-packs.test.ts, run-recovery-worker.test.ts, action-result-writer.test.ts |
| F10 Work Memory/Planner | apps/orchestrator/src/task-scheduler.ts, apps/agent-runtime/src/llm-decision-adapter.ts, packages/shared-types/src/index.ts | apps/api-gateway/src/routes/work-memory.ts, apps/api-gateway/src/services/memory-rollup-worker.ts | work-memory.test.ts, memory-rollup-worker.test.ts, task-scheduler.test.ts |

---

## Shared Contract Additions (packages/shared-types)
Add versioned record types:
- WORKSPACE_SESSION_STATE
- DESKTOP_PROFILE
- DESKTOP_ACTION
- IDE_STATE
- NOTIFICATION_EVENT
- PR_AUTOMATION_RECORD
- CI_TRIAGE_REPORT
- ENVIRONMENT_PROFILE
- REPRO_PACK
- WORK_MEMORY

Compatibility rule:
- Extend CONTRACT_VERSIONS and contract compatibility tests before enabling new routes.

---

## Quality Gate Additions
Update scripts/quality-gate.mjs with Phase 1 checks:
1. api-gateway new-route contract tests
2. orchestrator resume/recovery tests
3. agent-runtime desktop-action tests
4. dashboard activity stream component tests
5. shared-types contract compatibility checks for new records

Pass criteria:
- No regression in existing 33 checks.
- New checks green before Phase 1 signoff.

---

## Risks and Mitigations (Phase 1)
1. Desktop action abuse risk (High)
- Mitigation: map destructive actions to existing medium/high approval routes + kill-switch.
2. Secret leakage via session/terminal replay (High)
- Mitigation: redact secrets in all replay payloads and logs; enforce key-vault refs only.
3. State corruption under concurrent updates (Medium)
- Mitigation: optimistic concurrency (expectedVersion), idempotent writes, checkpoint rollback.
4. Event stream overload (Medium)
- Mitigation: bounded queues, workspace-level rate limits, backpressure in SSE path.
5. CI auto-fix overreach (Medium)
- Mitigation: proposal-only mode by default, mandatory approval before publish/merge.

---

## Signoff Checklist for Phase 1 Start
- Product Lead: priorities approved (top 10 features and sprint order)
- Engineering Lead: module-level implementation scope approved
- Security Lead: risk and approval mappings approved
- QA Lead: acceptance criteria are testable and tracked
- DevOps Lead: environment reconcile and recovery operational boundaries approved

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).
