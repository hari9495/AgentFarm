import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { SecretStore } from '../lib/secret-store.js';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope: 'customer' | 'internal';
    expiresAt: number;
};

type ModelProvider = 'agentfarm' | 'openai' | 'azure_openai' | 'github_models' | 'anthropic' | 'google' | 'xai' | 'mistral' | 'together' | 'auto';
type ModelProfileKey = 'quality_first' | 'speed_first' | 'cost_balanced' | 'custom';
type ModelProfileMap = Partial<Record<ModelProfileKey, string>>;
type AutoProvider = 'openai' | 'azure_openai' | 'github_models' | 'anthropic' | 'google' | 'xai' | 'mistral' | 'together';
type AutoProfileProviderMap = Partial<Record<ModelProfileKey, AutoProvider[]>>;

type LlmWorkspaceConfig = {
    provider: ModelProvider;
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
        api_version?: string;
        model_profiles?: ModelProfileMap;
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
    updated_at?: string;
};

type RedactedLlmWorkspaceConfig = {
    provider: ModelProvider;
    timeout_ms?: number;
    openai?: {
        model?: string;
        base_url?: string;
        has_api_key: boolean;
        model_profiles?: ModelProfileMap;
    };
    azure_openai?: {
        endpoint?: string;
        deployment?: string;
        api_version?: string;
        has_api_key: boolean;
        deployment_profiles?: ModelProfileMap;
    };
    github_models?: {
        model?: string;
        base_url?: string;
        has_api_key: boolean;
        model_profiles?: ModelProfileMap;
    };
    anthropic?: {
        model?: string;
        base_url?: string;
        api_version?: string;
        has_api_key: boolean;
        model_profiles?: ModelProfileMap;
    };
    google?: {
        model?: string;
        base_url?: string;
        has_api_key: boolean;
        model_profiles?: ModelProfileMap;
    };
    xai?: {
        model?: string;
        base_url?: string;
        has_api_key: boolean;
        model_profiles?: ModelProfileMap;
    };
    mistral?: {
        model?: string;
        base_url?: string;
        has_api_key: boolean;
        model_profiles?: ModelProfileMap;
    };
    together?: {
        model?: string;
        base_url?: string;
        has_api_key: boolean;
        model_profiles?: ModelProfileMap;
    };
    auto?: {
        profile_providers?: AutoProfileProviderMap;
    };
    updated_at?: string;
};

type RegisterRuntimeLlmConfigRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    secretStore: SecretStore;
    env?: NodeJS.ProcessEnv;
};

type RuntimeConfigParams = {
    workspaceId: string;
};

type RuntimeConfigQuery = {
    tenant_id?: string;
};

type RuntimeConfigBody = {
    provider?: unknown;
    timeout_ms?: unknown;
    openai?: {
        model?: unknown;
        base_url?: unknown;
        api_key?: unknown;
        model_profiles?: unknown;
    };
    azure_openai?: {
        endpoint?: unknown;
        deployment?: unknown;
        api_version?: unknown;
        api_key?: unknown;
        deployment_profiles?: unknown;
    };
    github_models?: {
        model?: unknown;
        base_url?: unknown;
        api_key?: unknown;
        model_profiles?: unknown;
    };
    anthropic?: {
        model?: unknown;
        base_url?: unknown;
        api_key?: unknown;
        api_version?: unknown;
        model_profiles?: unknown;
    };
    google?: {
        model?: unknown;
        base_url?: unknown;
        api_key?: unknown;
        model_profiles?: unknown;
    };
    xai?: {
        model?: unknown;
        base_url?: unknown;
        api_key?: unknown;
        model_profiles?: unknown;
    };
    mistral?: {
        model?: unknown;
        base_url?: unknown;
        api_key?: unknown;
        model_profiles?: unknown;
    };
    together?: {
        model?: unknown;
        base_url?: unknown;
        api_key?: unknown;
        model_profiles?: unknown;
    };
    auto?: {
        profile_providers?: unknown;
    };
};

const MODEL_PROFILE_KEYS: ModelProfileKey[] = ['quality_first', 'speed_first', 'cost_balanced', 'custom'];
const AUTO_PROVIDER_KEYS: AutoProvider[] = ['openai', 'azure_openai', 'github_models', 'anthropic', 'google', 'xai', 'mistral', 'together'];

