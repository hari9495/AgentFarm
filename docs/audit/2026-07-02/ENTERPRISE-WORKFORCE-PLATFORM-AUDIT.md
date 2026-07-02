# AgentFarm — Enterprise AI Workforce Platform Audit

> **Date:** 2026-07-02 · **Tree:** `ee61bed4` (main) · **Method:** evidence-based source verification. Builds on the verified baselines in `docs/audit/2026-06-24/FULL-PRODUCT-AUDIT.md` (platform 58/100) and `docs/audit/2026-06-27/GOVERNANCE-POLICY-ENGINE-REAUDIT.md` (governance 38→87). Every delta since those audits was re-verified from source this pass; unchanged findings are carried forward with their original citations.

---

## 1. Executive Summary

AgentFarm is a real, working AI workforce platform — not a chatbot with a dashboard. Verified surface: ~3,600 TS files, 114 Prisma models / 64 migrations, 117 non-test route files in api-gateway, **462 test files**, 15 role agents each with an action handler + RAG retriever + lesson pipeline, a spec-compliant MCP client with **multi-step sequencing now implemented** (`mcp-sequence.test.ts`, `local-workspace-executor.ts:11653`), 10 first-class native connector executors + 5 generic-REST/SMTP paths guarded by a CI coverage test, a customer-configurable governance engine enforced at runtime (OPA + direct-read enforcers, hash-chained violation history), and a **digital-employee layer** (personas with timezone/working hours, shift gate at intake, shift-driven VM start/deallocate).

**Verdict: strong late-beta.** The three critical findings from June — connector-execution bifurcation, spec-only MCP multi-step, and no employee-lifecycle layer — are all **closed in code**. What remains unproven is *operational*: no load-test run in a provisioned environment, autonomy demonstrated only in controlled runs, and single-node Postgres/Redis with in-process workers by default.

**Overall platform maturity: 72/100** (was 58). **Enterprise readiness: ~55%** — pilot-ready for design-partner deployments with the developer/devops/support agents; not yet ready for hundreds of tenants.

---

## 2. Architecture Assessment (subsystem classification)

| Subsystem | Classification | Evidence |
|---|---|---|
| Frontend (dashboard 95 pages, website) | Fully Implemented | `apps/dashboard/app/api/[...path]/route.ts` proxy; no direct browser→gateway calls |
| API layer (Fastify, route-registry) | Fully Implemented | `apps/api-gateway/src/route-registry.ts`; 117 route files |
| Database (Prisma + pgvector) | Fully Implemented | `packages/db-schema/prisma/schema.prisma` — 114 models, 64 migrations |
| Authentication (signed cookie sessions) | Fully Implemented | `API_SESSION_SECRET`, scope customer/internal; auth-regression tests |
| Authorization / RBAC | Fully Implemented | 14 data-driven roles, tenant overlay (`role-policy-store.ts`, `role-enforcer.ts`) |
| Agent framework (15 role agents) | Fully Implemented | `apps/agent-runtime/src/agents/*` — handler + RAG + lessons per agent |
| Orchestrator (GOAP, handoffs, parallel) | Implemented, operationally unproven | `apps/orchestrator/src/goap-planner.ts`, `agent-handoff-manager.ts`, `parallel-task-manager.ts` — all with tests |
| Scheduler | Fully Implemented | `routine-scheduler.ts`, `task-scheduler.ts`, `proactive-signal-detector.ts` |
| Queue system | Partially Implemented | Redis-backed queues + in-memory runtime queue; known restart-loss glitch (see §12) |
| Memory (semantic + episodic RAG) | Fully Implemented | `packages/memory-service`; flywheel wired for all 15 agents (verified 06-24 audit §3.2) |
| MCP integration | Fully Implemented | Protocol client (`mcp-protocol-client.ts`), single-call + **`mcp_tool_sequence`** multi-step, per-tool deny, approval floor |
| Connectors | Fully Implemented (10 native + 5 generic), 8 consciously unimplemented | `provider-clients.ts` (jira, github, slack, teams, gitlab, linear, asana, trello, clickup, azure_devops); `connector-coverage.test.ts` fails CI on silent gaps |
| Webhooks (in + out) | Fully Implemented | Fail-closed inbound verify; outbound HMAC-signed, circuit breaker, DLQ (threshold 5), delivery records, replay (`webhook-dispatcher.ts`) |
| Workflow engine (governance workflows) | Fully Implemented | Postgres-durable templates/instances (`GovernanceWorkflowTemplate/Instance`) |
| Governance / policy engine | Fully Implemented | See §7 — customer-uploaded policies enforced at runtime, verified live |
| Audit logging | Fully Implemented | Append-only `AuditEvent` + Axiom mirror + **hash-chained** `PolicyViolation` (`violation-integrity.test.ts`, `compliance-export.ts`) |
| Monitoring / observability | Fully Implemented (3 layers) | Langfuse (LLM), Axiom (infra/logs), Azure Monitor (VM host) |
| Infrastructure / deployment | Partially Implemented | Docker Compose (23 services) + Azure VM provisioning state machine; **no Kubernetes**, no HA topology |
| CI/CD | Fully Implemented | 12-job pipeline: gitleaks, SCA, Semgrep, typecheck/test matrices, Docker builds, Playwright E2E |
| Secrets management | Fully Implemented | Azure Key Vault refs (`kv://`) + `env://` dev fallback (`secret-store.ts`) |
| Load/scale infrastructure | Placeholder → harness ready, never run | `scripts/load-test-fullstack.mjs` exists; no recorded run against a provisioned env |

