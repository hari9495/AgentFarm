import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import type {
    ProviderFailoverReasonCode,
    ProviderFailoverTraceRecord,
} from '@agentfarm/shared-types';
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

type ModelProfileKey = 'quality_first' | 'speed_first' | 'cost_balanced' | 'custom';

type ModelProfileMap = Partial<Record<ModelProfileKey, string>>;

type RuntimeModelProvider = 'agentfarm' | 'openai' | 'azure_openai' | 'github_models' | 'anthropic' | 'google' | 'xai' | 'mistral' | 'together' | 'auto';

type AutoProvider = 'openai' | 'azure_openai' | 'github_models' | 'anthropic' | 'google' | 'xai' | 'mistral' | 'together';

type AutoProfileProviderMap = Partial<Record<ModelProfileKey, AutoProvider[]>>;

export type RuntimeLlmWorkspaceConfig = {
    provider: RuntimeModelProvider;
    timeout_ms?: number;
    openai?: {
        model?: string;
        base_url?: string;
        api_key?: string;
        model_profiles?: ModelProfileMap;
    };
    azure_openai?: {
        endpoint?: string;
        deployment?: string;
        api_version?: string;
        api_key?: string;
        deployment_profiles?: ModelProfileMap;
    };
    github_models?: {
        model?: string;
        base_url?: string;
        api_key?: string;
        model_profiles?: ModelProfileMap;
    };
    anthropic?: {
        model?: string;
        base_url?: string;
        api_key?: string;
        model_profiles?: ModelProfileMap;
        api_version?: string;
    };
    google?: {
        model?: string;
        base_url?: string;
        api_key?: string;
        model_profiles?: ModelProfileMap;
    };
    xai?: {
        model?: string;
        base_url?: string;
        api_key?: string;
        model_profiles?: ModelProfileMap;
    };
    mistral?: {
        model?: string;
        base_url?: string;
        api_key?: string;
        model_profiles?: ModelProfileMap;
    };
    together?: {
        model?: string;
        base_url?: string;
        api_key?: string;
        model_profiles?: ModelProfileMap;
    };
    auto?: {
        profile_providers?: AutoProfileProviderMap;
    };
};

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_GITHUB_MODELS_BASE_URL = 'https://models.inference.ai.azure.com';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_ANTHROPIC_MODEL = 'claude-3-5-sonnet-latest';
const DEFAULT_ANTHROPIC_API_VERSION = '2023-06-01';
const DEFAULT_GOOGLE_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_GOOGLE_MODEL = 'gemini-1.5-flash';
const DEFAULT_XAI_BASE_URL = 'https://api.x.ai/v1';
const DEFAULT_XAI_MODEL = 'grok-beta';
const DEFAULT_MISTRAL_BASE_URL = 'https://api.mistral.ai/v1';
const DEFAULT_MISTRAL_MODEL = 'mistral-small-latest';
const DEFAULT_TOGETHER_BASE_URL = 'https://api.together.xyz/v1';
const DEFAULT_TOGETHER_MODEL = 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo';
const DEFAULT_AZURE_OPENAI_API_VERSION = '2024-06-01';
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_COOLDOWN_STATE_PATH = '.agent-runtime/provider-cooldowns.json';

type PersistedCooldownState = {
    version: 1;
    providers: Partial<Record<AutoProvider, {
        reasonCode: ProviderFailoverReasonCode;
        cooldownUntil: string;
        updatedAt: string;
    }>>;
};

// ---------------------------------------------------------------------------
// Provider health scoring
// ---------------------------------------------------------------------------

type ProviderHealthEntry = {
    timestamps: number[];
    latencies: number[];
    outcomes: boolean[];
};

const HEALTH_WINDOW_MS = 5 * 60 * 1_000;
const MAX_HEALTH_ENTRIES = 20;

const healthStore = new Map<AutoProvider, ProviderHealthEntry>();
const providerCooldownStore = new Map<AutoProvider, {
    reasonCode: ProviderFailoverReasonCode;
    cooldownUntil: number;
    updatedAt: number;
}>();
let cooldownStateLoaded = false;

const getCooldownStatePath = (): string => {
    const configured = process.env['AF_PROVIDER_COOLDOWN_STATE_PATH'] ?? process.env['AGENTFARM_PROVIDER_COOLDOWN_STATE_PATH'];
    return resolve(configured?.trim() || DEFAULT_COOLDOWN_STATE_PATH);
};

const ensureCooldownStateLoaded = (): void => {
    if (cooldownStateLoaded) {
        return;
    }
    cooldownStateLoaded = true;

    const filePath = getCooldownStatePath();
    if (!existsSync(filePath)) {
        return;
    }

    try {
        const raw = readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw) as PersistedCooldownState;
        const providers = parsed.providers ?? {};
        for (const provider of Object.keys(providers) as AutoProvider[]) {
            const entry = providers[provider];
            if (!entry) {
                continue;
            }
            const cooldownUntil = Date.parse(entry.cooldownUntil);
            const updatedAt = Date.parse(entry.updatedAt);
            if (!Number.isFinite(cooldownUntil) || cooldownUntil <= Date.now()) {
                continue;
            }
            providerCooldownStore.set(provider, {
                reasonCode: entry.reasonCode,
                cooldownUntil,
                updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
            });
        }
    } catch {
        providerCooldownStore.clear();
    }
};

const persistCooldownState = (): void => {
    const filePath = getCooldownStatePath();
    const now = Date.now();
    const providers: PersistedCooldownState['providers'] = {};

    for (const [provider, entry] of providerCooldownStore) {
        if (entry.cooldownUntil <= now) {
            continue;
        }
        providers[provider] = {
            reasonCode: entry.reasonCode,
            cooldownUntil: new Date(entry.cooldownUntil).toISOString(),
            updatedAt: new Date(entry.updatedAt).toISOString(),
        };
    }

    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify({ version: 1, providers }, null, 2));
};

const clearExpiredCooldowns = (): void => {
    ensureCooldownStateLoaded();
    const now = Date.now();
    let changed = false;
    for (const [provider, entry] of providerCooldownStore) {
        if (entry.cooldownUntil <= now) {
            providerCooldownStore.delete(provider);
            changed = true;
        }
    }
    if (changed) {
        persistCooldownState();
    }
};

const classifyFailoverReason = (error: unknown): ProviderFailoverReasonCode => {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (message.includes(':429') || message.includes('rate_limit') || message.includes('rate limited')) {
        return 'rate_limit';
    }
    if (message.includes(':401') || message.includes(':403') || message.includes('auth') || message.includes('permission')) {
        return 'auth_failure';
    }
    if (message.includes(':402') || message.includes('billing')) {
        return 'billing_disabled';
    }
    if (message.includes('timeout') || message.includes('aborted') || message.includes('aborterror')) {
        return 'timeout';
    }
    if (message.includes(':500') || message.includes(':502') || message.includes(':503') || message.includes(':504') || message.includes('unavailable')) {
        return 'provider_unavailable';
    }
    return 'unclassified';
};

const getCooldownDurationMs = (reasonCode: ProviderFailoverReasonCode): number => {
    if (reasonCode === 'rate_limit') {
        return 5 * 60_000;
    }
    if (reasonCode === 'provider_unavailable') {
        return 3 * 60_000;
    }
    if (reasonCode === 'timeout') {
        return 2 * 60_000;
    }
    if (reasonCode === 'billing_disabled') {
        return 30 * 60_000;
    }
    return 0;
};

const markProviderCooldown = (provider: AutoProvider, reasonCode: ProviderFailoverReasonCode): string | null => {
    const durationMs = getCooldownDurationMs(reasonCode);
    if (durationMs <= 0) {
        return null;
    }

    const now = Date.now();
    const cooldownUntil = now + durationMs;
    providerCooldownStore.set(provider, {
        reasonCode,
        cooldownUntil,
        updatedAt: now,
    });
    persistCooldownState();
    return new Date(cooldownUntil).toISOString();
};

