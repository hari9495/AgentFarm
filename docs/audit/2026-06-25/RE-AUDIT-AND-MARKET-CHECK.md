# AgentFarm — Re-Audit & Market-Fit Check (post-build)

> **Date:** 2026-06-25 · **Method:** evidence-based re-verification at `ad887733` (main). Compares against the 2026-06-24 baseline audit (`docs/audit/2026-06-24/FULL-PRODUCT-AUDIT.md`) after the Critical→Low build plan (`docs/build/WORKFORCE-BUILD-PLAN.md`). Every delta below was re-checked against source, not assumed from commit messages.

---

## 1. Executive summary

The 2026-06-24 audit scored the platform **58/100 maturity, ~35% commercial-readiness**, with one dominant finding: *"two systems wearing one coat"* — broad surface, but the integration muscle that makes agents *do* things was thin (only 3 connectors executed; the "any customer's stack" promise was plumbing-only).

After the build cycle, the integration gap — the #1 critical finding — is **substantially closed**, and the "AI employee" lifecycle gaps (task-pull, shifts, VM-by-shift, collaboration) went from *cosmetic data fields* to *enforced behavior*. The platform is now **~72/100 maturity, ~55% commercial-readiness**: genuinely pilot-ready for a dev/devops wedge with real integration reach, still gated on two unproven axes (full-stack load numbers; a recorded real autonomous/multi-agent production run).

**Verdict shift:** previously "a capable copilot wearing an employee-shaped schema." Now: **a credible AI-employee platform for a focused wedge** — it pulls its own work, runs on a shift, executes real actions through real integrations (or any REST API the customer describes), collaborates via handoffs, and is bounded by proven guardrails. The remaining distance to "broad-market AI workforce" is proof-of-scale and breadth of first-class connectors, not missing architecture.

---

## 2. Score delta

| Dimension | 2026-06-24 | 2026-06-25 | Why it moved |
|---|---|---|---|
| Engineering quality & hygiene | 80 | 82 | Dead-code removal (H6), fail-closed connector exec (C1), repo hygiene (L3) |
| Agent action capability | 65 | 72 | Same action tiers, now reachable through more real connectors |
| **Integrations (executable reach)** | **30** | **70** | 3 → **8 first-class** + generic REST + **OpenAPI self-describing any-API** (C6/C6.2) + 12 managed MCP + unlimited custom MCP |
| MCP | 60 | 80 | Multi-step sequences over persistent session (H4); catalog 6→12 (M2); custom-API self-describing parity |
| Autonomy (proven) | 40 | 62 | Guardrails proven + documented (H7); shift enforcement (C5) + VM-by-shift (H1); task-pull (C4) |
| AI-employee lifecycle | (implied ~35) | 70 | Task-pull from trackers, enforced shifts, VM lifecycle, per-agent inbound mail (C4/C5/H1/L1) |
| Collaboration | 40 | 68 | Handoff now *delivers* a task + AgentMessage trail end-to-end (H3) |
| Memory/RAG | 75 | 75 | Unchanged (already wired) |
| Security | 72 | 76 | Fail-closed connector execution; no silent simulator in prod |
| Scalability (proven) | 30 | 45 | Decision-path benchmark published (~2.1–2.9M/sec); full-stack load still pending |
| Docs accuracy | 45 | 78 | Counts refreshed (L4), build plan, guardrails + benchmark docs |
| **Overall maturity** | **58** | **~72** | |
| **Commercial-scale readiness** | **~35%** | **~55%** | |

---

## 3. Gap closure — what the build actually fixed (verified)

