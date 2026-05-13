# AgentFarm

AgentFarm is a production-grade, multi-tenant AI agent orchestration platform built as a TypeScript pnpm monorepo. It provides a complete runtime for deploying, governing, and observing autonomous AI agents — covering task execution with 9 LLM providers, multi-agent orchestration, 12 tiers of local workspace actions, structured approval and audit trails, billing and subscription enforcement, connector integrations, desktop and browser automation, voice meeting transcription, and a full operator dashboard.

## Architecture

```
  ┌─────────────┐     ┌───────────────┐     ┌─────────────────┐
  │  Dashboard  │────▶│  API Gateway  │────▶│  Agent Runtime  │
  │  (Next.js)  │     │   (Fastify)   │     │   (Fastify)     │
  └─────────────┘     └───────────────┘     └─────────────────┘
                              │                       │
                      ┌───────┴───────┐       ┌───────┴───────┐
                      │   PostgreSQL  │       │  Trigger Svc  │
                      │    + Redis    │       │   (Fastify)   │
                      └───────────────┘       └───────────────┘
                                                      │
                                              ┌───────┴───────┐
                                              │ Orchestrator  │
                                              │  (Fastify)    │
                                              └───────────────┘

Domain Services Layer (15 services)
  agent-observability · approval-service · browser-actions · connector-gateway
  evidence-service · identity-service · meeting-agent · memory-service
  notification-service · policy-engine · provisioning-service · + 4 more
```

The **API Gateway** is the single control-plane entry point. All dashboard traffic is proxied through it. It owns authentication, rate limiting, billing enforcement, audit logging, and all database writes.

The **Agent Runtime** is the execution engine for AI tasks. It connects back to the API Gateway for approvals and task lease management, and out to LLM providers, connectors, and optional external services (Voicebox STT, VoxCPM2 TTS, OPA).

The **Orchestrator** coordinates multi-agent workflows using a GOAP (Goal-Oriented Action Planning) A* planner, routine/task schedulers, proactive signal detection (CI failures, CVE alerts), and agent handoff management (port 3011).

The **Trigger Service** handles inbound signals — webhooks, email (IMAP), and Slack messages — and forwards them as structured tasks to the Agent Runtime.

The **Dashboard** (Next.js) proxies every API call through its own `app/api/` route layer, which adds an internal auth header before forwarding to the API Gateway. It never calls the Gateway directly from the browser.

The **Website** (Next.js) handles marketing, public signup, and onboarding flows. Deployed to Azure Static Web Apps in production.

---

## Monorepo structure

```
apps/
  api-gateway/      Fastify 5 control-plane: auth, routing, billing, audit, approvals
  agent-runtime/    AI task execution engine: LLM routing, skills, orchestration, desktop
  orchestrator/     Multi-agent workflow coordinator: GOAP planner, schedulers, handoffs (port 3011)
  trigger-service/  Inbound webhook, email, and Slack trigger ingestion (port 3002)
  dashboard/        Next.js 15 operator dashboard (51 pages, 159 proxy routes) (port 3001)
  website/          Next.js 15 marketing, signup, and onboarding site (Azure SWA in prod)

services/
  agent-observability/     Action interception, audit log writer, browser capture, correctness scorer
  agent-question-service/  Async human-in-the-loop Q&A question parking with Prisma store
  approval-service/        Approval batcher, kill-switch enforcer, governance workflow manager
  audit-storage/           Azure Blob screenshot uploader and evidence persistence
  browser-actions/         Playwright browser action executor (web-actions)
  compliance-export/       JSON/CSV compliance pack export with 365/730-day retention
  connector-gateway/       12-connector OAuth registry, mTLS verifier, PII filter, plugin loader
  evidence-service/        Governance KPI calculator, HNSW vector search index
  identity-service/        Tenant/workspace/user lifecycle scaffold
  meeting-agent/           Meeting lifecycle state machine, STT/TTS voice pipeline adapters
  memory-service/          Long-term agent memory store with TTL and relevance ranking
  notification-service/    Telegram/Slack/Discord/Webhook/Voice approval alert dispatcher
  policy-engine/           Governance routing policy resolution
  provisioning-service/    Azure VM lifecycle 11-step state machine, SLA monitoring, job processor
  retention-cleanup/       Scheduled artifact retention cleanup job

packages/
  auth-utils/            scrypt password hashing and verification utilities
  cli/                   af CLI — developer command-line tool (uses sdk)
  config/                Centralised service URL and configuration constants
  connector-contracts/   18-connector registry, 18 normalized action types, 12 role policies
  crm-service/           CRM adapter types and clients (Salesforce, HubSpot)
  db-schema/             Prisma schema, migrations, and generated client (70 models)
  e2e/                   Playwright end-to-end test suite
  erp-service/           ERP adapter types and clients (SAP, Oracle)
  notification-service/  Notification adapter types
  observability/         OpenTelemetry + Azure Monitor helpers
  queue-contracts/       Queue message schemas and lease/budget types
  sdk/                   AgentFarmClient SDK (agents, analytics, notifications, messages)
  shared-types/          100+ TypeScript contracts shared across all apps and services
```

