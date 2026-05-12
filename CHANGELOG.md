# Changelog

All notable changes to AgentFarm are documented here.

Format: changes are grouped by sprint and date. Each entry describes what was built or changed and which package(s) were affected.

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
