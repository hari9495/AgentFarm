import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { SecretStore } from '../lib/secret-store.js';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope: 'customer' | 'internal';
    expiresAt: number;
};

type ModelProvider = 'agentfarm' | 'openai' | 'azure_openai';

type LlmWorkspaceConfig = {
    provider: ModelProvider;
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
    updated_at?: string;
};

type RedactedLlmWorkspaceConfig = {
    provider: ModelProvider;
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
    };
    azure_openai?: {
        endpoint?: unknown;
        deployment?: unknown;
        api_version?: unknown;
        api_key?: unknown;
    };
};

const toProvider = (value: unknown): ModelProvider | null => {
    if (value === 'agentfarm' || value === 'openai' || value === 'azure_openai') {
        return value;
    }
    return null;
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

        return {
            provider,
            timeout_ms: typeof parsed.timeout_ms === 'number' ? parsed.timeout_ms : undefined,
            openai: parsed.openai,
            azure_openai: parsed.azure_openai,
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
        }
        : undefined,
    azure_openai: config.azure_openai
        ? {
            endpoint: config.azure_openai.endpoint,
            deployment: config.azure_openai.deployment,
            api_version: config.azure_openai.api_version,
            has_api_key: Boolean(config.azure_openai.api_key),
        }
        : undefined,
});

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
    };
    const azureOpenai = {
        endpoint: existing.azure_openai?.endpoint,
        deployment: existing.azure_openai?.deployment,
        api_version: existing.azure_openai?.api_version,
        api_key: existing.azure_openai?.api_key,
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
    }

    return {
        valid: true,
        config: {
            provider,
            timeout_ms: timeoutMs,
            openai: openai.model || openai.base_url || openai.api_key ? openai : undefined,
            azure_openai: azureOpenai.endpoint || azureOpenai.deployment || azureOpenai.api_version || azureOpenai.api_key ? azureOpenai : undefined,
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