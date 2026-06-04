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

**Session auth:** Cookie-based signed token (`API_SESSION_SECRET`, 32+ chars). Payload: `userId`, `tenantId`, `workspaceIds[]`, `scope`, `expiresAt`. All `/v1/*` routes require auth; public paths explicitly allowlisted. `scope: 'customer'` for browser sessions; `scope: 'internal'` for machine-to-machine service tokens only — SSO users get `customer` scope.

**Adding auth to a new route:** Pass `getSession` into the route registration function options (see `RegisterAutonomousLoopRoutesOptions` or `RegisterRetentionPolicyRoutesOptions` as templates). Check `getSession(request)` at the top of each handler and return `401` if null. Always scope DB queries to `session.tenantId` — never accept `tenantId` from the request body. Add a 401 regression test to `src/routes/auth-regression.test.ts`.

**Inbound webhook auth pattern:** Use `timingSafeEqual` for token comparison (never `===`). Fail-closed: if a secret env var is set, a valid signature is **required**; if the env var is absent, return 503 (endpoint not configured), not a pass-through. Reference: `zoho-sign-webhook.ts`, `calls-webhook.ts`.

**Rate limiting:** Per-IP (180 req/min general, 20 req/min auth) and per-tenant (600 req/min). Redis-backed, headers returned on responses.

**Inter-service auth:** HMAC shared tokens per route group (`APPROVAL_INTAKE_SHARED_TOKEN`, `RUNTIME_TASK_SHARED_TOKEN`, etc.). Use `timingSafeEqual` for all token comparisons — `task-notify.ts` is the reference implementation.

**Connector framework:** 18 connectors with OAuth 2.0/API key/basic auth. Token lifecycle workers handle auto-refresh, revoke, and re-consent. Marketplace registry with health monitoring.

**Billing:** Tenant and agent subscriptions, grace periods, hard-stop enforcement, daily lifecycle sweep. Stripe + Razorpay webhooks. Budget policy with daily/monthly limits, 80% warning, 90% throttle.

**Governance:** Kill-switch (30-second control window), circuit breakers, evidence bundles with TTL, A/B testing, plugin allowlist/killswitch, append-only audit log.

**Workers:** API Gateway runs workers in-process by default. Set `AF_WORKERS_DISABLED=1` to delegate to the standalone worker-runner service.

### Database

Schema at `packages/db-schema/prisma/schema.prisma` — 70 models across 8 domains: Identity & Tenancy, Agents & Bots, Task Execution, Memory & Knowledge, Billing & Subscriptions, Connectors & Marketplace, Governance & Audit, Communication & Developer Tools.

### Environment variables

All variables documented in `.env.example`. Minimum required to run locally:
- `DATABASE_URL`, `REDIS_URL`, `OPA_BASE_URL`
- `API_SESSION_SECRET` (32+ chars)
- `API_REQUIRE_AUTH=true`
- HMAC tokens: `APPROVAL_INTAKE_SHARED_TOKEN`, `CONNECTOR_EXEC_SHARED_TOKEN`, `RUNTIME_DECISION_SHARED_TOKEN`, `RUNTIME_DISPATCH_SHARED_TOKEN`, `RUNTIME_TASK_SHARED_TOKEN`
- LLM keys as needed: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.

**Webhook secrets (required in production — fail-closed if set):**
| Variable | Endpoint protected |
|---|---|
| `ZOHO_SIGN_WEBHOOK_TOKEN` | `POST /v1/webhooks/zoho-sign` |
| `BOOKING_WEBHOOK_SECRET` | `POST /v1/webhooks/booking` |
| `CONTRACT_WEBHOOK_SECRET` | `POST /webhooks/contract` |
| `CALLS_WEBHOOK_SECRET` | `POST /v1/sales/calls/answer|turn|status` |
| `SLACK_WEBHOOK_SECRET` | `POST /api/v1/questions/webhooks/slack` |
| `TEAMS_WEBHOOK_SECRET` | `POST /api/v1/questions/webhooks/teams` |
| `MEMORY_WEBHOOK_SECRET` | `POST /api/v1/memory/patterns/code-review` |
| `WEBHOOK_INGEST_SECRET` | `POST /webhooks/ingest/:provider` |

