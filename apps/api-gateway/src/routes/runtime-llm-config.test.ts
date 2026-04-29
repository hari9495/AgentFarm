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
                    model_profiles: {
                        cost_balanced: 'gpt-4.1-mini',
                        quality_first: 'gpt-4.1',
                    },
                },
            },
        });

        assert.equal(putResponse.statusCode, 200);
        const putBody = putResponse.json() as {
            config: {
                provider: string;
                timeout_ms: number;
                openai?: {
                    model?: string;
                    has_api_key: boolean;
                    model_profiles?: {
                        cost_balanced?: string;
                        quality_first?: string;
                    };
                };
            };
        };
        assert.equal(putBody.config.provider, 'openai');
        assert.equal(putBody.config.timeout_ms, 4500);
        assert.equal(putBody.config.openai?.model, 'gpt-4o-mini');
        assert.equal(putBody.config.openai?.has_api_key, true);
        assert.equal(putBody.config.openai?.model_profiles?.cost_balanced, 'gpt-4.1-mini');
        assert.equal(putBody.config.openai?.model_profiles?.quality_first, 'gpt-4.1');

        const getResponse = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws_1/runtime/llm-config',
        });
        assert.equal(getResponse.statusCode, 200);
        const getBody = getResponse.json() as {
            config: {
                provider: string;
                openai?: {
                    has_api_key: boolean;
                    model_profiles?: {
                        cost_balanced?: string;
                        quality_first?: string;
                    };
                };
            };
        };
        assert.equal(getBody.config.provider, 'openai');
        assert.equal(getBody.config.openai?.has_api_key, true);
        assert.equal(getBody.config.openai?.model_profiles?.cost_balanced, 'gpt-4.1-mini');
        assert.equal(getBody.config.openai?.model_profiles?.quality_first, 'gpt-4.1');
    } finally {
        await app.close();
    }
});

test('runtime token access returns profile routing fields for openai and azure_openai', async () => {
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
                    deployment_profiles: {
                        cost_balanced: 'gpt-4o-mini',
                        quality_first: 'gpt-4.1',
                    },
                },
                openai: {
                    model: 'gpt-4o-mini',
                    api_key: 'openai-key',
                    model_profiles: {
                        cost_balanced: 'gpt-4.1-mini',
                        quality_first: 'gpt-4.1',
                    },
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
                openai?: {
                    model_profiles?: {
                        cost_balanced?: string;
                        quality_first?: string;
                    };
                };
                azure_openai?: {
                    deployment_profiles?: {
                        cost_balanced?: string;
                        quality_first?: string;
                    };
                };
            };
        };

        assert.equal(body.config.openai?.model_profiles?.cost_balanced, 'gpt-4.1-mini');
        assert.equal(body.config.openai?.model_profiles?.quality_first, 'gpt-4.1');
        assert.equal(body.config.azure_openai?.deployment_profiles?.cost_balanced, 'gpt-4o-mini');
        assert.equal(body.config.azure_openai?.deployment_profiles?.quality_first, 'gpt-4.1');
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

test('PUT stores auto provider routing and multi-provider settings', async () => {
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
                provider: 'auto',
                github_models: {
                    model: 'openai/gpt-4.1-mini',
                    base_url: 'https://models.inference.ai.azure.com',
                    api_key: 'ghp_test',
                    model_profiles: {
                        cost_balanced: 'openai/gpt-4.1-mini',
                        quality_first: 'openai/gpt-4.1',
                    },
                },
                anthropic: {
                    model: 'claude-3-5-sonnet-latest',
                    base_url: 'https://api.anthropic.com',
                    api_version: '2023-06-01',
                    api_key: 'anthropic-key',
                    model_profiles: {
                        quality_first: 'claude-3-5-sonnet-latest',
                    },
                },
                google: {
                    model: 'gemini-1.5-flash',
                    base_url: 'https://generativelanguage.googleapis.com/v1beta',
                    api_key: 'google-key',
                    model_profiles: {
                        speed_first: 'gemini-1.5-flash',
                    },
                },
                auto: {
                    profile_providers: {
                        quality_first: ['anthropic', 'azure_openai', 'openai'],
                        cost_balanced: ['google', 'github_models', 'openai'],
                    },
                },
            },
        });

        assert.equal(putResponse.statusCode, 200);
        const putBody = putResponse.json() as {
            config: {
                provider: string;
                github_models?: {
                    has_api_key: boolean;
                    model_profiles?: {
                        cost_balanced?: string;
                    };
                };
                anthropic?: {
                    has_api_key: boolean;
                    api_version?: string;
                };
                google?: {
                    has_api_key: boolean;
                };
                auto?: {
                    profile_providers?: {
                        quality_first?: string[];
                        cost_balanced?: string[];
                    };
                };
            };
        };

        assert.equal(putBody.config.provider, 'auto');
        assert.equal(putBody.config.github_models?.has_api_key, true);
        assert.equal(putBody.config.github_models?.model_profiles?.cost_balanced, 'openai/gpt-4.1-mini');
        assert.equal(putBody.config.anthropic?.has_api_key, true);
        assert.equal(putBody.config.anthropic?.api_version, '2023-06-01');
        assert.equal(putBody.config.google?.has_api_key, true);
        assert.deepEqual(putBody.config.auto?.profile_providers?.quality_first, ['anthropic', 'azure_openai', 'openai']);
        assert.deepEqual(putBody.config.auto?.profile_providers?.cost_balanced, ['google', 'github_models', 'openai']);
    } finally {
        await app.close();
    }
});

