# AgentFarm Operations & Maintenance Guide

> **Created:** 2026-06-13 (full-repo audit) · Index + verified operational facts. Detailed procedures live in `operations/runbooks/`.

---

## 1. Runtime Topology (what must be running)

Full stack = **23 docker-compose services**. There are currently **no compose profiles** — minimum-stack guidance below is derived from service dependencies and the 2026-06-12 QA findings.

| Tier | Services | Needed for |
|---|---|---|
| Core data | `postgres` (5432), `redis` (6379), `migrate` (one-shot) | Everything |
| Control plane | `api-gateway` (3000), `dashboard` (3001) | Auth, approvals, UI |
| Execution | `agent-runtime` (4000), `trigger-service` (3002), **`worker-runner`** | Tasks; **provisioning stalls without worker-runner when workers are delegated** (QA blocker #3) |
| Policy | `opa` (8181) | Governance evaluation |
| Browser/desktop | `browser-agent`, `desktop-agent`, `ngrok` | Web/desktop action tiers |
| Voice/meetings | `voicebox`, `whisper`, `kokoro`, `xtts`, `mms-tts`, `voxcpm`, `freeswitch`, `zoom-video-sidecar`, `teams-media-bot`, `meeting-agent` | Meetings/telephony |
| Other | `agentfarm` | (compose-defined; role not documented — **Unknown**) |

Workers run **in-process in api-gateway by default**; set `AF_WORKERS_DISABLED=1` to delegate to `worker-runner` — if you do, worker-runner becomes mandatory.

## 2. Critical Environment Wiring

`.env.example` documents 285 variables; `.env.production.example` is the production profile. Operationally critical (failures here caused the 2026-06-12 customer-dashboard blockers):

- `AGENT_RUNTIME_URL` on api-gateway — without it, task submission fails silently from the portal.
- `DATABASE_URL`, `REDIS_URL`, `OPA_BASE_URL`, `API_SESSION_SECRET` (≥32 chars — gateway will not accept short/missing values).
- HMAC inter-service tokens (5) and webhook secrets (8) — see [SECURITY.md](SECURITY.md) §2–3; webhook endpoints return 503 if their secret is unset.

## 3. Routine Operations

| Task | Command / location |
|---|---|
| Bring up stack | `docker compose up` (root) |
| Migrate DB | `pnpm db:migrate:deploy` |
| Quality gate | `pnpm quality:gate` (script: `scripts/quality-gate.mjs`) |
| DB integration tests | `pnpm test:db` (Dockerized Postgres; `scripts/run-db-tests.sh`) |
| E2E smoke | `pnpm smoke:e2e` (`scripts/e2e-smoke.mjs`) |
| Website prod verify | `pnpm verify:website:prod` (`scripts/website-swa-verify.mjs`) |
| Health checks | `GET /health` on every runtime service; `GET /health/detail` (internal scope) on gateway |
| Process manager (non-Docker) | `ecosystem.config.cjs` (PM2) |

## 4. Scheduled / Background Jobs

- Billing lifecycle daily sweep (subscriptions, grace periods, renewal reminders).
- Retention cleanup (`services/retention-cleanup`).
- Connector token lifecycle workers (refresh/revoke/re-consent).
- Orchestrator routine schedulers + proactive signal detectors (CI failures, CVE alerts).
- Scheduled reports (nodemailer).

## 5. Runbooks (existing, in `operations/runbooks/`)

| Runbook | Scope |
|---|---|
| `mvp-launch-ops-runbook.md` | Launch operations |
| `developer-agent-runbook.md` | Developer agent ops |
| `db-integration-testing-runbook.md` | DB test lane |
| `crash-recovery-repro-pack-runbook.md` | Crash recovery / repro packs |
| `google-meet-pilot-smoke-test.md` | Meeting stack pilot |
| `website-swa-runbook.md` | Azure SWA website deploys |

⚠ All runbooks pre-date the voice stack, worker-runner, and desktop-agent additions — see [Action Plan 2.2](audit/2026-06-13/08-ACTION-PLAN.md).

## 6. Infrastructure

- **Azure:** Bicep IaC — `infrastructure/control-plane/`, `infrastructure/runtime-plane/` (each has its own README). Provisioning service drives per-workspace VM lifecycle (11-step state machine, SLA monitoring at `routes/ops/provisioning-sla.ts`).
- **Cloudflare:** Terraform at `infrastructure/cloudflare/` (tunnel/SSL/CDN).
- **Dev VM:** `agentfarm-vm` (B2as_v2, southindia), Logic Apps auto start/stop Mon–Fri 6–9PM IST, budget alerts. *(source: project records; re-verify in Azure portal)*

## 7. Monitoring & Alerting

- OTEL + Azure Monitor via `packages/observability`; Pino structured logs with secret redaction.
- Budget alerts: 80% warning / 90% throttle of daily token limits.
- Webhook delivery tracking + DLQ + replay (`/webhooks-ops` dashboard page).
- **No SLO dashboards/alerts for BRD uptime/throughput targets found in repo — Unknown / not implemented** (Action Plan 4.1).

## 8. Incident Levers

1. **Kill-switch** — `routes/governance/kill-switches.ts`; 30-second control window; incident reference required to resume.
2. **Circuit breakers** — per-component state, dashboard `/settings`.
3. **Plugin killswitch / allowlist** — disable a misbehaving plugin tenant-wide.
4. **Subscription hard-stop** — billing enforcement wall.
5. **Provider failover** — auto mode reroutes around failing LLM providers; cooldowns persisted.

## 9. Quality-Gate History

19 reports/signoffs in `operations/quality/` (sprints 8–18, plus phase-1 signoff and workspace audit). Latest: `18.1-quality-gate-report.md` (2026-05-29). **Re-run required to baseline current state** — 411 commits since.
