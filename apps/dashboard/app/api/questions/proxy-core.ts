type RouteResult = {
    status: number;
    body: unknown;
};

export type QuestionsGetInput = {
    requestUrl: string;
    authHeader: string | null;
    apiBaseUrl: string;
    fetchImpl?: typeof fetch;
};

export async function proxyQuestionsGet(input: QuestionsGetInput): Promise<RouteResult> {
    const { requestUrl, authHeader, apiBaseUrl, fetchImpl = fetch } = input;

    if (!authHeader) {
        return {
            status: 403,
            body: { error: 'forbidden', message: 'Internal session required.' },
        };
    }

    const url = new URL(requestUrl);
    const workspaceId = url.searchParams.get('workspaceId')?.trim();
    const tenantId = url.searchParams.get('tenantId')?.trim();

    if (!workspaceId || !tenantId) {
        return {
            status: 400,
            body: {
                error: 'invalid_request',
                message: 'workspaceId and tenantId are required.',
            },
        };
    }

    const upstreamUrl = `${apiBaseUrl}/v1/workspaces/${encodeURIComponent(workspaceId)}/questions/pending`;

    try {
        const response = await fetchImpl(upstreamUrl, {
            headers: {
                Authorization: authHeader,
            },
            cache: 'no-store',
        });

        const body = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse questions response.',
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
                message: 'Dashboard API upstream is unavailable.',
            },
        };
    }
}
