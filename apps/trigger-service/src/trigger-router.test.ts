import { describe, it, mock, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { TriggerRouter } from './trigger-router.js';
import type { TriggerServiceConfig } from './types.js';

// -----------------------------------------------------------------------
// Shared fetch stub helpers
// -----------------------------------------------------------------------

function makeConfig(tenantCount: number): TriggerServiceConfig {
    const tenants = Array.from({ length: tenantCount }, (_, i) => ({
        tenantId: `tenant-${i + 1}`,
        defaultAgentId: `agent-${i + 1}`,
        agents: [{ agentId: `agent-${i + 1}`, description: `Agent ${i + 1}` }],
        name: `Tenant ${i + 1}`,
    }));

    return {
        tenants,
        agentRuntimeUrl: 'http://localhost:3001',
        anthropicApiKey: 'test-key',
        anthropicApiVersion: '2023-06-01',
    };
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('TriggerRouter', () => {
    describe('single-tenant: routes without LLM call', () => {
        it('returns the only tenant without calling fetch', async () => {
            let fetchCalled = false;
            const originalFetch = global.fetch;
            global.fetch = async () => {
                fetchCalled = true;
                return new Response('{}', { status: 200 });
            };

            const router = new TriggerRouter(makeConfig(1));
            const result = await router.route('do something', 'user@example.com');

            global.fetch = originalFetch;

            assert.equal(result.tenantId, 'tenant-1');
            assert.equal(result.agentId, 'agent-1');
            assert.equal(fetchCalled, false, 'fetch must not be called in single-tenant mode');
        });
    });

    describe('no tenants: throws', () => {
        it('throws when tenant list is empty', async () => {
            const config: TriggerServiceConfig = {
                tenants: [],
                agentRuntimeUrl: 'http://localhost:3001',
            };
            const router = new TriggerRouter(config);
            await assert.rejects(() => router.route('hello', 'x@x.com'), /no tenants configured/);
        });
    });

    describe('multi-tenant: successful LLM routing', () => {
        it('returns LLM-parsed decision', async () => {
            const llmBody = JSON.stringify({
                content: [{ type: 'text', text: JSON.stringify({ tenantId: 'tenant-2', agentId: 'agent-2', reason: 'best match' }) }],
            });

            const originalFetch = global.fetch;
            global.fetch = async () => new Response(llmBody, { status: 200 });

            const router = new TriggerRouter(makeConfig(2));
            const result = await router.route('some task', 'user@example.com');

            global.fetch = originalFetch;

            assert.equal(result.tenantId, 'tenant-2');
            assert.equal(result.agentId, 'agent-2');
        });
    });

    describe('multi-tenant: falls back to first tenant on auth error', () => {
        it('returns fallback decision when Anthropic returns 401', async () => {
            const originalFetch = global.fetch;
            global.fetch = async () => new Response('Unauthorized', { status: 401 });

            const router = new TriggerRouter(makeConfig(2));
            const result = await router.route('some task', 'user@example.com');

            global.fetch = originalFetch;

            assert.equal(result.tenantId, 'tenant-1', 'should fall back to first tenant');
            assert.match(result.reason, /fallback/);
        });
    });

    describe('multi-tenant: falls back when api key is missing', () => {
        it('returns fallback when anthropicApiKey is undefined', async () => {
            const config: TriggerServiceConfig = {
                ...makeConfig(2),
                anthropicApiKey: undefined,
            };
            const router = new TriggerRouter(config);
            const result = await router.route('task', 'user@example.com');

            assert.equal(result.tenantId, 'tenant-1');
            assert.match(result.reason, /missing api key/);
        });
    });
});
