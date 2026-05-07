# AgentFarm Build Snapshot 2026-05-07

## Purpose
Capture the implementation state after the six-priority spec-alignment wave so future planning and release decisions can reference one concrete source.

## Summary
Date: 2026-05-07
Status: Completed
Scope: Six priority items implemented and validated

## Priority 1: Memory model and runtime memory hooks
Completed work:
1. Added long-term memory contract and schema support.
2. Implemented long-term memory read/write/update APIs in memory-service.
3. Confirmed runtime pre-task memory read and post-task memory mirror hooks.

Key files:
- services/memory-service/src/memory-types.ts
- services/memory-service/src/memory-store.ts
- services/memory-service/src/memory-store.test.ts
- packages/db-schema/prisma/schema.prisma
- packages/shared-types/src/index.ts
- apps/agent-runtime/src/execution-engine.ts
- apps/agent-runtime/src/local-workspace-executor.ts

## Priority 2: Proactive signal expansion and detection extraction
Completed work:
1. Extracted proactive detection logic into a dedicated module.
2. Added ci_failure_on_main and dependency_cve signals.
3. Wired new payloads and thresholds through orchestrator API and tests.

Key files:
- apps/orchestrator/src/proactive-signal-detector.ts
- apps/orchestrator/src/routine-scheduler.ts
- apps/orchestrator/src/main.ts
- apps/orchestrator/src/routine-scheduler.test.ts
- apps/orchestrator/src/main.test.ts
- packages/shared-types/src/index.ts

## Priority 3: Approval batching across service, API, and dashboard
Completed work:
1. Implemented approval batcher service functions.
2. Added API gateway batch create and decision routes.
3. Added dashboard batch decision actions and UI flow.
4. Added batch lifecycle audit events.

Key files:
- services/approval-service/src/approval-batcher.ts
- services/approval-service/src/index.ts
- apps/api-gateway/src/routes/approvals.ts
- apps/api-gateway/src/routes/approvals.test.ts
- apps/dashboard/app/components/approval-queue-panel.tsx
- packages/shared-types/src/index.ts

## Priority 4: Tester role policy hardening
Completed work:
1. Added explicit tester role policy contract.
2. Enforced tester profile connector and local-action constraints in runtime.
3. Confirmed tester entries in website catalog.

Key files:
- packages/connector-contracts/src/index.ts
- apps/agent-runtime/src/tester-agent-profile.ts
- apps/agent-runtime/src/runtime-server.ts
- apps/website/lib/bots-catalogue.ts

## Priority 5: Quality feedback loop to model/provider routing
Completed work:
1. Added model/provider metadata on approvals.
2. Emitted quality signals on approval decisions when metadata exists.
3. Extended runtime quality signal APIs and taxonomy handling.
4. Updated auto-provider routing to composite formula:
   score = availability_penalty * 0.6 + quality_penalty * 0.4

Key files:
- apps/api-gateway/src/routes/approvals.ts
- apps/api-gateway/src/routes/approvals.test.ts
- apps/agent-runtime/src/runtime-server.ts
- apps/agent-runtime/src/runtime-server.test.ts
- apps/agent-runtime/src/llm-quality-tracker.ts
- apps/agent-runtime/src/llm-decision-adapter.ts
- apps/agent-runtime/src/llm-decision-adapter.test.ts
- packages/db-schema/prisma/schema.prisma

## Priority 6: Handoff protocol normalization and wrapper routes
Completed work:
1. Aligned handoff status contract to pending, accepted, completed, failed, timed_out.
2. Added timeout semantics (escalateOnTimeoutMs and timed_out transitions).
3. Added and wired API gateway handoff wrapper routes.
4. Updated pending filter to use pending and expanded completion payload forwarding.

Key files:
- packages/shared-types/src/index.ts
- apps/orchestrator/src/agent-handoff-manager.ts
- apps/orchestrator/src/main.ts
- apps/orchestrator/src/main.test.ts
- apps/api-gateway/src/routes/handoffs.ts
- apps/api-gateway/src/routes/handoffs.test.ts
- apps/api-gateway/src/main.ts

## Validation Evidence
Focused validation run completed on 2026-05-07:
1. pnpm --filter @agentfarm/api-gateway typecheck
2. pnpm --filter @agentfarm/agent-runtime typecheck
3. pnpm --filter @agentfarm/api-gateway exec tsx --test src/routes/handoffs.test.ts
4. pnpm --filter @agentfarm/agent-runtime exec tsx --test src/llm-decision-adapter.test.ts

Result: all passed.

## Notes for future maintainers
1. Keep shared-type unions synchronized with route-level validators when adding new statuses or signals.
2. Keep approval metadata propagation intact when changing approval intake or decision routes, otherwise quality-loop attribution will degrade.
3. Keep handoff wrapper and orchestrator status enums in sync to avoid silent filtering errors.


