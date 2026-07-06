# Dashboard, Configuration & Runtime Integration Audit

**Date:** 2026-07-06
**Scope:** Internal dashboard (`apps/dashboard`, port 3001), customer dashboard (`apps/website/app/dashboard` + `/portal`), API gateway, agent-runtime, trigger-service, orchestrator.
**Method:** Every configuration surface traced UI → Backend API → Database → Runtime service → Agent execution. A feature is only marked WIRED when a runtime consumer was found in code.

---

## 1. Executive summary

The platform's **internal dashboard is genuinely wired**: personas, LLM config, governance policies, MCP servers, connectors, budgets, rate limits, task templates, and language preferences all reach agent execution through verifiable code paths.

The **customer dashboard is split into two disconnected storage worlds**, and that split is the single most important finding:

- Pages that **proxy to the API gateway** (MCP, connectors/integrations, governance workflows, inbound webhooks, API keys, team) are real and runtime-effective.
- Pages backed by the website's **Cloudflare D1 `auth-store`** (`apps/website/lib/auth-store.ts`) — worker shift schedules, approval-policy presets, autonomy level, tone — are **stored but never read by any runtime service**. Customers believe they are governing their AI workforce; the runtime never sees these settings.

Secondary critical gaps: **retention policies are CRUD-only (never enforced)**, **knowledge-base ingestion has no UI in either dashboard**, **shift enforcement only covers one of four task-intake paths**, and **`SalesAgentConfig` stores plaintext credentials in Postgres**, bypassing the SecretStore.

| Verdict | Count (major features) |
|---|---|
| Fully wired UI → runtime | 18 |
| Partially wired | 5 |
| Stored but never consumed (broken) | 4 |
| Feature absent (spec expects it) | 3 |

---

## 2. Critical findings (broken UI → runtime paths)

### F1 — Customer "Worker Settings" never reach the runtime (CRITICAL)

`apps/website/app/dashboard/settings/page.tsx` offers **Shift Schedule**, **Policy Presets** ("Startup relaxed" / "Enterprise strict"), and per-agent approval policy. The save path is:

- `ApplyPolicyPresetButton` → `POST /api/bots/policy-preset` ([route.ts](apps/website/app/api/bots/policy-preset/route.ts)) → `updateBotConfig()` in [auth-store.ts:1800](apps/website/lib/auth-store.ts:1800) → raw SQL `UPDATE bots SET approval_policy = ?` in **Cloudflare D1** (`getCloudflareContext`, auth-store.ts:1).
- Shift hours save the same way (`shift_start`, `shift_end`, `active_days` — auth-store.ts:1753-1764).

**Nothing consumes these fields.** `grep approvalPolicy|approval_policy` across `agent-runtime`, `api-gateway`, `trigger-service`, `orchestrator`, `services/`, `packages/` finds only the website and the setup wizard (see F5). The runtime's approval routing is the fixed risk classifier (LOW auto-execute; MEDIUM/HIGH → approval queue) — there is no per-tenant/per-agent threshold read anywhere (`grep riskThreshold|approvalThreshold|riskFloor` in `apps/agent-runtime/src` → zero hits). Actual shift enforcement reads a **different table entirely**: `AgentPersona.workingHours` in Postgres via [shift-enforcer.ts](apps/trigger-service/src/shift-enforcer.ts).

**Impact:** A customer who selects "Enterprise (strict): MEDIUM and HIGH-risk actions require approval" gets no behavior change. A customer who sets a 9–5 shift in Worker Settings gets a 24/7 agent. This is a governance-trust problem, not just a bug.

**Fix:** Make the website settings API write to the platform Postgres — approval policy into `GovernancePolicy`/a per-bot policy field the runtime already evaluates, shifts into `AgentPersona.workingHours` (which `shift-enforcer` already consumes). Same for `autonomy_level` and `tone` (D1 `bots` columns with zero backend consumers) — either wire them into the persona prompt block or remove the controls.

### F2 — Retention policies are stored but never enforced (CRITICAL)

