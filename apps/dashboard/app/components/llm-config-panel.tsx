'use client';

import { useEffect, useMemo, useState } from 'react';

type Provider = 'agentfarm' | 'openai' | 'azure_openai';

type RedactedConfig = {
    provider: Provider;
    timeout_ms?: number;
    openai?: {
        model?: string;
        base_url?: string;
        has_api_key: boolean;
    };
    azure_openai?: {
        endpoint?: string;
        deployment?: string;
        api_version?: string;
        has_api_key: boolean;
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

    const [azureEndpoint, setAzureEndpoint] = useState('');
    const [azureDeployment, setAzureDeployment] = useState('');
    const [azureApiVersion, setAzureApiVersion] = useState('2024-06-01');
    const [azureApiKey, setAzureApiKey] = useState('');
    const [azureHasKey, setAzureHasKey] = useState(false);

    const isOpenAi = provider === 'openai';
    const isAzureOpenAi = provider === 'azure_openai';

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

            setAzureEndpoint(config.azure_openai?.endpoint ?? '');
            setAzureDeployment(config.azure_openai?.deployment ?? '');
            setAzureApiVersion(config.azure_openai?.api_version ?? '2024-06-01');
            setAzureHasKey(Boolean(config.azure_openai?.has_api_key));
            setAzureApiKey('');
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
                ...(openaiApiKey.trim() ? { api_key: openaiApiKey.trim() } : {}),
            },
            azure_openai: {
                endpoint: azureEndpoint.trim() || undefined,
                deployment: azureDeployment.trim() || undefined,
                api_version: azureApiVersion.trim() || undefined,
                ...(azureApiKey.trim() ? { api_key: azureApiKey.trim() } : {}),
            },
        };
    }, [
        provider,
        timeoutMs,
        openaiModel,
        openaiBaseUrl,
        openaiApiKey,
        azureEndpoint,
        azureDeployment,
        azureApiVersion,
        azureApiKey,
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
