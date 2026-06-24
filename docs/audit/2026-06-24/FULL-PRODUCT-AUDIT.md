# AgentFarm — Full Product & Architecture Audit

> **Date:** 2026-06-24 · **Method:** evidence-based source verification against the working tree at `ee3b39e3` (branch `main`). Every quantitative claim was produced by scripted enumeration or direct file reads; file:line citations are given. Items not verifiable from the repo are marked **Unknown**.
> **Predecessor:** This supersedes `docs/audit/2026-06-13/` (commit `3507f49`). Major changes since then: end-to-end MCP execution, SSE-aware MCP client, arg-schema-rich catalog, durable approvals, RAG flywheel gaps closed.

---

## 1. Executive Summary

AgentFarm is a **genuinely large, genuinely functional multi-tenant agent platform** — far more than a chatbot wrapper. The verified surface: 3,575 TS/TSX files, 106 Prisma models, 54 migrations, 109 api-gateway route files (97 auth-gated), 15 role agents each with action handler + RAG retriever + lesson pipeline, a 11,600-line local action executor exposing ~20 action tiers, a real MCP protocol client (initialize/list/call over streamable-HTTP+SSE), and 12 real connector classes that make actual HTTP calls to GitHub/Jira/Slack/etc.

**The headline finding is not "it's fake" — it's "it's two systems wearing one coat."** There is a consistent gap between the *breadth that is wired and demonstrable* and the *breadth that is advertised*:

1. **MCP is real and end-to-end** (agent autonomously chooses `mcp_tool_call` → approval → real `tools/call`), but the **managed MCP catalog has only 8 entries** and multi-step sequencing is still a **design spec, not code** (commit `bc21f3fc` is docs-only).
2. **Integrations are bifurcated.** `services/connector-gateway/src/connectors/` holds 12 real connector classes, but the **path agents actually execute through** (`apps/api-gateway/src/lib/provider-clients.ts`) only implements **3 providers for real (jira, github, slack)** — everything else returns `unsupported_action`. The rich connector classes are **not imported** by the live execution path.
3. **Agents take real actions** (file/shell/git/web/MCP/connector tiers all execute), but **autonomy is shallow** — there's an autonomous-loop orchestrator and a GOAP planner, but most value still flows through single-task request/approval/execute.

**Maturity score: 58/100.** This is a strong **late-alpha / early-beta** engineering artifact with excellent hygiene (fail-closed auth, timing-safe comparisons, Azure Key Vault secret refs, 54 migrations, 12-job CI) but real depth gaps between the demo surface and production-grade "replace a human" capability. **Commercial scale readiness: ~35%.**

**Is it an AI workforce platform or a chatbot platform?** Architecturally it is unambiguously a *workforce* platform — the action tiers, approval governance, connector execution and audit trail are not things a chatbot has. But **today** most agents are closer to "a very capable copilot that can be approved to take a few real actions" than "a digital employee that owns an outcome end-to-end."

---

## 2. Architecture Diagram (verified)

```
                          CUSTOMER SURFACE
  website (Next.js, 100 pages, 26-page /dashboard)   dashboard (Next.js, 97 pages, 299 proxy routes)
                 │                                          │
                 │  X-Dashboard-Token / session cookie      │
                 └──────────────────┬───────────────────────┘
                                    ▼
                         API GATEWAY (Fastify, :3000)
        109 route files / 97 use getSession / 14 domain groups
   auth · billing(Stripe+Razorpay) · approvals · connectors · governance
   (kill-switch, circuit-breakers) · MCP registry · audit · secret-store(KeyVault)
        │                 │                     │                    │
        ▼                 ▼                     ▼                    ▼
  TRIGGER (:3002)   AGENT RUNTIME (:4000)   ORCHESTRATOR (:3011)   PostgreSQL16+pgvector
  webhooks/IMAP/    LLM dispatch (9 prov.)  GOAP planner            Redis7
  Slack             ~20 action tiers        routine-scheduler       OPA (:8181)
                    MCP client (SSE)        proactive-signal
                    15 role agents          autonomous-loop
                    RAG flywheel
        │
        ▼ (real HTTP)
  CONNECTORS: provider-clients.ts → github/jira/slack ONLY (real)
              connector-gateway/connectors/ → 12 classes (built, NOT wired to exec path)

  VOICE/MEETINGS (opt-in profiles): whisper · kokoro/xtts/mms-tts · voxcpm · freeswitch · zoom/teams bots
  OBSERVABILITY: Langfuse (LLM) · Axiom (infra) · Azure Monitor (VM host)
```