Nothing audited classifies as UI-only, broken, or fake. The former UI-only risk (advertised connectors with no executor) is now structurally prevented by the coverage guard test.

---

## 3. Agent-by-Agent Review

All 15 role agents verified to have: registration, action handler, RAG retriever + lesson pipeline (flywheel), MCP provisioner, real action-tier execution (file/shell/git/web/MCP/connector — actual subprocesses and HTTP, not text). Baseline scores from 06-24 audit §5; **Integr** re-scored this pass for the 10-native-connector reach.

| Agent | Replaces | Readiness | Change since 06-24 | Biggest remaining gap |
|---|---|---|---|---|
| developer | Software engineer | **78%** | +8 (asana/trello/clickup/azure_devops native; MCP sequence) | Full issue→PR→CI→merge outcome proven in prod |
| full-stack-developer | Full-stack eng | 72% | +7 | Deploy-pipeline actions; graceful-degradation gaps (never hard-fails) |
| devops | DevOps/SRE | 62% | +7 | Cloud-provider (AWS/Azure/GCP) native actions |
| tester | QA engineer | 66% | +6 | Real test-env orchestration |
| customer-support-executive | Support rep | 62% | +7 | Ticketing write-back depth |
| project-manager | PM | 60% | +10 (asana/trello/clickup native) | Reporting autonomy |
| sales-agent | SDR/AE | 52% | +2 | CRM write connectors (Salesforce/HubSpot absent) |
| business-analyst | BA | 52% | +2 | Data-source connectors |
| recruiter | Recruiter | 46% | +1 | ATS integrations (none native) |
| content-writer | Copywriter | 52% | +2 | CMS publishing |
| technical-writer | Tech writer | 54% | +4 (confluence via generic REST) | Native Confluence write |
| marketing-specialist | Marketer | 42% | +2 | Marketing-platform connectors |
| corporate-assistant | EA | 42% | +2 | **gmail/outlook are KNOWN_UNIMPLEMENTED** — calendar/email execution blocked |
| mobile | Mobile eng | 52% | +2 | Device/build farm |
| meeting-agent | (voice-presence sub-agent) | 52% | +2 | By-design sub-agent |

**Do agents perform real work or only generate text?** Real work: `local-workspace-executor.ts` (~11,700 lines, ~20 action tiers) executes subprocesses, git operations, HTTP, MCP calls, and connector actions. Error recovery/retry exists per tier; long-running support via the autonomous loop + durable approvals. Collaboration exists (handoff manager, GOAP multi-agent plans) but is the least-exercised path.

---

## 4. Human Employee Simulation — the biggest change since June

The June audit found no employee-lifecycle layer. It now exists:

- **Employee identity / department / org chart:** `AgentPersona` model with `employeeId`, manager→reports tree, `GET /v1/personas/org-chart` (`personas.ts:285+`).
- **Working hours & timezone:** persisted per persona (`personas.ts:52-53,167-168`); tz-aware evaluation in `packages/shared-types/src/shift.ts` (`evaluateShift`).
- **Shift gate at task intake:** `apps/trigger-service/src/shift-enforcer.ts` — off-shift tasks are held/deferred, not silently executed.
- **Availability API:** `GET /v1/personas/:botId/availability` returns on-shift flag + next shift-open instant (`personas.ts:244`).
- **VM start at shift start / deallocate after shift:** `apps/api-gateway/src/lib/shift-vm-reconciler.ts` — pure reconciler: any persona on-shift → VM ON; all off-shift → deallocate ("releases compute billing at shift close").
- **Task assignment / completion / progress:** task lifecycle + SSE progress (`sse-tasks.ts`), approval queue, decision latency tracking.
- **Manager notifications / escalation:** notification adapters + human-gate requests (e.g. `content-writer/human-gate-requests.ts`), approval escalation.

**Developer Agent end-to-end check** (receive ticket → code → PR → update ticket): ticket intake via C4 tracker-poller (Jira/Linear/GitHub with dedup + secret auth, 94 tests), repo access/branch/code/test/fix via action tiers, PR creation via native GitHub executor, ticket update via jira/github/linear executors. **All steps have code paths.** What's missing is a *proven, repeated production run* of the full chain — the capability exists, the operational evidence doesn't.

---

## 5. MCP Review

| Requirement | Status | Evidence |
|---|---|---|
| Dynamic MCP registration | ✅ | MCP registry routes + `mcp-registry-client.ts` |
| Multiple servers / customer-specific config | ✅ | Per-tenant registry; managed catalog (24 `id:` entries in `managed-mcp-catalog.ts`, up from 8) |
| Runtime tool discovery | ✅ | `tools/list` in `mcp-protocol-client.ts:149` |
| Runtime invocation during agent execution | ✅ | Agents autonomously choose `mcp_tool_call` → approval → real `tools/call` (verified e2e per memory + 06-24 audit) |
| **Multi-step sequencing** | ✅ **now implemented** | `mcp_tool_sequence` action (`local-workspace-executor.ts:11653`): ordered calls over one persistent session, stops at first failure, MEDIUM-risk = one approval per sequence (`mcp-sequence.test.ts`) |
| Permission enforcement | ✅ | Per-tool deny (`_mcp_denied_tools`) checked before invoke; approval floor — `mcp_tool_call` can never auto-approve (`risk-policy.ts`) |
| Auth / error handling / failover | ✅ / ✅ / ⚠️ | Streamable-HTTP + SSE, healthCheck; no automatic failover between equivalent servers |

MCP is used during real execution, not just configured in the UI. Remaining: server failover, health-driven catalog UX.

## 6. Connector Review

- **Native executors (10):** jira, github, slack, teams, gitlab, linear, asana, trello, clickup, azure_devops — all in the live path `provider-clients.ts` → `createRealProviderExecutor` (`:2128`).
- **Generic escape hatch (5):** generic_rest, generic_rest_code/email/messaging, generic_smtp — runnable with base_url + auth (covers custom APIs, Confluence, etc.).
- **Consciously unimplemented (8):** amazon_connect, generic_telephony, genesys, gmail, monday, outlook, twilio, vonage — must be hidden/disabled in UI; `connector-coverage.test.ts` **fails CI** if any advertised connector is uncategorized.
- **June's #1 critical finding (bifurcation + silent simulator) is resolved** — the simulator can no longer mask gaps undetected, and reach went 3 → 15 executable.
- Token lifecycle (refresh/revoke/re-consent) workers present; secrets via Key Vault refs.
- **Gap:** no Salesforce/SAP/ServiceNow/HRMS/ATS native connectors — the enterprise-suite tier the prompt asks about is only reachable via generic REST.

## 7. Webhook Review

- **Inbound:** fail-closed pattern (secret set → signature required; absent → 503), `timingSafeEqual`, 8 documented secrets; trigger rules with HMAC + cascade-delete schema.
- **Outbound:** per-tenant domain allow/deny at **create and dispatch** with SSRF floor first; HMAC-SHA256 signed bodies; 10s timeout; **circuit breaker** per webhook; delivery records; **DLQ** at 5 consecutive failures (`WebhookDlqEntry`) with admin replay that resets the circuit (`webhook-dispatcher.ts:117-211`).
- Agents can both trigger outbound events and be triggered by inbound webhooks (trigger-service → task intake).
- **Gap:** no automatic scheduled retry/backoff between failure and DLQ — a failed delivery waits for manual replay.

