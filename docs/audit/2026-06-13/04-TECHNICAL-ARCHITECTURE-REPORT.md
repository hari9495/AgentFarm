# Technical Architecture Report

> **Date:** 2026-06-13 · Verified against the working tree. This report covers what `docs/ARCHITECTURE.md` (2026-05-29) covers **plus everything added since** (voice stack, sales/support domains, portal, worker-runner). For deep subsystem detail, the existing per-system docs remain largely structurally accurate — their **counts** are what's stale (see gap analysis).

---

## 1. System Topology (verified, 2026-06-13)

```
                          Internet
                             │
        ┌────────────────────┼─────────────────────┐
        ▼                    ▼                     ▼
  Website (Next.js)    Dashboard (Next.js)    Inbound: webhooks/IMAP/Slack
  99 pages incl.       95 pages, 294 proxy         │
  customer dashboard   routes [X-Dashboard-Token]  ▼
  + portal             │                      Trigger Service (3002)
        │              │                           │
        └─────────►  API GATEWAY (3000) ◄──────────┘
                     Fastify · 110 route files · 14 domains
                     auth/sessions·billing·approvals·audit·governance
                     sales·support·portal·admin·memory·connectors
                             │ HMAC shared tokens per route group
        ┌────────────────────┼──────────────────────────┐
        ▼                    ▼                          ▼
  Agent Runtime (4000)  Orchestrator (3011)      worker-runner
  15 agents + shared    GOAP A* planner          (workers when
  9 LLM providers+auto  schedulers, handoffs      AF_WORKERS_DISABLED=1)
  12+ action tiers      proactive signals
        │
   ┌────┼──────────────────────────────────────────────────┐
   ▼    ▼            ▼              ▼            ▼          ▼
 LLM   23-connector  browser-agent  desktop-agent  Voice stack   OPA (8181)
 APIs  gateway       (Playwright)   (Xvfb/noVNC    whisper·kokoro
       (OAuth/mTLS)                  vision loop)  xtts·mms-tts·voxcpm
                                                   freeswitch·zoom-sidecar
                                                   teams-media-bot

  PostgreSQL 16 + pgvector (105 models) · Redis 7 · Azure Blob (audit-storage)
```

## 2. Layering & Code Organization

Three-layer monorepo (verified):

- **`apps/`** — 6 deployable processes. Each Fastify app uses a `src/route-registry.ts` single-registration-point pattern. Agent-runtime is internally layered: `agents/ · application/ · domain/ · infrastructure/ · platform/ · config/ · role-profiles/`.
- **`services/`** — 17 domain modules imported in-process by apps (not standalone containers), e.g. `approval-service`, `policy-engine`, `memory-service`, `provisioning-service` (11-step Azure VM state machine), `desktop-agent`, `browser-agent`.
- **`packages/`** — 16 shared libraries resolved by TS path aliases in dev (only `shared-types` ships `dist/`). Includes `db-schema` (Prisma), `connector-contracts` (23 connectors, 34 actions, 13 roles), `observability` (OTEL + Azure Monitor), `sdk`, `cli`, `redis-client`, `document-converter`.
- Boundary enforcement: custom ESLint rule `tools/eslint-plugin-agentfarm-boundaries.cjs`.

## 3. Identity & Auth Architecture

Verified in `apps/api-gateway/src/server.ts` and `routes/auth/`:

1. **Customer sessions** — HMAC-signed cookie (`API_SESSION_SECRET`, ≥32 chars enforced; dev-secret fallback removed). Payload: userId, tenantId, workspaceIds[], scope, expiresAt. Scope `customer` (browser/SSO) vs `internal` (machine-to-machine only).
2. **Portal accounts** — separate `TenantPortalAccount`/`TenantPortalSession` system for the customer portal; public paths are an explicit allowlist (`server.ts:33-51`), each `/portal/data/*` handler enforces its own portal session.
3. **SSO + MFA** — `routes/auth/sso.ts`, `routes/auth/mfa.ts`, `TenantSsoConfig`.
4. **Inter-service** — per-route-group HMAC shared tokens (APPROVAL_INTAKE, RUNTIME_TASK, RUNTIME_DISPATCH, RUNTIME_DECISION, CONNECTOR_EXEC), all `timingSafeEqual`.
5. **API keys** — SHA-256 hashed, `af_` prefix.
6. **Inbound webhooks** — fail-closed: secret set ⇒ signature required; secret absent ⇒ 503. 8 webhook secrets cataloged in CLAUDE.md.
7. **Rate limiting** — Redis-backed: 180 req/min/IP general, 20 req/min/IP auth, 600 req/min/tenant.
8. **CORS** — fails closed when `ALLOWED_ORIGINS` unset (`server.ts:130-138`).

## 4. Data Architecture

