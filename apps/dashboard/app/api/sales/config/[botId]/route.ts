import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ botId: string }> },
): Promise<Response> {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const { botId } = await params;
    const targetUrl = `${getApiBaseUrl()}/v1/sales/config/${encodeURIComponent(botId)}`;

    try {
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: { Authorization: authHeader },
            cache: 'no-store',
        });
        const data = await response.json().catch(() => ({ error: 'upstream_error' }));
        return NextResponse.json(data, { status: response.status });
    } catch {
        return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
    }
}

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ botId: string }> },
): Promise<Response> {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const { botId } = await params;
    const targetUrl = `${getApiBaseUrl()}/v1/sales/config/${encodeURIComponent(botId)}`;

    try {
        const body = await request.json().catch(() => ({}));
        const response = await fetch(targetUrl, {
            method: 'PUT',
            headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            cache: 'no-store',
        });
        const data = await response.json().catch(() => ({ error: 'upstream_error' }));
        return NextResponse.json(data, { status: response.status });
    } catch {
        return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
    }
}
