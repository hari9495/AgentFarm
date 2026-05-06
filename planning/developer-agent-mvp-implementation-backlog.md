# AgentFarm Developer Agent MVP Implementation Backlog

## Purpose
Define a complete, execution-ready backlog for what AgentFarm can implement now with the MVP Developer Agent, plus staged extensions that remain aligned with governance-first architecture.

## Companion Planning Documents
1. planning/developer-agent-sprint-board.md
2. planning/future-agent-build-playbook.md
3. planning/mvp-approved-execution-task-list.md
4. planning/developer-agent-sprint-program.md
5. planning/sprints/sprint-1-trust-and-execution-core.md
6. planning/sprints/sprint-2-adoption-and-reliability-scale.md
7. planning/sprints/sprint-3-memory-and-compliance-packaging.md

## Scope and Boundaries
1. Role scope is Developer Agent only.
2. Connector scope is Jira, Microsoft Teams, GitHub, and company email.
3. Medium and high risk actions require approval before execution.
4. All execution paths must produce action logs and auditable evidence.
5. Any expansion beyond this document requires architecture and safety signoff.

## Implementation Principles
1. Trust and control before autonomy breadth.
2. Deterministic workflow before dynamic role spawning.
3. Evidence completeness is a release gate, not optional telemetry.
4. MVP-first delivery: ship operator value in narrow slices with strict rollback.

## Release Wave Plan

### Wave 1 (P0): Operationalize Existing MVP Capabilities
Objective: turn built capabilities into a stable day-to-day Developer Agent workflow.

#### Epic P0.1: Task Intake to Governed Execution
Tasks:
1. Add a single Developer Agent task contract used by dashboard, API gateway, and runtime.
2. Enforce capability snapshot checks on every task before planning or execution.
3. Standardize low risk execute path and medium/high risk approval route.

Acceptance criteria:
1. 100 percent of tasks are traceable from intake to final status.
2. Capability-policy blocked tasks execute zero connector or workspace mutations.
3. Approval-required actions cannot execute without an approval record.

Dependencies:
1. Existing risk classification and approval APIs.
2. Runtime capability snapshot compatibility checks.

#### Epic P0.2: Repo Operations Assistant Reliability
Tasks:
1. Stabilize workspace action chains: scout, read/search, patch/edit, validate, checkpoint.
2. Add deterministic fallback sequence when auto command detection fails.
3. Add operator-visible failure reasons for sandbox path, command timeout, and policy block.

Acceptance criteria:
1. At least 90 percent success on scoped low-risk repo tasks in pilot set.
2. Failed actions return typed error codes and remediation hint text.
3. All file mutations stay inside workspace sandbox boundaries.

Dependencies:
1. Workspace action catalog currently implemented in runtime.

#### Epic P0.3: CI Quality Loop and Safe Escalation
Tasks:
1. Enforce run_linter and run_tests pre-PR for mutation tasks when commands are available.
2. Add escalation packet for failed quality checks with impacted files and rollback hint.
3. Record validation summary in evidence service for every mutation workflow.

Acceptance criteria:
1. 100 percent mutation workflows include validation status in evidence.
2. Auto-fix loop never commits or pushes without approval when policy requires approval.
3. Escalation packet includes risk level, failing checks, and next recommended action.

Dependencies:
1. Existing autonomous loop and approval service.

#### Epic P0.4: Approval Notification Discipline
Tasks:
1. Standardize approval-only notifications across enabled channels.
2. Add configurable notification trigger policy per workspace.
3. Suppress duplicate alerts for the same approval request window.

Acceptance criteria:
1. No non-approval notification sent through approval-only channel APIs.
2. Duplicate notification rate under 2 percent for pilot workload.
3. Approval decision latency metrics available per workspace.

Dependencies:
1. Notification service trigger filters and approval service records.

### Wave 2 (P1): Trust Expansion and Productivity Gains
Objective: raise adoption through safe parallelism and stronger context.