- **105 Prisma models, 35 enums, 44 migrations** — domains: identity/tenancy, agents/bots/personas, task execution, memory (4 kinds), billing/subscriptions, connectors/marketplace, governance/audit, communication/devtools, **sales** (13+ models), **support** (4 models), **portal** (3 models), provisioning/VMs.
- **pgvector** for episodic memory (1536-dim), `AgentKnowledgeBase`, `AgentLongTermMemory`; cosine distance `<=>`; HNSW index in evidence-service.
- Append-only audit (`AuditEvent`, `MeetingAuditEvent`), evidence bundles with TTL, retention policies with cleanup service.
- Tenant scoping rule: all queries scoped to `session.tenantId`; never accept tenantId from body (CLAUDE.md convention, enforced in route templates + auth-regression tests).

## 5. Execution & Orchestration

- **Task path:** intake → `POST /v1/runtime/tasks` → LLM planner → risk classification → LOW immediate / MED-HIGH approval queue → execute → evidence → evaluator webhook → RAG ingestion.
- **LLM dispatch:** `llm-decision-adapter.ts` (~3,300+ lines) — 9 external providers + `auto` mode with 5-min rolling health scores, per-profile priority lists, persisted cooldowns. **Note: this file's size makes it the single highest-complexity unit in the codebase** (see tech debt).
- **Action tiers:** file/shell/IDE/browser/desktop/meetings + Tier 20 (testing tools) + Tier 28 (content) per README; per-role allowlists (`LOCAL_WORKSPACE_ACTION_POLICY`), tester-edit-guard, role-enforcer.
- **Orchestrator:** GOAP A* planner, routine schedulers, wake coalescer, durable handoffs, autonomous loops.
- **Workers:** in-process in gateway by default; `AF_WORKERS_DISABLED=1` delegates to `worker-runner` container (compose service exists; QA found provisioning stalls when it isn't running — operational dependency to document).

## 6. Voice / Meetings / Desktop (newest subsystem, undocumented before this audit)

Verified from `docker-compose.yml` + `docker/`:
- **STT:** whisper, voicebox. **TTS:** kokoro, xtts, mms-tts, voxcpm (VoxCPM2).
- **Telephony:** FreeSWITCH + telephony connector category (twilio/vonage/amazon_connect/genesys) + call records/DTMF actions in contracts.
- **Meeting presence:** `zoom-video-sidecar`, `teams-media-bot` (with test project), meeting-agent service state machine, 12 role voice profiles, EU AI Act disclosure on first utterance.
- **Desktop:** `desktop-agent` container (Xvfb + x11vnc + noVNC), vision loop, dashboard DesktopStreamPanel, `ngrok` for tunneling.

## 7. Deployment & Infrastructure

- **Local/dev:** Docker Compose, 23 services; `docker-compose.override.yml`, `docker-compose.test.yml`; PM2 `ecosystem.config.cjs`.
- **Azure:** Bicep IaC for control-plane and runtime-plane (`infrastructure/`); provisioning-service drives per-workspace VM lifecycle (`WorkspaceVm`, 11-step state machine, SLA monitor); website on Azure SWA (verify script `scripts/website-swa-verify.mjs`); dev VM in South India (Logic Apps auto start/stop).
- **Cloudflare:** Terraform module (`infrastructure/cloudflare/`) — tunnel/SSL/CDN; `cloudflared.exe` present at root.
- **CI:** 12 GitHub Actions jobs — security trio (gitleaks, SCA, Semgrep) + validate/typecheck/test matrices + Docker build + Playwright E2E + ESLint.
- **Observability:** OTEL + Azure Monitor (`packages/observability`), Pino with secret redaction, healthchecks on all runtime containers.

## 8. Architectural Strengths

1. Single control-plane entry (gateway owns auth/billing/audit/writes) — clean trust boundary.
2. Fail-closed defaults now consistent (CORS, webhooks, portal allowlist).
3. Registry patterns (routes, connectors, agents) make growth additive.
4. Per-agent RAG standardization — 15 agents share one architecture.
5. Migration discipline — 44 incremental migrations, no destructive resets evident.

## 9. Architectural Concerns

1. **`llm-decision-adapter.ts` monolith** (3k+ lines) — provider logic should be modular.
2. **Dual `memory-service`/`notification-service`** in both `packages/` and `services/` — split rationale undocumented.
3. **Compose sprawl (23 services)** — no documented profile/tiering for "minimum viable stack" vs full voice stack; QA blockers were precisely missing-service/env wiring.
4. **Per-handler portal auth** — allowlist is explicit now, but portal session checks remain per-handler (no middleware safety net), as the prior security audit warned.
5. **`arcads/` embedded project** — unclear boundary with main workspace.
6. Port collision website/trigger-service (both default 3002) — known, documented only in docs/README footnote.
