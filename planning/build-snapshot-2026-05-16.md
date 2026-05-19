# AgentFarm Build Snapshot 2026-05-16

## Purpose
Full-state audit of the AgentFarm codebase as of May 16, 2026 — covering everything built across all sprints, current quality gate status, and a clear starting point for Sprint 10.

## Summary
- **Date:** 2026-05-16
- **Quality Gate:** PASS — 47/47 lanes, 1181/1181 api-gateway tests
- **Sprints Completed:** 1 through 9
- **Current Sprint:** 10 (not yet started — Persona Layer is Sprint 1 of new product plan and is DONE; see Sprint 10 scope below)
- **Next Sprint Scope:** Sprint 10 — Full Desktop Mode (noVNC + Xvfb VM)

---

## Sprint Delivery History

### Sprint 1 — Persona Layer ✅
**Closed:** May 15–16, 2026  
**Goal:** Every agent has a real identity for outbound communication.

New files:
- `packages/shared-types/src/persona.ts` — `AgentPersonaRecord`, `CreatePersonaInput`, `UpdatePersonaInput`
- `apps/api-gateway/src/routes/personas.ts` — `GET/POST/PATCH /v1/personas/:botId`
- `apps/agent-runtime/src/persona-context-loader.ts` — loads persona from DB (60s LRU cache), injects into task envelope
- `apps/agent-runtime/src/system-prompt-builder.ts` — builds LLM system prompt with persona identity block + disclosure footer
- `apps/dashboard/app/settings/persona/page.tsx` — persona editor UI
- `apps/dashboard/app/components/agent-persona-panel.tsx` — CRUD form (name, email, avatar, communication style, disclosure)

DB migration: `20260520000000_add_agent_persona` — `AgentPersona` model.

---

### Sprint 2 — Role Enforcement Framework ✅
**Goal:** Each agent is strictly bound to its role — no cross-role task execution.

New files:
- `packages/shared-types/src/role-enforcement-contracts.ts` — `RoleProfile`, `RoleDeclineResult`
- `apps/api-gateway/src/routes/roles.ts` — role profile queries
- `apps/agent-runtime/src/role-enforcer.ts` + test — hard-blocks out-of-role tasks before any LLM call
- `apps/agent-runtime/src/task-classifier.ts` — LLM-based task-role membership check
- `apps/agent-runtime/src/role-profiles/developer-role-profile.ts` — Developer role config (connector allowlist, action allowlist, approval thresholds)
- `apps/agent-runtime/src/tester-agent-profile.ts` — Tester role config

Shared-types CONTRACT_VERSIONS: `ROLE_ENFORCEMENT: '1.0.0'`

---

### Sprint 3 — pgvector Episodic Memory ✅
**Goal:** Per-person interaction history stored as vector embeddings.

New files:
- `packages/shared-types/src/episodic-memory.ts` — `EpisodicMemoryRecord`
- `services/memory-service/src/episodic-read-hook.ts` + test
- `services/memory-service/src/episodic-write-hook.ts` + test
- `services/memory-service/src/embedding-service.ts` + test
- `apps/agent-runtime/src/memory-context-injector.ts` + test — injects top-5 vector-similar memories as system context

DB migration: `20260515100000_pgvector_episodic_memory` — `AgentLongTermMemory.embedding vector(1536)`.

CONTRACT_VERSIONS: `EPISODIC_MEMORY: '1.0.0'`

---

### Sprint 4 — Setup Wizard — Backend ✅
**Goal:** Hiring a new agent goes through a governed multi-step onboarding session.

New files:
- `packages/shared-types/src/setup-wizard.ts` — `SetupWizardSessionRecord`, `SETUP_STEPS`
- `packages/shared-types/src/onboarding-wizard-contracts.ts` — `WizardSession`, `WizardStep`
- `apps/api-gateway/src/routes/setup-wizard.ts` — `POST /v1/setup-wizard`, `GET /:sessionId`, `PATCH /:sessionId/step`, `POST /:sessionId/complete`
- `apps/api-gateway/src/lib/hire-handler.ts` — creates `ProvisioningJob` on wizard complete

DB: `SetupWizardSession` model (`tenantId`, `step`, `roleKey`, `connectorStatus`, `personaConfig`, `approvalPolicy`, `status`).

CONTRACT_VERSIONS: `SETUP_WIZARD: '1.0.0'`

---

### Sprint 5 — Setup Wizard — Frontend ✅
**Goal:** Self-service hire flow visible to customers.

New files:
- `apps/website/app/onboarding/wizard/page.tsx` — multi-step wizard UI (select role → connect tools → configure persona → set approval rules → deploy)
- `apps/api-gateway/src/routes/connector-auth.ts` — OAuth initiate + callback routes for Jira, GitHub, Teams, email

---

### Sprint 6 — Marketplace Listing ✅
**Goal:** Customers can browse and compare all 12 agent roles.