const clearProviderCooldown = (provider: AutoProvider): void => {
    ensureCooldownStateLoaded();
    if (!providerCooldownStore.has(provider)) {
        return;
    }
    providerCooldownStore.delete(provider);
    persistCooldownState();
};

const readProviderCooldown = (provider: AutoProvider): {
    reasonCode: ProviderFailoverReasonCode;
    cooldownUntil: string;
} | null => {
    clearExpiredCooldowns();
    const entry = providerCooldownStore.get(provider);
    if (!entry) {
        return null;
    }
    return {
        reasonCode: entry.reasonCode,
        cooldownUntil: new Date(entry.cooldownUntil).toISOString(),
    };
};

export const resetProviderRoutingMemory = (): void => {
    healthStore.clear();
    providerCooldownStore.clear();
    cooldownStateLoaded = false;
};

export const resetProviderRoutingState = (): void => {
    healthStore.clear();
    providerCooldownStore.clear();
    cooldownStateLoaded = true;
    persistCooldownState();
    cooldownStateLoaded = false;
};

export const getProviderCooldownState = (): Record<string, { reasonCode: ProviderFailoverReasonCode; cooldownUntil: string }> => {
    clearExpiredCooldowns();
    const result: Record<string, { reasonCode: ProviderFailoverReasonCode; cooldownUntil: string }> = {};
    for (const [provider, entry] of providerCooldownStore) {
        result[provider] = {
            reasonCode: entry.reasonCode,
            cooldownUntil: new Date(entry.cooldownUntil).toISOString(),
        };
    }
    return result;
};

const pruneHealthEntry = (entry: ProviderHealthEntry): void => {
    const cutoff = Date.now() - HEALTH_WINDOW_MS;
    while (entry.timestamps.length > 0 && (entry.timestamps[0] ?? 0) < cutoff) {
        entry.timestamps.shift();
        entry.latencies.shift();
        entry.outcomes.shift();
    }
    while (entry.timestamps.length > MAX_HEALTH_ENTRIES) {
        entry.timestamps.shift();
        entry.latencies.shift();
        entry.outcomes.shift();
    }
};

const recordProviderCall = (provider: AutoProvider, latencyMs: number, success: boolean): void => {
    if (!healthStore.has(provider)) {
        healthStore.set(provider, { timestamps: [], latencies: [], outcomes: [] });
    }
    const entry = healthStore.get(provider)!;
    pruneHealthEntry(entry);
    entry.timestamps.push(Date.now());
    entry.latencies.push(latencyMs);
    entry.outcomes.push(success);
};

const scoreProvider = (provider: AutoProvider): number => {
    const entry = healthStore.get(provider);
    if (!entry || entry.latencies.length === 0) {
        return 0;
    }
    pruneHealthEntry(entry);
    if (entry.latencies.length === 0) {
        return 0;
    }
    const avgLatency = entry.latencies.reduce((sum, l) => sum + l, 0) / entry.latencies.length;
    const errorRate = entry.outcomes.filter((o) => !o).length / entry.outcomes.length;
    return errorRate * 0.7 + (Math.min(avgLatency, 10_000) / 10_000) * 0.3;
};

export const getProviderHealthScores = (): Record<string, {
    avgLatencyMs: number;
    errorRate: number;
    score: number;
    sampleCount: number;
}> => {
    const result: Record<string, { avgLatencyMs: number; errorRate: number; score: number; sampleCount: number }> = {};
    for (const [provider, entry] of healthStore) {
        pruneHealthEntry(entry);
        if (entry.latencies.length === 0) {
            continue;
        }
        const avgLatencyMs = entry.latencies.reduce((sum, l) => sum + l, 0) / entry.latencies.length;
        const errorCount = entry.outcomes.filter((o) => !o).length;
        const errorRate = errorCount / entry.outcomes.length;
        result[provider] = {
            avgLatencyMs: Math.round(avgLatencyMs),
            errorRate: Number(errorRate.toFixed(3)),
            score: Number(scoreProvider(provider).toFixed(3)),
            sampleCount: entry.latencies.length,
        };
    }
    return result;
};

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

const normalizeProvider = (value: string | undefined): RuntimeModelProvider => {
    const normalized = value?.trim().toLowerCase();
    if (normalized === 'openai') {
        return 'openai';
    }
    if (normalized === 'azure_openai' || normalized === 'azure-openai') {
        return 'azure_openai';
    }
    if (normalized === 'github_models' || normalized === 'github-models' || normalized === 'github') {
        return 'github_models';
    }
    if (normalized === 'anthropic' || normalized === 'claude') {
        return 'anthropic';
    }
    if (normalized === 'google' || normalized === 'gemini') {
        return 'google';
    }
    if (normalized === 'xai' || normalized === 'x.ai' || normalized === 'grok') {
        return 'xai';
    }
    if (normalized === 'mistral') {
        return 'mistral';
    }
    if (normalized === 'together' || normalized === 'togetherai') {
        return 'together';
    }
    if (normalized === 'auto') {
        return 'auto';
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

const normalizeAutoProviders = (value: unknown): AutoProvider[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    const providers: AutoProvider[] = [];
    for (const entry of value) {
        if (entry === 'openai' || entry === 'azure_openai' || entry === 'github_models' || entry === 'anthropic' || entry === 'google' || entry === 'xai' || entry === 'mistral' || entry === 'together') {
            providers.push(entry);
        }
    }

    return Array.from(new Set(providers));
};

const defaultAutoProvidersByProfile = (profile: ModelProfileKey): AutoProvider[] => {
    if (profile === 'quality_first') {
        return ['anthropic', 'azure_openai', 'openai', 'xai', 'google', 'mistral', 'github_models', 'together'];
    }

    if (profile === 'speed_first') {
        return ['together', 'mistral', 'google', 'github_models', 'xai', 'openai', 'azure_openai', 'anthropic'];
    }

    if (profile === 'cost_balanced') {
        return ['together', 'mistral', 'github_models', 'google', 'xai', 'openai', 'azure_openai', 'anthropic'];
    }

    return ['openai', 'anthropic', 'google', 'xai', 'mistral', 'together', 'github_models', 'azure_openai'];
};

const createAnthropicResolver = (input: {
    apiKey: string;
    baseUrl: string;
    model: string;
    modelProfiles?: ModelProfileMap;
    timeoutMs: number;
    apiVersion: string;
}): LlmDecisionResolver => {
    return async ({ task, heuristicDecision }) => {
        const modelProfile = pickModelProfile(task, heuristicDecision);
        const selectedModel = resolveProfileTarget(input.model, input.modelProfiles, modelProfile);
        const response = await fetch(`${input.baseUrl.replace(/\/+$/, '')}/v1/messages`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': input.apiKey,
                'anthropic-version': input.apiVersion,
            },
            body: JSON.stringify({
                model: selectedModel,
                max_tokens: 512,
                temperature: 0,
                system: 'You are a strict JSON classification engine for task routing.',
                messages: [
                    {
                        role: 'user',
                        content: createTaskPrompt(task, heuristicDecision),
                    },
                ],
            }),
            signal: AbortSignal.timeout(input.timeoutMs),
        });

        if (!response.ok) {
            throw new Error(`anthropic_request_failed:${response.status}`);
        }

        const parsed = await response.json() as {
            content?: Array<{ text?: string }>;
            usage?: { input_tokens?: number; output_tokens?: number };
        };

        const content = parsed.content?.[0]?.text;
        if (typeof content !== 'string' || !content.trim()) {
            throw new Error('anthropic_empty_response');
        }

        const decision = parseAndValidateDecision(content, heuristicDecision);
        const promptTokens = toNumberOrNull(parsed.usage?.input_tokens);
        const completionTokens = toNumberOrNull(parsed.usage?.output_tokens);
        const totalTokens =
            promptTokens !== null && completionTokens !== null
                ? promptTokens + completionTokens
                : null;

        return {
            decision,
            metadata: {
                modelProvider: 'anthropic',
                model: selectedModel,
                modelProfile,
                promptTokens,
                completionTokens,
                totalTokens,
            },
        };
    };
};

