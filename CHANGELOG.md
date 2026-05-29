# Changelog

All notable changes to AgentFarm are documented here.

Format: changes are grouped by sprint and date. Each entry describes what was built or changed and which package(s) were affected.

---

## Sprint 18 — 2026-05-23 (Content Writer capability gaps)

### Added
- **agent-runtime**: 10 gap modules completing the Content Writer capability surface: `llm-prose-writer.ts` (LLM prose generation from brief spec + brand voice + research), `content-research-service.ts` (Wikipedia + news RSS snippet ingestion), `seo-optimizer.ts` (keyword density, meta description, readability), `cms-publisher.ts` (WordPress, Contentful, HubSpot draft creation), `image-sourcer.ts` (Unsplash/Pexels image suggestions), `tone-adapter.ts` (LLM tone rewriting with detectCurrentTone), `revision-handler.ts` (section-level editorial comment application), `brand-voice-learner.ts` (vocabulary/tone extraction from sample texts), `content-scheduler.ts` (editorial milestone booking on Google Calendar).
- **agent-runtime**: `content-writer-action-handler.ts` — Tier 28 dispatch for all 10 `workspace_cw_*` action types. `isContentWriterActionType` type guard. Wired into `local-workspace-executor.ts`.
- **agent-runtime**: `content-writer-agent-profile.ts` extended with 8 new connectors: `google_drive`, `slack`, `microsoft_teams`, `gmail`, `wordpress`, `contentful`, `hubspot_cms`, `google_calendar`. All 10 `workspace_cw_*` types added to allowed local actions.
- **agent-runtime**: `content-writer-mcp-provisioner.ts` extended with 4 MCP environment entries: `wordpress`, `contentful`, `hubspot_cms`, `google_calendar`.
- **agent-runtime**: `runtime-server.ts` extended with `'wordpress' | 'contentful' | 'hubspot_cms'` in `RuntimeConnectorType` union.

### Quality
- 47/47 quality gate checks PASS.

---

## Sprint 17 — 2026-05-20 (Content Writer role)

### Added
- **agent-runtime**: Full Content Writer role implementation: `content-writer-agent-profile.ts`, `content-writer-persona-defaults.ts`, `content-writer-episodic-hooks.ts`, `content-writer-mcp-provisioner.ts`, `content-writer-standup-builder.ts`.
- **agent-runtime**: Content Writer handler layer: `content-writer/brief-parser.ts`, `draft-builder.ts`, `fact-checker.ts`, `editorial-router.ts` — each with `node:test` tests.
- **agent-runtime**: `role-profiles/content-writer-role-profile.ts` — `CONTENT_WRITER_ROLE_KEY`, `CONTENT_WRITER_BLOCKED_ACTIONS`, `CONTENT_WRITER_APPROVAL_THRESHOLDS`, `CONTENT_WRITER_BLOCKED_KEYWORDS`.
- **agent-runtime**: `task-classifier.ts` extended with `content_writer` heuristic branch (20 positive keywords).
- **agent-runtime**: `persona-context-loader.ts` extended with `content_writer` case.
- **agent-runtime**: `runtime-server.ts` extended with connector policy, action policy, blocked-action guard, MCP pre-warm, episodic+semantic memory write blocks for `content_writer`.

### Quality
- 47/47 quality gate checks PASS.

---

## Sprint 16 — 2026-05-20 (Stripe webhook fix + Tester marketplace)

### Fixed
- **api-gateway**: `verifyStripeWebhook` now handles `checkout.session.completed` events. Early-return `{ success: false }` when `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` are missing, avoiding SDK init errors in test environments.
- **api-gateway**: `POST /v1/billing/checkout-session` now calls `createOrderRecord` before returning, so `markOrderPaid` can find the order when the webhook fires.
- **api-gateway**: Defensive `try/catch` wrapper around `verifyStripeWebhook` in the webhook route handler. 3 new webhook route tests added.

### Added
- **website**: `apps/website/app/marketplace/tester/page.tsx` — full Tester marketplace listing page with hero, pricing card, `HireAgentButton` (roleKey=tester), 6 capability category cards with tool pills (18 connectors), 8 sample tasks covering all 5 testing disciplines, sample CI triage report panel.

### Quality
- 21/21 billing tests PASS.

---

## Sprint 15 — 2026-05-19 (Dashboard wiring + per-agent billing)

