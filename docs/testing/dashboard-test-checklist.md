# Dashboard Testing Checklist — Operator/Internal UI

**Environment:** Azure dev VM (`agentfarm-vm`, South India) · created 2026-06-13
**Automated sweep:** all 91 routes smoke-tested logged-in — 87×200, 3 intentional redirects, 0 pages in fallback-data mode.
**Legend:** `[A]` = passed automated load test (page renders, no server error). Manual columns: does the data make sense, do buttons/forms work, console errors?

> Found a bug? Note page + action + expected vs actual. Fixes get committed to main same-day.

## 1. Core Operations

- [x] `[A]` `/` Overview — **manual:** badge shows ● Live, counts match reality (1 agent, 0 tasks)
- [ ] `[A]` `/approvals/mobile` Mobile approvals — empty state renders
- [ ] `[A]` `/activity` Activity feed — shows real audit events (logins should appear)
- [ ] `[A]` `/audit` Audit log — entries for your logins/actions
- [ ] `[A]` `/audit/session-replay` Session replay
- [ ] `[A]` `/health` System health — all services green
- [ ] `[A]` `/live` Live view
- [ ] `[A]` `/operational-signals` Operational signals
- [ ] `[A]` `/sla-alerts` SLA alerts — empty state

## 2. Agents

- [ ] `[A]` `/agents` Agent list — shows seeded `bot_dev_001` (developer, active)
- [ ] `[A]` `/agents/health` Agent health — runtime heartbeat visible
- [ ] `[A]` `/agents/compare` Agent compare
- [ ] `[A]` `/agent-chat` Agent chat — send a message, expect reply (LLM wired)
- [ ] `[A]` `/agent-persona` Persona editor — edit + save round-trips
- [ ] `[A]` `/playground` Playground — run a prompt

## 3. Tasks & Execution ⭐ (the heart — test first)

- [ ] `[A]` `/tasks` Tasks — **submit a real task to the Developer bot, watch it execute**
- [ ] `[A]` `/batch-tasks` Batch tasks
- [ ] `[A]` `/routine-tasks` Routine tasks
- [ ] `[A]` `/scheduled-tasks` Scheduled tasks — create one, verify it appears
- [ ] `[A]` `/loops` Autonomous loops
- [ ] `[A]` `/wake-runs` Wake runs
- [ ] `[A]` `/deliverables` Deliverables — populated after first task
- [ ] `[A]` `/handoffs` Handoffs (orchestrator not deployed on VM — expect empty/disabled)
- [ ] `[A]` `/orchestration` Orchestration (same caveat)

## 4. Approvals & Governance

- [ ] `[A]` `/governance` Governance home — kill-switch visible, **do not** trigger casually
- [ ] `[A]` `/governance/kpis` KPIs
- [ ] `[A]` `/governance/plugins` Plugin allowlist/killswitch
- [ ] `[A]` `/governance/workflows` Workflows
- [ ] `[A]` `/circuit-breakers` Circuit breakers — all closed
- [ ] `[A]` `/retention` Retention policies
- [ ] `[A]` `/evidence` (sidebar) Evidence — populated after approval flow

## 5. Knowledge & Memory

- [ ] `[A]` `/memory` Memory browser
- [ ] `[A]` `/work-memory` Work memory
- [ ] `[A]` `/knowledge-graph` Knowledge graph — empty on fresh DB
- [ ] `[A]` `/snapshots` Snapshots

## 6. Connectors, Webhooks & Integrations

- [ ] `[A]` `/connectors` Connectors marketplace — 18 connectors listed, health states
- [ ] `[A]` `/adapters` Adapters
- [ ] `[A]` `/webhooks` Outbound webhooks — create one (URL can be a requestbin)
- [ ] `[A]` `/webhooks/inbound` Inbound webhooks
- [ ] `[A]` `/webhooks-ops` Webhook ops/DLQ
- [ ] `[A]` `/pipelines` Pipelines
- [ ] `[A]` `/ci` CI integration
- [ ] `[A]` `/platform-mcp` Platform MCP

