# AgentFarm Sprint 1 Execution Task List (Implementation)

## Purpose
Execute all MVP build tasks to move from frozen contracts (Sprint 0) to a working, tested, deployable platform with Developer Agent operational end-to-end.

## Scope Rule
Only tasks that map to frozen Sprint 0 contracts and approved MVP documentation are allowed.

## Sprint 1 Timeline
- Start: 2026-04-28 (after Sprint 0 exit gate)
- Target completion: 2026-05-26 (4 weeks, 5 parallel workstreams)
- Gate: MVP launch readiness signoff (all tasks complete, all tests passing, production checklist signed)

## Workstreams

### Workstream 1: Signup and Tenant Lifecycle (Tasks 1.1–1.3)
Build user signup, auth service, tenant provisioning, and workspace initialization.

**Task 1.1: Implement signup and auth flow**
- Build POST /auth/signup endpoint
- Create user identity (tenant owner)
- Initialize tenant, workspace, and bot records
- Emit provisioning.requested event to queue
- Acceptance criteria: User signup → instant tenant → bot in created status → provisioning queued
- Status: Completed (2026-04-30)
- Evidence: apps/api-gateway/src/routes/auth.ts, apps/api-gateway/src/routes/auth.test.ts
- Validation: pnpm --filter @agentfarm/api-gateway test (200/200 pass), pnpm --filter @agentfarm/api-gateway typecheck (pass)
- Notes: POST /auth/signup runs atomic Prisma transaction creating tenant (status→provisioning), TenantUser (role owner), Workspace, Bot (status created), and ProvisioningJob (status queued). Returns session token and HttpOnly cookie. Email normalised to lowercase; duplicate emails rejected 409; timing-safe dummy-hash prevents user enumeration on login. ProvisioningJob acts as durable queue message consumed by provisioning-service poll loop.
- Owner: Engineering Lead
- Dependency: None
- Due: 2026-05-02

