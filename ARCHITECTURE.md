# Architecture

AgentFarm is a TypeScript pnpm monorepo. The system is composed of five applications, eight shared packages, and external services. All runtime services are containerised and orchestrated via Docker Compose.

---

## Service topology

```
 Browser / API client
        |
        v
 ┌──────────────┐         ┌──────────────────┐
 │   Dashboard  │         │     Website       │
 │  (Next.js 15)│         │  (Next.js 15)     │
 │   port 3001  │         │   port 3000       │
 └──────┬───────┘         └──────────────────┘
        │  internal token
        v
 ┌──────────────────────────────────────────┐
 │              API Gateway                 │
 │  (Fastify 5, port 3000)                  │
 │  Auth · Billing · Audit · Approvals      │
 │  Connectors · Governance · Budget        │
 └────────────────┬─────────────────────────┘
                  │  shared tokens
       ┌──────────┴──────────┐
       │                     │
       v                     v
 ┌─────────────┐     ┌───────────────────┐
 │Trigger Svc  │     │  Agent Runtime    │
 │(Fastify 5)  │────▶│  (Fastify 5)      │
 │ port 3002   │     │  port 4000        │
 └─────────────┘     │  health 4001      │
                     └───────────────────┘
                              │
              ┌───────────────┼───────────────┐
              v               v               v
       ┌──────────┐   ┌──────────────┐  ┌──────────┐
       │PostgreSQL│   │    Redis     │  │ LLM APIs │
       │  pg 16   │   │  rate limit  │  │ (9 provs)│
       └──────────┘   └──────────────┘  └──────────┘
```

### Optional external services

| Service | Port | Purpose | Used by |
|---------|------|---------|---------|
| OPA (Open Policy Agent) | 8181 | Policy evaluation | api-gateway (future integration) |
| Voicebox | 17493 | Speech-to-text transcription | agent-runtime (on-demand per request) |
| VoxCPM2 | — | Text-to-speech synthesis | agent-runtime (on-demand per request) |

---

## Data flows

### Task execution flow

```
Trigger (webhook / email / Slack)
  └─▶ Trigger Service
        └─▶ POST /v1/runtime/tasks (Agent Runtime)
              └─▶ Task Planner (LLM)
                    └─▶ Execution Engine
                          ├─▶ Risk classification
                          │     ├─▶ LOW  → execute immediately
                          │     └─▶ MEDIUM / HIGH → Approval queue (API Gateway)
                          │                              └─▶ Approved → resume execution
                          └─▶ Action executor (tier 1–12)
                                └─▶ Action result + evidence written to DB
```

### Approval flow

```
Agent Runtime → POST /v1/approvals/intake (API Gateway, HMAC-auth)
  └─▶ Approval record created (immutable)
        └─▶ Dashboard approval queue (polling)
              └─▶ Operator decides (approve / reject)
                    └─▶ Decision locked (409 on re-decision)
                          └─▶ Decision latency tracked
                                └─▶ Optional webhook notification
```

### Dashboard API proxy flow

```
Dashboard browser
  └─▶ Next.js app/api/[...path]/route.ts
        └─▶ Adds X-Dashboard-Token header
              └─▶ Forwards to API Gateway /v1/*
                    └─▶ Response relayed to browser
```

---

## Application details

### API Gateway (`apps/api-gateway/`)

- **Framework**: Fastify 5 with TypeScript
- **Port**: 3000
- **Database**: PostgreSQL 16 via Prisma ORM
- **Cache/Rate-limit**: Redis
- **Auth**: Cookie-based session tokens; all `/v1/*` routes protected
- **Rate limits**: 180 req/min per IP general; 20 req/min per IP on auth routes; 600 req/min per tenant
- **Security headers**: `@fastify/helmet` (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy)
- **Route count**: 62 route files covering all platform domains
- **Tests**: 898 tests, 57 suites

### Agent Runtime (`apps/agent-runtime/`)

- **Framework**: Fastify 5 with TypeScript
- **Port**: 4000 (main), `AF_HEALTH_PORT` (health, default 4001)
- **LLM providers**: 9 named providers + Auto mode
  - OpenAI, Azure OpenAI, Anthropic, Google, xAI, Mistral, Together AI, GitHub Models, AgentFarm native
  - Auto: 5-minute rolling health score (error rate + latency) drives provider selection order
- **Action tiers**: 12 tiers — file ops, shell, IDE, multi-file, REPL, language adapters, governance, release, productivity, observability, desktop/meeting (HIGH), sub-agent/GitHub (HIGH)
- **Sandbox**: `safeChildPath` enforces workspace-scoped paths on all file and shell operations
- **Source files**: 74 non-test TypeScript files
- **Tests**: 906 tests, 118 suites

### Trigger Service (`apps/trigger-service/`)

- **Framework**: Fastify 5 with TypeScript
- **Port**: 3002
- **Inbound channels**: HTTP webhooks, email (IMAP), Slack event subscriptions
- **HMAC verification** on all webhook inbound routes
- **Tests**: 49 tests, 19 suites

