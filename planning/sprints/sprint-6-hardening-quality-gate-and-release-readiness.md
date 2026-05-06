# Sprint 6: Hardening, Quality Gate, and Release Readiness

## Sprint Goal
Stabilize release readiness with strict connector-scope hardening, regression coverage, and quality gate closure.

## Stories

### S6-1: Connector scope hardening and fail-safe behavior
User story:
As a tenant operator, I need connector APIs to reject invalid workspace/bot scope requests instead of silently falling back so actions always run in an explicitly selected context.

Acceptance criteria:
1. GET connectors returns 400 for invalid workspaceId/botId requests.
2. POST connectors returns 400 for invalid workspaceId/botId requests.
3. Role-aware catalog filtering remains correct for selected bot role.
4. Workspace connector isolation behavior is preserved.

KPI:
1. Invalid-scope fallback incidents = 0.
2. Connector scope regression lane pass rate = 100 percent.

### S6-2: Regression and release-readiness closure
User story:
As an engineering lead, I need focused regressions plus full quality gate to pass, and runbook guidance to be updated for operations handoff.

Acceptance criteria:
1. Focused connectors regression suite passes.
2. Website typecheck passes.
3. Full `pnpm quality:gate` passes.
4. Website SWA runbook includes Sprint 6 connector hardening checks.

KPI:
1. Quality gate overall status = PASS.
2. Sev-1 and Sev-2 unresolved findings = 0 for Sprint 6 scope.

## Definition Of Done
1. Code changes are merged with regression coverage.
2. Focused and full quality validation passes.
3. Operational runbook is updated for new behavior checks.
4. Sprint closure record includes acceptance and KPI evidence.

## Implementation Closure (2026-05-06)

### Story Status

| Story | Status | Acceptance Criteria Result | Evidence |
| --- | --- | --- | --- |
| S6-1 Connector scope hardening and fail-safe behavior | Completed | All criteria met | apps/website/app/api/connectors/route.ts, apps/website/app/connectors/page.tsx, apps/website/tests/connectors-bot-scope.test.ts |
| S6-2 Regression and release-readiness closure | Completed | All criteria met | operations/quality/8.1-quality-gate-report.md, operations/runbooks/website-swa-runbook.md |

### KPI Instrumentation And Reportability

| KPI | Instrumented | Reportable | Current Status | Source |
| --- | --- | --- | --- | --- |
| S6-1.1 Invalid-scope fallback incidents = 0 | Yes | Yes | API returns explicit HTTP 400 for invalid workspace/bot scope in GET and POST connectors paths | apps/website/app/api/connectors/route.ts, apps/website/tests/connectors-bot-scope.test.ts |
| S6-1.2 Connector scope regression lane pass rate = 100 percent | Yes | Yes | Focused suite executed with 5/5 passing tests | apps/website/tests/connectors-bot-scope.test.ts |
| S6-2.1 Quality gate overall status = PASS | Yes | Yes | Latest quality report records Overall PASS | operations/quality/8.1-quality-gate-report.md |
| S6-2.2 Sev-1 and Sev-2 unresolved findings = 0 (Sprint 6 scope) | Yes | Yes | No blocking high-severity findings observed in Sprint 6 website scope validation | operations/quality/8.1-quality-gate-report.md |

### Validation Summary
1. `pnpm --filter @agentfarm/website exec tsx --test tests/connectors-bot-scope.test.ts` passed (5/5).
2. `pnpm --filter @agentfarm/website typecheck` passed.
3. `pnpm quality:gate` passed.

### Sprint Exit Decision (Final)
Sprint 6 Hardening, Quality Gate, and Release Readiness is accepted and closed.

Decision: Proceed to release signoff workflow.