const createGoogleResolver = (input: {
    apiKey: string;
    baseUrl: string;
    model: string;
    modelProfiles?: ModelProfileMap;
    timeoutMs: number;
}): LlmDecisionResolver => {
    return async ({ task, heuristicDecision }) => {
        const modelProfile = pickModelProfile(task, heuristicDecision);
        const selectedModel = resolveProfileTarget(input.model, input.modelProfiles, modelProfile);
        const base = input.baseUrl.replace(/\/+$/, '');
        const url = `${base}/models/${encodeURIComponent(selectedModel)}:generateContent?key=${encodeURIComponent(input.apiKey)}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                generationConfig: {
                    temperature: 0,
                    responseMimeType: 'application/json',
                },
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: createTaskPrompt(task, heuristicDecision) }],
                    },
                ],
            }),
            signal: AbortSignal.timeout(input.timeoutMs),
        });

        if (!response.ok) {
            throw new Error(`google_request_failed:${response.status}`);
        }

        const parsed = await response.json() as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            usageMetadata?: {
                promptTokenCount?: number;
                candidatesTokenCount?: number;
                totalTokenCount?: number;
            };
        };

        const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof content !== 'string' || !content.trim()) {
            throw new Error('google_empty_response');
        }

        const decision = parseAndValidateDecision(content, heuristicDecision);

        return {
            decision,
            metadata: {
                modelProvider: 'google',
                model: selectedModel,
                modelProfile,
                promptTokens: toNumberOrNull(parsed.usageMetadata?.promptTokenCount),
                completionTokens: toNumberOrNull(parsed.usageMetadata?.candidatesTokenCount),
                totalTokens: toNumberOrNull(parsed.usageMetadata?.totalTokenCount),
            },
        };
    };
};

const parseModelProfile = (value: string | undefined): ModelProfileKey | null => {
    const normalized = value?.trim().toLowerCase();
    if (normalized === 'quality_first' || normalized === 'speed_first' || normalized === 'cost_balanced' || normalized === 'custom') {
        return normalized;
    }
    return null;
};

const pickModelProfile = (task: TaskEnvelope, heuristicDecision: ActionDecision): ModelProfileKey => {
    const complexity = typeof task.payload['complexity'] === 'string'
        ? task.payload['complexity'].trim().toLowerCase()
        : null;

    if (heuristicDecision.riskLevel === 'high' || complexity === 'high') {
        return 'quality_first';
    }

    if (heuristicDecision.riskLevel === 'medium' || complexity === 'medium') {
        return 'speed_first';
    }

    return 'cost_balanced';
};

const resolveProfileTarget = (
    defaultTarget: string,
    profiles: ModelProfileMap | undefined,
    profile: ModelProfileKey,
): string => {
    const fromProfile = profiles?.[profile];
    if (typeof fromProfile === 'string' && fromProfile.trim()) {
        return fromProfile.trim();
    }
    return defaultTarget;
};

const createOpenAiResolver = (input: {
    apiKey: string;
    baseUrl: string;
    model: string;
    modelProfiles?: ModelProfileMap;
    timeoutMs: number;
}): LlmDecisionResolver => {
    return async ({ task, heuristicDecision }) => {
        const modelProfile = pickModelProfile(task, heuristicDecision);
        const selectedModel = resolveProfileTarget(input.model, input.modelProfiles, modelProfile);
        const response = await fetch(`${input.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${input.apiKey}`,
            },
            body: JSON.stringify({
                model: selectedModel,
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
                model: selectedModel,
                modelProfile,
                promptTokens: toNumberOrNull(usage.prompt_tokens),
                completionTokens: toNumberOrNull(usage.completion_tokens),
                totalTokens: toNumberOrNull(usage.total_tokens),
            },
        };
    };
};

const createGitHubModelsResolver = (input: {
    apiKey: string;
    baseUrl: string;
    model: string;
    modelProfiles?: ModelProfileMap;
    timeoutMs: number;
}): LlmDecisionResolver => {
    return async ({ task, heuristicDecision }) => {
        const modelProfile = pickModelProfile(task, heuristicDecision);
        const selectedModel = resolveProfileTarget(input.model, input.modelProfiles, modelProfile);
        const response = await fetch(`${input.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${input.apiKey}`,
            },
            body: JSON.stringify({
                model: selectedModel,
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
            throw new Error(`github_models_request_failed:${response.status}`);
        }

        const parsed = await response.json() as {
            choices?: Array<{ message?: { content?: string } }>;
            usage?: OpenAiLikeUsage;
        };

        const content = parsed.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) {
            throw new Error('github_models_empty_response');
        }

        const decision = parseAndValidateDecision(content, heuristicDecision);
        const usage = parsed.usage ?? {};

        return {
            decision,
            metadata: {
                modelProvider: 'github_models',
                model: selectedModel,
                modelProfile,
                promptTokens: toNumberOrNull(usage.prompt_tokens),
                completionTokens: toNumberOrNull(usage.completion_tokens),
                totalTokens: toNumberOrNull(usage.total_tokens),
            },
        };
    };
};

const createXaiResolver = (input: {
    apiKey: string;
    baseUrl: string;
    model: string;
    modelProfiles?: ModelProfileMap;
    timeoutMs: number;
}): LlmDecisionResolver => {
    return async ({ task, heuristicDecision }) => {
        const modelProfile = pickModelProfile(task, heuristicDecision);
        const selectedModel = resolveProfileTarget(input.model, input.modelProfiles, modelProfile);
        const response = await fetch(`${input.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${input.apiKey}`,
            },
            body: JSON.stringify({
                model: selectedModel,
                temperature: 0,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: 'You are a strict JSON classification engine for task routing.' },
                    { role: 'user', content: createTaskPrompt(task, heuristicDecision) },
                ],
            }),
            signal: AbortSignal.timeout(input.timeoutMs),
        });

        if (!response.ok) {
            throw new Error(`xai_request_failed:${response.status}`);
        }

        const parsed = await response.json() as {
            choices?: Array<{ message?: { content?: string } }>;
            usage?: OpenAiLikeUsage;
        };

        const content = parsed.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) {
            throw new Error('xai_empty_response');
        }

        const decision = parseAndValidateDecision(content, heuristicDecision);
        const usage = parsed.usage ?? {};

        return {
            decision,
            metadata: {
                modelProvider: 'xai',
                model: selectedModel,
                modelProfile,
                promptTokens: toNumberOrNull(usage.prompt_tokens),
                completionTokens: toNumberOrNull(usage.completion_tokens),
                totalTokens: toNumberOrNull(usage.total_tokens),
            },
        };
    };
};

const createMistralResolver = (input: {
    apiKey: string;
    baseUrl: string;
    model: string;
    modelProfiles?: ModelProfileMap;
    timeoutMs: number;
}): LlmDecisionResolver => {
    return async ({ task, heuristicDecision }) => {
        const modelProfile = pickModelProfile(task, heuristicDecision);
        const selectedModel = resolveProfileTarget(input.model, input.modelProfiles, modelProfile);
        const response = await fetch(`${input.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${input.apiKey}`,
            },
            body: JSON.stringify({
                model: selectedModel,
                temperature: 0,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: 'You are a strict JSON classification engine for task routing.' },
                    { role: 'user', content: createTaskPrompt(task, heuristicDecision) },
                ],
            }),
            signal: AbortSignal.timeout(input.timeoutMs),
        });

        if (!response.ok) {
            throw new Error(`mistral_request_failed:${response.status}`);
        }

        const parsed = await response.json() as {
            choices?: Array<{ message?: { content?: string } }>;
            usage?: OpenAiLikeUsage;
        };

        const content = parsed.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) {
            throw new Error('mistral_empty_response');
        }

        const decision = parseAndValidateDecision(content, heuristicDecision);
        const usage = parsed.usage ?? {};

        return {
            decision,
            metadata: {
                modelProvider: 'mistral',
                model: selectedModel,
                modelProfile,
                promptTokens: toNumberOrNull(usage.prompt_tokens),
                completionTokens: toNumberOrNull(usage.completion_tokens),
                totalTokens: toNumberOrNull(usage.total_tokens),
            },
        };
    };
};

const createTogetherResolver = (input: {
    apiKey: string;
    baseUrl: string;
    model: string;
    modelProfiles?: ModelProfileMap;
    timeoutMs: number;
}): LlmDecisionResolver => {
    return async ({ task, heuristicDecision }) => {
        const modelProfile = pickModelProfile(task, heuristicDecision);
        const selectedModel = resolveProfileTarget(input.model, input.modelProfiles, modelProfile);
        const response = await fetch(`${input.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${input.apiKey}`,
            },
            body: JSON.stringify({
                model: selectedModel,
                temperature: 0,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: 'You are a strict JSON classification engine for task routing.' },
                    { role: 'user', content: createTaskPrompt(task, heuristicDecision) },
                ],
            }),
            signal: AbortSignal.timeout(input.timeoutMs),
        });

        if (!response.ok) {
            throw new Error(`together_request_failed:${response.status}`);
        }

        const parsed = await response.json() as {
            choices?: Array<{ message?: { content?: string } }>;
            usage?: OpenAiLikeUsage;
        };

        const content = parsed.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) {
            throw new Error('together_empty_response');
        }

        const decision = parseAndValidateDecision(content, heuristicDecision);
        const usage = parsed.usage ?? {};

        return {
            decision,
            metadata: {
                modelProvider: 'together',
                model: selectedModel,
                modelProfile,
                promptTokens: toNumberOrNull(usage.prompt_tokens),
                completionTokens: toNumberOrNull(usage.completion_tokens),
                totalTokens: toNumberOrNull(usage.total_tokens),
            },
        };
    };
};

const createAutoResolver = (input: {
    timeoutMs: number;
    openai?: RuntimeLlmWorkspaceConfig['openai'];
    azureOpenai?: RuntimeLlmWorkspaceConfig['azure_openai'];
    githubModels?: RuntimeLlmWorkspaceConfig['github_models'];
    anthropic?: RuntimeLlmWorkspaceConfig['anthropic'];
    google?: RuntimeLlmWorkspaceConfig['google'];
    xai?: RuntimeLlmWorkspaceConfig['xai'];
    mistral?: RuntimeLlmWorkspaceConfig['mistral'];
    together?: RuntimeLlmWorkspaceConfig['together'];
    profileProviders?: AutoProfileProviderMap;
}): LlmDecisionResolver | undefined => {
    const openaiResolver = input.openai?.api_key?.trim()
        ? createOpenAiResolver({
            apiKey: input.openai.api_key,
            baseUrl: input.openai.base_url ?? DEFAULT_OPENAI_BASE_URL,
            model: input.openai.model ?? DEFAULT_OPENAI_MODEL,
            modelProfiles: input.openai.model_profiles,
            timeoutMs: input.timeoutMs,
        })
        : undefined;

    const azureResolver =
        input.azureOpenai?.endpoint
            && input.azureOpenai?.api_key
            && input.azureOpenai?.deployment
            ? createAzureOpenAiResolver({
                endpoint: input.azureOpenai.endpoint,
                apiKey: input.azureOpenai.api_key,
                deployment: input.azureOpenai.deployment,
                deploymentProfiles: input.azureOpenai.deployment_profiles,
                apiVersion: input.azureOpenai.api_version ?? DEFAULT_AZURE_OPENAI_API_VERSION,
                timeoutMs: input.timeoutMs,
            })
            : undefined;

    const githubResolver = input.githubModels?.api_key?.trim()
        ? createGitHubModelsResolver({
            apiKey: input.githubModels.api_key,
            baseUrl: input.githubModels.base_url ?? DEFAULT_GITHUB_MODELS_BASE_URL,
            model: input.githubModels.model ?? 'openai/gpt-4.1-mini',
            modelProfiles: input.githubModels.model_profiles,
            timeoutMs: input.timeoutMs,
        })
        : undefined;

    const anthropicResolver = input.anthropic?.api_key?.trim()
        ? createAnthropicResolver({
            apiKey: input.anthropic.api_key,
            baseUrl: input.anthropic.base_url ?? DEFAULT_ANTHROPIC_BASE_URL,
            model: input.anthropic.model ?? DEFAULT_ANTHROPIC_MODEL,
            modelProfiles: input.anthropic.model_profiles,
            timeoutMs: input.timeoutMs,
            apiVersion: input.anthropic.api_version ?? DEFAULT_ANTHROPIC_API_VERSION,
        })
        : undefined;

    const googleResolver = input.google?.api_key?.trim()
        ? createGoogleResolver({
            apiKey: input.google.api_key,
            baseUrl: input.google.base_url ?? DEFAULT_GOOGLE_BASE_URL,
            model: input.google.model ?? DEFAULT_GOOGLE_MODEL,
            modelProfiles: input.google.model_profiles,
            timeoutMs: input.timeoutMs,
        })
        : undefined;

    const xaiResolver = input.xai?.api_key?.trim()
        ? createXaiResolver({
            apiKey: input.xai.api_key,
            baseUrl: input.xai.base_url ?? DEFAULT_XAI_BASE_URL,
            model: input.xai.model ?? DEFAULT_XAI_MODEL,
            modelProfiles: input.xai.model_profiles,
            timeoutMs: input.timeoutMs,
        })
        : undefined;

    const mistralResolver = input.mistral?.api_key?.trim()
        ? createMistralResolver({
            apiKey: input.mistral.api_key,
            baseUrl: input.mistral.base_url ?? DEFAULT_MISTRAL_BASE_URL,
            model: input.mistral.model ?? DEFAULT_MISTRAL_MODEL,
            modelProfiles: input.mistral.model_profiles,
            timeoutMs: input.timeoutMs,
        })
        : undefined;

    const togetherResolver = input.together?.api_key?.trim()
        ? createTogetherResolver({
            apiKey: input.together.api_key,
            baseUrl: input.together.base_url ?? DEFAULT_TOGETHER_BASE_URL,
            model: input.together.model ?? DEFAULT_TOGETHER_MODEL,
            modelProfiles: input.together.model_profiles,
            timeoutMs: input.timeoutMs,
        })
        : undefined;

    const resolverMap: Record<AutoProvider, LlmDecisionResolver | undefined> = {
        openai: openaiResolver,
        azure_openai: azureResolver,
        github_models: githubResolver,
        anthropic: anthropicResolver,
        google: googleResolver,
        xai: xaiResolver,
        mistral: mistralResolver,
        together: togetherResolver,
    };

    const hasAnyResolver = Object.values(resolverMap).some((resolver) => Boolean(resolver));
    if (!hasAnyResolver) {
        return undefined;
    }

    return async ({ task, heuristicDecision }) => {
        clearExpiredCooldowns();
        const profile = pickModelProfile(task, heuristicDecision);
        const configuredProviders = normalizeAutoProviders(input.profileProviders?.[profile]);
        const baseProviders = configuredProviders.length > 0
            ? configuredProviders
            : defaultAutoProvidersByProfile(profile);

        // Health-score reordering: sort by ascending composite score (lower = healthier).
        // Providers with no health data score 0 and remain in their original relative order.
        const providers = [...baseProviders].sort((a, b) => scoreProvider(a) - scoreProvider(b));

        let lastError: unknown = null;
        const failoverTrace: ProviderFailoverTraceRecord[] = [];
        for (const provider of providers) {
            const cooldown = readProviderCooldown(provider);
            if (cooldown) {
                failoverTrace.push({
                    provider,
                    reasonCode: cooldown.reasonCode,
                    disposition: 'skipped_cooldown',
                    occurredAt: new Date().toISOString(),
                    cooldownUntil: cooldown.cooldownUntil,
                });
                continue;
            }

            const resolver = resolverMap[provider];
            if (!resolver) {
                failoverTrace.push({
                    provider,
                    reasonCode: 'unclassified',
                    disposition: 'skipped_unconfigured',
                    occurredAt: new Date().toISOString(),
                    detail: 'provider_not_configured',
                    cooldownUntil: null,
                });
                continue;
            }

            const start = Date.now();
            try {
                const result = await resolver({ task, heuristicDecision });
                recordProviderCall(provider, Date.now() - start, true);
                clearProviderCooldown(provider);
                return {
                    ...result,
                    metadata: {
                        ...result.metadata,
                        fallbackReason:
                            failoverTrace.length > 0
                                ? `auto_failover_${failoverTrace[failoverTrace.length - 1]?.reasonCode ?? 'unclassified'}`
                                : undefined,
                        failoverTrace: failoverTrace.length > 0 ? failoverTrace : undefined,
                    },
                };
            } catch (error: unknown) {
                recordProviderCall(provider, Date.now() - start, false);
                const reasonCode = classifyFailoverReason(error);
                const cooldownUntil = markProviderCooldown(provider, reasonCode);
                failoverTrace.push({
                    provider,
                    reasonCode,
                    disposition: 'attempt_failed',
                    occurredAt: new Date().toISOString(),
                    detail: error instanceof Error ? error.message : String(error),
                    cooldownUntil,
                });
                lastError = error;
            }
        }

        if (lastError instanceof Error) {
            throw lastError;
        }

        throw new Error('auto_routing_no_provider_available');
    };
};

const createAzureOpenAiResolver = (input: {
    endpoint: string;
    apiKey: string;
    deployment: string;
    deploymentProfiles?: ModelProfileMap;
    apiVersion: string;
    timeoutMs: number;
}): LlmDecisionResolver => {
    const normalizedEndpoint = input.endpoint.replace(/\/+$/, '');

    return async ({ task, heuristicDecision }) => {
        const modelProfile = pickModelProfile(task, heuristicDecision);
        const selectedDeployment = resolveProfileTarget(
            input.deployment,
            input.deploymentProfiles,
            modelProfile,
        );
        const url = `${normalizedEndpoint}/openai/deployments/${selectedDeployment}/chat/completions?api-version=${encodeURIComponent(input.apiVersion)}`;
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
                model: selectedDeployment,
                modelProfile,
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
            modelProfiles: config.openai?.model_profiles,
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
            deploymentProfiles: config.azure_openai?.deployment_profiles,
            apiVersion: config.azure_openai?.api_version ?? DEFAULT_AZURE_OPENAI_API_VERSION,
            timeoutMs,
        });
    }

    if (config.provider === 'github_models') {
        const apiKey = config.github_models?.api_key;
        if (!apiKey || !apiKey.trim()) {
            return undefined;
        }

        return createGitHubModelsResolver({
            apiKey,
            baseUrl: config.github_models?.base_url ?? DEFAULT_GITHUB_MODELS_BASE_URL,
            model: config.github_models?.model ?? 'openai/gpt-4.1-mini',
            modelProfiles: config.github_models?.model_profiles,
            timeoutMs,
        });
    }

    if (config.provider === 'anthropic') {
        const apiKey = config.anthropic?.api_key;
        if (!apiKey || !apiKey.trim()) {
            return undefined;
        }

        return createAnthropicResolver({
            apiKey,
            baseUrl: config.anthropic?.base_url ?? DEFAULT_ANTHROPIC_BASE_URL,
            model: config.anthropic?.model ?? DEFAULT_ANTHROPIC_MODEL,
            modelProfiles: config.anthropic?.model_profiles,
            timeoutMs,
            apiVersion: config.anthropic?.api_version ?? DEFAULT_ANTHROPIC_API_VERSION,
        });
    }

    if (config.provider === 'xai') {
        const apiKey = config.xai?.api_key;
        if (!apiKey || !apiKey.trim()) {
            return undefined;
        }

        return createXaiResolver({
            apiKey,
            baseUrl: config.xai?.base_url ?? DEFAULT_XAI_BASE_URL,
            model: config.xai?.model ?? DEFAULT_XAI_MODEL,
            modelProfiles: config.xai?.model_profiles,
            timeoutMs,
        });
    }

    if (config.provider === 'mistral') {
        const apiKey = config.mistral?.api_key;
        if (!apiKey || !apiKey.trim()) {
            return undefined;
        }

        return createMistralResolver({
            apiKey,
            baseUrl: config.mistral?.base_url ?? DEFAULT_MISTRAL_BASE_URL,
            model: config.mistral?.model ?? DEFAULT_MISTRAL_MODEL,
            modelProfiles: config.mistral?.model_profiles,
            timeoutMs,
        });
    }

    if (config.provider === 'together') {
        const apiKey = config.together?.api_key;
        if (!apiKey || !apiKey.trim()) {
            return undefined;
        }

        return createTogetherResolver({
            apiKey,
            baseUrl: config.together?.base_url ?? DEFAULT_TOGETHER_BASE_URL,
            model: config.together?.model ?? DEFAULT_TOGETHER_MODEL,
            modelProfiles: config.together?.model_profiles,
            timeoutMs,
        });
    }

    if (config.provider === 'google') {
        const apiKey = config.google?.api_key;
        if (!apiKey || !apiKey.trim()) {
            return undefined;
        }

        return createGoogleResolver({
            apiKey,
            baseUrl: config.google?.base_url ?? DEFAULT_GOOGLE_BASE_URL,
            model: config.google?.model ?? DEFAULT_GOOGLE_MODEL,
            modelProfiles: config.google?.model_profiles,
            timeoutMs,
        });
    }

    if (config.provider === 'auto') {
        return createAutoResolver({
            timeoutMs,
            openai: config.openai,
            azureOpenai: config.azure_openai,
            githubModels: config.github_models,
            anthropic: config.anthropic,
            google: config.google,
            xai: config.xai,
            mistral: config.mistral,
            together: config.together,
            profileProviders: config.auto?.profile_providers,
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

    const githubBaseUrl =
        readEnv(env, 'AF_GITHUB_MODELS_BASE_URL', 'AGENTFARM_GITHUB_MODELS_BASE_URL')
        ?? DEFAULT_GITHUB_MODELS_BASE_URL;
    const githubModel =
        readEnv(env, 'AF_GITHUB_MODELS_MODEL', 'AGENTFARM_GITHUB_MODELS_MODEL')
        ?? 'openai/gpt-4.1-mini';
    const githubApiKey =
        readEnv(env, 'AF_GITHUB_MODELS_API_KEY', 'AGENTFARM_GITHUB_MODELS_API_KEY');

    if (provider === 'openai') {
        const apiKey = readEnv(env, 'AF_OPENAI_API_KEY', 'AGENTFARM_OPENAI_API_KEY');
        if (!apiKey || !apiKey.trim()) {
            return undefined;
        }

        const baseUrl = readEnv(env, 'AF_OPENAI_BASE_URL', 'AGENTFARM_OPENAI_BASE_URL') ?? DEFAULT_OPENAI_BASE_URL;
        const model = readEnv(env, 'AF_OPENAI_MODEL', 'AGENTFARM_OPENAI_MODEL') ?? DEFAULT_OPENAI_MODEL;
        const modelProfiles: ModelProfileMap = {
            quality_first:
                readEnv(env, 'AF_OPENAI_MODEL_QUALITY_FIRST', 'AGENTFARM_OPENAI_MODEL_QUALITY_FIRST'),
            speed_first:
                readEnv(env, 'AF_OPENAI_MODEL_SPEED_FIRST', 'AGENTFARM_OPENAI_MODEL_SPEED_FIRST'),
            cost_balanced:
                readEnv(env, 'AF_OPENAI_MODEL_COST_BALANCED', 'AGENTFARM_OPENAI_MODEL_COST_BALANCED'),
            custom:
                readEnv(env, 'AF_OPENAI_MODEL_CUSTOM', 'AGENTFARM_OPENAI_MODEL_CUSTOM'),
        };

        const profileOverride = parseModelProfile(
            readEnv(env, 'AF_DEFAULT_MODEL_PROFILE', 'AGENTFARM_DEFAULT_MODEL_PROFILE'),
        );
        if (profileOverride) {
            modelProfiles[profileOverride] = model;
        }

        return createOpenAiResolver({
            apiKey,
            baseUrl,
            model,
            modelProfiles,
            timeoutMs,
        });
    }

    if (provider === 'github_models') {
        if (!githubApiKey || !githubApiKey.trim()) {
            return undefined;
        }

        const githubModelProfiles: ModelProfileMap = {
            quality_first:
                readEnv(env, 'AF_GITHUB_MODELS_MODEL_QUALITY_FIRST', 'AGENTFARM_GITHUB_MODELS_MODEL_QUALITY_FIRST'),
            speed_first:
                readEnv(env, 'AF_GITHUB_MODELS_MODEL_SPEED_FIRST', 'AGENTFARM_GITHUB_MODELS_MODEL_SPEED_FIRST'),
            cost_balanced:
                readEnv(env, 'AF_GITHUB_MODELS_MODEL_COST_BALANCED', 'AGENTFARM_GITHUB_MODELS_MODEL_COST_BALANCED'),
            custom:
                readEnv(env, 'AF_GITHUB_MODELS_MODEL_CUSTOM', 'AGENTFARM_GITHUB_MODELS_MODEL_CUSTOM'),
        };

        return createGitHubModelsResolver({
            apiKey: githubApiKey,
            baseUrl: githubBaseUrl,
            model: githubModel,
            modelProfiles: githubModelProfiles,
            timeoutMs,
        });
    }

    if (provider === 'anthropic') {
        const anthropicApiKey = readEnv(env, 'AF_ANTHROPIC_API_KEY', 'AGENTFARM_ANTHROPIC_API_KEY');
        if (!anthropicApiKey || !anthropicApiKey.trim()) {
            return undefined;
        }

        return createAnthropicResolver({
            apiKey: anthropicApiKey,
            baseUrl: readEnv(env, 'AF_ANTHROPIC_BASE_URL', 'AGENTFARM_ANTHROPIC_BASE_URL') ?? DEFAULT_ANTHROPIC_BASE_URL,
            model: readEnv(env, 'AF_ANTHROPIC_MODEL', 'AGENTFARM_ANTHROPIC_MODEL') ?? DEFAULT_ANTHROPIC_MODEL,
            modelProfiles: {
                quality_first: readEnv(env, 'AF_ANTHROPIC_MODEL_QUALITY_FIRST', 'AGENTFARM_ANTHROPIC_MODEL_QUALITY_FIRST'),
                speed_first: readEnv(env, 'AF_ANTHROPIC_MODEL_SPEED_FIRST', 'AGENTFARM_ANTHROPIC_MODEL_SPEED_FIRST'),
                cost_balanced: readEnv(env, 'AF_ANTHROPIC_MODEL_COST_BALANCED', 'AGENTFARM_ANTHROPIC_MODEL_COST_BALANCED'),
                custom: readEnv(env, 'AF_ANTHROPIC_MODEL_CUSTOM', 'AGENTFARM_ANTHROPIC_MODEL_CUSTOM'),
            },
            timeoutMs,
            apiVersion: readEnv(env, 'AF_ANTHROPIC_API_VERSION', 'AGENTFARM_ANTHROPIC_API_VERSION') ?? DEFAULT_ANTHROPIC_API_VERSION,
        });
    }

    if (provider === 'google') {
        const googleApiKey = readEnv(env, 'AF_GOOGLE_API_KEY', 'AGENTFARM_GOOGLE_API_KEY');
        if (!googleApiKey || !googleApiKey.trim()) {
            return undefined;
        }

        return createGoogleResolver({
            apiKey: googleApiKey,
            baseUrl: readEnv(env, 'AF_GOOGLE_BASE_URL', 'AGENTFARM_GOOGLE_BASE_URL') ?? DEFAULT_GOOGLE_BASE_URL,
            model: readEnv(env, 'AF_GOOGLE_MODEL', 'AGENTFARM_GOOGLE_MODEL') ?? DEFAULT_GOOGLE_MODEL,
            modelProfiles: {
                quality_first: readEnv(env, 'AF_GOOGLE_MODEL_QUALITY_FIRST', 'AGENTFARM_GOOGLE_MODEL_QUALITY_FIRST'),
                speed_first: readEnv(env, 'AF_GOOGLE_MODEL_SPEED_FIRST', 'AGENTFARM_GOOGLE_MODEL_SPEED_FIRST'),
                cost_balanced: readEnv(env, 'AF_GOOGLE_MODEL_COST_BALANCED', 'AGENTFARM_GOOGLE_MODEL_COST_BALANCED'),
                custom: readEnv(env, 'AF_GOOGLE_MODEL_CUSTOM', 'AGENTFARM_GOOGLE_MODEL_CUSTOM'),
            },
            timeoutMs,
        });
    }

    if (provider === 'xai') {
        const xaiApiKey = readEnv(env, 'AF_XAI_API_KEY', 'AGENTFARM_XAI_API_KEY');
        if (!xaiApiKey || !xaiApiKey.trim()) {
            return undefined;
        }

        return createXaiResolver({
            apiKey: xaiApiKey,
            baseUrl: readEnv(env, 'AF_XAI_BASE_URL', 'AGENTFARM_XAI_BASE_URL') ?? DEFAULT_XAI_BASE_URL,
            model: readEnv(env, 'AF_XAI_MODEL', 'AGENTFARM_XAI_MODEL') ?? DEFAULT_XAI_MODEL,
            modelProfiles: {
                quality_first: readEnv(env, 'AF_XAI_MODEL_QUALITY_FIRST', 'AGENTFARM_XAI_MODEL_QUALITY_FIRST'),
                speed_first: readEnv(env, 'AF_XAI_MODEL_SPEED_FIRST', 'AGENTFARM_XAI_MODEL_SPEED_FIRST'),
                cost_balanced: readEnv(env, 'AF_XAI_MODEL_COST_BALANCED', 'AGENTFARM_XAI_MODEL_COST_BALANCED'),
                custom: readEnv(env, 'AF_XAI_MODEL_CUSTOM', 'AGENTFARM_XAI_MODEL_CUSTOM'),
            },
            timeoutMs,
        });
    }

    if (provider === 'mistral') {
        const mistralApiKey = readEnv(env, 'AF_MISTRAL_API_KEY', 'AGENTFARM_MISTRAL_API_KEY');
        if (!mistralApiKey || !mistralApiKey.trim()) {
            return undefined;
        }

        return createMistralResolver({
            apiKey: mistralApiKey,
            baseUrl: readEnv(env, 'AF_MISTRAL_BASE_URL', 'AGENTFARM_MISTRAL_BASE_URL') ?? DEFAULT_MISTRAL_BASE_URL,
            model: readEnv(env, 'AF_MISTRAL_MODEL', 'AGENTFARM_MISTRAL_MODEL') ?? DEFAULT_MISTRAL_MODEL,
            modelProfiles: {
                quality_first: readEnv(env, 'AF_MISTRAL_MODEL_QUALITY_FIRST', 'AGENTFARM_MISTRAL_MODEL_QUALITY_FIRST'),
                speed_first: readEnv(env, 'AF_MISTRAL_MODEL_SPEED_FIRST', 'AGENTFARM_MISTRAL_MODEL_SPEED_FIRST'),
                cost_balanced: readEnv(env, 'AF_MISTRAL_MODEL_COST_BALANCED', 'AGENTFARM_MISTRAL_MODEL_COST_BALANCED'),
                custom: readEnv(env, 'AF_MISTRAL_MODEL_CUSTOM', 'AGENTFARM_MISTRAL_MODEL_CUSTOM'),
            },
            timeoutMs,
        });
    }

    if (provider === 'together') {
        const togetherApiKey = readEnv(env, 'AF_TOGETHER_API_KEY', 'AGENTFARM_TOGETHER_API_KEY');
        if (!togetherApiKey || !togetherApiKey.trim()) {
            return undefined;
        }

        return createTogetherResolver({
            apiKey: togetherApiKey,
            baseUrl: readEnv(env, 'AF_TOGETHER_BASE_URL', 'AGENTFARM_TOGETHER_BASE_URL') ?? DEFAULT_TOGETHER_BASE_URL,
            model: readEnv(env, 'AF_TOGETHER_MODEL', 'AGENTFARM_TOGETHER_MODEL') ?? DEFAULT_TOGETHER_MODEL,
            modelProfiles: {
                quality_first: readEnv(env, 'AF_TOGETHER_MODEL_QUALITY_FIRST', 'AGENTFARM_TOGETHER_MODEL_QUALITY_FIRST'),
                speed_first: readEnv(env, 'AF_TOGETHER_MODEL_SPEED_FIRST', 'AGENTFARM_TOGETHER_MODEL_SPEED_FIRST'),
                cost_balanced: readEnv(env, 'AF_TOGETHER_MODEL_COST_BALANCED', 'AGENTFARM_TOGETHER_MODEL_COST_BALANCED'),
                custom: readEnv(env, 'AF_TOGETHER_MODEL_CUSTOM', 'AGENTFARM_TOGETHER_MODEL_CUSTOM'),
            },
            timeoutMs,
        });
    }

    const azureEndpoint = readEnv(env, 'AF_AZURE_OPENAI_ENDPOINT', 'AGENTFARM_AZURE_OPENAI_ENDPOINT');
    const azureKey = readEnv(env, 'AF_AZURE_OPENAI_API_KEY', 'AGENTFARM_AZURE_OPENAI_API_KEY');
    const azureDeployment = readEnv(env, 'AF_AZURE_OPENAI_DEPLOYMENT', 'AGENTFARM_AZURE_OPENAI_DEPLOYMENT');
    const azureApiVersion =
        readEnv(env, 'AF_AZURE_OPENAI_API_VERSION', 'AGENTFARM_AZURE_OPENAI_API_VERSION')
        ?? DEFAULT_AZURE_OPENAI_API_VERSION;
    const deploymentProfiles: ModelProfileMap = {
        quality_first:
            readEnv(env, 'AF_AZURE_OPENAI_DEPLOYMENT_QUALITY_FIRST', 'AGENTFARM_AZURE_OPENAI_DEPLOYMENT_QUALITY_FIRST'),
        speed_first:
            readEnv(env, 'AF_AZURE_OPENAI_DEPLOYMENT_SPEED_FIRST', 'AGENTFARM_AZURE_OPENAI_DEPLOYMENT_SPEED_FIRST'),
        cost_balanced:
            readEnv(env, 'AF_AZURE_OPENAI_DEPLOYMENT_COST_BALANCED', 'AGENTFARM_AZURE_OPENAI_DEPLOYMENT_COST_BALANCED'),
        custom:
            readEnv(env, 'AF_AZURE_OPENAI_DEPLOYMENT_CUSTOM', 'AGENTFARM_AZURE_OPENAI_DEPLOYMENT_CUSTOM'),
    };

    const azureProfileOverride = parseModelProfile(
        readEnv(env, 'AF_DEFAULT_MODEL_PROFILE', 'AGENTFARM_DEFAULT_MODEL_PROFILE'),
    );
    if (azureProfileOverride && azureDeployment) {
        deploymentProfiles[azureProfileOverride] = azureDeployment;
    }

    if (!azureEndpoint || !azureKey || !azureDeployment) {
        if (provider !== 'auto') {
            return undefined;
        }
    }

    if (provider === 'auto') {
        const autoProfiles: AutoProfileProviderMap = {
            quality_first: normalizeAutoProviders((readEnv(env, 'AF_AUTO_PROVIDERS_QUALITY_FIRST', 'AGENTFARM_AUTO_PROVIDERS_QUALITY_FIRST') ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)),
            speed_first: normalizeAutoProviders((readEnv(env, 'AF_AUTO_PROVIDERS_SPEED_FIRST', 'AGENTFARM_AUTO_PROVIDERS_SPEED_FIRST') ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)),
            cost_balanced: normalizeAutoProviders((readEnv(env, 'AF_AUTO_PROVIDERS_COST_BALANCED', 'AGENTFARM_AUTO_PROVIDERS_COST_BALANCED') ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)),
            custom: normalizeAutoProviders((readEnv(env, 'AF_AUTO_PROVIDERS_CUSTOM', 'AGENTFARM_AUTO_PROVIDERS_CUSTOM') ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)),
        };

        return createAutoResolver({
            timeoutMs,
            openai: {
                api_key: readEnv(env, 'AF_OPENAI_API_KEY', 'AGENTFARM_OPENAI_API_KEY'),
                base_url: readEnv(env, 'AF_OPENAI_BASE_URL', 'AGENTFARM_OPENAI_BASE_URL') ?? DEFAULT_OPENAI_BASE_URL,
                model: readEnv(env, 'AF_OPENAI_MODEL', 'AGENTFARM_OPENAI_MODEL') ?? DEFAULT_OPENAI_MODEL,
                model_profiles: {
                    quality_first: readEnv(env, 'AF_OPENAI_MODEL_QUALITY_FIRST', 'AGENTFARM_OPENAI_MODEL_QUALITY_FIRST'),
                    speed_first: readEnv(env, 'AF_OPENAI_MODEL_SPEED_FIRST', 'AGENTFARM_OPENAI_MODEL_SPEED_FIRST'),
                    cost_balanced: readEnv(env, 'AF_OPENAI_MODEL_COST_BALANCED', 'AGENTFARM_OPENAI_MODEL_COST_BALANCED'),
                    custom: readEnv(env, 'AF_OPENAI_MODEL_CUSTOM', 'AGENTFARM_OPENAI_MODEL_CUSTOM'),
                },
            },
            azureOpenai: {
                endpoint: azureEndpoint,
                api_key: azureKey,
                deployment: azureDeployment,
                api_version: azureApiVersion,
                deployment_profiles: deploymentProfiles,
            },
            githubModels: {
                api_key: githubApiKey,
                base_url: githubBaseUrl,
                model: githubModel,
                model_profiles: {
                    quality_first: readEnv(env, 'AF_GITHUB_MODELS_MODEL_QUALITY_FIRST', 'AGENTFARM_GITHUB_MODELS_MODEL_QUALITY_FIRST'),
                    speed_first: readEnv(env, 'AF_GITHUB_MODELS_MODEL_SPEED_FIRST', 'AGENTFARM_GITHUB_MODELS_MODEL_SPEED_FIRST'),
                    cost_balanced: readEnv(env, 'AF_GITHUB_MODELS_MODEL_COST_BALANCED', 'AGENTFARM_GITHUB_MODELS_MODEL_COST_BALANCED'),
                    custom: readEnv(env, 'AF_GITHUB_MODELS_MODEL_CUSTOM', 'AGENTFARM_GITHUB_MODELS_MODEL_CUSTOM'),
                },
            },
            anthropic: {
                api_key: readEnv(env, 'AF_ANTHROPIC_API_KEY', 'AGENTFARM_ANTHROPIC_API_KEY'),
                base_url: readEnv(env, 'AF_ANTHROPIC_BASE_URL', 'AGENTFARM_ANTHROPIC_BASE_URL') ?? DEFAULT_ANTHROPIC_BASE_URL,
                model: readEnv(env, 'AF_ANTHROPIC_MODEL', 'AGENTFARM_ANTHROPIC_MODEL') ?? DEFAULT_ANTHROPIC_MODEL,
                model_profiles: {
                    quality_first: readEnv(env, 'AF_ANTHROPIC_MODEL_QUALITY_FIRST', 'AGENTFARM_ANTHROPIC_MODEL_QUALITY_FIRST'),
                    speed_first: readEnv(env, 'AF_ANTHROPIC_MODEL_SPEED_FIRST', 'AGENTFARM_ANTHROPIC_MODEL_SPEED_FIRST'),
                    cost_balanced: readEnv(env, 'AF_ANTHROPIC_MODEL_COST_BALANCED', 'AGENTFARM_ANTHROPIC_MODEL_COST_BALANCED'),
                    custom: readEnv(env, 'AF_ANTHROPIC_MODEL_CUSTOM', 'AGENTFARM_ANTHROPIC_MODEL_CUSTOM'),
                },
                api_version: readEnv(env, 'AF_ANTHROPIC_API_VERSION', 'AGENTFARM_ANTHROPIC_API_VERSION') ?? DEFAULT_ANTHROPIC_API_VERSION,
            },
            google: {
                api_key: readEnv(env, 'AF_GOOGLE_API_KEY', 'AGENTFARM_GOOGLE_API_KEY'),
                base_url: readEnv(env, 'AF_GOOGLE_BASE_URL', 'AGENTFARM_GOOGLE_BASE_URL') ?? DEFAULT_GOOGLE_BASE_URL,
                model: readEnv(env, 'AF_GOOGLE_MODEL', 'AGENTFARM_GOOGLE_MODEL') ?? DEFAULT_GOOGLE_MODEL,
                model_profiles: {
                    quality_first: readEnv(env, 'AF_GOOGLE_MODEL_QUALITY_FIRST', 'AGENTFARM_GOOGLE_MODEL_QUALITY_FIRST'),
                    speed_first: readEnv(env, 'AF_GOOGLE_MODEL_SPEED_FIRST', 'AGENTFARM_GOOGLE_MODEL_SPEED_FIRST'),
                    cost_balanced: readEnv(env, 'AF_GOOGLE_MODEL_COST_BALANCED', 'AGENTFARM_GOOGLE_MODEL_COST_BALANCED'),
                    custom: readEnv(env, 'AF_GOOGLE_MODEL_CUSTOM', 'AGENTFARM_GOOGLE_MODEL_CUSTOM'),
                },
            },
            xai: {
                api_key: readEnv(env, 'AF_XAI_API_KEY', 'AGENTFARM_XAI_API_KEY'),
                base_url: readEnv(env, 'AF_XAI_BASE_URL', 'AGENTFARM_XAI_BASE_URL') ?? DEFAULT_XAI_BASE_URL,
                model: readEnv(env, 'AF_XAI_MODEL', 'AGENTFARM_XAI_MODEL') ?? DEFAULT_XAI_MODEL,
                model_profiles: {
                    quality_first: readEnv(env, 'AF_XAI_MODEL_QUALITY_FIRST', 'AGENTFARM_XAI_MODEL_QUALITY_FIRST'),
                    speed_first: readEnv(env, 'AF_XAI_MODEL_SPEED_FIRST', 'AGENTFARM_XAI_MODEL_SPEED_FIRST'),
                    cost_balanced: readEnv(env, 'AF_XAI_MODEL_COST_BALANCED', 'AGENTFARM_XAI_MODEL_COST_BALANCED'),
                    custom: readEnv(env, 'AF_XAI_MODEL_CUSTOM', 'AGENTFARM_XAI_MODEL_CUSTOM'),
                },
            },
            mistral: {
                api_key: readEnv(env, 'AF_MISTRAL_API_KEY', 'AGENTFARM_MISTRAL_API_KEY'),
                base_url: readEnv(env, 'AF_MISTRAL_BASE_URL', 'AGENTFARM_MISTRAL_BASE_URL') ?? DEFAULT_MISTRAL_BASE_URL,
                model: readEnv(env, 'AF_MISTRAL_MODEL', 'AGENTFARM_MISTRAL_MODEL') ?? DEFAULT_MISTRAL_MODEL,
                model_profiles: {
                    quality_first: readEnv(env, 'AF_MISTRAL_MODEL_QUALITY_FIRST', 'AGENTFARM_MISTRAL_MODEL_QUALITY_FIRST'),
                    speed_first: readEnv(env, 'AF_MISTRAL_MODEL_SPEED_FIRST', 'AGENTFARM_MISTRAL_MODEL_SPEED_FIRST'),
                    cost_balanced: readEnv(env, 'AF_MISTRAL_MODEL_COST_BALANCED', 'AGENTFARM_MISTRAL_MODEL_COST_BALANCED'),
                    custom: readEnv(env, 'AF_MISTRAL_MODEL_CUSTOM', 'AGENTFARM_MISTRAL_MODEL_CUSTOM'),
                },
            },
            together: {
                api_key: readEnv(env, 'AF_TOGETHER_API_KEY', 'AGENTFARM_TOGETHER_API_KEY'),
                base_url: readEnv(env, 'AF_TOGETHER_BASE_URL', 'AGENTFARM_TOGETHER_BASE_URL') ?? DEFAULT_TOGETHER_BASE_URL,
                model: readEnv(env, 'AF_TOGETHER_MODEL', 'AGENTFARM_TOGETHER_MODEL') ?? DEFAULT_TOGETHER_MODEL,
                model_profiles: {
                    quality_first: readEnv(env, 'AF_TOGETHER_MODEL_QUALITY_FIRST', 'AGENTFARM_TOGETHER_MODEL_QUALITY_FIRST'),
                    speed_first: readEnv(env, 'AF_TOGETHER_MODEL_SPEED_FIRST', 'AGENTFARM_TOGETHER_MODEL_SPEED_FIRST'),
                    cost_balanced: readEnv(env, 'AF_TOGETHER_MODEL_COST_BALANCED', 'AGENTFARM_TOGETHER_MODEL_COST_BALANCED'),
                    custom: readEnv(env, 'AF_TOGETHER_MODEL_CUSTOM', 'AGENTFARM_TOGETHER_MODEL_CUSTOM'),
                },
            },
            profileProviders: autoProfiles,
        });
    }

    if (!azureEndpoint || !azureKey || !azureDeployment) {
        return undefined;
    }

    return createAzureOpenAiResolver({
        endpoint: azureEndpoint,
        apiKey: azureKey,
        deployment: azureDeployment,
        deploymentProfiles,
        apiVersion: azureApiVersion,
        timeoutMs,
    });
};