---

## Features

### Agent management
- Agent (bot) creation, versioning, and lifecycle management
- Per-agent rate limiting, capability snapshots, and role profiles
- Bot marketplace with install/uninstall and version history
- Agent runtime instance registration and health tracking

### Task execution
- Multi-step task planning with LLM-backed planner loop
- 9 LLM providers: OpenAI, Azure OpenAI, Anthropic, Google, xAI, Mistral, Together AI, GitHub Models, Auto (health-score failover)
- Auto mode: 5-minute rolling health score (error rate + latency) with per-profile priority lists
- 12 tiers of local workspace actions (file ops, shell, IDE, browser, desktop, meetings, sub-agents)
- Task queue with priority lanes, lease locking, and retry
- Cost estimation per task with token budget enforcement and daily limit alerts

### Multi-agent orchestration
- Multi-agent dispatch with `AgentDispatchRecord` tracking
- Orchestration runs with state history and timeline
- Autonomous loop orchestrator for background agent cycles
- Wake coalescer to deduplicate concurrent triggers
- Skill pipelines: define, schedule, and execute multi-step skill chains

### Billing and subscriptions
- Tenant and agent subscription management
- Subscription guard middleware with grace period and suspension wall
- Daily lifecycle sweep and renewal reminders
- Stripe + Razorpay payment webhook handling
- Budget policy: per-workspace daily/monthly limits, hard-stop enforcement, cost dashboard

### Security and auth
- Session token auth (cookie) on all `/v1/*` routes
- Per-IP rate limiting: 180 req/min general, 20 req/min auth endpoints
- Per-tenant rate limiting: 600 req/min
- `@fastify/helmet` security headers (CSP, HSTS, X-Frame-Options, etc.)
- HMAC webhook signature verification
- CORS origin validation (configurable `ALLOWED_ORIGINS`)
- 1 MB request body limit
- Audit trail on sensitive mutations
- Role-based access with `Roles` model

### Connectors and integrations
- Connector auth: OAuth 2.0, API key, basic auth, generic REST
- Token lifecycle worker: auto-refresh, revoke, re-consent routing
- Connector health monitoring with status and remediation hints
- Adapter registry with register/discover/health-check
- Connector marketplace: browse, install, and manage integrations

### Observability and analytics
- OpenTelemetry + Azure Monitor integration
- Structured telemetry collector with action observability
- Quality signal logging and quality dashboard
- CI failure triage reports
- Agent performance and cost analytics with CSV export
- Outbound webhooks with HMAC signing and delivery tracking
- Webhook DLQ and replay

### Voice and meetings
- Meeting session management with STT transcription (Voicebox)
- Speaking agent with TTS voice synthesis (VoxCPM2)
- Language resolver for locale-aware TTS
- Language configuration per tenant, workspace, and user

### Governance and compliance
- Approval queue: risk-based routing (low/medium/high), decision latency tracking
- Kill-switch: 30-second control window, incident reference required to resume
- Governance workflows and KPIs
- Plugin allowlist/killswitch management
- Audit log: append-only, filterable, compliance export (JSON/CSV)
- Evidence bundles with retention policy management
- A/B testing framework with assignment tracking

### Developer tooling
- API key management (SHA-256, `af_` prefix)
- Outbound webhook event catalog (10 typed schemas)
- SSE live task feed with auto-recovery
- IDE state sync
- PR drafts
- Repro packs and run-resume
- Environment profile reconciler
- Scheduled reports via nodemailer
- Work memory viewer

---

## Dashboard