const toProvider = (value: unknown): ModelProvider | null => {
    if (value === 'agentfarm' || value === 'openai' || value === 'azure_openai' || value === 'github_models' || value === 'anthropic' || value === 'google' || value === 'xai' || value === 'mistral' || value === 'together' || value === 'auto') {
        return value;
    }
    return null;
};

const normalizeAutoProfileProviderMap = (value: unknown): AutoProfileProviderMap | undefined => {
    if (!value || typeof value !== 'object') {
        return undefined;
    }

    const record = value as Record<string, unknown>;
    const normalized: AutoProfileProviderMap = {};

    for (const profile of MODEL_PROFILE_KEYS) {
        const candidate = record[profile];
        if (!Array.isArray(candidate)) {
            continue;
        }

        const providers = candidate
            .filter((entry): entry is AutoProvider => typeof entry === 'string' && AUTO_PROVIDER_KEYS.includes(entry as AutoProvider));

        if (providers.length > 0) {
            normalized[profile] = Array.from(new Set(providers));
        }
    }

    return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const sanitizeKeyPart = (value: string): string => {
    return value.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toUpperCase();
};

const buildSecretRef = (tenantId: string, workspaceId: string, env: NodeJS.ProcessEnv): string => {
    const baseRef = env.LLM_CONFIG_SECRET_BASE_REF;
    if (baseRef && baseRef.startsWith('env://')) {
        const baseName = baseRef.slice('env://'.length).trim();
        return `env://${baseName}_${sanitizeKeyPart(tenantId)}_${sanitizeKeyPart(workspaceId)}`;
    }

    if (baseRef && baseRef.includes('/secrets/')) {
        return `${baseRef.replace(/\/$/, '')}/llm-config-${encodeURIComponent(tenantId)}-${encodeURIComponent(workspaceId)}`;
    }

    return `env://AF_LLM_CONFIG_${sanitizeKeyPart(tenantId)}_${sanitizeKeyPart(workspaceId)}`;
};

const parseStoredConfig = (raw: string | null): LlmWorkspaceConfig | null => {
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw) as LlmWorkspaceConfig;
        const provider = toProvider(parsed.provider);
        if (!provider) {
            return null;
        }

        const openaiProfiles =
            parsed.openai && parsed.openai.model_profiles
                ? normalizeModelProfileMap(parsed.openai.model_profiles)
                : undefined;
        const azureProfiles =
            parsed.azure_openai && parsed.azure_openai.deployment_profiles
                ? normalizeModelProfileMap(parsed.azure_openai.deployment_profiles)
                : undefined;
        const githubProfiles =
            parsed.github_models && parsed.github_models.model_profiles
                ? normalizeModelProfileMap(parsed.github_models.model_profiles)
                : undefined;
        const anthropicProfiles =
            parsed.anthropic && parsed.anthropic.model_profiles
                ? normalizeModelProfileMap(parsed.anthropic.model_profiles)
                : undefined;
        const googleProfiles =
            parsed.google && parsed.google.model_profiles
                ? normalizeModelProfileMap(parsed.google.model_profiles)
                : undefined;
        const xaiProfiles =
            parsed.xai && parsed.xai.model_profiles
                ? normalizeModelProfileMap(parsed.xai.model_profiles)
                : undefined;
        const mistralProfiles =
            parsed.mistral && parsed.mistral.model_profiles
                ? normalizeModelProfileMap(parsed.mistral.model_profiles)
                : undefined;
        const togetherProfiles =
            parsed.together && parsed.together.model_profiles
                ? normalizeModelProfileMap(parsed.together.model_profiles)
                : undefined;
        const autoProviders =
            parsed.auto && parsed.auto.profile_providers
                ? normalizeAutoProfileProviderMap(parsed.auto.profile_providers)
                : undefined;

        return {
            provider,
            timeout_ms: typeof parsed.timeout_ms === 'number' ? parsed.timeout_ms : undefined,
            openai: parsed.openai
                ? {
                    model: parsed.openai.model,
                    base_url: parsed.openai.base_url,
                    api_key: parsed.openai.api_key,
                    model_profiles: openaiProfiles,
                }
                : undefined,
            azure_openai: parsed.azure_openai
                ? {
                    endpoint: parsed.azure_openai.endpoint,
                    deployment: parsed.azure_openai.deployment,
                    api_version: parsed.azure_openai.api_version,
                    api_key: parsed.azure_openai.api_key,
                    deployment_profiles: azureProfiles,
                }
                : undefined,
            github_models: parsed.github_models
                ? {
                    model: parsed.github_models.model,
                    base_url: parsed.github_models.base_url,
                    api_key: parsed.github_models.api_key,
                    model_profiles: githubProfiles,
                }
                : undefined,
            anthropic: parsed.anthropic
                ? {
                    model: parsed.anthropic.model,
                    base_url: parsed.anthropic.base_url,
                    api_key: parsed.anthropic.api_key,
                    api_version: parsed.anthropic.api_version,
                    model_profiles: anthropicProfiles,
                }
                : undefined,
            google: parsed.google
                ? {
                    model: parsed.google.model,
                    base_url: parsed.google.base_url,
                    api_key: parsed.google.api_key,
                    model_profiles: googleProfiles,
                }
                : undefined,
            xai: parsed.xai
                ? {
                    model: parsed.xai.model,
                    base_url: parsed.xai.base_url,
                    api_key: parsed.xai.api_key,
                    model_profiles: xaiProfiles,
                }
                : undefined,
            mistral: parsed.mistral
                ? {
                    model: parsed.mistral.model,
                    base_url: parsed.mistral.base_url,
                    api_key: parsed.mistral.api_key,
                    model_profiles: mistralProfiles,
                }
                : undefined,
            together: parsed.together
                ? {
                    model: parsed.together.model,
                    base_url: parsed.together.base_url,
                    api_key: parsed.together.api_key,
                    model_profiles: togetherProfiles,
                }
                : undefined,
            auto: parsed.auto
                ? {
                    profile_providers: autoProviders,
                }
                : undefined,
            updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : undefined,
        };
    } catch {
        return null;
    }
};

