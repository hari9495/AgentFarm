type RouteResult = {
    status: number;
    body: unknown;
};

const getUpstreamUnavailableMessage = (): string => 'Dashboard API upstream is unavailable; serving fallback budget limits.';

export type BudgetLimitsGetInput = {
    workspaceId: string;
    authHeader: string | null;
    fetchImpl?: typeof fetch;
    apiBaseUrl: string;
};

export type BudgetLimitsPutInput = {
    workspaceId: string;
    authHeader: string | null;
    payload: unknown;
    fetchImpl?: typeof fetch;
    apiBaseUrl: string;
};

export async function proxyBudgetLimitsGet(input: BudgetLimitsGetInput): Promise<RouteResult> {
    const { workspaceId, authHeader, fetchImpl = fetch, apiBaseUrl } = input;

    if (!authHeader) {
        return {
            status: 403,
            body: { error: 'forbidden', message: 'Internal session required.' },
        };
    }

    try {
        const response = await fetchImpl(`${apiBaseUrl}/v1/workspaces/${encodeURIComponent(workspaceId)}/budget/limits`, {
            method: 'GET',
            headers: {
                Authorization: authHeader,
            },
            cache: 'no-store',
        });

        const body = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse budget limit response.',
        }));

        return {
            status: response.status,
            body,
        };
    } catch {
        return {
            status: 200,
            body: {
                workspaceId,
                message: getUpstreamUnavailableMessage(),
                source: 'fallback',
            },
        };
    }
}

export async function proxyBudgetLimitsPut(input: BudgetLimitsPutInput): Promise<RouteResult> {
    const { workspaceId, authHeader, payload, fetchImpl = fetch, apiBaseUrl } = input;

    if (!authHeader) {
        return {
            status: 403,
            body: { error: 'forbidden', message: 'Internal session required.' },
        };
    }

    try {
        const response = await fetchImpl(`${apiBaseUrl}/v1/workspaces/${encodeURIComponent(workspaceId)}/budget/limits`, {
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
            message: 'Unable to parse budget limit response.',
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
