import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ botId: string }> },
) {
    const { botId } = await params;
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    let res: Response;
    try {
        res = await fetch(`${getApiBaseUrl()}/v1/disclosure/${encodeURIComponent(botId)}`, {
            headers: { Authorization: authHeader },
            cache: 'no-store',
        });
    } catch {
        return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ botId: string }> },
) {
    const { botId } = await params;
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    let res: Response;
    try {
        res = await fetch(`${getApiBaseUrl()}/v1/disclosure/${encodeURIComponent(botId)}`, {
            method: 'PATCH',
            headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    } catch {
        return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
}
