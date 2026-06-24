/**
 * M5 — Task decision-path load test.
 *
 * Benchmarks the synchronous per-task hot path that gates throughput: risk classification
 * + routing (`buildDecision`). Every task goes through this before any I/O, so its rate is
 * the upper bound on how fast one runtime instance can triage tasks. Reports ops/sec + p50/p95/p99.
 *
 * Run:  pnpm --filter @agentfarm/agent-runtime exec tsx src/decision-load-test.ts [iterations]
 */

import { buildDecision } from './domain/risk-policy.js';

const ITER = Number(process.argv[2] ?? 100_000);

const samples: Array<Record<string, unknown>> = [
    { actionType: 'workspace_read_file', confidence: 0.9 },
    { actionType: 'mcp_tool_call', mcpServerUrl: 'http://x', toolName: 'y' },
    { actionType: 'mcp_tool_sequence', steps: [{ toolName: 'a' }, { toolName: 'b' }] },
    { actionType: 'workspace_devops_k8s_deploy', manifest_path: 'k8s/x.yaml' },
    { actionType: 'workspace_git_commit', message: 'fix' },
    { actionType: 'send_email', to: 'a@b.com' },
];

const tasks = Array.from({ length: ITER }, (_, i) => ({
    taskId: `t${i}`,
    payload: samples[i % samples.length]!,
    enqueuedAt: Date.now(),
}));

// Warm up the JIT.
for (let i = 0; i < 5_000; i++) buildDecision(tasks[i % tasks.length]!);

const latencies = new Float64Array(ITER);
const start = process.hrtime.bigint();
for (let i = 0; i < ITER; i++) {
    const t0 = process.hrtime.bigint();
    buildDecision(tasks[i]!);
    latencies[i] = Number(process.hrtime.bigint() - t0) / 1e6;
}
const totalMs = Number(process.hrtime.bigint() - start) / 1e6;

latencies.sort();
const pct = (p: number) => latencies[Math.min(ITER - 1, Math.floor(ITER * p))]!.toFixed(4);

console.log(
    JSON.stringify(
        {
            iterations: ITER,
            total_ms: Number(totalMs.toFixed(1)),
            ops_per_sec: Math.round((ITER / totalMs) * 1000),
            p50_ms: Number(pct(0.5)),
            p95_ms: Number(pct(0.95)),
            p99_ms: Number(pct(0.99)),
        },
        null,
        2,
    ),
);
