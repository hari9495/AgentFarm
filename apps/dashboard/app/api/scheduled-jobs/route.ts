import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET() {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const response = await fetch(`${getApiBaseUrl()}/v1/schedules`, {
        headers: { Authorization: authHeader },
        cache: 'no-store',
    });
    const body = await response.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(body, { status: response.status });
}

export async function POST(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    let payload: unknown;
    try {
        payload = await request.json();
    } catch {
        return NextResponse.json({ error: 'invalid_request', message: 'Invalid JSON body.' }, { status: 400 });
    }

    const response = await fetch(`${getApiBaseUrl()}/v1/schedules`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
    });
    const body = await response.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(body, { status: response.status });
}
