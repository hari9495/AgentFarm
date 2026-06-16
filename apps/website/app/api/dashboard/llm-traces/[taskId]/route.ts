import { NextResponse } from 'next/server';
import { getPortalSessionFromRequest, extractPortalTokenFromRequest } from '@/lib/portal-api-auth';

export const dynamic = 'force-dynamic';

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:3000';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ taskId: string }> },
) {
    const session = await getPortalSessionFromRequest(request);
    if (!session) {
        return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    const token = extractPortalTokenFromRequest(request);
    const { taskId } = await params;

    try {
        const res = await fetch(
            `${GATEWAY_URL}/v1/observability/llm-traces/${encodeURIComponent(taskId)}`,
            { headers: { cookie: `portal_session=${token}` }, cache: 'no-store' },
        );
        const body = await res.json().catch(() => ({}));
        return NextResponse.json(body, { status: res.status });
    } catch {
        return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
    }
}
