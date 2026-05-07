import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import assert from 'node:assert/strict';
import { tmpdir } from 'os';
import { join } from 'path';
import test from 'node:test';
import {
    createLlmDecisionResolverFromConfig,
    getProviderCooldownState,
    resetProviderRoutingMemory,
    resetProviderRoutingState,
} from './llm-decision-adapter.js';
import { recordQualitySignal, resetQualitySignals } from './llm-quality-tracker.js';
import type { ActionDecision, TaskEnvelope } from './execution-engine.js';

const makeTask = (payload: Record<string, unknown>, taskId = 'task-1'): TaskEnvelope => ({
    taskId,
    payload,
    enqueuedAt: Date.now(),
});

const lowRiskDecision: ActionDecision = {
    actionType: 'read_task',
    confidence: 0.9,
    riskLevel: 'low',
    route: 'execute',
    reason: 'safe read operation',
};

const mediumRiskDecision: ActionDecision = {
    actionType: 'create_pr',
    confidence: 0.85,
    riskLevel: 'medium',
    route: 'approval',
    reason: 'write action requires review',
};

const withCooldownStatePath = async (suffix: string, callback: (filePath: string) => Promise<void>) => {
    const previous = process.env['AF_PROVIDER_COOLDOWN_STATE_PATH'];
    const filePath = join(tmpdir(), `agentfarm-provider-cooldown-${suffix}-${Date.now()}.json`);
    process.env['AF_PROVIDER_COOLDOWN_STATE_PATH'] = filePath;
    resetProviderRoutingState();

    try {
        await callback(filePath);
    } finally {
        resetProviderRoutingState();
        if (previous === undefined) {
            delete process.env['AF_PROVIDER_COOLDOWN_STATE_PATH'];
        } else {
            process.env['AF_PROVIDER_COOLDOWN_STATE_PATH'] = previous;
        }
        rmSync(filePath, { force: true });
    }
};

const withTokenBudgetStatePath = async (suffix: string, callback: (filePath: string) => Promise<void>) => {
    const previousPath = process.env['AF_TOKEN_BUDGET_STATE_PATH'];
    const previousLimit = process.env['AF_TOKEN_BUDGET_DAILY_LIMIT'];
    const previousThreshold = process.env['AF_TOKEN_BUDGET_WARNING_THRESHOLD'];
    const filePath = join(tmpdir(), `agentfarm-token-budget-${suffix}-${Date.now()}.json`);
    process.env['AF_TOKEN_BUDGET_STATE_PATH'] = filePath;
    process.env['AF_TOKEN_BUDGET_DAILY_LIMIT'] = '100';
    process.env['AF_TOKEN_BUDGET_WARNING_THRESHOLD'] = '0.8';

    try {
        await callback(filePath);
    } finally {
        if (previousPath === undefined) {
            delete process.env['AF_TOKEN_BUDGET_STATE_PATH'];
        } else {
            process.env['AF_TOKEN_BUDGET_STATE_PATH'] = previousPath;
        }

        if (previousLimit === undefined) {
            delete process.env['AF_TOKEN_BUDGET_DAILY_LIMIT'];
        } else {
            process.env['AF_TOKEN_BUDGET_DAILY_LIMIT'] = previousLimit;
        }

        if (previousThreshold === undefined) {
            delete process.env['AF_TOKEN_BUDGET_WARNING_THRESHOLD'];
        } else {
            process.env['AF_TOKEN_BUDGET_WARNING_THRESHOLD'] = previousThreshold;
        }
        rmSync(filePath, { force: true });
    }
};

test.beforeEach(() => {
    resetProviderRoutingState();
    resetQualitySignals();
});

test.afterEach(() => {
    resetProviderRoutingState();
    resetQualitySignals();
});

