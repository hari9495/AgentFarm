import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = () => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const { id } = await params;

    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'invalid_request' }, { status: 400 }); }

    const response = await fetch(
        `${getApiBaseUrl()}/v1/task-templates/${encodeURIComponent(id)}/dispatch`,
        {
            method: 'POST',
            headers: { 'content-type': 'application/json', Authorization: authHeader },
            body: JSON.stringify(body),
            cache: 'no-store',
        },
    );
    const data = await response.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(data, { status: response.status });
}