**Task 1.2: Build dashboard access control and session management**
- Implement FastAPI auth guard on /v1/dashboard/* routes
- Build session token validation (HMAC SHA-256 v1 format)
- Add workspace-scoped row-level security (RLS)
- Acceptance criteria: Session token valid, workspace isolated, dashboard loads with correct tenant data
- Status: Completed (2026-04-27)
- Evidence: apps/website/middleware.ts, apps/website/app/api/auth/login/route.ts, apps/website/tests/session-auth.test.ts
- Owner: Engineering Lead
- Dependency: 1.1
- Due: 2026-05-05

**Task 1.3: Dashboard provisioning status UI**
- Add real-time provisioning progress card to dashboard
- Show current job state, step history, and estimated time
- Add failure alert with remediation hints
- Acceptance criteria: Dashboard reflects ProvisioningJob state transitions within 2 seconds
- Status: Completed (2026-04-27)
- Evidence: apps/website/components/dashboard/ProvisioningProgressCard.tsx, apps/website/app/api/provisioning/status/route.ts, apps/website/tests/provisioning-progress-ui.test.ts
- Owner: Frontend Lead
- Dependency: 1.2
- Due: 2026-05-08

### Workstream 2: Azure Runtime Provisioning (Tasks 2.1–2.4)
Build the provisioning orchestrator that creates VMs, bootstraps Docker, registers runtime, and health-checks the bot.

**Task 2.1: Build provisioning state machine and job processor**
- Implement provisioning job state transitions (queued → validating → creating_resources → ... → completed or failed)
- Build async job processor that consumes provisioning.requested events
- Implement resource group and VM creation via Azure SDK
- Implement failure handling and cleanup workflow
- Acceptance criteria: Job transitions through all states, state mutations logged, resource cleanup on failure
- Status: Completed (2026-04-27)
- Evidence: services/provisioning-service/src/job-processor.ts, services/provisioning-service/src/state-machine.ts, services/provisioning-service/src/job-processor.test.ts
- Owner: Engineering Lead + Cloud Ops
- Dependency: 1.1
- Due: 2026-05-09

**Task 2.2: Build Azure VM bootstrap and Docker setup**
- Create VM init script that installs Docker, pulls bot image, sets up env vars
- Implement secure env var injection (no secrets in script)
- Add VM health probes and auto-restart policy
- Acceptance criteria: VM boots, Docker container starts, runtime reports ready status within 2 minutes
- Status: Completed (2026-04-27)
- Evidence: services/provisioning-service/src/vm-bootstrap.ts, services/provisioning-service/src/default-step-executor.ts, services/provisioning-service/src/default-step-executor.test.ts, services/provisioning-service/src/vm-bootstrap.test.ts
- Owner: Cloud Ops + Engineering Lead
- Dependency: 2.1
- Due: 2026-05-12

**Task 2.3: Build provisioning failure recovery and cleanup**
- Implement rollback logic for each failure state
- Build cleanup workflow (deprovision VMs, delete storage, update audit log)
- Add remediation hints to bot owner (dashboard alert)
- Acceptance criteria: Failed provisioning rolls back cleanly, audit log complete, dashboard shows error + next steps
- Status: Completed (2026-04-27)
- Evidence: services/provisioning-service/src/job-processor.ts, services/provisioning-service/src/job-processor.test.ts, services/provisioning-service/src/default-step-executor.ts
- Owner: Cloud Ops
- Dependency: 2.1, 2.2
- Due: 2026-05-15

**Task 2.4: Implement provisioning SLA and monitoring**
- Add ProvisioningJob latency metrics to dashboard (target: <10 min)
- Implement provisioning timeout (24 hours) with auto-remediation
- Add alert rule for provisioning stuck in any state > 1 hour
- Acceptance criteria: Metrics tracked, timeout enforced, alerts fire
- Status: Completed (2026-04-27)
- Evidence: services/provisioning-service/src/job-processor.ts, services/provisioning-service/src/job-processor.test.ts, apps/website/lib/auth-store.ts, apps/website/app/api/provisioning/status/route.ts, apps/website/components/dashboard/ProvisioningProgressCard.tsx, apps/website/tests/provisioning-progress-ui.test.ts
- Owner: Cloud Ops
- Dependency: 2.1, 2.3
- Due: 2026-05-18

### Workstream 3: Docker Runtime and Bot Execution (Tasks 3.1–3.3)
Build the Docker runtime that executes bot logic, handles lifecycle, and reports health.

**Task 3.1: Implement Docker runtime contract and bot entrypoint**
- Build bot service that starts with /startup endpoint call from VM
- Implement health probes (/health endpoint, liveness + readiness)
- Add kill-switch handler (/kill endpoint with 5s graceful shutdown)
- Implement runtime config inputs (evidence_api_endpoint, correlationId, etc.)
- Acceptance criteria: Container starts, health probes respond, kill-switch terminates gracefully
- Status: Completed (2026-04-27)
- Evidence: apps/agent-runtime/src/runtime-server.ts, apps/agent-runtime/src/runtime-server.test.ts, apps/agent-runtime/src/main.ts
- Owner: Engineering Lead
- Dependency: 2.2
- Due: 2026-05-09

**Task 3.2: Build bot core execution engine**
- Implement Developer Agent role behavior (code review, test planning, task creation)
- Add confidence scoring and risk classification logic (low/medium/high)
- Implement action queueing and retry logic (transient failures)
- Implement LLM decision adapter with multi-provider support and Auto fallback chain
- Implement provider health scoring (5-minute rolling window, composite error-rate + latency score)
- Add dashboard LLM config panel with per-provider settings and preset modes
- Acceptance criteria: Agent processes tasks, classifies risk, queues actions correctly; LLM override works for all supported providers; Auto mode falls back on errors; health scoring deprioritizes degraded providers
- Status: Completed (2026-04-29)
- Evidence (current): apps/agent-runtime/src/execution-engine.ts, apps/agent-runtime/src/execution-engine.test.ts, apps/agent-runtime/src/llm-decision-adapter.ts, apps/agent-runtime/src/llm-decision-adapter.test.ts, apps/agent-runtime/src/runtime-server.ts, apps/agent-runtime/src/runtime-server.test.ts, apps/api-gateway/src/routes/runtime-llm-config.ts, apps/api-gateway/src/routes/runtime-llm-config.test.ts, apps/dashboard/app/components/llm-config-panel.tsx
- Validation: pnpm --filter @agentfarm/agent-runtime test (92/92 pass), pnpm --filter @agentfarm/api-gateway test (159/159 pass), pnpm --filter @agentfarm/agent-runtime typecheck (pass), pnpm --filter @agentfarm/dashboard typecheck (pass)
- Notes: Nine LLM providers supported (openai, azure_openai, github_models, anthropic, google, xai, mistral, together, agentfarm). Auto mode iterates a per-profile priority list with health-score reordering; heuristic fallback fires if all providers fail. Dashboard LLM Config panel exposes all providers plus Ultra Low Cost / Balanced / Premium Quality presets. See ADR-007.
- Owner: AI/LLM Lead + Engineering Lead
- Dependency: 3.1
- Due: 2026-05-19

**Task 3.3: Implement runtime observability and state management**
- Add structured logging to /logs endpoint (JSON format)
- Implement heartbeat to control plane (every 30s)
- Add runtime state tracking (created → starting → ready → active → stopping → stopped)
- Acceptance criteria: Logs queryable, heartbeats reliable, state transitions tracked
- Status: Completed (2026-04-27)
- Evidence: apps/agent-runtime/src/runtime-server.ts, apps/agent-runtime/src/runtime-server.test.ts
- Dependency: 3.1
- Due: 2026-05-16

### Workstream 4: Connector Auth and Action Execution (Tasks 4.1–4.4)
Build the connector layer for Jira, Teams, GitHub, and email with OAuth and normalized action execution.

**Task 4.1: Implement connector auth state machine and OAuth initiation**
- Build ConnectorAuthSession creation and consent flow
- Implement OAuth initiation for Jira, Teams, GitHub
- Add secure state nonce validation (CSRF protection)
- Implement token storage in Key Vault (never in DB)
- Acceptance criteria: OAuth flows complete for all 4 connectors, tokens secured, state nonces validated
- Status: Completed (2026-04-28)
- Evidence: apps/api-gateway/src/routes/connector-auth.ts, apps/api-gateway/src/routes/connector-auth.test.ts
- Validation: pnpm --filter @agentfarm/api-gateway exec tsx --test src/routes/connector-auth.test.ts (14 pass), pnpm --filter @agentfarm/api-gateway typecheck (pass)
- Notes: OAuth initiation/callback now supports Jira, Teams, GitHub, and company email; callback enforces nonce replay rejection and routes insufficient scopes to consent_pending while persisting secret references only.
- Owner: Engineering Lead + Security Lead
- Dependency: 2.1 (tenant identity ready)
- Due: 2026-05-12

**Task 4.2: Implement connector token lifecycle and refresh**
- Build token expiry tracking and auto-refresh
- Implement revoke flow (user disconnects)
- Add error handling for permission_invalid, token_expired states
- Implement scope validation and consent recovery
- Acceptance criteria: Tokens refresh before expiry, revoke clears auth, permission errors trigger re-consent
- Status: Completed (2026-04-28)
- Evidence: apps/api-gateway/src/services/connector-token-lifecycle-worker.ts, apps/api-gateway/src/services/connector-token-lifecycle-worker.test.ts, apps/api-gateway/src/routes/connector-auth.ts, apps/api-gateway/src/routes/connector-auth.test.ts
- Validation: pnpm --filter @agentfarm/api-gateway exec tsx --test src/services/connector-token-lifecycle-worker.test.ts (6 pass), pnpm --filter @agentfarm/api-gateway exec tsx --test src/routes/connector-auth.test.ts (14 pass), pnpm --filter @agentfarm/api-gateway typecheck (pass)
- Notes: Auto-refresh worker now supports Jira, Teams, GitHub, and company email OAuth tokens; revoke clears secret references; permission_invalid and insufficient_scope paths consistently route to consent_pending for re-consent recovery.
- Owner: Engineering Lead
- Dependency: 4.1
- Due: 2026-05-16

**Task 4.3: Implement normalized connector actions**
- Build action executors for: read_task, create_comment, update_status, send_message, create_pr_comment, send_email
- Map provider-specific request/response to normalized format
- Implement retry logic (exponential backoff for transient errors)
- Add ConnectorAction logging (success/failure/error code)
- Acceptance criteria: All 6 actions execute end-to-end for each connector, errors classified correctly
- Status: Completed (2026-04-28)
- Evidence: apps/api-gateway/src/routes/connector-actions.ts, apps/api-gateway/src/routes/connector-actions.test.ts, apps/api-gateway/src/lib/provider-clients.ts, apps/api-gateway/src/lib/provider-clients.test.ts
- Validation: pnpm --filter @agentfarm/api-gateway exec tsx --test src/routes/connector-actions.test.ts (22 pass), pnpm --filter @agentfarm/api-gateway exec tsx --test src/lib/provider-clients.test.ts (45 pass), pnpm --filter @agentfarm/api-gateway typecheck (pass)
- Notes: Route executor enforces normalized action contract v1.0 with exponential backoff retries (50ms, 100ms), connector action logging, role-policy checks, and consistent timeout classification (timeout -> HTTP 504 + timeout log status).
- Owner: Engineering Lead + Integration Lead
- Dependency: 4.1, 4.2
- Due: 2026-05-21

**Task 4.4: Implement connector error recovery and health checks**
- Build health probe for each connector (monthly scope validation)
- Implement error handlers for auth failures, rate limits, and network timeouts
- Add remediation flows (re-auth, scope re-consent, backoff)
- Acceptance criteria: Health checks run, errors surface to dashboard, re-auth flows work
- Status: Completed (2026-04-28)
- Evidence: apps/api-gateway/src/services/connector-health-worker.ts, apps/api-gateway/src/services/connector-health-worker.test.ts, apps/api-gateway/src/routes/connector-actions.ts, apps/api-gateway/src/routes/connector-actions.test.ts, apps/api-gateway/src/lib/provider-clients.ts
- Validation: pnpm --filter @agentfarm/api-gateway exec tsx --test src/services/connector-health-worker.test.ts (5 pass), pnpm --filter @agentfarm/api-gateway exec tsx --test src/routes/connector-actions.test.ts (22 pass), pnpm --filter @agentfarm/api-gateway typecheck (pass)
- Notes: Health worker enforces monthly stale validation window and prioritizes unhealthy connector states; remediation mapping applies re-auth/reconsent/backoff outcomes and is exposed through health summary endpoints for dashboard consumption.
- Owner: Integration Lead
- Dependency: 4.3
- Due: 2026-05-23

### Workstream 5: Approval and Risk Controls (Tasks 5.1–5.3)
Build the approval workflow service, risk evaluation engine, and human approval UI.

**Task 5.1: Implement risk classification and approval routing**
- Build risk evaluator (classifies actions as low/medium/high per frozen policy)
- Implement approval routing (medium/high → approval queue, auto-escalation after 1 hour)
- Build Approval record creation and immutability enforcement
- Acceptance criteria: Actions classified correctly, medium/high actions routed to approvers, timeout escalation works
- Status: Completed (2026-04-30)
- Evidence: apps/agent-runtime/src/execution-engine.ts, apps/api-gateway/src/routes/approvals.ts, apps/api-gateway/src/routes/approvals.test.ts, apps/agent-runtime/src/execution-engine.test.ts
- Validation: pnpm --filter @agentfarm/api-gateway test (200/200 pass), pnpm --filter @agentfarm/agent-runtime test (99/99 pass), pnpm --filter @agentfarm/approval-service test (12/12 pass)
- Notes: classifyRisk() in execution-engine.ts implements frozen policy: HIGH_RISK_ACTIONS (merge_pr, merge_release, delete_resource, change_permissions, deploy_production) and MEDIUM_RISK_ACTIONS (update_status, create_comment, create_pr_comment, create_pr, send_message); low-confidence fallback (<0.6) escalates to medium. POST /v1/approvals/intake routes low-risk actions to execute_without_approval (200) and medium/high to queued_for_approval (201) with immutability enforcement (409 on field mutation). POST /v1/approvals/escalate marks overdue pending approvals after per-record timeout (default 3600s = 1 hour). All approval fields are immutable after creation. ApprovalEnforcer in approval-service enforces kill-switch precedence over in-flight approvals.
- Owner: Security and Safety Lead
- Dependency: 3.2 (bot action generation)
- Due: 2026-05-15

**Task 5.2: Build approval dashboard UI and decision workflow**
- Create approval queue view (pending approvals by risk level)
- Implement approval/rejection/timeout decision UI
- Add decision reason capture and latency tracking
- Implement escalation and audit logging
- Acceptance criteria: Approver can see, decide, and track decisions; P95 latency <300s
- Status: Completed (2026-05-01)
- Evidence: apps/website/components/dashboard/ApprovalsQueue.tsx, apps/website/app/dashboard/approvals/page.tsx, apps/website/app/api/approvals/route.ts, apps/website/app/api/approvals/[id]/route.ts, apps/website/components/dashboard/RiskyActionTrigger.tsx, apps/website/tests/approvals-flow.test.ts
- Validation: pnpm --filter @agentfarm/website test:approvals (3/3 pass), pnpm --filter @agentfarm/website typecheck (pass)
- Notes: ApprovalsQueue component renders pending approvals grouped by risk level (HIGH/MEDIUM), approve/reject buttons with inline reason capture, real-time latency display (decisionLatencySeconds), escalation badge, and optimistic removal on decision. RiskyActionTrigger allows high-risk simulation from agent detail page. API routes enforce tenant isolation, HMAC session auth, and decision immutability (409 on re-decision). P95 decision latency tracked per approval record.
- Owner: Frontend Lead + Security Lead
- Dependency: 5.1
- Due: 2026-05-20

**Task 5.3: Implement approval enforcement and action execution**
- Build approval check before executing risky connector actions
- Implement decision cache (approved action executes immediately)
- Build rejection handling (action cancelled, bot notified)
- Add decision notification to bot (via /decision webhook)
- Acceptance criteria: Risky actions block until approved, approved actions execute, rejected actions cancel gracefully
- Status: Completed (2026-05-01)
- Evidence: services/approval-service/src/approval-enforcer.ts, services/approval-service/src/approval-enforcer.test.ts, services/approval-service/src/governance-workflow-manager.ts, services/approval-service/src/governance-workflow-manager.test.ts, apps/website/app/api/approvals/[id]/route.ts, apps/website/components/dashboard/RiskyActionTrigger.tsx
- Validation: pnpm --filter @agentfarm/approval-service test (all pass), pnpm --filter @agentfarm/website test:approvals (3/3 pass)
- Notes: ApprovalEnforcer in approval-service enforces medium/high action blocking with kill-switch precedence. Kill-switch activation halts all new risky execution within a 30-second control window; resume requires authorized control-plane signal and incident reference. Decision cache: approved actions carry executionToken; rejected actions return 409 with reason. PATCH /api/approvals/[id] is the decision webhook for bot callbacks. Governance workflow manager co-ordinates multi-stakeholder escalation.
- Owner: Engineering Lead
- Dependency: 5.1, 5.2
- Due: 2026-05-24

### Workstream 6: Audit, Evidence, and Observability (Tasks 6.1–6.2)
Build the audit and evidence system for compliance gates and incident investigation.

**Task 6.1: Implement audit event logging and retention**
- Build AuditEvent recorder (all provisioning, runtime, connector, approval events)
- Implement append-only audit log (immutable storage)
- Add 12/24-month retention policy with archival
- Implement audit event query API for compliance
- Acceptance criteria: All events logged, retention enforced, queries work within SLA
- Status: Completed (2026-05-01)
- Evidence: apps/website/lib/auth-store.ts (writeAuditEvent, listAuditEvents, AuditEventRecord), apps/website/app/api/audit/events/route.ts, apps/website/tests/evidence-compliance.test.ts
- Validation: pnpm --filter @agentfarm/website test:evidence (1/1 pass), pnpm --filter @agentfarm/website typecheck (pass)
- Notes: writeAuditEvent() persists to company_audit_events SQLite table (append-only, no update/delete path). Events emitted automatically on approval request creation, approval decisions, connector operations. Query API supports filters: actorEmail, action, tenantId, sinceTs/untilTs, limit. 365-day active retention + 730-day archive defined in compliance evidence pack. listAuditEvents() respects tenant isolation. POST endpoint allows explicit audit event capture from control plane.
- Owner: Engineering Lead + Compliance Lead
- Dependency: 2.1, 3.1, 4.3, 5.1 (all event sources)
- Due: 2026-05-18

**Task 6.2: Implement evidence dashboard and compliance reporting**
- Build evidence summary dashboard (shows gold-standard score evidence freshness)
- Create audit event query UI (filter by event type, actor, date range)
- Build compliance export (evidence pack for external audit)
- Acceptance criteria: Dashboard shows evidence freshness, audit UI queries fast, export complete
- Status: Completed (2026-05-01)
- Evidence: apps/website/components/dashboard/EvidenceCompliancePanel.tsx, apps/website/app/dashboard/evidence/page.tsx, apps/website/app/api/evidence/summary/route.ts, apps/website/app/api/evidence/export/route.ts, apps/website/tests/evidence-compliance.test.ts
- Validation: pnpm --filter @agentfarm/website test:evidence (1/1 pass), pnpm --filter @agentfarm/website typecheck (pass)
- Notes: EvidenceCompliancePanel shows live KPIs: approvals requested/pending/approved/rejected, escalated approvals, P95 decision latency, audit event count, evidence freshness in seconds. Audit event query UI supports filters for actorEmail, action, date range with live reload. Export routes support both JSON (full ComplianceEvidencePack) and CSV (compliant spreadsheet) formats with content-disposition attachment headers. Retention policy: activeDays=365, archiveDays=730 in export pack.
- Owner: Compliance Lead
- Dependency: 6.1
- Due: 2026-05-26

### Workstream 7: Website and Marketplace (Tasks 7.1–7.2)
Resume deferred marketing website and bot marketplace.

**Task 7.1: Resume and finalize website (from Sprint 0 deferred work)**
- Deploy website on Azure Static Web App
- Set up custom domain and CDN
- Configure analytics and SEO
- Acceptance criteria: Website live, performance >90 Lighthouse, DNS configured
- Owner: Frontend Lead + DevOps
- Dependency: None (independent)
- Due: 2026-05-22

**Task 7.2: Build marketplace discovery and bot listing**
- Implement marketplace API for listing available bot configurations
- Build bot discovery UI (filter by role, plan, connector requirements)
- Add bot deployment quick-start workflow
- Acceptance criteria: Marketplace accessible, bot listing works, quick-start onboards
- Owner: Frontend Lead + Product Lead
- Dependency: 1.1, 1.2
- Due: 2026-05-26

### Workstream 8: Testing and Deployment (Tasks 8.1–8.3)
Build end-to-end testing, load testing, and production deployment.

**Task 8.1: Implement comprehensive test suite**
- Build unit tests for provisioning, connector, approval logic (target >80% coverage)
- Build integration tests (provisioning → runtime → connector → action)
- Build end-to-end tests (signup → provisioning → bot action → approval)
- Acceptance criteria: All tests pass, coverage >80%, CI/CD pipeline green
- Owner: QA Lead
- Dependency: All workstreams
- Due: 2026-05-24

**Task 8.2: Build production deployment and runbooks**
- Create Azure Bicep/Terraform for production infrastructure (VMs, storage, Key Vault, networking)
- Implement blue-green deployment strategy
- Build operational runbooks (incident response, scale-up, failover)
- Acceptance criteria: IaC reviewed, deployment tested, runbooks signed by ops
- Owner: Cloud Ops + DevOps
- Dependency: All workstreams
- Due: 2026-05-26

**Task 8.3: Run pre-launch quality and security gates**
- Complete security audit (SAST, DAST, penetration testing)
- Run load testing (target 1000 concurrent bots)
- Validate all gold-standard score evidence is fresh (<90 days)
- Acceptance criteria: Security findings <critical, load test passes, evidence complete
- Owner: Security Lead + QA Lead
- Dependency: 8.1, 8.2
- Due: 2026-05-26

### Workstream 9: Tier 1/2 Local Workspace Actions (Tasks 9.1–9.11)
Implement the Developer Agent Tier 1 and Tier 2 local workspace actions for Claude Code / Codex parity. All implemented in `apps/agent-runtime/src/local-workspace-executor.ts`.

**Task 9.1: Implement `workspace_list_files`**
- Recursive directory walk with configurable depth, pattern filter, and include_dirs option
- Skips `.git`, `node_modules`, `__pycache__`, `dist`, `build` directories
- Returns JSON string array of relative paths
- Status: Completed (2026-04-30)
- Evidence: apps/agent-runtime/src/local-workspace-executor.ts, apps/agent-runtime/src/local-workspace-executor.test.ts
- Validation: pnpm --filter @agentfarm/agent-runtime test (118/118 pass)
- Risk: low (no approval required)
- Due: 2026-04-30

**Task 9.2: Implement `workspace_grep`**
- Regex search across workspace files with optional file_pattern, context_lines, and max_results
- Returns JSON `[{file, line, col, text, context_before?, context_after?}]`
- Status: Completed (2026-04-30)
- Evidence: apps/agent-runtime/src/local-workspace-executor.ts, apps/agent-runtime/src/local-workspace-executor.test.ts
- Validation: pnpm --filter @agentfarm/agent-runtime test (118/118 pass)
- Risk: low (no approval required)
- Due: 2026-04-30

**Task 9.3: Implement `file_move`**
- Rename or move a file/directory within the workspace sandbox
- safeChildPath enforced on both source and destination; parent directories auto-created
- Status: Completed (2026-04-30)
- Evidence: apps/agent-runtime/src/local-workspace-executor.ts, apps/agent-runtime/src/local-workspace-executor.test.ts
- Validation: pnpm --filter @agentfarm/agent-runtime test (118/118 pass)
- Risk: medium (requires approval)
- Due: 2026-04-30

**Task 9.4: Implement `file_delete`**
- Delete a file or directory from the workspace sandbox; supports recursive flag
- safeChildPath enforced; force:true prevents errors on missing files
- Status: Completed (2026-04-30)
- Evidence: apps/agent-runtime/src/local-workspace-executor.ts, apps/agent-runtime/src/local-workspace-executor.test.ts
- Validation: pnpm --filter @agentfarm/agent-runtime test (118/118 pass)
- Risk: medium (requires approval)
- Due: 2026-04-30

**Task 9.5: Implement `workspace_install_deps`**
- Auto-detects package manager: pnpm-lock.yaml→pnpm, yarn.lock→yarn, go.mod→go mod tidy, requirements.txt→pip, Cargo.toml→cargo build, else→npm
- Supports explicit override via command field
- Status: Completed (2026-04-30)
- Evidence: apps/agent-runtime/src/local-workspace-executor.ts
- Validation: pnpm --filter @agentfarm/agent-runtime test (118/118 pass)
- Risk: medium (requires approval)
- Due: 2026-04-30

**Task 9.6: Implement `run_linter`**
- Runs ESLint by default; supports fix mode, file_path targeting, max_time_ms, and explicit command override
- Status: Completed (2026-04-30)
- Evidence: apps/agent-runtime/src/local-workspace-executor.ts
- Validation: pnpm --filter @agentfarm/agent-runtime test (118/118 pass)
- Risk: medium (requires approval)
- Due: 2026-04-30

**Task 9.7: Implement `apply_patch`**
- Applies a unified diff string using `git apply`
- Writes patch to `.agentfarm/patch-<ts>.diff` temp file, cleans up on success or failure
- Supports check_only mode (dry-run without applying)
- Status: Completed (2026-04-30)
- Evidence: apps/agent-runtime/src/local-workspace-executor.ts, apps/agent-runtime/src/local-workspace-executor.test.ts
- Validation: pnpm --filter @agentfarm/agent-runtime test (118/118 pass)
- Risk: medium (requires approval)
- Due: 2026-04-30

**Task 9.8: Implement `git_stash`**
- Supports push (with optional message), pop, drop, and list operations
- Status: Completed (2026-04-30)
- Evidence: apps/agent-runtime/src/local-workspace-executor.ts, apps/agent-runtime/src/local-workspace-executor.test.ts
- Validation: pnpm --filter @agentfarm/agent-runtime test (118/118 pass)
- Risk: medium (requires approval)
- Due: 2026-04-30

**Task 9.9: Implement `git_log`**
- Returns structured JSON commit history via `git log --pretty=format:%H|%h|%s|%an|%ae|%ai`
- Output: `[{hash, short_hash, subject, author_name, author_email, date}]`
- Supports limit, branch, and since filtering
- Status: Completed (2026-04-30)
- Evidence: apps/agent-runtime/src/local-workspace-executor.ts, apps/agent-runtime/src/local-workspace-executor.test.ts
- Validation: pnpm --filter @agentfarm/agent-runtime test (118/118 pass)
- Risk: low (no approval required)
- Due: 2026-04-30

**Task 9.10: Implement `workspace_scout`**
- Returns compact JSON project summary: language, framework, package_manager, test_command, build_command, scripts, readme_excerpt (first 800 chars), dependencies
- Reads package.json, README.md, go.mod, requirements.txt
- Status: Completed (2026-04-30)
- Evidence: apps/agent-runtime/src/local-workspace-executor.ts, apps/agent-runtime/src/local-workspace-executor.test.ts
- Validation: pnpm --filter @agentfarm/agent-runtime test (118/118 pass)
- Risk: low (no approval required)
- Due: 2026-04-30

**Task 9.11: Implement `workspace_checkpoint`**
- Creates a temp git branch (`agentfarm/checkpoints/<name>`) for safe WIP rollback
- restore_from mode: `git reset --hard <ref>` for checkpoint restoration
- Status: Completed (2026-04-30)
- Evidence: apps/agent-runtime/src/local-workspace-executor.ts
- Validation: pnpm --filter @agentfarm/agent-runtime test (118/118 pass)
- Risk: medium (requires approval)
- Due: 2026-04-30

## Execution Tracking (Initial Assignment)

| Task ID | Task Name | Owner | Status | Priority | Dependency | Due Date | Scope Check | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1.1 | Implement signup and auth flow | Engineering Lead | Completed | P0 | None | 2026-04-21 | Pass | POST /auth/signup — creates Tenant/TenantUser/Workspace/Bot/ProvisioningJob in atomic transaction; HMAC session token returned in body + Set-Cookie; POST /auth/login — scrypt-based password verify with timing-safe comparison; POST /auth/logout — clears cookie. Password hashed via Node crypto.scrypt (no external dependency). |
| 1.2 | Dashboard access control and session management | Engineering Lead | Completed | P0 | 1.1 | 2026-04-21 | Pass | Auth preHandler hardened: public paths (signup/login/logout) bypass session check but still rate-limited at 20 req/min to slow brute-force. All /v1/* routes require valid session when API_REQUIRE_AUTH=true. Dashboard page.tsx now reads agentfarm_session cookie via next/headers cookies() first, then falls back to DASHBOARD_API_TOKEN env and dev-session endpoint. Workspace RLS enforced on all :workspaceId params. |
| 1.3 | Dashboard provisioning status UI | Frontend Lead | Completed | P0 | 1.2 | 2026-04-21 | Pass | login/page.tsx and signup/page.tsx created as client components with form validation, error display, and cookie-setting on success. Provisioning section upgraded to numbered step pipeline with done/active/pending state pills, job ID display, start time, failure error+remediation card, and completed success banner. Auth-gated redirect to /login when API_REQUIRE_AUTH=true and no session. |
| 2.1 | Provisioning state machine and job processor | Engineering Lead + Cloud Ops | Completed | P0 | 1.1 | 2026-04-22 | Pass | 11-state machine (queued→validating→creating_resources→bootstrapping_vm→starting_container→registering_runtime→healthchecking→completed). Async poll loop (5s active / 30s idle, max 3 concurrent jobs). Atomic job claim via updateMany WHERE status=queued. Per-state audit events emitted. Failure path: →failed→cleanup_pending→cleaned_up with remediationHint. RuntimeInstance upserted at registering_runtime; Bot/Workspace/Tenant marked ready on completion. Azure SDK calls stubbed (Task 2.2 wires real SDK). SIGTERM/SIGINT graceful shutdown hooked. api-gateway typecheck clean ✓ |
| 2.2 | Azure VM bootstrap and Docker setup | Cloud Ops + Engineering Lead | Completed | P0 | 2.1 | 2026-04-22 | Pass | azure-client.ts: DefaultAzureCredential singleton, ARM client factories (resource/compute/network), vmSkuForTier map. vm-bootstrap.ts: cloud-init YAML builder (apt Docker CE install, ACR docker login, systemd agentfarm-bot service, env file at /etc/agentfarm/bot.env — no secrets in image layers). azure-provisioning-steps.ts: validateTenant (resourceGroups.list probe), createResources (RG + VNet + subnet + NIC), bootstrapVm (ARM VM create + poll Succeeded + resolve private IP), startContainer (poll /health 18×10s), healthCheck (single GET /health), cleanupResources (resourceGroups.beginDeleteAndWait). Stubs in provisioning-worker.ts replaced with real delegation calls. api-gateway typecheck clean ✓ |
| 2.3 | Provisioning failure recovery and cleanup | Cloud Ops | Completed | P0 | 2.1, 2.2 | 2026-04-22 | Pass | provisioning-worker.ts: rollback side effects added by failure state (Bot→failed, Workspace→failed, Tenant→degraded; RuntimeInstance→failed for late-stage failures). cleanup_pending recovery worker added inside poll loop with claim marker (`cleanup_in_progress:*`) and retry cleanup to cleaned_up. Failure path now preserves remediation and retry metadata in cleanupResult. Dashboard page now shows owner-facing remediation alert for failed, cleanup_pending, and cleaned_up statuses. |
| 2.4 | Provisioning SLA and monitoring | Cloud Ops | Completed | P1 | 2.1, 2.3 | 2026-04-22 | Pass | Worker monitors active jobs against 10m SLA target, emits stuck-state alerts when any monitored state exceeds 1h (with cooldown), and enforces 24h timeout auto-remediation by failing and entering cleanup flow. API provisioning payload now exposes latency/sla/stuck/timeout fields. Dashboard provisioning card and KPI strip now display SLA status, current latency vs target, stuck alert state, and timeout timestamp. |
| 3.1 | Docker runtime contract and bot entrypoint | Engineering Lead | Completed | P0 | 2.2 | 2026-04-22 | Pass | apps/agent-runtime now exposes runtime contract endpoints: POST /startup, GET /health/live, GET /health/ready, compatibility GET /health, POST /kill (graceful shutdown). Real worker loop + task intake integrated via POST /tasks/intake; runtime.worker_loops_started emitted only when worker loop is actually started during startup. Runtime state transitions include degraded on dependency failure and stopped on kill path. Contract tests added in src/runtime-server.test.ts covering startup success, /health/ready active→degraded transition, and /kill stopping→stopped behavior (all passing). |
| 3.2 | Bot core execution engine | AI/LLM Lead + Engineering Lead | Completed | P0 | 3.1 | 2026-04-22 | Pass | Nine LLM providers supported (openai, azure_openai, github_models, anthropic, google, xai, mistral, together, agentfarm). Auto mode with per-profile priority list and 5-minute rolling health-score reordering. Dashboard preset buttons (Ultra Low Cost / Balanced / Premium Quality). API gateway config route stores and redacts all nine provider keys. 92/92 agent-runtime tests, 159/159 api-gateway tests, all typechecks clean. See ADR-007. |
| 3.3 | Runtime observability and state management | Engineering Lead | Completed | P1 | 3.1 | 2026-05-16 | Pass | Structured runtime observability completed in `apps/agent-runtime/src/runtime-server.ts`: JSON event logging, bounded in-memory `/logs` feed, heartbeat loop metrics (`heartbeat_sent`, `heartbeat_failed`, `last_heartbeat_at`), and explicit runtime state transition history via `/state/history`. Validated by runtime tests (`logs endpoint`, `heartbeat loop`, `state history endpoint`) and current local run: `pnpm --filter @agentfarm/agent-runtime test` (24/24 passing) + `typecheck` pass. |
| 4.1 | Connector auth state machine and OAuth initiation | Engineering Lead + Security Lead | Completed | P0 | 2.1 | 2026-05-12 | Pass | OAuth initiate + callback implemented for Jira/Teams/GitHub with state nonce validation, workspace scope checks, auth session lifecycle, and Key Vault reference-only persistence (no raw tokens in DB). Route tests passing. |
| 4.2 | Connector token lifecycle and refresh | Engineering Lead | Completed | P0 | 4.1 | 2026-05-16 | Pass | Refresh/revoke/report-error flows implemented with expiry-window refresh logic, permission/scope recovery handling, and connector auth event logging. Route tests passing. |
| 4.3 | Normalized connector actions | Engineering Lead + Integration Lead | Completed | P0 | 4.1, 4.2 | 2026-05-21 | Pass | Normalized execute endpoint implemented for 6 actions with connector availability checks, retry with backoff, failure classification, and ConnectorAction persistence logs. Route tests passing. |
| 4.4 | Connector error recovery and health checks | Integration Lead | Completed | P1 | 4.3 | 2026-05-23 | Pass | Connector health check + summary endpoints implemented with monthly scope validation handling, auth/rate-limit/network error remediation mapping, metadata updates, and dashboard-ready summary fields. Route tests passing. |
| 5.1 | Risk classification and approval routing | Security and Safety Lead | Completed | P0 | 3.2 | 2026-05-15 | Pass | Approval routing and risk enforcement completed end-to-end: intake routes medium/high to pending approvals, immutable approval checks enforced, escalation endpoint honors record-specific timeout policy, and runtime service-token path is supported. Verified by api-gateway tests (`intake queues medium/high`, `escalate marks overdue`, `per-record timeout`, `immutability`) and local run `pnpm --filter @agentfarm/api-gateway test` (34/34 passing). |
| 5.2 | Approval dashboard UI and decision workflow | Frontend Lead + Security Lead | Completed | P0 | 5.1 | 2026-05-20 | Pass | Completed approval decision workflow end-to-end: decision endpoint + escalation workflow + audit side effects fully tested; dashboard ApprovalQueuePanel now supports decision actions with reason capture, risk/search filtering, pending/recent pagination, escalation trigger, and server-fed SLA metrics (`pending_count`, `decision_count`, `p95_decision_latency_seconds`) from workspace dashboard API. |
| 5.3 | Approval enforcement and action execution | Engineering Lead | Completed | P0 | 5.1, 5.2 | 2026-05-24 | Pass | Completed approval enforcement end-to-end: risky tasks block in runtime pending-approval queue; approval decisions execute or cancel with immutable audit trail; approved decisions run real connector execution via gateway (`/v1/connectors/actions/execute`) using ops-safe service token auth (`x-connector-exec-token`); decision cache + cache-hit execution path added; rejection/timeout rejection persist graceful `cancelled` action results and emit bot-notification runtime events. Runtime `/decision` webhook auth (`x-runtime-decision-token`) and gateway-to-runtime decision webhook fanout are both implemented and fully tested. |
| 6.1 | Audit event logging and retention | Engineering Lead + Compliance Lead | Completed | P0 | 2.1, 3.1, 4.3, 5.1 | 2026-05-18 | Pass | Completed dedicated audit API module: append-only event ingestion (`POST /v1/audit/events`), compliance query endpoint with scoped filters/pagination cursor (`GET /v1/audit/events`), and retention cleanup policy endpoint with dry-run + execute modes (`POST /v1/audit/retention/cleanup`). Routes wired into gateway and covered by route tests. |
| 6.2 | Evidence dashboard and compliance reporting | Compliance Lead | Completed | P1 | 6.1 | 2026-05-26 | Pass | Completed evidence/compliance dashboard workflow: new interactive Evidence & Compliance panel with evidence freshness indicator (latest event age + stale warning), filterable audit query UI (severity/event type/bot/time window), and compliance export to CSV/JSON. Added dashboard API proxy routes for audit query and retention cleanup plus export endpoint (`/api/audit/export`) and integrated panel into home page replacing static evidence feed. |
| 7.1 | Resume website (from Sprint 0 deferred) | Frontend Lead + DevOps | In progress | P1 | None | 2026-05-22 | Pass | SWA deployment workflow added (`.github/workflows/website-swa.yml`) with main/PR triggers and deployment token auth; SWA runtime headers config added (`apps/website/staticwebapp.config.json`); operations runbook created for domain/CDN/analytics/Lighthouse signoff (`operations/runbooks/website-swa-runbook.md`). Automated production verification command added (`pnpm verify:website:prod`) backed by `scripts/website-swa-verify.mjs`, with evidence output path documented in runbook (`operations/quality/7.1-website-swa-verification.json`). Website build validated using `pnpm --filter @agentfarm/website exec next build --no-lint`. Pending external platform-owner steps: configure repository secret `AZURE_STATIC_WEB_APPS_API_TOKEN_WEBSITE`, run first production deployment workflow, and complete DNS/custom-domain TLS cutover. |
| 7.2 | Build marketplace discovery and bot listing | Frontend Lead + Product Lead | Completed | P1 | 1.1, 1.2 | 2026-05-26 | Pass | Implemented marketplace listing API (`apps/website/app/api/marketplace/bots/route.ts`) with plan/department/availability/search filters; added quick-start onboarding API (`apps/website/app/api/marketplace/quick-start/route.ts`) with payload validation and onboarding request IDs; implemented checkout onboarding workflow page (`apps/website/app/checkout/page.tsx`) wired to cart selection and quick-start submission. Build verified via `pnpm --filter @agentfarm/website exec next build --no-lint`. |
| 8.1 | Comprehensive test suite | QA Lead | Completed | P0 | All core tasks | 2026-05-24 | Pass | Quality gate fully closed: explicit >=80% line threshold enforcement implemented via `scripts/coverage-threshold-check.mjs` and integrated into package coverage scripts; minimal E2E smoke lane implemented via `scripts/e2e-smoke.mjs`; consolidated report generated at `operations/quality/8.1-quality-gate-report.md` with passing gate run (`pnpm quality:gate`, exit 0). |
| 8.2 | Production deployment and runbooks | Cloud Ops + DevOps | In progress | P0 | All core tasks | 2026-05-26 | Pass | Release operations runbook created at `operations/runbooks/mvp-launch-ops-runbook.md`; `.azure/deployment-plan.md` advanced to `Validated` with proof. Execution now blocked on Azure sign-in context and production deployment window. |
| 8.3 | Pre-launch quality and security gates | Security Lead + QA Lead | In progress | P0 | 8.1, 8.2 | 2026-05-26 | Pass | Security/load/evidence gate checklist prepared in `operations/runbooks/mvp-launch-ops-runbook.md`. Pending external execution artifacts (SAST/DAST reports, load test outputs, final evidence freshness export) after 8.2 deployment run. |

## Sprint 1 Milestones
1. **Week 1 (04-28 to 05-04):** Signup + Auth + Provisioning Job Processor live
2. **Week 2 (05-05 to 05-11):** VM bootstrap + Docker runtime + OAuth initiation complete
3. **Week 3 (05-12 to 05-18):** Token lifecycle + Connector actions + Approval routing live
4. **Week 4 (05-19 to 05-26):** Bot execution + Full E2E testing + Production deployment ready

## Risk Management
1. **Docker image size > 500MB:** Optimize image, parallel pulls from ACR
2. **Azure quota errors during mass provisioning test:** Pre-request quota increases, stage load testing
3. **Token refresh race conditions:** Implement distributed lock in Key Vault-backed cache
4. **Approval queue bottleneck:** Build approval SLA dashboard to monitor latency; auto-escalate after 5 min for high-risk
5. **Connector API rate limits:** Implement per-connector backoff strategy and quota pooling

## Success Criteria
1. All 24 tasks marked **Completed** by 2026-05-26
2. **All tests passing** (>80% coverage)
3. **Load test passes** (1000 concurrent bots)
4. **Security audit** passes with <0 critical findings
5. **Gold-standard evidence** freshness <90 days for all 3 gates (Identity Realism, Role Fidelity, Autonomy with Approval)
6. **MVP launch gate** signed by Product Lead, Engineering Lead, Security and Safety Lead

## Current Status
1. List status: **22/24 tasks completed; remaining 2 tasks are in active release-operations execution**.
2. Verified now: `pnpm quality:gate` passing (API Gateway coverage gate, Agent Runtime coverage gate, typechecks, dashboard typecheck, website smoke lane).
3. LLM routing extended (2026-04-29): nine provider adapters live (openai, azure_openai, github_models, anthropic, google, xai, mistral, together, agentfarm); Auto fallback chain with health-score reordering; dashboard presets. Agent-runtime: 92/92 tests. API-gateway: 159/159 tests. See ADR-007 and R-006.
3. Active blockers: Azure extensions auth context is signed out; GitHub secret and DNS/domain cutover require platform-owner actions.
4. Next action: complete platform-owner steps, execute deployment, then run security/load/freshness evidence gates for launch signoff.
