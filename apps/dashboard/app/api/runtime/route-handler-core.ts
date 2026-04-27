export type RuntimeProxyResult = {
    status: number;
    body: unknown;
};

type RuntimeProxyOptions = {
    sessionAuthHeader: string | null;
    upstreamUrl: string;
    requestInit: RequestInit;
    fetchImpl?: typeof fetch;
};

export const runRuntimeProxy = async ({
    sessionAuthHeader,
    upstreamUrl,
    requestInit,
    fetchImpl = fetch,
}: RuntimeProxyOptions): Promise<RuntimeProxyResult> => {
    if (!sessionAuthHeader) {
        return {
            status: 401,
            body: { error: 'unauthorized', message: 'Missing session cookie.' },
        };
    }

    try {
        const response = await fetchImpl(upstreamUrl, requestInit);
        if (!response.ok) {
            return {
                status: response.status,
                body: { error: 'runtime_error', message: `Runtime returned ${response.status}` },
            };
        }

        const data: unknown = await response.json();
        return {
            status: 200,
            body: data,
        };
    } catch {
        return {
            status: 503,
            body: { error: 'runtime_unreachable', message: 'Agent runtime is not reachable.' },
        };
    }
};
