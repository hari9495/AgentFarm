/**
 * API Playground proxy — forwards authenticated requests to the API gateway.
 * The playground sends { method, path, body } and this proxy:
 *   1. Adds the internal session auth header
 *   2. Forwards to the gateway
 *   3. Returns status + headers + body to the client
 */

import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export async function POST(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Internal session required.' }, { status: 403 });
    }

    let payload: { method?: string; path?: string; body?: unknown; queryParams?: Record<string, string> };
    try {
        payload = (await request.json()) as typeof payload;
    } catch {
        return NextResponse.json({ error: 'invalid_request', message: 'Invalid JSON body.' }, { status: 400 });
    }

    const method = (payload.method ?? 'GET').toUpperCase();
    if (!ALLOWED_METHODS.has(method)) {
        return NextResponse.json({ error: 'invalid_method' }, { status: 400 });
    }

    const path = payload.path?.trim();
    if (!path || !path.startsWith('/')) {
        return NextResponse.json({ error: 'invalid_path', message: 'path must start with /' }, { status: 400 });
    }

    // Build upstream URL
    const upstreamUrl = new URL(`${getApiBaseUrl()}${path}`);
    if (payload.queryParams) {
        for (const [k, v] of Object.entries(payload.queryParams)) {
            if (v !== '' && v !== undefined) upstreamUrl.searchParams.set(k, String(v));
        }
    }

    const startMs = Date.now();

    let res: Response;
    try {
        res = await fetch(upstreamUrl.toString(), {
            method,
            headers: {
                Authorization: authHeader,
                'content-type': 'application/json',
            },
            ...(method !== 'GET' && method !== 'DELETE' && payload.body !== undefined
                ? { body: JSON.stringify(payload.body) }
                : {}),
            cache: 'no-store',
            signal: AbortSignal.timeout(15_000),
        });
    } catch (err) {
        return NextResponse.json({
            error: 'request_failed',
            message: err instanceof Error ? err.message : 'Request failed',
            duration_ms: Date.now() - startMs,
        }, { status: 502 });
    }

    const durationMs = Date.now() - startMs;

    // Try to parse body as JSON; fall back to text
    let responseBody: unknown;
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
        responseBody = await res.json().catch(() => null);
    } else {
        responseBody = await res.text().catch(() => '');
    }

    return NextResponse.json({
        status: res.status,
        status_text: res.statusText,
        duration_ms: durationMs,
        content_type: contentType,
        body: responseBody,
    });
}
