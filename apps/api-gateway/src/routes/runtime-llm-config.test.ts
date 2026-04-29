import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { createInMemorySecretStore } from '../lib/secret-store.js';
import { registerRuntimeLlmConfigRoutes } from './runtime-llm-config.js';

const internalSession = {
    userId: 'user_internal_1',
    tenantId: 'tenant_internal_1',
    workspaceIds: ['ws_1'],
    scope: 'internal' as const,
    expiresAt: Date.now() + 60_000,
};

test('GET returns default redacted config for internal session when not configured', async () => {
    const app = Fastify();

    await registerRuntimeLlmConfigRoutes(app, {
        getSession: () => internalSession,
        secretStore: createInMemorySecretStore({}),
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws_1/runtime/llm-config',
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as {
            config: { provider: string; openai?: { has_api_key: boolean } };
            source: string;
        };

        assert.equal(body.config.provider, 'agentfarm');
        assert.equal(body.source, 'default');
        assert.equal(body.config.openai, undefined);
    } finally {
        await app.close();
    }
});

test('PUT stores config and GET returns redacted api key fields', async () => {
    const app = Fastify();
    const secretStore = createInMemorySecretStore({});

    await registerRuntimeLlmConfigRoutes(app, {
        getSession: () => internalSession,
        secretStore,
    });

    try {
        const putResponse = await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws_1/runtime/llm-config',
            payload: {
                provider: 'openai',
                timeout_ms: 4500,
                openai: {
                    model: 'gpt-4o-mini',
                    api_key: 'sk-test-key',
                },
            },
        });

        assert.equal(putResponse.statusCode, 200);
        const putBody = putResponse.json() as {
            config: {
                provider: string;
                timeout_ms: number;
                openai?: { model?: string; has_api_key: boolean };
            };
        };
        assert.equal(putBody.config.provider, 'openai');
        assert.equal(putBody.config.timeout_ms, 4500);
        assert.equal(putBody.config.openai?.model, 'gpt-4o-mini');
        assert.equal(putBody.config.openai?.has_api_key, true);

        const getResponse = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws_1/runtime/llm-config',
        });
        assert.equal(getResponse.statusCode, 200);
        const getBody = getResponse.json() as {
            config: {
                provider: string;
                openai?: { has_api_key: boolean };
            };
        };
        assert.equal(getBody.config.provider, 'openai');
        assert.equal(getBody.config.openai?.has_api_key, true);
    } finally {
        await app.close();
    }
});

test('runtime token access returns full config including api key', async () => {
    const app = Fastify();
    const env = {
        RUNTIME_CONFIG_SHARED_TOKEN: 'runtime-token-123',
        LLM_CONFIG_SECRET_BASE_REF: 'env://AF_RUNTIME_LLM_CONFIG',
    } as NodeJS.ProcessEnv;

    await registerRuntimeLlmConfigRoutes(app, {
        getSession: () => null,
        secretStore: createInMemorySecretStore({
            'env://AF_RUNTIME_LLM_CONFIG_TENANT_INTERNAL_1_WS_1': JSON.stringify({
                provider: 'azure_openai',
                azure_openai: {
                    endpoint: 'https://example.openai.azure.com',
                    deployment: 'gpt-4o-mini',
                    api_version: '2024-06-01',
                    api_key: 'azure-key',
                },
            }),
        }),
        env,
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws_1/runtime/llm-config?tenant_id=tenant_internal_1',
            headers: {
                'x-runtime-config-token': 'runtime-token-123',
            },
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as {
            config: {
                provider: string;
                azure_openai?: { api_key?: string };
            };
        };

        assert.equal(body.config.provider, 'azure_openai');
        assert.equal(body.config.azure_openai?.api_key, 'azure-key');
    } finally {
        await app.close();
    }
});

test('rejects update without internal session', async () => {
    const app = Fastify();

    await registerRuntimeLlmConfigRoutes(app, {
        getSession: () => null,
        secretStore: createInMemorySecretStore({}),
    });

    try {
        const response = await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws_1/runtime/llm-config',
            payload: {
                provider: 'openai',
            },
        });

        assert.equal(response.statusCode, 403);
        const body = response.json() as { error: string };
        assert.equal(body.error, 'forbidden');
    } finally {
        await app.close();
    }
});