Full CRUD exists: dashboard `/retention` page → [retention-policy.ts](apps/api-gateway/src/routes/governance/retention-policy.ts) → `RetentionPolicy` model, including `action: auto_delete_after_days` validation (line 54). But `prisma.retentionPolicy` is referenced **only inside that route file** — no worker, sweep, or cron ever reads policies to archive/delete data (`grep retentionPolicy.` across all apps/services → the route file plus one website test). Compare: `ScheduledReport` has [report-sweep.ts](apps/trigger-service/src/report-sweep.ts); retention has nothing.

**Impact:** Compliance feature that silently does nothing — worse than absent, because operators will attest to retention schedules that aren't running.
**Fix:** Add a retention sweep worker (api-gateway workers or trigger-service) that applies `auto_delete_after_days`/archive actions per data domain, with audit events per enforcement run.

### F3 — Knowledge base has APIs and RAG consumption, but no upload UI anywhere (HIGH)

The ingestion/search backend is complete: `POST /v1/knowledge-base/write`, `/ingest-file` (PDF/DOCX/XLSX/PPTX), `/search` ([knowledge-base.ts](apps/api-gateway/src/routes/memory/knowledge-base.ts)), pgvector `AgentKnowledgeBase`, and all 16 agent RAG retrievers consume it (per the CLAUDE.md retriever pattern; context blocks injected pre-LLM). But `grep ingest-file|knowledge-base` across `apps/dashboard` and `apps/website` → **zero UI callers**. The internal `/memory` hub is read-only (episodic/work/patterns/knowledge-graph tabs, [memory-hub-client.tsx](apps/dashboard/app/memory/memory-hub-client.tsx)); the customer dashboard has no knowledge page at all.

**Impact:** The flagship "agents grounded in your documents" loop is reachable only via raw API calls. Customers cannot feed the flywheel.
**Fix:** Add an upload/search UI (customer dashboard first) hitting the existing endpoints. Also note: **no SOP concept exists anywhere** (`grep -i "\bsop\b"` → nothing) — the audit-spec feature "SOP Upload" is absent, not broken.

### F4 — Shift enforcement covers only the tracker-poller intake path (HIGH)

`evaluateAgentShift` is called **only** from [tracker-poller.ts:421](apps/trigger-service/src/sources/tracker-poller.ts:421). The other intake paths dispatch regardless of working hours:
- Inbound webhooks ([webhook-trigger.ts](apps/trigger-service/src/sources/webhook-trigger.ts)) — no shift check
- Email/Slack triggers — no shift check
- Scheduled routines ([schedule-sweep.ts](apps/trigger-service/src/schedule-sweep.ts)) — no shift check
- Direct `POST /v1/runtime/tasks` — no shift check

**Fix:** Lift the shift gate into the shared dispatch path (trigger-dispatcher / runtime task intake) so `AgentPersona.workingHours` governs all sources, with the same `DeferredTask` parking used by the poller.

### F5 — Setup wizard `approvalPolicy` is captured, validated, then dropped (MEDIUM)

[setup-wizard.ts:264](apps/api-gateway/src/routes/admin/setup-wizard.ts:264) persists `approvalPolicy` into `SetupWizardSession` with dedicated validation ([wizard-step-validator.ts:108-114](apps/api-gateway/src/lib/wizard-step-validator.ts:108)), but no completion step translates it into any policy the runtime evaluates. Same dead-end as F1, on the internal side.

---

## 3. Security findings

### S1 — `SalesAgentConfig` stores plaintext credentials in Postgres (HIGH)

[schema.prisma:1775-1800](packages/db-schema/prisma/schema.prisma:1775): `vonageApiSecret`, `vonagePrivateKey`, `phantombusterApiKey`, `newsApiKey`, `hubspotAccessToken`, `salesforceAccessToken` are plain `String?` columns. This bypasses the platform's own SecretStore pattern ([secret-store.ts](apps/api-gateway/src/lib/secret-store.ts)) where connector credentials live in Azure Key Vault behind `secretRefId` (`ConnectorAuthMetadata.secretRefId`, schema.prisma:339). Any DB dump/read replica leaks live CRM and telephony tokens.
**Fix:** Migrate these columns to `secretRefId` references through the same SecretStore.

