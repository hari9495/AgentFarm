# AgentFarm Role Bot Sprint Execution Plan

## Purpose
Define implementation sprints for the latest role-bot updates so code is built in controlled increments with clear acceptance gates.

## Planning Assumptions
1. Independent role bots remain the default operating model.
2. LLM remains the primary decision engine and cannot bypass policy, approvals, or connector checks.
3. Sprint sequencing prioritizes production safety first, then capability expansion.
4. Existing completed work is not re-opened unless regressions are found.

## Current Baseline (Already Completed)
1. Shared role and brain contracts are present in shared types.
2. Connector contracts include role compatibility metadata.
3. API gateway exposes role catalog and tenant role subscription endpoints.
4. API gateway enforces role-aware connector action authorization.
5. Runtime freezes capability snapshot at startup and enforces policy at execution time.
6. Runtime tests and gateway tests for the new enforcement paths are passing.

## Tuned Sprint Order and Duration
1. Sprint 1 (6 days, Apr 27 – May 4, 2026): Capability Snapshot Persistence and Restart Safety.
2. Sprint 2 (6 days, May 5 – May 12, 2026): LLM Metadata and Evidence Integrity.
3. Sprint 3 (5 days, May 13 – May 19, 2026): Entitlement Enforcement at Bot Creation and Activation.
4. Sprint 4 (6 days, May 20 – May 27, 2026): Bot-Scoped Capability and Integration APIs.
5. Sprint 5 (5 days, May 28 – Jun 3, 2026): Dashboard Bot-Scoped UX and Explainability.
6. Sprint 6 (4 days, Jun 4 – Jun 9, 2026): Hardening, Quality Gate, and Release Readiness.

## Tier Scope Legend
1. Base: open-source-first defaults with no mandatory per-minute managed speech/avatar spend.
2. Pro: optional premium add-ons, primarily managed neural voice quality and expanded language profile.
3. Enterprise: optional avatar/video and highest SLA/governance profile.

## Tier Delivery by Sprint
1. Sprint 1: Base foundation only.
2. Sprint 2: Base mandatory, Pro optional metadata fields.
3. Sprint 3: Base mandatory entitlement gate, Pro and Enterprise share same gate path.
4. Sprint 4: Base provider-routing API, Pro and Enterprise provider selection controls.
5. Sprint 5: Base and Pro UX complete, Enterprise avatar controls.
6. Sprint 6: Tier-specific hardening, pricing telemetry, and release signoff.

## Owner Model
1. Platform Lead — **Priya Nair**: schema, migrations, cross-service contracts.
2. Runtime Lead — **Marcus Chen**: runtime-server and action-result pipeline.
3. API Lead — **Jordan Wells**: gateway routes and authz enforcement.
4. Frontend Lead — **Aisha Okonkwo**: website/dashboard bot-scoped UX.
5. QA Lead — **Sam Rivera**: regression matrix, integration tests, gate evidence.
6. DevOps Lead — **Tobias Müller**: quality automation, release docs, runbook updates.

## Sprint 1: Capability Snapshot Persistence and Restart Safety (6 Days | Apr 27 – May 4, 2026)
### Objective
Persist frozen capability snapshots and guarantee deterministic enforcement across runtime restarts.

### Tier Deliverables
1. Base: snapshot persistence, restart determinism, and policy enforcement source tracking.
2. Pro: no separate scope in this sprint.
3. Enterprise: no separate scope in this sprint.

