'use client';

import { useEffect, useMemo, useState } from 'react';

type Provider = 'agentfarm' | 'openai' | 'azure_openai' | 'github_models' | 'anthropic' | 'google' | 'xai' | 'mistral' | 'together' | 'auto';
type ModelProfileKey = 'quality_first' | 'speed_first' | 'cost_balanced' | 'custom';
type ModelProfileMap = Partial<Record<ModelProfileKey, string>>;
type AutoProvider = 'openai' | 'azure_openai' | 'github_models' | 'anthropic' | 'google' | 'xai' | 'mistral' | 'together';
type AutoProfileProviderMap = Partial<Record<ModelProfileKey, AutoProvider[]>>;

type RedactedConfig = {
    provider: Provider;
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
};

type ResponseShape = {
    config?: RedactedConfig;
    source?: 'configured' | 'default';
    message?: string;
};

type Props = {
    workspaceId: string;
};

export function LlmConfigPanel({ workspaceId }: Props) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [source, setSource] = useState<'configured' | 'default'>('default');

    const [provider, setProvider] = useState<Provider>('agentfarm');
    const [timeoutMs, setTimeoutMs] = useState<string>('5000');

    const [openaiModel, setOpenaiModel] = useState('gpt-4o-mini');
    const [openaiBaseUrl, setOpenaiBaseUrl] = useState('');
    const [openaiApiKey, setOpenaiApiKey] = useState('');
    const [openaiHasKey, setOpenaiHasKey] = useState(false);
    const [openaiModelQualityFirst, setOpenaiModelQualityFirst] = useState('');
    const [openaiModelSpeedFirst, setOpenaiModelSpeedFirst] = useState('');
    const [openaiModelCostBalanced, setOpenaiModelCostBalanced] = useState('');
    const [openaiModelCustom, setOpenaiModelCustom] = useState('');

    const [azureEndpoint, setAzureEndpoint] = useState('');
    const [azureDeployment, setAzureDeployment] = useState('');
    const [azureApiVersion, setAzureApiVersion] = useState('2024-06-01');
    const [azureApiKey, setAzureApiKey] = useState('');
    const [azureHasKey, setAzureHasKey] = useState(false);
    const [azureDeploymentQualityFirst, setAzureDeploymentQualityFirst] = useState('');
    const [azureDeploymentSpeedFirst, setAzureDeploymentSpeedFirst] = useState('');
    const [azureDeploymentCostBalanced, setAzureDeploymentCostBalanced] = useState('');
    const [azureDeploymentCustom, setAzureDeploymentCustom] = useState('');

    const [githubModel, setGithubModel] = useState('openai/gpt-4.1-mini');
    const [githubBaseUrl, setGithubBaseUrl] = useState('https://models.inference.ai.azure.com');
    const [githubApiKey, setGithubApiKey] = useState('');
    const [githubHasKey, setGithubHasKey] = useState(false);
    const [githubModelQualityFirst, setGithubModelQualityFirst] = useState('');
    const [githubModelSpeedFirst, setGithubModelSpeedFirst] = useState('');
    const [githubModelCostBalanced, setGithubModelCostBalanced] = useState('');
    const [githubModelCustom, setGithubModelCustom] = useState('');

    const [anthropicModel, setAnthropicModel] = useState('claude-3-5-sonnet-latest');
    const [anthropicBaseUrl, setAnthropicBaseUrl] = useState('https://api.anthropic.com');
    const [anthropicApiVersion, setAnthropicApiVersion] = useState('2023-06-01');
    const [anthropicApiKey, setAnthropicApiKey] = useState('');
    const [anthropicHasKey, setAnthropicHasKey] = useState(false);
    const [anthropicModelQualityFirst, setAnthropicModelQualityFirst] = useState('');
    const [anthropicModelSpeedFirst, setAnthropicModelSpeedFirst] = useState('');
    const [anthropicModelCostBalanced, setAnthropicModelCostBalanced] = useState('');
    const [anthropicModelCustom, setAnthropicModelCustom] = useState('');

    const [googleModel, setGoogleModel] = useState('gemini-1.5-flash');
    const [googleBaseUrl, setGoogleBaseUrl] = useState('https://generativelanguage.googleapis.com/v1beta');
    const [googleApiKey, setGoogleApiKey] = useState('');
    const [googleHasKey, setGoogleHasKey] = useState(false);
    const [googleModelQualityFirst, setGoogleModelQualityFirst] = useState('');
    const [googleModelSpeedFirst, setGoogleModelSpeedFirst] = useState('');
    const [googleModelCostBalanced, setGoogleModelCostBalanced] = useState('');
    const [googleModelCustom, setGoogleModelCustom] = useState('');

    const [xaiModel, setXaiModel] = useState('grok-beta');
    const [xaiBaseUrl, setXaiBaseUrl] = useState('https://api.x.ai/v1');
    const [xaiApiKey, setXaiApiKey] = useState('');
    const [xaiHasKey, setXaiHasKey] = useState(false);
    const [xaiModelQualityFirst, setXaiModelQualityFirst] = useState('');
    const [xaiModelSpeedFirst, setXaiModelSpeedFirst] = useState('');
    const [xaiModelCostBalanced, setXaiModelCostBalanced] = useState('');
    const [xaiModelCustom, setXaiModelCustom] = useState('');

    const [mistralModel, setMistralModel] = useState('mistral-small-latest');
    const [mistralBaseUrl, setMistralBaseUrl] = useState('https://api.mistral.ai/v1');
    const [mistralApiKey, setMistralApiKey] = useState('');
    const [mistralHasKey, setMistralHasKey] = useState(false);
    const [mistralModelQualityFirst, setMistralModelQualityFirst] = useState('');
    const [mistralModelSpeedFirst, setMistralModelSpeedFirst] = useState('');
    const [mistralModelCostBalanced, setMistralModelCostBalanced] = useState('');
    const [mistralModelCustom, setMistralModelCustom] = useState('');

    const [togetherModel, setTogetherModel] = useState('meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo');
    const [togetherBaseUrl, setTogetherBaseUrl] = useState('https://api.together.xyz/v1');
    const [togetherApiKey, setTogetherApiKey] = useState('');
    const [togetherHasKey, setTogetherHasKey] = useState(false);
    const [togetherModelQualityFirst, setTogetherModelQualityFirst] = useState('');
    const [togetherModelSpeedFirst, setTogetherModelSpeedFirst] = useState('');
    const [togetherModelCostBalanced, setTogetherModelCostBalanced] = useState('');
    const [togetherModelCustom, setTogetherModelCustom] = useState('');

    const [autoQualityFirstProviders, setAutoQualityFirstProviders] = useState('anthropic,azure_openai,openai,xai,google,mistral,github_models,together');
    const [autoSpeedFirstProviders, setAutoSpeedFirstProviders] = useState('together,mistral,google,github_models,xai,openai,azure_openai,anthropic');
    const [autoCostBalancedProviders, setAutoCostBalancedProviders] = useState('together,mistral,github_models,google,xai,openai,azure_openai,anthropic');
    const [autoCustomProviders, setAutoCustomProviders] = useState('openai,anthropic,google,xai,mistral,together,github_models,azure_openai');

    const isOpenAi = provider === 'openai';
    const isAzureOpenAi = provider === 'azure_openai';
    const isGitHubModels = provider === 'github_models';
    const isAnthropic = provider === 'anthropic';
    const isGoogle = provider === 'google';
    const isXai = provider === 'xai';
    const isMistral = provider === 'mistral';
    const isTogether = provider === 'together';
    const isAuto = provider === 'auto';

    const applyRecommendedOpenAiProfiles = () => {
        setOpenaiModelQualityFirst('gpt-4.1');
        setOpenaiModelSpeedFirst('gpt-4o-mini');
        setOpenaiModelCostBalanced('gpt-4.1-mini');
        setOpenaiModelCustom(openaiModel.trim() || 'gpt-4o-mini');
    };

    const applyPresetUltraLowCost = () => {
        setProvider('auto');
        setAutoQualityFirstProviders('mistral,xai,github_models,together');
        setAutoSpeedFirstProviders('together,github_models,mistral');
        setAutoCostBalancedProviders('github_models,together,mistral,xai');
        setAutoCustomProviders('together,mistral,github_models,xai');
        if (!mistralModel.trim()) setMistralModel('mistral-small-latest');
        if (!togetherModel.trim()) setTogetherModel('meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo');
    };

    const applyPresetBalanced = () => {
        setProvider('auto');
        setAutoQualityFirstProviders('anthropic,openai,xai');
        setAutoSpeedFirstProviders('google,openai,mistral');
        setAutoCostBalancedProviders('openai,mistral,google');
        setAutoCustomProviders('openai,anthropic,google,mistral,xai');
        if (!openaiModel.trim()) setOpenaiModel('gpt-4o-mini');
        if (!mistralModel.trim()) setMistralModel('mistral-small-latest');
    };

    const applyPresetPremiumQuality = () => {
        setProvider('auto');
        setAutoQualityFirstProviders('anthropic,openai');
        setAutoSpeedFirstProviders('openai,anthropic');
        setAutoCostBalancedProviders('anthropic,openai');
        setAutoCustomProviders('anthropic,openai,xai');
        if (!anthropicModel.trim()) setAnthropicModel('claude-3-5-sonnet-latest');
        if (!openaiModel.trim()) setOpenaiModel('gpt-4.1');
    };

    const applyCurrentAzureDeploymentToAllProfiles = () => {
        const deployment = azureDeployment.trim();
        if (!deployment) {
            return;
        }

        setAzureDeploymentQualityFirst(deployment);
        setAzureDeploymentSpeedFirst(deployment);
        setAzureDeploymentCostBalanced(deployment);
        setAzureDeploymentCustom(deployment);
    };

    const toProfileMap = (input: {
        quality_first: string;
        speed_first: string;
        cost_balanced: string;
        custom: string;
    }): ModelProfileMap | undefined => {
        const normalized: ModelProfileMap = {};

        if (input.quality_first.trim()) {
            normalized.quality_first = input.quality_first.trim();
        }
        if (input.speed_first.trim()) {
            normalized.speed_first = input.speed_first.trim();
        }
        if (input.cost_balanced.trim()) {
            normalized.cost_balanced = input.cost_balanced.trim();
        }
        if (input.custom.trim()) {
            normalized.custom = input.custom.trim();
        }

        return Object.keys(normalized).length > 0 ? normalized : undefined;
    };

    const parseAutoProviders = (value: string): AutoProvider[] => {
        const parts = value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);

        const allowed: AutoProvider[] = [];
        for (const entry of parts) {
            if (entry === 'openai' || entry === 'azure_openai' || entry === 'github_models' || entry === 'anthropic' || entry === 'google' || entry === 'xai' || entry === 'mistral' || entry === 'together') {
                allowed.push(entry);
            }
        }

        return Array.from(new Set(allowed));
    };

    const toAutoProfileProviderMap = (): AutoProfileProviderMap | undefined => {
        const normalized: AutoProfileProviderMap = {};

        const quality = parseAutoProviders(autoQualityFirstProviders);
        const speed = parseAutoProviders(autoSpeedFirstProviders);
        const cost = parseAutoProviders(autoCostBalancedProviders);
        const custom = parseAutoProviders(autoCustomProviders);

        if (quality.length > 0) {
            normalized.quality_first = quality;
        }
        if (speed.length > 0) {
            normalized.speed_first = speed;
        }
        if (cost.length > 0) {
            normalized.cost_balanced = cost;
        }
        if (custom.length > 0) {
            normalized.custom = custom;
        }

        return Object.keys(normalized).length > 0 ? normalized : undefined;
    };

    const fetchConfig = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/llm-config`, {
                cache: 'no-store',
            });

            if (!response.ok) {
                const body = (await response.json().catch(() => ({}))) as { message?: string };
                setError(body.message ?? `Unable to load LLM config (${response.status}).`);
                return;
            }

            const body = (await response.json()) as ResponseShape;
            const config = body.config;
            if (!config) {
                return;
            }

            setSource(body.source ?? 'default');
            setProvider(config.provider);
            setTimeoutMs(String(config.timeout_ms ?? 5000));

            setOpenaiModel(config.openai?.model ?? 'gpt-4o-mini');
            setOpenaiBaseUrl(config.openai?.base_url ?? '');
            setOpenaiHasKey(Boolean(config.openai?.has_api_key));
            setOpenaiApiKey('');
            setOpenaiModelQualityFirst(config.openai?.model_profiles?.quality_first ?? '');
            setOpenaiModelSpeedFirst(config.openai?.model_profiles?.speed_first ?? '');
            setOpenaiModelCostBalanced(config.openai?.model_profiles?.cost_balanced ?? '');
            setOpenaiModelCustom(config.openai?.model_profiles?.custom ?? '');

            setAzureEndpoint(config.azure_openai?.endpoint ?? '');
            setAzureDeployment(config.azure_openai?.deployment ?? '');
            setAzureApiVersion(config.azure_openai?.api_version ?? '2024-06-01');
            setAzureHasKey(Boolean(config.azure_openai?.has_api_key));
            setAzureApiKey('');
            setAzureDeploymentQualityFirst(config.azure_openai?.deployment_profiles?.quality_first ?? '');
            setAzureDeploymentSpeedFirst(config.azure_openai?.deployment_profiles?.speed_first ?? '');
            setAzureDeploymentCostBalanced(config.azure_openai?.deployment_profiles?.cost_balanced ?? '');
            setAzureDeploymentCustom(config.azure_openai?.deployment_profiles?.custom ?? '');

            setGithubModel(config.github_models?.model ?? 'openai/gpt-4.1-mini');
            setGithubBaseUrl(config.github_models?.base_url ?? 'https://models.inference.ai.azure.com');
            setGithubHasKey(Boolean(config.github_models?.has_api_key));
            setGithubApiKey('');
            setGithubModelQualityFirst(config.github_models?.model_profiles?.quality_first ?? '');
            setGithubModelSpeedFirst(config.github_models?.model_profiles?.speed_first ?? '');
            setGithubModelCostBalanced(config.github_models?.model_profiles?.cost_balanced ?? '');
            setGithubModelCustom(config.github_models?.model_profiles?.custom ?? '');

            setAnthropicModel(config.anthropic?.model ?? 'claude-3-5-sonnet-latest');
            setAnthropicBaseUrl(config.anthropic?.base_url ?? 'https://api.anthropic.com');
            setAnthropicApiVersion(config.anthropic?.api_version ?? '2023-06-01');
            setAnthropicHasKey(Boolean(config.anthropic?.has_api_key));
            setAnthropicApiKey('');
            setAnthropicModelQualityFirst(config.anthropic?.model_profiles?.quality_first ?? '');
            setAnthropicModelSpeedFirst(config.anthropic?.model_profiles?.speed_first ?? '');
            setAnthropicModelCostBalanced(config.anthropic?.model_profiles?.cost_balanced ?? '');
            setAnthropicModelCustom(config.anthropic?.model_profiles?.custom ?? '');

            setGoogleModel(config.google?.model ?? 'gemini-1.5-flash');
            setGoogleBaseUrl(config.google?.base_url ?? 'https://generativelanguage.googleapis.com/v1beta');
            setGoogleHasKey(Boolean(config.google?.has_api_key));
            setGoogleApiKey('');
            setGoogleModelQualityFirst(config.google?.model_profiles?.quality_first ?? '');
            setGoogleModelSpeedFirst(config.google?.model_profiles?.speed_first ?? '');
            setGoogleModelCostBalanced(config.google?.model_profiles?.cost_balanced ?? '');
            setGoogleModelCustom(config.google?.model_profiles?.custom ?? '');

            setXaiModel(config.xai?.model ?? 'grok-beta');
            setXaiBaseUrl(config.xai?.base_url ?? 'https://api.x.ai/v1');
            setXaiHasKey(Boolean(config.xai?.has_api_key));
            setXaiApiKey('');
            setXaiModelQualityFirst(config.xai?.model_profiles?.quality_first ?? '');
            setXaiModelSpeedFirst(config.xai?.model_profiles?.speed_first ?? '');
            setXaiModelCostBalanced(config.xai?.model_profiles?.cost_balanced ?? '');
            setXaiModelCustom(config.xai?.model_profiles?.custom ?? '');

            setMistralModel(config.mistral?.model ?? 'mistral-small-latest');
            setMistralBaseUrl(config.mistral?.base_url ?? 'https://api.mistral.ai/v1');
            setMistralHasKey(Boolean(config.mistral?.has_api_key));
            setMistralApiKey('');
            setMistralModelQualityFirst(config.mistral?.model_profiles?.quality_first ?? '');
            setMistralModelSpeedFirst(config.mistral?.model_profiles?.speed_first ?? '');
            setMistralModelCostBalanced(config.mistral?.model_profiles?.cost_balanced ?? '');
            setMistralModelCustom(config.mistral?.model_profiles?.custom ?? '');

            setTogetherModel(config.together?.model ?? 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo');
            setTogetherBaseUrl(config.together?.base_url ?? 'https://api.together.xyz/v1');
            setTogetherHasKey(Boolean(config.together?.has_api_key));
            setTogetherApiKey('');
            setTogetherModelQualityFirst(config.together?.model_profiles?.quality_first ?? '');
            setTogetherModelSpeedFirst(config.together?.model_profiles?.speed_first ?? '');
            setTogetherModelCostBalanced(config.together?.model_profiles?.cost_balanced ?? '');
            setTogetherModelCustom(config.together?.model_profiles?.custom ?? '');

            setAutoQualityFirstProviders(config.auto?.profile_providers?.quality_first?.join(',') ?? 'anthropic,azure_openai,openai,xai,google,mistral,github_models,together');
            setAutoSpeedFirstProviders(config.auto?.profile_providers?.speed_first?.join(',') ?? 'together,mistral,google,github_models,xai,openai,azure_openai,anthropic');
            setAutoCostBalancedProviders(config.auto?.profile_providers?.cost_balanced?.join(',') ?? 'together,mistral,github_models,google,xai,openai,azure_openai,anthropic');
            setAutoCustomProviders(config.auto?.profile_providers?.custom?.join(',') ?? 'openai,anthropic,google,xai,mistral,together,github_models,azure_openai');
        } catch {
            setError('Network error while loading LLM settings.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchConfig();
    }, [workspaceId]);

    const payload = useMemo(() => {
        const timeout = Number(timeoutMs);
        return {
            provider,
            timeout_ms: Number.isFinite(timeout) && timeout > 0 ? timeout : 5000,
            openai: {
                model: openaiModel.trim() || undefined,
                base_url: openaiBaseUrl.trim() || undefined,
                model_profiles: toProfileMap({
                    quality_first: openaiModelQualityFirst,
                    speed_first: openaiModelSpeedFirst,
                    cost_balanced: openaiModelCostBalanced,
                    custom: openaiModelCustom,
                }),
                ...(openaiApiKey.trim() ? { api_key: openaiApiKey.trim() } : {}),
            },
            azure_openai: {
                endpoint: azureEndpoint.trim() || undefined,
                deployment: azureDeployment.trim() || undefined,
                api_version: azureApiVersion.trim() || undefined,
                deployment_profiles: toProfileMap({
                    quality_first: azureDeploymentQualityFirst,
                    speed_first: azureDeploymentSpeedFirst,
                    cost_balanced: azureDeploymentCostBalanced,
                    custom: azureDeploymentCustom,
                }),
                ...(azureApiKey.trim() ? { api_key: azureApiKey.trim() } : {}),
            },
            github_models: {
                model: githubModel.trim() || undefined,
                base_url: githubBaseUrl.trim() || undefined,
                model_profiles: toProfileMap({
                    quality_first: githubModelQualityFirst,
                    speed_first: githubModelSpeedFirst,
                    cost_balanced: githubModelCostBalanced,
                    custom: githubModelCustom,
                }),
                ...(githubApiKey.trim() ? { api_key: githubApiKey.trim() } : {}),
            },
            anthropic: {
                model: anthropicModel.trim() || undefined,
                base_url: anthropicBaseUrl.trim() || undefined,
                api_version: anthropicApiVersion.trim() || undefined,
                model_profiles: toProfileMap({
                    quality_first: anthropicModelQualityFirst,
                    speed_first: anthropicModelSpeedFirst,
                    cost_balanced: anthropicModelCostBalanced,
                    custom: anthropicModelCustom,
                }),
                ...(anthropicApiKey.trim() ? { api_key: anthropicApiKey.trim() } : {}),
            },
            google: {
                model: googleModel.trim() || undefined,
                base_url: googleBaseUrl.trim() || undefined,
                model_profiles: toProfileMap({
                    quality_first: googleModelQualityFirst,
                    speed_first: googleModelSpeedFirst,
                    cost_balanced: googleModelCostBalanced,
                    custom: googleModelCustom,
                }),
                ...(googleApiKey.trim() ? { api_key: googleApiKey.trim() } : {}),
            },
            xai: {
                model: xaiModel.trim() || undefined,
                base_url: xaiBaseUrl.trim() || undefined,
                model_profiles: toProfileMap({
                    quality_first: xaiModelQualityFirst,
                    speed_first: xaiModelSpeedFirst,
                    cost_balanced: xaiModelCostBalanced,
                    custom: xaiModelCustom,
                }),
                ...(xaiApiKey.trim() ? { api_key: xaiApiKey.trim() } : {}),
            },
            mistral: {
                model: mistralModel.trim() || undefined,
                base_url: mistralBaseUrl.trim() || undefined,
                model_profiles: toProfileMap({
                    quality_first: mistralModelQualityFirst,
                    speed_first: mistralModelSpeedFirst,
                    cost_balanced: mistralModelCostBalanced,
                    custom: mistralModelCustom,
                }),
                ...(mistralApiKey.trim() ? { api_key: mistralApiKey.trim() } : {}),
            },
            together: {
                model: togetherModel.trim() || undefined,
                base_url: togetherBaseUrl.trim() || undefined,
                model_profiles: toProfileMap({
                    quality_first: togetherModelQualityFirst,
                    speed_first: togetherModelSpeedFirst,
                    cost_balanced: togetherModelCostBalanced,
                    custom: togetherModelCustom,
                }),
                ...(togetherApiKey.trim() ? { api_key: togetherApiKey.trim() } : {}),
            },
            auto: {
                profile_providers: toAutoProfileProviderMap(),
            },
        };
    }, [
        provider,
        timeoutMs,
        openaiModel,
        openaiBaseUrl,
        openaiApiKey,
        openaiModelQualityFirst,
        openaiModelSpeedFirst,
        openaiModelCostBalanced,
        openaiModelCustom,
        azureEndpoint,
        azureDeployment,
        azureApiVersion,
        azureApiKey,
        azureDeploymentQualityFirst,
        azureDeploymentSpeedFirst,
        azureDeploymentCostBalanced,
        azureDeploymentCustom,
        githubModel,
        githubBaseUrl,
        githubApiKey,
        githubModelQualityFirst,
        githubModelSpeedFirst,
        githubModelCostBalanced,
        githubModelCustom,
        anthropicModel,
        anthropicBaseUrl,
        anthropicApiVersion,
        anthropicApiKey,
        anthropicModelQualityFirst,
        anthropicModelSpeedFirst,
        anthropicModelCostBalanced,
        anthropicModelCustom,
        googleModel,
        googleBaseUrl,
        googleApiKey,
        googleModelQualityFirst,
        googleModelSpeedFirst,
        googleModelCostBalanced,
        googleModelCustom,
        xaiModel,
        xaiBaseUrl,
        xaiApiKey,
        xaiModelQualityFirst,
        xaiModelSpeedFirst,
        xaiModelCostBalanced,
        xaiModelCustom,
        mistralModel,
        mistralBaseUrl,
        mistralApiKey,
        mistralModelQualityFirst,
        mistralModelSpeedFirst,
        mistralModelCostBalanced,
        mistralModelCustom,
        togetherModel,
        togetherBaseUrl,
        togetherApiKey,
        togetherModelQualityFirst,
        togetherModelSpeedFirst,
        togetherModelCostBalanced,
        togetherModelCustom,
        autoQualityFirstProviders,
        autoSpeedFirstProviders,
        autoCostBalancedProviders,
        autoCustomProviders,
    ]);

    const save = async () => {
        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/llm-config`, {
                method: 'PUT',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const body = (await response.json().catch(() => ({}))) as ResponseShape;

            if (!response.ok) {
                setError(body.message ?? `Unable to save LLM settings (${response.status}).`);
                return;
            }

            setSuccess('LLM settings saved for this workspace.');
            await fetchConfig();
        } catch {
            setError('Network error while saving LLM settings.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="card panel-stack">
            <h2>LLM Settings</h2>
            <p className="panel-subtitle">
                Configure provider and model per workspace. Runtime picks this up on startup.
            </p>

            {loading ? (
                <p className="panel-muted">Loading workspace LLM settings...</p>
            ) : (
                <>
                    <div className="panel-badge-row">
                        <span className={`badge ${source === 'configured' ? 'low' : 'warn'}`}>
                            source: {source}
                        </span>
                        <span className="badge neutral">workspace: {workspaceId}</span>
                    </div>

                    <div className="panel-form-grid">
                        <label className="panel-field">
                            <span className="panel-field-label">Provider</span>
                            <select
                                value={provider}
                                onChange={(event) => setProvider(event.target.value as Provider)}
                                className="panel-control"
                            >
                                <option value="agentfarm">Heuristic Only (no external LLM)</option>
                                <option value="openai">OpenAI</option>
                                <option value="azure_openai">Azure OpenAI</option>
                                <option value="github_models">GitHub Models</option>
                                <option value="anthropic">Anthropic</option>
                                <option value="google">Google (Gemini)</option>
                                <option value="xai">xAI (Grok)</option>
                                <option value="mistral">Mistral</option>
                                <option value="together">Together AI</option>
                                <option value="auto">Auto (multi-provider)</option>
                            </select>
                        </label>

                        <label className="panel-field">
                            <span className="panel-field-label">Timeout (ms)</span>
                            <input
                                type="number"
                                min={500}
                                step={100}
                                value={timeoutMs}
                                onChange={(event) => setTimeoutMs(event.target.value)}
                                className="panel-control"
                            />
                        </label>
                    </div>

                    {isOpenAi && (
                        <div className="panel-group">
                            <h3 className="panel-group-title">OpenAI</h3>
                            <div className="panel-form-grid">
                                <label className="panel-field">
                                    <span className="panel-field-label">Model</span>
                                    <input value={openaiModel} onChange={(event) => setOpenaiModel(event.target.value)} className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Base URL (optional)</span>
                                    <input value={openaiBaseUrl} onChange={(event) => setOpenaiBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">API Key {openaiHasKey ? '(already set)' : '(not set)'}</span>
                                    <input type="password" value={openaiApiKey} onChange={(event) => setOpenaiApiKey(event.target.value)} placeholder="Paste new key to rotate" className="panel-control" />
                                </label>
                            </div>
                            <p className="panel-muted">
                                Optional profile routing: map task profiles to cheaper or stronger models.
                            </p>
                            <p className="panel-inline-note" style={{ color: '#78716c' }}>
                                Recommended starting point: quality_first to gpt-4.1, speed_first to gpt-4o-mini,
                                cost_balanced to gpt-4.1-mini, custom to your team preference.
                            </p>
                            <div className="panel-actions-end" style={{ marginTop: 0 }}>
                                <button
                                    type="button"
                                    onClick={applyRecommendedOpenAiProfiles}
                                    className="secondary-action"
                                >
                                    Apply Recommended Defaults
                                </button>
                            </div>
                            <div className="panel-form-grid">
                                <label className="panel-field">
                                    <span className="panel-field-label">Quality First Model</span>
                                    <input value={openaiModelQualityFirst} onChange={(event) => setOpenaiModelQualityFirst(event.target.value)} placeholder="gpt-4.1" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Speed First Model</span>
                                    <input value={openaiModelSpeedFirst} onChange={(event) => setOpenaiModelSpeedFirst(event.target.value)} placeholder="gpt-4o-mini" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Cost Balanced Model</span>
                                    <input value={openaiModelCostBalanced} onChange={(event) => setOpenaiModelCostBalanced(event.target.value)} placeholder="gpt-4.1-mini" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Custom Profile Model</span>
                                    <input value={openaiModelCustom} onChange={(event) => setOpenaiModelCustom(event.target.value)} placeholder="gpt-4o" className="panel-control" />
                                </label>
                            </div>
                        </div>
                    )}

                    {isGitHubModels && (
                        <div className="panel-group">
                            <h3 className="panel-group-title">GitHub Models</h3>
                            <div className="panel-form-grid">
                                <label className="panel-field">
                                    <span className="panel-field-label">Model</span>
                                    <input value={githubModel} onChange={(event) => setGithubModel(event.target.value)} placeholder="openai/gpt-4.1-mini" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Base URL</span>
                                    <input value={githubBaseUrl} onChange={(event) => setGithubBaseUrl(event.target.value)} placeholder="https://models.inference.ai.azure.com" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">API Key {githubHasKey ? '(already set)' : '(not set)'}</span>
                                    <input type="password" value={githubApiKey} onChange={(event) => setGithubApiKey(event.target.value)} placeholder="Paste new key to rotate" className="panel-control" />
                                </label>
                            </div>
                            <p className="panel-muted">
                                Optional profile routing: map task profiles to GitHub-hosted models.
                            </p>
                            <div className="panel-form-grid">
                                <label className="panel-field">
                                    <span className="panel-field-label">Quality First Model</span>
                                    <input value={githubModelQualityFirst} onChange={(event) => setGithubModelQualityFirst(event.target.value)} placeholder="openai/gpt-4.1" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Speed First Model</span>
                                    <input value={githubModelSpeedFirst} onChange={(event) => setGithubModelSpeedFirst(event.target.value)} placeholder="openai/gpt-4.1-mini" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Cost Balanced Model</span>
                                    <input value={githubModelCostBalanced} onChange={(event) => setGithubModelCostBalanced(event.target.value)} placeholder="openai/gpt-4.1-mini" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Custom Profile Model</span>
                                    <input value={githubModelCustom} onChange={(event) => setGithubModelCustom(event.target.value)} placeholder="openai/gpt-4o-mini" className="panel-control" />
                                </label>
                            </div>
                        </div>
                    )}

                    {isAuto && (
                        <div className="panel-group">
                            <h3 className="panel-group-title">Auto Provider Routing</h3>
                            <p className="panel-muted">
                                Set provider priority per profile using comma-separated values.
                                Allowed providers: openai, azure_openai, github_models, anthropic, google, xai, mistral, together.
                            </p>
                            <div className="panel-actions-end" style={{ marginTop: 0, marginBottom: 8 }}>
                                <button type="button" onClick={applyPresetUltraLowCost} className="secondary-action">
                                    Ultra Low Cost
                                </button>
                                <button type="button" onClick={applyPresetBalanced} className="secondary-action">
                                    Balanced
                                </button>
                                <button type="button" onClick={applyPresetPremiumQuality} className="secondary-action">
                                    Premium Quality
                                </button>
                            </div>
                            <div className="panel-form-grid">
                                <label className="panel-field">
                                    <span className="panel-field-label">quality_first provider priority</span>
                                    <input value={autoQualityFirstProviders} onChange={(event) => setAutoQualityFirstProviders(event.target.value)} className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">speed_first provider priority</span>
                                    <input value={autoSpeedFirstProviders} onChange={(event) => setAutoSpeedFirstProviders(event.target.value)} className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">cost_balanced provider priority</span>
                                    <input value={autoCostBalancedProviders} onChange={(event) => setAutoCostBalancedProviders(event.target.value)} className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">custom provider priority</span>
                                    <input value={autoCustomProviders} onChange={(event) => setAutoCustomProviders(event.target.value)} className="panel-control" />
                                </label>
                            </div>
                            <p className="panel-inline-note" style={{ color: '#78716c' }}>
                                Tip: keep at least two providers in each profile for resilient fallback.
                            </p>
                        </div>
                    )}

                    {isXai && (
                        <div className="panel-group">
                            <h3 className="panel-group-title">xAI (Grok)</h3>
                            <div className="panel-form-grid">
                                <label className="panel-field">
                                    <span className="panel-field-label">Model</span>
                                    <input value={xaiModel} onChange={(event) => setXaiModel(event.target.value)} placeholder="grok-beta" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Base URL</span>
                                    <input value={xaiBaseUrl} onChange={(event) => setXaiBaseUrl(event.target.value)} placeholder="https://api.x.ai/v1" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">API Key {xaiHasKey ? '(already set)' : '(not set)'}</span>
                                    <input type="password" value={xaiApiKey} onChange={(event) => setXaiApiKey(event.target.value)} placeholder="Paste new key to rotate" className="panel-control" />
                                </label>
                            </div>
                            <div className="panel-form-grid">
                                <label className="panel-field">
                                    <span className="panel-field-label">Quality First Model</span>
                                    <input value={xaiModelQualityFirst} onChange={(event) => setXaiModelQualityFirst(event.target.value)} placeholder="grok-beta" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Speed First Model</span>
                                    <input value={xaiModelSpeedFirst} onChange={(event) => setXaiModelSpeedFirst(event.target.value)} placeholder="grok-beta" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Cost Balanced Model</span>
                                    <input value={xaiModelCostBalanced} onChange={(event) => setXaiModelCostBalanced(event.target.value)} placeholder="grok-beta" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Custom Profile Model</span>
                                    <input value={xaiModelCustom} onChange={(event) => setXaiModelCustom(event.target.value)} placeholder="grok-beta" className="panel-control" />
                                </label>
                            </div>
                        </div>
                    )}

                    {isMistral && (
                        <div className="panel-group">
                            <h3 className="panel-group-title">Mistral</h3>
                            <div className="panel-form-grid">
                                <label className="panel-field">
                                    <span className="panel-field-label">Model</span>
                                    <input value={mistralModel} onChange={(event) => setMistralModel(event.target.value)} placeholder="mistral-small-latest" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Base URL</span>
                                    <input value={mistralBaseUrl} onChange={(event) => setMistralBaseUrl(event.target.value)} placeholder="https://api.mistral.ai/v1" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">API Key {mistralHasKey ? '(already set)' : '(not set)'}</span>
                                    <input type="password" value={mistralApiKey} onChange={(event) => setMistralApiKey(event.target.value)} placeholder="Paste new key to rotate" className="panel-control" />
                                </label>
                            </div>
                            <div className="panel-form-grid">
                                <label className="panel-field">
                                    <span className="panel-field-label">Quality First Model</span>
                                    <input value={mistralModelQualityFirst} onChange={(event) => setMistralModelQualityFirst(event.target.value)} placeholder="mistral-large-latest" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Speed First Model</span>
                                    <input value={mistralModelSpeedFirst} onChange={(event) => setMistralModelSpeedFirst(event.target.value)} placeholder="mistral-small-latest" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Cost Balanced Model</span>
                                    <input value={mistralModelCostBalanced} onChange={(event) => setMistralModelCostBalanced(event.target.value)} placeholder="mistral-small-latest" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Custom Profile Model</span>
                                    <input value={mistralModelCustom} onChange={(event) => setMistralModelCustom(event.target.value)} placeholder="mistral-large-latest" className="panel-control" />
                                </label>
                            </div>
                        </div>
                    )}

                    {isTogether && (
                        <div className="panel-group">
                            <h3 className="panel-group-title">Together AI</h3>
                            <div className="panel-form-grid">
                                <label className="panel-field">
                                    <span className="panel-field-label">Model</span>
                                    <input value={togetherModel} onChange={(event) => setTogetherModel(event.target.value)} placeholder="meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Base URL</span>
                                    <input value={togetherBaseUrl} onChange={(event) => setTogetherBaseUrl(event.target.value)} placeholder="https://api.together.xyz/v1" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">API Key {togetherHasKey ? '(already set)' : '(not set)'}</span>
                                    <input type="password" value={togetherApiKey} onChange={(event) => setTogetherApiKey(event.target.value)} placeholder="Paste new key to rotate" className="panel-control" />
                                </label>
                            </div>
                            <div className="panel-form-grid">
                                <label className="panel-field">
                                    <span className="panel-field-label">Quality First Model</span>
                                    <input value={togetherModelQualityFirst} onChange={(event) => setTogetherModelQualityFirst(event.target.value)} placeholder="meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Speed First Model</span>
                                    <input value={togetherModelSpeedFirst} onChange={(event) => setTogetherModelSpeedFirst(event.target.value)} placeholder="meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Cost Balanced Model</span>
                                    <input value={togetherModelCostBalanced} onChange={(event) => setTogetherModelCostBalanced(event.target.value)} placeholder="meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Custom Profile Model</span>
                                    <input value={togetherModelCustom} onChange={(event) => setTogetherModelCustom(event.target.value)} placeholder="meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo" className="panel-control" />
                                </label>
                            </div>
                        </div>
                    )}

                    {isAnthropic && (
                        <div className="panel-group">
                            <h3 className="panel-group-title">Anthropic</h3>
                            <div className="panel-form-grid">
                                <label className="panel-field">
                                    <span className="panel-field-label">Model</span>
                                    <input value={anthropicModel} onChange={(event) => setAnthropicModel(event.target.value)} placeholder="claude-3-5-sonnet-latest" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Base URL</span>
                                    <input value={anthropicBaseUrl} onChange={(event) => setAnthropicBaseUrl(event.target.value)} placeholder="https://api.anthropic.com" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">API Version</span>
                                    <input value={anthropicApiVersion} onChange={(event) => setAnthropicApiVersion(event.target.value)} className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">API Key {anthropicHasKey ? '(already set)' : '(not set)'}</span>
                                    <input type="password" value={anthropicApiKey} onChange={(event) => setAnthropicApiKey(event.target.value)} placeholder="Paste new key to rotate" className="panel-control" />
                                </label>
                            </div>
                            <div className="panel-form-grid">
                                <label className="panel-field">
                                    <span className="panel-field-label">Quality First Model</span>
                                    <input value={anthropicModelQualityFirst} onChange={(event) => setAnthropicModelQualityFirst(event.target.value)} placeholder="claude-3-5-sonnet-latest" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Speed First Model</span>
                                    <input value={anthropicModelSpeedFirst} onChange={(event) => setAnthropicModelSpeedFirst(event.target.value)} placeholder="claude-3-5-haiku-latest" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Cost Balanced Model</span>
                                    <input value={anthropicModelCostBalanced} onChange={(event) => setAnthropicModelCostBalanced(event.target.value)} placeholder="claude-3-5-haiku-latest" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Custom Profile Model</span>
                                    <input value={anthropicModelCustom} onChange={(event) => setAnthropicModelCustom(event.target.value)} placeholder="claude-3-5-sonnet-latest" className="panel-control" />
                                </label>
                            </div>
                        </div>
                    )}

                    {isGoogle && (
                        <div className="panel-group">
                            <h3 className="panel-group-title">Google (Gemini)</h3>
                            <div className="panel-form-grid">
                                <label className="panel-field">
                                    <span className="panel-field-label">Model</span>
                                    <input value={googleModel} onChange={(event) => setGoogleModel(event.target.value)} placeholder="gemini-1.5-flash" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Base URL</span>
                                    <input value={googleBaseUrl} onChange={(event) => setGoogleBaseUrl(event.target.value)} placeholder="https://generativelanguage.googleapis.com/v1beta" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">API Key {googleHasKey ? '(already set)' : '(not set)'}</span>
                                    <input type="password" value={googleApiKey} onChange={(event) => setGoogleApiKey(event.target.value)} placeholder="Paste new key to rotate" className="panel-control" />
                                </label>
                            </div>
                            <div className="panel-form-grid">
                                <label className="panel-field">
                                    <span className="panel-field-label">Quality First Model</span>
                                    <input value={googleModelQualityFirst} onChange={(event) => setGoogleModelQualityFirst(event.target.value)} placeholder="gemini-1.5-pro" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Speed First Model</span>
                                    <input value={googleModelSpeedFirst} onChange={(event) => setGoogleModelSpeedFirst(event.target.value)} placeholder="gemini-1.5-flash" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Cost Balanced Model</span>
                                    <input value={googleModelCostBalanced} onChange={(event) => setGoogleModelCostBalanced(event.target.value)} placeholder="gemini-1.5-flash" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Custom Profile Model</span>
                                    <input value={googleModelCustom} onChange={(event) => setGoogleModelCustom(event.target.value)} placeholder="gemini-1.5-pro" className="panel-control" />
                                </label>
                            </div>
                        </div>
                    )}

                    {isAzureOpenAi && (
                        <div className="panel-group">
                            <h3 className="panel-group-title">Azure OpenAI</h3>
                            <div className="panel-form-grid">
                                <label className="panel-field">
                                    <span className="panel-field-label">Endpoint</span>
                                    <input value={azureEndpoint} onChange={(event) => setAzureEndpoint(event.target.value)} placeholder="https://example.openai.azure.com" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Deployment</span>
                                    <input value={azureDeployment} onChange={(event) => setAzureDeployment(event.target.value)} placeholder="gpt-4o-mini" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">API Version</span>
                                    <input value={azureApiVersion} onChange={(event) => setAzureApiVersion(event.target.value)} className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">API Key {azureHasKey ? '(already set)' : '(not set)'}</span>
                                    <input type="password" value={azureApiKey} onChange={(event) => setAzureApiKey(event.target.value)} placeholder="Paste new key to rotate" className="panel-control" />
                                </label>
                            </div>
                            <p className="panel-muted">
                                Optional profile routing: map task profiles to deployment names.
                            </p>
                            <p className="panel-inline-note" style={{ color: '#78716c' }}>
                                Recommended starting point: set speed_first and cost_balanced to your cheaper deployment,
                                and quality_first to your strongest deployment.
                            </p>
                            <div className="panel-actions-end" style={{ marginTop: 0 }}>
                                <button
                                    type="button"
                                    onClick={applyCurrentAzureDeploymentToAllProfiles}
                                    disabled={!azureDeployment.trim()}
                                    className="secondary-action"
                                >
                                    Copy Current Deployment To All Profiles
                                </button>
                            </div>
                            <div className="panel-form-grid">
                                <label className="panel-field">
                                    <span className="panel-field-label">Quality First Deployment</span>
                                    <input value={azureDeploymentQualityFirst} onChange={(event) => setAzureDeploymentQualityFirst(event.target.value)} placeholder="gpt-4.1" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Speed First Deployment</span>
                                    <input value={azureDeploymentSpeedFirst} onChange={(event) => setAzureDeploymentSpeedFirst(event.target.value)} placeholder="gpt-4o-mini" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Cost Balanced Deployment</span>
                                    <input value={azureDeploymentCostBalanced} onChange={(event) => setAzureDeploymentCostBalanced(event.target.value)} placeholder="gpt-4.1-mini" className="panel-control" />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Custom Profile Deployment</span>
                                    <input value={azureDeploymentCustom} onChange={(event) => setAzureDeploymentCustom(event.target.value)} placeholder="gpt-4o" className="panel-control" />
                                </label>
                            </div>
                        </div>
                    )}

                    {error && <p role="alert" className="panel-inline-note error">{error}</p>}
                    {success && <p className="panel-inline-note success">{success}</p>}

                    <div className="panel-actions-end">
                        <button
                            type="button"
                            onClick={() => void save()}
                            disabled={saving || loading}
                            className="primary-action"
                        >
                            {saving ? 'Saving...' : 'Save LLM Settings'}
                        </button>
                    </div>
                </>
            )}
        </section>
    );
}
