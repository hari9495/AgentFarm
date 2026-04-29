import {
    type ActionDecision,
    type LlmDecisionResolver,
    type TaskEnvelope,
} from './execution-engine.js';

type DecisionRoute = 'execute' | 'approval';

type DecisionRisk = 'low' | 'medium' | 'high';

type ParsedLlmDecision = {
    actionType: string;
    confidence: number;
    riskLevel: DecisionRisk;
    route: DecisionRoute;
    reason: string;
};

type OpenAiLikeUsage = {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
};

export type RuntimeLlmWorkspaceConfig = {
    provider: 'agentfarm' | 'openai' | 'azure_openai';
    timeout_ms?: number;
    openai?: {
        model?: string;
        base_url?: string;
        api_key?: string;
    };
    azure_openai?: {
        endpoint?: string;
        deployment?: string;
        api_version?: string;
        api_key?: string;
    };
};

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_AZURE_OPENAI_API_VERSION = '2024-06-01';
const DEFAULT_TIMEOUT_MS = 5_000;

const clamp01 = (value: number): number => {
    if (value < 0) {
        return 0;
    }
    if (value > 1) {
        return 1;
    }
    return Number(value.toFixed(2));
};

const readEnv = (env: NodeJS.ProcessEnv, primary: string, fallback: string): string | undefined => {
    return env[primary] ?? env[fallback];
};

const normalizeProvider = (value: string | undefined): 'agentfarm' | 'openai' | 'azure_openai' => {
    const normalized = value?.trim().toLowerCase();
    if (normalized === 'openai') {
        return 'openai';
    }
    if (normalized === 'azure_openai' || normalized === 'azure-openai') {
        return 'azure_openai';
    }
    return 'agentfarm';
};

const parseTimeoutMs = (value: string | undefined): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_TIMEOUT_MS;
    }
    return Math.min(Math.floor(parsed), 20_000);
};

const extractJsonPayload = (raw: string): string => {
    const trimmed = raw.trim();
    if (trimmed.startsWith('```')) {
        const lines = trimmed.split('\n');
        if (lines.length >= 3) {
            return lines.slice(1, -1).join('\n').trim();
        }
    }
    return trimmed;
};

const parseAndValidateDecision = (raw: string, fallback: ActionDecision): ParsedLlmDecision => {
    const parsed = JSON.parse(extractJsonPayload(raw)) as Record<string, unknown>;

    const actionTypeRaw = parsed['actionType'];
    const reasonRaw = parsed['reason'];
    const riskLevelRaw = parsed['riskLevel'];
    const routeRaw = parsed['route'];

    const actionType =
        typeof actionTypeRaw === 'string' && actionTypeRaw.trim().length > 0
            ? actionTypeRaw.trim().toLowerCase()
            : fallback.actionType;

    const reason =
        typeof reasonRaw === 'string' && reasonRaw.trim().length > 0
            ? reasonRaw.trim()
            : fallback.reason;

    const riskLevel: DecisionRisk =
        riskLevelRaw === 'low' || riskLevelRaw === 'medium' || riskLevelRaw === 'high'
            ? riskLevelRaw
            : fallback.riskLevel;

    const routeFromModel: DecisionRoute =
        routeRaw === 'execute' || routeRaw === 'approval'
            ? routeRaw
            : fallback.route;

    const route: DecisionRoute =
        riskLevel === 'medium' || riskLevel === 'high'
            ? 'approval'
            : routeFromModel;

    const confidenceRaw = parsed['confidence'];
    const confidence =
        typeof confidenceRaw === 'number'
            ? clamp01(confidenceRaw)
            : fallback.confidence;

    return {
        actionType,
        confidence,
        riskLevel,
        route,
        reason,
    };
};

const createTaskPrompt = (task: TaskEnvelope, heuristicDecision: ActionDecision): string => {
    return JSON.stringify(
        {
            objective: 'Classify AgentFarm task for action type, confidence, risk and route.',
            requiredResponseSchema: {
                actionType: 'string (snake_case)',
                confidence: 'number between 0 and 1',
                riskLevel: 'low | medium | high',
                route: 'execute | approval',
                reason: 'short explanation',
            },
            policy: [
                'For medium or high risk, route must be approval.',
                'Return JSON only. Do not wrap in markdown.',
                'Use the task payload and heuristic baseline below.',
            ],
            task,
            heuristicDecision,
        },
        null,
        2,
    );
};

const toNumberOrNull = (value: unknown): number | null => {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const createOpenAiResolver = (input: {
    apiKey: string;
    baseUrl: string;
    model: string;
    timeoutMs: number;
}): LlmDecisionResolver => {
    return async ({ task, heuristicDecision }) => {
        const response = await fetch(`${input.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${input.apiKey}`,
            },
            body: JSON.stringify({
                model: input.model,
                temperature: 0,
                response_format: { type: 'json_object' },
                messages: [
                    {
                        role: 'system',
                        content: 'You are a strict JSON classification engine for task routing.',
                    },
                    {
                        role: 'user',
                        content: createTaskPrompt(task, heuristicDecision),
                    },
                ],
            }),
            signal: AbortSignal.timeout(input.timeoutMs),
        });

        if (!response.ok) {
            throw new Error(`openai_request_failed:${response.status}`);
        }

        const parsed = await response.json() as {
            choices?: Array<{ message?: { content?: string } }>;
            usage?: OpenAiLikeUsage;
        };

        const content = parsed.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) {
            throw new Error('openai_empty_response');
        }

        const decision = parseAndValidateDecision(content, heuristicDecision);
        const usage = parsed.usage ?? {};

        return {
            decision,
            metadata: {
                modelProvider: 'openai',
                model: input.model,
                promptTokens: toNumberOrNull(usage.prompt_tokens),
                completionTokens: toNumberOrNull(usage.completion_tokens),
                totalTokens: toNumberOrNull(usage.total_tokens),
            },
        };
    };
};

