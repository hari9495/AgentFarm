# Recommendations for Improvement

> **Date:** 2026-06-13 · Ordered by leverage. Each maps to evidence in reports 01–06.

## 1. Close the customer-journey loop before anything else
The platform's depth (15 agents, governance, voice) exceeds the reliability of its thinnest layer — the customer dashboard wiring (QA blockers 1–4). Re-run the 2026-06-12 manual QA end-to-end (signup → provision → submit task → approve → bill) against a fresh `docker compose up`, and convert that journey into an automated Playwright E2E lane in CI (the E2E job already exists) so wiring regressions are caught before customers see them.

## 2. Add a deploy-time configuration contract
Three of the four QA blockers were missing env vars or missing containers. Add a startup preflight in api-gateway (and compose healthcheck dependencies) that asserts required service URLs (`AGENT_RUNTIME_URL`, worker-runner reachability when `AF_WORKERS_DISABLED=1`) and fails loudly — same philosophy as the existing fail-closed webhook pattern.

## 3. Introduce docker-compose profiles
Define `core` (postgres, redis, migrate, gateway, runtime, dashboard, trigger), `workers`, `voice`, `desktop`, `meetings` profiles so the 23-service stack has a documented minimum and ops/runbooks can reference exact profiles.

## 4. Make documentation machine-derived where it counts
Adopt the generated-inventory approach (gap analysis §6): script-emit route/model/page/service/connector counts into one generated doc; keep prose docs count-free. Re-stamp docs with commit hashes. Wire a docs check into `pnpm quality:gate`.

## 5. Decompose `llm-decision-adapter.ts`
Split per-provider clients into `providers/<name>.ts` with a shared interface; keep auto-failover/cooldown as a separate policy module. This is the highest-complexity single file and every new provider (DeepSeek was just added) grows it.

## 6. Portal auth middleware
Move portal session validation from per-handler checks into a Fastify plugin scoped to the portal route group, exactly as the May security audit proposed. The blanket bypass is fixed; this closes the remaining "forgotten check" failure mode.

## 7. Repo hygiene sweep
- Untrack `apps/website/.auth.sqlite*`, `tsconfig.tsbuildinfo`, playwright artifacts, `evidence-records.ndjson` (add to .gitignore).
- Move root `digest_*.md`, `audit_*.md`, `routes_raw.txt`, `read.md`, build logs into `docs/audit/archive/` or delete.
- Remove `cloudflared.exe` from the repo (fetch in setup script instead).
- Decide `arcads/`'s fate: separate repo, or document its role.

## 8. Re-baseline the test suite and SLOs
Run `pnpm test`, `pnpm quality:gate`, record real totals in IMPLEMENTATION_STATUS.md. Then implement measurement for the BRD's stated objectives (uptime, tasks/agent/day, onboarding time) — the observability package and analytics routes exist; they need SLO dashboards/alerts to make BRD claims auditable.

## 9. Document the voice/meeting stack
It's the largest undocumented subsystem (8 compose services, 6 docker contexts, telephony connector category). One `docs/VOICE_SYSTEM.md` covering components, model/license provenance (whisper/kokoro/xtts/mms — licenses: Unknown, verify before commercial use), and the meeting join flows.

## 10. Consolidate duplicate docs
Single ARCHITECTURE.md (root pointer → docs/), archive `docs/API.md` and `docs/PROJECT-AUDIT.md`, merge digest files into the audit archive.
