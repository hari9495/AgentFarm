import test from 'node:test';
import assert from 'node:assert/strict';
import type { PolicyEvaluationInput } from '@agentfarm/shared-types';
import { buildOpaInput, evaluate } from './opa-evaluator.js';

const baseInput: PolicyEvaluationInput = {
    tenantId: 'tenant-1',
    workspaceId: 'ws-1',
    roleKey: 'developer',
    actionType: 'deploy_production',
    time: '2026-06-25T12:00:00.000Z',
};

// --- B3: input builder (pure) -------------------------------------------------

test('buildOpaInput maps fields and normalizes optionals', () => {
    const out = buildOpaInput(baseInput);
    assert.equal(out.tenantId, 'tenant-1');
    assert.equal(out.roleKey, 'developer');
    assert.equal(out.action, 'deploy_production');
    // optionals default to empty/0, never undefined
    assert.equal(out.connector, '');
    assert.equal(out.tool, '');
    assert.equal(out.env, '');
    assert.equal(out.estimatedCost, 0);
    assert.equal(out.time, '2026-06-25T12:00:00.000Z');
});

test('buildOpaInput preserves provided optionals', () => {
    const out = buildOpaInput({
        ...baseInput,
        connector: 'salesforce',
        tool: 'jira.delete',
        env: 'production',
        estimatedCost: 12.5,
    });
    assert.equal(out.connector, 'salesforce');
    assert.equal(out.tool, 'jira.delete');
    assert.equal(out.env, 'production');
    assert.equal(out.estimatedCost, 12.5);
});

// --- B2: happy-path OPA call --------------------------------------------------

function fakeFetch(result: unknown, ok = true, status = 200): typeof fetch {
    return (async () => ({
        ok,
        status,
        json: async () => ({ result }),
    })) as unknown as typeof fetch;
}

test('evaluate maps a deny result to a typed decision', async () => {
    const decision = await evaluate(baseInput, {
        fetchImpl: fakeFetch({
            effect: 'deny',
            reasonCode: 'policy_violation',
            reason: 'Production deploy blocked by tenant policy.',
            matchedPolicyId: 'pol-1',
            matchedPolicyVersion: 3,
        }),
    });
    assert.equal(decision.effect, 'deny');
    assert.equal(decision.requireApproval, false);
    assert.equal(decision.reasonCode, 'policy_violation');
    assert.equal(decision.matchedPolicyId, 'pol-1');
    assert.equal(decision.matchedPolicyVersion, 3);
    assert.equal(decision.failClosed, false);
});

test('evaluate sets requireApproval flag for require_approval effect', async () => {
    const decision = await evaluate(baseInput, {
        fetchImpl: fakeFetch({ effect: 'require_approval' }),
    });
    assert.equal(decision.effect, 'require_approval');
    assert.equal(decision.requireApproval, true);
    assert.equal(decision.failClosed, false);
});

test('evaluate maps allow with default reasonCode allowed', async () => {
    const decision = await evaluate(baseInput, {
        fetchImpl: fakeFetch({ effect: 'allow' }),
    });
    assert.equal(decision.effect, 'allow');
    assert.equal(decision.reasonCode, 'allowed');
    assert.equal(decision.failClosed, false);
});

test('evaluate sends correct OPA path and input body', async () => {
    let capturedUrl = '';
    let capturedBody: unknown;
    const spyFetch = (async (url: string, init: { body: string }) => {
        capturedUrl = url;
        capturedBody = JSON.parse(init.body);
        return { ok: true, status: 200, json: async () => ({ result: { effect: 'allow' } }) };
    }) as unknown as typeof fetch;

    await evaluate(baseInput, { fetchImpl: spyFetch, opaBaseUrl: 'http://opa:8181/' });
    assert.equal(capturedUrl, 'http://opa:8181/v1/data/agentfarm/governance/decision');
    assert.deepEqual((capturedBody as { input: { action: string } }).input.action, 'deploy_production');
});

// --- B1: fail-closed ----------------------------------------------------------

test('evaluate fails closed when OPA throws (network error)', async () => {
    const decision = await evaluate(baseInput, {
        fetchImpl: (async () => {
            throw new Error('ECONNREFUSED');
        }) as unknown as typeof fetch,
    });
    assert.equal(decision.effect, 'require_approval');
    assert.equal(decision.failClosed, true);
    assert.equal(decision.reasonCode, 'evaluator_unavailable');
    assert.notEqual(decision.effect, 'allow'); // never silently allow
});

test('evaluate fails closed on non-200 response', async () => {
    const decision = await evaluate(baseInput, { fetchImpl: fakeFetch(undefined, false, 500) });
    assert.equal(decision.effect, 'require_approval');
    assert.equal(decision.failClosed, true);
});

test('evaluate fails closed when result is missing or malformed', async () => {
    const missing = await evaluate(baseInput, { fetchImpl: fakeFetch(undefined) });
    assert.equal(missing.failClosed, true);

    const badEffect = await evaluate(baseInput, { fetchImpl: fakeFetch({ effect: 'maybe' }) });
    assert.equal(badEffect.failClosed, true);
    assert.equal(badEffect.effect, 'require_approval');
});
