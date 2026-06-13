# AgentFarm — Implementation Status

> **Source of truth** for what's actually shipped vs. planned in the codebase.
> Last updated: 2026-06-13 (full repository audit — agent-role section corrected; see [audit/2026-06-13/](audit/2026-06-13/README.md))
> Previous update: 2026-05-29 (Sprint 18 — Content Writer Gap Closure)
>
> ⚠ Sections other than "Agent Roles" below still reflect Sprint 18 state. 411 commits have landed since; the audit reports carry the verified current inventory (105 DB models, 110 gateway route files, 23 connectors, 23 compose services, 12 CI jobs).

## Legend
- ✅ **Shipped** — code in `main`, typechecked, tested, used in the production task path.
- 🚧 **In progress** — partial implementation; some call-sites still bypass it.
- 📋 **Planned** — designed/specified but no production code yet.
- ⚠️ **Known gap** — identified weakness vs. human-equivalence baseline.

---

## Human-Equivalence Gap Tracker

All 6 gaps from the May audit — all shipped.

| # | Gap | Status | Notes |
|---|-----|--------|-------|
| 6 | Persona disclosure on every outbound channel | ✅ Shipped | `outbound-disclosure.ts` chokepoint applied in connector dispatcher and direct-API send-sites. EU AI Act Art. 52 / FTC / CA SB 1001 compliant. 12 unit tests. |
| 5 | Tester scoped patch ability (test-files only) | ✅ Shipped | `tester-edit-guard.ts` enforces test-file-only policy on `code_edit`/`code_edit_patch`. 18 unit tests covering TS/JS/Python/Go/Java. |
| 4 | Episodic memory for per-person context | ✅ Shipped | pgvector dual-indexed by `workspaceId` + `personKey`. `person-key-extractor.ts` extracts person from payload. `_episodic_person_context` injected into LLM prompt. GDPR: `clearPerson`. 18 unit tests. |
| 3 | Real-time PR review polling loop | ✅ Shipped | `workspace_pr_review_poll` action with MEDIUM_RISK gating. |
| 2 | Auto-generated tests + type-coverage | ✅ Shipped | `generateTestsWithLLM` + `runTypeCoverageWithTsc` wired into autonomous-loop-orchestrator. |
| 1 | Full desktop VM (noVNC) | ✅ Shipped | docker/desktop-agent (Xvfb + x11vnc + noVNC + vision loop). `NativeDesktopOperator` → gateway desktop-sessions proxy → dashboard `DesktopStreamPanel`. `workspace_visual_task` generic GUI dispatch. |

---

## Per-System Status

### Agent Runtime (`apps/agent-runtime`) — 1,120+ tests
- ✅ Task queue + execution loop
- ✅ Approval packet generation in `processOneTask`
- ✅ Post-change quality gate loop
- ✅ Risk-tier routing (HIGH / MEDIUM / LOW; confidence < 0.6 escalates)
- ✅ Per-role local-action allowlists (`LOCAL_WORKSPACE_ACTION_POLICY`)
- ✅ Persona context loader (`persona-context-loader.ts`) with 60s LRU cache + role fallback
- ✅ Outbound disclosure chokepoint (`outbound-disclosure.ts`)
- ✅ Episodic memory hooks (universal — workspace + per-person dual index)
- ✅ Semantic knowledge base pre-task recall (`_semantic_context`)
- ✅ Full desktop VM mode (`NativeDesktopOperator`)
- ✅ Role enforcer (`role-enforcer.ts`) + task classifier (`task-classifier.ts`)
- ✅ Tester edit guard (`tester-edit-guard.ts`)
- ✅ 12 role voice profiles seeded at startup
- ✅ Meeting participation loop (join → capture → transcribe → speak)
- ✅ Evaluator webhook (`evaluator-webhook.ts`)

### API Gateway (`apps/api-gateway`) — 1,237+ tests
- ✅ Approval routes with structured packet parser
- ✅ Persona CRUD routes (`/v1/personas/:botId`)
- ✅ Setup wizard routes (`/v1/setup-wizard`)
- ✅ Agent lifecycle routes (`/v1/agents/:botId/terminate`)
- ✅ Knowledge base routes (`/v1/knowledge-base/write`, `/v1/knowledge-base/search`)
- ✅ Desktop sessions proxy (`/v1/sessions`)
- ✅ Episodic memory browse + GDPR delete (`/v1/episodic-memory`)
- ✅ Disclosure routes (`/v1/disclosure/:botId`)
- ✅ Billing checkout (`/v1/billing/checkout-session`)
- ✅ Per-agent billing (`/v1/billing/metering/agent`)
- ✅ OAuth connector auth (Jira, GitHub, Teams, Email) with CSRF nonce + replay rejection