### S2 — Dev secret fallback writes secrets to a plaintext file (LOW, dev-only)

`env://` scheme in [secret-store.ts:7](apps/api-gateway/src/lib/secret-store.ts:7) persists secrets to `CONNECTOR_SECRETS_PATH` on disk. Acceptable for dev; ensure it is impossible to select in production (fail hard if `NODE_ENV=production` and the ref is `env://`).

### S3 — Customer roles page is a hardcoded matrix (LOW)

[roles/page.tsx:40-65](apps/website/app/dashboard/roles/page.tsx:40) renders a static Member/Admin/SuperAdmin permission table. The real RBAC is the data-driven 14-role policy engine. Display-only is fine, but a hardcoded matrix will drift from actual enforcement — render it from the live role definitions instead.

Positives verified: inbound webhook auth is fail-closed with `timingSafeEqual` (per `zoho-sign-webhook.ts` pattern); outbound webhooks are HMAC-signed with dispatch-time domain-policy re-checks ([webhook-dispatcher.ts:37-45](apps/api-gateway/src/lib/webhook-dispatcher.ts:37)); MCP/connector runtime calls use shared-token auth with tenant scoping; dashboard/website proxies keep API keys server-side.

---

## 4. Traceability results by domain

### 4.1 Agent / persona / prompt configuration — WIRED
- **Persona (internal dashboard `agent-persona`)** → `POST /v1/personas` ([personas.ts](apps/api-gateway/src/routes/agents/personas.ts)) → `AgentPersona` (Postgres) → runtime loads per task with 60s cache + role-default fallback ([persona-context-loader.ts](apps/agent-runtime/src/persona-context-loader.ts), wired at [runtime-server.ts:3549-3581](apps/agent-runtime/src/runtime-server.ts:3549)) → injected as `_persona` into system prompts (`role-system-prompts.ts`, 16 action handlers). Missing persona ⇒ graceful degradation to role defaults. ✅
- **Role prompts** → code defaults + Langfuse registry override `role-system-prompt:<roleKey>` ([role-system-prompts.ts:8-46](apps/agent-runtime/src/role-system-prompts.ts:8)) — editable without deploy, fail-safe when Langfuse off. ✅
- **Working hours** → `AgentPersona.workingHours` consumed by [shift-enforcer.ts](apps/trigger-service/src/shift-enforcer.ts) with `DeferredTask` parking + release sweep. ⚠️ Partial — see F4 (one intake path only) and F1 (customer UI writes elsewhere).
- **Bot versioning** (`BotConfigVersion`) → managed via [bot-versions.ts](apps/api-gateway/src/routes/agents/bot-versions.ts) + `bot-versioning.ts`. ✅

### 4.2 Governance / policy / approvals — WIRED
- **Policy editor + document upload** (internal `governance`, customer `governance` proxy) → `GovernancePolicy`/`PolicyDocument` → runtime enforcement at multiple chokepoints: role blocklist, connector verb rules, env/time-window deny ([action-governance.ts](apps/agent-runtime/src/action-governance.ts), evaluated in [runtime-server.ts:4069-4078](apps/agent-runtime/src/runtime-server.ts:4069)), OPA bundle ([policy-runtime.ts](apps/agent-runtime/src/policy-runtime.ts)). Fail-safe (no policy → allow), tighten-only deny rules, live-tested (deny→block + injection-task rejection verified in the 2026-07-02 audit cycle). ✅
- **Approvals** → risk classification → HMAC intake → locked re-decision (409) → webhook notify — live e2e-proven with MCP tools. ✅ (but the *customer-facing* approval policy knob is disconnected — F1).
- **Budget** → `AgentBudgetConfig`, event-sourced, 80% warn / 90% throttle / hard-stop; kill-switch + circuit breakers present in `execution-engine.ts`. ✅
- **Agent rate limits** → `AgentRateLimit` enforced at task intake ([runtime-tasks.ts:760](apps/api-gateway/src/routes/runtime/runtime-tasks.ts:760)). ✅
- **Retention policies** → ❌ F2.