#### Epic P1.1: Shadow Mode
Tasks:
1. Add shadow-run mode where agent produces recommendations without mutating state.
2. Compare shadow recommendation to human-completed outcome.
3. Track shadow precision metrics by task class.

Acceptance criteria:
1. Shadow mode produces full plan and evidence artifact with no external mutation.
2. Comparison report generated for at least 3 task classes.
3. Conversion decision template provided for enabling active mode.

#### Epic P1.2: Escalation with Context Pack
Tasks:
1. Build approval payload including diff preview, test summary, risk rationale, and rollback path.
2. Include what-if simulation text for reject versus approve consequences.
3. Persist approver rationale for downstream learning.

Acceptance criteria:
1. Medium/high approvals include all mandatory context pack fields.
2. Approver action time improves versus P0 baseline.
3. Approval rationale is queryable by task and workspace.

#### Epic P1.3: Monorepo Intelligence
Tasks:
1. Use dependency graph output to identify impacted services and likely affected tests.
2. Add recommended validation plan based on changed paths and package boundaries.
3. Surface architecture-boundary warnings before mutations.

Acceptance criteria:
1. Impacted-test recommendation precision above 70 percent in pilot set.
2. Boundary violation warnings shown before execution.
3. Rework rate reduced versus P0 baseline.

### Wave 3 (P2): Memory and Enterprise Readiness
Objective: add reusable learning and compliance export without breaking governance.

#### Epic P2.1: Project Memory and Controlled Promotion
Tasks:
1. Store project-scoped conventions, successful fix patterns, and recurring failure signatures.
2. Add approval-gated promotion flow from project memory to organization memory.
3. Add provenance fields to all promoted entries.

Acceptance criteria:
1. Memory entries include source task, approver, and policy version.
2. Zero cross-tenant leaks by design checks and tests.
3. Repeat-task success improves against no-memory baseline.

#### Epic P2.2: Compliance Evidence Pack Starter
Tasks:
1. Generate export bundle with approvals, action logs, policy decisions, and validation outcomes.
2. Provide SOC2 and ISO-ready evidence map for MVP controls.
3. Add immutable export hash and timestamp metadata.

Acceptance criteria:
1. Evidence pack generated from a single workflow run without manual joins.
2. Pack completeness check passes for required MVP controls.
3. Export integrity can be verified via hash.

## KPI Tree for Delivery

### North Star
Governed Autonomous Throughput: count of production-relevant engineering tasks completed under policy with full evidence and no critical governance incident.

### Driver KPIs
1. Task completion quality.
2. Rework rate.
3. Escalation correctness.
4. Approval latency.
5. Audit completeness.
6. Cost per successful outcome.

### Stage Targets
1. P0 target: establish baseline and achieve stable evidence completeness above 95 percent.
2. P1 target: improve approval latency by at least 20 percent and reduce rework by at least 15 percent.
3. P2 target: improve repeat-task success by at least 20 percent and cut evidence assembly time by at least 40 percent.

## Delivery Governance
1. Any task touching risk policy, approval routing, connector scope, or runtime privilege requires safety and architecture signoff before merge.
2. Every release slice must pass quality gate scripts and produce evidence references.
3. Kill switch behavior must remain test-covered in every release.
4. Any feature marked out-of-scope in MVP docs cannot be activated without explicit gate approval.

## Out-of-Scope Until New Gate Approval
1. New external role types beyond Developer Agent.
2. New connectors beyond approved MVP set.
3. Live meeting voice participation with autonomous actioning.
4. Multi-region runtime scale expansion as default behavior.
5. Public marketplace publication flow.

## Ready-to-Start Sprint Checklist
1. Confirm task maps to this backlog and MVP scope docs.
2. Confirm owner, dependency, and acceptance criteria.
3. Confirm approval and risk impact classification.
4. Confirm evidence fields and dashboard visibility changes.
5. Confirm rollback and kill-switch path.
