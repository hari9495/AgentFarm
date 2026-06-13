# Developer Onboarding Guide

> **Created:** 2026-06-13 (full-repo audit) · One path from clone to productive contribution. Deep references: [ARCHITECTURE.md](ARCHITECTURE.md), [DEPLOYMENT.md](DEPLOYMENT.md), [TESTING.md](TESTING.md), `CLAUDE.md` (conventions — read it even if you're not using AI tooling; it's the most current conventions doc).

---

## Day 1 — Environment

**Prereqs:** Node.js ≥20 (CI uses 22), pnpm ≥9 (`packageManager: pnpm@9.12.0`), Docker Desktop, Git.

```bash
git clone <repo> && cd AgentFarm
pnpm install
cp .env.example .env          # 285 vars, commented; minimum set below
docker compose up -d postgres redis opa
pnpm db:migrate:deploy
pnpm --filter @agentfarm/db-schema exec prisma generate
```

Minimum `.env` to boot locally: `DATABASE_URL`, `REDIS_URL`, `OPA_BASE_URL`, `API_SESSION_SECRET` (≥32 chars), `API_REQUIRE_AUTH=true`, the 5 HMAC shared tokens (`APPROVAL_INTAKE_SHARED_TOKEN`, `CONNECTOR_EXEC_SHARED_TOKEN`, `RUNTIME_DECISION_SHARED_TOKEN`, `RUNTIME_DISPATCH_SHARED_TOKEN`, `RUNTIME_TASK_SHARED_TOKEN`), and at least one LLM key. **Also set `AGENT_RUNTIME_URL` on the gateway** — task submission fails without it.

Dev servers (separate terminals):

```bash
pnpm --filter @agentfarm/api-gateway dev       # 3000 — control plane
pnpm --filter @agentfarm/agent-runtime dev     # 4000 — execution engine
pnpm --filter @agentfarm/dashboard dev         # 3001 — operator UI
pnpm --filter @agentfarm/trigger-service dev   # 3002 — inbound intake
pnpm --filter @agentfarm/orchestrator dev      # 3011 — multi-agent (optional)
# website also defaults to 3002 — set TRIGGER_SERVICE_PORT or run website on another port
```

## Day 1 — Verify

```bash
curl localhost:3000/health
pnpm --filter @agentfarm/api-gateway typecheck
pnpm --filter @agentfarm/api-gateway test
```

## Mental Model (30 minutes)

1. **Monorepo layers:** `apps/` (6 processes) ← import `services/` (17 domain modules) ← import `packages/` (16 libraries). Boundaries enforced by `tools/eslint-plugin-agentfarm-boundaries.cjs`.
2. **Everything flows through the gateway** (3000): auth, billing, approvals, audit, DB writes. The dashboard browser never calls it directly — Next.js proxy routes add `X-Dashboard-Token`.
3. **Task lifecycle:** intake → LLM plan → risk class → (approval if MED/HIGH) → action tiers → evidence/audit → RAG ingestion. Read `CLAUDE.md` "Request flow".
4. **Route pattern:** each app registers domains via `src/route-registry.ts`. To add a gateway route: create file under `src/routes/<domain>/`, accept `getSession` in options, check session → 401, scope every query to `session.tenantId`, add a 401 test to `auth-regression.test.ts`, register in route-registry.
5. **The 15 agents** live in `apps/agent-runtime/src/agents/<name>/`, all following the RAG retriever + lesson-pipeline pattern (CLAUDE.md has the full table and "Adding RAG to a New Agent").

## Conventions (non-negotiable, from CLAUDE.md + configs)

- **Tests:** `node:test` + `node:assert/strict` only — no Jest/Vitest. Run scoped: `pnpm --filter @agentfarm/<app> test src/<path>.test.ts`.
- **ESM:** NodeNext — relative imports need `.js` extensions.
- **Style:** Prettier 100-char, single quotes, semicolons; ESLint 9.
- **Auth comparisons:** always `timingSafeEqual`, never `===`. Webhooks fail closed.
- **DB:** schema changes via `pnpm --filter @agentfarm/db-schema exec prisma migrate dev --name <name>` (44 migrations and counting — never edit applied ones).
- **Quality gate:** `pnpm quality:gate` before sign-off; CI runs 12 jobs incl. gitleaks/SCA/Semgrep — secrets in code will fail the build.

## Week 1 — Suggested Reading Order

1. `CLAUDE.md` (conventions, current) → 2. [audit/2026-06-13/](audit/2026-06-13/README.md) (verified current-state) → 3. [ARCHITECTURE.md](ARCHITECTURE.md) + [DATA_MODEL.md](DATA_MODEL.md) (structurally sound; counts stale) → 4. [SECURITY.md](SECURITY.md) → 5. one agent end-to-end (`apps/agent-runtime/src/agents/developer/`) → 6. [OPERATIONS.md](OPERATIONS.md).

## Gotchas (verified)

- Docs dated 2026-05-29 understate the system (counts, services, roles) — trust code and the 2026-06-13 audit over older numbers.
- Full compose stack is 23 services; you rarely need the voice tier locally.
- `packages/memory-service` vs `services/memory-service` are different things (package = library imported by gateway; service = domain module) — check imports before editing.
- `arcads/` is a separate embedded project — not part of the pnpm workspace.
- Windows dev: repo root is `D:\AgentFarm`; scripts include both `.sh` (bash) and `.mjs` (cross-platform).
