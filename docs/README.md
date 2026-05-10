# AgentFarm Documentation Index

> Last updated: May 10, 2026 | AgentFarm monorepo audit

AgentFarm is a **multi-tenant AI agent platform** that deploys specialised AI teammates (agents) for engineering teams. Agents handle code, QA, docs, recruiting, meetings, and more — with every action gated by a human-approval workflow.

---

## Monorepo Structure

```
d:\AgentFarm\
├── apps/                        # User-facing and runtime applications
│   ├── agent-runtime/           # Core agent task execution engine (port 3003)
│   ├── api-gateway/             # Central REST API — Fastify v5 (port 3000)
│   ├── dashboard/               # Internal ops dashboard — Next.js 15 (port 3001)
│   ├── orchestrator/            # Multi-agent GOAP orchestrator (port 3004)
│   ├── trigger-service/         # External event → agent task bridge (port 3002)
│   └── website/                 # Public marketing site + customer portal (port 3002*)
│                                # (*trigger-service + website both default 3002; set TRIGGER_SERVICE_PORT)
├── services/                    # Domain services — control and evidence planes
│   ├── agent-observability/     # Action interception, audit log writing, scoring
│   ├── agent-question-service/  # Agent pause/ask/resume human-question flow
│   ├── approval-service/        # Approval enforcement and governance workflow mgr
│   ├── audit-storage/           # Azure Blob screenshot uploader and audit types
│   ├── browser-actions/         # Web action helpers (web-actions.ts)
│   ├── compliance-export/       # Compliance data export service
│   ├── connector-gateway/       # Connector adapters: Slack, GitHub, Linear, etc.
│   ├── evidence-service/        # HNSW index for evidence retrieval + KPI scoring
│   ├── identity-service/        # Identity resolution stub
│   ├── meeting-agent/           # Meeting lifecycle and voice pipeline
│   ├── memory-service/          # Agent memory store (short/long-term)
│   ├── notification-service/    # Multi-channel notification dispatcher
│   ├── policy-engine/           # Governance routing policy evaluator
│   ├── provisioning-service/    # Azure VM/container provisioning job processor
│   └── retention-cleanup/       # Scheduled retention cleanup job
├── packages/                    # Shared libraries
│   ├── connector-contracts/     # Connector type contracts (TypeScript)
│   ├── crm-service/             # CRM integration types/stubs
│   ├── db-schema/               # Prisma schema + migrations (PostgreSQL)
│   ├── erp-service/             # ERP integration types/stubs
│   ├── notification-service/    # Shared notification adapter contracts
│   ├── observability/           # Shared telemetry/observability helpers
│   ├── queue-contracts/         # Queue message type contracts
│   └── shared-types/            # Canonical shared TypeScript types
├── infrastructure/
│   ├── control-plane/           # Azure IaC for control plane
│   └── runtime-plane/           # Azure IaC for runtime plane
├── docs/                        # This documentation directory
├── planning/                    # Architecture decisions and sprint planning docs
├── operations/                  # Runbooks and quality gate docs
├── scripts/                     # Utility scripts
└── tools/                       # Developer tooling
```

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 22 |
| pnpm | ≥ 9 |
| PostgreSQL | 16 (Docker or local) |
| Docker + Docker Compose | Latest |

---

## Quick Start

### 1. Install dependencies
```bash
pnpm install
```

### 2. Set up environment variables

Copy root `.env.example` to `.env` and fill in required values:

```bash
cp .env.example .env
```

Key variables (see [DEPLOYMENT.md](DEPLOYMENT.md) for full list):

```env
DATABASE_URL=postgresql://agentfarm:agentfarm@localhost:5432/agentfarm
API_SESSION_SECRET=your-secret-here
API_GATEWAY_URL=http://localhost:3000
API_GATEWAY_PORT=3000
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### 3. Start infrastructure (PostgreSQL + Redis)

```bash
docker-compose up -d
```

### 4. Run database migrations

```bash
pnpm --filter @agentfarm/db-schema db:migrate
# or
cd packages/db-schema && npx prisma migrate dev
```

### 5. Start all apps in development

```bash
pnpm dev
```

Or start individual apps:

```bash
pnpm --filter @agentfarm/api-gateway dev        # port 3000
pnpm --filter @agentfarm/dashboard dev           # port 3001
pnpm --filter @agentfarm/website dev             # port 3002 (or next available)
pnpm --filter @agentfarm/agent-runtime dev       # port 3003
pnpm --filter @agentfarm/orchestrator dev
pnpm --filter @agentfarm/trigger-service dev
```

---

## Test Commands

```bash
# Run ALL tests across the monorepo
pnpm test