### Docker services

`docker-compose.yml` defines 9 services: `postgres` (5432), `redis` (6379), `opa` (8181), `voicebox` (17493), `migrate` (one-shot), `api-gateway`, `agent-runtime`, `trigger-service`, `dashboard`. All except migrate have healthchecks at `GET /health`.

### CI pipeline

`.github/workflows/ci.yml` runs 7 jobs: `secret-scan` (gitleaks), `website-permissions`, `validate` (typecheck + build), `db-integration`, `install` (cache), `typecheck` (matrix: 6 apps), `test` (matrix: 6 apps), `build` (Docker matrix: 4 apps).

## RAG (Retrieval-Augmented Generation)

All 15 agents use RAG to ground LLM prompts in workspace-specific prior work, templates, and learned lessons. The pattern is identical across every agent — only the domain vocabulary differs. The `developer` agent uses `developer-episodic-hooks.ts` instead of a dedicated lesson pipeline; all other agents use the standard `*-lesson-pipeline.ts` + `classifyFeedback()` pattern.

### Infrastructure

| Component | Location | Role |
|-----------|----------|------|
| `AgentKnowledgeBase` | Prisma schema | pgvector table — semantic memory (documents, templates) |
| `AgentLongTermMemory` | Prisma schema | pgvector table — episodic memory (patterns, lessons) |
| `@agentfarm/memory-service` | `packages/memory-service/` | `writeSemanticMemory`, `searchSemanticMemory`, episodic variants |
| Knowledge base API | `POST /v1/knowledge-base/search` | Cosine-similarity search over AgentKnowledgeBase |
| Patterns API | `GET /v1/workspaces/:id/memory/patterns` | Retrieve long-term lesson patterns |

Vector similarity uses the pgvector `<=>` cosine-distance operator. Default thresholds: 0.65 for document retrieval, 0.55 for template/compliance retrieval.

### The Retrieval Pattern (three parallel paths)

Every agent RAG retriever follows this structure:

```
Path 1: retrieveSimilar*()       → prior approved artifacts (sourceType ≠ *_template)
Path 2: retrieve*Templates()     → domain templates & compliance (sourceType = *_template)
Path 3: retrieve*Lessons()       → long-term memory patterns (prefix: agent:lesson:)

build*RagContext() runs all three via Promise.all() and assembles a ## Context block.
```

The context block is prepended to the agent's system prompt. If nothing is retrieved, the block is an empty string and nothing is injected.

### The Flywheel (lessons compound over time)

When an artifact is approved/accepted → `ingestApproved*()` writes it to `AgentKnowledgeBase`.
When an artifact is rejected/fails → `ingest*Feedback()` → `classifyFeedback()` → lesson stored in `AgentLongTermMemory` under key `<agent>:lesson:<category>:<workspaceId>:<lessonId>`.

Next run retrieves both — so agents improve automatically without retraining.

### Agent RAG Coverage