51 pages covering 159 proxy routes to the API Gateway.

| URL | Description |
|-----|-------------|
| `/` | Root dashboard home |
| `/ab-tests` | A/B test management |
| `/activity` | Activity event feed |
| `/adapters` | Adapter registry |
| `/agent-chat` | Real-time agent chat |
| `/agents` | Agent list and management |
| `/analytics` | Performance and cost analytics |
| `/audit` | Audit log viewer |
| `/audit/session-replay` | Session replay for audit events |
| `/billing` | Billing and invoices |
| `/budget` | Budget policy and cost limits |
| `/chat` | Multi-turn chat sessions |
| `/ci` | CI failure triage |
| `/connector-marketplace` | Browse and install connectors |
| `/connectors` | Active connector management |
| `/cost-dashboard` | Cost breakdown and trends |
| `/desktop` | Desktop action governance |
| `/docs` | In-app documentation |
| `/env` | Environment profile reconciler |
| `/governance` | Governance overview |
| `/governance/kpis` | Governance KPI metrics |
| `/governance/plugins` | Plugin governance |
| `/handoffs` | Agent handoff management |
| `/health` | Platform health and status |
| `/internal/skills` | Internal skill browser |
| `/knowledge-graph` | Repository knowledge graph |
| `/live` | Real-time live task feed (SSE) |
| `/login` | Login page |
| `/loops` | Autonomous loop management |
| `/marketplace` | Agent marketplace |
| `/meetings` | Meeting session management |
| `/memory` | Agent memory browser |
| `/notifications` | Notifications center |
| `/onboarding` | Customer onboarding wizard |
| `/orchestration` | Orchestration runs |
| `/pipelines` | Skill pipeline management |
| `/pr-drafts` | PR draft management |
| `/provisioning` | Provisioning job status |
| `/quality` | Quality signals dashboard |
| `/retention` | Retention policy management |
| `/scheduled-reports` | Scheduled report configuration |
| `/settings` | API keys, circuit breakers, task queue |
| `/signup` | Signup page |
| `/skill-search` | Skill search |
| `/snapshots` | Bot capability snapshots |
| `/tasks` | Task history |
| `/team` | Team management |
| `/tenant-settings` | Tenant configuration |
| `/webhooks` | Outbound webhook management |
| `/webhooks-ops` | Webhook DLQ and replay |
| `/work-memory` | Work memory viewer |

---

## API

62 backend route files. Routes grouped by domain:

**Auth and identity**: `auth.ts`, `workspace-session.ts`, `roles.ts`, `internal-login-policy.ts`

**Agents and bots**: `agents.ts`, `bot-versions.ts`, `agent-control.ts`, `agent-dispatch.ts`, `agent-feedback.ts`

**Task execution**: `runtime-tasks.ts`, `task-queue.ts`, `sse-tasks.ts`, `runtime-llm-config.ts`, `repro-packs.ts`, `schedules.ts`, `skill-scheduler.ts`

**Orchestration and skills**: `orchestration.ts`, `autonomous-loops.ts`, `skill-pipelines.ts`, `skill-composition-execute.ts`, `handoffs.ts`

**Billing**: `billing.ts`

**Connectors and marketplace**: `connector-actions.ts`, `connector-auth.ts`, `connector-health.ts`, `adapter-registry.ts`, `marketplace.ts`

**Governance and audit**: `approvals.ts`, `audit.ts`, `governance-kpis.ts`, `governance-workflows.ts`, `budget-policy.ts`, `retention-policy.ts`, `circuit-breakers.ts`, `snapshots.ts`, `ab-tests.ts`, `plugin-loading.ts`, `ci-failures.ts`

**Observability**: `analytics.ts`, `observability.ts`, `activity-events.ts`

**Voice and meetings**: `meetings.ts`, `language.ts`

**Memory and knowledge**: `memory.ts`, `work-memory.ts`, `knowledge-graph.ts`

**Notifications**: `notifications.ts`, `questions.ts`

**Developer tools**: `api-keys.ts`, `webhooks.ts`, `outbound-webhooks.ts`, `scheduled-reports.ts`, `pull-requests.ts`, `ide-state.ts`, `desktop-actions.ts`, `desktop-profile.ts`, `env-reconciler.ts`, `mcp-registry.ts`, `zoho-sign-webhook.ts`, `admin-provision.ts`, `chat.ts`, `team.ts`

