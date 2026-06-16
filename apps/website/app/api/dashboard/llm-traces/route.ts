import { NextResponse } from 'next/server';
import { getPortalSessionFromRequest, extractPortalTokenFromRequest } from '@/lib/portal-api-auth';

export const dynamic = 'force-dynamic';

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:3000';

export async function GET(request: Request) {
    const session = await getPortalSessionFromRequest(request);
    if (!session) {
        return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    const token = extractPortalTokenFromRequest(request);

    const incoming = new URL(request.url);
    const params = new URLSearchParams();
    for (const key of ['tag', 'sessionId', 'from', 'to', 'limit']) {
        const v = incoming.searchParams.get(key);
        if (v) params.set(key, v);
    }
    // tenantId is intentionally NOT forwarded — the gateway locks portal
    // sessions to their own tenant regardless of any client-supplied value.

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/observability/llm-traces?${params.toString()}`, {
            headers: { cookie: `portal_session=${token}` },
            cache: 'no-store',
        });
        const body = await res.json().catch(() => ({}));
        return NextResponse.json(body, { status: res.status });
    } catch {
        return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
    }
}