### Fixed
- **dashboard**: `agent-decommission-button.tsx` — changed incorrect `DELETE /api/agents/:botId` to `POST /api/agents/:botId/terminate`. Removed non-existent `DELETE` handler from `app/api/agents/[botId]/route.ts`.
- **dashboard**: New proxy route `app/api/agents/[botId]/terminate/route.ts` — `POST` → `POST /v1/agents/:botId/terminate`, `GET` → `GET /v1/agents/:botId/terminate/status`.

### Added
- **api-gateway**: `computeMeteringPeriodSummary` extended with optional `botId?: string` param for per-agent filtering. New `GET /v1/billing/metering/agent?botId=&from=&to=` endpoint.
- **dashboard**: `agent-billing-card.tsx` — client component showing per-agent: task count, billable tasks, platform fee, LLM cost, total charge. Wired into `app/agents/[botId]/page.tsx`.
- **dashboard**: New proxy route `app/api/billing/agent/route.ts`.

---

## Sprint 14 — 2026-05-16 (Developer agent gap closure)

### Added
- **agent-runtime**: `workspace_ai_code_review` real static analysis implementation (was a stub).
- **api-gateway**: `GET /v1/workspaces/:workspaceId/pull-requests` — list PR drafts with status/limit filter. 5 new tests.
- **api-gateway**: `GET /v1/workspaces/:workspaceId/ci-failures` — list CI triage reports with status/limit filter. 5 new tests.
- **dashboard**: `app/api/agents/[botId]/pr-drafts/route.ts` and `app/api/agents/[botId]/ci-runs/route.ts` — new proxy routes.

### Quality
- api-gateway: **1,237 tests, 0 failures** (Sprint 14 exit gate).

---

## Sprint 13 — 2026-05-18 (Billing checkout + disclosure compliance)

### Added
- **api-gateway**: `POST /v1/billing/checkout-session` — creates Stripe hosted checkout session with plan metadata + tenant isolation. Returns `{ checkoutUrl, sessionId }`.
- **api-gateway**: `GET /v1/billing/invoices/:invoiceId/download` — tenant-isolated invoice download.
- **api-gateway**: `disclosure.ts` — 4 new routes: `GET /v1/disclosure/:botId`, `PATCH /v1/disclosure/:botId`, `POST /v1/disclosure/:botId/ack`, `GET /v1/disclosure/:botId/audit`. 13 tests.
- **agent-runtime**: `disclosure-guard.ts` — `isDisclosurePresent`, `formatDisclosure` (email/slack/pr/meeting/chat channels), `enforceDisclosure`, `buildDisclosureAuditNote`. EU AI Act Art. 52 / FTC / CA SB 1001 compliant. 18 tests.
- **dashboard**: Billing checkout page (`app/billing/checkout/page.tsx`) — plan selector + Stripe redirect.
- **dashboard**: Disclosure settings panel (`components/disclosure-settings-panel.tsx`) — compliance badge (EU/FTC/CA), jurisdiction pills, textarea editor + preview, audit trail.
- **dashboard**: Disclosure settings page (`app/settings/disclosure/page.tsx`).

### Quality
- api-gateway: 1,225 tests, 0 failures. agent-runtime: 1,096 tests, 0 failures.

---

## Sprint 12 — 2026-05-18 (OAuth connectors + episodic memory management)

### Added
- **api-gateway**: `connector-auth.ts` — 1,370 lines. Full OAuth flows for Jira, GitHub, Teams, Email: initiate, callback, refresh, revoke, health-summary, internal token. CSRF nonce, replay rejection, scope validation, Key Vault references. 22 tests.
- **api-gateway**: `episodic-memory.ts` — `GET /v1/episodic-memory` (paginated) + `DELETE /v1/episodic-memory/:id` (GDPR right-to-be-forgotten). 9 tests.
- **dashboard**: Connector management page (`app/connectors/page.tsx`), connector marketplace page (`app/connector-marketplace/page.tsx`), `connector-config-panel.tsx` with OAuth connect/revoke buttons.
- **dashboard**: Memory browser page (`app/memory/page.tsx`), `agent-episodic-memory-panel.tsx` — paginated browse + GDPR delete.

### Quality
- api-gateway: 1,204 tests, 0 failures.

---

## Sprint 11 — 2026-05-18 (Voice profiles + meeting audio)

