import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getInternalSessionAuthHeader, getSessionPayload } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET() {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const session = await getSessionPayload();
    if (!session?.tenantId) return NextResponse.json({ error: 'no_session' }, { status: 401 });

    const params = new URLSearchParams({ tenantId: session.tenantId });
    if (session.workspaceIds?.[0]) params.set('workspaceId', session.workspaceIds[0]);

    const res = await fetch(`${getApiBaseUrl()}/v1/webhooks/inbound/sources?${params.toString()}`, {
        headers: { Authorization: authHeader },
        cache: 'no-store',
    });

    const body = await res.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(body, { status: res.status });
}

export async function POST(request: NextRequest) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const session = await getSessionPayload();
    if (!session?.tenantId) return NextResponse.json({ error: 'no_session' }, { status: 401 });

    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;

    const res = await fetch(`${getApiBaseUrl()}/v1/webhooks/inbound/sources`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, tenantId: session.tenantId, workspaceId: session.workspaceIds?.[0] }),
        cache: 'no-store',
    });

    const body = await res.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(body, { status: res.status });
}
