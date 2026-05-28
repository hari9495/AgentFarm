# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
pnpm install

# Typecheck (all packages)
pnpm typecheck

# Typecheck (single app)
pnpm --filter @agentfarm/<app> typecheck

# Build all
pnpm build

# Build single app
pnpm --filter @agentfarm/<app> build

# Run all tests (1,853 tests, node:test framework)
pnpm test

# Run tests for a single app
pnpm --filter @agentfarm/<app> test

# Run a specific test file
pnpm --filter @agentfarm/<app> test src/<path>.test.ts

# Run database integration tests (spins up Docker Postgres, migrates, tests, teardown)
pnpm test:db

# Run coverage for a single app
pnpm --filter @agentfarm/<app> test:coverage

# Lint
pnpm lint

# Dev servers (each in a separate terminal)
pnpm --filter @agentfarm/api-gateway dev       # port 3000
pnpm --filter @agentfarm/agent-runtime dev     # port 4000
pnpm --filter @agentfarm/trigger-service dev   # port 3002
pnpm --filter @agentfarm/dashboard dev         # port 3001
pnpm --filter @agentfarm/orchestrator dev      # port 3011

# Or run everything via Docker
docker compose up

# Database
pnpm db:migrate:deploy
pnpm --filter @agentfarm/db-schema exec prisma generate
pnpm --filter @agentfarm/db-schema exec prisma migrate dev --name <name>
```

**Test framework:** Node.js built-in `node:test` — no Jest, no Vitest. Tests use `import test from 'node:test'` and `import assert from 'node:assert/strict'`.

**Code style:** Prettier with 100-char width, single quotes, trailing commas, semicolons. ESLint 9, `no-console` off. All imports are ES modules.

## Architecture

AgentFarm is a **multi-tenant AI agent orchestration platform** — a TypeScript pnpm monorepo targeting Node.js 20+ (CI uses 22). It covers task execution across 9 LLM providers, multi-agent workflows via a GOAP planner, 12 action tiers (file/shell/IDE/browser/desktop/meetings), structured approvals, audit trails, billing, and voice meeting transcription.

**Core stack:** TypeScript 5.7 (strict, ES2022, NodeNext), Fastify 5 (HTTP), Prisma 6.19 + PostgreSQL 16 + pgvector, Redis 7, Next.js 15 + React 19 + Tailwind CSS 4.

### Monorepo layout

```
apps/               6 runtime services
services/           18 domain modules (imported into apps, not standalone containers)
packages/           16 shared packages (no dist/ in dev — resolved via TS path aliases)
scripts/            30+ dev/ops scripts
```

**Apps:**

| App | Port | Role |
|-----|------|------|
| `api-gateway` | 3000 | Control plane — auth, billing, audit, approvals, routing |
| `agent-runtime` | 4000 | Execution engine — LLM dispatch, 12 action tiers |
| `orchestrator` | 3011 | GOAP multi-agent planner, schedulers, handoffs |
| `trigger-service` | 3002 | Inbound intake — webhooks, IMAP email, Slack |
| `dashboard` | 3001 | Operator UI — 51 pages, 159 Next.js proxy routes |
| `website` | varies | Marketing, signup, onboarding (Azure SWA in prod) |

**Key services** (imported by api-gateway / agent-runtime):
`approval-service`, `connector-gateway` (OAuth + mTLS + plugin loader), `identity-service`, `evidence-service` (HNSW vector search), `meeting-agent` (STT/TTS), `memory-service`, `notification-service`, `policy-engine`, `provisioning-service` (Azure VM state machine), `browser-actions` (Playwright), `audit-storage`.

**Key packages:**
`db-schema` (Prisma schema + 14-phase migrations), `shared-types` (100+ TS contracts, only package with a compiled `dist/`), `connector-contracts` (18 connectors, 18 action types, 12 role profiles), `observability` (OTEL + Azure Monitor), `sdk` (AgentFarmClient), `config` (service URLs + constants).

### Request flow

```
Browser / API client
  ↓