### Added
- **services/desktop-agent**: PulseAudio virtual audio integration (`Dockerfile` — pulseaudio + ffmpeg; `entrypoint.sh` — virtual-sink + virtual-source).
- **services/desktop-agent**: `app.py` — new meeting routes: `POST /v1/sessions/:id/join-meeting`, `/speak`, `/capture-audio`.
- **agent-runtime**: `voicebox-client.ts` extended with `createVoiceProfile()` (multipart POST) and `createVoiceProfileFromDescription()` (design-mode POST).
- **agent-runtime**: `speaking-agent.ts` migrated from VoxCPM2 to VoiceboxClient.
- **agent-runtime**: `meeting-transcription.ts` — `runMeetingParticipation()` join→capture→transcribe→speak loop.
- **agent-runtime**: `voice-profile-seeder.ts` — 12 role voices (Alex, Blair, Cameron, Dana, Ellis, Finley, Harper, Jordan, Morgan, Parker, Quinn, Rowan). Idempotent `seedVoiceProfiles()` called at server startup.
- **api-gateway**: `desktop-sessions.ts` — 3 new audio proxy routes: join-meeting, speak, capture-audio.
- **docker-compose.yml**: `VOICEBOX_URL: http://voicebox:17493` added to `api-gateway` and `desktop-agent`.

### Quality
- 46/46 quality gate checks PASS.

---

## Sprint 10 — 2026-05-18 (Full desktop VM mode)

### Added
- **services/desktop-agent**: Ubuntu 22.04 Docker container with Xvfb + x11vnc + websockify/noVNC + Playwright + PyAutoGUI.
- **services/desktop-agent**: Python Flask vision loop service (`app.py`) — screenshot→LLM→action loop supporting Anthropic, OpenAI, and Ollama providers.
- **packages/shared-types**: `desktop-agent-contracts.ts` — `VisionLoopRequest/Result`, `DesktopAction`, `DesktopActionType`.
- **api-gateway**: `desktop-sessions.ts` — start, stream, task, delete session routes; registered in `main.ts`.
- **dashboard**: `desktop-stream-panel.tsx` — noVNC iframe + session controls; `desktop-panel.tsx` — submit task, view vision steps.
- **services/provisioning-service**: `vm-lifecycle-manager.ts` — `provisionAgentVM` + `terminateAgentVM` via Azure ARM with injectable adapter.
- **agent-runtime**: `NativeDesktopOperator` wired to dispatch `workspace_visual_task` through the desktop-agent API. Generic visual task action lets any role dispatch arbitrary GUI goals.

---

## Sprint 9 — 2026-05-15 (Fire-agent termination + semantic memory RAG)

### Added
- **api-gateway**: `agent-lifecycle.ts` — `POST /v1/agents/:botId/terminate` (creates `ProvisioningJob` with `status: cleanup_pending`, `triggerSource: termination`; guards duplicate cleanup_pending jobs). `GET /v1/agents/:botId/terminate/status`. 10 tests.
- **packages/shared-types**: `semantic-memory.ts` — `SemanticMemoryRecord`, `SemanticSearchResult`, `SemanticWriteRequest`, `SemanticSearchRequest`. CONTRACT_VERSIONS: `SEMANTIC_MEMORY: '1.0.0'`.
- **services/memory-service**: `semantic-write-hook.ts` — embeds content via Azure OpenAI, inserts into `AgentKnowledgeBase` using pgvector cast. `semantic-search-hook.ts` — cosine similarity query (top-5, min 0.70).
- **api-gateway**: `knowledge-base.ts` — `POST /v1/knowledge-base/write` and `POST /v1/knowledge-base/search`. 9 tests.
- **agent-runtime**: Pre-task semantic recall in `runtime-server.ts` — calls `searchSemanticMemory`, attaches top-5 results as `task.payload._semantic_context` (non-blocking).
- **db-schema**: Migration `20260522000000_semantic_knowledge_base` — `AgentKnowledgeBase` model with `vector(1536)`.

### Quality
- 47/47 quality gate checks PASS. api-gateway: 1,181 tests.

---

## Sprint 8 — 2026-05-08 (Developer vertical hardening)

### Added
- **agent-runtime**: `evaluator-webhook.ts` — fire-and-forget POST to evaluator endpoint after quality signal capture. `resolveEvaluatorWebhookUrl(env)` validates `RUNTIME_EVALUATOR_WEBHOOK_URL`.
- **orchestrator**: `agent-handoff-manager.ts` — durable handoff create/status-update with immediate persistence. Handoff records survive orchestrator restarts.
- **orchestrator**: `orchestrator-state-store.ts` extended to include `agentHandoffs` in persisted state; restored at server startup.

### Quality
- Quality gate: 8.1-quality-gate-report.md — PASS.

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