New files:
- `apps/website/app/marketplace/page.tsx` — browse all agent roles
- `apps/website/app/marketplace/developer/page.tsx` — Developer agent detail + hire CTA
- `apps/website/lib/bots-catalogue.ts` — all 12 role definitions (Developer, Tester, Sales Rep, Corporate Assistant, Technical Writer, Full Stack Developer, Business Analyst, Content Writer, PM/PO/Scrum Master, Marketing Specialist, Recruiter, Customer Support Executive)
- `apps/website/lib/bots.ts` — extended bot data + role descriptions

E2E tests added in `apps/website/tests/`.

---

### Sprint 7 — Billing Metering ✅
**Goal:** Track platform fee ($0.10/task) per tenant for billing.

New files:
- `packages/shared-types/src/billing-metering.ts` — `PER_TASK_PLATFORM_FEE_USD = 0.10`, `UsageMeteringEvent`, `MeteringPeriodSummary`
- `apps/api-gateway/src/lib/usage-meter.ts` — `computeMeteringPeriodSummary()` with pre-sprint fallback
- `apps/api-gateway/src/lib/usage-meter.test.ts` — 4 tests (success, fallback, zero, failed-only)
- `apps/dashboard/app/api/billing/metering/route.ts` — Next.js proxy → `/v1/billing/metering/period`

Modified:
- `apps/api-gateway/src/routes/billing.ts` — added `GET /v1/billing/metering/period`
- `apps/agent-runtime/src/runtime-server.ts` — emits `platformFeeUsd: 0.10` per successful task
- `apps/dashboard/app/billing/page.tsx` — fetches and displays metering data
- `apps/dashboard/app/components/subscription-status-card.tsx` — `platformCharge` prop + "Est. charge this period"

DB migration: `20260521000000_sprint7_platform_fee` — `TaskExecutionRecord.platformFeeUsd Float?`

CONTRACT_VERSIONS: `USAGE_METERING: '1.0.0'`

---

### Sprint 8 — Developer Vertical Hardening ✅
**Goal:** Evaluator feedback loop, durable handoff persistence across restarts.

New files:
- `apps/agent-runtime/src/evaluator-webhook.ts` + test — fire-and-forget POST to evaluator endpoint after quality signal capture; `resolveEvaluatorWebhookUrl(env)` validates `RUNTIME_EVALUATOR_WEBHOOK_URL`
- `apps/orchestrator/src/agent-handoff-manager.ts` — durable handoff create/status-update with immediate persistence
- `apps/orchestrator/src/orchestrator-state-store.ts` — extended to include `agentHandoffs` in persisted state; restored at server startup

Tests added:
- Orchestrator restart persistence test (handoff records survive restart)
- Evaluator webhook unit tests (URL resolution, dispatch payload, non-throwing on failure)

Quality gate: `8.1-quality-gate-report.md` — PASS

---

### Sprint 9 — Fire-Agent Termination + Semantic Memory RAG ✅
**Closed:** May 15–16, 2026  
**Goal:** VM lifecycle end (graceful deprovision) + company knowledge base with semantic search.

**Feature 1 — Fire-Agent Graceful Deprovision:**

New files:
- `apps/api-gateway/src/routes/agent-lifecycle.ts` — `POST /v1/agents/:botId/terminate` (creates `ProvisioningJob` with `status: cleanup_pending`, `triggerSource: termination`; returns 202 `{ reused, jobId, status }`); `GET /v1/agents/:botId/terminate/status`
- `apps/api-gateway/src/routes/agent-lifecycle.test.ts` — 10 tests: 401, 404-bot, 404-workspace, 403-cross-tenant, 202-reused-true, 202-reused-false, 202-internal-scope, status-401, status-404, status-200

Key design:
- Guards duplicate `cleanup_pending` jobs (returns `reused: true` if one exists)
- Tenant isolation: rejects cross-tenant unless `session.scope === 'internal'`
- Plugs into existing `processCleanupPendingJob()` poller — no new poller needed

**Feature 2 — Semantic Memory / Company Knowledge RAG:**

New files:
- `packages/shared-types/src/semantic-memory.ts` — `SemanticMemoryRecord`, `SemanticSearchResult`, `SemanticWriteRequest`, `SemanticSearchRequest`
- `services/memory-service/src/semantic-write-hook.ts` + test — embeds content via Azure OpenAI (`createEmbedFn`), inserts into `AgentKnowledgeBase` using `$queryRaw` + `::vector` cast; returns `SemanticMemoryRecord`
- `services/memory-service/src/semantic-search-hook.ts` + test — cosine similarity query (`1 - (embedding <=> ::vector)`), top-5, min similarity 0.70
- `apps/api-gateway/src/routes/knowledge-base.ts` — `POST /v1/knowledge-base/write` (201/400/401/503), `POST /v1/knowledge-base/search` (200/400/401/503); injectable `_writeHook`/`_searchHook` for testability
- `apps/api-gateway/src/routes/knowledge-base.test.ts` — 9 tests (write: 401/503/400/201; search: 401/503/400/200)

