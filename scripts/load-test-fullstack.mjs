#!/usr/bin/env node
/**
 * Full-stack task-throughput load harness (M5 follow-up / re-audit #1).
 *
 * Drives a task-submission endpoint at RAMPING concurrency and records, per step:
 * completed/sec, p50/p95/p99 latency, and error rate — stopping when the error rate climbs
 * past a threshold (the saturation point). Closed-loop model: keeps N requests in flight,
 * each completion launches the next, for a fixed duration per step.
 *
 * Designed to measure PLATFORM overhead, so run the stack with a mock LLM:
 *   LLM_PROVIDER=mock docker compose up   (or set the runtime default to 'mock')
 *
 * Auth is flexible — pass whatever the target needs:
 *   AF_LOAD_URL=http://localhost:4000/tasks/intake \
 *   AF_LOAD_HEADER="x-runtime-task-token: <RUNTIME_TASK_SHARED_TOKEN>" \
 *   AF_LOAD_BODY='{"task_id":"__ID__","payload":{"actionType":"workspace_read_file"}}' \
 *   node scripts/load-test-fullstack.mjs
 *
 * `__ID__` in the body template is replaced with a unique id per request.
 * Self-test (no stack needed):  node scripts/load-test-fullstack.mjs --self-test
 */

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// ── Core: one fixed-concurrency, fixed-duration step ────────────────────────────

export async function runLoadStep({
    url,
    method = 'POST',
    headers = {},
    bodyTemplate = '{}',
    concurrency,
    durationMs,
    fetchImpl = fetch,
}) {
    const latencies = [];
    let completed = 0;
    let errors = 0;
    const deadline = Date.now() + durationMs;

    const worker = async () => {
        while (Date.now() < deadline) {
            const body = bodyTemplate.replaceAll('__ID__', randomUUID());
            const t0 = performance.now();
            try {
                const res = await fetchImpl(url, { method, headers: { 'content-type': 'application/json', ...headers }, body });
                const ms = performance.now() - t0;
                if (res.status >= 200 && res.status < 500) {
                    // 2xx/4xx are "served" (the platform responded); 5xx/network = error.
                    latencies.push(ms);
                    completed += 1;
                    if (res.status >= 400) errors += 1;
                } else {
                    errors += 1;
                }
            } catch {
                errors += 1;
            }
        }
    };

    const started = performance.now();
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    const elapsedMs = performance.now() - started;

    latencies.sort((a, b) => a - b);
    const pct = (p) => (latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] : 0);
    const total = completed + errors;
    return {
        concurrency,
        completed,
        errors,
        error_rate: total ? errors / total : 0,
        ops_per_sec: Math.round((completed / elapsedMs) * 1000),
        p50_ms: Number(pct(0.5).toFixed(2)),
        p95_ms: Number(pct(0.95).toFixed(2)),
        p99_ms: Number(pct(0.99).toFixed(2)),
    };
}

// ── Ramp driver: increase concurrency until saturation ──────────────────────────

export async function rampLoadTest({
    url,
    headers,
    bodyTemplate,
    steps = [1, 2, 4, 8, 16, 32, 64, 128],
    stepDurationMs = 5_000,
    errorRateCeiling = 0.05,
    fetchImpl = fetch,
    log = () => {},
}) {
    const results = [];
    let saturatedAt = null;
    for (const concurrency of steps) {
        const r = await runLoadStep({ url, headers, bodyTemplate, concurrency, durationMs: stepDurationMs, fetchImpl });
        results.push(r);
        log(r);
        if (r.error_rate > errorRateCeiling) {
            saturatedAt = concurrency;
            break;
        }
    }
    const best = results.reduce((a, b) => (b.ops_per_sec > a.ops_per_sec ? b : a), results[0]);
    return { results, saturatedAt, peak_ops_per_sec: best?.ops_per_sec ?? 0, peak_concurrency: best?.concurrency ?? 0 };
}

// ── Self-test: prove the harness math/concurrency against an internal mock ───────

async function selfTest() {
    const assert = (await import('node:assert/strict')).default;
    // Mock server: ~5ms artificial latency, starts erroring above 40 concurrent in-flight.
    let inFlight = 0;
    const server = http.createServer((req, res) => {
        inFlight += 1;
        const overloaded = inFlight > 40;
        setTimeout(() => {
            inFlight -= 1;
            res.writeHead(overloaded ? 503 : 200, { 'content-type': 'application/json' });
            res.end('{"ok":true}');
        }, 5);
    });
    await new Promise((r) => server.listen(0, r));
    const port = server.address().port;
    const url = `http://127.0.0.1:${port}/intake`;

    const single = await runLoadStep({ url, concurrency: 4, durationMs: 400, bodyTemplate: '{"id":"__ID__"}' });
    assert.ok(single.completed > 0, 'should complete requests');
    assert.ok(single.ops_per_sec > 0, 'should report throughput');
    assert.ok(single.p99_ms >= single.p50_ms, 'p99 >= p50');
    assert.ok(single.p50_ms >= 4, 'latency reflects the ~5ms mock');

    const ramp = await rampLoadTest({
        url,
        bodyTemplate: '{"id":"__ID__"}',
        steps: [2, 8, 32, 128],
        stepDurationMs: 400,
        errorRateCeiling: 0.05,
    });
    assert.ok(ramp.results.length >= 1, 'ramp produced results');
    assert.equal(ramp.saturatedAt, 128, 'should detect saturation when the mock overloads at high concurrency');
    assert.ok(ramp.peak_ops_per_sec > 0, 'reports a peak throughput');

    server.close();
    console.log('self-test OK', JSON.stringify({ single_ops: single.ops_per_sec, saturatedAt: ramp.saturatedAt, peak: ramp.peak_ops_per_sec }));
}

// ── CLI ─────────────────────────────────────────────────────────────────────────

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isMain) {
    if (process.argv.includes('--self-test')) {
        selfTest().catch((e) => { console.error(e); process.exit(1); });
    } else {
        const url = process.env.AF_LOAD_URL;
        if (!url) {
            console.error('Set AF_LOAD_URL (and optionally AF_LOAD_HEADER, AF_LOAD_BODY). See header comment.');
            process.exit(2);
        }
        const headers = {};
        const h = process.env.AF_LOAD_HEADER;
        if (h) { const i = h.indexOf(':'); headers[h.slice(0, i).trim()] = h.slice(i + 1).trim(); }
        const bodyTemplate = process.env.AF_LOAD_BODY ?? '{"task_id":"__ID__","payload":{"actionType":"workspace_read_file"}}';
        const stepDurationMs = Number(process.env.AF_LOAD_STEP_MS ?? 5000);
        rampLoadTest({
            url, headers, bodyTemplate, stepDurationMs,
            log: (r) => console.log(JSON.stringify(r)),
        }).then((summary) => {
            console.log('\n=== SUMMARY ===');
            console.log(JSON.stringify({ peak_ops_per_sec: summary.peak_ops_per_sec, peak_concurrency: summary.peak_concurrency, saturatedAt: summary.saturatedAt }, null, 2));
        }).catch((e) => { console.error(e); process.exit(1); });
    }
}
