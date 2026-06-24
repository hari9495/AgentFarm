/**
 * M5 — decision-path throughput regression guard.
 *
 * Asserts the per-task hot path (buildDecision) sustains a conservative floor so a future
 * change that makes triage pathologically slow fails CI. The published numbers (millions/sec,
 * see docs/SCALABILITY-BENCHMARKS.md) are far above this floor; the floor is intentionally
 * low to avoid flakiness on slow/loaded CI runners.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDecision } from './domain/risk-policy.js';

test('buildDecision sustains >= 100k decisions/sec (throughput floor)', () => {
    const ITER = 50_000;
    const samples: Array<Record<string, unknown>> = [
        { actionType: 'workspace_read_file', confidence: 0.9 },
        { actionType: 'mcp_tool_call', mcpServerUrl: 'http://x', toolName: 'y' },
        { actionType: 'workspace_devops_k8s_deploy', manifest_path: 'k8s/x.yaml' },
    ];
    const tasks = Array.from({ length: ITER }, (_, i) => ({
        taskId: `t${i}`,
        payload: samples[i % samples.length]!,
        enqueuedAt: Date.now(),
    }));
    for (let i = 0; i < 2_000; i++) buildDecision(tasks[i % tasks.length]!);

    const start = process.hrtime.bigint();
    for (let i = 0; i < ITER; i++) buildDecision(tasks[i]!);
    const totalMs = Number(process.hrtime.bigint() - start) / 1e6;
    const opsSec = (ITER / totalMs) * 1000;

    assert.ok(opsSec >= 100_000, `decision throughput ${Math.round(opsSec)}/sec fell below the 100k floor`);
});