| Agent | RAG Retriever | Lesson Pipeline | Lesson Key Prefix |
|-------|--------------|-----------------|-------------------|
| `business-analyst` | `business-analyst-rag-retriever.ts` | `business-analyst-lesson-pipeline.ts` | `ba:lesson:` |
| `sales-agent` | `sales-agent-rag-retriever.ts` | `sales-agent-lesson-pipeline.ts` | `sales:lesson:` |
| `recruiter` | `recruiter-rag-retriever.ts` | `recruiter-lesson-pipeline.ts` | `rec:lesson:` |
| `content-writer` | `content-writer-rag-retriever.ts` | `content-writer-lesson-pipeline.ts` | `cw:lesson:` |
| `technical-writer` | `technical-writer-rag-retriever.ts` | `technical-writer-lesson-pipeline.ts` | `tw:lesson:` |
| `project-manager` | `project-manager-rag-retriever.ts` | `project-manager-lesson-pipeline.ts` | `pm:lesson:` |
| `marketing-specialist` | `marketing-specialist-rag-retriever.ts` | `marketing-specialist-lesson-pipeline.ts` | `ms:lesson:` |
| `devops` | `devops-rag-retriever.ts` | `devops-lesson-pipeline.ts` | `devops:lesson:` |
| `full-stack-developer` | `fsd-rag-retriever.ts` | `fsd-lesson-pipeline.ts` | `fsd:lesson:` |
| `developer` | `developer-rag-retriever.ts` | `developer-episodic-hooks.ts` (existing) | `dev:` |
| `customer-support-executive` | `customer-support-rag-retriever.ts` | `customer-support-lesson-pipeline.ts` | `cs:lesson:` |
| `corporate-assistant` | `corporate-assistant-rag-retriever.ts` | `corporate-assistant-lesson-pipeline.ts` | `ca:lesson:` |
| `mobile` | `mobile-rag-retriever.ts` | `mobile-lesson-pipeline.ts` | `mobile:lesson:` |
| `tester` | `tester-rag-retriever.ts` | `tester-lesson-pipeline.ts` | `tester:lesson:` |
| `meeting-agent` | `meeting-agent-rag-retriever.ts` | `meeting-agent-lesson-pipeline.ts` | `meeting:lesson:` |

### Lesson Category Taxonomy

Each agent's lesson pipeline uses a domain-specific set of categories for targeted retrieval. The `classifyFeedback()` heuristic uses regex patterns — no LLM call required. Default category is the most common root cause per domain.

| Agent | Lesson Categories |
|-------|------------------|
| business-analyst | scope, clarity, completeness, stakeholder_alignment, technical_accuracy, format, risk_omission |
| sales-agent | email_personalization, objection_handling, proposal_quality, timing, closing_technique, follow_up, discovery |
| recruiter | jd_quality, screening_accuracy, interview_process, offer_strategy, candidate_experience, compliance, diversity |
| content-writer | brand_voice, seo_optimization, factual_accuracy, structure, engagement, tone, clarity |
| technical-writer | completeness, accuracy, structure, style_compliance, audience_fit, code_examples, versioning |
| project-manager | scope_management, estimation, risk_identification, stakeholder_communication, delivery_predictability, resource_allocation, retrospective_insights |
| marketing-specialist | targeting_accuracy, creative_quality, channel_selection, budget_allocation, timing, message_clarity, conversion_optimization |
| devops | incident_response, deployment_safety, configuration_management, monitoring_gaps, security_compliance, cost_optimization, reliability |
| full-stack-developer | code_quality, performance, accessibility, api_design, testing_strategy, security, architecture |
| customer-support-executive | resolution_quality, escalation_timing, empathy, product_accuracy, sla_compliance, de_escalation, follow_through |
| corporate-assistant | tone, completeness, urgency_detection, stakeholder_awareness, formatting, confidentiality, escalation_timing |
| mobile | platform_consistency, performance, accessibility, ux_patterns, code_quality, testing_coverage, api_integration |
| developer | feature_impl, bug_fix, code_review, refactor, test_authoring, debug, security_audit, dependency_audit, perf_audit, code_quality, api_design, incident |
| tester | coverage_gaps, bug_reproduction, edge_cases, environment_setup, test_quality, regression_detection, reporting |
| meeting-agent | action_item_clarity, decision_capture, participant_engagement, summary_accuracy, follow_up_tracking, time_management |

### Adding RAG to a New Agent

1. Create `<agent>-rag-retriever.ts` with `build*RagContext()` and `ingestApproved*()`.
2. Create `<agent>-lesson-pipeline.ts` with `classifyFeedback()`, `ingest*Feedback()`, `Gateway*LessonStore`, and `build*EpisodicPattern/Summary()`.
3. In the action handler, call `build*RagContext()` before LLM generation and prepend `ragContext.contextBlock` to the system prompt.
4. After rejection/failure, call `ingest*Feedback()` with the feedback text.
5. After approval/success, call `ingestApproved*()` to feed the flywheel.
6. Add an entry to the table above in this file.
