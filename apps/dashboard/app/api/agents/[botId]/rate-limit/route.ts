import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session.js';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ botId: string }> },
): Promise<Response> {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const { botId } = await params;
    const targetUrl = `${getApiBaseUrl()}/v1/agents/${botId}/rate-limit`;

    try {
        const response = await fetch(targetUrl, {
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

export async function POST(
    request: Request,
    { params }: { params: Promise<{ botId: string }> },
): Promise<Response> {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const { botId } = await params;
    const targetUrl = `${getApiBaseUrl()}/v1/agents/${botId}/rate-limit`;

    try {
        const bodyText = await request.text();
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                Authorization: authHeader,
                'Content-Type': 'application/json',
            },
            body: bodyText,
            cache: 'no-store',
        });
        const body = await response.json().catch(() => ({ error: 'upstream_error' }));
        return NextResponse.json(body, { status: response.status });
    } catch {
        return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ botId: string }> },
): Promise<Response> {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const { botId } = await params;
    const targetUrl = `${getApiBaseUrl()}/v1/agents/${botId}/rate-limit`;

    try {
        const bodyText = await request.text();
        const response = await fetch(targetUrl, {
            method: 'PATCH',
            headers: {
                Authorization: authHeader,
                'Content-Type': 'application/json',
            },
            body: bodyText,
            cache: 'no-store',
        });
        const body = await response.json().catch(() => ({ error: 'upstream_error' }));
        return NextResponse.json(body, { status: response.status });
    } catch {
        return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
    }
}
