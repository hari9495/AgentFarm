# Sprint 8 - Week 1: Durable Handoff Persistence and Evaluator Feedback Loop

Status: CLOSED
Closed at: 2026-05-06
Sprint identifier: sprint-8-week-1-durable-handoff-evaluator-loop

## Objective

Complete two deferred Sprint 7 scaffold-only items:
1. Durable persistence for agent handoff records across orchestrator restarts.
2. End-to-end evaluator feedback loop for runtime quality scoring.

## Delivered

1. Durable agent handoff persistence
- Extended orchestrator persisted state to include `agentHandoffs`.
- Added `AgentHandoffManagerState` import/export support.
- Restored handoff manager from persisted state at server startup.
- Persisted state immediately after handoff create and status-update operations.
- Added sanitizer coverage for persisted handoff payload shape.

2. Evaluator full feedback loop
- Added outbound evaluator webhook module in runtime:
  - `resolveEvaluatorWebhookUrl(env)` for validated URL resolution from `RUNTIME_EVALUATOR_WEBHOOK_URL`.
  - `fireEvaluatorWebhook(input)` fire-and-forget POST with 5s timeout and non-blocking failure handling.
- Wired webhook trigger after runtime task quality signal capture.
- Included callback URL payload to existing evaluator ingestion endpoint (`/runtime/quality/signals`) for `source=evaluator` round-trip.

3. Regression tests added
- Added orchestrator restart persistence test for handoff records and status transitions.
- Added evaluator webhook unit tests:
  - URL resolution behavior (absent/invalid/valid).
  - Webhook dispatch payload/POST behavior.
  - Failure swallowing (non-throwing on network error).
- Updated orchestrator state store fixture tests for new persisted `agentHandoffs` field.

## Quality Evidence

- Quality gate run: `node scripts/quality-gate.mjs`
- Result: PASS (exit code 0)
- Note: DB runtime snapshot smoke lane is skipped when `DATABASE_URL` is not configured (expected non-blocking behavior in local environments).

## Files Updated

- `apps/orchestrator/src/agent-handoff-manager.ts`
- `apps/orchestrator/src/orchestrator-state-store.ts`
- `apps/orchestrator/src/main.ts`
- `apps/orchestrator/src/main.test.ts`
- `apps/orchestrator/src/orchestrator-state-store.test.ts`
- `apps/agent-runtime/src/evaluator-webhook.ts` (new)
- `apps/agent-runtime/src/evaluator-webhook.test.ts` (new)
- `apps/agent-runtime/src/runtime-server.ts`

## Notes

- Changes are additive and scoped to deferred resilience and quality-loop completion items.
- Runtime evaluator integration is environment-gated and safely no-op when webhook URL is not configured.

<!-- doc-sync: 2026-05-06 sprint-8-week-1 -->