const createAzureOpenAiResolver = (input: {
    endpoint: string;
    apiKey: string;
    deployment: string;
    apiVersion: string;
    timeoutMs: number;
}): LlmDecisionResolver => {
    const normalizedEndpoint = input.endpoint.replace(/\/+$/, '');
    const url = `${normalizedEndpoint}/openai/deployments/${input.deployment}/chat/completions?api-version=${encodeURIComponent(input.apiVersion)}`;

    return async ({ task, heuristicDecision }) => {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'api-key': input.apiKey,
            },
            body: JSON.stringify({
                temperature: 0,
                response_format: { type: 'json_object' },
                messages: [
                    {
                        role: 'system',
                        content: 'You are a strict JSON classification engine for task routing.',
                    },
                    {
                        role: 'user',
                        content: createTaskPrompt(task, heuristicDecision),
                    },
                ],
            }),
            signal: AbortSignal.timeout(input.timeoutMs),
        });

        if (!response.ok) {
            throw new Error(`azure_openai_request_failed:${response.status}`);
        }

        const parsed = await response.json() as {
            choices?: Array<{ message?: { content?: string } }>;
            usage?: OpenAiLikeUsage;
        };

        const content = parsed.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) {
            throw new Error('azure_openai_empty_response');
        }

        const decision = parseAndValidateDecision(content, heuristicDecision);
        const usage = parsed.usage ?? {};

        return {
            decision,
            metadata: {
                modelProvider: 'azure_openai',
                model: input.deployment,
                promptTokens: toNumberOrNull(usage.prompt_tokens),
                completionTokens: toNumberOrNull(usage.completion_tokens),
                totalTokens: toNumberOrNull(usage.total_tokens),
            },
        };
    };
};

export const createLlmDecisionResolverFromConfig = (
    config: RuntimeLlmWorkspaceConfig,
): LlmDecisionResolver | undefined => {
    const timeoutMs = parseTimeoutMs(config.timeout_ms ? String(config.timeout_ms) : undefined);

    if (config.provider === 'openai') {
        const apiKey = config.openai?.api_key;
        if (!apiKey || !apiKey.trim()) {
            return undefined;
        }

        return createOpenAiResolver({
            apiKey,
            baseUrl: config.openai?.base_url ?? DEFAULT_OPENAI_BASE_URL,
            model: config.openai?.model ?? DEFAULT_OPENAI_MODEL,
            timeoutMs,
        });
    }

    if (config.provider === 'azure_openai') {
        const endpoint = config.azure_openai?.endpoint;
        const apiKey = config.azure_openai?.api_key;
        const deployment = config.azure_openai?.deployment;
        if (!endpoint || !apiKey || !deployment) {
            return undefined;
        }

        return createAzureOpenAiResolver({
            endpoint,
            apiKey,
            deployment,
            apiVersion: config.azure_openai?.api_version ?? DEFAULT_AZURE_OPENAI_API_VERSION,
            timeoutMs,
        });
    }

    return undefined;
};

export const createLlmDecisionResolver = (env: NodeJS.ProcessEnv): LlmDecisionResolver | undefined => {
    const provider = normalizeProvider(readEnv(env, 'AF_MODEL_PROVIDER', 'AGENTFARM_MODEL_PROVIDER'));
    if (provider === 'agentfarm') {
        return undefined;
    }

    const timeoutMs = parseTimeoutMs(readEnv(env, 'AF_LLM_TIMEOUT_MS', 'AGENTFARM_LLM_TIMEOUT_MS'));

    if (provider === 'openai') {
        const apiKey = readEnv(env, 'AF_OPENAI_API_KEY', 'AGENTFARM_OPENAI_API_KEY');
        if (!apiKey || !apiKey.trim()) {
            return undefined;
        }

        const baseUrl = readEnv(env, 'AF_OPENAI_BASE_URL', 'AGENTFARM_OPENAI_BASE_URL') ?? DEFAULT_OPENAI_BASE_URL;
        const model = readEnv(env, 'AF_OPENAI_MODEL', 'AGENTFARM_OPENAI_MODEL') ?? DEFAULT_OPENAI_MODEL;

        return createOpenAiResolver({
            apiKey,
            baseUrl,
            model,
            timeoutMs,
        });
    }

    const azureEndpoint = readEnv(env, 'AF_AZURE_OPENAI_ENDPOINT', 'AGENTFARM_AZURE_OPENAI_ENDPOINT');
    const azureKey = readEnv(env, 'AF_AZURE_OPENAI_API_KEY', 'AGENTFARM_AZURE_OPENAI_API_KEY');
    const azureDeployment = readEnv(env, 'AF_AZURE_OPENAI_DEPLOYMENT', 'AGENTFARM_AZURE_OPENAI_DEPLOYMENT');
    const azureApiVersion =
        readEnv(env, 'AF_AZURE_OPENAI_API_VERSION', 'AGENTFARM_AZURE_OPENAI_API_VERSION')
        ?? DEFAULT_AZURE_OPENAI_API_VERSION;

    if (!azureEndpoint || !azureKey || !azureDeployment) {
        return undefined;
    }

    return createAzureOpenAiResolver({
        endpoint: azureEndpoint,
        apiKey: azureKey,
        deployment: azureDeployment,
        apiVersion: azureApiVersion,
        timeoutMs,
    });
};
