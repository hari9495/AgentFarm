# Autonomy Guardrails (H7)

How AgentFarm keeps autonomous agent loops safe to run unattended. Each control is enforced
in code and cited below; the proof tests live in
`apps/agent-runtime/src/autonomous-loop-guardrails.test.ts` (+ the broader
`autonomous-loop-orchestrator.test.ts`).

## What "autonomy" means here
An agent can iterate skills/actions toward a success criterion without a human in the loop
*per iteration* — e.g. the developer agent's `workspace_github_issue_fix` loop (write → test →
fix → retest). The loop is bounded, audited, cost-aware, and still subject to the same
approval + governance controls as any single action.

## Controls

| # | Guardrail | Enforcement | Evidence |
|---|---|---|---|
| 1 | **Hard iteration cap** — a config can never run more than 25 iterations, regardless of what the caller requests (stops runaway paid-API loops). | `effectiveMaxIterations = min(config.max_iterations, MAX_LOOP_ITERATIONS_HARD_CAP)` | `autonomous-loop-orchestrator.ts:64` |
| 2 | **Caller limit respected** — callers may request a *lower* bound than the cap. | same clamp | guardrail test |
| 3 | **Always terminal** — every run ends `success` or `failed`; never left `running`. Max-iterations exhaustion → `failed`. | terminal-state logic | `:154` + guardrail test |
| 4 | **Full audit trace** — every iteration appends a trace step (iteration #, skill, decision: retry/abort/branch/success). The trace is the auditable record of what the agent did and why. | `trace.push(buildTrace(...))` each iteration | `:76,:105,:135,:149` |
| 5 | **Cost-aware** — cumulative token/cost tracked across iterations; surfaced in the result. | `cumulativeTokensCost` | `:60` |
| 6 | **Approval still applies** — autonomous actions are classified by the same risk policy; MEDIUM/HIGH actions (e.g. `mcp_tool_call`, `mcp_tool_sequence`, connector writes) route through the approval queue before executing. Autonomy does not bypass approvals. | `domain/risk-policy.ts` | risk-policy tests |
| 7 | **Kill-switch + circuit breakers** — the platform-wide kill-switch (30s control window) and per-tenant circuit breakers halt execution independent of the loop. | `routes/governance/kill-switches.ts`, `circuit-breakers.ts` | governance tests |
| 8 | **Budget enforcement** — tenant/agent budget policy (daily/monthly limits, 80% warn, 90% throttle, hard-stop) bounds total spend a loop can incur. | `routes/governance/budget-policy.ts`, `lib/subscription-guard.ts` | billing tests |
| 9 | **Shift bounds** (C5/H1) — autonomous tasks are deferred outside an agent's shift, and the workspace VM deallocates off-shift, so loops can't run 24/7 unless configured to. | `trigger-service/shift-enforcer.ts`, `shift-vm-worker.ts` | shift tests |

## Proof run
`autonomous-loop-guardrails.test.ts` demonstrates an end-to-end loop that:
- requests 1,000,000 iterations and is clamped to ≤ 25 (control #1),
- terminates in a terminal state with a complete, per-step audit trace (controls #3, #4),
- respects a caller limit below the cap (control #2).

## Layered defense summary
A runaway or misbehaving autonomous loop is bounded on **four independent axes**: iteration
count (hard cap), money (budget hard-stop), time (shift windows), and blast radius (per-action
approval + kill-switch). No single failure removes all bounds.

## Not yet covered (future)
- Phase-2 adaptive MCP looping (LLM picks each next step from prior results) — deferred per the
  multi-step MCP spec; when added it reuses these same guardrails.
- A live, recorded production loop run with real telemetry (Langfuse trace) as a marketing/QA
  artifact — the controls are proven in tests; a recorded real run is an ops task.
