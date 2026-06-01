import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const targetUrl = `${getApiBaseUrl()}/api/v1/leads/${id}/status`;

    try {
        const response = await fetch(targetUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: authHeader },
            body: JSON.stringify(body),
            cache: 'no-store',
        });
        const resBody = await response.json().catch(() => ({ error: 'upstream_error' }));
        return NextResponse.json(resBody, { status: response.status });
    } catch {
        return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
    }
}
