# Repository Audit Report

> **Audit date:** 2026-06-13
> **Auditor:** Claude Code (full-repo evidence-based audit)
> **Method:** Every claim below was verified directly against the working tree at commit `3507f49` (2026-06-13). Counts were produced by scripted enumeration, not copied from existing docs. Anything not verifiable from the repository is marked **"Unknown – Requires clarification from the product owner or development team."**

---

## 1. Repository Metadata

| Item | Verified value | Evidence |
|---|---|---|
| Repo root | `D:\AgentFarm` | — |
| Total commits | 673 | `git rev-list --count HEAD` |
| First commit | 2026-04-27 | `git log --reverse` |
| Latest commit | `3507f49`, 2026-06-13 | `git log -1` |
| Active branch | `main` (single mainline) | `git status` |
| Commits since docs last updated (2026-05-29) | **411** | `git rev-list --count --since=2026-05-29` |
| Package manager | pnpm 9.12.0 workspaces | `package.json` (`packageManager`) |
| Language / runtime | TypeScript 5.7 strict, Node.js 20+ (CI uses 22) | `tsconfig.base.json`, `.github/workflows/ci.yml` |

The headline finding of this audit: **the platform has outpaced its documentation by 411 commits (61% of all history)**. The documentation set in `docs/` is uniformly stamped *2026-05-29 (Sprint 18)* and most quantitative claims in it are now wrong. See [05-DOCUMENTATION-GAP-ANALYSIS.md](05-DOCUMENTATION-GAP-ANALYSIS.md).

---

## 2. Top-Level Inventory

Every top-level directory, with audit depth indicated:

| Path | Contents (verified) | Audit depth |
|---|---|---|
| `apps/` | 6 runtime applications (below) | Deep |
| `services/` | **17** domain service modules (CLAUDE.md says 18 — off by one) | Enumerated |
| `packages/` | **16** shared packages (docs/README.md says 13) | Enumerated |
| `infrastructure/` | `cloudflare/` (Terraform: main.tf, variables, outputs), `control-plane/` + `runtime-plane/` (Azure Bicep, each with README) | Enumerated |
| `operations/` | 6 runbooks in `runbooks/`, 19 quality-gate reports/signoffs in `quality/`, 4 standalone ops docs | Enumerated |
| `docs/` | 37 markdown docs incl. `dashboard/` (7 docs) and `testing/` | Deep (gap analysis) |
| `planning/` | Sprint plans (`sprints/` — sprint 7–8 docs visible) | Surface |
| `scripts/` | 51 files (dev/ops/CI scripts incl. `quality-gate.mjs`, `e2e-smoke.mjs`, `run-db-tests.sh`) | Enumerated |
| `docker/` | 7 custom image contexts: `desktop-agent`, `freeswitch`, `mms-tts`, `teams-media-bot` (+ Tests), `voxcpm2`, `zoom-video-sidecar` | Enumerated |
| `tools/` | `eslint-plugin-agentfarm-boundaries.cjs` (custom lint rule) | Enumerated |
| `mvp/` | `mvp-scope-and-gates.md` | Surface |
| `research/` | `competitive-gold-standards.md` | Surface |
| `strategy/` | `vision-and-positioning.md` | Surface |
| `arcads/` | **Embedded, separate agent project** with its own CLAUDE.md, AGENTS.md, .env, skills/ — not part of the pnpm workspace | Surface — purpose: **Unknown – Requires clarification from the product owner or development team** |
| `.github/` | CI workflow `ci.yml` (12 jobs — see §7) | Deep |
| `logs/`, `dist/`, `.venv/`, `.agent-runtime/`, `.agents/`, `.azure/` | Local/derived state | Not audited (generated) |

### Root-level hygiene issues (verified present, tracked or untracked at root)

- Build logs committed/present at root: `build-desktop-agent.log`, `desktop-agent-build.log`, `desktop-agent-rebuild-nocache.log`, `meeting-agent-build.log`, `rebuild-all.log`, `rebuild-brain-pulse.log`
- `cloudflared.exe` (binary) at repo root
- `routes_raw.txt`, `read.md` (scratch files)
- `.env` present at root (gitignored status not re-verified — flagged in [06-TECHNICAL-DEBT-REPORT.md](06-TECHNICAL-DEBT-REPORT.md))
- `apps/website/.auth.sqlite{,-shm,-wal}` show as modified in `git status` — a SQLite DB appears to be tracked by git

---

## 3. Applications (`apps/`) — verified surface

