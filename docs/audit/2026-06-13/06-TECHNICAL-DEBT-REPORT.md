# Technical Debt Report

> **Date:** 2026-06-13 · Items are repo-evidenced. Severity reflects impact on the customer journey, security, and maintainability.

---

## P0 — Blocks or distorts the paid customer journey

| # | Item | Evidence | Notes |
|---|---|---|---|
| 1 | **Customer-dashboard runtime wiring failures** — task submission (`AGENT_RUNTIME_URL` unset on gateway), portal task route missing from running container, provisioning stalls without `worker-runner`, portal approvals silent no-op | `QA-CUSTOMER-DASHBOARD-FINDINGS.md` (2026-06-12), blockers 1–4 | Some fixed same-session per that doc — **needs a full re-verification pass and a deploy checklist** so env/service dependencies can't silently drop |
| 2 | **Billing page shows "No active plan" with active subscription** | QA finding #5 | Revenue-trust bug on the money page |
| 3 | **Customer owners see INTERNAL Admin Console nav** | QA finding #7 | Privilege-presentation bug; verify no internal routes are reachable |

## P1 — Security & correctness hardening

| # | Item | Evidence |
|---|---|---|
| 4 | Portal data routes rely on **per-handler** session checks (no middleware net) — a forgotten check = public endpoint. Allowlist is explicit now, but the structural risk the May security audit flagged remains | `apps/api-gateway/src/server.ts:33-51`, `routes/admin/portal-data.ts` |
| 5 | `apps/website/.auth.sqlite{,-shm,-wal}` appear **tracked by git** (show as modified) — a live auth DB should never be in version control | `git status` snapshot |
| 6 | `.env` exists at repo root alongside `.env.example` — confirm gitignore coverage and scrub history if ever committed (gitleaks job exists, but verify) | root listing |
| 7 | Test totals unverified since Sprint 18 (claims: 1,853 total) — run `pnpm test` + `pnpm quality:gate` to re-baseline | `CLAUDE.md`, `docs/README.md` |
| 8 | Team "Add Member" creates members that can't log in (no invite/credential flow) | QA finding #9 |

## P2 — Maintainability

| # | Item | Evidence |
|---|---|---|
| 9 | **`llm-decision-adapter.ts` ≈3,300+ lines** — all 9 providers, auto-failover, cooldown persistence in one file | `apps/agent-runtime/src/llm-decision-adapter.ts` |
| 10 | Duplicate module names across layers: `memory-service` and `notification-service` in both `packages/` and `services/` with undocumented split | directory listing |
| 11 | Root clutter: 6 build logs, `cloudflared.exe`, `routes_raw.txt`, `read.md`, 4 `digest_*.md`, 3 `audit_*.md` point-in-time files | root listing |
| 12 | `arcads/` embedded project with own `.env`, CLAUDE.md, skills — workspace boundary unclear, not in pnpm workspace | `arcads/` |
| 13 | Port collision: website and trigger-service both default to 3002 | `docs/README.md` footnote |
| 14 | Two architecture docs + API.md/API_REFERENCE.md duplication; PROJECT-AUDIT.md superseded | `docs/` |
| 15 | FSD agent has graceful-degradation gaps (never hard-fails — masks failures) | prior agent audit (project memory); verify against `full-stack-developer/` sources |
| 16 | Working-tree noise committed or generated in place: `evidence-records.ndjson`, `tsconfig.tsbuildinfo`, `playwright-report/index.html`, `.last-run.json` all show as modified | `git status` snapshot |

## P3 — Operational debt

| # | Item | Evidence |
|---|---|---|
| 17 | 23-service compose with no profiles — no documented "minimum stack" vs "full voice stack"; QA blockers were exactly missing-service wiring | `docker-compose.yml` |
| 18 | BRD SLO targets (uptime, tasks/day, onboarding time) have no measurement implementation evidenced in repo | `docs/BRD.md` vs codebase |
| 19 | Provisioning card polls aggressively; verification emails use production domain in local dev | QA findings #12–13 |
| 20 | DEPLOYMENT.md and runbooks pre-date worker-runner, voice stack, ngrok, desktop-agent — ops docs can't currently bring up the full stack from scratch | doc stamps vs compose |

## Explicitly *not* debt (verified healthy)

- Previously reported HIGH security findings (session-secret fallback, tenant-branding SQL injection, portal blanket bypass, CORS fail-open) — **all remediated** in current tree.
- Migration discipline (44 incremental migrations), fail-closed webhook pattern, timing-safe comparisons, Pino redaction, helmet config, dual-layer rate limiting — all verified present.
