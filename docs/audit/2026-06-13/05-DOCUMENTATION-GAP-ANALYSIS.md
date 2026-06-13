# Documentation Gap Analysis

> **Date:** 2026-06-13 · Every existing doc was checked for a freshness stamp and its quantitative claims sampled against the tree. The doc set is **structurally excellent but uniformly frozen at 2026-05-29 (Sprint 18)** — 411 commits ago.

---

## 1. Inventory of Existing Documentation

37 docs in `docs/` (+ `dashboard/` and `testing/` subfolders), plus root-level `README.md`, `ARCHITECTURE.md`, `DESIGN.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `CLAUDE.md`, 3 root audit files, 4 digest files, `QA-CUSTOMER-DASHBOARD-FINDINGS.md`, plus `operations/` (runbooks + quality), `planning/`, `mvp/`, `strategy/`, `research/`, and two infrastructure READMEs.

## 2. Verified-Stale Claims (doc → actual)

| Doc | Claim | Verified actual |
|---|---|---|
| `README.md` (root) | 51 dashboard pages / 159 proxy routes | **95 / 294** |
| `README.md` | 62 backend route files | **110** (in 14 domain subdirs — flat list in README reflects pre-reorganization layout) |
| `README.md` | 9 docker-compose services | **23** |
| `README.md` | 75+ models / 70 core | **105 models, 35 enums** |
| `README.md`, `docs/README.md` | 13 shared packages | **16** (missing document-converter, memory-service, redis-client) |
| `README.md` | 15 domain services | **17** (missing browser-agent, desktop-agent) |
| `README.md` | 7 CI jobs | **12** (secret-scan, SCA, Semgrep, E2E, lint added) |
| `README.md` | 9 LLM providers (no DeepSeek) | **DeepSeek added** (`llm-decision-adapter.ts:62`) |
| `CLAUDE.md` | 18 services / 18 connectors / 18 action types / 70 models / 7 CI jobs / 9 compose services | **17 / 23 / 34 / 105 / 12 / 23** |
| `CLAUDE.md` | 1,853 tests | Unverified since Sprint 18 — needs re-run |
| `docs/IMPLEMENTATION_STATUS.md` | 7 agent roles "📋 Planned — handlers not yet built" | **All 15 agent implementations exist** in `apps/agent-runtime/src/agents/` with RAG retrievers + lesson pipelines (per CLAUDE.md RAG table, which is *newer* than IMPLEMENTATION_STATUS.md) |
| `docs/BRD.md` | 12 roles target, ≥9 connectors | 15 roles implemented, 23 connectors |
| `audit_security.md` (root) | 2 HIGH / 2 MEDIUM open findings | **All 4 lead findings remediated** (verified 2026-06-13; see Repository Audit §11) |
| `docs/README.md` | Test-count table (1,237+/1,120+/…) | Unverified since 2026-05-29 |
| `docs/API_REFERENCE.md`, `DATA_MODEL.md`, `ARCHITECTURE.md`, `DEPLOYMENT.md`, etc. | All stamped 2026-05-29 | Pre-date sales domain, support domain, portal, voice stack, telephony connectors, worker-runner, SSO/MFA routes |

## 3. Missing Documentation (did not exist before this audit)

| Gap | Status |
|---|---|
| **PRD** (BRD exists; no product requirements doc) | ✅ Created: [docs/PRD.md](../../PRD.md) |
| **Security documentation** (consolidated; AUTH_SYSTEM.md covers auth only) | ✅ Created: [docs/SECURITY.md](../../SECURITY.md) |
| **Operations & maintenance overview** (runbooks exist but no index/ops guide) | ✅ Created: [docs/OPERATIONS.md](../../OPERATIONS.md) |
| **Developer onboarding guide** (setup steps scattered across README/DEPLOYMENT/CONTRIBUTING) | ✅ Created: [docs/DEVELOPER_ONBOARDING.md](../../DEVELOPER_ONBOARDING.md) |
| Voice/meeting stack documentation (whisper/kokoro/xtts/mms-tts/freeswitch/zoom/teams containers) | ❌ **Still missing** — highest-value next doc; owners of model/license choices: Unknown |
| Sales domain documentation (13+ models, 9 sales route files, webhook flows) | ❌ Still missing |
| Support domain documentation (SupportIssue/CSAT/chat/voice routes) | ❌ Still missing |
| Customer portal / website dashboard user guide | ❌ Still missing (QA checklist exists at `docs/testing/dashboard-test-checklist.md` for internal dashboard only) |
| `arcads/` project README explaining its relationship to AgentFarm | ❌ Missing — purpose Unknown |
| `worker-runner` operational requirements (QA blocker #3 root cause) | Partially covered in OPERATIONS.md (created); needs deploy-checklist integration |

## 4. Redundant / Conflicting Documentation

- **Two architecture docs:** root `ARCHITECTURE.md` and `docs/ARCHITECTURE.md` (plus `docs/ARCHITECTURE-FULL.md`, `DESIGN.md`). Consolidation target needed.
- **Two API docs:** `docs/API.md` (older) vs `docs/API_REFERENCE.md` — API.md self-identifies as superseded; should be archived.
- **Root digest files** (`digest_*.md`, `audit_*.md`, `routes_raw.txt`, `read.md`) — point-in-time artifacts cluttering root; move to `docs/audit/archive/` or delete.
- **`docs/PROJECT-AUDIT.md`** (2026-05-29) — superseded by this audit set.

## 5. Update Actions Taken in This Audit

1. `docs/README.md` — corrected package/service lists and counts, re-stamped, pointed to this audit set.
2. `README.md` (root) — corrected headline counts (pages, routes, models, services, CI jobs, compose services, providers).
3. `CLAUDE.md` — corrected counts (services, connectors, action types, models, CI jobs, compose services).
4. `docs/IMPLEMENTATION_STATUS.md` — corrected agent-role status to reflect the 15 implemented agents; re-stamped with verification basis.
5. `audit_security.md` — prepended remediation status header (findings fixed as of 2026-06-13).
6. Created PRD.md, SECURITY.md, OPERATIONS.md, DEVELOPER_ONBOARDING.md.

## 6. Documentation Process Recommendation

The root cause is process, not effort (the Sprint-18 doc set was thorough). Counts hard-coded into prose go stale within days at this commit velocity. Recommendations:
- Stamp every doc with `Last verified:` + commit hash, not sprint names.
- Generate inventories (route lists, model lists, page lists, compose services) by script into docs instead of hand-counting — a `scripts/docs-inventory.mjs` emitting a single `docs/INVENTORY.generated.md` would eliminate the entire class of drift found here.
- Make doc updates part of the sprint quality gate (the gate already exists in `operations/quality/`).