## 8. Governance & Policy Engine Review

Fully re-verified 06-27 (`GOVERNANCE-POLICY-ENGINE-REAUDIT.md`), further hardened since (A1/A2/B3/B4 + tamper-evident chain, commits `ab8d9fdc`–`ee61bed4`):

- **Not hardcoded:** customers create policies in the dashboard editor or **upload policy documents** (PDF/DOCX) → LLM extracts candidate rules → human review → versioned `GovernancePolicy` → runtime enforcement. Verified live end-to-end.
- **The required flow exists:** Task → planning → policy retrieval (`getPolicyEvaluateFn()` injected into task processing) → OPA fail-closed floor + direct-read enforcers (role/connector-verb/env/time-window/MCP-tool/webhook-domain) → RBAC (14 data-driven roles + tenant overlay) → approval check (risk classification; MEDIUM/HIGH → durable approval queue; `require_approval` rules via shared matcher, B4) → execution → audit + violation recording.
- **Post-approval re-evaluation (A1):** deny policy re-checked on the approved-resume path — an approval can't outlive a policy change.
- **Single shared matcher (A2)** replaced the dual-path concern from 06-27.
- **Scopes:** tenant, role, **workspace, agent** (B3).
- **Tamper-evident:** hash-chained violations + compliance export (`violation-integrity.test.ts`).
- Spending limits: event-sourced budget policy (daily/monthly, 80% warn / 90% throttle, hard-stop).
- **Caveats:** violation recording is fire-and-forget (best-effort); simulator doesn't clock-evaluate time-window rules; export caps at 500 rows.

**Governance score: ~90/100.** Policies are enforced, not merely stored.

## 9. Security Audit

| Control | State | Evidence |
|---|---|---|
| AuthN | ✅ | Signed cookie sessions, 32+ char secret, customer/internal scope split |
| AuthZ / RBAC | ✅ | Role rank checks in handlers; data-driven role policies; tenant overlay |
| Session mgmt | ✅ | Expiry in payload; public paths explicitly allowlisted |
| Rate limiting | ✅ | Per-IP 180/min (20/min auth), per-tenant 600/min, Redis-backed |
| Inter-service auth | ✅ | HMAC shared tokens, `timingSafeEqual` (8 modules across gateway/runtime/trigger) |
| Secrets | ✅ | Azure Key Vault refs; gitleaks in CI; tracked `.auth.sqlite` **removed** (June finding fixed) |
| Encryption in transit | ✅ prod | Cloudflare TLS; mTLS in connector-gateway |
| Encryption at rest | ⚠️ | Delegated to Azure disk/Postgres encryption; no app-level field encryption for connector tokens beyond Key Vault refs |
| SQLi | ✅ | Prisma parameterized; prior raw-SQL findings remediated (06-13 audit §11) |
| XSS/CSRF | ✅ | React escaping; same-site cookie; dashboard proxy keeps tokens server-side |
| SSRF | ✅ | Webhook SSRF floor (non-negotiable, ahead of tenant policy) |
| Prompt injection | ⚠️ Partial | Payload sanitizer on MCP path, information-disclosure guard (support agent), approval gates as backstop — but no systematic injection-detection layer on retrieved/ingested content (RAG docs, webhook bodies, connector responses) |
| Tool injection / MCP security | ✅ | Capability allowlist, per-tool deny, non-bypassable approval floor |
| Tenant isolation | ✅ | All queries scoped to `session.tenantId`; never from request body (enforced pattern + auth-regression tests) |
| File upload validation | ✅ | Policy-doc pipeline converts/validates before LLM extraction |
| Dependency vulns | ✅ | SCA + Semgrep + gitleaks CI jobs |
| Audit integrity | ✅ | Append-only + hash-chained violations + Axiom mirror |

**Weaknesses to fix:** (1) no dedicated prompt-injection screening of untrusted retrieved content before it enters agent context — the highest-leverage security gap for an agent platform; (2) at-rest field encryption for stored connector credentials outside Key Vault path; (3) periodic verification job for the audit hash chain (currently verified on export/test).

## 10. Multi-Tenant Audit