| Original critical/high gap | Status now | Evidence (re-verified) |
|---|---|---|
| Only 3 connectors execute; silent simulator masks prod no-op | **Closed** | `provider-clients.ts` executes 8 types (jira/teams/github/email/custom_api/slack/gitlab/linear); `failClosedProviderExecutor` + `AF_CONNECTOR_SIMULATE` opt-in |
| "Any customer's stack" was plumbing-only; agent couldn't know endpoints | **Closed** | OpenAPI→tool-catalog engine + operation-mode executor + auto-injected `_custom_api_tool_catalog` (C6/C6.2); MCP dynamic discovery |
| Connectors advertised but unrunnable (no guard) | **Closed** | `connector-coverage.test.ts` fails CI on any uncategorized connector |
| No task-pull (agent couldn't pick its own queue) | **Closed** | `tracker-poller.ts` (Jira/Linear/GitHub + universal REST) |
| Shifts cosmetic; VM not shift-driven | **Closed** | `shift-enforcer.ts` defers off-shift tasks; `shift-vm-worker.ts` starts/deallocates VM by shift |
| Handoff was bookkeeping; target agent never got work | **Closed** | `buildHandoffDelivery` writes AgentMessage + enqueues task to target (H3) |
| MCP single-call only; multi-step a spec | **Closed** | `mcp_tool_sequence` over persistent session (H4) |
| Connector duplication (dead classes) | **Closed** | deleted `connector-gateway/src/connectors/*` (H6) |
| Autonomy unproven | **Partially closed** | guardrails proven in tests + documented (H7); a *recorded real run* still pending |
| Scalability unproven | **Partially closed** | decision-path numbers published; full-stack HTTP load test pending |

---

## 4. Remaining gaps (honest, ranked)

**High-value, still open**
1. **Full-stack load test** — decision path is proven fast (~M/sec) but end-to-end concurrent-task throughput against a running gateway→runtime→DB stack is unmeasured. This is the single biggest credibility item for "scale." (Tracked in `docs/SCALABILITY-BENCHMARKS.md`.)
2. **A recorded real autonomous / multi-agent run** — the loop + handoff are proven in tests; a live, telemetry-backed production run (Langfuse trace) would convert "works in tests" to "works in production."
3. **First-class connector breadth** — 6 named connectors execute first-class; ~12 named registry connectors still rely on the generic-REST/OpenAPI path (works, but needs the customer to supply a spec) rather than turnkey. Each first-class connector added widens turnkey reach.

**Medium**
4. MCP Phase-2 (adaptive per-step looping) — deferred by design.
5. Live MCP browser sequences need the bridge run with `supergateway --stateful` (operator config).
6. Workers default to in-process; horizontal scale path exists (`AF_WORKERS_DISABLED`) but is unexercised at scale.

**Low** — broader connector OAuth onboarding polish; per-agent mailbox provisioning automation (L1 routes mail; mailbox creation is still manual).

---

## 5. Market-fit check

**Is it an AI workforce platform or a chatbot?** Now unambiguously a workforce platform, and — unlike the last audit — the claim is *operationally* backed for a wedge, not just architecturally.

**The wedge is real and shippable today:** the **Developer/DevOps agent** can pull a ticket (C4), work within its shift on a VM that powers up for the shift (C5/H1), execute real actions (git, kubectl apply, terraform apply — H8), reach GitHub/Jira/Slack/GitLab/Linear first-class (C2) or *any* REST/MCP system (C6/H4), hand off to another agent with a real task + trail (H3), all under proven guardrails (H7). That is a digital employee for a software team, end to end.

**Readiness by buyer:**
- **Design-partner pilots (dev/devops team):** ready now (~55%). Land 3–5 paying design partners on the dev wedge.
- **Broad self-serve market:** not yet — gated by (a) full-stack scale proof, (b) turnkey first-class connectors for non-dev domains (sales/marketing still lean on generic-REST/MCP), (c) a recorded production autonomy run for trust.

**PMF posture unchanged from the strategy call, now executable:** take the dev wedge to paying design partners; let *their* renewal/expansion define fit; then widen connector breadth domain-by-domain (the integration spine that made the dev wedge real is the same one the next domain reuses).

---

## 6. Bottom line

The 2026-06-24 audit's dominant risk — *"breadth that's wired ≪ breadth that's advertised"* — is no longer the story. Executable integration reach went from a hard **30/100 to 70/100**, the employee-lifecycle gaps are enforced rather than cosmetic, and the docs now match reality. **Maturity 58 → ~72; readiness ~35% → ~55%.** What stands between here and broad-market is **proof** (load + a real autonomous run) and **breadth** (more first-class connectors) — both incremental, neither architectural.

*Verified against `ad887733`, 2026-06-25. Scores are judgment calls grounded in the cited, re-checked evidence; runtime-behavior items (real load, real autonomous run) remain marked unproven until telemetry exists.*