## 7. Billing, Cost & Analytics

- [ ] `[A]` `/billing` Billing — starter plan visible, no Stripe keys (expect graceful empty)
- [ ] `[A]` `/budget` Budget policy — set a daily limit, verify save
- [ ] `[A]` `/cost-dashboard` Cost dashboard — populates after first LLM task
- [ ] `[A]` `/roi` ROI · `/quality-roi` Quality ROI
- [ ] `[A]` `/analytics` Analytics
- [ ] `[A]` `/historical-metrics` Historical metrics
- [ ] `[A]` `/business-reports` Business reports
- [ ] `[A]` `/scheduled-reports` Scheduled reports

## 8. Sales Module

- [ ] `[A]` `/sales` Sales home · `/sales/pipeline` · `/sales/deals` · `/sales/leads` · `/sales/outreach` · `/sales/activity` · `/sales/config` · `/sales/browser-tasks`
- [ ] `[A]` `/leads` Leads · `/campaigns` Campaigns · `/talent-pipeline` Talent pipeline

## 9. Comms & Content

- [ ] `[A]` `/chat` Chat
- [ ] `[A]` `/comms-drafts` Comms drafts · `/content-drafts` Content drafts · `/pr-drafts` PR drafts
- [ ] `[A]` `/project-plans` Project plans · `/playbooks` Playbooks
- [ ] `[A]` `/meetings` Meetings (voice stack not deployed on VM — expect disabled/empty)
- [ ] `[A]` `/notifications` Notifications

## 10. Support

- [ ] `[A]` `/support` Support · `/support-queue` Support queue

## 11. Settings, Team & Account

- [ ] `[A]` `/settings` Settings — change something trivial, verify persistence
- [ ] `[A]` `/settings/sso` SSO config · `/settings/disclosure` Disclosure
- [ ] `[A]` `/tenant-settings` Tenant settings — branding card
- [ ] `[A]` `/team` Team — both VM accounts listed
- [ ] `[A]` `/account` Account — profile edit, change-password flow
- [ ] `[A]` `/env` Env · `/llm-config` LLM config — provider shows configured

## 12. Misc / Dev Tools

- [ ] `[A]` `/skills` Skills · `/skill-search` Skill search · `/internal/skills` Internal skills
- [ ] `[A]` `/desktop` Desktop (desktop-agent not deployed — expect disabled)
- [ ] `[A]` `/devops` DevOps · `/provisioning` Provisioning (AF_SKIP_PROVISIONING=true on VM)
- [ ] `[A]` `/quality` Quality
- [x] `[A]` `/login` Login — password + OTP flow verified working
- [x] `307` `/dashboard`, `/onboarding`, `/signup` — intentional redirects, not bugs

## Known VM limitations (not bugs)

Voice/meeting/desktop features, browser-agent, and orchestrator are not deployed (8 GB VM, Phase 1 scope). Email delivery (OTP/password-reset) not configured — OTP codes read from Redis.

## Bugs found & fixed during this deployment

1. `seed_starter_plan` migration missing `updatedAt` → broke all fresh DBs (1dfe6bc)
2. trigger-service Dockerfile missing app `node_modules` → crash loop (5ff9fd3)
3. postgres/redis/opa had no restart policy → stack dead after reboot (d6f1cbc)
4. `DASHBOARD_ALLOWED_DOMAINS` never passed to container + misleading OTP error (56798bd)
5. Missing migration `TaskQueueEntry.dependsOn` → /v1/task-queue 500 → dashboard fallback mode (7fc9ad7)
6. **Schema drift:** 191-statement gap between migrations and schema.prisma, incl. `ProvisioningJob.metadata`; additive subset applied on VM. ⚠️ Repo reconcile migration pending — must NOT drop pgvector ivfflat indexes.