### Dashboard (`apps/dashboard`) — 118 tests
- ✅ Approval queue panel with structured packet detail drawer
- ✅ Agent persona settings panel (`app/settings/persona/page.tsx`)
- ✅ Disclosure settings panel with compliance badges
- ✅ Desktop stream panel (noVNC iframe + session controls)
- ✅ Episodic memory browser with GDPR delete
- ✅ Connector management page (OAuth connect/revoke)
- ✅ Per-agent billing card (`agent-billing-card.tsx`)
- ✅ Billing checkout page with Stripe redirect
- ✅ Decommission button wired to `POST /v1/agents/:botId/terminate`

### Connectors
- ✅ GitHub, Slack, Azure DevOps, Linear, Confluence, Notion, PagerDuty, Sentry, Email (SMTP/Graph)
- ✅ OAuth flows: Jira, GitHub, Teams, Email (Sprint 12)
- ✅ MCP protocol client (URL store + headers)
- 🚧 Jira, Teams, GitLab — OAuth connector implementation (connector-gateway) partially complete

### Agent Roles (corrected 2026-06-13 — all 15 implemented)

All agents below have an implementation directory under `apps/agent-runtime/src/agents/` with a RAG retriever and lesson pipeline (see the RAG coverage table in `CLAUDE.md`):

- ✅ `developer` — 12-tier actions, autonomous loop, PR review, CI triage, DB migration, dependency upgrade
- ✅ `tester` — Tier 20 testing tools (Selenium/Cypress/Appium/Playwright/k6/ZAP/Semgrep/TestRail/Zephyr)
- ✅ `technical-writer`
- ✅ `content-writer` — 10 capability modules (prose, research, SEO, CMS, images, tone, revisions, brand voice, scheduling)
- ✅ `corporate-assistant`
- ✅ `full-stack-developer` — note: known graceful-degradation gaps (never hard-fails; can mask failures — see tech-debt report)
- ✅ `business-analyst`
- ✅ `project-manager`
- ✅ `sales-agent` — full sales domain (Prospect, SalesDeal, SalesActivity, Lead, sequences, calls, proposals, negotiations, NPS, win/loss)
- ✅ `marketing-specialist`
- ✅ `recruiter`
- ✅ `customer-support-executive`
- ✅ `devops`
- ✅ `mobile`
- ✅ `agentfarm-support` — platform's own support agent (SupportIssue/CSAT/chat/voice)
- ✅ `meeting-agent` — voice-presence **sub-agent** (joins/transcribes/speaks in meetings; not a standalone sellable role)

### Memory
- ✅ Short-term memory (7-day TTL, per-workspace, Prisma-backed)
- ✅ Long-term behavioral memory (persistent, TTL + relevance ranking)
- ✅ Episodic memory (pgvector 1536-dim, dual-indexed, GDPR)
- ✅ Semantic knowledge base (pgvector, cosine similarity, pre-task recall)
- ✅ Work memory (per-workspace agent scratchpad)

### Compliance
- ✅ AI disclosure — EU AI Act Art. 52 / FTC / CA SB 1001
- ✅ Channel-aware formatting (email / slack / pr / meeting / chat)
- ✅ Disclosure audit trail (`GET /v1/disclosure/:botId/audit`)
- ✅ Meeting FSM: `speaking` state blocked until `disclosureAnnounced: true`
- ✅ Compliance export (JSON/CSV, 365-day active / 730-day archive retention)

### Billing
- ✅ Stripe checkout session (`/v1/billing/checkout-session`)
- ✅ `checkout.session.completed` webhook handler
- ✅ Razorpay payment webhook
- ✅ $0.10/task platform fee metering (`UsageMeteringEvent`)
- ✅ Per-agent billing breakdown (`/v1/billing/metering/agent`)
- 📋 Automated invoice generation + PDF delivery

### Infrastructure
- ✅ Control-plane Bicep templates (`infrastructure/control-plane`)
- ✅ Runtime-plane Bicep templates (`infrastructure/runtime-plane`)
- ✅ VM lifecycle manager (`provisionAgentVM` + `terminateAgentVM` via Azure ARM)
- 📋 Full azd deployment pipeline — pending Azure production sign-in

---

## How to update this file
1. Close a gap → flip the row to ✅.
2. Add a per-system bullet describing what shipped.
3. Reference test files, action types, or modules so the next reader can verify.
4. Stamp `Last updated:` at the top.
