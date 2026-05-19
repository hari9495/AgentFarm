import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const { id } = await params;
    const targetUrl = `${getApiBaseUrl()}/v1/sales/deals/${id}/close-lost`;

    try {
        const body = await request.json().catch(() => ({}));
        const response = await fetch(targetUrl, {
            method: 'POST',
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