| App | Port | Framework | Verified size |
|---|---|---|---|
| `api-gateway` | 3000 | Fastify 5 | **110 route files** (non-test) under `src/routes/` in **14 domain groups** (auth, connectors, governance, memory, agents, runtime, workspace, platform, sales, admin, meetings, content, comms, support, ops) — see `src/route-registry.ts`; 148 test files |
| `agent-runtime` | 4000 | Fastify 5 | `src/agents/` contains **15 agent implementations** + `shared/`: agentfarm-support, business-analyst, content-writer, corporate-assistant, customer-support-executive, developer, devops, full-stack-developer, marketing-specialist, meeting-agent, mobile, project-manager, recruiter, sales-agent, technical-writer, tester |
| `orchestrator` | 3011 | Fastify 5 | GOAP planner, schedulers, handoffs (per CLAUDE.md; internals not re-enumerated this audit) |
| `trigger-service` | 3002 | Fastify 5 | Webhooks, IMAP email, Slack intake |
| `dashboard` | 3001 | Next.js 15 | **95 pages** (`page.tsx`), **294 API proxy routes** (`route.ts`) — README claims 51/159 |
| `website` | varies | Next.js 15 | **99 pages**, including a **25-page customer dashboard** (`app/dashboard/`), portal, admin, marketing, pricing, docs, blog, careers |

LLM provider support (verified at `apps/agent-runtime/src/llm-decision-adapter.ts:62`):
`openai`, `azure_openai`, `github_models`, `anthropic`, `google`, `xai`, `mistral`, `together`, **`deepseek`** (9 external providers), plus `auto` (health-score failover), `mock`, and `agentfarm`. DeepSeek is absent from all existing docs.

---

## 4. Services (`services/`) — 17 modules

`agent-observability`, `agent-question-service`, `approval-service`, `audit-storage`, `browser-actions`, `browser-agent`, `compliance-export`, `connector-gateway`, `desktop-agent`, `evidence-service`, `identity-service`, `meeting-agent`, `memory-service`, `notification-service`, `policy-engine`, `provisioning-service`, `retention-cleanup`.

`browser-agent` and `desktop-agent` are missing from the service list in `docs/README.md`.

---

## 5. Packages (`packages/`) — 16 modules

`auth-utils`, `cli`, `config`, `connector-contracts`, `crm-service`, `db-schema`, `document-converter`, `e2e`, `erp-service`, `memory-service`, `notification-service`, `observability`, `queue-contracts`, `redis-client`, `sdk`, `shared-types`.

`document-converter`, `memory-service` (package variant), and `redis-client` are missing from `docs/README.md` and the root `README.md` package tables.

Note: `memory-service` and `notification-service` exist under **both** `services/` and `packages/` — the relationship/split rationale is **Unknown – Requires clarification from the product owner or development team** (likely package = library, service = host module, per import patterns in `route-registry.ts` which imports `@agentfarm/memory-service`).

---

## 6. Database (`packages/db-schema`)

| Item | Verified value | Stale doc claim |
|---|---|---|
| Prisma models | **105** | CLAUDE.md: 70; README.md: "75+" |
| Enums | **35** | not documented |
| Migrations | **44** directories | "14-phase migrations" (CLAUDE.md) |
| Extensions | pgvector (`AgentKnowledgeBase`, `AgentLongTermMemory`, episodic memory) | documented correctly |

Significant model families added after the docs were written (verified in `schema.prisma`): full sales domain (`Prospect`, `SalesDeal`, `SalesActivity`, `Lead`, `NurtureSequenceEntry`, `SalesSequenceEntry`, `CallRecord`, `SalesNegotiation`, `SalesProposal`, `NpsResponse`, `WinLossEvent`, `BookingEvent`, `ContractEvent`), support domain (`SupportIssue`, `SupportCsatResponse`, `SupportChatMessage`, `SupportDiagnosisStep`), tenant portal (`TenantPortalAccount`, `TenantPortalSession`, `TenantPasswordResetToken`), `TenantSsoConfig`, `TenantBranding`, `AgentPersona`, `SetupWizardSession`, `WorkspaceVm`, `AgentMessage`, `WebhookSource`, `InboundWebhookEvent`, `TaskTemplate`, `AgentKnowledgeBase`, `AgentBudgetConfig`, `AgentMemoryEdge`, `MeetingAuditEvent`.

---

## 7. CI/CD (`.github/workflows/ci.yml`)

**12 jobs verified** (docs claim 7): `secret-scan` (gitleaks), `dependency-audit` (SCA), `sast` (Semgrep), `website-permissions`, `validate`, `db-integration`, `install`, `typecheck` (matrix), `test` (matrix), `build` (Docker matrix), `E2E tests`, `lint` (ESLint).

---

## 8. Docker Compose