---

## Database

70 Prisma models across 8 domains:

**Identity and tenancy** (8): `Tenant`, `TenantUser`, `Workspace`, `WorkspaceSessionState`, `TenantLanguageConfig`, `WorkspaceLanguageConfig`, `UserLanguageProfile`, `TenantMcpServer`

**Agents and bots** (8): `Bot`, `BotCapabilitySnapshot`, `BotConfigVersion`, `AgentSession`, `AgentRateLimit`, `RuntimeInstance`, `AgentSubscription`, `TenantSubscription`

**Task execution** (9): `TaskExecutionRecord`, `TaskQueueEntry`, `Plan`, `ActionRecord`, `AgentDispatchRecord`, `OrchestrationRun`, `RunResume`, `ReproPack`, `WorkspaceCheckpoint`

**Memory and knowledge** (5): `AgentShortTermMemory`, `AgentLongTermMemory`, `WorkMemory`, `AgentRepoKnowledge`, `TerminalSession`

**Billing and subscriptions** (5): `Order`, `Invoice`, `SubscriptionEvent`, `ProvisioningJob`, `ScheduledReport`

**Connectors and marketplace** (6): `ConnectorAction`, `ConnectorAuthEvent`, `ConnectorAuthMetadata`, `ConnectorAuthSession`, `MarketplaceListing`, `MarketplaceInstall`

**Governance and audit** (12): `Approval`, `AuditEvent`, `QualitySignalLog`, `StoredEvidenceBundle`, `RetentionPolicy`, `ExternalPluginLoad`, `PluginAllowlist`, `PluginKillSwitch`, `CiTriageReport`, `AbTest`, `AbTestAssignment`, `CircuitBreakerState`

**Communication and developer tools** (17): `MeetingSession`, `ChatSession`, `ChatMessage`, `AgentQuestion`, `NotificationLog`, `ActivityEvent`, `PrDraft`, `ApiKey`, `OutboundWebhook`, `OutboundWebhookDelivery`, `WebhookDlqEntry`, `IdeState`, `DesktopAction`, `DesktopProfile`, `BrowserActionEvent`, `EnvProfile`, `ScheduledJob`

---

## Getting started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker + Docker Compose (for full stack)
- PostgreSQL 16 (provided by Docker Compose)

### Quick start (Docker)

```bash
cp .env.example .env
# Fill in required secrets (see .env.example)
docker compose up
```

### Quick start (local dev)

```bash
pnpm install
cp .env.example .env
# Fill in DATABASE_URL and required secrets

pnpm --filter @agentfarm/db-schema exec prisma migrate deploy
pnpm --filter @agentfarm/db-schema exec prisma generate

# Start services in separate terminals:
pnpm --filter @agentfarm/api-gateway dev      # port 3000
pnpm --filter @agentfarm/agent-runtime dev    # port 4000
pnpm --filter @agentfarm/trigger-service dev  # port 3002
pnpm --filter @agentfarm/dashboard dev        # port 3001
pnpm --filter @agentfarm/orchestrator dev     # port 3011 (optional — multi-agent workflows)
```

### Required environment variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `API_SESSION_SECRET` | Secret for session cookie signing |
| `DASHBOARD_API_TOKEN` | Internal token for dashboard-to-gateway calls |
| `AGENTFARM_APPROVAL_INTAKE_SHARED_TOKEN` | Token for approval intake endpoint |
| `AGENTFARM_CONNECTOR_EXEC_SHARED_TOKEN` | Token for connector execution callbacks |
| `AGENTFARM_RUNTIME_DECISION_SHARED_TOKEN` | Token for runtime decision callbacks |
| `AGENTFARM_RUNTIME_TASK_SHARED_TOKEN` | Token for runtime task observability push |
| `AGENTFARM_RUNTIME_DISPATCH_SHARED_TOKEN` | Token for task dispatch to runtime |

See `.env.example` (380 lines, fully commented) for all variables.

---

## Testing

```bash
pnpm --filter @agentfarm/api-gateway test       # 898 tests, 57 suites
pnpm --filter @agentfarm/agent-runtime test     # 906 tests, 118 suites
pnpm --filter @agentfarm/trigger-service test   #  49 tests, 19 suites
```

**Total: 1,853 tests, 0 failures.**