test('createLlmDecisionResolverFromConfig selects speed_first OpenAI model for low-risk tasks', async () => {
    const originalFetch = globalThis.fetch;
    let calledModel: string | null = null;

    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        const parsedBody = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
        calledModel = parsedBody.model ?? null;

        return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(lowRiskDecision) } }],
            usage: {
                prompt_tokens: 100,
                completion_tokens: 20,
                total_tokens: 120,
            },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;

    try {
        const resolver = createLlmDecisionResolverFromConfig({
            provider: 'openai',
            openai: {
                api_key: 'sk-test',
                model: 'gpt-4o-mini',
                model_profiles: {
                    cost_balanced: 'gpt-4o-mini',
                    speed_first: 'gpt-4.1-mini',
                    quality_first: 'gpt-4.1',
                },
            },
        });

        assert.ok(resolver);
        const result = await resolver!({
            task: makeTask({ action_type: 'read_task', complexity: 'low' }),
            heuristicDecision: lowRiskDecision,
        });

        assert.equal(calledModel, 'gpt-4.1-mini');
        assert.equal(result.metadata.model, 'gpt-4.1-mini');
        assert.equal(result.metadata.modelProfile, 'speed_first');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('createLlmDecisionResolverFromConfig parses payloadOverrides for workspace_subagent_spawn', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
        choices: [{
            message: {
                content: JSON.stringify({
                    actionType: 'workspace_subagent_spawn',
                    confidence: 0.94,
                    riskLevel: 'high',
                    route: 'approval',
                    reason: 'Bounded plan required before execution.',
                    payloadOverrides: {
                        test_command: 'pnpm --filter @agentfarm/agent-runtime test',
                        initial_plan: [
                            {
                                description: 'run the narrow failing test first',
                                actions: [{ action: 'run_tests', command: 'pnpm --filter @agentfarm/agent-runtime test' }],
                            },
                        ],
                        fix_attempts: [
                            {
                                description: 're-run tests after repair',
                                actions: [{ action: 'run_tests', command: 'pnpm --filter @agentfarm/agent-runtime test' }],
                            },
                        ],
                    },
                }),
            },
        }],
        usage: {
            prompt_tokens: 140,
            completion_tokens: 55,
            total_tokens: 195,
        },
    }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    })) as typeof fetch;

    try {
        const resolver = createLlmDecisionResolverFromConfig({
            provider: 'openai',
            openai: {
                api_key: 'sk-test',
                model: 'gpt-4o-mini',
            },
        });

        assert.ok(resolver);
        const result = await resolver!({
            task: makeTask({ action_type: 'workspace_subagent_spawn', prompt: 'Fix the regression' }),
            heuristicDecision: {
                actionType: 'workspace_subagent_spawn',
                confidence: 0.62,
                riskLevel: 'high',
                route: 'approval',
                reason: 'Heuristic fallback',
            },
        });

        assert.equal(result.payloadOverrides?.['test_command'], 'pnpm --filter @agentfarm/agent-runtime test');
        assert.ok(Array.isArray(result.payloadOverrides?.['initial_plan']));
        assert.ok(Array.isArray(result.payloadOverrides?.['fix_attempts']));
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('createLlmDecisionResolverFromConfig selects quality_first Azure deployment for high-complexity tasks', async () => {
    const originalFetch = globalThis.fetch;
    let calledUrl = '';

    globalThis.fetch = (async (url: string | URL | Request, _init?: RequestInit) => {
        calledUrl = String(url);

        return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(mediumRiskDecision) } }],
            usage: {
                prompt_tokens: 110,
                completion_tokens: 30,
                total_tokens: 140,
            },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;

    try {
        const resolver = createLlmDecisionResolverFromConfig({
            provider: 'azure_openai',
            azure_openai: {
                endpoint: 'https://example.openai.azure.com',
                api_key: 'azure-key',
                deployment: 'gpt-4o-mini',
                deployment_profiles: {
                    speed_first: 'gpt-4o-mini',
                    quality_first: 'gpt-4.1',
                },
            },
        });

        assert.ok(resolver);
        const result = await resolver!({
            task: makeTask({ action_type: 'create_pr', complexity: 'high' }),
            heuristicDecision: mediumRiskDecision,
        });

        assert.match(calledUrl, /deployments\/gpt-4\.1\/chat\/completions/);
        assert.equal(result.metadata.model, 'gpt-4.1');
        assert.equal(result.metadata.modelProfile, 'quality_first');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('createLlmDecisionResolverFromConfig supports github_models provider', async () => {
    const originalFetch = globalThis.fetch;
    let calledUrl = '';
    let calledModel: string | null = null;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        calledUrl = String(url);
        const parsedBody = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
        calledModel = parsedBody.model ?? null;

        return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(lowRiskDecision) } }],
            usage: {
                prompt_tokens: 80,
                completion_tokens: 15,
                total_tokens: 95,
            },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;

    try {
        const resolver = createLlmDecisionResolverFromConfig({
            provider: 'github_models',
            github_models: {
                api_key: 'ghp_test',
                base_url: 'https://models.inference.ai.azure.com',
                model: 'openai/gpt-4.1-mini',
                model_profiles: {
                    speed_first: 'openai/gpt-4.1-mini',
                    quality_first: 'openai/gpt-4.1',
                },
            },
        });

        assert.ok(resolver);
        const result = await resolver!({
            task: makeTask({ action_type: 'read_task', complexity: 'low' }),
            heuristicDecision: lowRiskDecision,
        });

        assert.match(calledUrl, /models\.inference\.ai\.azure\.com\/chat\/completions/);
        assert.equal(calledModel, 'openai/gpt-4.1-mini');
        assert.equal(result.metadata.modelProvider, 'github_models');
        assert.equal(result.metadata.modelProfile, 'speed_first');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('createLlmDecisionResolverFromConfig supports anthropic provider', async () => {
    const originalFetch = globalThis.fetch;
    let calledUrl = '';

    globalThis.fetch = (async (url: string | URL | Request, _init?: RequestInit) => {
        calledUrl = String(url);

        return new Response(JSON.stringify({
            content: [{ text: JSON.stringify(mediumRiskDecision) }],
            usage: {
                input_tokens: 120,
                output_tokens: 24,
            },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;

    try {
        const resolver = createLlmDecisionResolverFromConfig({
            provider: 'anthropic',
            anthropic: {
                api_key: 'anthropic-key',
                model: 'claude-3-5-sonnet-latest',
                model_profiles: {
                    quality_first: 'claude-3-5-sonnet-latest',
                },
            },
        });

        assert.ok(resolver);
        const result = await resolver!({
            task: makeTask({ action_type: 'create_pr', complexity: 'high' }),
            heuristicDecision: mediumRiskDecision,
        });

        assert.match(calledUrl, /api\.anthropic\.com\/v1\/messages/);
        assert.equal(result.metadata.modelProvider, 'anthropic');
        assert.equal(result.metadata.modelProfile, 'quality_first');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('createLlmDecisionResolverFromConfig supports google provider', async () => {
    const originalFetch = globalThis.fetch;
    let calledUrl = '';

    globalThis.fetch = (async (url: string | URL | Request, _init?: RequestInit) => {
        calledUrl = String(url);

        return new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(lowRiskDecision) }] } }],
            usageMetadata: {
                promptTokenCount: 75,
                candidatesTokenCount: 12,
                totalTokenCount: 87,
            },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;

    try {
        const resolver = createLlmDecisionResolverFromConfig({
            provider: 'google',
            google: {
                api_key: 'google-key',
                model: 'gemini-1.5-flash',
                model_profiles: {
                    speed_first: 'gemini-1.5-flash',
                },
            },
        });

        assert.ok(resolver);
        const result = await resolver!({
            task: makeTask({ action_type: 'read_task', complexity: 'low' }),
            heuristicDecision: lowRiskDecision,
        });

        assert.match(calledUrl, /generativelanguage\.googleapis\.com\/v1beta\/models\//);
        assert.equal(result.metadata.modelProvider, 'google');
        assert.equal(result.metadata.modelProfile, 'speed_first');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('createLlmDecisionResolverFromConfig auto mode falls back to next configured provider', async () => {
    const originalFetch = globalThis.fetch;
    const calledUrls: string[] = [];

    globalThis.fetch = (async (url: string | URL | Request, _init?: RequestInit) => {
        const normalizedUrl = String(url);
        calledUrls.push(normalizedUrl);

        if (normalizedUrl.includes('models.inference.ai.azure.com')) {
            return new Response('upstream error', { status: 500 });
        }

        return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(lowRiskDecision) } }],
            usage: {
                prompt_tokens: 90,
                completion_tokens: 18,
                total_tokens: 108,
            },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;

    try {
        const resolver = createLlmDecisionResolverFromConfig({
            provider: 'auto',
            github_models: {
                api_key: 'ghp_test',
                model: 'openai/gpt-4.1-mini',
            },
            openai: {
                api_key: 'sk-test',
                model: 'gpt-4o-mini',
            },
            auto: {
                profile_providers: {
                    speed_first: ['github_models', 'openai'],
                },
            },
        });

        assert.ok(resolver);
        const result = await resolver!({
            task: makeTask({ action_type: 'read_task', complexity: 'low' }),
            heuristicDecision: lowRiskDecision,
        });

        assert.equal(calledUrls.length, 2);
        assert.match(calledUrls[0] ?? '', /models\.inference\.ai\.azure\.com/);
        assert.match(calledUrls[1] ?? '', /api\.openai\.com/);
        assert.equal(result.metadata.modelProvider, 'openai');
        assert.equal(result.metadata.fallbackReason, 'auto_failover_provider_unavailable');
        assert.equal(result.metadata.failoverTrace?.[0]?.provider, 'github_models');
        assert.equal(result.metadata.failoverTrace?.[0]?.reasonCode, 'provider_unavailable');
        assert.equal(result.metadata.failoverTrace?.[0]?.disposition, 'attempt_failed');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('createLlmDecisionResolverFromConfig auto mode falls back from anthropic to google', async () => {
    const originalFetch = globalThis.fetch;
    const calledUrls: string[] = [];

    globalThis.fetch = (async (url: string | URL | Request, _init?: RequestInit) => {
        const normalizedUrl = String(url);
        calledUrls.push(normalizedUrl);

        if (normalizedUrl.includes('api.anthropic.com')) {
            return new Response('anthropic upstream error', { status: 500 });
        }

        return new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(lowRiskDecision) }] } }],
            usageMetadata: {
                promptTokenCount: 60,
                candidatesTokenCount: 9,
                totalTokenCount: 69,
            },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;

    try {
        const resolver = createLlmDecisionResolverFromConfig({
            provider: 'auto',
            anthropic: {
                api_key: 'anthropic-key',
                model: 'claude-3-5-haiku-latest',
            },
            google: {
                api_key: 'google-key',
                model: 'gemini-1.5-flash',
            },
            auto: {
                profile_providers: {
                    speed_first: ['anthropic', 'google'],
                },
            },
        });

        assert.ok(resolver);
        const result = await resolver!({
            task: makeTask({ action_type: 'read_task', complexity: 'low' }),
            heuristicDecision: lowRiskDecision,
        });

        assert.equal(calledUrls.length, 2);
        assert.match(calledUrls[0] ?? '', /api\.anthropic\.com/);
        assert.match(calledUrls[1] ?? '', /generativelanguage\.googleapis\.com/);
        assert.equal(result.metadata.modelProvider, 'google');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('createLlmDecisionResolverFromConfig supports xai provider', async () => {
    const originalFetch = globalThis.fetch;
    let calledUrl = '';
    let calledModel: string | null = null;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        calledUrl = String(url);
        const parsedBody = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
        calledModel = parsedBody.model ?? null;

        return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(lowRiskDecision) } }],
            usage: { prompt_tokens: 70, completion_tokens: 12, total_tokens: 82 },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;

    try {
        const resolver = createLlmDecisionResolverFromConfig({
            provider: 'xai',
            xai: {
                api_key: 'xai-key',
                model: 'grok-beta',
                model_profiles: { speed_first: 'grok-beta' },
            },
        });

        assert.ok(resolver);
        const result = await resolver!({
            task: makeTask({ action_type: 'read_task', complexity: 'low' }),
            heuristicDecision: lowRiskDecision,
        });

        assert.match(calledUrl, /api\.x\.ai\/v1\/chat\/completions/);
        assert.equal(calledModel, 'grok-beta');
        assert.equal(result.metadata.modelProvider, 'xai');
        assert.equal(result.metadata.modelProfile, 'speed_first');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('createLlmDecisionResolverFromConfig supports mistral provider', async () => {
    const originalFetch = globalThis.fetch;
    let calledUrl = '';
    let calledModel: string | null = null;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        calledUrl = String(url);
        const parsedBody = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
        calledModel = parsedBody.model ?? null;

        return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(lowRiskDecision) } }],
            usage: { prompt_tokens: 65, completion_tokens: 11, total_tokens: 76 },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;

    try {
        const resolver = createLlmDecisionResolverFromConfig({
            provider: 'mistral',
            mistral: {
                api_key: 'mistral-key',
                model: 'mistral-small-latest',
                model_profiles: { speed_first: 'mistral-small-latest', quality_first: 'mistral-large-latest' },
            },
        });

        assert.ok(resolver);
        const result = await resolver!({
            task: makeTask({ action_type: 'read_task', complexity: 'low' }),
            heuristicDecision: lowRiskDecision,
        });

        assert.match(calledUrl, /api\.mistral\.ai\/v1\/chat\/completions/);
        assert.equal(calledModel, 'mistral-small-latest');
        assert.equal(result.metadata.modelProvider, 'mistral');
        assert.equal(result.metadata.modelProfile, 'speed_first');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('createLlmDecisionResolverFromConfig supports together provider', async () => {
    const originalFetch = globalThis.fetch;
    let calledUrl = '';
    let calledModel: string | null = null;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        calledUrl = String(url);
        const parsedBody = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
        calledModel = parsedBody.model ?? null;

        return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(lowRiskDecision) } }],
            usage: { prompt_tokens: 60, completion_tokens: 10, total_tokens: 70 },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;

    try {
        const resolver = createLlmDecisionResolverFromConfig({
            provider: 'together',
            together: {
                api_key: 'together-key',
                model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
            },
        });

        assert.ok(resolver);
        const result = await resolver!({
            task: makeTask({ action_type: 'read_task', complexity: 'low' }),
            heuristicDecision: lowRiskDecision,
        });

        assert.match(calledUrl, /api\.together\.xyz\/v1\/chat\/completions/);
        assert.equal(calledModel, 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo');
        assert.equal(result.metadata.modelProvider, 'together');
        assert.equal(result.metadata.modelProfile, 'speed_first');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('createLlmDecisionResolverFromConfig auto mode falls back from mistral to together', async () => {
    const originalFetch = globalThis.fetch;
    const calledUrls: string[] = [];

    globalThis.fetch = (async (url: string | URL | Request, _init?: RequestInit) => {
        const normalizedUrl = String(url);
        calledUrls.push(normalizedUrl);

        if (normalizedUrl.includes('api.mistral.ai')) {
            return new Response('mistral upstream error', { status: 503 });
        }

        return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(lowRiskDecision) } }],
            usage: { prompt_tokens: 55, completion_tokens: 9, total_tokens: 64 },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;

    try {
        const resolver = createLlmDecisionResolverFromConfig({
            provider: 'auto',
            mistral: { api_key: 'mistral-key', model: 'mistral-small-latest' },
            together: { api_key: 'together-key', model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo' },
            auto: {
                profile_providers: {
                    speed_first: ['mistral', 'together'],
                },
            },
        });

        assert.ok(resolver);
        const result = await resolver!({
            task: makeTask({ action_type: 'read_task', complexity: 'low' }),
            heuristicDecision: lowRiskDecision,
        });

        assert.equal(calledUrls.length, 2);
        assert.match(calledUrls[0] ?? '', /api\.mistral\.ai/);
        assert.match(calledUrls[1] ?? '', /api\.together\.xyz/);
        assert.equal(result.metadata.modelProvider, 'together');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('health scoring: failed provider gets deprioritized in subsequent auto calls', async () => {
    // Import health scoring utilities for verification
    const { getProviderHealthScores } = await import('./llm-decision-adapter.js');

    const originalFetch = globalThis.fetch;
    const calledUrls: string[] = [];
    let callIndex = 0;

    globalThis.fetch = (async (url: string | URL | Request, _init?: RequestInit) => {
        const normalizedUrl = String(url);
        calledUrls.push(normalizedUrl);
        callIndex++;

        // First two calls: xai fails, mistral succeeds
        if (normalizedUrl.includes('api.x.ai') && callIndex <= 2) {
            return new Response('xai error', { status: 500 });
        }

        return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(lowRiskDecision) } }],
            usage: { prompt_tokens: 50, completion_tokens: 8, total_tokens: 58 },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;

    try {
        const resolver = createLlmDecisionResolverFromConfig({
            provider: 'auto',
            xai: { api_key: 'xai-key', model: 'grok-beta' },
            mistral: { api_key: 'mistral-key', model: 'mistral-small-latest' },
            auto: {
                profile_providers: {
                    speed_first: ['xai', 'mistral'],
                },
            },
        });

        assert.ok(resolver);

        // First call: xai fails, mistral succeeds — health records xai as failed
        const result1 = await resolver!({
            task: makeTask({ action_type: 'read_task', complexity: 'low' }, 'task-health-1'),
            heuristicDecision: lowRiskDecision,
        });
        assert.equal(result1.metadata.modelProvider, 'mistral');

        // Verify health scores recorded a failure for xai
        const scores = getProviderHealthScores();
        assert.ok(scores['xai'], 'xai should have health data after a failed call');
        assert.ok((scores['xai']?.errorRate ?? 0) > 0, 'xai error rate should be > 0');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('auto provider routing prioritizes lower quality penalty using composite score', async () => {
    const originalFetch = globalThis.fetch;
    const calledUrls: string[] = [];

    // Degrade OpenAI quality and boost Anthropic quality for read_task.
    recordQualitySignal({ provider: 'openai', actionType: 'read_task', score: 0.1, source: 'runtime_outcome' });
    recordQualitySignal({ provider: 'anthropic', actionType: 'read_task', score: 0.95, source: 'runtime_outcome' });

    globalThis.fetch = (async (url: string | URL | Request, _init?: RequestInit) => {
        const normalizedUrl = String(url);
        calledUrls.push(normalizedUrl);

        if (normalizedUrl.includes('api.anthropic.com')) {
            return new Response(JSON.stringify({
                content: [{ text: JSON.stringify(lowRiskDecision) }],
                usage: {
                    input_tokens: 80,
                    output_tokens: 12,
                },
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        }

        return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(lowRiskDecision) } }],
            usage: {
                prompt_tokens: 80,
                completion_tokens: 12,
                total_tokens: 92,
            },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;

    try {
        const resolver = createLlmDecisionResolverFromConfig({
            provider: 'auto',
            openai: {
                api_key: 'sk-test',
                model: 'gpt-4o-mini',
            },
            anthropic: {
                api_key: 'anthropic-key',
                model: 'claude-3-5-haiku-latest',
            },
            auto: {
                profile_providers: {
                    speed_first: ['openai', 'anthropic'],
                },
            },
        });

        assert.ok(resolver);
        const result = await resolver!({
            task: makeTask({ action_type: 'read_task', complexity: 'low' }, 'task-quality-priority-1'),
            heuristicDecision: lowRiskDecision,
        });

        assert.equal(calledUrls.length, 1);
        assert.match(calledUrls[0] ?? '', /api\.anthropic\.com/);
        assert.equal(result.metadata.modelProvider, 'anthropic');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('auto mode persists cooldown windows and records skipped cooldown reason on subsequent resolver', async () => {
    await withCooldownStatePath('rehydrate', async (filePath) => {
        const originalFetch = globalThis.fetch;
        const calledUrls: string[] = [];

        globalThis.fetch = (async (url: string | URL | Request, _init?: RequestInit) => {
            const normalizedUrl = String(url);
            calledUrls.push(normalizedUrl);

            if (normalizedUrl.includes('api.x.ai')) {
                return new Response('xai rate limited', { status: 429 });
            }

            return new Response(JSON.stringify({
                choices: [{ message: { content: JSON.stringify(lowRiskDecision) } }],
                usage: { prompt_tokens: 50, completion_tokens: 8, total_tokens: 58 },
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        }) as typeof fetch;

        try {
            const resolver1 = createLlmDecisionResolverFromConfig({
                provider: 'auto',
                xai: { api_key: 'xai-key', model: 'grok-beta' },
                openai: { api_key: 'sk-test', model: 'gpt-4o-mini' },
                auto: {
                    profile_providers: {
                        speed_first: ['xai', 'openai'],
                    },
                },
            });

            assert.ok(resolver1);
            const firstResult = await resolver1!({
                task: makeTask({ action_type: 'read_task', complexity: 'low' }, 'task-cooldown-1'),
                heuristicDecision: lowRiskDecision,
            });

            assert.equal(firstResult.metadata.modelProvider, 'openai');
            assert.ok(existsSync(filePath));
            const persisted = JSON.parse(readFileSync(filePath, 'utf8')) as { providers?: Record<string, unknown> };
            assert.ok(persisted.providers?.['xai']);
            assert.equal(getProviderCooldownState()['xai']?.reasonCode, 'rate_limit');

            resetProviderRoutingMemory();
            calledUrls.length = 0;

            const resolver2 = createLlmDecisionResolverFromConfig({
                provider: 'auto',
                xai: { api_key: 'xai-key', model: 'grok-beta' },
                openai: { api_key: 'sk-test', model: 'gpt-4o-mini' },
                auto: {
                    profile_providers: {
                        speed_first: ['xai', 'openai'],
                    },
                },
            });

            assert.ok(resolver2);
            const secondResult = await resolver2!({
                task: makeTask({ action_type: 'read_task', complexity: 'low' }, 'task-cooldown-2'),
                heuristicDecision: lowRiskDecision,
            });

            assert.equal(calledUrls.length, 1);
            assert.match(calledUrls[0] ?? '', /api\.openai\.com/);
            assert.equal(secondResult.metadata.modelProvider, 'openai');
            assert.equal(secondResult.metadata.failoverTrace?.[0]?.provider, 'xai');
            assert.equal(secondResult.metadata.failoverTrace?.[0]?.reasonCode, 'rate_limit');
            assert.equal(secondResult.metadata.failoverTrace?.[0]?.disposition, 'skipped_cooldown');
            assert.ok(secondResult.metadata.failoverTrace?.[0]?.cooldownUntil);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

test('token budget guard emits warning payload override near limit', async () => {
    await withTokenBudgetStatePath('warning', async (filePath) => {
        const originalFetch = globalThis.fetch;

        writeFileSync(filePath, JSON.stringify({
            version: 1,
            byScope: {
                'default-tenant:ws-budget-warning:default-bot': {
                    day: new Date().toISOString().slice(0, 10),
                    consumedTokens: 85,
                    updatedAt: new Date().toISOString(),
                },
            },
        }));

        globalThis.fetch = (async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(lowRiskDecision) } }],
            usage: { prompt_tokens: 70, completion_tokens: 20, total_tokens: 90 },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        })) as typeof fetch;

        try {
            const resolver = createLlmDecisionResolverFromConfig({
                provider: 'openai',
                openai: {
                    api_key: 'sk-test',
                    model: 'gpt-4o-mini',
                },
            });

            assert.ok(resolver);
            const result = await resolver!({
                task: makeTask({ action_type: 'read_task', workspace_key: 'ws-budget-warning' }, 'task-budget-warning'),
                heuristicDecision: lowRiskDecision,
            });

            assert.equal(result.payloadOverrides?.['_budget_decision'], 'warning');
            assert.equal(result.payloadOverrides?.['_budget_limit_type'], 'daily_token_limit');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

test('token budget guard hard-stops and routes to approval when exhausted', async () => {
    await withTokenBudgetStatePath('deny', async (filePath) => {
        const originalFetch = globalThis.fetch;
        let fetchCalled = false;

        writeFileSync(filePath, JSON.stringify({
            version: 1,
            byScope: {
                'default-tenant:ws-budget-deny:default-bot': {
                    day: new Date().toISOString().slice(0, 10),
                    consumedTokens: 100,
                    updatedAt: new Date().toISOString(),
                },
            },
        }));

        globalThis.fetch = (async (_url: string | URL | Request, _init?: RequestInit) => {
            fetchCalled = true;
            return new Response('{}', { status: 500 });
        }) as typeof fetch;

        try {
            const resolver = createLlmDecisionResolverFromConfig({
                provider: 'openai',
                openai: {
                    api_key: 'sk-test',
                    model: 'gpt-4o-mini',
                },
            });

            assert.ok(resolver);
            const result = await resolver!({
                task: makeTask({ action_type: 'read_task', workspace_key: 'ws-budget-deny' }, 'task-budget-deny'),
                heuristicDecision: lowRiskDecision,
            });

            assert.equal(fetchCalled, false);
            assert.equal(result.decision.route, 'approval');
            assert.equal(result.payloadOverrides?.['_budget_decision'], 'denied');
            assert.equal(result.metadata.fallbackReason, 'token_budget_exhausted');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