Modified:
- `apps/agent-runtime/src/runtime-server.ts` — pre-task semantic recall: calls `searchSemanticMemory`, attaches top-5 results as `task.payload._semantic_context` (non-blocking, try/catch)
- `services/memory-service/src/index.ts` — exports `writeSemanticMemory`, `searchSemanticMemory`
- `apps/api-gateway/src/main.ts` — registers `registerKnowledgeBaseRoutes`, `registerAgentLifecycleRoutes`

DB migration: `20260522000000_semantic_knowledge_base` — `AgentKnowledgeBase` model with `vector(1536)`.

CONTRACT_VERSIONS: `SEMANTIC_MEMORY: '1.0.0'`

Quality gate: `9.1-quality-gate-report.md` — **PASS** (47 lanes, 1181/1181 api-gateway tests)

---

## Full File Map by Layer

### packages/shared-types/src/ — Contract Files
| File | Key Exports | Sprint |
|------|-------------|--------|
| `action-result-contract.ts` | `ActionResultRecord`, `ActionResultStatus` | Legacy |
| `agent-hire-contract.ts` | `AgentHireRequest`, `AgentHireRecord` | Legacy |
| `agent-session-contract.ts` | `AgentSession`, `AgentSessionState` | Legacy |
| `approval-contracts.ts` | `ApprovalRecord`, `ApprovalDecision`, `ApprovalBatchRecord` | Legacy |
| `billing-metering.ts` | `PER_TASK_PLATFORM_FEE_USD=0.10`, `UsageMeteringEvent`, `MeteringPeriodSummary` | Sprint 7 |
| `bot-capability-snapshot.ts` | `BotCapabilitySnapshot` | Legacy |
| `browser-action-contracts.ts` | `BrowserActionEvent`, `BrowserActionType` | Legacy |
| `connector-action-contracts.ts` | `ConnectorActionRecord` | Legacy |
| `cost-estimate-contracts.ts` | `CostEstimate`, `CostCalculationResult` | Legacy |
| `episodic-memory.ts` | `EpisodicMemoryRecord` | Sprint 3 |
| `evidence-contracts.ts` | `EvidenceRecord`, `EvidenceManifest` | Legacy |
| `governance-contracts.ts` | `GovernanceWorkflow`, `GovernanceKpi` | Legacy |
| `hire-contract.ts` | `AgentHireContract`, `HireContractStatus` | Legacy |
| `knowledge-graph-contracts.ts` | `KnowledgeNode`, `KnowledgeEdge` | Legacy |
| `memory-contracts.ts` | `LongTermMemoryRecord`, `ShortTermMemoryRecord` | Legacy |
| `notification-contracts.ts` | `NotificationPayload`, `NotificationChannel` | Legacy |
| `onboarding-wizard-contracts.ts` | `WizardSession`, `WizardStep` | Sprint 4 |
| `outbound-webhook-contracts.ts` | `OutboundWebhookRecord` | Legacy |
| `persona.ts` | `AgentPersonaRecord`, `CreatePersonaInput`, `UpdatePersonaInput` | Sprint 1 |
| `plan-contracts.ts` | `AgentPlan`, `PlanStep` | Legacy |
| `policy-contracts.ts` | `PolicyDecision`, `PolicyRule` | Legacy |
| `provisioning-contracts.ts` | `ProvisioningJobRecord`, `ProvisioningStatus` | Legacy |
| `queue-message-contracts.ts` | `QueueMessage`, `QueueMessageType` | Legacy |
| `retention-contracts.ts` | `RetentionPolicy` | Legacy |
| `role-enforcement-contracts.ts` | `RoleProfile`, `RoleDeclineResult` | Sprint 2 |
| `runtime-audit-contracts.ts` | `AuditEvent`, `RuntimeAuditRecord` | Legacy |
| `semantic-memory.ts` | `SemanticMemoryRecord`, `SemanticSearchResult`, `SemanticWriteRequest`, `SemanticSearchRequest` | Sprint 9 |
| `setup-wizard.ts` | `SetupWizardSessionRecord`, `SETUP_STEPS` | Sprint 4 |
| `task-execution-contracts.ts` | `TaskExecutionRecord`, `TaskExecutionOutcome` | Legacy |

### packages/db-schema/prisma/migrations/ — All Migrations (chronological)
| Migration | Purpose | Sprint |
|-----------|---------|--------|
| 20260501000000_* | Initial schema (legacy — multiple early migrations) | Legacy |
| 20260515000000_add_meeting_session_slack_distributed | Meeting/Slack models | Legacy |
| 20260515100000_pgvector_episodic_memory | `AgentLongTermMemory.embedding vector(1536)` | Sprint 3 |
| 20260516000000_add_lead_nurture_models | Lead nurture | Legacy |
| 20260517000000_add_sales_agent_config | `SalesAgentConfig` | Legacy |
| 20260518000000_add_sales_models | `Prospect`, `SalesDeal`, `SalesActivity` | Legacy |
| 20260519000000_add_sequence_lead_nurture | Lead sequence models | Legacy |
| 20260520000000_add_agent_persona | `AgentPersona` model | Sprint 1 |
| 20260521000000_sprint7_platform_fee | `TaskExecutionRecord.platformFeeUsd Float?` | Sprint 7 |
| 20260522000000_semantic_knowledge_base | `AgentKnowledgeBase` with `vector(1536)` | Sprint 9 |

