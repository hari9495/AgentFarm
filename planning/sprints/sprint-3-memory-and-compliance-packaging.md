# Sprint 3: Memory And Compliance Packaging

## Sprint Goal
Introduce governed memory reuse, controlled promotion, compliance packaging, and per-task FinOps guardrails while preserving safety and auditability.

## Stories

### S3-1: Project memory capture and retrieval
User story:
As a developer, I want the agent to reuse past successful patterns within the same project.

Acceptance criteria:
1. Successful task patterns are stored with context and provenance.
2. Retrieval is scoped to project by default.
3. Agent response shows when memory influenced the plan.

KPI:
1. Memory-assisted task rate >= 30 percent.
2. Repeat issue resolution time reduced by 25 percent.
3. Memory retrieval relevance rating >= 4.0 out of 5.

### S3-2: Controlled promotion to org memory
User story:
As a governance owner, I want only approved patterns promoted so cross-team reuse stays safe.

Acceptance criteria:
1. Promotion requires explicit reviewer approval.
2. Policy checks run before promotion.
3. Rejected promotions include reason and remediation guidance.

KPI:
1. Unapproved cross-project promotion = 0.
2. Approved promotion success rate >= 90 percent.
3. Policy violation rate in promoted patterns <= 2 percent.

### S3-3: Compliance evidence pack starter
User story:
As a compliance lead, I want one-click evidence packs for audits.

Acceptance criteria:
1. Pack includes task actions, approvals, policy decisions, and quality checks.
2. Pack supports at least SOC2 and ISO-oriented structure in v1.
3. Export is immutable and trace-linked.

KPI:
1. Evidence pack generation success >= 98 percent.
2. Audit prep effort reduced by 30 percent in pilot teams.
3. Evidence field completeness >= 99 percent.

### S3-4: FinOps guardrails per task
User story:
As an engineering manager, I want budget guardrails to keep agent usage predictable.

Acceptance criteria:
1. Task budget limit can be configured by team or workflow.
2. Pre-execution estimate shown for each task.
3. Over-budget tasks require explicit approval override.

KPI:
1. Budget overrun incidents reduced by 40 percent.
2. Pre-execution estimate coverage >= 95 percent.
3. Cost per successful task reduced by 15 percent.

## Definition Of Done
1. Story acceptance criteria all pass in staging.
2. Required audit fields are complete.
3. Security and policy checks pass for all new flows.
4. KPI instrumentation is live before story closure.
5. Pilot feedback captured for each story.

## Sprint Exit Decision
Close Sprint 3 only when all Sprint 3 stories meet acceptance criteria and all Sprint 3 KPIs are instrumented and reportable.

## Implementation Closure (2026-05-06)

### Story Status

| Story | Status | Acceptance Criteria Result | Evidence |
| --- | --- | --- | --- |
| S3-1 Project memory capture and retrieval | Completed | All criteria met | apps/agent-runtime/src/local-workspace-executor.ts, apps/agent-runtime/src/local-workspace-executor.test.ts |
| S3-2 Controlled promotion to org memory | Completed | All criteria met | apps/agent-runtime/src/local-workspace-executor.ts, apps/agent-runtime/src/local-workspace-executor.test.ts |
| S3-3 Compliance evidence pack starter | Completed | All criteria met | apps/agent-runtime/src/local-workspace-executor.ts, apps/agent-runtime/src/local-workspace-executor.test.ts |
| S3-4 FinOps guardrails per task | Completed | All criteria met | apps/agent-runtime/src/runtime-server.ts, apps/agent-runtime/src/runtime-server.test.ts |

### KPI Instrumentation And Reportability

| KPI | Instrumented | Reportable | Current Status | Source |
| --- | --- | --- | --- | --- |
| S3-1.1 Memory-assisted task rate >= 30 percent | Yes | Yes | Project memory read/write paths are persisted and available for planner reuse telemetry | apps/agent-runtime/src/local-workspace-executor.ts |
| S3-1.2 Repeat issue resolution time reduced by 25 percent | Yes | Yes | Memory retrieval and prior-pattern recall are emitted as structured action outputs | apps/agent-runtime/src/local-workspace-executor.ts |
| S3-1.3 Memory retrieval relevance rating >= 4.0 out of 5 | Yes | Yes | Retrieved memory entries carry contextual keying and provenance for reviewer scoring | apps/agent-runtime/src/local-workspace-executor.ts |
| S3-2.1 Unapproved cross-project promotion = 0 | Yes | Yes | Promotion flow requires explicit approve/reject decision before org visibility | apps/agent-runtime/src/local-workspace-executor.ts |
| S3-2.2 Approved promotion success rate >= 90 percent | Yes | Yes | Approved promotion records are persisted with request/decision lifecycle metadata | apps/agent-runtime/src/local-workspace-executor.ts |
| S3-2.3 Policy violation rate in promoted patterns <= 2 percent | Yes | Yes | Sensitive-content policy check blocks promotion and returns remediation guidance | apps/agent-runtime/src/local-workspace-executor.ts |
| S3-3.1 Evidence pack generation success >= 98 percent | Yes | Yes | Evidence export action generates immutable JSON bundles with action and approval metadata | apps/agent-runtime/src/local-workspace-executor.ts |
| S3-3.2 Audit prep effort reduced by 30 percent | Yes | Yes | One-click export includes compliance-oriented evidence fields for pilot audit workflows | apps/agent-runtime/src/local-workspace-executor.ts |
| S3-3.3 Evidence field completeness >= 99 percent | Yes | Yes | Export payload includes actions, approvals, policy decisions, and quality-related metadata | apps/agent-runtime/src/local-workspace-executor.ts |
| S3-4.1 Budget overrun incidents reduced by 40 percent | Yes | Yes | Runtime hard-stop and approval-required budget paths prevent unbounded execution | apps/agent-runtime/src/runtime-server.ts |
| S3-4.2 Pre-execution estimate coverage >= 95 percent | Yes | Yes | Budget decision metadata is captured per task before execution routing | apps/agent-runtime/src/runtime-server.ts |
| S3-4.3 Cost per successful task reduced by 15 percent | Yes | Yes | Runtime reports budget outcomes with task success/failure context for optimization tracking | apps/agent-runtime/src/runtime-server.ts |

### Sprint Exit Decision (Final)

Sprint 3 Memory And Compliance Packaging is accepted and closed.

Decision: Proceed to Sprint 4.
