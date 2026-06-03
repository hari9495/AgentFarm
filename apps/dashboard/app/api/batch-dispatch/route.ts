import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const upstream = new URL(`${getApiBaseUrl()}/v1/agents/batch-dispatch`);
    for (const [k, v] of searchParams) upstream.searchParams.set(k, v);

    const res = await fetch(upstream.toString(), { headers: { Authorization: authHeader }, cache: 'no-store' });
    const body = await res.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(body, { status: res.status });
}

export async function POST(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    let payload: unknown;
    try { payload = await request.json(); } catch {
        return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    const res = await fetch(`${getApiBaseUrl()}/v1/agents/batch-dispatch`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
    });
    const body = await res.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(body, { status: res.status });
}
