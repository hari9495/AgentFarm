/**
 * e2e-integration.mjs
 *
 * Integration tests for the new Phase 3 API routes:
 *   - Autonomous Loops  POST/GET/DELETE /v1/autonomous-loops/...
 *   - Skill Composition POST/GET        /v1/compositions/...
 *   - Governance KPIs   GET             /v1/governance/kpis
 *   - Adapter Registry  CRUD            /v1/adapters/...
 *
 * Run against a live API gateway with:
 *   GATEWAY_URL=http://localhost:3000 node scripts/e2e-integration.mjs
 */

import process from 'node:process';

const GATEWAY_URL = (process.env.GATEWAY_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const TIMEOUT_MS = Number.parseInt(process.env.E2E_TIMEOUT_MS ?? '10000', 10);

let passed = 0;
let failed = 0;
const failures = [];

// ─── Helpers ────────────────────────────────────────────────────────────────

const log = (msg) => process.stdout.write(`${msg}\n`);
const logPass = (label) => { passed++; log(`  ✓ ${label}`); };
const logFail = (label, reason) => { failed++; failures.push({ label, reason }); log(`  ✗ ${label} — ${reason}`); };

async function request(method, path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(`${GATEWAY_URL}${path}`, {
            method,
            headers: body ? { 'content-type': 'application/json' } : {},
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
        const json = await res.json().catch(() => null);
        return { status: res.status, ok: res.ok, body: json };
    } catch (err) {
        return { status: 0, ok: false, body: null, error: String(err) };
    } finally {
        clearTimeout(timer);
    }
}

function section(title) {
    log(`\n[${title}]`);
}

// ─── Autonomous Loops ───────────────────────────────────────────────────────

section('Autonomous Loops');

{
    const r = await request('POST', '/v1/autonomous-loops/execute', {
        initial_skill: 'test-coverage-reporter',
        success_criteria: [{ type: 'test_pass_rate', target: 90 }],
        max_iterations: 3,
    });
    if (r.ok && r.body?.loop_id) {
        logPass('POST /v1/autonomous-loops/execute returns loop_id');

        const loopId = r.body.loop_id;

        const getR = await request('GET', `/v1/autonomous-loops/${loopId}`);
        if (getR.ok && getR.body?.loop_id === loopId) {
            logPass(`GET /v1/autonomous-loops/:id returns matching loop`);
        } else {
            logFail(`GET /v1/autonomous-loops/:id`, `status=${getR.status} body=${JSON.stringify(getR.body)}`);
        }

        const listR = await request('GET', '/v1/autonomous-loops');
        if (listR.ok && Array.isArray(listR.body?.loops)) {
            logPass('GET /v1/autonomous-loops returns array');
        } else {
            logFail('GET /v1/autonomous-loops', `status=${listR.status}`);
        }

        const delR = await request('DELETE', `/v1/autonomous-loops/${loopId}`);
        if (delR.ok) {
            logPass(`DELETE /v1/autonomous-loops/:id succeeds`);
        } else {
            logFail('DELETE /v1/autonomous-loops/:id', `status=${delR.status}`);
        }
    } else {
        logFail('POST /v1/autonomous-loops/execute', `status=${r.status} body=${JSON.stringify(r.body)}`);
    }

    // Validation: missing required fields
    const badR = await request('POST', '/v1/autonomous-loops/execute', { max_iterations: 2 });
    if (badR.status === 400) {
        logPass('POST /v1/autonomous-loops/execute rejects missing required fields (400)');
    } else {
        logFail('POST /v1/autonomous-loops/execute validation', `expected 400, got ${badR.status}`);
    }
}

// ─── Skill Composition ──────────────────────────────────────────────────────

section('Skill Composition');

{
    const compId = `e2e-comp-${Date.now()}`;

    const regR = await request('POST', '/v1/compositions', {
        composition_id: compId,
        name: 'E2E Test Composition',
        version: 1,
        entry_node_id: 'node-a',
        exit_nodes: ['node-b'],
        nodes: [
            { id: 'node-a', skill_id: 'test-coverage-reporter', input_map: {} },
            { id: 'node-b', skill_id: 'flaky-test-detector', input_map: {} },
        ],
        edges: [
            { from: 'node-a', to: 'node-b', condition: { type: 'success' } },
        ],
    });
    if (regR.ok) {
        logPass('POST /v1/compositions registers composition');

        const execR = await request('POST', `/v1/compositions/${encodeURIComponent(compId)}/execute`, {
            inputs: {},
        });
        if (execR.ok && execR.body?.run_id) {
            logPass('POST /v1/compositions/:id/execute returns run_id');

            const runId = execR.body.run_id;
            const runR = await request('GET', `/v1/compositions/${encodeURIComponent(compId)}/runs/${runId}`);
            if (runR.ok && runR.body?.run_id === runId) {
                logPass('GET /v1/compositions/:id/runs/:runId returns run');
            } else {
                logFail('GET composition run by id', `status=${runR.status}`);
            }
        } else {
            logFail('POST /v1/compositions/:id/execute', `status=${execR.status} body=${JSON.stringify(execR.body)}`);
        }
    } else {
        logFail('POST /v1/compositions', `status=${regR.status} body=${JSON.stringify(regR.body)}`);
    }

    const listR = await request('GET', '/v1/compositions');
    if (listR.ok && Array.isArray(listR.body?.compositions)) {
        logPass('GET /v1/compositions returns array');
    } else {
        logFail('GET /v1/compositions', `status=${listR.status}`);
    }

    // Validation
    const badR = await request('POST', '/v1/compositions', { composition_id: 'bad', nodes: [] });
    if (badR.status === 400) {
        logPass('POST /v1/compositions rejects empty nodes (400)');
    } else {
        logFail('POST /v1/compositions validation', `expected 400, got ${badR.status}`);
    }
}

// ─── Governance KPIs ────────────────────────────────────────────────────────

section('Governance KPIs');

{
    const r = await request('GET', '/v1/governance/kpis?time_window_seconds=3600');
    if (r.ok) {
        logPass('GET /v1/governance/kpis returns 200');
    } else {
        logFail('GET /v1/governance/kpis', `status=${r.status}`);
    }

    const providersR = await request('GET', '/v1/governance/kpis/providers');
    if (providersR.ok) {
        logPass('GET /v1/governance/kpis/providers returns 200');
    } else {
        logFail('GET /v1/governance/kpis/providers', `status=${providersR.status}`);
    }

    const slaR = await request('GET', '/v1/governance/sla-compliance');
    if (slaR.ok) {
        logPass('GET /v1/governance/sla-compliance returns 200');
    } else {
        logFail('GET /v1/governance/sla-compliance', `status=${slaR.status}`);
    }
}

// ─── Adapter Registry ───────────────────────────────────────────────────────

section('Adapter Registry');

{
    const adapterId = `e2e-adapter-${Date.now()}`;

    const regR = await request('POST', '/v1/adapters', {
        adapter_id: adapterId,
        name: 'E2E GitHub Adapter',
        type: 'source_control',
        description: 'Integration test adapter',
        version: '1.0.0',
    });
    if (regR.ok && regR.body?.adapter_id) {
        logPass('POST /v1/adapters registers adapter');

        const getR = await request('GET', `/v1/adapters/${adapterId}`);
        if (getR.ok && getR.body?.adapter_id === adapterId) {
            logPass('GET /v1/adapters/:id returns registered adapter');
        } else {
            logFail('GET /v1/adapters/:id', `status=${getR.status}`);
        }

        const healthR = await request('POST', `/v1/adapters/${adapterId}/health-check`, {});
        if (healthR.ok) {
            logPass('POST /v1/adapters/:id/health-check returns 200');
        } else {
            logFail('POST /v1/adapters/:id/health-check', `status=${healthR.status}`);
        }

        const delR = await request('DELETE', `/v1/adapters/${adapterId}`);
        if (delR.ok) {
            logPass('DELETE /v1/adapters/:id succeeds');

            const postDelR = await request('GET', `/v1/adapters/${adapterId}`);
            if (postDelR.status === 404) {
                logPass('GET /v1/adapters/:id returns 404 after deletion');
            } else {
                logFail('GET after deletion', `expected 404, got ${postDelR.status}`);
            }
        } else {
            logFail('DELETE /v1/adapters/:id', `status=${delR.status}`);
        }
    } else {
        logFail('POST /v1/adapters', `status=${regR.status} body=${JSON.stringify(regR.body)}`);
    }

    const listR = await request('GET', '/v1/adapters');
    if (listR.ok && Array.isArray(listR.body?.adapters)) {
        logPass('GET /v1/adapters returns adapters array');
    } else {
        logFail('GET /v1/adapters', `status=${listR.status}`);
    }

    // Validation: missing required fields
    const badR = await request('POST', '/v1/adapters', { name: 'No ID', type: 'custom' });
    if (badR.status === 400) {
        logPass('POST /v1/adapters rejects missing adapter_id (400)');
    } else {
        logFail('POST /v1/adapters validation', `expected 400, got ${badR.status}`);
    }
}

// ─── Summary ────────────────────────────────────────────────────────────────

log('\n════════════════════════════════════════');
log(`E2E Integration Results: ${passed} passed, ${failed} failed`);

if (failures.length > 0) {
    log('\nFailed tests:');
    failures.forEach(({ label, reason }) => log(`  ✗ ${label}: ${reason}`));
}

log('════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
