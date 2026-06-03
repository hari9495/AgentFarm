import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

type Params = { params: Promise<{ botId: string }> };

export async function GET(_req: Request, { params }: Params) {
    const { botId } = await params;
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const res = await fetch(`${getApiBaseUrl()}/v1/agents/${encodeURIComponent(botId)}/budget`, {
        headers: { Authorization: authHeader },
        cache: 'no-store',
    });
    const body = await res.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(body, { status: res.status });
}

export async function PUT(request: Request, { params }: Params) {
    const { botId } = await params;
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    let payload: unknown;
    try { payload = await request.json(); } catch {
        return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    const res = await fetch(`${getApiBaseUrl()}/v1/agents/${encodeURIComponent(botId)}/budget`, {
        method: 'PUT',
        headers: { Authorization: authHeader, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
    });
    const body = await res.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(body, { status: res.status });
}

export async function DELETE(_req: Request, { params }: Params) {
    const { botId } = await params;
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const res = await fetch(`${getApiBaseUrl()}/v1/agents/${encodeURIComponent(botId)}/budget`, {
        method: 'DELETE',
        headers: { Authorization: authHeader },
        cache: 'no-store',
    });
    if (res.status === 204) return new NextResponse(null, { status: 204 });
    const body = await res.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(body, { status: res.status });
}
