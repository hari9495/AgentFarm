import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

/**
 * GET /api/kill-switches — list active kill-switches for the tenant
 * Proxies to GET /v1/kill-switches on the api-gateway.
 */
export async function GET(): Promise<Response> {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    try {
        const response = await fetch(`${getApiBaseUrl()}/v1/kill-switches`, {
            method: 'GET',
            headers: { Authorization: authHeader },
            cache: 'no-store',
        });
        const body = await response.json().catch(() => ({ error: 'upstream_error' }));
        return NextResponse.json(body, { status: response.status });
    } catch {
        return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
    }
}

/**
 * POST /api/kill-switches — activate a kill-switch
 * Proxies to POST /v1/kill-switches on the api-gateway.
 */
export async function POST(request: Request): Promise<Response> {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: 'invalid_request', message: 'Invalid JSON body.' }, { status: 400 });
    }

    try {
        const response = await fetch(`${getApiBaseUrl()}/v1/kill-switches`, {
            method: 'POST',
            headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            cache: 'no-store',
        });
        const responseBody = await response.json().catch(() => ({ error: 'upstream_error' }));
        return NextResponse.json(responseBody, { status: response.status });
    } catch {
        return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
    }
}