test('PUT stores xai/mistral/together configs and redacts api keys', async () => {
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
                provider: 'auto',
                xai: {
                    model: 'grok-beta',
                    base_url: 'https://api.x.ai/v1',
                    api_key: 'xai-test-key',
                    model_profiles: { quality_first: 'grok-2' },
                },
                mistral: {
                    model: 'mistral-small-latest',
                    base_url: 'https://api.mistral.ai/v1',
                    api_key: 'mistral-test-key',
                    model_profiles: { speed_first: 'mistral-small-latest', quality_first: 'mistral-large-latest' },
                },
                together: {
                    model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
                    base_url: 'https://api.together.xyz/v1',
                    api_key: 'together-test-key',
                    model_profiles: { cost_balanced: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo' },
                },
                auto: {
                    profile_providers: {
                        cost_balanced: ['mistral', 'together', 'xai'],
                    },
                },
            },
        });

        assert.equal(putResponse.statusCode, 200);
        const putBody = putResponse.json() as {
            config: {
                provider: string;
                xai?: { has_api_key: boolean; model?: string; model_profiles?: { quality_first?: string } };
                mistral?: { has_api_key: boolean; model_profiles?: { quality_first?: string; speed_first?: string } };
                together?: { has_api_key: boolean; model_profiles?: { cost_balanced?: string } };
                auto?: { profile_providers?: { cost_balanced?: string[] } };
            };
        };

        assert.equal(putBody.config.provider, 'auto');

        // API keys must be redacted
        assert.equal(putBody.config.xai?.has_api_key, true);
        assert.equal((putBody.config.xai as Record<string, unknown>)?.['api_key'], undefined);
        assert.equal(putBody.config.xai?.model, 'grok-beta');
        assert.equal(putBody.config.xai?.model_profiles?.quality_first, 'grok-2');

        assert.equal(putBody.config.mistral?.has_api_key, true);
        assert.equal((putBody.config.mistral as Record<string, unknown>)?.['api_key'], undefined);
        assert.equal(putBody.config.mistral?.model_profiles?.quality_first, 'mistral-large-latest');
        assert.equal(putBody.config.mistral?.model_profiles?.speed_first, 'mistral-small-latest');

        assert.equal(putBody.config.together?.has_api_key, true);
        assert.equal((putBody.config.together as Record<string, unknown>)?.['api_key'], undefined);
        assert.equal(putBody.config.together?.model_profiles?.cost_balanced, 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo');

        assert.deepEqual(putBody.config.auto?.profile_providers?.cost_balanced, ['mistral', 'together', 'xai']);

        // Verify GET also returns redacted forms
        const getResponse = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws_1/runtime/llm-config',
        });
        assert.equal(getResponse.statusCode, 200);
        const getBody = getResponse.json() as {
            config: {
                xai?: { has_api_key: boolean };
                mistral?: { has_api_key: boolean };
                together?: { has_api_key: boolean };
            };
        };
        assert.equal(getBody.config.xai?.has_api_key, true);
        assert.equal(getBody.config.mistral?.has_api_key, true);
        assert.equal(getBody.config.together?.has_api_key, true);
    } finally {
        await app.close();
    }
});
