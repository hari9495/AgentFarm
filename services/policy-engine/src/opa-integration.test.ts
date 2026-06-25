/**
 * Integration test (B4 + B5): exercises the real Rego bundle against a running
 * OPA. Skips automatically when OPA is unreachable so unit CI stays green; runs
 * for real under docker compose (OPA at :8181) and the db/integration lane.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { PolicyEvaluationInput } from '@agentfarm/shared-types';
import { evaluate } from './opa-evaluator.js';
import { loadPolicyBundle, pushTenantOverlay, removeTenantOverlay } from './opa-loader.js';

const OPA_BASE_URL = process.env['OPA_BASE_URL'] ?? 'http://localhost:8181';

async function opaReachable(): Promise<boolean> {
    try {
        const res = await fetch(`${OPA_BASE_URL}/health`, {
            signal: AbortSignal.timeout(1000),
        });
        return res.ok;
    } catch {
        return false;
    }
}

const reachable = await opaReachable();
const maybe = reachable ? test : test.skip;

if (!reachable) {
    // eslint-disable-next-line no-console
    console.warn(`[opa-integration] OPA not reachable at ${OPA_BASE_URL} — skipping integration tests.`);
}

const TENANT_X = 'itest-tenant-x';
const TENANT_Y = 'itest-tenant-y';

const input = (overrides: Partial<PolicyEvaluationInput>): PolicyEvaluationInput => ({
    tenantId: TENANT_Y,
    workspaceId: 'ws',
    roleKey: 'developer',
    actionType: 'read_task',
    time: new Date().toISOString(),
    ...overrides,
});

maybe('B4: default bundle reproduces hardcoded risk tiers', async () => {
    await loadPolicyBundle({ opaBaseUrl: OPA_BASE_URL });
    await removeTenantOverlay(TENANT_X, { opaBaseUrl: OPA_BASE_URL });
    await removeTenantOverlay(TENANT_Y, { opaBaseUrl: OPA_BASE_URL });

    const high = await evaluate(input({ actionType: 'deploy_production' }), { opaBaseUrl: OPA_BASE_URL });
    assert.equal(high.effect, 'require_approval', 'high-risk action defaults to approval');
    assert.equal(high.failClosed, false);

    const medium = await evaluate(input({ actionType: 'mcp_tool_call' }), { opaBaseUrl: OPA_BASE_URL });
    assert.equal(medium.effect, 'require_approval', 'medium-risk action defaults to approval');

    const low = await evaluate(input({ actionType: 'read_task' }), { opaBaseUrl: OPA_BASE_URL });
    assert.equal(low.effect, 'allow', 'unknown safe action defaults to allow');
});

maybe('B5: tenant overlay tightens an action to deny with provenance', async () => {
    await loadPolicyBundle({ opaBaseUrl: OPA_BASE_URL });

    await pushTenantOverlay(
        TENANT_X,
        {
            policyId: 'pol-itest-1',
            version: 4,
            rules: [{ actionType: 'deploy_production', effect: 'deny', reason: 'no prod for X' }],
        },
        { opaBaseUrl: OPA_BASE_URL },
    );
    await removeTenantOverlay(TENANT_Y, { opaBaseUrl: OPA_BASE_URL });

    const x = await evaluate(input({ tenantId: TENANT_X, actionType: 'deploy_production' }), {
        opaBaseUrl: OPA_BASE_URL,
    });
    assert.equal(x.effect, 'deny', 'tenant X policy denies prod deploy');
    assert.equal(x.matchedPolicyId, 'pol-itest-1');
    assert.equal(x.matchedPolicyVersion, 4);

    const y = await evaluate(input({ tenantId: TENANT_Y, actionType: 'deploy_production' }), {
        opaBaseUrl: OPA_BASE_URL,
    });
    assert.equal(y.effect, 'require_approval', 'tenant Y (no overlay) keeps default tier');
    assert.equal(y.matchedPolicyId, undefined);

    // cleanup
    await removeTenantOverlay(TENANT_X, { opaBaseUrl: OPA_BASE_URL });
});

maybe('B5: tenant overlay cannot weaken the hardcoded floor (allow rule on high-risk stays require_approval)', async () => {
    await loadPolicyBundle({ opaBaseUrl: OPA_BASE_URL });
    await pushTenantOverlay(
        TENANT_X,
        {
            policyId: 'pol-itest-2',
            version: 1,
            rules: [{ actionType: 'deploy_production', effect: 'allow' }],
        },
        { opaBaseUrl: OPA_BASE_URL },
    );

    const x = await evaluate(input({ tenantId: TENANT_X, actionType: 'deploy_production' }), {
        opaBaseUrl: OPA_BASE_URL,
    });
    assert.equal(x.effect, 'require_approval', 'allow cannot downgrade the high-risk floor');

    await removeTenantOverlay(TENANT_X, { opaBaseUrl: OPA_BASE_URL });
});