Dashboard (Next.js)  ──[X-Dashboard-Token]──→  API Gateway (3000)
                                                  │
                          ┌───────────────────────┤
                          ↓                       ↓
                  Trigger Service (3002)   Agent Runtime (4000)
                          │                       │
                          └──────→ Tasks ─────────┘
                                       │
                           PostgreSQL · Redis · LLM APIs

Orchestrator (3011) — GOAP planner, routine schedulers, proactive signals
OPA (8181)          — policy evaluation
Voicebox / VoxCPM2  — STT / TTS
```

**Dashboard proxy:** All browser requests hit `apps/dashboard/app/api/[...path]/route.ts`, which adds `X-Dashboard-Token` and forwards to `api-gateway /v1/*`.

**Task execution path:** Trigger Service → `POST /v1/runtime/tasks` (Agent Runtime) → LLM Planner → risk classification → LOW: execute immediately; MEDIUM/HIGH: Approval queue (API Gateway) → operator decision → resume.

**Approval path:** Agent Runtime → `POST /v1/approvals/intake` (HMAC-auth) → approval record → Dashboard polling → operator decision → locked on re-decision (409) → decision latency tracked → webhook notification.

### Key patterns

**Route registration:** Each Fastify app has a `src/route-registry.ts` that dynamically imports and registers domain routes grouped by area (agents, governance, connectors, etc.).

**Session auth:** Cookie-based signed token (`API_SESSION_SECRET`, 32+ chars). Payload: `userId`, `tenantId`, `workspaceIds[]`, `scope`, `expiresAt`. All `/v1/*` routes require auth; public paths explicitly allowlisted.

**Rate limiting:** Per-IP (180 req/min general, 20 req/min auth) and per-tenant (600 req/min). Redis-backed, headers returned on responses.

**Inter-service auth:** HMAC shared tokens per route group (`APPROVAL_INTAKE_SHARED_TOKEN`, `RUNTIME_TASK_SHARED_TOKEN`, etc.).

**Connector framework:** 18 connectors with OAuth 2.0/API key/basic auth. Token lifecycle workers handle auto-refresh, revoke, and re-consent. Marketplace registry with health monitoring.

**Billing:** Tenant and agent subscriptions, grace periods, hard-stop enforcement, daily lifecycle sweep. Stripe + Razorpay webhooks. Budget policy with daily/monthly limits, 80% warning, 90% throttle.

**Governance:** Kill-switch (30-second control window), circuit breakers, evidence bundles with TTL, A/B testing, plugin allowlist/killswitch, append-only audit log.

**Workers:** API Gateway runs workers in-process by default. Set `AF_WORKERS_DISABLED=1` to delegate to the standalone worker-runner service.

### Database

Schema at `packages/db-schema/prisma/schema.prisma` — 70 models across 8 domains: Identity & Tenancy, Agents & Bots, Task Execution, Memory & Knowledge, Billing & Subscriptions, Connectors & Marketplace, Governance & Audit, Communication & Developer Tools.

### Environment variables

All variables documented in `.env.example` (380 lines). Minimum required to run locally:
- `DATABASE_URL`, `REDIS_URL`, `OPA_BASE_URL`
- `API_SESSION_SECRET` (32+ chars)
- `API_REQUIRE_AUTH=true`
- HMAC tokens: `APPROVAL_INTAKE_SHARED_TOKEN`, `CONNECTOR_EXEC_SHARED_TOKEN`, `RUNTIME_DECISION_SHARED_TOKEN`, `RUNTIME_DISPATCH_SHARED_TOKEN`, `RUNTIME_TASK_SHARED_TOKEN`
- LLM keys as needed: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.

### Docker services

`docker-compose.yml` defines 9 services: `postgres` (5432), `redis` (6379), `opa` (8181), `voicebox` (17493), `migrate` (one-shot), `api-gateway`, `agent-runtime`, `trigger-service`, `dashboard`. All except migrate have healthchecks at `GET /health`.

### CI pipeline

`.github/workflows/ci.yml` runs 7 jobs: `secret-scan` (gitleaks), `website-permissions`, `validate` (typecheck + build), `db-integration`, `install` (cache), `typecheck` (matrix: 6 apps), `test` (matrix: 6 apps), `build` (Docker matrix: 4 apps).