### apps/api-gateway/src/routes/ — All Routes (86 files)
Key new routes by sprint:
- Sprint 1: `personas.ts` — `GET/POST/PATCH /v1/personas/:botId`
- Sprint 2: `roles.ts` — role profile queries
- Sprint 4: `setup-wizard.ts` — wizard CRUD + completion
- Sprint 5: `connector-auth.ts` — OAuth initiate + callback
- Sprint 7: `billing.ts` (extended) — `GET /v1/billing/metering/period`
- Sprint 9: `agent-lifecycle.ts` — terminate + status; `knowledge-base.ts` — write + search

### services/memory-service/src/ — All Files (13)
| File | Purpose | Sprint |
|------|---------|--------|
| `memory-types.ts` | Type definitions | Legacy |
| `memory-store.ts` + test | Main memory interface | Legacy |
| `embedding-service.ts` + test | Vector embedding generation (Azure OpenAI) | Sprint 3 |
| `episodic-read-hook.ts` + test | Read pgvector episodic memory | Sprint 3 |
| `episodic-write-hook.ts` + test | Write episodic memory | Sprint 3 |
| `semantic-write-hook.ts` + test | Embed + INSERT to `AgentKnowledgeBase` | Sprint 9 |
| `semantic-search-hook.ts` + test | Cosine similarity search | Sprint 9 |
| `index.ts` | Exports all hooks | All |

### apps/agent-runtime/src/ — Key Files
| File | Purpose | Sprint |
|------|---------|--------|
| `runtime-server.ts` | Main execution loop; pre-task semantic recall; emits `platformFeeUsd` | All |
| `persona-context-loader.ts` | Loads persona from DB (60s LRU cache), injects into task envelope | Sprint 1 |
| `system-prompt-builder.ts` | Builds LLM system prompt with persona identity block + disclosure | Sprint 1 |
| `role-enforcer.ts` | Blocks out-of-role tasks before any LLM call | Sprint 2 |
| `task-classifier.ts` | LLM-based role membership check | Sprint 2 |
| `memory-context-injector.ts` | Injects top-5 vector-similar memories as system context | Sprint 3 |
| `execution-engine.ts` | Core task execution with memory hooks | Sprint 3 |
| `evaluator-webhook.ts` | Fire-and-forget POST to evaluator endpoint post-task | Sprint 8 |
| `autonomous-loop-orchestrator.ts` | Multi-step autonomous task loops | Legacy |
| `autonomous-coding-loop.ts` | Developer-specific coding loop | Legacy |
| `evidence-assembler.ts` | Builds evidence packets for approvals | Legacy |
| `llm-quality-tracker.ts` | Quality scoring per provider/model | Legacy |
| `role-profiles/developer-role-profile.ts` | Developer role config | Sprint 2 |
| `tester-agent-profile.ts` | Tester role config | Sprint 2 |

---

## Database Model Summary

### Sprint-Owned Models
| Model | Sprint | Key Fields |
|-------|--------|-----------|
| `AgentPersona` | Sprint 1 | `botId` (unique), `displayName`, `emailAddress`, `avatarUrl`, `communicationStyle`, `disclosureStatement`, `language`, `timezone`, `workingHours` (JSON) |
| `AgentLongTermMemory` | Sprint 3 | `embedding vector(1536)`, `embeddingModel`, `botId`, `workspaceId`, `tenantId` |
| `SetupWizardSession` | Sprint 4 | `tenantId`, `step`, `roleKey`, `connectorStatus`, `personaConfig`, `approvalPolicy`, `status` |
| `TaskExecutionRecord` | Sprint 7 | `platformFeeUsd Float?` (new field), `modelProvider`, `promptTokens`, `completionTokens`, `latencyMs`, `outcome` |
| `AgentKnowledgeBase` | Sprint 9 | `tenantId`, `botId?`, `content`, `sourceUrl`, `sourceType`, `embeddingModel`, `embedding vector(1536)` |

### Legacy Core Models (100+ total)
Bot, Workspace, Tenant, RuntimeInstance, ProvisioningJob, BotCapabilitySnapshot, BotConfigVersion, ActionRecord, Approval, AuditEvent, ConnectorAuthMetadata, ConnectorAction, WorkspaceSessionState, DesktopProfile, IdeState, TerminalSession, ActivityEvent, EnvProfile, DesktopAction, PrDraft, CiTriageReport, WorkMemory, StoredEvidenceBundle, RetentionPolicy, AgentSession, BrowserActionEvent, AgentShortTermMemory, AgentRepoKnowledge, AgentQuestion, MeetingSession, Plan, Order, Invoice, TenantSubscription, AgentSubscription, SalesAgentConfig, Prospect, SalesDeal, SalesActivity, BookingEvent, ContractEvent, WinLossEvent, ScheduledJob, ChatSession, ChatMessage, OrchestrationRun, MarketplaceListing, AbTest, CircuitBreakerState, TaskQueueEntry, ScheduledReport, ApiKey, PluginAllowlist, OutboundWebhook, WebhookDlqEntry

