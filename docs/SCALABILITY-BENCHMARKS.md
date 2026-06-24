# Scalability Benchmarks (M5)

First published throughput numbers for AgentFarm, closing the audit's "scalability unproven"
gap with measured evidence rather than assertion.

## 1. Task decision path (synchronous hot path)

Every task the runtime processes passes through `buildDecision()` (action-type normalization +
confidence scoring + risk classification + execute/approval routing) *before any I/O*. Its rate
is the upper bound on how fast a single runtime instance can triage tasks.

**Harness:** `apps/agent-runtime/src/decision-load-test.ts`
**Run:** `pnpm --filter @agentfarm/agent-runtime exec tsx src/decision-load-test.ts [iterations]`
**Method:** warm the JIT (5k calls), then time each of N `buildDecision` calls over a 6-payload mix
spanning LOW/MEDIUM/HIGH tiers (read_file, mcp_tool_call, mcp_tool_sequence, k8s_deploy, git_commit,
send_email). Single Node process, no concurrency.

| Iterations | Throughput | p50 | p95 | p99 |
|---|---|---|---|---|
| 100,000 | ~2.09M decisions/sec | 0.0003 ms | 0.0004 ms | 0.0007 ms |
| 500,000 | ~2.95M decisions/sec | 0.0002 ms | 0.0004 ms | 0.0006 ms |

*(Measured 2026-06-25 on the dev machine; absolute numbers vary by hardware — the point is the
order of magnitude.)*

**Interpretation:** the decision/risk-classification layer is **not** a throughput bottleneck —
millions of triage decisions per second per core, sub-microsecond p99. A single runtime can classify
far more tasks than any realistic downstream can execute.

## 2. Where the real limits are (honest scope)

Decision triage is cheap; end-to-end task throughput is bounded by **downstream I/O**, not CPU:

| Stage | Dominant cost | Scaling lever |
|---|---|---|
| LLM planning/generation | provider latency (100s ms–seconds) + token cost + provider rate limits | provider concurrency, caching, model choice |
| Approval queue | human decision latency (MEDIUM/HIGH actions) | batch/auto-approve policy for LOW |
| DB (Postgres + pgvector) | query + vector search | read replicas; pgvector index tuning |
| Connector / MCP calls | third-party API latency + rate limits | per-tenant concurrency caps, backoff |
| Workers | in-process by default | `AF_WORKERS_DISABLED=1` → standalone worker-runner; horizontal scale |

## 3. Next steps (full-stack load test)

The decision-path benchmark proves the CPU core is fast. The remaining, higher-effort measurement is
an **end-to-end HTTP load test against a running stack** (gateway → runtime → DB/Redis) to publish
real concurrent-task numbers and find the true saturation point. That requires a provisioned
environment (and a mock LLM to isolate platform overhead from provider latency) and is tracked as a
follow-up. Harness pattern: drive `POST /v1/runtime/tasks` at increasing concurrency, record
completed-tasks/sec and p99 until error rate climbs.

## 4. Regression guard
`apps/agent-runtime/src/decision-load-test.test.ts` asserts the decision path sustains a conservative
floor (≥100k decisions/sec) so a future change that makes per-task triage pathologically slow fails CI.