const toRedacted = (config: LlmWorkspaceConfig): RedactedLlmWorkspaceConfig => ({
    provider: config.provider,
    timeout_ms: config.timeout_ms,
    updated_at: config.updated_at,
    openai: config.openai
        ? {
            model: config.openai.model,
            base_url: config.openai.base_url,
            has_api_key: Boolean(config.openai.api_key),
            model_profiles: config.openai.model_profiles,
        }
        : undefined,
    azure_openai: config.azure_openai
        ? {
            endpoint: config.azure_openai.endpoint,
            deployment: config.azure_openai.deployment,
            api_version: config.azure_openai.api_version,
            has_api_key: Boolean(config.azure_openai.api_key),
            deployment_profiles: config.azure_openai.deployment_profiles,
        }
        : undefined,
    github_models: config.github_models
        ? {
            model: config.github_models.model,
            base_url: config.github_models.base_url,
            has_api_key: Boolean(config.github_models.api_key),
            model_profiles: config.github_models.model_profiles,
        }
        : undefined,
    anthropic: config.anthropic
        ? {
            model: config.anthropic.model,
            base_url: config.anthropic.base_url,
            api_version: config.anthropic.api_version,
            has_api_key: Boolean(config.anthropic.api_key),
            model_profiles: config.anthropic.model_profiles,
        }
        : undefined,
    google: config.google
        ? {
            model: config.google.model,
            base_url: config.google.base_url,
            has_api_key: Boolean(config.google.api_key),
            model_profiles: config.google.model_profiles,
        }
        : undefined,
    xai: config.xai
        ? {
            model: config.xai.model,
            base_url: config.xai.base_url,
            has_api_key: Boolean(config.xai.api_key),
            model_profiles: config.xai.model_profiles,
        }
        : undefined,
    mistral: config.mistral
        ? {
            model: config.mistral.model,
            base_url: config.mistral.base_url,
            has_api_key: Boolean(config.mistral.api_key),
            model_profiles: config.mistral.model_profiles,
        }
        : undefined,
    together: config.together
        ? {
            model: config.together.model,
            base_url: config.together.base_url,
            has_api_key: Boolean(config.together.api_key),
            model_profiles: config.together.model_profiles,
        }
        : undefined,
    auto: config.auto
        ? {
            profile_providers: config.auto.profile_providers,
        }
        : undefined,
});