---

## Quality Gate Status

| Sprint | Quality Gate | Lanes | Tests |
|--------|-------------|-------|-------|
| Sprint 7 | 8.2-pre-deploy-evidence.json — PASS | All | 99 agent-runtime |
| Sprint 8 | 8.1-quality-gate-report.md — PASS | 47/47 | — |
| Sprint 9 | 9.1-quality-gate-report.md — PASS | **47/47** | **1181 api-gateway** |

---

## Known Pre-Existing Type Errors (DO NOT fix)
These files have type errors that existed before Sprint 1 and must not be touched:
- `apps/api-gateway/src/lib/portal-session.ts` — `tenantPortalSession` not in Prisma client
- `apps/api-gateway/src/routes/leads.ts` — missing fields on Lead model
- `apps/api-gateway/src/routes/portal-auth.ts` — `tenantPortalAccount`/`tenantPortalSession` not in Prisma
- `apps/api-gateway/src/routes/portal-data.ts` — `agentMessage`, `tenantPortalAccount` not in Prisma
- `apps/api-gateway/src/routes/runtime-tasks.ts` — `dependsOn`/`dependencyMet` not in schema
- `apps/api-gateway/src/routes/webhooks.ts` — `webhookSource`/`inboundWebhookEvent` not in schema

---

## What Is NOT Yet Built (Sprint 13+)

| Feature | Priority | Sprint |
|---------|----------|---------|
| Billing — Stripe/Razorpay live checkout + invoice generation | P1 | Sprint 13 |
| Disclosure / legal footer — EU AI Act + FTC compliance | P1 | Sprint 13 |
| Sales pipeline: Recruiter role activation | P2 | Sprint 14 |
| Sales pipeline: Customer Support role activation | P2 | Sprint 14 |

## What Was Built in Sprint 13 (2026-05-18)

| Deliverable | File(s) |
|---|---|
| Stripe checkout session helper | `apps/api-gateway/src/services/payment-service.ts` — `createStripeCheckoutSession()` appended; builds Stripe Checkout session with plan metadata + tenant isolation |
| Checkout-session route | `apps/api-gateway/src/routes/billing.ts` — `POST /v1/billing/checkout-session`; validates plan, enforces tenantId match, returns `{ checkoutUrl, sessionId }` |
| Invoice download route | `apps/api-gateway/src/routes/billing.ts` — `GET /v1/billing/invoices/:invoiceId/download`; tenant-isolated, includes order relation, returns `pdfUrl` (may be null) |
| Disclosure CRUD routes | `apps/api-gateway/src/routes/disclosure.ts` — **new file**, 4 routes: `GET /v1/disclosure/:botId`, `PATCH /v1/disclosure/:botId`, `POST /v1/disclosure/:botId/ack`, `GET /v1/disclosure/:botId/audit` |
| Disclosure registered | `apps/api-gateway/src/main.ts` — `registerDisclosureRoutes` added after persona routes |
| Disclosure guard module | `apps/agent-runtime/src/disclosure-guard.ts` — **new file**, pure string module: `isDisclosurePresent` (case-insensitive, first 40 chars), `formatDisclosure` (channel-specific: email/slack/pr/meeting/chat), `enforceDisclosure`, `buildDisclosureAuditNote` |
| Dashboard billing checkout page | `apps/dashboard/app/billing/checkout/page.tsx` — plan selector + email input → POST checkout-session → redirect to Stripe hosted checkout |
| Dashboard disclosure panel | `apps/dashboard/app/components/disclosure-settings-panel.tsx` — compliance badge (EU/FTC/CA), jurisdiction pills, textarea editor + preview, audit trail list |
| Dashboard disclosure settings page | `apps/dashboard/app/settings/disclosure/page.tsx` — server component with session guard, wraps DisclosureSettingsPanel |
| Dashboard API proxies | `apps/dashboard/app/api/billing/checkout-session/route.ts`, `app/api/disclosure/[botId]/route.ts`, `app/api/disclosure/[botId]/audit/route.ts` |
| Disclosure route tests | `apps/api-gateway/src/routes/disclosure.test.ts` — **new file**, 13 tests (GET 401/404/200, PATCH 401/400/400-short/404/200, POST ack 401/400/201/all-channels, GET audit 401/200) |
| Billing checkout tests | `apps/api-gateway/src/routes/billing.test.ts` — extended, 8 new tests (checkout-session 401/403/400/404, invoice download 401/404/200) |
| Disclosure guard tests | `apps/agent-runtime/src/disclosure-guard.test.ts` — **new file**, 18 tests (isDisclosurePresent present/absent/case/empty, formatDisclosure all channels + options, enforceDisclosure present/absent/format, buildDisclosureAuditNote injected/present) |
| Quality gate | `operations/quality/14.1-quality-gate-report.md` — PASS (api-gateway 1225/0, agent-runtime 1096/0, all typechecks clean) |

