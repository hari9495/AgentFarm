# Prioritized Action Plan

> **Date:** 2026-06-13 · Sequenced for a small team. Estimates are relative (S < 1 day, M 1–3 days, L 1–2 weeks).

## Phase 1 — Trust the paid journey (this week)

| # | Action | Size | Done when |
|---|---|---|---|
| 1.1 | Re-verify all 13 QA findings from `QA-CUSTOMER-DASHBOARD-FINDINGS.md` on a clean `docker compose up`; fix residuals (billing "No active plan", portal approvals, team invites, INTERNAL nav leak) | M | Each finding marked fixed/accepted in that doc |
| 1.2 | Gateway startup preflight for required env/service wiring (`AGENT_RUNTIME_URL`, worker-runner when delegated) | S | Gateway refuses to start (or loudly degrades) on missing config |
| 1.3 | Automate the golden path (signup → provision → task → approval → billing) as a Playwright E2E in the existing CI E2E job | M | CI fails when journey breaks |
| 1.4 | Untrack `.auth.sqlite*` + build artifacts; .gitignore additions | S | `git status` clean on fresh run |

## Phase 2 — Re-baseline truth (next week)

| # | Action | Size | Done when |
|---|---|---|---|
| 2.1 | Run `pnpm test` + `pnpm quality:gate`; record real totals; update IMPLEMENTATION_STATUS.md | S | Current pass/fail counts published |
| 2.2 | Compose profiles (`core`/`workers`/`voice`/`desktop`/`meetings`) + update DEPLOYMENT.md and runbooks to reference them | M | `docker compose --profile core up` documented and working |
| 2.3 | Generated docs inventory script (`scripts/docs-inventory.mjs`) + quality-gate hook | M | Counts in docs regenerate from code |
| 2.4 | Root hygiene sweep (digests/audits/logs/binaries → archive or delete; decide `arcads/`) | S | Root contains only living files |

## Phase 3 — Structural hardening (weeks 3–4)

| # | Action | Size | Done when |
|---|---|---|---|
| 3.1 | Portal auth Fastify plugin (replace per-handler checks) + 401 regression tests | M | No portal data route lacks middleware coverage |
| 3.2 | Split `llm-decision-adapter.ts` into provider modules + failover policy module | L | File < 500 lines; per-provider tests |
| 3.3 | Document voice/meeting stack (`docs/VOICE_SYSTEM.md`) incl. model license verification (Unknown → resolved) | M | Doc merged; licenses confirmed |
| 3.4 | Document sales + support domains; archive superseded docs (API.md, PROJECT-AUDIT.md, root ARCHITECTURE.md→pointer) | M | docs/ index has no stale entries |

## Phase 4 — Measure what you promise (ongoing)

| # | Action | Size | Done when |
|---|---|---|---|
| 4.1 | SLO instrumentation for BRD objectives (uptime, tasks/agent/day, onboarding time, approval-bypass rate) | L | Dashboard/alerts exist; BRD targets measurable |
| 4.2 | Customer portal user guide + onboarding docs for the website dashboard | M | Publishable guide in docs/ |
| 4.3 | Sprint-gate rule: every gate report includes a docs-freshness check | S | Gate template updated |

## Decisions needed from the product owner (blocking items marked Unknown)

1. Purpose and future of `arcads/` (keep embedded / split out / delete).
2. Public pricing tier values (to finalize PRD §pricing and marketing docs).
3. Production deployment status and customer count (governs how aggressively Phase 1 must be treated as an incident vs. pre-launch hardening).
4. Team size/ownership for the action items above.
5. Licenses for self-hosted voice models (whisper/kokoro/xtts/mms-tts/voxcpm) for commercial use.