# Quality gate (lint + typecheck + test)
pnpm quality:gate

# Per-package tests
pnpm --filter @agentfarm/api-gateway test          # ~450 tests
pnpm --filter @agentfarm/agent-runtime test        # ~785 tests
pnpm --filter @agentfarm/dashboard test            # ~118 tests
pnpm --filter @agentfarm/website test              # ~118 tests
pnpm --filter @agentfarm/orchestrator test         # ~62 tests
pnpm --filter @agentfarm/connector-gateway test    # ~36 tests
pnpm --filter @agentfarm/evidence-service test     # ~24 tests
pnpm --filter @agentfarm/meeting-agent test        # ~23 tests
pnpm --filter @agentfarm/notification-service test # ~31 tests
pnpm --filter @agentfarm/agent-observability test  # ~9 tests
pnpm --filter @agentfarm/approval-service test     # ~12 tests
pnpm --filter @agentfarm/provisioning-service test # ~15 tests
pnpm --filter @agentfarm/memory-service test       # ~11 tests
pnpm --filter @agentfarm/policy-engine test        # ~2 tests

# Typecheck a specific package
pnpm --filter @agentfarm/api-gateway typecheck
```

---

## Documentation Index

| Document | Description |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Full system architecture, service map, data flows |
| [DATA_MODEL.md](DATA_MODEL.md) | All 50+ Prisma models, enums, and ER relationships |
| [API_REFERENCE.md](API_REFERENCE.md) | Every HTTP route across every service |
| [AGENT_SYSTEM.md](AGENT_SYSTEM.md) | All 12+ agent roles, LLM providers, execution pipeline |
| [CONNECTOR_SYSTEM.md](CONNECTOR_SYSTEM.md) | All connectors, OAuth flow, token storage |
| [TRIGGER_SYSTEM.md](TRIGGER_SYSTEM.md) | Trigger server, all trigger types, event routing |
| [AUTH_SYSTEM.md](AUTH_SYSTEM.md) | Auth bridge, session tokens, page protection |
| [MEMORY_SYSTEM.md](MEMORY_SYSTEM.md) | Short/long-term memory, TTL, relevance ranking |
| [LANGUAGE_SYSTEM.md](LANGUAGE_SYSTEM.md) | Language detection, resolution, multilingual agent output |
| [MCP_REGISTRY.md](MCP_REGISTRY.md) | MCP server registration, agent tool invocation |
| [DESKTOP_OPERATOR.md](DESKTOP_OPERATOR.md) | Desktop/browser automation, audit events |
| [FILE_INVENTORY.md](FILE_INVENTORY.md) | Every file in the repo with purpose and key exports |
| [BRD.md](BRD.md) | Business requirements document |
| [TEST_STRATEGY.md](TEST_STRATEGY.md) | Test framework, suite coverage, CI integration |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Step-by-step local run, all env vars, Docker, production |
| [PAYMENTS.md](PAYMENTS.md) | Billing, Stripe/Razorpay, ZohoSign contract flow |
| [TESTING.md](TESTING.md) | Test patterns, mock conventions, quality gate |
| [API.md](API.md) | Older API overview (see API_REFERENCE.md for full list) |
| [AGENT_ROLES.md](AGENT_ROLES.md) | Agent role capability summaries |

---

## Key Conventions

- **Monorepo tool:** `pnpm` workspaces — use `pnpm --filter @agentfarm/<package>` for scoped commands.
- **TypeScript:** Strict mode, ES2022, NodeNext ESM — all imports require `.js` extension.
- **Test framework:** `node:test` + `node:assert/strict` — NOT vitest/jest.
- **API framework:** Fastify v5 in `api-gateway`, Next.js 15 App Router in `website` and `dashboard`.
- **Database:** Prisma v6 on PostgreSQL 16. Schema lives in `packages/db-schema/prisma/schema.prisma`.
- **Auth:** HMAC-signed session tokens. Cookie: `agentfarm_session`. Scope: `customer` | `internal`.
- **Import style:** `.js` extensions required in TypeScript ESM imports (e.g., `import { x } from './foo.js'`).
