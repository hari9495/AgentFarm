# Business Analysis Report

> **Date:** 2026-06-13 · Derived strictly from repository evidence (`docs/BRD.md`, `strategy/vision-and-positioning.md`, `research/competitive-gold-standards.md`, `mvp/mvp-scope-and-gates.md`, billing/subscription code, website pages). Market-facing facts that the repo cannot prove are marked **Unknown**.

---

## 1. Business Model (as encoded in the system)

AgentFarm sells **AI employees as a subscription**:

| Revenue mechanism | Implementation evidence |
|---|---|
| Tenant-level subscription | `TenantSubscription` model, subscription guard middleware, grace period + suspension wall (`routes/platform/billing.ts`) |
| Per-agent subscription | `AgentSubscription` model, per-agent billing card in dashboard |
| Usage metering | $0.10/task platform fee (`UsageMeteringEvent`, root README "Platform billing metering") |
| Payment rails | Stripe + Razorpay webhook handlers (dual-rail suggests India + international markets — consistent with Razorpay presence and Azure South India dev VM) |
| Cost control upsell surface | Budget policies (daily/monthly caps, 80%/90% thresholds), cost dashboard |
| Contracts | ZohoSign webhook flow (`zoho-sign-webhook.ts`, `ContractEvent`) for sales-closed deals |

Public pricing tiers: page exists at `apps/website/app/pricing` — **tier values Unknown until confirmed** (not extracted in this audit).

## 2. Target Customers & Stakeholders

From `docs/BRD.md` (stakeholder table) and the implemented surfaces:

- **Buyers:** software/ops teams and enterprises wanting governed automation (BRD: "scale human capacity through trustworthy automation").
- **Tenant Admin** — workspace/bot/approval configuration (admin panel).
- **Operator/Reviewer** — approval queue (dashboard).
- **End teams** — receive agent output in their own tools (GitHub, Jira, Slack, email, phone).
- **Compliance/Finance/Legal** — audit logs, evidence bundles, compliance export, billing, ZohoSign.
- **Superadmin (AgentFarm staff)** — fleet/tenant management.

## 3. Value Proposition (vs. generic AI tools)

Encoded directly in code, per BRD and verified implementation:

1. **Role-scoped** — `role-enforcer.ts` hard-blocks out-of-role tasks before any LLM call.
2. **Approval-gated** — risk-tiered approvals; 0%-bypass objective (BRD objective #2).
3. **Evidence-backed** — every action produces audit events, screenshots, evidence bundles.
4. **Compliance-ready** — EU AI Act Art. 52 / FTC / CA SB 1001 disclosure on all outbound channels; GDPR episodic-memory delete; retention policies; compliance export (365/730-day).
5. **Self-improving** — RAG lesson flywheel per agent (rejections become lessons, approvals become knowledge).
6. **Provider-resilient** — 9 LLM providers with health-score auto-failover (no single-vendor dependency).

## 4. BRD Objectives vs. Current Reality

`docs/BRD.md` (2026-05-29) objectives, re-checked against the tree:

| BRD objective | Status (2026-06-13) |
|---|---|
| 12 agent roles live | **Exceeded — 15 agent implementations exist** (BRD predates 3) |
| ≥9 connectors | **Exceeded — 23 in `CONNECTOR_REGISTRY`** incl. a whole telephony category |
| Self-service onboarding <10 min | Setup wizard + onboarding flow implemented; *actual timing unmeasured in repo* — **Unknown** |
| 99.9% uptime | Healthchecks + SLA monitoring exist (`ops/provisioning-sla.ts`); *no uptime measurement evidence in repo* — **Unknown** |
| 0% approval bypass | Enforcement implemented; QA found portal approvals were a **silent no-op** on 2026-06-12 (blocker #4) — partially contradicts the objective on the newest surface; see tech-debt report |
| ≥10 tasks/agent/day | **Unknown — no production telemetry in repo** |

## 5. Market Position

- `strategy/vision-and-positioning.md` and `research/competitive-gold-standards.md` exist as the strategic basis (contents not summarized here; they are the authoritative internal source).
- Differentiation observable in code: governance/compliance depth + self-hosted voice stack + desktop automation is an unusual combination versus chat-first competitors.
- Geography: dual payment rails (Razorpay/Stripe), Azure **South India** region in dev infra, and `agentfarms.in` domain in QA notes suggest an India-first go-to-market with international capability — **business intent Unknown – confirm with product owner**.

## 6. Operational Readiness (business lens)

| Dimension | Evidence | Assessment |
|---|---|---|
| Quality discipline | 19 quality-gate reports, sprints 8–18, signoffs | Strong engineering cadence |
| Runbooks | 6 runbooks incl. `mvp-launch-ops-runbook.md`, `weekly-operating-system.md` | Launch-ops thinking exists |
| Customer-facing readiness | 2026-06-12 QA found 4 blockers on the customer dashboard journey (submit task, provision agent, approvals) | **The monetized journey was not fully working as of 2026-06-12**; several fixes applied same day — re-verification required |
| Billing correctness | QA finding #5: billing page showed "No active plan" despite active subscription | Revenue-surface bug — high business priority |
| Support | `agentfarm-support` agent + support issue/CSAT models — the company intends to support customers with its own product | Dogfooding |

## 7. Key Business Risks (repo-evidenced)

1. **Last-mile integration gaps on the paid journey** (QA blockers) — the deep platform works, the customer-visible wrapper had wiring failures.
2. **Documentation drift (411 commits)** — onboarding new engineers/sales engineers against stale docs creates rework; BRD/PRD no longer reflect the sellable scope (understates it).
3. **Single-maintainer bus factor** — git history shows one author pattern (user `hari`); **team size Unknown – confirm**.
4. **Compliance claims need continuous verification** — disclosure/GDPR/audit are implemented, but claims like "100% evidence completeness" are objectives, not measured guarantees.
5. **Unmeasured SLOs** — uptime/latency/task-success targets in BRD have no measurement evidence in the repo.
