import assert from 'node:assert/strict';
import test from 'node:test';
import { proxyBudgetLimitsGet, proxyBudgetLimitsPut } from './budget-limits/proxy-core';
import { proxyLlmConfigGet, proxyLlmConfigPut } from './llm-config/proxy-core';

test('proxyBudgetLimitsGet returns fallback body when upstream is unavailable', async () => {
    const result = await proxyBudgetLimitsGet({
        workspaceId: 'ws-fallback',
        authHeader: 'Bearer internal-token',
        apiBaseUrl: 'http://localhost:3000',
        fetchImpl: (async () => {
            throw new Error('connect ECONNREFUSED');
        }) as typeof fetch,
    });

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
        workspaceId: 'ws-fallback',
        message: 'Dashboard API upstream is unavailable; serving fallback budget limits.',
        source: 'fallback',
    });
});

test('proxyBudgetLimitsPut returns 503 when upstream is unavailable', async () => {
    const result = await proxyBudgetLimitsPut({
        workspaceId: 'ws-fallback',
        authHeader: 'Bearer internal-token',
        payload: { monthly_cap: 100 },
        apiBaseUrl: 'http://localhost:3000',
        fetchImpl: (async () => {
            throw new Error('connect ECONNREFUSED');
        }) as typeof fetch,
    });

    assert.equal(result.status, 503);
    assert.deepEqual(result.body, {
        error: 'upstream_unavailable',
        message: 'Dashboard API upstream is unavailable; serving fallback budget limits.',
    });
});

test('proxyLlmConfigGet returns default config when upstream is unavailable', async () => {
    const result = await proxyLlmConfigGet({
        workspaceId: 'ws-fallback',
        authHeader: 'Bearer internal-token',
        apiBaseUrl: 'http://localhost:3000',
        fetchImpl: (async () => {
            throw new Error('connect ECONNREFUSED');
        }) as typeof fetch,
    });

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
        workspace_id: 'ws-fallback',
        source: 'fallback',
        config: {
            provider: 'agentfarm',
            timeout_ms: 5000,
        },
        message: 'Dashboard API upstream is unavailable; serving fallback LLM config.',
    });
});

test('proxyLlmConfigPut returns 503 when upstream is unavailable', async () => {
    const result = await proxyLlmConfigPut({
        workspaceId: 'ws-fallback',
        authHeader: 'Bearer internal-token',
        payload: { provider: 'openai' },
        apiBaseUrl: 'http://localhost:3000',
        fetchImpl: (async () => {
            throw new Error('connect ECONNREFUSED');
        }) as typeof fetch,
    });

    assert.equal(result.status, 503);
    assert.deepEqual(result.body, {
        error: 'upstream_unavailable',
        message: 'Dashboard API upstream is unavailable; serving fallback LLM config.',
    });
});

test('workspace proxy handlers return forbidden when auth header is missing', async () => {
    const budgetResult = await proxyBudgetLimitsGet({
        workspaceId: 'ws-auth',
        authHeader: null,
        apiBaseUrl: 'http://localhost:3000',
    });

    const llmResult = await proxyLlmConfigGet({
        workspaceId: 'ws-auth',
        authHeader: null,
        apiBaseUrl: 'http://localhost:3000',
    });

    assert.equal(budgetResult.status, 403);
    assert.equal(llmResult.status, 403);
    assert.deepEqual(budgetResult.body, {
        error: 'forbidden',
        message: 'Internal session required.',
    });
    assert.deepEqual(llmResult.body, {
        error: 'forbidden',
        message: 'Internal session required.',
    });
});
