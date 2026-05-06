# AgentFarm Developer Agent Sprint Board

## Purpose
Provide a sprint-ready board derived from the MVP implementation backlog, with explicit execution metadata for immediate delivery planning.

## Planning Sources
1. planning/developer-agent-mvp-implementation-backlog.md
2. planning/future-agent-build-playbook.md
3. mvp/mvp-scope-and-gates.md
4. planning/mvp-approved-execution-task-list.md
5. planning/developer-agent-sprint-program.md

## Board Rules
1. Do not start implementation for tasks with unresolved dependency.
2. Any scope check marked Fail must be escalated before work continues.
3. Every task must attach test and evidence links before closure.
4. Medium and high risk mutations require approval routing verification in DoD.

## Sprint Board (Recommended Initial Sequencing)

| Task ID | Sprint | Task Name | Owner | Estimate | Dependency | Priority | Scope Check | Definition of Done |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DA-P0-001 | Sprint A | Unify Developer task contract across dashboard, API, runtime | Engineering Lead | 3d | None | P0 | Pass | Contract schema merged in shared types, intake validation added, integration tests pass, evidence fields mapped. |
| DA-P0-002 | Sprint A | Enforce capability snapshot on all execution paths | Runtime Lead | 2d | DA-P0-001 | P0 | Pass | Capability check invoked pre-execution on connector and workspace actions, blocked task tests added, no bypass path remains. |
| DA-P0-003 | Sprint A | Standardize low-risk execute and medium/high approval route | Security and Safety Lead | 3d | DA-P0-001, DA-P0-002 | P0 | Pass | Risk route matrix implemented and tested, low-risk direct path works, medium/high cannot execute without approval record. |
| DA-P0-004 | Sprint A | Stabilize workspace action chain reliability | Runtime Lead | 4d | DA-P0-002 | P0 | Pass | Scout-read-edit-validate-checkpoint flow works in regression suite, sandbox path tests pass, typed failure codes returned. |
| DA-P0-005 | Sprint A | Add deterministic command fallback for build/test/lint | Runtime Lead | 2d | DA-P0-004 | P1 | Pass | Fallback command sequence implemented, timeout/error handling tested, failure hint text visible in operator output. |
| DA-P0-006 | Sprint A | Enforce pre-PR validation and evidence summary | QA Lead | 3d | DA-P0-003, DA-P0-004 | P0 | Pass | Mutation workflows run lint/tests where available, evidence record includes validation result, negative tests verify missing-command path. |
| DA-P0-007 | Sprint A | Build escalation packet for failed quality gates | Product Engineering Lead | 2d | DA-P0-006 | P1 | Pass | Escalation packet includes risk, failing checks, impacted files, rollback hint, UI/API contract tests pass. |
| DA-P0-008 | Sprint A | Harden approval-only notification trigger discipline | Integration Lead | 2d | DA-P0-003 | P1 | Pass | Non-approval events are filtered, duplicate suppression window tested, approval latency metrics exposed. |
| DA-P1-001 | Sprint B | Add Shadow Mode (plan-only no mutation) | Architecture Owner | 4d | DA-P0-003, DA-P0-006 | P0 | Pass | Shadow path produces plan and evidence only, no connector/workspace mutation side effects, comparison report baseline generated. |
| DA-P1-002 | Sprint B | Build context-rich approval packet (diff, tests, rollback, what-if) | Product Engineering Lead | 3d | DA-P1-001 | P1 | Pass | Approval payload includes all required context fields, approver rationale persisted, query endpoint returns rationale by task. |
| DA-P1-003 | Sprint B | Add monorepo impact analysis and test recommendations | Runtime Lead | 5d | DA-P0-004 | P1 | Pass | Dependency graph integration complete, impacted test suggestions generated, boundary warnings shown pre-mutation, precision benchmark captured. |
| DA-P2-001 | Sprint C | Implement project-scoped memory store and retrieval | Engineering Lead | 4d | DA-P1-001 | P1 | Pass | Memory entries persisted with provenance, read/write APIs tested, tenant/project isolation tests pass. |
| DA-P2-002 | Sprint C | Add approval-gated memory promotion to org scope | Security and Safety Lead | 3d | DA-P2-001 | P1 | Pass | Promotion requires approval record, policy checks enforced, audit trail includes approver and policy version. |
| DA-P2-003 | Sprint C | Generate compliance evidence export starter (SOC2/ISO map) | Compliance Engineering Lead | 4d | DA-P0-006, DA-P2-001 | P1 | Pass | Export bundle contains approvals, actions, policy decisions, validation outcomes, hash verification test passes. |

## Capacity and Scheduling Template
Use this table before each sprint start.

| Sprint | Available Capacity (person-days) | Planned Load (person-days) | Buffer | Notes |
| --- | --- | --- | --- | --- |
| Sprint A |  |  |  |  |
| Sprint B |  |  |  |  |
| Sprint C |  |  |  |  |

## Execution Status Template
Update this block continuously during execution.

| Task ID | Status | Owner | Start Date | End Date | Evidence Link | Scope Check | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DA-P0-001 | Not started | Engineering Lead |  |  |  | Pass |  |
| DA-P0-002 | Not started | Runtime Lead |  |  |  | Pass |  |
| DA-P0-003 | Not started | Security and Safety Lead |  |  |  | Pass |  |
| DA-P0-004 | Not started | Runtime Lead |  |  |  | Pass |  |
| DA-P0-005 | Not started | Runtime Lead |  |  |  | Pass |  |
| DA-P0-006 | Not started | QA Lead |  |  |  | Pass |  |
| DA-P0-007 | Not started | Product Engineering Lead |  |  |  | Pass |  |
| DA-P0-008 | Not started | Integration Lead |  |  |  | Pass |  |
| DA-P1-001 | Not started | Architecture Owner |  |  |  | Pass |  |
| DA-P1-002 | Not started | Product Engineering Lead |  |  |  | Pass |  |
| DA-P1-003 | Not started | Runtime Lead |  |  |  | Pass |  |
| DA-P2-001 | Not started | Engineering Lead |  |  |  | Pass |  |
| DA-P2-002 | Not started | Security and Safety Lead |  |  |  | Pass |  |
| DA-P2-003 | Not started | Compliance Engineering Lead |  |  |  | Pass |  |

## Release Exit Checklist
1. All P0 tasks are completed with evidence links.
2. Quality gate scripts pass in all impacted workspaces.
3. Approval routing tests pass for medium and high risk paths.
4. Kill-switch behavior verified and documented for affected services.
5. MVP scope boundaries remain intact or approved exceptions are recorded.

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).
