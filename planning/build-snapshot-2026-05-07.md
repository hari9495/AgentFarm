# AgentFarm Build Snapshot 2026-05-07

## Purpose
Capture the implementation state after the six-priority spec-alignment wave so future planning and release decisions can reference one concrete source.

## Summary
Date: 2026-05-07
Status: Completed with follow-up implementation notes on 2026-05-08
Scope: Six priority items implemented and validated, plus question/memory continuation work and the browser/desktop evidence foundation

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

## Continuation Update A: Question escalation, webhook answering, and memory ingestion
Completed work:
1. Added API gateway question routes for create, answer, pending-by-task, pending-by-workspace, sweep-expired, and fetch-by-id.
2. Added webhook answer handling and code-review memory ingestion wiring.
3. Revalidated memory-store strict typing and local migration state in the D-drive workspace.
4. Kept dashboard question proxy and learned-pattern surfaces aligned with the updated routes.

Key files:
- apps/api-gateway/src/routes/questions.ts
- apps/api-gateway/src/routes/questions.test.ts
- apps/api-gateway/src/routes/webhooks.ts
- apps/api-gateway/src/routes/webhooks.test.ts
- apps/api-gateway/src/main.ts
- services/memory-service/src/memory-store.ts
- packages/db-schema/prisma/migrations/20260507134403_agent_question_memory_integration/

## Continuation Update B: Browser/Desktop Evidence Foundation
Completed work:
1. Added screenshot upload service for browser evidence artifacts backed by Azure Blob Storage signed URLs.
2. Upgraded browser action wrapper from scaffolding to live capture/upload flow using before/after screenshots and screenshotId-based artifact IDs.
3. Added runtime audit integration wiring for AgentSession and BrowserActionEvent persistence on observed action flow.
4. Cut dashboard session replay API over to Prisma-backed AgentSession/BrowserActionEvent reads with ordered action playback.
5. Aligned agent-observability package dependencies so workspace resolution succeeds from source-first installs.

Key files:
- services/audit-storage/src/screenshot-uploader.ts
- services/audit-storage/src/index.ts
- services/agent-observability/src/browser-action-with-upload.ts
- services/agent-observability/src/browser-action-with-upload.test.ts
- services/agent-observability/src/desktop-agent-wrapper.py
- services/agent-observability/src/index.ts
- services/agent-observability/package.json
- apps/agent-runtime/src/runtime-audit-integration.ts
- apps/dashboard/app/api/audit/session-replay/[sessionId]/route.ts
- apps/dashboard/app/audit/session-replay/page.tsx
- apps/dashboard/app/components/session-replay-loader.tsx
- apps/dashboard/app/components/session-replay-timeline.tsx
- apps/dashboard/app/components/evidence-viewer.tsx
- packages/db-schema/prisma/schema.prisma

## Validation Evidence
Focused validation run completed on 2026-05-07:
1. pnpm --filter @agentfarm/api-gateway typecheck
2. pnpm --filter @agentfarm/agent-runtime typecheck
3. pnpm --filter @agentfarm/api-gateway exec tsx --test src/routes/handoffs.test.ts
4. pnpm --filter @agentfarm/agent-runtime exec tsx --test src/llm-decision-adapter.test.ts

Result: all passed.

Follow-up validation run completed on 2026-05-08:
1. pnpm install
2. pnpm --filter @agentfarm/audit-storage typecheck
3. pnpm --filter @agentfarm/agent-observability typecheck
4. pnpm --filter @agentfarm/agent-runtime typecheck
5. pnpm --filter @agentfarm/audit-storage test
6. pnpm --filter @agentfarm/agent-observability test
7. pnpm --filter @agentfarm/agent-runtime test
8. pnpm quality:gate

Result:
1. Targeted observability package typechecks passed.
2. Targeted observability package tests passed.
3. Repo-wide quality gate is currently blocked by two failing API gateway tests in apps/api-gateway/src/routes/questions.test.ts.

## Notes for future maintainers
1. Keep shared-type unions synchronized with route-level validators when adding new statuses or signals.
2. Keep approval metadata propagation intact when changing approval intake or decision routes, otherwise quality-loop attribution will degrade.
3. Keep handoff wrapper and orchestrator status enums in sync to avoid silent filtering errors.
4. Prisma replay is now primary, but a temporary SQLite legacy fallback remains for older sessions not yet backfilled into AgentSession/BrowserActionEvent.
5. Do not mark release readiness as fully green until the question-route regression is fixed and pnpm quality:gate returns exit code 0.


