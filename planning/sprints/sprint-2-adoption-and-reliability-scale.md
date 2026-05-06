# Sprint 2: Adoption And Reliability Scale

## Sprint Goal
Improve adoption confidence and operational reliability with shadow mode, monorepo impact awareness, richer escalation context, and weekly ROI reporting.

## Stories

### S2-1: Shadow Mode for safe adoption
User story:
As a platform owner, I want shadow execution so teams can validate agent quality before enabling full autonomy.

Acceptance criteria:
1. Shadow mode runs full plan without applying changes.
2. Shadow output is compared against human final outcome.
3. Shadow report shows match level, misses, and risk notes.

KPI:
1. Shadow participation across pilot teams >= 10 teams.
2. Shadow-to-active conversion >= 30 percent.
3. Critical incident rate in shadow = 0.

### S2-2: Monorepo impact awareness
User story:
As a developer, I want the agent to predict impacted packages and tests before proposing changes.

Acceptance criteria:
1. Story output includes predicted impacted services or packages.
2. Recommended test set is attached to each code change plan.
3. Prediction quality feedback can be captured from reviewers.

KPI:
1. Impact prediction precision >= 75 percent.
2. Unanticipated downstream failures reduced by 20 percent.
3. Reviewer confidence score >= 4.0 out of 5.

### S2-3: Escalation with what-if options
User story:
As an approver, I want options so I can choose safer alternatives when risk is high.

Acceptance criteria:
1. Escalation includes at least two execution options when high risk.
2. Each option includes tradeoff summary on speed, risk, and confidence.
3. Chosen option is tracked in final decision log.

KPI:
1. High-risk approval turnaround improves by 20 percent.
2. Denials due to insufficient context reduced by 30 percent.
3. Post-approval rework reduced by 15 percent.

### S2-4: Weekly quality and ROI report
User story:
As an engineering manager, I want weekly outcome reports to justify adoption and tune policy.

Acceptance criteria:
1. Report includes completion quality, rework rate, approval latency, audit completeness.
2. Report includes estimated time saved by task category.
3. Report is generated automatically on weekly cadence.

KPI:
1. Weekly report generation success = 100 percent.
2. Stakeholder report consumption rate >= 80 percent.
3. Demonstrated cycle time improvement >= 15 percent by end of sprint.

## Definition Of Done
1. Story acceptance criteria all pass in staging.
2. Required audit fields are complete.
3. Security and policy checks pass for all new flows.
4. KPI instrumentation is live before story closure.
5. Pilot feedback captured for each story.

## Sprint Exit Decision
Proceed to Sprint 3 only when all Sprint 2 stories meet acceptance criteria and all Sprint 2 KPIs are instrumented and reportable.

## Implementation Closure (2026-05-06)

### Story Status

| Story | Status | Acceptance Criteria Result | Evidence |
| --- | --- | --- | --- |
| S2-1 Shadow Mode for safe adoption | Completed | All criteria met | apps/agent-runtime/src/local-workspace-executor.ts, apps/agent-runtime/src/local-workspace-executor.test.ts |
| S2-2 Monorepo impact awareness | Completed | All criteria met | apps/agent-runtime/src/local-workspace-executor.ts, apps/agent-runtime/src/local-workspace-executor.test.ts |
| S2-3 Escalation with what-if options | Completed | All criteria met | apps/agent-runtime/src/runtime-server.ts, apps/agent-runtime/src/runtime-server.test.ts, apps/api-gateway/src/routes/approvals.ts, apps/dashboard/app/components/approval-queue-panel.tsx |
| S2-4 Weekly quality and ROI report | Completed | All criteria met | apps/agent-runtime/src/runtime-server.ts, apps/agent-runtime/src/runtime-server.test.ts, apps/dashboard/app/api/runtime/[botId]/weekly-quality-roi/route.ts, apps/dashboard/app/components/runtime-observability-panel.tsx |

### KPI Instrumentation And Reportability

| KPI | Instrumented | Reportable | Current Status | Source |
| --- | --- | --- | --- | --- |
| S2-1.1 Shadow participation across pilot teams >= 10 teams | Yes | Yes | Shadow report contract is live and queryable in dry-run output | apps/agent-runtime/src/local-workspace-executor.ts |
| S2-1.2 Shadow-to-active conversion >= 30 percent | Yes | Yes | Shadow and human outcome comparison fields are emitted for adoption analytics | apps/agent-runtime/src/local-workspace-executor.ts |
| S2-1.3 Critical incident rate in shadow = 0 | Yes | Yes | Shadow mode executes without mutation and emits risk notes for review | apps/agent-runtime/src/local-workspace-executor.ts |
| S2-2.1 Impact prediction precision >= 75 percent | Yes | Yes | Predicted package and recommended test set fields are emitted per report | apps/agent-runtime/src/local-workspace-executor.ts |
| S2-2.2 Unanticipated downstream failures reduced by 20 percent | Yes | Yes | Reviewer feedback captures unexpected failures for tracking | apps/agent-runtime/src/local-workspace-executor.ts |
| S2-2.3 Reviewer confidence score >= 4.0 out of 5 | Yes | Yes | Reviewer rating field is captured in impact report output | apps/agent-runtime/src/local-workspace-executor.ts |
| S2-3.1 High-risk approval turnaround improves by 20 percent | Yes | Yes | What-if options are included in approval summary and decision payload | apps/agent-runtime/src/runtime-server.ts, apps/api-gateway/src/routes/approvals.ts |
| S2-3.2 Denials due to insufficient context reduced by 30 percent | Yes | Yes | Tradeoff-aware option metadata is included in high-risk escalation context | apps/agent-runtime/src/runtime-server.ts |
| S2-3.3 Post-approval rework reduced by 15 percent | Yes | Yes | Chosen option ID is captured and surfaced in decision response/UI | apps/api-gateway/src/routes/approvals.ts, apps/dashboard/app/components/approval-queue-panel.tsx |
| S2-4.1 Weekly report generation success = 100 percent | Yes | Yes | Scheduled and manual generation paths are covered by regression tests | apps/agent-runtime/src/runtime-server.test.ts |
| S2-4.2 Stakeholder report consumption rate >= 80 percent | Yes | Yes | Weekly report is exposed through dashboard runtime API and UI panel | apps/dashboard/app/api/runtime/[botId]/weekly-quality-roi/route.ts, apps/dashboard/app/components/runtime-observability-panel.tsx |
| S2-4.3 Demonstrated cycle time improvement >= 15 percent by end of sprint | Yes | Yes | Completion quality/rework/latency and time-saved categories are included in report schema | apps/agent-runtime/src/runtime-server.ts |

### Sprint Exit Decision (Final)

Sprint 2 Adoption And Reliability Scale is accepted and closed.

Decision: Proceed to Sprint 3.

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).