---

## 3. Detailed Findings

### 3.1 Agent execution is real
- `apps/agent-runtime/src/local-workspace-executor.ts` is **11,600+ lines with ~20 action tiers** (file ops, shell, git, patch/apply, test-run, web search/research `:11636`, debug sessions `:11672`, MCP `:11597`, browser, etc.). These execute real subprocesses and HTTP — not text generation.
- `mcp_tool_call` (`:11597`) calls `invokeMcpTool` → `McpProtocolClient` (`apps/agent-runtime/src/mcp-protocol-client.ts:93`) which implements `initialize` `:116`, `tools/list` `:149`, `tools/call` `:172`, `healthCheck` `:203` over MCP streamable-HTTP + SSE (`:231`, `:259`). **This is a correct, spec-compliant MCP client.**
- Risk floor enforced: `mcp_tool_call` can never be auto-approved (`execution-engine.ts:238`, `domain/risk-policy.ts`). Matches the durable-approval design.

### 3.2 RAG flywheel — previously-flagged gaps are CLOSED
The 2026-06-13 audit listed 8 agents with missing RAG injection / `ingestApproved` / default cases. Re-verified 2026-06-24:
- `customer-support-executive` now calls `ingestResolvedTicket` (`...action-handler.ts:797`) + `ingestSupportFeedback` `:813`.
- `content-writer` now calls `ingestPublishedContent` (`:841`) + `ingestContentFeedback` `:856`.
- Default-case guards present in project-manager, sales-agent, recruiter, tester, corporate-assistant, customer-support, content-writer handlers.
- RAG context injection counts are non-zero across all checked handlers.
**Verdict: the flywheel is wired for all 15 role agents.** (Effectiveness depends on embedding quality + data volume — Unknown without runtime data.)

### 3.3 The integration bifurcation (most important technical-debt finding)
- Real connector classes exist and make real API calls: `services/connector-gateway/src/connectors/` → azure-devops, confluence, email, github, gitlab, jira, linear, notion, pagerduty, sentry, slack, teams (12). Sample verified: `azure-devops-connector.ts:102` real `fetch`, Basic auth, work-item API.
- **But the live agent execution path does NOT use them.** `apps/api-gateway/src/routes/connectors/connector-actions.ts:706` picks `createRealProviderExecutor` from `apps/api-gateway/src/lib/provider-clients.ts` when a `secretStore` is present — and that file only implements **jira (`:1279`), github (`:1309`), slack (`:1354`)** for real; all other actions return `unsupported_action` (`:392,:412,:663,:880,:907,:1373`). `provider-clients.ts` does **not import any `connector-gateway` connector class** (grep: zero matches).
- `defaultProviderExecutor` (`:581`) is a **pure simulator** (`simulate_transient_failures`, `simulate_error_code`) used whenever no secret store is wired.
**Impact:** of 23 advertised connectors, only **3 are executable through agents today**. The other 9 built classes are dead-ended; the remaining ~11 registry entries have no implementation at all.

### 3.4 MCP catalog & multi-step
- `apps/api-gateway/src/lib/managed-mcp-catalog.ts` has **8 entries**. Arg-schema enrichment landed (`454e2a5c`).
- Multi-step MCP sequences: **design spec only** (`bc21f3fc` is `docs(mcp)`, no implementation). Single-call MCP works end-to-end.