const normalizeModelProfileMap = (value: unknown): ModelProfileMap | undefined => {
    if (!value || typeof value !== 'object') {
        return undefined;
    }

    const record = value as Record<string, unknown>;
    const normalized: ModelProfileMap = {};

    for (const key of MODEL_PROFILE_KEYS) {
        const candidate = record[key];
        if (typeof candidate === 'string' && candidate.trim()) {
            normalized[key] = candidate.trim();
        }
    }

    return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const isAuthorizedRuntimeRequest = (request: FastifyRequest, env: NodeJS.ProcessEnv): boolean => {
    const header = request.headers['x-runtime-config-token'];
    if (typeof header !== 'string' || !header.trim()) {
        return false;
    }

    const expected =
        env.RUNTIME_CONFIG_SHARED_TOKEN
        ?? env.AF_APPROVAL_INTAKE_SHARED_TOKEN
        ?? env.AGENTFARM_APPROVAL_INTAKE_SHARED_TOKEN
        ?? null;

    if (!expected) {
        return false;
    }

    return header.trim() === expected;
};

const normalizeBody = (
    body: RuntimeConfigBody,
    existing: LlmWorkspaceConfig,
): { valid: boolean; config?: LlmWorkspaceConfig; message?: string } => {
    const provider = toProvider(body.provider);
    if (!provider) {
        return { valid: false, message: 'provider must be one of agentfarm, openai, azure_openai.' };
    }

    let timeoutMs = existing.timeout_ms;
    if (body.timeout_ms !== undefined) {
        if (typeof body.timeout_ms !== 'number' || !Number.isFinite(body.timeout_ms) || body.timeout_ms <= 0) {
            return { valid: false, message: 'timeout_ms must be a positive number when provided.' };
        }
        timeoutMs = Math.min(Math.floor(body.timeout_ms), 20_000);
    }

    const openai = {
        model: existing.openai?.model,
        base_url: existing.openai?.base_url,
        api_key: existing.openai?.api_key,
        model_profiles: existing.openai?.model_profiles,
    };
    const azureOpenai = {
        endpoint: existing.azure_openai?.endpoint,
        deployment: existing.azure_openai?.deployment,
        api_version: existing.azure_openai?.api_version,
        api_key: existing.azure_openai?.api_key,
        deployment_profiles: existing.azure_openai?.deployment_profiles,
    };
    const githubModels = {
        model: existing.github_models?.model,
        base_url: existing.github_models?.base_url,
        api_key: existing.github_models?.api_key,
        model_profiles: existing.github_models?.model_profiles,
    };
    const anthropic = {
        model: existing.anthropic?.model,
        base_url: existing.anthropic?.base_url,
        api_key: existing.anthropic?.api_key,
        api_version: existing.anthropic?.api_version,
        model_profiles: existing.anthropic?.model_profiles,
    };
    const google = {
        model: existing.google?.model,
        base_url: existing.google?.base_url,
        api_key: existing.google?.api_key,
        model_profiles: existing.google?.model_profiles,
    };
    const xai = {
        model: existing.xai?.model,
        base_url: existing.xai?.base_url,
        api_key: existing.xai?.api_key,
        model_profiles: existing.xai?.model_profiles,
    };
    const mistral = {
        model: existing.mistral?.model,
        base_url: existing.mistral?.base_url,
        api_key: existing.mistral?.api_key,
        model_profiles: existing.mistral?.model_profiles,
    };
    const together = {
        model: existing.together?.model,
        base_url: existing.together?.base_url,
        api_key: existing.together?.api_key,
        model_profiles: existing.together?.model_profiles,
    };
    const auto = {
        profile_providers: existing.auto?.profile_providers,
    };

    if (body.openai) {
        if (body.openai.model !== undefined) {
            openai.model = typeof body.openai.model === 'string' ? body.openai.model.trim() || undefined : openai.model;
        }
        if (body.openai.base_url !== undefined) {
            openai.base_url = typeof body.openai.base_url === 'string' ? body.openai.base_url.trim() || undefined : openai.base_url;
        }
        if (body.openai.api_key !== undefined) {
            if (typeof body.openai.api_key !== 'string') {
                return { valid: false, message: 'openai.api_key must be a string when provided.' };
            }
            openai.api_key = body.openai.api_key.trim() || undefined;
        }
        if (body.openai.model_profiles !== undefined) {
            if (!body.openai.model_profiles || typeof body.openai.model_profiles !== 'object') {
                return { valid: false, message: 'openai.model_profiles must be an object when provided.' };
            }
            openai.model_profiles = normalizeModelProfileMap(body.openai.model_profiles);
        }
    }

    if (body.azure_openai) {
        if (body.azure_openai.endpoint !== undefined) {
            azureOpenai.endpoint = typeof body.azure_openai.endpoint === 'string' ? body.azure_openai.endpoint.trim() || undefined : azureOpenai.endpoint;
        }
        if (body.azure_openai.deployment !== undefined) {
            azureOpenai.deployment = typeof body.azure_openai.deployment === 'string' ? body.azure_openai.deployment.trim() || undefined : azureOpenai.deployment;
        }
        if (body.azure_openai.api_version !== undefined) {
            azureOpenai.api_version = typeof body.azure_openai.api_version === 'string' ? body.azure_openai.api_version.trim() || undefined : azureOpenai.api_version;
        }
        if (body.azure_openai.api_key !== undefined) {
            if (typeof body.azure_openai.api_key !== 'string') {
                return { valid: false, message: 'azure_openai.api_key must be a string when provided.' };
            }
            azureOpenai.api_key = body.azure_openai.api_key.trim() || undefined;
        }
        if (body.azure_openai.deployment_profiles !== undefined) {
            if (!body.azure_openai.deployment_profiles || typeof body.azure_openai.deployment_profiles !== 'object') {
                return { valid: false, message: 'azure_openai.deployment_profiles must be an object when provided.' };
            }
            azureOpenai.deployment_profiles = normalizeModelProfileMap(body.azure_openai.deployment_profiles);
        }
    }

    if (body.github_models) {
        if (body.github_models.model !== undefined) {
            githubModels.model = typeof body.github_models.model === 'string' ? body.github_models.model.trim() || undefined : githubModels.model;
        }
        if (body.github_models.base_url !== undefined) {
            githubModels.base_url = typeof body.github_models.base_url === 'string' ? body.github_models.base_url.trim() || undefined : githubModels.base_url;
        }
        if (body.github_models.api_key !== undefined) {
            if (typeof body.github_models.api_key !== 'string') {
                return { valid: false, message: 'github_models.api_key must be a string when provided.' };
            }
            githubModels.api_key = body.github_models.api_key.trim() || undefined;
        }
        if (body.github_models.model_profiles !== undefined) {
            if (!body.github_models.model_profiles || typeof body.github_models.model_profiles !== 'object') {
                return { valid: false, message: 'github_models.model_profiles must be an object when provided.' };
            }
            githubModels.model_profiles = normalizeModelProfileMap(body.github_models.model_profiles);
        }
    }

    if (body.anthropic) {
        if (body.anthropic.model !== undefined) {
            anthropic.model = typeof body.anthropic.model === 'string' ? body.anthropic.model.trim() || undefined : anthropic.model;
        }
        if (body.anthropic.base_url !== undefined) {
            anthropic.base_url = typeof body.anthropic.base_url === 'string' ? body.anthropic.base_url.trim() || undefined : anthropic.base_url;
        }
        if (body.anthropic.api_key !== undefined) {
            if (typeof body.anthropic.api_key !== 'string') {
                return { valid: false, message: 'anthropic.api_key must be a string when provided.' };
            }
            anthropic.api_key = body.anthropic.api_key.trim() || undefined;
        }
        if (body.anthropic.api_version !== undefined) {
            anthropic.api_version = typeof body.anthropic.api_version === 'string' ? body.anthropic.api_version.trim() || undefined : anthropic.api_version;
        }
        if (body.anthropic.model_profiles !== undefined) {
            if (!body.anthropic.model_profiles || typeof body.anthropic.model_profiles !== 'object') {
                return { valid: false, message: 'anthropic.model_profiles must be an object when provided.' };
            }
            anthropic.model_profiles = normalizeModelProfileMap(body.anthropic.model_profiles);
        }
    }

    if (body.google) {
        if (body.google.model !== undefined) {
            google.model = typeof body.google.model === 'string' ? body.google.model.trim() || undefined : google.model;
        }
        if (body.google.base_url !== undefined) {
            google.base_url = typeof body.google.base_url === 'string' ? body.google.base_url.trim() || undefined : google.base_url;
        }
        if (body.google.api_key !== undefined) {
            if (typeof body.google.api_key !== 'string') {
                return { valid: false, message: 'google.api_key must be a string when provided.' };
            }
            google.api_key = body.google.api_key.trim() || undefined;
        }
        if (body.google.model_profiles !== undefined) {
            if (!body.google.model_profiles || typeof body.google.model_profiles !== 'object') {
                return { valid: false, message: 'google.model_profiles must be an object when provided.' };
            }
            google.model_profiles = normalizeModelProfileMap(body.google.model_profiles);
        }
    }

    if (body.xai) {
        if (body.xai.model !== undefined) {
            xai.model = typeof body.xai.model === 'string' ? body.xai.model.trim() || undefined : xai.model;
        }
        if (body.xai.base_url !== undefined) {
            xai.base_url = typeof body.xai.base_url === 'string' ? body.xai.base_url.trim() || undefined : xai.base_url;
        }
        if (body.xai.api_key !== undefined) {
            if (typeof body.xai.api_key !== 'string') {
                return { valid: false, message: 'xai.api_key must be a string when provided.' };
            }
            xai.api_key = body.xai.api_key.trim() || undefined;
        }
        if (body.xai.model_profiles !== undefined) {
            if (!body.xai.model_profiles || typeof body.xai.model_profiles !== 'object') {
                return { valid: false, message: 'xai.model_profiles must be an object when provided.' };
            }
            xai.model_profiles = normalizeModelProfileMap(body.xai.model_profiles);
        }
    }

    if (body.mistral) {
        if (body.mistral.model !== undefined) {
            mistral.model = typeof body.mistral.model === 'string' ? body.mistral.model.trim() || undefined : mistral.model;
        }
        if (body.mistral.base_url !== undefined) {
            mistral.base_url = typeof body.mistral.base_url === 'string' ? body.mistral.base_url.trim() || undefined : mistral.base_url;
        }
        if (body.mistral.api_key !== undefined) {
            if (typeof body.mistral.api_key !== 'string') {
                return { valid: false, message: 'mistral.api_key must be a string when provided.' };
            }
            mistral.api_key = body.mistral.api_key.trim() || undefined;
        }
        if (body.mistral.model_profiles !== undefined) {
            if (!body.mistral.model_profiles || typeof body.mistral.model_profiles !== 'object') {
                return { valid: false, message: 'mistral.model_profiles must be an object when provided.' };
            }
            mistral.model_profiles = normalizeModelProfileMap(body.mistral.model_profiles);
        }
    }

    if (body.together) {
        if (body.together.model !== undefined) {
            together.model = typeof body.together.model === 'string' ? body.together.model.trim() || undefined : together.model;
        }
        if (body.together.base_url !== undefined) {
            together.base_url = typeof body.together.base_url === 'string' ? body.together.base_url.trim() || undefined : together.base_url;
        }
        if (body.together.api_key !== undefined) {
            if (typeof body.together.api_key !== 'string') {
                return { valid: false, message: 'together.api_key must be a string when provided.' };
            }
            together.api_key = body.together.api_key.trim() || undefined;
        }
        if (body.together.model_profiles !== undefined) {
            if (!body.together.model_profiles || typeof body.together.model_profiles !== 'object') {
                return { valid: false, message: 'together.model_profiles must be an object when provided.' };
            }
            together.model_profiles = normalizeModelProfileMap(body.together.model_profiles);
        }
    }

    if (body.auto) {
        if (body.auto.profile_providers !== undefined) {
            if (!body.auto.profile_providers || typeof body.auto.profile_providers !== 'object') {
                return { valid: false, message: 'auto.profile_providers must be an object when provided.' };
            }
            auto.profile_providers = normalizeAutoProfileProviderMap(body.auto.profile_providers);
        }
    }

    return {
        valid: true,
        config: {
            provider,
            timeout_ms: timeoutMs,
            openai:
                openai.model
                    || openai.base_url
                    || openai.api_key
                    || (openai.model_profiles && Object.keys(openai.model_profiles).length > 0)
                    ? openai
                    : undefined,
            azure_openai:
                azureOpenai.endpoint
                    || azureOpenai.deployment
                    || azureOpenai.api_version
                    || azureOpenai.api_key
                    || (azureOpenai.deployment_profiles && Object.keys(azureOpenai.deployment_profiles).length > 0)
                    ? azureOpenai
                    : undefined,
            github_models:
                githubModels.model
                    || githubModels.base_url
                    || githubModels.api_key
                    || (githubModels.model_profiles && Object.keys(githubModels.model_profiles).length > 0)
                    ? githubModels
                    : undefined,
            anthropic:
                anthropic.model
                    || anthropic.base_url
                    || anthropic.api_key
                    || anthropic.api_version
                    || (anthropic.model_profiles && Object.keys(anthropic.model_profiles).length > 0)
                    ? anthropic
                    : undefined,
            google:
                google.model
                    || google.base_url
                    || google.api_key
                    || (google.model_profiles && Object.keys(google.model_profiles).length > 0)
                    ? google
                    : undefined,
            xai:
                xai.model
                    || xai.base_url
                    || xai.api_key
                    || (xai.model_profiles && Object.keys(xai.model_profiles).length > 0)
                    ? xai
                    : undefined,
            mistral:
                mistral.model
                    || mistral.base_url
                    || mistral.api_key
                    || (mistral.model_profiles && Object.keys(mistral.model_profiles).length > 0)
                    ? mistral
                    : undefined,
            together:
                together.model
                    || together.base_url
                    || together.api_key
                    || (together.model_profiles && Object.keys(together.model_profiles).length > 0)
                    ? together
                    : undefined,
            auto:
                auto.profile_providers && Object.keys(auto.profile_providers).length > 0
                    ? auto
                    : undefined,
            updated_at: new Date().toISOString(),
        },
    };
};

export const registerRuntimeLlmConfigRoutes = async (
    app: FastifyInstance,
    options: RegisterRuntimeLlmConfigRoutesOptions,
): Promise<void> => {
    const env = options.env ?? process.env;

    app.get<{ Params: RuntimeConfigParams; Querystring: RuntimeConfigQuery }>(
        '/v1/workspaces/:workspaceId/runtime/llm-config',
        async (request, reply) => {
            const runtimeAuthorized = isAuthorizedRuntimeRequest(request, env);
            const session = options.getSession(request);
            const workspaceId = request.params.workspaceId;
            const tenantFromQuery = request.query.tenant_id?.trim();

            if (!runtimeAuthorized) {
                if (!session || session.scope !== 'internal') {
                    return reply.code(403).send({
                        error: 'forbidden',
                        message: 'Internal session required for LLM config access.',
                    });
                }
                if (!session.workspaceIds.includes(workspaceId)) {
                    return reply.code(403).send({
                        error: 'forbidden',
                        message: 'Workspace is outside your session scope.',
                    });
                }
            }

            const tenantId = runtimeAuthorized
                ? tenantFromQuery
                : session?.tenantId;

            if (!tenantId) {
                return reply.code(400).send({
                    error: 'invalid_request',
                    message: 'tenant_id query parameter is required for runtime token access.',
                });
            }

            const secretRef = buildSecretRef(tenantId, workspaceId, env);
            const stored = parseStoredConfig(await options.secretStore.getSecret(secretRef));
            const config: LlmWorkspaceConfig = stored ?? { provider: 'agentfarm' };

            if (runtimeAuthorized) {
                return {
                    workspace_id: workspaceId,
                    tenant_id: tenantId,
                    config,
                    source: stored ? 'configured' : 'default',
                };
            }

            return {
                workspace_id: workspaceId,
                tenant_id: tenantId,
                config: toRedacted(config),
                source: stored ? 'configured' : 'default',
            };
        },
    );

    app.put<{ Params: RuntimeConfigParams; Body: RuntimeConfigBody }>(
        '/v1/workspaces/:workspaceId/runtime/llm-config',
        async (request, reply) => {
            const session = options.getSession(request);
            const workspaceId = request.params.workspaceId;

            if (!session || session.scope !== 'internal') {
                return reply.code(403).send({
                    error: 'forbidden',
                    message: 'Internal session required for LLM config update.',
                });
            }
            if (!session.workspaceIds.includes(workspaceId)) {
                return reply.code(403).send({
                    error: 'forbidden',
                    message: 'Workspace is outside your session scope.',
                });
            }

            const secretRef = buildSecretRef(session.tenantId, workspaceId, env);
            const current = parseStoredConfig(await options.secretStore.getSecret(secretRef)) ?? { provider: 'agentfarm' };
            const normalized = normalizeBody(request.body ?? {}, current);
            if (!normalized.valid || !normalized.config) {
                return reply.code(400).send({
                    error: 'invalid_request',
                    message: normalized.message ?? 'Invalid LLM config payload.',
                });
            }

            await options.secretStore.setSecret(secretRef, JSON.stringify(normalized.config));

            return {
                workspace_id: workspaceId,
                tenant_id: session.tenantId,
                config: toRedacted(normalized.config),
                source: 'configured',
            };
        },
    );
};

export type { RegisterRuntimeLlmConfigRoutesOptions, SessionContext, LlmWorkspaceConfig, RedactedLlmWorkspaceConfig };