### Dashboard (`apps/dashboard/`)

- **Framework**: Next.js 15, React 19
- **Port**: 3001
- **Pages**: 51 pages
- **API proxy routes**: 159 `route.ts` files under `app/api/`
- All API calls are proxied server-side with an internal `X-Dashboard-Token` header

### Website (`apps/website/`)

- **Framework**: Next.js 15
- **Port**: varies (dev: 3000 or next available)
- **Purpose**: Marketing, signup, onboarding, and public-facing documentation

---

## Database schema

70 Prisma models across 8 domains. Schema lives in `packages/db-schema/prisma/schema.prisma`.

| Domain | Model count | Key models |
|--------|-------------|------------|
| Identity and tenancy | 8 | `Tenant`, `TenantUser`, `Workspace` |
| Agents and bots | 8 | `Bot`, `AgentSession`, `RuntimeInstance` |
| Task execution | 9 | `TaskExecutionRecord`, `TaskQueueEntry`, `Plan` |
| Memory and knowledge | 5 | `AgentShortTermMemory`, `WorkMemory`, `AgentRepoKnowledge` |
| Billing and subscriptions | 5 | `Order`, `Invoice`, `ProvisioningJob` |
| Connectors and marketplace | 6 | `ConnectorAuthSession`, `MarketplaceListing` |
| Governance and audit | 12 | `Approval`, `AuditEvent`, `QualitySignalLog` |
| Communication and developer tools | 17 | `ChatSession`, `ApiKey`, `OutboundWebhook` |

### Key design decisions

- **Append-only audit**: `AuditEvent` table has no update or delete path. All mutations are inserts.
- **Approval immutability**: `Approval` records are written once; re-decision returns HTTP 409.
- **Workspace-scoped isolation**: All agent activity records carry `tenantId` + `workspaceId` for row-level security.
- **Prisma client**: Generated into `packages/db-schema`. Applications import from `@agentfarm/db-schema`.

---

## Shared packages

| Package | Import name | Purpose |
|---------|-------------|---------|
| `packages/db-schema` | `@agentfarm/db-schema` | Prisma schema, migrations, generated client |
| `packages/shared-types` | `@agentfarm/shared-types` | Contract types shared across all apps |
| `packages/queue-contracts` | `@agentfarm/queue-contracts` | Queue message type definitions |
| `packages/connector-contracts` | `@agentfarm/connector-contracts` | 18-connector registry, 18 action types, 12 role policies |
| `packages/observability` | `@agentfarm/observability` | OpenTelemetry + Azure Monitor helpers |
| `packages/crm-service` | `@agentfarm/crm-adapters` | CRM adapter types and clients |
| `packages/erp-service` | `@agentfarm/erp-adapters` | ERP adapter types and clients |
| `packages/notification-service` | `@agentfarm/notification-adapters` | Notification adapter types |

Packages use `main: ./src/index.ts` in their `package.json` for in-process resolution during development. No `dist/` output is required for local development or testing. `@agentfarm/shared-types` is the only package with a compiled `dist/` (used by applications that need it at runtime).

---

## Key architectural decisions

### Single control-plane entry point
All external and dashboard traffic enters through the API Gateway. The Agent Runtime and Trigger Service communicate back to the Gateway using shared HMAC tokens for inter-service calls. There is no direct browser access to the Agent Runtime.

### Dashboard server-side proxy
The Dashboard uses Next.js `app/api/` routes as a server-side proxy layer. Every request from the browser goes to a Next.js route handler, which appends the internal auth token and forwards to the API Gateway. The browser never holds the gateway token.

### LLM provider abstraction
The `LlmDecisionAdapter` in the Agent Runtime abstracts all 9 LLM providers behind a common interface. Auto mode selects providers based on a 5-minute rolling health score. Every decision produces a `ProviderFailoverTraceRecord[]` for debugging.

### Risk-gated execution
The Execution Engine classifies every action as LOW, MEDIUM, or HIGH risk. LOW actions execute immediately. MEDIUM and HIGH actions create an approval record in the API Gateway and pause until an operator decision is received. The kill-switch blocks all MEDIUM/HIGH actions globally within a 30-second control window.

### Evidence and audit integrity
Evidence records and audit events are written as immutable inserts. The `StoredEvidenceBundle` and `AuditEvent` tables have no update or delete operations in the application code. Compliance exports are generated from these tables.

---

## Infrastructure

Infrastructure as Code lives in `infrastructure/`:

- `infrastructure/control-plane/` — Azure resources for the control plane (API Gateway, database, identity)
- `infrastructure/runtime-plane/` — Azure resources for the agent runtime plane (VM, container runtime, networking)

The CI pipeline builds Docker images for `api-gateway`, `agent-runtime`, `trigger-service`, and `dashboard`. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full CI job structure.
