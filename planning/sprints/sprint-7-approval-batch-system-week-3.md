# Sprint 7 — Week 3: Approval Batch System

Status: CLOSED  
Closed at: 2026-05-07  
Sprint identifier: sprint-7-week-3-approval-batches

## Objective

Add batched approval capabilities so related pending approval tasks can be grouped and decided together while preserving existing per-task approval safety and audit behavior.

## Delivered

1. Runtime batch grouping
- Added grouping over pending approvals by `riskLevel + actionType`.
- Added deterministic batch id generation from batch key.
- Included batch metadata: pending count, task IDs, escalated count, oldest/newest enqueue timestamps.

2. Batch decision route
- Added endpoint to apply one decision to all tasks in a batch.
- Preserved existing per-task approval execution path (approved tasks execute deferred action, rejected tasks are cancelled and persisted).
- Preserved decision event emission and pending queue accounting.

3. Shared contracts
- Added `CONTRACT_VERSIONS.APPROVAL_BATCH`.
- Added batch contract interfaces:
  - `ApprovalBatchRecord`
  - `ApprovalBatchDecisionRecord`

4. Route surface (agent runtime)
- `GET /decision/batches`
- `POST /decision/batch`
- Existing `POST /decision` now reuses shared internal resolver logic to avoid divergent behavior.

## Test Evidence

Agent runtime package:
- `pnpm --filter @agentfarm/agent-runtime typecheck` — PASS
- `pnpm --filter @agentfarm/agent-runtime test` — PASS (`579 pass`, `0 fail`)

New week-3 coverage includes:
- Batch grouping endpoint returns grouped pending approvals.
- Batch decision endpoint resolves all tasks in selected batch.

Monorepo quality gate:
- `pnpm quality:gate` — PASS for test/typecheck lanes.
- DB smoke lane skipped due to missing `DATABASE_URL` in this environment (expected).

## Files Updated

- `apps/agent-runtime/src/runtime-server.ts`
- `apps/agent-runtime/src/runtime-server.test.ts`
- `packages/shared-types/src/index.ts`

## Notes

- Batch decision processing intentionally reuses the same task-level approval resolution flow to preserve prior behavior guarantees.
- This keeps Week 3 additive without bypassing approval escalation, cancellation persistence, or execution telemetry.

<!-- doc-sync: 2026-05-07 sprint-7-week-3 -->