### 4.3 MCP — WIRED
Customer UI (`/dashboard/mcp`) → website proxy → `GET/POST/DELETE /v1/mcp` (gateway, tenant-scoped) → `TenantMcpServer` → runtime fetches per tenant ([mcp-registry-client.ts:52](apps/agent-runtime/src/mcp-registry-client.ts:52)), builds the tool catalog injected into the decision LLM (`_mcp_tool_catalog`, [runtime-server.ts:3585-3589](apps/agent-runtime/src/runtime-server.ts:3585)) plus a denied-tool list; execution goes through approval + capability allowlist + payload sanitizer. Multiple servers per tenant supported (list semantics); tenant isolation via `x-tenant-id` + scoped queries; failures fail-safe to empty catalog. ✅ No hardcoded server URLs in the dispatch path (role pre-warms use the registry).

### 4.4 Connectors — WIRED with two caveats
- CRUD + OAuth: customer `integrations` page proxies to gateway `/v1/connectors/*`; credentials → Key Vault via `secretRefId`; health monitoring (`connector-health-monitor.ts`, manual health POST from UI); token lifecycle workers (refresh/revoke/re-consent); runtime resolution via `connector-token-resolver.ts`; 17 native executors + generic REST/SMTP; `connector-coverage.test.ts` fails CI on silently-unreachable connectors; per-connector verb governance enforced. ✅
- ⚠️ **One instance per connector type per workspace**: `connectorId = type:tenantId:workspaceId` ([connector-auth.ts:306-308](apps/api-gateway/src/routes/connectors/connector-auth.ts:306)). Two Jira sites or two Slack workspaces per AgentFarm workspace are impossible. Spec expectation "multiple connectors of the same type" is unmet.
- ⚠️ Sales CRM sync credentials bypass the SecretStore (S1).

### 4.5 Webhooks — WIRED, retries are manual-only
- **Inbound:** customer UI → `WebhookSource`/`WebhookTriggerRule` → trigger-service `webhook-trigger.ts` + trigger-engine → tasks; fail-closed signature auth; events logged in `InboundWebhookEvent`. ✅
- **Outbound:** `OutboundWebhook` → [webhook-dispatcher.ts](apps/api-gateway/src/lib/webhook-dispatcher.ts) fired from approvals, task-notify, agent-control, budget-policy; HMAC-signed; per-delivery records (`OutboundWebhookDelivery`); circuit breaker; DLQ after 5 consecutive failures with auto-disable. ⚠️ **No automatic retry/backoff per delivery** — only manual DLQ redrive (dispatcher line 211). Acceptable design, but the spec's "retry logic exists" is only half-true; document or add bounded auto-retry.

### 4.6 Knowledge & memory — backend WIRED, UI missing (F3)
RAG retrieval, lesson flywheel, episodic/semantic stores all consumed at runtime (16 agents). Policy documents DO have an upload panel ([policy-documents-panel.tsx](apps/dashboard/app/components/policy-documents-panel.tsx)) → LLM-extract → review → apply. Knowledge documents have no UI (F3); SOPs don't exist as a concept.

### 4.7 LLM / model / language / branding / billing — WIRED
- **LLM config** (internal `llm-config`) → `/api/workspaces/:id/llm-config` → [runtime-llm-config.ts](apps/api-gateway/src/routes/runtime/runtime-llm-config.ts) → runtime fetches per workspace with shared token ([runtime-server.ts:1962-2006](apps/agent-runtime/src/runtime-server.ts:1962)); missing config → provider defaults. ✅
- **Language** (tenant/workspace/user) → `language-resolver.ts` consumed in `llm-decision-adapter.ts` + `post-task-closeout.ts` with tenant→workspace→user precedence. ✅
- **Branding** → `TenantBranding` → website theming + marketing-specialist `asset-coordinator.ts`. ✅
- **Billing/subscriptions** → grace periods, hard-stop, Stripe/Razorpay webhooks, Max Mode per-workspace Pro/Enterprise gate (60s cache) checked at runtime. ✅
- **Task templates / playbooks** → dispatchable (`POST /v1/task-templates/:id/dispatch`, wired to dashboard playbooks). ✅
- **Scheduled reports** → consumed by [report-sweep.ts](apps/trigger-service/src/report-sweep.ts). ✅

