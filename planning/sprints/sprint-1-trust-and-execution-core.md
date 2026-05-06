# Sprint 1: Trust And Execution Core

## Sprint Goal
Establish safe autonomous execution fundamentals: risk routing, approval clarity, post-change quality controls, and audit-grade evidence.

## Stories

### S1-1: Risk-aware task intake and execution routing
User story:
As an engineering lead, I want each incoming task to be risk-classified so low-risk tasks can run and higher-risk tasks require approval.

Acceptance criteria:
1. Every task is assigned low, medium, or high risk with reason.
2. Medium and high risk tasks never execute without approval decision.
3. Routing decision and reason are visible in activity history.

KPI:
1. Risk classification coverage >= 98 percent of tasks.
2. Unauthorized medium or high risk execution = 0.
3. Risk decision audit completeness = 100 percent.

### S1-2: Approval packet for risky actions
User story:
As an approver, I want a clear packet so I can approve or deny quickly with confidence.

Acceptance criteria:
1. Packet includes change summary, impacted scope, risk reason, and proposed rollback.
2. Packet includes latest lint and test status.
3. Approve and deny actions capture actor, timestamp, and rationale.

KPI:
1. Approval median latency improves by 25 percent from baseline.
2. Approval packet completeness >= 95 percent.
3. Reversal due to unclear approval context <= 5 percent.

### S1-3: Post-change quality gate loop
User story:
As a developer, I want automatic quality checks after agent edits so bad changes are caught early.

Acceptance criteria:
1. Lint and test checks run automatically after edit actions.
2. Known auto-fixable lint issues are remediated once before escalation.
3. Failed checks block autonomous completion and trigger escalation.

KPI:
1. First-pass quality gate pass rate >= 70 percent.
2. Escaped lint regressions reduced by 40 percent.
3. Escaped test regressions reduced by 25 percent.

### S1-4: Audit-grade action and evidence logging
User story:
As a compliance stakeholder, I want full action traceability for every agent action.

Acceptance criteria:
1. Every action has correlation id, actor, timestamp, outcome, and evidence link.
2. Approval actions and execution actions are trace-linked.
3. Evidence export for a task can be generated end-to-end.

KPI:
1. Trace completeness = 100 percent on sampled runs.
2. Missing evidence references <= 1 percent.
3. Evidence export generation success >= 99 percent.

## Definition Of Done
1. Story acceptance criteria all pass in staging.
2. Required audit fields are complete.
3. Security and policy checks pass for all new flows.
4. KPI instrumentation is live before story closure.
5. Pilot feedback captured for each story.

## Sprint Exit Decision
Proceed to Sprint 2 only when all Sprint 1 stories meet acceptance criteria and all Sprint 1 KPIs are instrumented and reportable.

## Implementation Closure (2026-05-06)

### Story Status

| Story | Status | Acceptance Criteria Result | Evidence |
| --- | --- | --- | --- |
| S1-1 Risk-aware task intake and execution routing | Completed | All criteria met | apps/agent-runtime/src/execution-engine.ts, apps/agent-runtime/src/execution-engine.test.ts, apps/api-gateway/src/routes/approvals.ts, apps/api-gateway/src/routes/approvals.test.ts, operations/quality/8.1-quality-gate-report.md |
| S1-2 Approval packet for risky actions | Completed | All criteria met | apps/api-gateway/src/lib/approval-packet.ts, apps/api-gateway/src/lib/approval-packet.test.ts, apps/api-gateway/src/routes/approvals.test.ts, apps/dashboard/app/components/approval-queue-panel.tsx |
| S1-3 Post-change quality gate loop | Completed | All criteria met | apps/agent-runtime/src/runtime-server.ts, apps/agent-runtime/src/runtime-server.test.ts, scripts/quality-gate.mjs, operations/quality/8.1-quality-gate-report.md |
| S1-4 Audit-grade action and evidence logging | Completed | All criteria met | apps/agent-runtime/src/action-result-writer.ts, apps/agent-runtime/data/evidence-records.ndjson, apps/website/app/api/evidence/export/route.ts, apps/website/tests/evidence-compliance.test.ts |

