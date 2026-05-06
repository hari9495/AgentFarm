# Sprint 7 — Week 2: Proactive Signal Detector

Status: CLOSED  
Closed at: 2026-05-07  
Sprint identifier: sprint-7-week-2-proactive-signals

## Objective

Implement proactive operational signal detection for:
- stale PRs (`stale_pr`)
- stale tickets (`stale_ticket`)
- budget warning (`budget_warning`)

The detector is workspace-scoped, deduplicates open signals by source, and supports resolve/list workflows.

## Delivered

1. Shared contracts
- Added `CONTRACT_VERSIONS.PROACTIVE_SIGNAL = '1.0.0'`.
- Added `ProactiveSignalType`, `ProactiveSignalStatus`, and `ProactiveSignalRecord` in shared types.

2. Orchestrator detector logic
- Added detection input contracts in routine scheduler.
- Added `detectProactiveSignals()` in routine scheduler.
- Added open-signal dedupe by key: `signalType + workspaceId + sourceRef`.
- Added `listProactiveSignals()` filtering by workspace/type/status/limit.
- Added `resolveProactiveSignal()` to mark signals resolved.
- Persisted proactive signals in scheduler state export/import path.

3. Orchestrator API routes
- `POST /v1/proactive-signals/detect`
- `GET /v1/proactive-signals`
- `POST /v1/proactive-signals/:signalId/resolve`

4. Persistence and recovery
- Added `proactiveSignals` to orchestrator persisted state sanitation and defaults.
- Added malformed payload recovery coverage for proactive signal rows.

## Test Evidence

Orchestrator package:
- `pnpm --filter @agentfarm/orchestrator test`
- Result: `46/46 pass, 0 fail`

New tests included:
- API route: detect/list/resolve signals.
- API route: invalid `signal_type` rejection.
- Scheduler unit: multi-signal detection.
- Scheduler unit: dedupe behavior.
- Scheduler unit: resolve workflow.

Monorepo quality gate:
- `pnpm quality:gate`
- All tested lanes passed.
- DB smoke lane skipped due to missing `DATABASE_URL` in this environment (expected).

## Files Updated

- `packages/shared-types/src/index.ts`
- `apps/orchestrator/src/routine-scheduler.ts`
- `apps/orchestrator/src/main.ts`
- `apps/orchestrator/src/routine-scheduler.test.ts`
- `apps/orchestrator/src/main.test.ts`
- `apps/orchestrator/src/orchestrator-state-store.ts`
- `apps/orchestrator/src/orchestrator-state-store.test.ts`

## Notes

- This implementation keeps behavior additive and non-blocking for existing scheduler paths.
- Signal generation is data-driven via request payloads; external connector polling can be layered on top in later sprint steps.

<!-- doc-sync: 2026-05-07 sprint-7-week-2 -->