### 4.8 Notifications — env-configured, not tenant-configurable
`@agentfarm/notification-adapters` (email/Slack/Teams/webhook) take a `NotificationConfig` from service env, not from any per-tenant DB record; `NotificationLog` is write-only history; dashboard/website notifications pages are feeds. There is **no notification-preferences configuration surface** — the spec's "Notifications configuration" feature doesn't exist as user config. (Gap, MEDIUM: per-tenant channel routing is table stakes for enterprise.)

### 4.9 A/B tests — partial
`AbTest`/`AbTestAssignment` consumed only by the marketing-specialist handler; the internal `ab-tests` page manages records no other agent path reads. ⚠️ Scope the UI copy to marketing experiments or extend consumption.

### 4.10 Read-only monitoring surfaces (no runtime consumption expected — OK)
Analytics, logs, observability (Langfuse traces), infra-monitoring (Axiom, tenant-locked), cost dashboard, historical metrics, health, live view, audit browser, quality/ROI, wake-runs, handoffs, orchestration views, env reconciler (drift monitoring with real profile store). All display real data through server-side proxies. ✅

### 4.11 Features from the audit spec that don't exist at all
- **SOP upload** — no concept in code.
- **Feature flags** — no `FeatureFlag` model or management UI; gating is env vars + specific DB flags (e.g. Max Mode). The internal-dashboard "Feature Flags" expectation is unmet.
- **Notification preferences** (per-tenant channels) — see 4.8.
- Connectors advertised but tracked unimplemented: monday + telephony (consciously flagged in `connector-coverage.test.ts` — honest, not silent).

---

## 5. Recommended fixes, priority-ordered

| # | Fix | Effort | Finding |
|---|---|---|---|
| 1 | Rewire customer Worker Settings (approval policy, shifts, autonomy) from D1 to platform Postgres (`AgentPersona.workingHours`, governance policy), or hide the controls until wired | M | F1 |
| 2 | Retention enforcement worker + audit events | M | F2 |
| 3 | Knowledge upload UI (customer first) on existing `/v1/knowledge-base/*` endpoints | S | F3 |
| 4 | Shift gate on all intake paths (webhook/email/schedule/direct), reusing `DeferredTask` | S | F4 |
| 5 | Migrate `SalesAgentConfig` secrets to SecretStore refs | M | S1 |
| 6 | Apply wizard `approvalPolicy` on completion (same mechanism as #1) | S | F5 |
| 7 | Per-delivery outbound-webhook auto-retry with backoff (bounded), keep DLQ | S | 4.5 |
| 8 | Multi-instance connector IDs (`type:tenant:workspace:instanceN`) if multi-site customers matter | L | 4.4 |
| 9 | Per-tenant notification channel preferences (model + UI + adapter resolution) | M | 4.8 |
| 10 | Render customer roles matrix from live RBAC definitions | S | S3 |

---

## 6. Method notes & evidence conventions

Every WIRED verdict above names the consuming runtime file and line. Negative findings ("never consumed") were established by exhaustive `grep` for the model/field name across `apps/*/src`, `services/*/src`, `packages/*/src` excluding tests and `dist/`. The runtime enforcement chain for a task is: intake auth + agent rate limit (`runtime-tasks.ts`) → role enforcement → persona load → MCP catalog injection → LLM decision → risk classification → policy engine (role/connector/env/time + OPA) → approval queue or execute → connector/MCP execution with token resolution → action result + audit event (+ Axiom mirror) → RAG ingestion flywheel.
