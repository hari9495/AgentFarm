import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getInternalSessionAuthHeader, getSessionPayload } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(request: NextRequest) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Internal session required.' }, { status: 403 });
    }
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        return NextResponse.json({ error: 'bad_request', message: 'tenantId required.' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const params = new URLSearchParams();
    for (const key of ['tenantId', 'dataset', 'q', 'hours', 'limit']) {
        const v = searchParams.get(key);
        if (v) params.set(key, v);
    }

    let res: Response;
    try {
        res = await fetch(`${getApiBaseUrl()}/v1/observability/infra-logs?${params.toString()}`, {
            headers: { Authorization: authHeader },
            cache: 'no-store',
        });
    } catch {
        return NextResponse.json({ error: 'upstream_error', message: 'Failed to reach observability service.' }, { status: 502 });
    }
    const body = await res.json().catch(() => ({}));
    return NextResponse.json(body, { status: res.status });
}
