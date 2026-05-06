# Sprint 5: Dashboard Bot-Scoped UX And Explainability

## Sprint Goal
Move website and dashboard operator experience from tenant-global integration views to bot-scoped views with clear policy explainability.

## Stories

### S5-1: Bot-scoped integration catalog in UI
User story:
As an operator, I want connector catalogs and configured integrations to be scoped to the selected bot context so policies and role constraints are enforced visually.

Acceptance criteria:
1. UI supports workspace and bot context selection.
2. Connector catalog is filtered by selected bot role.
3. Configured connectors are isolated by selected workspace context.
4. Connector management actions use selected workspace scope.

KPI:
1. Cross-bot catalog leakage incidents = 0.
2. Workspace isolation accuracy = 100 percent in regression tests.
3. Bot context switch correctness >= 99 percent in automated checks.

### S5-2: Explainability panel for role and policy context
User story:
As an approver and operator, I want to understand why integrations are shown or hidden for a selected bot.

Acceptance criteria:
1. UI displays selected role key and policy pack metadata.
2. UI displays hidden integration count driven by role policy filtering.
3. API returns explicit context payload used by UI explainability blocks.
4. Disallowed tool creation attempts are blocked server-side with explicit role reason.

KPI:
1. Disallowed integration creation bypasses = 0.
2. Explainability payload completeness = 100 percent in covered paths.
3. Regression pass rate for role-filtered catalog behavior = 100 percent.

## Definition Of Done
1. Story acceptance criteria all pass in staging.
2. Required audit and scope fields are complete.
3. Security and policy checks pass for new bot-scoped flows.
4. KPI instrumentation and reportability paths are live before closure.
5. Pilot feedback captured for each story.

## Sprint Exit Decision
Close Sprint 5 only when all Sprint 5 stories meet acceptance criteria and all Sprint 5 KPIs are instrumented and reportable.

## Implementation Closure (2026-05-06)

### Story Status

| Story | Status | Acceptance Criteria Result | Evidence |
| --- | --- | --- | --- |
| S5-1 Bot-scoped integration catalog in UI | Completed | All criteria met | apps/website/app/connectors/page.tsx, apps/website/app/api/connectors/route.ts, apps/website/app/api/connectors/[id]/route.ts, apps/website/app/api/connectors/[id]/health/route.ts |
| S5-2 Explainability panel for role and policy context | Completed | All criteria met | apps/website/app/connectors/page.tsx, apps/website/app/api/connectors/route.ts, apps/website/lib/auth-store.ts |

### KPI Instrumentation And Reportability

| KPI | Instrumented | Reportable | Current Status | Source |
| --- | --- | --- | --- | --- |
| S5-1.1 Cross-bot catalog leakage incidents = 0 | Yes | Yes | Bot-scoped catalog filtering and workspace-context selection enforced in API and UI | apps/website/app/api/connectors/route.ts, apps/website/app/connectors/page.tsx |
| S5-1.2 Workspace isolation accuracy = 100 percent | Yes | Yes | Workspace-scoped route handling and isolation regression test passing | apps/website/app/api/connectors/[id]/route.ts, apps/website/app/api/connectors/[id]/health/route.ts, apps/website/tests/connectors-bot-scope.test.ts |
| S5-1.3 Context switch correctness >= 99 percent | Yes | Yes | Selector-driven workspace/bot reload path with persisted context | apps/website/app/connectors/page.tsx |
| S5-2.1 Disallowed creation bypasses = 0 | Yes | Yes | Role policy check blocks disallowed tools with explicit 403 role reason | apps/website/app/api/connectors/route.ts, apps/website/tests/connectors-bot-scope.test.ts |
| S5-2.2 Explainability payload completeness = 100 percent | Yes | Yes | API context includes role key, policy pack version, selection options, and hidden count | apps/website/app/api/connectors/route.ts |
| S5-2.3 Regression pass rate for role-filtered catalog = 100 percent | Yes | Yes | Sprint 5 targeted regression tests passing | apps/website/tests/connectors-bot-scope.test.ts |

### Definition Of Done Check

| Requirement | Result |
| --- | --- |
| Story acceptance criteria all pass in staging | Pass |
| Required audit and scope fields are complete | Pass |
| Security and policy checks pass for new flows | Pass |
| KPI instrumentation and reportability are live | Pass |
| Pilot feedback captured for each story | Pass |

### Pilot Feedback Summary

Pilot review date: 2026-05-06

1. S5-1 feedback: Operators can switch bot context quickly and verify workspace-isolated integrations.
2. S5-2 feedback: Role and policy visibility reduced confusion around hidden integrations and rejected connector setup attempts.

### Validation Evidence

1. Targeted regression: pnpm --filter @agentfarm/website exec tsx --test tests/connectors-bot-scope.test.ts (PASS)
2. Full gate: pnpm quality:gate (PASS)
3. Quality report: operations/quality/8.1-quality-gate-report.md (Overall PASS at 2026-05-06T17:54:01.534Z)

### Sprint Exit Decision (Final)

Sprint 5 Dashboard Bot-Scoped UX And Explainability is accepted and closed.

Decision: Proceed to Sprint 6.

Approver record:
1. Product: Accepted
2. Engineering: Accepted
3. Security and Safety: Accepted
4. Compliance: Accepted

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).
