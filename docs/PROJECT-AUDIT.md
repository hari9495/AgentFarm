# AgentFarm — Complete Project Audit

**Date:** 2026-05-24  
**Platform:** Multi-tenant AI Agent Orchestration  
**Repo Root:** `D:\AgentFarm`  
**Total Files:** ~17,305 (excluding node_modules, .git, \_\_pycache\_\_, dist, .next, .pnpm-store, coverage)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Root-Level Configuration](#root-level-configuration)
3. [Documentation & Governance](#documentation--governance)
4. [GitHub Configuration](#github-configuration)
5. [Azure Deployment](#azure-deployment)
6. [Infrastructure](#infrastructure)
7. [Operations & Planning](#operations--planning)
8. [Scripts](#scripts)
9. [Arcads Skill Suite](#arcads-skill-suite)
10. [Applications (apps/)](#applications-apps)
    - [agent-runtime](#1-agent-runtime--core-execution-engine)
    - [api-gateway](#2-api-gateway--control-plane-api)
    - [dashboard](#3-dashboard--operator-dashboard)
    - [orchestrator](#4-orchestrator--multi-agent-coordinator)
    - [trigger-service](#5-trigger-service--event-ingestion)
    - [website](#6-website--public-marketing--portal)
11. [Services (services/)](#services-services)
12. [Packages (packages/)](#packages-packages)
13. [Data Layer](#data-layer)
14. [Environment Configuration](#environment-configuration)
15. [Docker Deployment](#docker-deployment)
16. [Build & Test Infrastructure](#build--test-infrastructure)
17. [Agent Roles](#agent-roles)
18. [Key Architectural Patterns](#key-architectural-patterns)
19. [File Count Summary](#file-count-summary)

---

## Executive Summary

AgentFarm is a production-grade, multi-tenant TypeScript monorepo (pnpm-managed) that orchestrates autonomous AI agents for enterprise workflows. The platform spans 6 core applications, 17 domain services, and 14 shared packages.

**Three-layer architecture:**

| Layer | Components |
|-------|-----------|
| Control Plane | API Gateway (Fastify, port 3000), Dashboard (Next.js 15, port 3001), Website (Next.js 15) |
| Execution Plane | Agent Runtime (Fastify, port 4000), Orchestrator (Fastify, port 3011), Trigger Service (Fastify, port 3002) |
| Data Layer | PostgreSQL (Prisma, 70+ tables) + Redis + Azure Blob Storage |

---

## Root-Level Configuration

### Top-Level Files

| File | Purpose |
|------|---------|
| `package.json` | Monorepo workspace declaration; pnpm v9.12.0; defines root scripts (build, dev, lint, test, typecheck, db migration, e2e smoke tests, quality gates) |
| `pnpm-workspace.yaml` | pnpm workspace globs: `apps/*`, `services/*`, `packages/*` |
| `.eslintrc.cjs` | ES2022 + Node environment; extends `eslint:recommended`; allows console |
| `.prettierrc` | Prettier code formatting (default config) |
| `.gitleaks.toml` | Secret scanning configuration for gitleaks CI integration |
| `.gitignore` | Standard ignores: dist/, .next/, node_modules/, .env |
| `.dockerignore` | Docker build excludes (node_modules, .env, coverage, dist) |
| `README.md` | Project overview, architecture diagram, monorepo structure, quick-start guide |
| `ARCHITECTURE.md` | Detailed system architecture, component interactions, data flow |
| `DESIGN.md` | Comprehensive design spec: agents, roles, connectors, approval workflows, memory system |
| `CHANGELOG.md` | Version history and release notes |
| `CONTRIBUTING.md` | Development workflow, commit conventions, testing requirements |
| `read.md` | Extended reference documentation (system inventory, API details, testing guides) |

### Environment & Docker

| File | Purpose |
|------|---------|
| `.env` | Local development secrets — not committed; generated from `.env.example` |
| `.env.example` | ~30 KB template with 100+ environment variables (API keys, Azure creds, LLM endpoints, database URLs) |
| `.env.production.example` | Minimal production env template (~5.7 KB) |
| `docker-compose.yml` | Multi-container stack: PostgreSQL, Redis, Trigger Service, Agent Runtime, Dashboard, Website, Orchestrator |
| `docker-compose.test.yml` | Test database and auxiliary services for CI |
| `docker/` | Desktop Agent and VoxCPM2 (voice) Dockerfiles |

---

## Documentation & Governance

### docs/ Directory (24 files)

| File | Purpose |
|------|---------|
| `ARCHITECTURE-FULL.md` | Extended architecture with all subsystems and data flows |
| `ARCHITECTURE.md` | High-level architecture overview |
| `AGENT_SYSTEM.md` | Agent definition, roles, and lifecycle management |
| `AGENT_ROLES.md` | Detailed role specifications (developer, sales, content-writer, etc.) |
| `API.md` | REST API overview and authentication |
| `API_REFERENCE.md` | Full REST API endpoint reference |
| `CONNECTOR_SYSTEM.md` | Connector architecture and integration points |
| `MCP_REGISTRY.md` | Model Context Protocol registry documentation |
| `DATA_MODEL.md` | Database schema overview and entity relationships |
| `MEMORY_SYSTEM.md` | Episodic + semantic memory architecture |
| `LANGUAGE_SYSTEM.md` | Language support and localization |
| `AUTH_SYSTEM.md` | Authentication, session, and authorization design |
| `DEPLOYMENT.md` | Deployment procedures (local, staging, production) |
| `TESTING.md` | Testing frameworks and conventions |
| `TEST_STRATEGY.md` | Testing strategy (unit, integration, E2E pyramid) |
| `DESKTOP_OPERATOR.md` | Desktop automation system documentation |
| `TRIGGER_SYSTEM.md` | External event ingestion (webhooks, email, Slack) |
| `PAYMENTS.md` | Billing and subscription management |
| `BRD.md` | Business requirements document |
| `IMPLEMENTATION_STATUS.md` | Feature completion matrix by sprint |
| `FILE_INVENTORY.md` | Full codebase file listing |
| `architecture-diagram.html` | Interactive architecture visualizer (browser-rendered) |
| `PROJECT-AUDIT.md` | *(this file)* |

---

## GitHub Configuration

### .github/

**Copilot & Development Instructions:**

| File | Purpose |
|------|---------|
| `copilot-instructions.md` | GitHub Copilot context for AI-assisted development |
| `instructions/azure-swa.instructions.md` | Static Web Apps deployment guidelines |
| `instructions/testing-quality-gates.instructions.md` | Quality gate enforcement rules |
| `instructions/typescript-monorepo.instructions.md` | Monorepo TypeScript conventions |

**Prompt Library (UI/UX Pro Max):**

| File | Purpose |
|------|---------|
| `prompts/ui-ux-pro-max/` | Design system prompt data for UI generation |
| `prompts/ui-ux-pro-max/data/*.csv` | 29 CSV datasets: charts, colors, icons, stacks, typography, UI reasoning patterns |
| `prompts/ui-ux-pro-max/core.py` | Core design prompt generation |
| `prompts/ui-ux-pro-max/design_system.py` | Design system prompt builder |
| `prompts/ui-ux-pro-max/search.py` | Design element search utility |

**CI/CD Workflows:**

| File | Purpose |
|------|---------|
| `workflows/ci.yml` | Main CI pipeline: linting, testing, type checking across all packages |
| `workflows/dashboard-ci.yml` | Dashboard-specific tests and Playwright E2E |
| `workflows/db-backup.yml` | Scheduled PostgreSQL backup to Azure Storage |
| `workflows/db-integration.yml` | Database integration tests with real PostgreSQL container |
| `workflows/lint-boundaries.yml` | Nx/ESLint import boundary enforcement |
| `workflows/website-swa.yml` | Azure Static Web Apps deployment for website |

---

## Azure Deployment

### .azure/

| File | Purpose |
|------|---------|
| `deployment-plan.md` | Step-by-step deployment procedures for each environment |
| `production-deployment-execution.md` | Production deployment checklist and evidence log |

---

## Infrastructure

### infrastructure/

| File | Purpose |
|------|---------|
| `control-plane/main.bicep` | Azure Bicep IaC: API Gateway, Database, Kubernetes control plane |
| `control-plane/README.md` | Control plane infrastructure guide |
| `runtime-plane/main.bicep` | Azure Bicep IaC: Agent Runtime execution plane VMs + networking |
| `runtime-plane/README.md` | Runtime plane infrastructure guide |

---

## Operations & Planning

### operations/

| File | Purpose |
|------|---------|
| `agentfarm-system-inventory.md` | System component inventory |
| `codebase-report.md` | Codebase metrics and analysis |
| `company-access-rollout.md` | Access control rollout plan |
| `quality/` | Quality gate reports (versions 8.1 through 18.1): `*-quality-gate-report.md`, `*-quality-gate-signoff.md`, `mvp-walkthrough-report.md`, `phase-1-signoff-evidence-2026-05-04.md`, `gate-out.txt` |

### planning/ (20+ files)

| File | Purpose |
|------|---------|
| `agentfarm-gap-matrix-current-vs-desired.md` | Feature gap analysis |
| `agentfarm-low-risk-migration-plan.md` | Migration strategy |
| `agentfarm-one-page-product-narrative.md` | Product vision summary |
| `architecture-decision-log.md` | Architecture Decision Records (ADRs) |
| `architecture-risk-register.md` | Risk assessment and mitigation |
| `BDD-agentfarm-mvp-2026-04-28.md` | Behavior-driven development specs for MVP |
| `BRD-agentfarm-mvp-2026-04-28.md` | Business requirements for MVP |
| `build-snapshot-*.md` | Build status snapshots (3 versions) |
| `developer-agent-*.md` | Developer agent implementation backlog, sprint board, walkthrough (4 docs) |
| `engineering-execution-design.md` | Execution framework design |
| `development-kickoff-plan.md` | Development kickoff checklist |

### research/ & strategy/ & mvp/

| File | Purpose |
|------|---------|
| `research/competitive-gold-standards.md` | Competitive analysis and benchmarking |
| `mvp/mvp-scope-and-gates.md` | MVP scope definition and success criteria |

---

## Scripts

### scripts/ (23 files)

**Database & Data:**

| File | Purpose |
|------|---------|
| `backfill-audit-replay-to-prisma.mjs` | Migrate audit events from old format to Prisma |
| `db-backup.sh` | PostgreSQL backup script |
| `db-restore.sh` | PostgreSQL restore script |

**Testing & Quality:**

| File | Purpose |
|------|---------|
| `quality-gate.mjs` | Quality gate enforcement (coverage, linting, type checks) |
| `run-db-tests.sh` | Database test runner |
| `coverage-threshold-check.mjs` | Code coverage validation (80% minimum) |
| `test-auth-e2e.mjs` | Auth end-to-end tests |
| `test-session-lookup.mjs` | Session lookup validation |

**Setup & Development:**

| File | Purpose |
|------|---------|
| `dev-setup.md` | Local development setup guide |
| `add-await.ps1` | Code migration: add missing await keywords |
| `add-edge-runtime.ps1` | Migration: add edge runtime declarations |
| `fix-edge-crypto.ps1` | Migration: fix Web Crypto API usage |
| `fix-json-casts.ps1` | Migration: fix JSON type casts |

**Integration & Deployment:**

| File | Purpose |
|------|---------|
| `e2e-smoke.mjs` | End-to-end smoke tests (full stack) |
| `e2e-integration.mjs` | Integration tests across services |
| `website-swa-verify.mjs` | Azure Static Web Apps post-deploy verification |
| `check-website-db.mjs` | Database health check for website |
| `create-dev-admin.mjs` | Create developer admin user (dev) |
| `create-customer-user.mjs` | Create customer user (dev) |
| `create-website-admin.mjs` | Create website admin user (dev) |

**Code Analysis:**

| File | Purpose |
|------|---------|
| `a4-contract-validation.mjs` | Contract version validation across services |
| `a4-import-boundary-check.mjs` | Import boundary enforcement |
| `graphify.mjs` | Dependency graph generation |

---

## Arcads Skill Suite

### arcads/ — AI Ad Campaign Generation

| File | Purpose |
|------|---------|
| `.claude/settings.json` | AI skill configuration |
| `.claude/skills/arcads-external-api/` | Video generation API integration |
| `prompting/` | Prompt templates for video analysis and cloning |
| `prompt-library/*.md` (12+ files) | Generation prompts for Seedance 2, Sora, Kling, UGC content |

---

## Applications (apps/)

---

### 1. agent-runtime — Core Execution Engine

**Location:** `apps/agent-runtime/`  
**Purpose:** Fastify server that executes autonomous agent tasks. Handles LLM routing, skill composition, browser/desktop automation, memory management, approval integration, and observability.  
**Port:** 4000

#### src/ — Core Execution (10 files)

| File | Purpose |
|------|---------|
| `runtime-server.ts` | Fastify server bootstrap, middleware stack, route registration, graceful shutdown |
| `execution-engine.ts` | Task execution coordination — receives `TaskEnvelope`, routes to handlers, writes results |
| `action-result-writer.ts` | Persist action results to database via Prisma |
| `action-observability.ts` | Action tracing: write audit log, emit telemetry spans |
| `action-result-contract.ts` | TypeScript type contracts for action results |
| `local-workspace-executor.ts` | Execute workspace actions (code, git, file I/O) in local VM context |
| `mcp-protocol-client.ts` | Client for MCP (Model Context Protocol) server communication |
| `mcp-registry-client.ts` | Query the MCP registry to discover available tools |
| `webhook-ingestion.ts` | Receive and route inbound webhook events |
| `agent-runtime-stubs.ts` | Stub implementations for testing |

#### src/ — Agent Intelligence (8 files)

| File | Purpose |
|------|---------|
| `agent-feedback.ts` | User feedback loop — collect, store, and apply feedback to future runs |
| `agent-message-client.ts` | Inter-agent messaging client (publish/receive between bots) |
| `autonomous-loop-orchestrator.ts` | Orchestrate autonomous task loop: wake, run, sleep, repeat |
| `autonomous-coding-loop.ts` | Developer agent coding loop: check CI, write code, commit, push, repeat |
| `multi-agent-orchestrator.ts` | Coordinate multi-agent workflows with handoffs |
| `intent-clarifier.ts` | Clarify ambiguous user intent before execution |
| `natural-language-parser.ts` | Parse natural language commands into structured task payloads |
| `system-prompt-builder.ts` | Construct role-specific system prompts from persona + role profile |

#### src/ — Task Planning & Routing (6 files)

| File | Purpose |
|------|---------|
| `task-planner.ts` | Decompose high-level tasks into ordered execution steps |
| `task-classifier.ts` | Classify task intent against role keywords and blocked action lists |
| `plan-executor.ts` | Execute decomposed plan steps sequentially with retry |
| `task-intelligence-memory.ts` | Learn from past task executions to improve future routing |
| `routing-history-advisor.ts` | Advise routing decisions based on historical outcomes |
| `llm-decision-adapter.ts` | Format LLM responses into structured decision objects |

#### src/ — Skills & Composition (7 files)

| File | Purpose |
|------|---------|
| `skill-pipeline.ts` | Execute sequential skill pipelines (e.g., `pr-quality-gate`) |
| `skill-scheduler.ts` | Cron-based skill scheduling with persistence |
| `skill-composition-engine.ts` | Dynamically compose skills from a DAG definition |
| `skill-execution-engine.ts` | Dispatch to individual skill handler functions |
| `skill-dependency-dag.ts` | Parse and validate skill dependency directed acyclic graphs |
| `skills-registry.ts` | Register and discover available skills by name |
| `wake-coalescer.ts` | Coalesce multiple wake signals to prevent redundant task runs |

#### src/ — Connectors & Integration (6 files)

| File | Purpose |
|------|---------|
| `connector-dispatcher.ts` | Route agent actions to the appropriate connector provider |
| `connector-health-monitor.ts` | Poll connector health and update status records |
| `connector-readiness-check.ts` | Verify connector health before task execution starts |
| `connector-token-resolver.ts` | Resolve and refresh connector OAuth tokens from encrypted store |
| `crm-hook.ts` | Integration hooks for CRM connector events |
| `erp-hook.ts` | Integration hooks for ERP connector events |

#### src/ — Memory & Context (6 files)

| File | Purpose |
|------|---------|
| `episodic-memory.ts` | Store and retrieve episodic memory (past task summaries) |
| `memory-context-injector.ts` | Inject relevant memory into LLM prompts before execution |
| `prisma-memory-store.ts` | Prisma-backed persistence for short-term and long-term memory |
| `persona-context-loader.ts` | Load agent persona from gateway with 60s in-process cache |
| `provider-state-persistence.ts` | Persist LLM provider selection state across task runs |
| `task-intelligence-memory.ts` | Learn routing patterns from task outcome history |

#### src/ — Browser & Desktop Automation (6 files)

| File | Purpose |
|------|---------|
| `browser-action-executor.ts` | Execute Playwright browser actions from action payloads |
| `desktop-agent-watchdog.ts` | Monitor desktop agent process health and restart on failure |
| `desktop-operator-factory.ts` | Factory: create desktop operator instance from config |
| `desktop-operator-playwright.ts` | Playwright-based desktop automation operator |
| `speaking-agent.ts` | Voice output generation for voice-enabled agents |
| `voicebox-client.ts` | Voicebox TTS API client |

#### src/ — LLM & Model Routing (7 files)

| File | Purpose |
|------|---------|
| `model-router.ts` | Route tasks to the appropriate LLM provider (OpenAI, Anthropic, Groq, etc.) |
| `llm-quality-tracker.ts` | Track output quality scores per provider per task type |
| `llm-prose-writer.ts` | LLM-backed long-form prose generation |
| `vision-service.ts` | Image analysis via vision-capable LLMs |
| `web-research-service.ts` | Web search and research tool wrapper |
| `sast-semantic-analyzer.ts` | Static analysis and semantic code understanding |
| `voxcpm2-client.ts` | VoxCPM2 TTS API client |

#### src/ — Observability & Audit (8 files)

| File | Purpose |
|------|---------|
| `runtime-audit-integration.ts` | Integrate with audit-storage service for action logging |
| `structured-telemetry-collector.ts` | Collect structured metrics and emit to OTEL endpoint |
| `cost-calculator.ts` | Compute cost per action from token usage and provider pricing |
| `effort-estimator.ts` | Estimate task effort in time/cost units |
| `confidence-scorer.ts` | Score action confidence from LLM response metadata |
| `code-review-learning.ts` | Learn from code review feedback to improve future PRs |
| `loop-learning-store.ts` | Store autonomous loop execution patterns for future optimization |
| `post-task-closeout.ts` | Post-execution cleanup: flush buffers, close connections |

#### src/ — Governance & Compliance (7 files)

| File | Purpose |
|------|---------|
| `role-enforcer.ts` | Enforce role-based permissions; block forbidden action types |
| `role-system-prompts.ts` | Role-specific system prompt fragments (augments persona) |
| `approval-service.ts` | Integrate with approval workflow: submit for review, await decision |
| `escalation-engine.ts` | Escalate tasks to human review when confidence is low |
| `disclosure-guard.ts` | Ensure agent disclosure statements are included in outbound messages |
| `outbound-disclosure.ts` | Append disclosure text to all outbound communications |
| `gdpr-email-footer.ts` | Append GDPR-required footer to agent-sent emails |

#### src/ — Evidence & Audit (6 files)

| File | Purpose |
|------|---------|
| `evidence-record-writer.ts` | Write evidence records (screenshots, action summaries) to storage |
| `evidence-assembler.ts` | Assemble evidence package for approval review |
| `evidence-record-contract.ts` | TypeScript contracts for evidence record shape |
| `notification-hook.ts` | Hook into notification service for task event alerts |
| `evaluator-webhook.ts` | Handle callbacks from external evaluator services |
| `provisioning-handler.ts` | Handle provisioning completion callbacks from API Gateway |

#### src/ — Advanced Features (6 files)

| File | Purpose |
|------|---------|
| `advanced-runtime-features.ts` | Feature flag evaluation and toggles |
| `budget-alert-emitter.ts` | Emit budget threshold alerts when cost limits are approached |
| `package-manager-service.ts` | Manage npm/pnpm dependency installations in workspace |
| `person-key-extractor.ts` | Extract person identifiers (email, name) from unstructured text |
| `repo-knowledge-graph.ts` | Build and query repository code knowledge graph |
| `voicebox-mcp-registrar.ts` | Register Voicebox as an MCP-compatible tool |

#### src/ — Workspace & Progress (4 files)

| File | Purpose |
|------|---------|
| `workspace-rate-limiter.ts` | Per-workspace rate limiting to prevent API abuse |
| `pre-task-scout.ts` | Pre-execution workspace reconnaissance (read files, check git state) |
| `task-progress-publisher.ts` | Publish task progress updates to SSE/Redis |
| `task-progress-reporter.ts` | Format and emit structured progress reports |

#### src/role-profiles/

| File | Purpose |
|------|---------|
| `index.ts` | Aggregate and export all role profiles (allowed connectors, MCP, prompts) |

#### src/agents/content-writer/ (21 files)

| File | Purpose |
|------|---------|
| `content-writer-agent-profile.ts` | Agent identity, name, capabilities declaration |
| `content-writer-action-handler.ts` | Route content-writer action types to handler functions |
| `content-writer-role-profile.ts` | Role capabilities, blocked keywords, MCP list |
| `content-writer-mcp-provisioner.ts` | Provision MCP tools needed for content writing |
| `content-writer-episodic-hooks.ts` | Memory hooks: persist content feedback and style learnings |
| `content-writer-persona-defaults.ts` | Default persona when no custom persona is configured |
| `content-workflow-engine.ts` | Orchestrate multi-step content workflows (research → draft → edit → publish) |
| `draft-builder.ts` | Generate initial draft from content brief using LLM |
| `brand-voice-learner.ts` | Learn and encode brand voice from sample content |
| `brief-parser.ts` | Parse and validate content brief input |
| `cms-publisher.ts` | Publish finished content to CMS (WordPress, Contentful, etc.) |
| `content-scheduler.ts` | Schedule content publication via calendar API |
| `seo-optimizer.ts` | Generate meta titles, descriptions, keyword recommendations |
| `fact-checker.ts` | Verify factual claims in drafts against known sources |
| `plagiarism-detector.ts` | Detect plagiarism in generated content |
| `image-sourcer.ts` | Find and embed relevant images (Unsplash, etc.) |
| `keyword-data-adapter.ts` | Integrate keyword research from external tools |
| `tone-adapter.ts` | Adapt content tone to target audience using LLM |
| `revision-handler.ts` | Apply editorial comments and revisions to drafts |
| `content-research-service.ts` | Research topics via web search before drafting |
| `llm-prose-writer.ts` | LLM prose generation with retry and quality checks |

#### src/agents/corporate-assistant/ (17 files)

| File | Purpose |
|------|---------|
| `corporate-assistant-agent-profile.ts` | Agent identity, name, capabilities |
| `corporate-assistant-action-handler.ts` | Route corporate-assistant action types to handlers |
| `corporate-assistant-role-profile.ts` | Role capabilities, blocked keywords |
| `corporate-assistant-mcp-provisioner.ts` | Provision MCP tools (Google Calendar, Outlook, Slack) |
| `corporate-assistant-episodic-hooks.ts` | Memory hooks: persist meeting summaries and follow-up tasks |
| `corporate-assistant-persona-defaults.ts` | Default persona when no custom persona is configured |
| `calendar-scheduler.ts` | Schedule meetings via Google Calendar / Outlook API |
| `email-composer.ts` | Draft and send emails via connected email provider |
| `meeting-summarizer.ts` | Summarize meeting transcripts into structured notes |
| `follow-up-tracker.ts` | Track and send follow-up emails/tasks after meetings |
| `standup-reporter.ts` | Generate standup summaries for distribution |
| `document-creator.ts` | Create documents in Google Docs or Office 365 |
| `contact-manager.ts` | Manage contacts in connected address book |
| `task-tracker.ts` | Create and update tasks in connected task managers |
| `agenda-builder.ts` | Build meeting agendas from context |
| `slack-notifier.ts` | Send notifications via Slack |
| `out-of-office-setter.ts` | Set out-of-office auto-replies |

#### src/agents/developer/ (1 file)

| File | Purpose |
|------|---------|
| `developer-role-profile.ts` | Developer agent role: allowed connectors, blocked keywords, action list |

#### src/agents/meeting-agent/ (multiple files)

| File | Purpose |
|------|---------|
| `meeting-audit-logger.ts` | Audit log for all meeting lifecycle events |
| `meeting-transcription.ts` | Integrate with voice transcription service |
| `meeting-audit-logger.test.ts` | Unit tests for audit logger |

#### src/agents/sales-agent/ (13 files)

| File | Purpose |
|------|---------|
| `sales-agent-profile.ts` | Agent identity and capabilities |
| `sales-action-handler.ts` | Route sales action types to handler functions |
| `prospect-finder.ts` | Find sales prospects from LinkedIn/web/CRM data |
| `outreach-orchestrator.ts` | Orchestrate multi-touch outreach sequences |
| `reply-classifier.ts` | Classify prospect replies (interested / not interested / question) |
| `sequence-scheduler.ts` | Schedule email sequence steps with delays |
| `email-personaliser.ts` | Personalize outreach emails using prospect research |
| `booking-invite-sender.ts` | Send calendar invites when prospect books a meeting |
| `pre-meeting-research.ts` | Research prospect before sales call |
| `email-provider.ts` | Email delivery interface (abstract) |
| `email-provider-factory.ts` | Factory: resolve email provider from connector config |
| `contract-sender.ts` | Send contracts via Zoho Sign / DocuSign |
| `deal-closer.ts` | Final deal-closing actions: generate proposal, get signature |
| `browser-executor.ts` | Execute browser automation tasks in sales context |

#### src/agents/technical-writer/ (multiple files)

| File | Purpose |
|------|---------|
| `technical-writer-agent-profile.ts` | Agent identity and capabilities |
| `technical-writer-action-handler.ts` | Route TW action types to handlers |
| `technical-writer-role-profile.ts` | Role capabilities and blocked keywords |
| `technical-writer-mcp-provisioner.ts` | Provision MCP tools (GitHub, file system, browser) |
| `technical-writer-episodic-hooks.ts` | Memory hooks: persist doc feedback and style notes |
| `technical-writer-persona-defaults.ts` | Default persona |
| `product-interactor.ts` | Browser/UI discovery of product features for documentation |
| `sme-interview-builder.ts` | Build SME interview questions from code/diff context |
| `doc-diff-applier.ts` | Apply diffs from code changes to existing documentation |
| `accuracy-verifier.ts` | Verify generated docs against actual product behavior |
| `api-doc-synthesizer.ts` | Generate OpenAPI/Swagger documentation from source |
| `changelog-writer.ts` | Generate CHANGELOG entries from git history |
| `style-guide-enforcer.ts` | Enforce style guide rules on generated docs |

#### src/agents/tester/ (multiple files)

| File | Purpose |
|------|---------|
| `tester-agent-profile.ts` | Agent identity, name, capabilities |
| `tester-action-handler.ts` | Route tester action types to handlers |
| `tester-episodic-hooks.ts` | Memory hooks: persist test failure patterns |
| `tester-edit-guard.ts` | Guard: prevent tester agent from modifying non-test files |
| `tester-exploration-engine.ts` | Explore codebase to find untested code paths |
| `tester-persona-defaults.ts` | Default persona |
| `tester-standup-builder.ts` | Build QA standup report from recent test runs |
| `tester-mcp-provisioner.ts` | Provision MCP tools for test execution |

---

### 2. api-gateway — Control Plane API

**Location:** `apps/api-gateway/`  
**Purpose:** Central REST API (Fastify); handles auth, billing, approvals, audit, agent provisioning, connector management, and all external-facing endpoints.  
**Port:** 3000

#### src/main.ts

Single server file: Fastify bootstrap, helmet security headers, rate limiting middleware, session/API-key auth preHandler, subscription guard, and registration of all 84 route groups.

#### src/routes/ — Route Groups

**auth/**

| File | Purpose |
|------|---------|
| `auth.ts` | User signup, login, logout, session management |
| `api-keys.ts` | Create, list, revoke long-lived API keys |
| `portal-auth.ts` | Portal-specific session auth (signup, login, logout, me) |
| `roles.ts` | Role management CRUD |
| `team.ts` | Team member invite, list, remove |
| `internal-login-policy.ts` | Internal allowed-domains and admin-role policy |

**admin/**

| File | Purpose |
|------|---------|
| `admin-provision.ts` | Manual agent provisioning trigger |
| `env-reconciler.ts` | Environment variable sync and reconciliation |
| `marketplace.ts` | Marketplace listing management (admin) |
| `portal-data.ts` | Portal data aggregation APIs |
| `onboarding-config.ts` | Onboarding configuration CRUD |
| `setup-wizard.ts` | Multi-step setup wizard flow |
| `status.ts` | System-wide status summary (admin view) |

**agents/**

| File | Purpose |
|------|---------|
| `agents.ts` | List, create, and configure agents |
| `agent-control.ts` | Start, stop, pause, resume agent processes |
| `agent-dispatch.ts` | Dispatch tasks to a specific agent |
| `agent-lifecycle.ts` | Create, update, delete, terminate agent lifecycle |
| `agent-messages.ts` | Retrieve agent message history |
| `agent-feedback.ts` | Submit user feedback on agent actions |
| `bot-versions.ts` | List and restore agent config versions |
| `personas.ts` | Agent persona configuration CRUD |
| `questions.ts` | Submit questions to agents; retrieve answers |
| `handoffs.ts` | Multi-agent handoff events API |

**runtime/**

| File | Purpose |
|------|---------|
| `runtime-tasks.ts` | Submit and retrieve tasks; task status |
| `runtime-llm-config.ts` | Configure LLM provider per workspace |
| `autonomous-loops.ts` | Configure and manage autonomous task loops |
| `skill-composition-execute.ts` | Execute a named skill composition |
| `skill-pipelines.ts` | CRUD for skill pipeline definitions |
| `skill-scheduler.ts` | Schedule skill pipeline runs |
| `wake-runs.ts` | Wake run scheduling and management |
| `sse-tasks.ts` | Server-Sent Events for task progress streaming |
| `task-queue.ts` | Task queue drain and management |
| `routine-scheduler.ts` | Recurring routine scheduling |
| `schedules.ts` | General schedule CRUD |
| `orchestration.ts` | Multi-agent orchestration run management |

**sales/**

| File | Purpose |
|------|---------|
| `deals.ts` | Deal CRUD and stage management |
| `outreach.ts` | Sales outreach sequence management |
| `prospects.ts` | Prospect list and enrichment |
| `leads.ts` | Lead CRUD and qualification |
| `sales-config.ts` | Sales agent configuration |
| `booking-webhook.ts` | Incoming booking confirmation webhooks |
| `contract-webhook.ts` | Incoming contract signing webhooks |
| `zoho-sign-webhook.ts` | Zoho Sign event webhooks |
| `browser-tasks.ts` | Browser automation task routing for sales |

**connectors/**

| File | Purpose |
|------|---------|
| `connector-auth.ts` | Connector OAuth initiation and callback |
| `connector-actions.ts` | Invoke connector actions (e.g., create GitHub issue) |
| `connector-health.ts` | Connector health check endpoints |
| `mcp-registry.ts` | MCP server registration and discovery |
| `adapter-registry.ts` | Connector adapter registry CRUD |
| `plugin-loading.ts` | External plugin loading (trusted publishers) |
| `outbound-webhooks.ts` | Outbound webhook subscription management |
| `webhooks.ts` | Inbound webhook receiver and routing |

**governance/**

| File | Purpose |
|------|---------|
| `approvals.ts` | Approval submit, decide, batch, escalate |
| `audit.ts` | Audit event query, export, session replay |
| `governance-kpis.ts` | Governance KPI dashboard data |
| `governance-workflows.ts` | Governance workflow CRUD |
| `kill-switches.ts` | Kill switch activation/deactivation |
| `circuit-breakers.ts` | Circuit breaker state management |
| `budget-policy.ts` | Budget policy CRUD |
| `retention-policy.ts` | Data retention policy CRUD |
| `disclosure.ts` | Agent disclosure configuration |
| `activity-events.ts` | Activity event stream |

**memory/**

| File | Purpose |
|------|---------|
| `memory.ts` | Episodic memory store and retrieval |
| `episodic-memory.ts` | Browse, search, redact episodic memory entries |
| `knowledge-base.ts` | Semantic knowledge base CRUD and RAG search |
| `knowledge-graph.ts` | Knowledge graph query API |
| `work-memory.ts` | Work-in-progress memory CRUD |
| `snapshots.ts` | Memory snapshot create and restore |

**workspace/**

| File | Purpose |
|------|---------|
| `desktop-actions.ts` | Desktop automation action API |
| `desktop-profile.ts` | Desktop agent profile configuration |
| `desktop-sessions.ts` | Desktop session management |
| `ide-state.ts` | IDE state synchronization |
| `workspace-session.ts` | Workspace session lifecycle |
| `pull-requests.ts` | PR draft and review management |
| `ci-failures.ts` | CI failure ingestion and tracking |
| `repro-packs.ts` | Reproduction pack creation |

**platform/**

| File | Purpose |
|------|---------|
| `billing.ts` | Subscription plans, invoices, usage |
| `analytics.ts` | Analytics dashboard data |
| `scheduled-reports.ts` | Scheduled report configuration and delivery |
| `ab-tests.ts` | A/B test configuration and results |
| `observability.ts` | Observability configuration |
| `notifications.ts` | Notification preference management |
| `language.ts` | Language and localization settings |
| `chat.ts` | Chat session management |

**routes root (unmoved):**

| File | Purpose |
|------|---------|
| `meetings.ts` | Meeting scheduling and management |
| `api-routes.test.ts` | Cross-domain integration tests |
| `sprint3-integration.test.ts` | Sprint 3 full-flow integration tests |
| `sprint4-integration.test.ts` | Sprint 4 full-flow integration tests |

#### src/lib/ — Shared Utilities (40+ files)

**Authentication & Authorization:**

| File | Purpose |
|------|---------|
| `session-auth.ts` | JWT session token generation, verification, payload extraction |
| `api-key-auth.ts` | API key (`af_*`) validation against database |
| `require-role.ts` | Fastify preHandler for role-based access control |
| `internal-login-policy.ts` | Parse and enforce internal login allowed-domains rules |
| `secret-store.ts` | Secret management (env + Azure Key Vault) |
| `password.ts` | Bcrypt password hashing and verification |
| `portal-session.ts` | Portal-specific session management |

**Rate Limiting & Quotas:**

| File | Purpose |
|------|---------|
| `rate-limit.ts` | Per-IP rate limiting with sliding window |
| `rate-limit-v2.ts` | Tenant-scoped rate limiting with Redis |
| `agent-rate-limit.ts` | Agent-specific action rate limits |
| `subscription-guard.ts` | Enforce billing subscription before processing requests |
| `usage-meter.ts` | Track and report per-tenant usage |

**Database & State:**

| File | Purpose |
|------|---------|
| `db.ts` | Prisma client singleton initialization |
| `task-queue.ts` | In-process task queue with Redis-backed drain |
| `task-dep-utils.ts` | Task dependency resolution utilities |
| `bot-versioning.ts` | Agent configuration versioning logic |

**Approval & Audit:**

| File | Purpose |
|------|---------|
| `approval-packet.ts` | Parse and format approval data packets |
| `audit-writer.ts` | Write audit log entries to database |
| `event-catalog.ts` | Registry of all audit event schemas and metadata |

**Integration & Adapters:**

| File | Purpose |
|------|---------|
| `provider-clients.ts` | LLM provider client factory (OpenAI, Anthropic, Groq, Gemini) |
| `managed-mcp-catalog.ts` | Catalog of built-in MCP server configurations |
| `connector-gateway.ts` | Proxy connector API calls with auth injection |
| `marketplace-service.ts` | Marketplace listing and install business logic |
| `hire-handler.ts` | Agent hiring flow logic |
| `orchestration-service.ts` | Multi-agent orchestration service layer |
| `wizard-step-validator.ts` | Validate individual setup wizard steps |
| `onboarding-knowledge-seed.ts` | Seed knowledge base on first onboarding |

**Infrastructure:**

| File | Purpose |
|------|---------|
| `azure-client.ts` | Azure SDK client factory (Compute, Network, Storage) |
| `vm-bootstrap.ts` | VM provisioning bootstrap sequence |
| `circuit-breaker.ts` | Circuit breaker pattern for external calls |
| `run-recovery-worker.ts` | Recover and retry failed task runs |

**Advanced Features:**

| File | Purpose |
|------|---------|
| `webhook-dispatcher.ts` | Route inbound webhooks to registered handlers |
| `webhook-verify.ts` | Verify webhook HMAC signatures |
| `salesforce-lead-sync.ts` | Sync leads with Salesforce CRM |
| `meeting-slack-notifier.ts` | Send meeting notifications via Slack |
| `validate.ts` | Zod-based input validation helpers |

#### src/services/ — Background Workers (20+ files)

| File | Purpose |
|------|---------|
| `provisioning-worker.ts` | Async processing of VM provisioning jobs |
| `provisioning-monitoring.ts` | Monitor provisioning SLA and emit stuck alerts |
| `payment-service.ts` | Stripe and Razorpay payment integration |
| `connector-health-worker.ts` | Periodic connector health checks |
| `connector-token-lifecycle-worker.ts` | Proactive OAuth token refresh before expiry |
| `contract-generator.ts` | Generate service contracts for deals |
| `nurture-worker.ts` | Lead nurture campaign background worker |
| `sales-sequence-worker.ts` | Sales sequence step execution worker |
| `run-recovery-worker.ts` | Periodic recovery of stuck/failed task runs |
| `zoho-sign-client.ts` | Zoho Sign API client |
| `azure-provisioning-steps.ts` | Ordered Azure provisioning step execution |

---

### 3. dashboard — Operator Dashboard

**Location:** `apps/dashboard/`  
**Purpose:** Next.js 15 internal operations dashboard with 51 pages and 159 proxy API routes.  
**Port:** 3001

#### app/ Pages (51 top-level pages)

| Page | Purpose |
|------|---------|
| `activity/` | Agent activity log |
| `adapters/` | Connector adapter management |
| `agent-chat/` | Chat interface with agents |
| `agents/` | Agent list and management |
| `agents/[botId]/` | Agent detail view |
| `analytics/` | Analytics dashboard |
| `approvals/` | Approval queue management |
| `audit/` | Audit log browser |
| `billing/` | Billing and subscription management |
| `circuit-breakers/` | Circuit breaker monitoring |
| `connectors/` | Connector OAuth management |
| `desktop/` | Desktop automation monitoring |
| `disclosure/` | Disclosure configuration |
| `escalation/` | Escalation queue |
| `governance/` | Governance dashboard |
| `handoffs/` | Agent handoff monitoring |
| `knowledge/` | Knowledge base management |
| `marketplace/` | Agent marketplace |
| `memory/` | Agent memory browser |
| `notifications/` | Notification settings |
| `onboarding/` | Onboarding wizard |
| `policies/` | Approval policy management |
| `provisioning/` | Provisioning status monitor |
| `repro-packs/` | Reproduction pack management |
| `roles/` | Role configuration |
| `schedules/` | Skill and routine scheduling |
| `settings/` | Workspace settings |
| `skills/` | Skill library |
| `team/` | Team management |
| `workspace/` | Workspace management |
| *(and 21+ more pages)* | |

#### app/api/ Routes (159 routes)

**Key route groups:** agents (10+ subroutes), analytics, approvals (6 subroutes), audit (4 subroutes), auth, billing, marketplace, memory, notifications, provisioning, workspace

#### E2E Tests

| File | Purpose |
|------|---------|
| `scripts/mobile-drawer-e2e.mjs` | Mobile drawer interaction test |
| `scripts/workspace-tab-e2e.mjs` | Workspace tab navigation test |

---

### 4. orchestrator — Multi-Agent Coordinator

**Location:** `apps/orchestrator/`  
**Purpose:** GOAP-based multi-agent orchestration; routine/task scheduling, handoff management.  
**Port:** 3011

#### src/

| File | Purpose |
|------|---------|
| `main.ts` | Fastify server bootstrap and route registration |
| `task-scheduler.ts` | Schedule individual tasks across agent pools |
| `routine-scheduler.ts` | Schedule recurring routines with cron expressions |
| `orchestrator-state-store.ts` | Persist orchestrator state (run history, active plans) |
| `agent-handoff-manager.ts` | Manage agent-to-agent handoffs in multi-step workflows |

---

### 5. trigger-service — Event Ingestion

**Location:** `apps/trigger-service/`  
**Purpose:** Ingest external events (webhooks, email via IMAP, Slack messages) and forward them as structured tasks to Agent Runtime.  
**Port:** 3002

#### src/

| File | Purpose |
|------|---------|
| `main.ts` | Fastify server and event routing bootstrap |
| `webhook-receiver.ts` | Receive and validate inbound webhook events |
| `email-ingestion.ts` | IMAP polling for inbound emails |
| `slack-handler.ts` | Slack Bolt message handler |
| `task-forwarder.ts` | Format events as `TaskEnvelope` and dispatch to agent-runtime |

---

### 6. website — Public Marketing & Portal

**Location:** `apps/website/`  
**Purpose:** Next.js 15 public marketing site, customer signup, portal, and onboarding flows.  
**Deployment:** Azure Static Web Apps (production), Cloudflare Workers (alternative)

#### Key Tech

| Technology | Use |
|-----------|-----|
| Next.js 15, React 19 | SSR/SSG framework |
| Tailwind CSS 4 | Styling |
| Stripe, Razorpay | Payment processing |
| Three.js + @react-three/fiber | 3D graphics (hero section) |
| Motion, Framer Motion | Animations |
| `opennextjs-cloudflare` | Cloudflare Workers deployment adapter |

#### app/ Pages

| Page | Purpose |
|------|---------|
| Landing page | Marketing homepage |
| `/pricing` | Pricing plans |
| `/features` | Feature showcase |
| `/signup` | Customer signup |
| `/portal/` | Post-signup customer portal |
| `/onboarding/` | Onboarding flow |
| `/docs/` | Public documentation |

#### tests/

| File | Purpose |
|------|---------|
| `permissions.test.ts` | Permission enforcement tests |
| `approvals-flow.test.ts` | Approval workflow tests |
| `deployments-flow.test.ts` | Deployment flow tests |
| `signup-flow.test.ts` | Signup process tests |
| `session-auth.test.ts` | Session authentication tests |
| `marketplace-hire-flow.test.ts` | Agent marketplace hire flow tests |
| `evidence-compliance.test.ts` | Compliance evidence tests |
| `provisioning-worker.test.ts` | Provisioning worker tests |
| `provisioning-progress-ui.test.ts` | Provisioning UI progress tests |

---

## Services (services/)

### agent-observability

**Purpose:** Intercept agent actions, write audit logs, capture screenshots, score correctness  
**Exports:** Action interception middleware, audit writer, screenshot capture

### agent-question-service

**Purpose:** Async human-in-the-loop Q&A — park questions, await human response, resume task  
**Exports:** Question parking, human response retrieval

### approval-service

**Purpose:** Approval batching, kill-switch enforcement, governance workflow management  
**Exports:** Approval enforcement, batch processing, kill-switch API

### audit-storage

**Purpose:** Azure Blob screenshot upload; evidence artifact persistence  

| File | Purpose |
|------|---------|
| `src/azure-blob-storage.ts` | Azure Blob Storage client wrapper |
| `src/screenshot-uploader.ts` | Upload screenshots to Blob with structured paths |
| `src/types.ts` | Storage type definitions |
| `src/index.ts` | Service exports |

### browser-actions

**Purpose:** Playwright browser action helpers (web navigation, click, form fill)  
**Exports:** Web action execution helpers, action result schema

### browser-agent

**Purpose:** Python Flask + Playwright browser automation service  
**Files:** `app.py` (Flask app), `requirements.txt`, `package.json` (stub)

### compliance-export

**Purpose:** Compliance data export (JSON/CSV) with 365/730-day retention  
**Exports:** Export formatters, retention manager, audit report generator

### connector-gateway

**Purpose:** Connector adapters for Slack, GitHub, Linear, Jira, Salesforce, HubSpot, etc.  
**Exports:** Connector factory, adapter implementations, OAuth flow helpers

### desktop-agent

**Purpose:** Python-based desktop automation using Playwright + Whisper voice recognition  
**Files:** `app.py` (main service), `requirements.txt`, `Dockerfile`, `package.json` (stub)

### evidence-service

**Purpose:** HNSW vector index for evidence retrieval; KPI scoring  
**Exports:** Evidence search engine, KPI calculator

### identity-service

**Purpose:** Identity resolution and lookup service  
**Exports:** Identity lookup helpers

### meeting-agent

**Purpose:** Meeting lifecycle management, voice transcription, note-taking  
**Exports:** Meeting orchestrator, transcription integration, note formatter

### memory-service (package)

**Purpose:** Agent memory store (short-term + long-term vector)  
**Exports:** Memory store, `createEmbedFn` (embedding function factory)

### notification-service

**Purpose:** Multi-channel notification dispatcher (email, Slack, webhook)  
**Exports:** Notification adapter contracts, dispatch helpers

### policy-engine

**Purpose:** Governance routing policy evaluator  
**Exports:** Policy evaluator, routing decision logic

### provisioning-service

**Purpose:** Azure VM/container provisioning job processor  
**Exports:** Job processor, provisioning orchestrator, step tracker

### retention-cleanup

**Purpose:** Scheduled retention cleanup job (delete old audit events, evidence per policy)  
**Exports:** Cleanup job executor, policy evaluator

---

## Packages (packages/)

### shared-types

**Purpose:** Centralized TypeScript type definitions shared by all services  

| File | Purpose |
|------|---------|
| `autonomous-loop.ts` | Autonomous task loop type definitions |
| `adapter-registry.ts` | Adapter registry schema |
| `connector-status.ts` | Connector health status schema |
| `hire-contract.ts` | Agent hiring contract types |
| `vm-lifecycle-contracts.ts` | VM provisioning contract types |
| `audit-ids.ts` | Audit event ID schema |
| `billing-metering.ts` | Usage metering types |
| `browser-audit.ts` | Browser action audit schema |
| `desktop-agent-contracts.ts` | Desktop agent protocol contracts |
| `desktop-session.ts` | Desktop session state schema |
| `desktop-operator.ts` | Desktop operator interface |
| `episodic-memory.ts` | Episodic memory event schema |
| `semantic-memory.ts` | Vector memory schema |
| `crm.ts` | CRM data types |
| `erp.ts` | ERP data types |
| `notification.ts` | Notification types |
| `persona.ts` | Agent persona schema |
| `provider-failover.ts` | LLM provider failover logic types |
| `retention-policy.ts` | Data retention rule types |
| `role-enforcement.ts` | Role permission schema |
| `task-plan.ts` | Task planning schema |
| `governance-kpis.ts` | Governance metrics schema |
| `skill-composition.ts` | Skill composition definition schema |
| `setup-wizard.ts` | Onboarding wizard flow types |
| `storage-paths.ts` | Azure Blob storage path conventions |
| `telemetry.ts` | Telemetry event schema |
| `contract-compatibility.test.ts` | Contract version compatibility tests |

### db-schema

**Purpose:** Prisma schema and migrations; PostgreSQL data model

**`prisma/schema.prisma`** (2,092 lines, 70+ tables)

| Category | Tables |
|----------|--------|
| Multi-tenancy | Tenant, TenantUser, Workspace |
| Bot/Agent | Bot, AgentPersona, BotCapabilitySnapshot, BotConfigVersion |
| Runtime | RuntimeInstance, ProvisioningJob, WorkspaceVm, WorkspaceSession |
| Memory | AgentShortTermMemory, AgentLongTermMemory, AgentSession |
| Task/Execution | OrchestrationRun, ScheduledJob, TaskDependency, ActionRecord, ActionResult |
| Approval/Governance | Approval, ApprovalPolicy, ApprovalGate, RoleEnforcement, RoleProfile |
| Audit/Compliance | AuditEvent, ActivityEvent, AuditRetentionPolicy, BrowserActionEvent, BrowserAuditSession |
| Connectors | ConnectorConfig, ConnectorToken, ConnectorHealth, ConnectorAuthMetadata |
| Marketplace | MarketplaceInstall, MarketplaceHire |
| Communication | ChatSession, ChatMessage, AgentMessage, QuestionParking, HumanResponse |
| Evidence | EvidenceRecord, NotificationEvent, BackfillRun |

**`prisma/migrations/`** — Version-controlled schema migration files

### auth-utils

**Purpose:** JWT/HMAC auth helpers, session management  
**Exports:** Session building, verification, role checking

### cli

**Purpose:** Developer CLI tooling for local development and admin tasks

### config

**Purpose:** Shared configuration utilities and environment constants

### connector-contracts

**Purpose:** TypeScript type contracts for all connectors (Slack, GitHub, Linear, Jira, Salesforce, HubSpot)

### crm-adapters

**Purpose:** CRM integration adapter implementations (Salesforce, HubSpot, Zoho CRM)

### erp-adapters

**Purpose:** ERP integration adapter implementations (SAP, Oracle, NetSuite)

### e2e

**Purpose:** End-to-end test utilities, fixtures, and helpers

### notification-adapters

**Purpose:** Shared notification adapter contracts (email, Slack, webhook, push)

### observability

**Purpose:** Shared OpenTelemetry/OTEL instrumentation helpers  
**Exports:** `initObservability()` — initializes tracing, metrics, logging; Azure Monitor exporter

### queue-contracts

**Purpose:** Message queue type contracts (for Slack, webhooks, event bus)

### redis-client

**Purpose:** Shared Redis client wrapper with connection pooling and type safety

### sdk

**Purpose:** Public AgentFarm SDK for external integrations and customer automation

### memory-service

**Purpose:** Agent memory store with short-term and long-term vector memory  
**Exports:** Memory store interface, `createEmbedFn` (creates embedding function from Azure OpenAI config)

---

## Data Layer

### PostgreSQL Schema — Key Tables

| Table | Purpose |
|-------|---------|
| `Tenant` | Top-level tenant (company/organization) |
| `TenantUser` | User belonging to a tenant |
| `Workspace` | Isolated environment within a tenant |
| `Bot` | Agent instance (role, status, container port) |
| `AgentPersona` | Display name, email, avatar, communication style per agent |
| `RuntimeInstance` | Deployed agent runtime (endpoint, heartbeat) |
| `ProvisioningJob` | VM/container provisioning job lifecycle |
| `AgentSession` | Individual agent work session |
| `ActionRecord` | Every action taken by an agent (type, parameters, timestamp) |
| `ActionResult` | Outcome of each action (success, output, cost, duration) |
| `Approval` | Approval request lifecycle (status, approver, decision reason) |
| `AuditEvent` | Immutable audit log of all significant events |
| `ConnectorConfig` | External connector configuration per workspace |
| `ConnectorToken` | Encrypted OAuth tokens for connectors |
| `ChatSession` | Chat session between user and agent |
| `AgentMessage` | Inter-agent message (from/to botId) |
| `EvidenceRecord` | Evidence artifacts (screenshots, summaries) linked to approvals |
| `ScheduledJob` | Cron-scheduled task definitions |
| `AgentLongTermMemory` | Long-term vector memory entries per agent |

---

## Environment Configuration

### .env.example — 100+ Variables

| Category | Key Variables |
|----------|--------------|
| Database | `DATABASE_URL`, `REDIS_URL` |
| Azure | `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `APPLICATIONINSIGHTS_CONNECTION_STRING`, `AZURE_STORAGE_ACCOUNT` |
| LLM Providers | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `OLLAMA_BASE_URL` |
| Connectors | `GITHUB_TOKEN`, `SLACK_BOT_TOKEN`, `LINEAR_API_KEY`, `JIRA_API_TOKEN`, `SALESFORCE_CLIENT_ID`, `HUBSPOT_API_KEY` |
| Payments | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` |
| Voice/TTS | `VOICEBOX_API_KEY`, `VOICEBOX_WORKSPACE_ID`, `VOXCPM2_ENDPOINT` |
| Security | `JWT_SECRET`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `OPS_MONITORING_TOKEN` |
| Observability | `OTEL_EXPORTER_OTLP_ENDPOINT`, `LOG_LEVEL`, `API_REQUIRE_AUTH` |
| Features | `ENABLE_AUDIO_PROCESSING`, `ENABLE_POLICY_ENGINE`, `FEATURE_EXTERNAL_PLUGIN_LOADING` |
| Services | `GATEWAY_URL`, `AGENT_RUNTIME_URL`, `TRIGGER_SERVICE_URL`, `INTERNAL_SERVICE_TOKEN` |

---

## Docker Deployment

### docker-compose.yml Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `postgres` | postgres:15 | 5432 | Primary database |
| `redis` | redis:7 | 6379 | Caching and rate limit state |
| `trigger-service` | local build | 3002 | Event ingestion |
| `agent-runtime` | local build | 4000 | Task execution |
| `dashboard` | local build | 3001 | Operator dashboard |
| `website` | local build | 3000 | Public marketing + portal |
| `orchestrator` | local build | 3011 | Multi-agent coordination |

---

## Build & Test Infrastructure

### GitHub Actions Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | PR + push to main | Lint, typecheck, test all packages; coverage thresholds |
| `dashboard-ci.yml` | PR affecting dashboard | Next.js build, E2E Playwright tests |
| `db-integration.yml` | PR affecting db-schema | PostgreSQL migration tests |
| `website-swa.yml` | Push to main | Build and deploy to Azure Static Web Apps |
| `db-backup.yml` | Cron: daily | PostgreSQL dump to Azure Blob |
| `lint-boundaries.yml` | PR | ESLint import boundary enforcement |

### Coverage Requirements

| Area | Threshold |
|------|-----------|
| Lines | 80% minimum |
| Key modules (execution-engine, approval-service) | 85%+ |
| API routes | 75%+ |

---

## Agent Roles

The system implements 8 specialized agent roles:

| Role | Key Capabilities |
|------|-----------------|
| Developer | Code generation, PR review, CI/CD automation, GitHub issue management |
| Sales | Prospect outreach, deal closing, CRM updates, contract sending |
| Content Writer | Blog/docs generation, SEO, CMS publishing, brand voice |
| Corporate Assistant | Meeting scheduling, email, follow-up, document creation |
| Technical Writer | API docs, runbooks, changelog, knowledge base |
| Tester | Test generation, QA automation, CI integration |
| Meeting Agent | Voice transcription, note-taking, action item extraction |
| *(future roles defined in docs)* | |

**Each role has:**
- `*-agent-profile.ts` — Agent identity and capabilities declaration
- `*-role-profile.ts` — Role system prompt, blocked keywords, allowed connectors
- `*-mcp-provisioner.ts` — MCP server provisioning for the role
- `*-episodic-hooks.ts` — Memory persistence hooks
- `*-action-handler.ts` — Action type routing

---

## Key Architectural Patterns

### Multi-Tenancy
Every Prisma model has `tenantId`. All queries filter by tenant. Session tokens carry tenant scope.

### Event Sourcing
Audit events are immutable append-only records. `ActionRecord` stores parameters; `ActionResult` stores outcomes. No hard deletes on audit data (retention policies mark for deletion).

### Skill Composition
Agents compose named pipelines (e.g., `pr-quality-gate` = size-enforcer → commit-linter → type-coverage → pr-description-generator). Pipelines are runtime-configurable and executed by `skill-pipeline.ts`.

### GOAP Orchestration
Multi-agent workflows use Goal-Oriented Action Planning with A* search. The Orchestrator plans agent task sequences and manages handoffs.

### Governance
All agent actions are audited. Key actions require pre-approval. Approval batching groups similar actions. Kill switches halt agents immediately. Circuit breakers prevent cascading failures.

### Connector Abstraction
External integrations are pluggable adapters with: OAuth/API key auth, health monitoring, token lifecycle management, and action routing to provider APIs.

---

## File Count Summary

| Directory | Key Source Files |
|-----------|-----------------|
| `apps/agent-runtime/src/` | ~120 TypeScript files |
| `apps/api-gateway/src/` | ~160 TypeScript files (80 routes, 40 lib, 20 services) |
| `apps/dashboard/app/` | ~210 TypeScript/TSX files (51 pages, 159 API routes) |
| `apps/orchestrator/src/` | ~20 TypeScript files |
| `apps/trigger-service/src/` | ~15 TypeScript files |
| `apps/website/app/` | ~150 TypeScript/TSX files |
| `services/` (17 services) | ~200 files combined |
| `packages/` (14 packages) | ~150 files combined |
| `docs/` | 24 markdown files |
| `scripts/` | 23 script files |
| Root config & infra | ~50 files |
| **Total source files** | **~1,130** |
| Total including all assets, CSVs, docs | **~17,305** |