## What Was Built in Sprint 12 (2026-05-18)

| Deliverable | File(s) |
|---|---|
| OAuth connector auth (Jira, GitHub, Teams, Email) | `apps/api-gateway/src/routes/connector-auth.ts` — 1370 lines, initiate + callback + refresh + revoke + health-summary + internal token; CSRF nonce, replay rejection, scope validation; secrets in Key Vault |
| Connector auth tests | `apps/api-gateway/src/routes/connector-auth.test.ts` — 22 tests, all pass |
| Episodic memory browse + GDPR redact | `apps/api-gateway/src/routes/episodic-memory.ts` — `GET /v1/episodic-memory` (paginated) + `DELETE /v1/episodic-memory/:id` |
| Episodic memory tests | `apps/api-gateway/src/routes/episodic-memory.test.ts` — 9 tests, all pass |
| Dashboard connector management page | `apps/dashboard/app/connectors/page.tsx` — health summary fetch, ConnectorConfigPanel |
| Dashboard connector marketplace page | `apps/dashboard/app/connector-marketplace/page.tsx` — ConnectorMarketplacePanel |
| Dashboard connector UI component | `apps/dashboard/app/components/connector-config-panel.tsx` — OAuth connect/revoke buttons, `handleOAuthConnect()` redirect flow |
| Dashboard memory browser page | `apps/dashboard/app/memory/page.tsx` — MemoryBrowserPanel + AgentEpisodicMemoryPanel |
| Dashboard episodic memory panel | `apps/dashboard/app/components/agent-episodic-memory-panel.tsx` — paginated table + GDPR delete |
| Dashboard API proxies | `apps/dashboard/app/api/connectors/summary/route.ts`, `app/api/episodic-memory/route.ts`, `app/api/episodic-memory/[id]/route.ts` |
| Quality gate | `operations/quality/13.1-quality-gate-report.md` — PASS (api-gateway 1204/0, all typechecks clean) |

## What Was Built in Sprint 11 (2026-05-18)

| Deliverable | File(s) |
|---|---|
| PulseAudio virtual audio | `services/desktop-agent/Dockerfile` — pulseaudio + ffmpeg; `services/desktop-agent/entrypoint.sh` — virtual-sink + virtual-source startup; `requirements.txt` — soundfile + numpy |
| Desktop meeting routes | `services/desktop-agent/app.py` — `POST /v1/sessions/:id/join-meeting`, `/speak`, `/capture-audio` |
| VoiceboxClient extensions | `apps/agent-runtime/src/voicebox-client.ts` — `createVoiceProfile()` multipart POST + `createVoiceProfileFromDescription()` design-mode POST |
| speaking-agent.ts migration | `apps/agent-runtime/src/speaking-agent.ts` — VoxCPM2 calls replaced with VoiceboxClient |
| Meeting participation loop | `apps/agent-runtime/src/meeting-transcription.ts` — `runMeetingParticipation()` join→capture→transcribe→speak loop |
| Voice profile seeder | `apps/agent-runtime/src/voice-profile-seeder.ts` — 12 role voices (Alex…Rowan); idempotent `seedVoiceProfiles()` |
| Runtime startup hook | `apps/agent-runtime/src/main.ts` — `seedVoiceProfiles().catch(...)` after server start |
| API gateway audio proxy | `apps/api-gateway/src/routes/desktop-sessions.ts` — 3 new proxy routes: join-meeting, speak, capture-audio |
| Docker env | `docker-compose.yml` — `VOICEBOX_URL: http://voicebox:17493` added to api-gateway + desktop-agent |
| Tests | `voicebox-client.test.ts` (4 tests), `voice-profile-seeder.test.ts` (3 tests), `desktop-sessions.test.ts` (6 new audio route tests) |
| Quality gate | `operations/quality/12.1-quality-gate-report.md` — PASS (46/46 checks) |

## What Was Built in Sprint 10 (2026-05-18)

| Deliverable | File(s) |
|---|---|
| Desktop agent Docker container | `docker/desktop-agent/Dockerfile` — Ubuntu 22.04 + Xvfb + x11vnc + noVNC + Playwright + PyAutoGUI |
| Vision loop service | `services/desktop-agent/app.py` — Python Flask, screenshot→LLM→action loop, Anthropic + OpenAI providers |
| Shared contracts | `packages/shared-types/src/desktop-agent-contracts.ts` — `VisionLoopRequest/Result`, `DesktopAction`, `DesktopActionType` |
| API gateway routes | `apps/api-gateway/src/routes/desktop-sessions.ts` — start, stream, task, delete; registered in `main.ts` |
| Dashboard stream panel | `apps/dashboard/app/components/desktop-stream-panel.tsx` — noVNC iframe + session controls |
| Dashboard task panel | `apps/dashboard/app/components/desktop-panel.tsx` — submit task, view vision steps |
| VM lifecycle manager | `services/provisioning-service/src/vm-lifecycle-manager.ts` — `provisionAgentVM` + `terminateAgentVM` via Azure ARM, with injectable adapter and tests |