### Day-Wise Plan and Owners
1. Day 1 (Apr 27, Mon) - Design and schema draft for persisted snapshots.
- Owner: Priya Nair (Platform Lead).
- Output: finalized table shape and migration plan.
2. Day 2 (Apr 28, Tue) - Implement schema migration and shared contract updates.
- Owner: Priya Nair (Platform Lead).
- Output: migration + shared type compatibility checks.
3. Day 3 (Apr 29, Wed) - Implement runtime startup load-from-store logic.
- Owner: Marcus Chen (Runtime Lead).
- Output: persisted snapshot load and startup validation paths.
4. Day 4 (Apr 30, Thu) - Implement fallback freeze logic and source metadata.
- Owner: Marcus Chen (Runtime Lead).
- Output: snapshot source (persisted/fresh) surfaced in runtime endpoint.
5. Day 5 (May 1, Fri) - Add runtime and gateway tests for restart determinism.
- Owner: Sam Rivera (QA Lead).
- Output: tests for missing snapshot, stale snapshot, restored snapshot.
6. Day 6 (May 4, Mon) - Stabilization and quality checks.
- Owner: Marcus Chen (Runtime Lead) and Sam Rivera (QA Lead).
- Output: passing typecheck and targeted test suites.

### Target Files
1. packages/db-schema/prisma/schema.prisma
2. packages/shared-types/src/index.ts
3. apps/agent-runtime/src/runtime-server.ts
4. apps/agent-runtime/src/runtime-server.test.ts
5. apps/api-gateway/src/main.ts

### Exit Criteria
1. Runtime restart preserves enforcement behavior with unchanged snapshot id.
2. Snapshot source and version are observable through runtime API.
3. Typecheck and affected test suites pass.

## Sprint 2: LLM Metadata and Evidence Integrity (6 Days | May 5 – May 12, 2026)
### Objective
Make LLM execution metadata first-class in persisted action and evidence records early in delivery.

### Tier Deliverables
1. Base: mandatory metadata for model, prompt version, latency, and token usage.
2. Pro: optional voice-quality and language-tier metadata fields added for billing and support diagnostics.
3. Enterprise: optional avatar-mode and provider metadata fields added for audit and incident response.

### Day-Wise Plan and Owners
1. Day 1 (May 5, Tue) - Finalize metadata contract shape and mapping rules.
- Owner: Priya Nair (Platform Lead) and Marcus Chen (Runtime Lead).
- Output: approved contract for model profile, prompt version, latency, and tokens.
2. Day 2 (May 6, Wed) - Implement runtime action-result metadata persistence.
- Owner: Marcus Chen (Runtime Lead).
- Output: metadata persisted on success, failure, and policy-block paths.
3. Day 3 (May 7, Thu) - Extend evidence and audit query surfaces.
- Owner: Jordan Wells (API Lead).
- Output: metadata fields available in audit/evidence read responses.
4. Day 4 (May 8, Fri) - Add metadata regression tests across runtime and gateway.
- Owner: Sam Rivera (QA Lead).
- Output: tests covering presence and consistency of metadata fields.
5. Day 5 (May 11, Mon) - Add traceability links action -> role -> snapshot -> model.
- Owner: Marcus Chen (Runtime Lead).
- Output: consistent correlation and snapshot linkage.
6. Day 6 (May 12, Tue) - Quality checks and defect closure.
- Owner: Sam Rivera (QA Lead).
- Output: all impacted suites green.

