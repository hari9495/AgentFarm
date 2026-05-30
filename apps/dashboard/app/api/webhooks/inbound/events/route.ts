import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getInternalSessionAuthHeader, getSessionPayload } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(request: NextRequest) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const session = await getSessionPayload();
    if (!session?.tenantId) return NextResponse.json({ error: 'no_session' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const upstream = new URL(`${getApiBaseUrl()}/v1/webhooks/inbound/events`);
    upstream.searchParams.set('tenantId', session.tenantId);
    if (session.workspaceIds?.[0]) upstream.searchParams.set('workspaceId', session.workspaceIds[0]);
    for (const key of ['source', 'limit', 'cursor']) {
        const val = searchParams.get(key);
        if (val !== null) upstream.searchParams.set(key, val);
    }

    const res = await fetch(upstream.toString(), {
        headers: { Authorization: authHeader },
        cache: 'no-store',
    });

    const body = await res.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(body, { status: res.status });
}