### 3.5 Governance & autonomy
- Real governance routes: `governance/kill-switches.ts`, `governance/circuit-breakers.ts`, `governance/budget-policy.ts`; OPA wired (`OPA_BASE_URL`).
- Autonomy: `apps/agent-runtime/src/autonomous-loop-orchestrator.ts` + `autonomous-coding-loop.ts`; orchestrator has `goap-planner.ts`, `routine-scheduler.ts`, `proactive-signal-detector.ts`, `task-scheduler.ts`. Infrastructure exists; **depth of real autonomous operation is Unknown** (no runtime evidence in tree).

### 3.6 Security posture (spot-verified)
- Auth coverage: 97 of 109 route files call `getSession`. `timingSafeEqual` used in 6 gateway modules (inter-service HMAC).
- Secret store backs **Azure Key Vault** (`kv://`, full vault URL) with `env://` dev fallback (`lib/secret-store.ts:5-7`).
- Fail-closed CORS, per-path portal allowlist, parameterized SQL — all confirmed remediated in the 2026-06-13 audit and unchanged.

---

## 4. Gap Analysis Table

| Area | Planned Architecture | Current Implementation | Gap | Severity |
|---|---|---|---|---|
| Agents | 15 digital employees owning outcomes | 15 agents w/ action handlers + RAG + lessons; real action tiers | Outcome-ownership shallow; mostly single-task | High |
| MCP | Agents discover+chain MCP tools across workflows | Real single-call MCP client (SSE); 8-entry catalog | Multi-step = spec only; thin catalog | High |
| Integrations | 23 connectors usable by agents | 3 executable (github/jira/slack); 9 built-but-unwired; ~11 registry-only | Execution path ≠ connector classes | **Critical** |
| Customer Dashboard | Browse/deploy/manage/monitor agents | website /dashboard (26 pages) + dashboard (97) | QA blockers historically; provisioning fragility | Medium |
| Admin Dashboard | Full internal ops console | Pages exist (billing, observability, infra-monitoring, tenant) | Coverage partial; not a unified console | Medium |
| Automation | Workflows + schedules + proactive | GOAP planner, routine-scheduler, autonomous loop present | Real autonomous operation unproven | High |
| Memory | Semantic + episodic per workspace | pgvector AgentKnowledgeBase + AgentLongTermMemory, write/search hooks | Effectiveness unmeasured | Low |
| Tool Usage | Rich tool calling | ~20 action tiers, executed | Browser/desktop tiers heavy infra | Low |
| Security | Multi-tenant, fail-closed, KeyVault | Confirmed strong | Connector simulator can mask prod gaps | Medium |
| Scalability | Multi-tenant horizontal | In-process workers default; Redis/Postgres single | No proven horizontal scale; VM-per-tenant | High |

---

## 5. Agent-by-Agent Review (scores 1-10)

All 15 role agents have: profile, registration, action handler, RAG retriever, lesson pipeline, MCP provisioner (verified by file presence). Scores below: **Acts** (executes real actions), **Tools** (action tiers), **Integr** (real connector reach), **MCP**, **Mem** (RAG flywheel), **Auto** (autonomy).

| Agent | Replaces | Acts | Tools | Integr | MCP | Mem | Auto | Readiness % | Major missing |
|---|---|---|---|---|---|---|---|---|---|
| developer | Software engineer | 8 | 9 | 5 | 7 | 8 | 6 | **70%** | Multi-repo autonomy, real CI integration depth |
| full-stack-developer | Full-stack eng | 8 | 9 | 5 | 7 | 7 | 5 | 65% | Deploy pipeline actions |
| devops | DevOps/SRE | 6 | 7 | 4 | 6 | 7 | 5 | 55% | Cloud-provider actions beyond github/slack |
| tester | QA engineer | 7 | 7 | 4 | 6 | 7 | 5 | 60% | Real test-env orchestration |
| sales-agent | SDR/AE | 5 | 5 | 3 | 5 | 7 | 4 | 50% | CRM write actions, outbound automation |
| recruiter | Recruiter | 4 | 4 | 3 | 5 | 7 | 3 | 45% | ATS integrations, scheduling |
| customer-support-executive | Support rep | 5 | 5 | 4 | 5 | 8 | 4 | 55% | Ticketing write-back, escalation workflow |
| business-analyst | BA | 5 | 5 | 3 | 5 | 7 | 3 | 50% | Data-source connectors |
| project-manager | PM | 5 | 5 | 4 | 5 | 7 | 3 | 50% | Jira write depth (partial), reporting autonomy |
| marketing-specialist | Marketer | 4 | 4 | 2 | 5 | 7 | 3 | 40% | Marketing platform connectors |
| content-writer | Copywriter | 6 | 5 | 2 | 5 | 7 | 3 | 50% | CMS publishing actions |
| technical-writer | Tech writer | 6 | 5 | 3 | 5 | 7 | 3 | 50% | Confluence write (class exists, unwired) |
| corporate-assistant | EA | 4 | 4 | 2 | 5 | 7 | 3 | 40% | Calendar/email execution |
| mobile (sub of tester) | Mobile eng | 6 | 6 | 3 | 5 | 7 | 4 | 50% | Device/build farm |
| meeting-agent (sub-agent) | — (voice presence) | 6 | 5 | 3 | 4 | 7 | 4 | 50% | Standalone by design; live-brain RAG wired |