### Target Files
1. apps/agent-runtime/src/runtime-server.ts
2. apps/agent-runtime/src/action-result-contract.ts
3. apps/agent-runtime/src/action-result-writer.ts
4. services/evidence-service/**
5. apps/api-gateway/src/routes/audit.ts

### Exit Criteria
1. Every executed or blocked action includes LLM metadata.
2. Evidence and audit outputs contain queryable metadata fields.
3. Typecheck and targeted tests pass.

## Sprint 3: Entitlement Enforcement at Bot Creation and Activation (5 Days | May 13 – May 19, 2026)
### Objective
Enforce paid role subscriptions during bot lifecycle operations.

### Tier Deliverables
1. Base: enforce active subscription before bot create/activate for all tenants.
2. Pro: enforce Pro add-on entitlement for premium voice and expanded locale access.
3. Enterprise: enforce Enterprise add-on entitlement before avatar/video mode activation.

### Day-Wise Plan and Owners
1. Day 1 (May 13, Wed) - Define entitlement validation logic and response codes.
- Owner: Jordan Wells (API Lead).
- Output: clear error model for unentitled, expired, suspended.
2. Day 2 (May 14, Thu) - Implement creation-time entitlement checks.
- Owner: Jordan Wells (API Lead).
- Output: bot creation blocked before side effects.
3. Day 3 (May 15, Fri) - Implement activation/startup entitlement checks.
- Owner: Marcus Chen (Runtime Lead) and Jordan Wells (API Lead).
- Output: runtime/gateway activation protection paths.
4. Day 4 (May 18, Mon) - Add auth and lifecycle tests for pass/fail cases.
- Owner: Sam Rivera (QA Lead).
- Output: regression tests for valid and denied scenarios.
5. Day 5 (May 19, Tue) - Hardening and quality verification.
- Owner: Sam Rivera (QA Lead).
- Output: no regressions in existing authorized flows.

### Target Files
1. packages/db-schema/prisma/schema.prisma
2. apps/api-gateway/src/routes/auth.ts
3. apps/api-gateway/src/main.ts
4. apps/api-gateway/src/routes/auth.test.ts
5. apps/agent-runtime/src/runtime-server.ts

### Exit Criteria
1. Entitlement checks run before provisioning/activation side effects.
2. Existing authorized flows remain functional.
3. Typecheck and targeted tests pass.

## Sprint 4: Bot-Scoped Capability and Integration APIs (6 Days | May 20 – May 27, 2026)
### Objective
Complete bot-scoped API surfaces needed by dashboard and runtime operators.

### Tier Deliverables
1. Base: bot-scoped capability API includes default provider routing (`oss` by default).
2. Pro: API surfaces managed voice provider selection and expanded language tier settings.
3. Enterprise: API surfaces avatar provider configuration and video-mode policy switches.

### Day-Wise Plan and Owners
1. Day 1 (May 20, Wed) - Finalize endpoint contracts and response schemas.
- Owner: Jordan Wells (API Lead).
- Output: bot-scoped API contract for capabilities and integrations.
2. Day 2 (May 21, Thu) - Implement GET /v1/bots/:botId/capabilities and available integrations.
- Owner: Jordan Wells (API Lead).
- Output: role-constrained read paths.
3. Day 3 (May 22, Fri) - Implement bot-scoped connector list and connector setup endpoints.
- Owner: Jordan Wells (API Lead).
- Output: setup/list operations constrained by role compatibility.
4. Day 4 (May 25, Mon) - Integrate capability snapshot metadata in responses.
- Owner: Jordan Wells (API Lead).
- Output: role version and policy pack fields in response contracts.
5. Day 5 (May 26, Tue) - Add route tests for allow/deny and scope isolation.
- Owner: Sam Rivera (QA Lead).
- Output: endpoint regression matrix.
6. Day 6 (May 27, Wed) - Stabilization and contract validation.
- Owner: Jordan Wells (API Lead) and Sam Rivera (QA Lead).
- Output: passing gateway suite and clean typecheck.

### Target Files
1. apps/api-gateway/src/main.ts
2. apps/api-gateway/src/routes/connector-auth.ts
3. apps/api-gateway/src/routes/connector-actions.ts
4. apps/api-gateway/src/routes/connector-auth.test.ts
5. apps/api-gateway/src/routes/connector-actions.test.ts

### Exit Criteria
1. API never returns disallowed integrations for a bot role.
2. Bot-scoped endpoint contract tests pass.
3. Typecheck and targeted tests pass.

## Sprint 5: Dashboard Bot-Scoped UX and Explainability (5 Days | May 28 – Jun 3, 2026)
### Objective
Move website and dashboard from tenant-global connector views to bot-scoped views.

### Tier Deliverables
1. Base: UI shows audio-only default, supported languages, and selected open-source providers.
2. Pro: UI enables premium voice toggles and clearly labels add-on impact.
3. Enterprise: UI enables avatar/video settings and always-on AI disclosure preview.

### Day-Wise Plan and Owners
1. Day 1 (May 28, Thu) - Add selected bot context and route wiring.
- Owner: Aisha Okonkwo (Frontend Lead).
- Output: bot selector as primary page context.
2. Day 2 (May 29, Fri) - Replace tenant-global fetches with bot-scoped APIs.
- Owner: Aisha Okonkwo (Frontend Lead).
- Output: connectors and capabilities rendered by selected bot.
3. Day 3 (Jun 1, Mon) - Add capability panel and policy notes.
- Owner: Aisha Okonkwo (Frontend Lead).
- Output: role key, role version, policy version, allowed actions surfaced.
4. Day 4 (Jun 2, Tue) - Add UI tests for bot switching and hidden disallowed integrations.
- Owner: Sam Rivera (QA Lead).
- Output: deterministic UI regression tests.
5. Day 5 (Jun 3, Wed) - UX polish and stability checks.
- Owner: Aisha Okonkwo (Frontend Lead) and Sam Rivera (QA Lead).
- Output: passing website/dashboard suites.

### Target Files
1. apps/website/app/connectors/page.tsx
2. apps/website/components/**
3. apps/dashboard/app/page.tsx
4. apps/website/tests/**

### Exit Criteria
1. Different bots in same tenant show different integration catalogs.
2. Disallowed integrations are not shown for selected bot.
3. Typecheck and UI tests pass.

## Sprint 6: Hardening, Quality Gate, and Release Readiness (4 Days | Jun 4 – Jun 9, 2026)
### Objective
Stabilize for release with strict regressions and operational runbook updates.

### Tier Deliverables
1. Base: full regression pass for open-source-first path and fail-safe escalation behavior.
2. Pro: premium-voice fallback tests and add-on entitlement regression matrix.
3. Enterprise: avatar/video degradation tests, disclosure checks, and operational runbook signoff.

### Day-Wise Plan and Owners
1. Day 1 (Jun 4, Thu) - Build cross-boundary regression matrix and gap list.
- Owner: Sam Rivera (QA Lead).
- Output: end-to-end checklist for gateway, runtime, website, evidence.
2. Day 2 (Jun 5, Fri) - Implement missing failure-mode tests.
- Owner: Sam Rivera (QA Lead) and Marcus Chen (Runtime Lead).
- Output: outage and stale snapshot scenarios covered.
3. Day 3 (Jun 8, Mon) - Run full quality gate and fix blockers.
- Owner: Tobias Müller (DevOps Lead) and Sam Rivera (QA Lead).
- Output: green pnpm typecheck, pnpm test, pnpm quality:gate.
4. Day 4 (Jun 9, Tue) - Update quality report and runbooks for release signoff.
- Owner: Tobias Müller (DevOps Lead).
- Output: updated operations artifacts and release-readiness notes.

### Target Files
1. scripts/quality-gate.mjs
2. operations/quality/8.1-quality-gate-report.md
3. operations/runbooks/website-swa-runbook.md
4. apps/**/tests and services/**/tests impacted by new behavior

### Exit Criteria
1. pnpm typecheck passes.
2. pnpm test passes for impacted workspaces.
3. pnpm quality:gate passes.
4. No Sev-1 or Sev-2 unresolved findings.

## Ticket Mapping (Reference)
1. Sprint 1: AF-RB-007 completion, AF-RB-012 snapshot persistence, AF-RB-014 runtime regression expansion.
2. Sprint 2: AF-RB-008 and AF-RB-009.
3. Sprint 3: AF-RB-013 and entitlement portions of AF-RB-004.
4. Sprint 4: AF-RB-006 and remaining API surface from AF-RB-004 and AF-RB-005.
5. Sprint 5: AF-RB-010 and AF-RB-011.
6. Sprint 6: AF-RB-014 and AF-RB-015 final hardening.

## Working Agreement for Build Execution
1. Implement one sprint at a time and close its quality gate before starting the next sprint.
2. Every sprint ends with code, tests, docs updates, and explicit owner signoff.
3. Behavioral changes must include regression tests in the same sprint.
4. Do not bypass enforcement checks for temporary convenience paths.

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).