Customer/data/secret/connector/MCP/policy/agent/audit isolation all keyed on `tenantId` from the **session**, never the request body; per-tenant MCP registry, per-tenant webhook domain policy, per-tenant Key Vault secret refs, per-tenant Axiom log tagging, VM-per-tenant execution isolation. Auth-regression test suite guards new routes. **No cross-tenant access path found.** Residual risk: in-process workers share one process across tenants (isolation is logical, not physical, at the gateway layer).

## 11. Scalability & Performance Review

The least-proven axis — unchanged in kind since June, improved in tooling:

- **Bottlenecks:** single Postgres (pgvector pins you here), single Redis, in-process workers by default (`AF_WORKERS_DISABLED=1` offloads to worker-runner but that's not the default), VM-per-tenant is strong isolation but operationally heavy at hundreds of tenants.
- **Known reliability bug:** agent-runtime restart loop (WSL2 dev) silently drops in-memory queued tasks — queued work is not fully durable across restarts.
- **Load testing:** `scripts/load-test-fullstack.mjs` harness ready; **never run against a provisioned environment** — no throughput/latency numbers exist.
- **No K8s / autoscaling / HA / DR runbook.** Docker Compose + one Azure VM. Backup strategy for Postgres not evidenced in repo.
- Performance hygiene present: Redis classification cache (with the approval-bypass fix applied), connection pooling via Prisma, per-call token/cost tracking in Langfuse.

**Verdict:** fine for ~10 pilot tenants; not validated for hundreds of customers / thousands of agents.

## 12. Code Quality Review

- **Strong:** 462 test files (node:test), TDD-built governance (100+ tests), strict TS, 12-job CI, consistent route/auth patterns, June's dead-code/dup-module sweep done (services 17→15, memory/notification consolidation).
- **Debt (ranked):**
  1. **`local-workspace-executor.ts` ~11,700 lines** — the single biggest maintainability risk; needs decomposition into per-tier modules.
  2. `runtime-server.ts` (~4,000+ lines) — same pattern.
  3. In-memory task queue durability (restart loss).
  4. Root-dir litter: this session's untracked LinkedIn/pageinfo txt files + `.af_test_token.txt` (a token file in repo root — delete it).
  5. Docs drift is now minor (CLAUDE.md refreshed 06-27) but model/route counts drift again with every sprint.

## 13. Production Readiness Assessment

| Area | State |
|---|---|
| Reliability | ⚠️ In-memory queue loss on restart; no HA |
| Observability | ✅ Langfuse + Axiom + Azure Monitor, per-tenant |
| Alerting | ⚠️ Metrics/logs shipped, but no alert rules/on-call runbook in repo |
| Logging | ✅ Structured, tenant-tagged, audit-mirrored |
| Backup / recovery | ❌ Not evidenced (no pg backup automation, no DR doc) |
| Deployment pipeline | ✅ CI 12 jobs + Docker builds; ⚠️ no staged rollout/rollback automation |
| Config management | ✅ `.env.example` complete; fail-closed webhook config |
| Rollback strategy | ⚠️ Manual (image re-tag); documented gotcha about rebuild/recreate |

## 14. Gap Analysis

| Component | Expected | Current State | Gap | Severity | Recommended Fix |
|---|---|---|---|---|---|
| Connector reach | All advertised executable | 15/23 executable; CI guard | gmail, outlook, monday, telephony; no Salesforce/SAP/ServiceNow/ATS | High | Native gmail/outlook next (unblocks corporate-assistant); enterprise suites per demand |
| Autonomy proof | Agents own outcomes unattended | All code paths exist; controlled runs only | No repeated production outcome (issue→PR→merge) | High | Run + publish one reference outcome per flagship agent |
| Scale proof | 100s tenants / 1000s agents | Harness ready, never run; single-node infra | No numbers; no HA/DR | **Critical for GA** | Provisioned-env load run; pg backups; externalize workers by default |
| Queue durability | No task loss on restart | In-memory runtime queue | Restart drops queued tasks | High | Persist queue to Redis/Postgres with recovery on boot |
| Prompt-injection defense | Screen untrusted content | Sanitizer + approval backstop only | No screening of RAG/webhook/connector content entering context | High | Injection filter at content-ingestion chokepoints |
| Backup/DR | Automated backup + restore runbook | None evidenced | Data-loss exposure | High | pg_dump/PITR automation + tested restore |
| Alerting | On-call alert rules | Telemetry only | No alert definitions | Medium | Axiom monitors + notification routing |
| Executor modularity | Maintainable modules | 11.7k-line executor file | Change risk | Medium | Decompose per action tier |
| Kubernetes/HA | Multi-node orchestration | Compose + single VM | No failover | Medium (pilot) / High (GA) | Helm chart or Azure Container Apps when tenant count demands |
| Webhook retry | Backoff retry before DLQ | Fail → circuit → DLQ (manual replay) | No auto-retry | Low | Scheduled backoff retries |

## 15. Readiness Scores (0–100)

| Dimension | Score | (June 24) |
|---|---:|---:|
| AI Agent Architecture | 78 | 65 |
| Human Role Replacement | 60 | 40 |
| MCP Integration | 82 | 60 |
| Connector Framework | 68 | 30 |
| Webhook Framework | 80 | — |
| Governance | 90 | 38* |
| Policy Enforcement | 90 | 45* |
| Security | 78 | 72 |
| Multi-Tenancy | 82 | — |
| Scalability | 35 | 30 |
| Performance (evidenced) | 45 | — |
| Reliability | 55 | — |
| Maintainability | 68 | — |
| **Production Readiness** | **62** | — |
| **Enterprise Readiness** | **55** | ~35 |

*Governance baselines from the 06-25 audit scale.

**Final architecture score: 76/100 · Overall platform maturity: 72/100.**

## 16. Final Verdict — the 10 questions

1. **Does it implement the AI Workforce vision?** Yes, structurally and now behaviorally: identity, departments, shifts, VM-per-shift lifecycle, real action execution, governance. The skeleton *and* most of the muscle exist; operational proof is the missing piece.
2. **Can agents truly replace human employees?** Not fully. Developer/devops/support agents can own meaningful task surfaces under approval (~70-78% readiness); the business-role agents (recruiter, marketer, EA) remain copilot-grade until their domain connectors exist.
3. **Will agents execute real work autonomously?** They *can* — action tiers, autonomous loop, GOAP, durable approvals all execute. Sustained unattended operation hasn't been demonstrated repeatedly in production.
4. **Customer-specific MCP servers?** Yes — per-tenant registration, discovery, single-call and multi-step invocation, per-tool governance, non-bypassable approvals. Failover is the gap.
5. **Customer-specific connectors?** Yes for 15 (10 native + generic REST/SMTP for custom APIs); CI prevents silent gaps. Enterprise suites (Salesforce/SAP/ServiceNow) only via generic REST.
6. **Customer-specific webhooks?** Yes — inbound fail-closed verified, outbound signed with domain policy, circuit breaker, DLQ + replay. Auto-retry backoff missing.
7. **Do uploaded governance policies influence runtime behavior?** **Yes — verified live**: upload → extract → review → versioned policy → runtime deny/approve enforcement, including on the approved-resume path.
8. **Security & governance consistent across the platform?** Largely yes (shared matcher, fail-closed patterns, tenant scoping, hash-chained audit). Prompt-injection screening of untrusted content is the notable inconsistency.
9. **Safe for enterprise customers?** Safe enough for governed design-partner pilots with human approval gates. Not yet for unattended enterprise deployment (backup/DR, HA, injection screening outstanding).
10. **Production-ready today?** **Pilot-production ready; not GA-ready.** Gate GA on: load-test numbers, queue durability, backup/DR, prompt-injection screening, gmail/outlook connectors, and one published end-to-end autonomous outcome.

## 17. Prioritized Remediation Roadmap

**P0 (GA blockers):** run the full-stack load test in a provisioned env and publish numbers → make runtime task queue durable across restarts → automated Postgres backup + tested restore → prompt-injection screening at content-ingestion chokepoints → delete `.af_test_token.txt` and session litter from repo root.
**P1:** native gmail/outlook executors (unblocks corporate-assistant + recruiter) → one published reference autonomous outcome (developer: ticket→PR→CI→merge) → alert rules + on-call runbook → externalize workers by default.
**P2:** decompose `local-workspace-executor.ts` → MCP server failover → webhook auto-retry backoff → Salesforce/ServiceNow natives per customer demand → K8s/Container Apps path when tenant count warrants.

---
*Figures verified against `ee61bed4` on 2026-07-02. Prior verified baselines: `docs/audit/2026-06-24/`, `docs/audit/2026-06-27/`.*
