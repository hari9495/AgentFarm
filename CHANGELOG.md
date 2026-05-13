# Changelog

All notable changes to AgentFarm are documented here.

Format: changes are grouped by sprint and date. Each entry describes what was built or changed and which package(s) were affected.

---

## Sprint 7 — 2026-05-07 (Spec-alignment wave and feature expansion)

### Added
- **memory-service**: Long-term memory read/write/update APIs (`memory-types.ts`, `memory-store.ts`). Runtime pre-task memory read and post-task memory mirror hooks in `apps/agent-runtime/src/execution-engine.ts`.
- **orchestrator**: Proactive signal detection extracted to `proactive-signal-detector.ts`. Added `ci_failure_on_main` and `dependency_cve` signals. New signal thresholds and payloads wired through orchestrator API.
- **approval-service**: Approval batcher — batch create and batch decision functions (`approval-batcher.ts`). Lifecycle audit events on batch operations.
- **api-gateway**: Batch approval create and decision routes in `src/routes/approvals.ts`. Handoff wrapper routes in `src/routes/handoffs.ts`.
- **dashboard**: Batch decision UI actions in `approval-queue-panel.tsx`.
- **agent-runtime**: Tester role policy enforced in `tester-agent-profile.ts` — tester connector and local-action constraints applied in `runtime-server.ts`.
- **agent-runtime**: Quality feedback loop — model/provider metadata on approvals; quality signals emitted on approval decisions; `llm-quality-tracker.ts` updated. Auto-provider routing composite formula: `score = availability_penalty × 0.6 + quality_penalty × 0.4`.
- **orchestrator**: Handoff protocol normalized — statuses: `pending`, `accepted`, `completed`, `failed`, `timed_out`. Timeout semantics added via `escalateOnTimeoutMs`. Pending filter updated, completion payload forwarding added.
- **packages/shared-types**: New contracts for memory, proactive signals, approval batching, handoff normalization, and tester role policy.

### Quality
- Sprint 7 test counts: api-gateway 898 tests / agent-runtime 906 tests / trigger-service 49 tests. Total: **1,853 tests, 0 failures**.

---

## Sprint 6 — 2026-05-06 (Hardening and quality gate pass)

### Changed
- **docker-compose.yml**: Added healthchecks for `opa` (port 8181/health) and `voicebox` (port 17493/health). All 8 runtime services now have healthchecks.
- **agent-runtime**: Desktop Operator abstraction finalized. `DesktopOperator` interface frozen in `packages/shared-types/src/desktop-operator.ts`. `MockDesktopOperator` factory added to `apps/agent-runtime/src/desktop-operator-factory.ts`. Mock short-circuits wired into all four Tier 11/12 desktop action cases in `local-workspace-executor.ts`.
- **Quality gate**: Full pass confirmed. 1,853 tests across api-gateway (898), agent-runtime (906), trigger-service (49). 0 failures.

### Infrastructure
- Sprint 6 quality gate report: `operations/quality/8.1-quality-gate-report.md`

---

## Sprint 5 — 2026-05-01 (Approval pipeline and dashboard wiring)

### Added
- **agent-runtime**: Structured approval packet generation in `processOneTask`. Post-change quality gate loop for local workspace action execution. `ActionResultRecord` enriched with `actorId`, `routeReason`, `evidenceLink`, `approvalSummary`.
- **api-gateway**: Structured approval packet parser (`src/lib/approval-packet.ts`). Structured packet fields exposed through approvals API and dashboard workspace slice.
- **dashboard**: `ApprovalItem` contract extended with `change_summary`, `impacted_scope`, `risk_reason`, `proposed_rollback`, `lint_status`, `test_status`, `packet_complete`. Detail drawer added to `approval-queue-panel.tsx` for structured packet inspection.

---

## Sprint 4 — 2026-04-28 (Voice, connectors, and agent intelligence)

### Added
- **agent-runtime**: Voicebox MCP registrar, speaking agent (TTS via VoxCPM2), meeting transcription pipeline.
- **agent-runtime**: Web research service, vision service, effort estimator.
- **agent-runtime**: `RoutingHistoryAdvisor` for routing-aware task dispatch.
- **agent-runtime**: Loop learning store and LLM quality tracker.
- **api-gateway**: Meetings routes, language routes, knowledge graph routes.
- **api-gateway**: A/B test routes, scheduled reports routes, environment reconciler routes.
- **dashboard**: Meetings page, knowledge graph page, loops page, analytics page.
- **trigger-service**: Email (IMAP) trigger channel. Slack event trigger channel.

---

## Sprint 3 — 2026-04-14 (Multi-agent orchestration and skills)

### Added
- **agent-runtime**: Multi-agent orchestrator. Skills registry, skill composition engine, skill pipeline, skill scheduler.
- **agent-runtime**: Autonomous coding loop, autonomous loop orchestrator, wake coalescer.
- **agent-runtime**: Planner loop and plan executor for multi-step task planning.
- **agent-runtime**: Repo knowledge graph builder.
- **api-gateway**: Orchestration routes, autonomous loops routes, skill pipelines routes, skill composition execute routes.
- **api-gateway**: Handoffs routes, snapshots routes, plugin loading routes.
- **dashboard**: Orchestration page, pipelines page, handoffs page, snapshots page.

---

## Sprint 2 — 2026-03-31 (Security, governance, and billing)

### Added
- **api-gateway**: `@fastify/helmet` security headers, per-IP and per-tenant rate limiting, 1 MB body limit, CORS origin validation.
- **api-gateway**: Approval intake and decision endpoints. Kill-switch activation/resume. Approval enforcer.
- **api-gateway**: Budget policy routes with daily/monthly enforcement and cost ledger.
- **api-gateway**: Billing routes, subscription guard middleware.
- **api-gateway**: Governance workflows, governance KPIs, retention policy, circuit breakers.
- **api-gateway**: AB tests, outbound webhooks with HMAC signing, webhook DLQ.
- **agent-runtime**: Risk classification engine (HIGH_RISK_ACTIONS, MEDIUM_RISK_ACTIONS). Confidence-based escalation (< 0.6 → medium).
- **agent-runtime**: Evidence assembler and evidence record writer.
- **agent-runtime**: Post-task closeout with audit integration.
- **packages/connector-contracts**: 18-connector registry, 18 normalized action types, 12 agent role policies.

---

## Sprint 1 — 2026-03-14 (Foundation)

### Added
- **Monorepo**: pnpm workspace established. `tsconfig.base.json` with NodeNext module resolution.
- **packages/db-schema**: Prisma schema with initial models for tenancy, agents, tasks, audit, billing, and connectors.
- **api-gateway**: Initial Fastify 5 server with auth routes, agent routes, task routes, connector routes.
- **agent-runtime**: Initial Fastify 5 server with 9 LLM providers, execution engine, 12 action tiers, local workspace executor.
- **trigger-service**: Initial Fastify 5 server with HTTP webhook trigger ingestion.
- **dashboard**: Initial Next.js 15 app with approval queue, agent list, task history, audit log, and API proxy layer.
- **website**: Initial Next.js 15 marketing and signup app.
- **docker-compose.yml**: PostgreSQL 16, Redis, api-gateway, agent-runtime, trigger-service, dashboard, migrate.
- **.github/workflows/ci.yml**: 7-job CI pipeline (website-permissions, validate, db-integration, install, typecheck, test, build).
