# AgentFarm Future Agent Build Playbook

## Purpose
Define mandatory rules and workflow steps for future agent builds so all contributors preserve AgentFarm architecture, safety posture, and traceability.

## Applicability
This playbook applies to all future agent design, implementation, and release work across apps, services, packages, and infrastructure.

## Execution Handoff Artifact
For sprint execution tracking, use:
1. planning/developer-agent-sprint-board.md

## Non-Negotiable Rules
1. Planning-first: no implementation starts without mapped tasks and acceptance criteria.
2. Boundary-first: respect monorepo boundaries between apps, services, and shared packages.
3. Governance-first: medium and high risk actions require approval routing.
4. Evidence-first: every execution path writes auditable records.
5. Least privilege: no role or connector permission expansion without explicit approval.
6. Fail-safe defaults: uncertain actions route to approval, not auto execution.

## Build Sequence for Every New Agent Capability

### Step 1: Scope and Contract Definition
1. Define capability objective and non-goals.
2. Map to role scope, connector scope, and risk category.
3. Add or update shared types before service-local types.
4. Define immutable event and audit schemas before runtime behavior changes.

Output artifacts:
1. Scope statement.
2. Contract change list.
3. Risk and approval impact statement.

### Step 2: Architecture and Policy Alignment
1. Verify control plane, runtime plane, and evidence plane impacts.
2. Verify policy-engine classification behavior and fallback handling.
3. Verify kill-switch and rollback behavior for new action paths.

Output artifacts:
1. Architecture delta note.
2. Policy delta note.
3. Safety signoff checklist.

### Step 3: Implementation Plan
1. Break work into P0, P1, P2 slices with dependency order.
2. Assign owner, acceptance criteria, and scope check for each task.
3. Define rollout path: shadow mode, guarded mode, active mode.

Output artifacts:
1. Sprint-ready task list.
2. Validation matrix.
3. Rollout gate checklist.

### Step 4: Build and Validate
1. Implement smallest viable vertical slice first.
2. Validate with typecheck, lint, tests, and quality gate scripts.
3. Capture evidence references for behavior changes.
4. Verify no prohibited scope expansion occurred.

Output artifacts:
1. Test and quality evidence.
2. Release gate evidence pack.
3. Rollback verification notes.

### Step 5: Release and Operate
1. Enable in controlled cohorts first.
2. Monitor KPI deltas and governance incidents.
3. Record post-release findings and update this playbook when rules need refinement.

Output artifacts:
1. Launch report.
2. KPI delta report.
3. Lessons learned.

## Required Quality and Security Checks
1. Type and lint pass in impacted workspaces.
2. Unit and integration tests for new behavior.
3. Approval routing test cases for medium and high risk actions.
4. Audit/evidence completeness checks.
5. Secret handling and path traversal protections.
6. Kill-switch activation and graceful stop behavior.

## Change Control Triggers (Must Escalate)
1. New role type or role privilege changes.
2. New connector or expanded connector write actions.
3. Runtime shell or filesystem privilege broadening.
4. Policy pack behavior changes affecting risk classification.
5. Data retention, evidence schema, or audit immutability changes.
6. Deployment topology changes affecting isolation model.

## Design Standards for Future Agents
1. Prefer deterministic workflows first, then adaptive automation.
2. Keep human approval UX explicit and context-rich.
3. Surface action intent, risk rationale, and expected blast radius before execution.
4. Treat memory as controlled capability with provenance and approval gates.
5. Ensure every autonomous proposal has a rollback path.

## Anti-Patterns to Reject
1. Feature-first implementation without risk and evidence design.
2. Cross-service type duplication instead of shared contract updates.
3. Direct service-to-service coupling that bypasses approved interfaces.
4. Hidden connector behavior not represented in normalized contracts.
5. Enabling high-risk mutation actions by default.

## Documentation Update Checklist (Mandatory per capability)
1. Update planning doc for scope and acceptance criteria.
2. Update architecture doc for control/runtime/evidence impact.
3. Update task list with owner, status, and evidence references.
4. Update runbook if operator behavior changes.
5. Update KPI definitions if measurement logic changes.

## Future Agent Readiness Scorecard
Use this scorecard before approving implementation start.

1. Scope clarity: objective and non-goals are explicit.
2. Contract readiness: shared types and events are versioned.
3. Safety readiness: risk classes, approvals, and kill-switch behavior are specified.
4. Test readiness: unit, integration, and gate tests defined.
5. Evidence readiness: audit fields and retention references defined.
6. Rollout readiness: shadow to active activation plan defined.

Approval rule:
Start implementation only when all six scorecard items are marked ready.

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).