**Pattern:** Memory/RAG scores are uniformly high (flywheel is wired everywhere); **Integration scores are uniformly low** because only github/jira/slack execute. The single biggest lever for *every* agent is closing the connector-execution gap.

---

## 6. MCP Review

| Question | Answer | Evidence |
|---|---|---|
| Is MCP actually implemented? | **Yes** | `mcp-protocol-client.ts:93` full client |
| Connected to agents? | **Yes** | `local-workspace-executor.ts:11597`, allowed to every role `runtime-server.ts:1003` |
| Used in workflows? | **Single-call yes; multi-step no** | exec verified; `bc21f3fc` multi-step is docs only |
| Partially implemented? | Catalog thin (8) | `managed-mcp-catalog.ts` |
| Transport | streamable-HTTP + SSE | `mcp-protocol-client.ts:231,259` |
| Governance | mcp calls forced through approval | `execution-engine.ts:238` |

**Verdict:** MCP is the most genuinely-complete "advanced" capability in the platform. Priorities: grow the managed catalog, ship multi-step sequencing, add MCP server health/registry UX.

---

## 7. Integration Review

- **Real & wired:** github, jira, slack (`provider-clients.ts`).
- **Built but NOT wired to execution:** azure-devops, confluence, email, gitlab, linear, notion, pagerduty, sentry, teams (`connector-gateway/src/connectors/`, real `fetch`, never imported by `provider-clients.ts`).
- **Registry-only (no impl):** remainder of the 23-entry `CONNECTOR_REGISTRY` incl. telephony.
- **Simulator risk:** `defaultProviderExecutor` returns success without a secret store — tests/demos can pass while production does nothing. This is **dead-code-adjacent and dangerous** because it masks the gap.

**This is the #1 fix to make the "AI workforce" claim true:** route `connector-actions.ts` through the existing `connector-gateway` connector classes instead of the 3-provider `provider-clients.ts`.

---

## 8. Security Review

| Control | State | Evidence |
|---|---|---|
| Route auth | 97/109 route files use getSession | grep |
| Inter-service HMAC | timingSafeEqual in 6 modules | grep |
| Secrets | Azure Key Vault refs + env dev fallback | `secret-store.ts:5-7` |
| Webhooks | fail-closed pattern (CLAUDE.md table) | documented + prior audit |
| CORS / portal / SQLi | remediated | 2026-06-13 audit §11 |
| **Concerns** | (a) tracked `apps/website/.auth.sqlite` in git; (b) connector simulator can hide auth/secret misconfig in prod; (c) 12/109 routes without getSession — verify each is intentionally public | — |

No critical vulnerabilities found in this pass. Posture is above-average for a pre-GA product.

---

## 9. Scalability Review