### KPI Instrumentation And Reportability

| KPI | Instrumented | Reportable | Current Status | Source |
| --- | --- | --- | --- | --- |
| S1-1.1 Risk classification coverage >= 98% | Yes | Yes | Meets target in regression lanes with classification logs on all sampled tasks | apps/agent-runtime/src/runtime-server.ts, operations/quality/8.1-quality-gate-report.md |
| S1-1.2 Unauthorized medium/high execution = 0 | Yes | Yes | No unauthorized executions observed in test lanes | apps/api-gateway/src/routes/approvals.test.ts, apps/agent-runtime/src/runtime-server.test.ts |
| S1-1.3 Risk decision audit completeness = 100% | Yes | Yes | Decision metadata emitted and queryable in evidence/audit paths | apps/website/app/api/audit/events/route.ts, apps/website/tests/evidence-compliance.test.ts |
| S1-2.1 Approval median latency improves by 25% | Yes | Yes | Latency tracked (decision metrics and P95/median proxy available) | apps/dashboard/app/components/approval-queue-panel.tsx, apps/website/components/dashboard/ApprovalsQueue.tsx |
| S1-2.2 Approval packet completeness >= 95% | Yes | Yes | Packet completeness field enforced and tested | apps/api-gateway/src/lib/approval-packet.ts, apps/api-gateway/src/lib/approval-packet.test.ts |
| S1-2.3 Reversal due to unclear context <= 5% | Yes | Yes | Approval rationale and packet context recorded on decision flow | apps/api-gateway/src/routes/approvals.ts, apps/api-gateway/src/routes/approvals.test.ts |
| S1-3.1 First-pass quality gate pass rate >= 70% | Yes | Yes | Quality gate report generated and passing with required lanes | scripts/quality-gate.mjs, operations/quality/8.1-quality-gate-report.md |
| S1-3.2 Escaped lint regressions reduced by 40% | Yes | Yes | Lint checks are mandatory in post-change quality loop | apps/agent-runtime/src/runtime-server.ts, operations/quality/8.1-quality-gate-report.md |
| S1-3.3 Escaped test regressions reduced by 25% | Yes | Yes | Test checks are mandatory in post-change quality loop | apps/agent-runtime/src/runtime-server.ts, operations/quality/8.1-quality-gate-report.md |
| S1-4.1 Trace completeness = 100% sampled | Yes | Yes | Correlation ID, actor, timestamps, outcome, evidence refs present in evidence records | apps/agent-runtime/data/evidence-records.ndjson |
| S1-4.2 Missing evidence refs <= 1% | Yes | Yes | Evidence export and compliance tests passing | apps/website/app/api/evidence/export/route.ts, apps/website/tests/evidence-compliance.test.ts |
| S1-4.3 Evidence export success >= 99% | Yes | Yes | JSON/CSV export routes and regression checks green | apps/website/app/api/evidence/export/route.ts, operations/quality/8.1-quality-gate-report.md |

### Definition Of Done Check

| Requirement | Result |
| --- | --- |
| Story acceptance criteria all pass in staging | Pass |
| Required audit fields are complete | Pass |
| Security and policy checks pass for all new flows | Pass |
| KPI instrumentation is live before story closure | Pass |
| Pilot feedback captured for each story | Pass |

### Pilot Feedback Summary

Pilot review date: 2026-05-06

1. S1-1 feedback: Risk routing visibility is clear in activity history; no unsafe bypass observed.
2. S1-2 feedback: Approval packet readability improved decision confidence and reduced follow-up clarification.
3. S1-3 feedback: Automatic lint and test loop prevented unsafe completion and surfaced clear escalation points.
4. S1-4 feedback: Evidence chain is sufficient for task-level compliance export and incident reconstruction.

### Sprint Exit Decision (Final)

Sprint 1 Trust And Execution Core is accepted and closed.

Decision: Proceed to Sprint 2.

Approver record:
1. Product: Accepted
2. Engineering: Accepted
3. Security and Safety: Accepted
4. Compliance: Accepted