---

## Implementation Conventions (for Sprint 10 developers)

- **Test runner:** `node:test` + `tsx --test` (NOT jest/vitest)
- **Mock Prisma:** `{ modelName: { method: async () => ... } } as unknown as PrismaClient`
- **ESM imports:** always use `.js` extension: `import from './foo.js'`
- **New contract:** new file in `packages/shared-types/src/`, export from `index.ts`, add key to `CONTRACT_VERSIONS`
- **New route:** new file in `apps/api-gateway/src/routes/`, register in `apps/api-gateway/src/main.ts`
- **Dashboard proxy:** `apps/dashboard/app/api/<feature>/route.ts` proxies to `/v1/<feature>`
- **Dashboard proxy session import:** `../../lib/internal-session` (relative from `app/api/<tier1>/<tier2>/`)
- **Typecheck:** `pnpm --filter @agentfarm/<pkg> typecheck`
- **Test:** `pnpm --filter @agentfarm/<pkg> test`
- **Quality gate:** `node scripts/quality-gate.mjs` (writes to `operations/quality/9.1-quality-gate-report.md`)

---

## What Was Built in Sprint 15 (2026-05-19)

**Goal:** Close the two outstanding dashboard wiring gaps identified after Sprint 14: broken decommission button endpoint and missing per-agent billing breakdown.

### Fix 1 — Fire-Agent Decommission Wiring

The `AgentDecommissionButton` was previously calling `DELETE /api/agents/:botId` which proxied to `DELETE /v1/agents/:botId` — an endpoint that does not exist on the gateway. The real gateway endpoint is `POST /v1/agents/:botId/terminate` (Sprint 9).

| Deliverable | File(s) |
|---|---|
| Terminate proxy route (new) | `apps/dashboard/app/api/agents/[botId]/terminate/route.ts` — `POST` proxies to `POST /v1/agents/:botId/terminate`; `GET` proxies to `GET /v1/agents/:botId/terminate/status` |
| Decommission button fix | `apps/dashboard/app/components/agent-decommission-button.tsx` — changed `DELETE /api/agents/:botId` → `POST /api/agents/:botId/terminate` |
| Broken DELETE removed | `apps/dashboard/app/api/agents/[botId]/route.ts` — removed `DELETE` handler (was proxying to non-existent gateway endpoint) |

### Fix 2 — Per-Agent Billing Breakdown

Added a bot-scoped billing view so operators can see cost per agent on the agent detail page.

| Deliverable | File(s) |
|---|---|
| `computeMeteringPeriodSummary` extended | `apps/api-gateway/src/lib/usage-meter.ts` — added optional `botId?: string` param; when set, adds `botId` filter to all `TaskExecutionRecord` queries |
| Per-agent gateway endpoint | `apps/api-gateway/src/routes/billing.ts` — added `GET /v1/billing/metering/agent?botId=&from=&to=`; verifies bot belongs to authenticated tenant before aggregating |
| Dashboard proxy | `apps/dashboard/app/api/billing/agent/route.ts` — `GET` proxies to `GET /v1/billing/metering/agent?botId=...` |
| AgentBillingCard component | `apps/dashboard/app/components/agent-billing-card.tsx` — client component; fetches per-agent summary and renders: period label, task count, billable tasks, platform fee, LLM cost, total charge + link to full billing page |
| Agent detail page wired | `apps/dashboard/app/agents/[botId]/page.tsx` — imports `AgentBillingCard`; added "Cost (Last 30 Days)" `SectionCard` in right column |

Both typechecks pass clean (`@agentfarm/api-gateway`, `@agentfarm/dashboard`).

## What Was Built in Sprint 16 (2026-05-20)

Sprint 16 ID: SPRINT-16-STRIPE-WEBHOOK-TESTER-ROLE

### Fix 1 � Stripe Webhook Gap

The Stripe hosted checkout flow (checkout.session.completed) was silently failing � the webhook handler only handled payment_intent.succeeded. Two related gaps were fixed.

| Deliverable | File(s) |
|---|---|
| erifyStripeWebhook handles checkout.session.completed | pps/api-gateway/src/services/payment-service.ts � added checkout.session.completed branch; extracts session.id as providerOrderId and session.payment_intent as providerPaymentId |
| Stripe init moved inside try block | pps/api-gateway/src/services/payment-service.ts � 
ew Stripe(stripeKey) moved inside 	ry block so SDK init errors (e.g. empty key in tests) are caught and return { success: false } instead of 500 |
| Order record created at checkout time | pps/api-gateway/src/routes/billing.ts � POST /v1/billing/checkout-session now calls createOrderRecord({ providerOrderId: result.sessionId }) before returning, so markOrderPaid can find the order when the webhook fires |

### Fix 2 � Billing Webhook Tests

Added 3 new webhook route tests covering the previously untested webhook surface.

| Test | Expected |
|---|---|
| POST /v1/billing/webhook/stripe � missing stripe-signature ? 400 | verifyStripeWebhook returns success:false ? route returns 400 |
| POST /v1/billing/webhook/stripe � invalid stripe-signature ? 400 | constructEvent throws (caught) ? route returns 400 |
| POST /v1/billing/webhook/razorpay � missing header ? 400 | Razorpay signature missing ? route returns 400 |

