# Sprint 7 - Week 5: Dashboard Workspace Proxy Resilience

Status: CLOSED
Closed at: 2026-05-06
Sprint identifier: sprint-7-week-5-dashboard-proxy-resilience

## Objective

Stabilize the dashboard workspace-tab smoke lane by hardening workspace API proxy behavior when the upstream dashboard API is unavailable, and lock that behavior with targeted regression tests.

## Delivered

1. Budget limits proxy hardening
- Added fallback-safe proxy core for workspace budget limits route.
- GET now returns deterministic fallback payload when upstream fetch throws.
- PUT now returns deterministic `503 upstream_unavailable` payload when upstream fetch throws.

2. LLM config proxy hardening
- Added fallback-safe proxy core for workspace LLM config route.
- GET now returns deterministic fallback config payload when upstream fetch throws.
- PUT now returns deterministic `503 upstream_unavailable` payload when upstream fetch throws.

3. Route module cleanup for Next.js App Router constraints
- Kept route files limited to supported route exports (`GET`/`PUT`).
- Moved testable logic into dedicated `proxy-core.ts` modules to avoid route-export type violations.

4. Regression coverage added
- Added new workspace proxy fallback regression suite validating:
  - Budget GET fallback on fetch failure.
  - Budget PUT `503` on fetch failure.
  - LLM GET fallback with default config on fetch failure.
  - LLM PUT `503` on fetch failure.
  - Forbidden behavior when auth header is missing.

## Test Evidence

Dashboard package:
- `pnpm --filter @agentfarm/dashboard test` - PASS (`115 pass`, `0 fail`)
- `pnpm --filter @agentfarm/dashboard typecheck` - PASS

Monorepo quality gate:
- `pnpm quality:gate` - PASS (`EXIT_CODE=0`)
- DB runtime snapshot lane skipped due to missing `DATABASE_URL` in environment (expected non-blocking skip).

## Files Updated

- `apps/dashboard/app/api/workspaces/[workspaceId]/budget-limits/route.ts`
- `apps/dashboard/app/api/workspaces/[workspaceId]/llm-config/route.ts`
- `apps/dashboard/app/api/workspaces/[workspaceId]/budget-limits/proxy-core.ts` (new)
- `apps/dashboard/app/api/workspaces/[workspaceId]/llm-config/proxy-core.ts` (new)
- `apps/dashboard/app/api/workspaces/[workspaceId]/workspace-route-fallback.test.ts` (new)

## Notes

- This week is additive and scoped to dashboard API proxy reliability.
- The fallback contracts now make workspace-tab smoke behavior deterministic when local upstream services are unavailable.
- Deferred scaffold-only items tracked from this period were completed in Sprint 8 Week 1: `planning/sprints/sprint-8-durable-handoff-and-evaluator-loop-week-1.md`.

<!-- doc-sync: 2026-05-06 sprint-7-week-5 -->