Test framework: Node.js built-in `node:test`. No Jest, no Vitest.

---

## CI/CD

Seven GitHub Actions jobs in `.github/workflows/ci.yml`:

| Job | Purpose |
|-----|---------|
| `website-permissions` | Build website, start server, run permission matrix + deployment UI regression |
| `validate` | Workspace-level `pnpm typecheck` + `pnpm build` |
| `db-integration` | Spin up Postgres, run `db:migrate:deploy`, run `test:db-smoke` |
| `install` | `pnpm install --frozen-lockfile` with pnpm store cache |
| `typecheck` | Matrix typecheck: api-gateway, agent-runtime, trigger-service, dashboard, crm-adapters, erp-adapters, notification-adapters |
| `test` | Matrix tests: api-gateway, agent-runtime, trigger-service, crm-adapters, erp-adapters, notification-adapters |
| `build` | Docker build matrix: api-gateway, agent-runtime, trigger-service, dashboard |

---

## Docker

Nine services in `docker-compose.yml`. All 8 runtime services have healthchecks. `migrate` is a one-shot init container (no healthcheck — intentional).

| Service | Port | Healthcheck | Notes |
|---------|------|-------------|-------|
| `postgres` | 5432 | `pg_isready -U agentfarm` | Primary database |
| `redis` | 6379 | `redis-cli ping` | Rate limiting and cache |
| `opa` | 8181 | `GET /health` | Optional — policy evaluation |
| `voicebox` | 17493 | `GET /health` | Optional — STT transcription |
| `migrate` | — | None (intentional) | One-shot Prisma migrate |
| `api-gateway` | 3000 | `GET /health` | Main control plane |
| `agent-runtime` | 4000 | `GET /health` | AI execution engine |
| `trigger-service` | 3002 | `GET /health` | Webhook/email/Slack intake |
| `dashboard` | 3001 | `GET /` | Operator dashboard |

---

## Shared packages

13 shared packages under `packages/`. TypeScript path aliases enable in-process resolution in development — no compiled `dist/` output required to run or test locally.

| Package | Purpose | Has `dist/`? | Notes |
|---------|---------|--------------|-------|
| `@agentfarm/auth-utils` | scrypt password hashing + verification | no | |
| `@agentfarm/cli` | `af` developer CLI (`bin: af`) | no | Depends on sdk |
| `@agentfarm/config` | Centralised service URL + config constants | no | |
| `@agentfarm/connector-contracts` | Connector action/auth contracts | no | |
| `@agentfarm/crm-service` | CRM adapter types and clients | no | |
| `@agentfarm/db-schema` | Prisma schema + generated client | no | Run `prisma generate` |
| `@agentfarm/e2e` | Playwright end-to-end tests | no | |
| `@agentfarm/erp-service` | ERP adapter types and clients | no | |
| `@agentfarm/notification-service` | Notification adapter types | no | |
| `@agentfarm/observability` | OTEL + Azure Monitor helpers | no | |
| `@agentfarm/queue-contracts` | Queue message schemas | no | |
| `@agentfarm/sdk` | AgentFarmClient SDK (agents, analytics, notifications) | no | |
| `@agentfarm/shared-types` | Shared TypeScript types | yes | |

---

## Security

- **`@fastify/helmet`** — CSP (`default-src 'none'`, `frame-ancestors 'none'`), HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy (`strict-origin-when-cross-origin`)
- **Per-IP rate limiting** — 180 req/min general, 20 req/min auth endpoints; `x-ratelimit-remaining` header on every response
- **Per-tenant rate limiting** — 600 req/min; `x-ratelimit-tenant-remaining` header
- **HMAC webhook verification** — inbound webhooks require valid `x-hub-signature-256` or `x-signature`
- **Session auth** — all `/v1/*` routes require a valid session cookie; public paths explicitly allowlisted
- **CORS origin validation** — `ALLOWED_ORIGINS` env var; 403 on unlisted origin
- **1 MB bodyLimit** — prevents large payload DoS
- **Audit trail** — sensitive mutations (approvals, role changes, kill-switch) logged to append-only audit table
- **Token budget alerts** — warning at 80%, critical throttle at 90% of daily limit
- **No hardcoded secrets** — all secrets from environment variables
- **Permissions-Policy header** — `geolocation=(), microphone=(), camera=()` on all responses