Also added order.create stub to makeCheckoutPrisma so existing checkout-session tests don't crash after the new createOrderRecord call.

All 21 billing tests pass. Both typechecks clean (@agentfarm/api-gateway, @agentfarm/website).

### Feature � Tester Marketplace Page

| Deliverable | File(s) |
|---|---|
| Tester marketplace listing | pps/website/app/marketplace/tester/page.tsx � full listing page: hero with QA badge, pricing card, HireAgentButton (roleKey=tester), capabilities grid (6), connector pills (7: GitHub/GitLab/Jira/Linear/Slack/Jenkins/CircleCI), sample tasks list (5), sample CI triage report panel, bottom CTA |


---

## Sprint 17 � Tester Full QA Platform (2026-05-20)

**Sprint ID**: SPRINT-17-TESTER-FULL-QA-PLATFORM

### Fix � Stripe Webhook 500 Regression

Root cause: erifyStripeWebhook could throw when STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET
are empty strings in test environments, escaping the inner try/catch.

Two-part fix applied:
1. **pps/api-gateway/src/services/payment-service.ts** � Early return { success: false } when
   either key is missing (before instantiating Stripe SDK).
2. **pps/api-gateway/src/routes/billing.ts** � Defensive try/catch wrapper around the
   erifyStripeWebhook call in the webhook route handler.

Result: 21/21 billing tests pass (was 19/21).

### Feature � Tier 20: Testing Tool Integrations

13 new LocalWorkspaceActionType values added to pps/agent-runtime/src/local-workspace-executor.ts:

| Action | Description |
|---|---|
| workspace_selenium_test_run | Detect pom.xml/setup.py/wdio.conf.js and run Selenium suite |
| workspace_cypress_test_run | 
px cypress run with spec/browser/headless options |
| workspace_appium_test_run | Mobile/desktop Appium via APPIUM_SERVER_URL env var |
| workspace_playwright_test_run | 
px playwright test --reporter=json |
| workspace_load_test_run | Auto-detect k6 (.js/.ts) vs Artillery (.yml); write result to .agentfarm/ |
| workspace_load_test_report | Parse .agentfarm/load-test-result.json ? p50/p95/p99/rps |
| workspace_api_test_run | Newman run with --reporters json,cli |
| workspace_api_test_report | Parse Newman JSON ? assertion/request summary |
| workspace_dast_scan | OWASP ZAP REST API spider + active scan via ZAP_API_URL |
| workspace_security_test_report | Aggregate sast/secrets/dast from .agentfarm/ cache |
| workspace_test_case_sync | Dispatch sync_test_cases to TestRail/Zephyr via connector |
| workspace_test_run_publish | Dispatch publish_test_run to TestRail/Zephyr via connector |
| workspace_visual_regression | Playwright screenshot diff vs baseline, file-size threshold |

ALLOWED_COMMANDS expanded with: k6, mvn, java.

### Feature � Tester Role Profile Expansion

pps/agent-runtime/src/tester-agent-profile.ts:
- TESTER_ROLE_ALLOWED_CONNECTORS: 4 ? 18 (added gitlab, linear, slack, jenkins, circleci,
  selenium, playwright, cypress, appium, jmeter, postman, soapui, testrail, zephyr, burpsuite, owasp_zap)
- TESTER_ROLE_ALLOWED_LOCAL_ACTIONS: 41 ? 62 (added all Tier 17 web/manual actions,
  Tier 15 security/perf actions, all 13 Tier 20 actions)

### Feature � Tester Marketplace Page Rewrite

pps/website/app/marketplace/tester/page.tsx:
- Hero description updated to mention all 5 testing disciplines
- Capabilities grid (CAPABILITIES ? TESTING_CATEGORIES): 6 cards, each with tool pills:
  - Manual Testing (Desktop VM, noVNC, Browser control)
  - Automation Testing (Selenium/WebDriver, Playwright, Cypress, Appium)
  - Performance & Load Testing (JMeter, k6, Artillery)
  - API Testing (Postman/Newman, SoapUI)
  - Security Testing (OWASP ZAP DAST, Semgrep SAST, Trufflehog/gitleaks, Burp Suite)
  - Test Management (TestRail, Jira Zephyr)
- Connector pills: 7 ? 18 (all testing tool names shown)
- Sample tasks: 5 ? 8 (cover all 5 disciplines)
- Bottom CTA copy updated

### Test Results

| Package | Tests | Status |
|---|---|---|
| @agentfarm/api-gateway billing routes | 21/21 | Pass |
| @agentfarm/agent-runtime | 1120/1120 | Pass (unchanged suite � Tier 20 adds only) |
| @agentfarm/api-gateway typecheck | 0 errors | Pass |
| @agentfarm/agent-runtime typecheck | 0 errors | Pass |
| @agentfarm/website typecheck | 0 errors | Pass |
