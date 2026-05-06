type RouteResult = {
    status: number;
    body: unknown;
};

const buildDefaultLlmConfig = () => ({
    provider: 'agentfarm',
    timeout_ms: 5000,
});

const getUpstreamUnavailableMessage = (): string => 'Dashboard API upstream is unavailable; serving fallback LLM config.';

export type LlmConfigGetInput = {
    workspaceId: string;
    authHeader: string | null;
    fetchImpl?: typeof fetch;
    apiBaseUrl: string;
};

export type LlmConfigPutInput = {
    workspaceId: string;
    authHeader: string | null;
    payload: unknown;
    fetchImpl?: typeof fetch;
    apiBaseUrl: string;
};

export async function proxyLlmConfigGet(input: LlmConfigGetInput): Promise<RouteResult> {
    const { workspaceId, authHeader, fetchImpl = fetch, apiBaseUrl } = input;

    if (!authHeader) {
        return {
            status: 403,
            body: { error: 'forbidden', message: 'Internal session required.' },
        };
    }

    try {
        const response = await fetchImpl(`${apiBaseUrl}/v1/workspaces/${encodeURIComponent(workspaceId)}/runtime/llm-config`, {
            method: 'GET',
            headers: {
                Authorization: authHeader,
            },
            cache: 'no-store',
        });

        const body = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse LLM config response.',
        }));

        return {
            status: response.status,
            body,
        };
    } catch {
        return {
            status: 200,
            body: {
                workspace_id: workspaceId,
                source: 'fallback',
                config: buildDefaultLlmConfig(),
                message: getUpstreamUnavailableMessage(),
            },
        };
    }
}

export async function proxyLlmConfigPut(input: LlmConfigPutInput): Promise<RouteResult> {
    const { workspaceId, authHeader, payload, fetchImpl = fetch, apiBaseUrl } = input;

    if (!authHeader) {
        return {
            status: 403,
            body: { error: 'forbidden', message: 'Internal session required.' },
        };
    }

    try {
        const response = await fetchImpl(`${apiBaseUrl}/v1/workspaces/${encodeURIComponent(workspaceId)}/runtime/llm-config`, {
            method: 'PUT',
            headers: {
                Authorization: authHeader,
                'content-type': 'application/json',
            },
            body: JSON.stringify(payload),
            cache: 'no-store',
        });

        const body = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse LLM config response.',
        }));

        return {
            status: response.status,
            body,
        };
    } catch {
        return {
            status: 503,
            body: {
                error: 'upstream_unavailable',
                message: getUpstreamUnavailableMessage(),
            },
        };
    }
}
