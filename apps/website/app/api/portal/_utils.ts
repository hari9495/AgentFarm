export const GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:3000';

/**
 * Forward a request to the api-gateway portal data endpoint, passing the
 * portal_session cookie from the browser through to the gateway.
 *
 * The gateway handles portal session verification and tenant scoping.
 */
export async function portalProxy(
    request: Request,
    path: string,
    options?: { method?: string; body?: unknown },
): Promise<Response> {
    const cookie = request.headers.get('cookie') ?? '';
    const method = options?.method ?? 'GET';

    const fetchOptions: RequestInit = {
        method,
        headers: {
            'content-type': 'application/json',
            cookie,
        },
    };

    if (options?.body !== undefined) {
        (fetchOptions.headers as Record<string, string>)['content-type'] = 'application/json';
        fetchOptions.body = JSON.stringify(options.body);
    }

    return fetch(`${GATEWAY_URL}${path}`, fetchOptions);
}
