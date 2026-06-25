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

## 3. Full-stack HTTP load harness

The decision-path benchmark proves the CPU core is fast. The end-to-end measurement — concurrent-task
throughput against a running stack (gateway → runtime → DB/Redis) — uses the harness at
`scripts/load-test-fullstack.mjs`. It is a closed-loop ramp: keeps N requests in flight per step,
increases concurrency `[1,2,4,8,…]`, and records per step **completed/sec, p50/p95/p99, error rate**,
stopping at the **saturation point** (error rate > ceiling).

**Harness correctness is proven now** (no stack needed) via a built-in self-test that ramps against an
internal mock server which overloads at high concurrency:

```
$ pnpm loadtest:selftest
self-test OK {"single_ops":225,"saturatedAt":128,"peak":2942}
```

The self-test asserts: requests complete, throughput is reported, `p99 >= p50`, latency reflects the
injected delay, and saturation is detected at the concurrency where the mock starts erroring. Run it in
CI as a regression guard for the harness logic.

**Running against a real stack** (measures *platform* overhead — run with a mock LLM so provider latency
doesn't dominate):

```
LLM_PROVIDER=mock docker compose up        # stack with a mock model
AF_LOAD_URL=http://localhost:4000/tasks/intake \
AF_LOAD_HEADER="x-runtime-task-token: $RUNTIME_TASK_SHARED_TOKEN" \
AF_LOAD_BODY='{"task_id":"__ID__","payload":{"actionType":"workspace_read_file"}}' \
pnpm loadtest
```

It prints a per-step JSON line and a summary `{ peak_ops_per_sec, peak_concurrency, saturatedAt }`.
`__ID__` is replaced with a unique id per request. Auth/body are fully configurable so the same harness
can target the gateway task-queue (with a session cookie) or the runtime intake (with the shared token).

**Status:** harness built + self-test green. Publishing real saturation numbers requires a provisioned
environment with the stack running under `LLM_PROVIDER=mock`; that run is the one remaining step to put
concrete concurrent-task figures in the table below.

| Concurrency | completed/sec | p50 | p95 | p99 | error rate |
|---|---|---|---|---|---|
| _(to be filled from a provisioned `pnpm loadtest` run)_ | | | | | |

## 4. Regression guard
`apps/agent-runtime/src/decision-load-test.test.ts` asserts the decision path sustains a conservative
floor (≥100k decisions/sec) so a future change that makes per-task triage pathologically slow fails CI.
