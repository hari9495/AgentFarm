import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(request: NextRequest) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    const { searchParams } = new URL(request.url);
    const resolved = searchParams.get('resolved') ?? 'false';
    const upstreamUrl = new URL(`${getApiBaseUrl()}/v1/webhooks/dlq`);
    upstreamUrl.searchParams.set('resolved', resolved);

    let res: Response;
    try {
        res = await fetch(upstreamUrl.toString(), {
            headers: { Authorization: authHeader },
            cache: 'no-store',
        });
    } catch {
        return NextResponse.json(
            { error: 'upstream_error', message: 'Failed to reach webhook service.' },
            { status: 502 },
        );
    }

    const data = await res.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(data, { status: res.status });
}