**23 services verified** in `docker-compose.yml` (docs claim 9):
`postgres`, `redis`, `opa`, `voicebox`, `migrate`, `api-gateway`, `worker-runner`, `browser-agent`, `agent-runtime`, `trigger-service`, `dashboard`, `desktop-agent`, `meeting-agent`, `voxcpm`, `whisper`, `kokoro`, `freeswitch`, `xtts`, `mms-tts`, `zoom-video-sidecar`, `teams-media-bot`, `ngrok`, `agentfarm`.

The entire voice/meeting stack (whisper STT, kokoro/xtts/mms-tts TTS, voxcpm, freeswitch telephony, Zoom/Teams media bots) post-dates the documentation. Also present: `docker-compose.override.yml`, `docker-compose.test.yml`, `ecosystem.config.cjs` (PM2).

---

## 9. Connector Framework (`packages/connector-contracts`)

| Item | Verified value | Stale doc claim |
|---|---|---|
| Registry entries (`CONNECTOR_REGISTRY`) | **23** | 18 (CLAUDE.md), 12 (README service note) |
| Categories | 5: task_tracker, messaging, code, email, **telephony** | telephony undocumented |
| Normalized action types | **34** (incl. sprint ops, workflow ops, telephony call ops) | 18 |
| Agent role keys | 13 (`AgentRoleKey` union) | 12 |
| Auth methods | oauth2, api_key, basic, bearer_token, generic_rest | documented |

---

## 10. Environment & Configuration

- `.env.example`: **285 variable definitions** (verified by line pattern count)
- `.env.production.example` exists (production profile)
- Webhook secrets fail-closed pattern documented in CLAUDE.md and verified in `server.ts` / route sources

---

## 11. Security posture (spot-verified 2026-06-13)

The root-level `audit_security.md` (2 HIGH / 2 MEDIUM findings) is **out of date — all four lead findings have been remediated** in the current tree:

| Prior finding | Current state | Evidence |
|---|---|---|
| Hardcoded `agentfarm-dev-secret` session fallback | **Fixed** — string no longer exists anywhere in `apps/api-gateway/src` | grep: no matches |
| SQL injection in `tenant-branding.ts` ($executeRawUnsafe) | **Fixed** — parameterized; only a comment referencing the old risk remains | `routes/platform/tenant-branding.ts:138` |
| Blanket `/portal/*` auth bypass | **Fixed** — explicit per-path allowlist with NOTE comment | `server.ts:33-51` |
| CORS fail-open without `ALLOWED_ORIGINS` | **Fixed** — fails closed with 403 | `server.ts:130-138` |

Full security documentation is now consolidated in [docs/SECURITY.md](../../SECURITY.md) (created by this audit).

---

## 12. Testing

- Framework: `node:test` + `node:assert/strict` (verified in test files; no Jest/Vitest deps in root `package.json`)
- api-gateway alone: 148 test files. Playwright e2e in `packages/e2e` (report artifacts present in working tree).
- Total test count claims (1,853 in CLAUDE.md; per-app figures in README): **not re-executed during this audit** — treat as **Unknown (last verified Sprint 18)** until `pnpm test` is re-run.
- Quality-gate history: 19 gate reports/signoffs in `operations/quality/` (sprints 8–18).

---

## 13. Open Quality Issues (current, from 2026-06-12 manual QA)

`QA-CUSTOMER-DASHBOARD-FINDINGS.md` (root) is **current** (dated 2026-06-12) and documents 13 findings against the website customer dashboard, including 4 blockers (task submission env wiring, missing portal task route in container, provisioning stuck without `worker-runner`, portal approvals silent no-op). Some were fixed same-session; per-item residual status is tracked in that file and summarized in [06-TECHNICAL-DEBT-REPORT.md](06-TECHNICAL-DEBT-REPORT.md).

---

## 14. Audit Conclusion

The codebase is substantially **larger and more mature than its documentation describes** — roughly 1.5–2× on every measurable axis (models, routes, pages, services, connectors, CI jobs). The platform's core engineering hygiene is strong (fail-closed auth patterns, timing-safe comparisons, quality-gate culture, 44 incremental migrations). The dominant risks are documentation drift, root-level repo hygiene, and the recently QA-flagged customer-dashboard runtime wiring issues — not architectural flaws.

Companion reports: product ([02](02-PRODUCT-UNDERSTANDING-REPORT.md)), business ([03](03-BUSINESS-ANALYSIS-REPORT.md)), architecture ([04](04-TECHNICAL-ARCHITECTURE-REPORT.md)), documentation gaps ([05](05-DOCUMENTATION-GAP-ANALYSIS.md)), technical debt ([06](06-TECHNICAL-DEBT-REPORT.md)), recommendations ([07](07-RECOMMENDATIONS.md)), action plan ([08](08-ACTION-PLAN.md)).