- **Workers in-process by default** (`AF_WORKERS_DISABLED=1` to offload) — fine for now, not horizontally proven.
- **Single Postgres / single Redis** — pgvector ties you to Postgres (can't shard trivially). Memory note confirms Upstash/managed migration is deferred.
- **VM-per-tenant provisioning** (Azure state machine) — strong isolation, **expensive and operationally heavy at scale**; the dev VM is on a Mon-Fri 6-9PM budget schedule, indicating cost sensitivity.
- **No load/perf testing evidence** in tree. **Scalability is the least-proven axis.**

---

## 10. Prioritized Action Plan — CTO Top 20

**Critical (do first — makes the core claim true)**
1. Wire `connector-actions.ts` execution through the 12 real `connector-gateway` connector classes; delete/guard `defaultProviderExecutor` so prod can't silently simulate.
2. Implement real executors for the remaining advertised connectors or **remove them from the registry/UI** (truth-in-advertising).
3. Add an integration test that fails if any registry connector has no real executor.

**High**
4. Ship MCP multi-step sequencing (move `bc21f3fc` spec to code).
5. Expand managed MCP catalog beyond 8; add server health + per-tenant registry UX.
6. Prove one agent end-to-end "owns an outcome" (e.g., developer: issue→PR→CI→merge) as a reference workflow.
7. Demonstrate + document one real autonomous loop run with guardrails.
8. Load/throughput test agent-runtime + approval path; publish numbers.
9. Externalize workers (worker-runner) as the default for multi-tenant.
10. Reconcile the duplicated `memory-service`/`notification-service` (package vs service) — pick one.

**Medium**
11. Build a unified internal admin console (billing + tenants + agent lifecycle + observability in one place).
12. Harden customer-dashboard provisioning path (historic QA blockers).
13. Audit the 12 routes lacking `getSession`; document allowlist.
14. Remove `apps/website/.auth.sqlite` from git; add to .gitignore.
15. Measure RAG flywheel effectiveness (retrieval hit-rate, lesson reuse) — instrument it.
16. Connector secret onboarding UX (Key Vault refs are powerful but operator-hostile today).

**Low / hygiene**
17. Root-level cleanup: build `*.log`, `cloudflared.exe`, `routes_raw.txt`, `read.md`, scattered `digest_*.md`.
18. Refresh CLAUDE.md/README counts (106 models, 109 routes, 54 migrations) — drift again.
19. Clarify `arcads/` embedded project purpose or remove.
20. Define and document the GA cutline: which agents ship "employee-grade" v1 vs "copilot-grade".

---

## 11. Final Readiness Score

| Dimension | Score |
|---|---|
| Engineering quality & hygiene | 80/100 |
| Agent action capability | 65/100 |
| MCP | 60/100 |
| Integrations (executable reach) | **30/100** |
| Autonomy (proven) | 40/100 |
| Memory/RAG (wired) | 75/100 |
| Security | 72/100 |
| Scalability (proven) | 30/100 |
| Docs accuracy | 45/100 |
| **Overall platform maturity** | **58/100** |
| **Commercial-scale readiness** | **~35%** |

### Answers to the 10 verdict questions
1. **Aligned with vision?** Directionally yes, materially partial — the skeleton matches, the integration muscle doesn't.
2. **Workforce or chatbot?** Architecturally a workforce platform; operationally still copilot-grade for most agents.
3. **Replacing humans today?** Not autonomously. Best case (developer/FSD with github/jira/slack) it's a strong assisted operator, ~65-70% of a junior's task surface under approval.
4. **MCP properly implemented?** Yes for single-call execution; multi-step pending.
5. **Incomplete features?** Multi-step MCP, 20/23 connectors, autonomous loops (unproven), unified admin console, horizontal scale.
6. **Biggest architectural gaps?** (a) connector execution bifurcation; (b) unproven autonomy; (c) unproven scalability; (d) simulator masking prod gaps.
7. **Build next?** Connector execution unification → MCP multi-step → one proven end-to-end autonomous outcome.
8. **Maturity score?** 58/100.
9. **Commercial scale readiness?** ~35% — pilot-ready for a narrow dev/devops use case with github/jira/slack; not broad-market ready.
10. **CTO top 20?** See §10.

---
*All figures verified against working tree `ee3b39e3` on 2026-06-24. Effectiveness/runtime-behavior items marked Unknown require live telemetry (Langfuse/Axiom) to close.*
