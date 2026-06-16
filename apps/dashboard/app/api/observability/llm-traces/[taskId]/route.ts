import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getInternalSessionAuthHeader, getSessionPayload } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ taskId: string }> },
) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Internal session required.' }, { status: 403 });
    }

    const session = await getSessionPayload();
    if (!session?.tenantId) {
        return NextResponse.json({ error: 'bad_request', message: 'tenantId required.' }, { status: 400 });
    }

    const { taskId } = await params;

    let res: Response;
    try {
        res = await fetch(
            `${getApiBaseUrl()}/v1/observability/llm-traces/${encodeURIComponent(taskId)}`,
            { headers: { Authorization: authHeader }, cache: 'no-store' },
        );
    } catch {
        return NextResponse.json({ error: 'upstream_error', message: 'Failed to reach observability service.' }, { status: 502 });
    }

    const body = await res.json().catch(() => ({}));
    return NextResponse.json(body, { status: res.status });
}
