import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

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
    const upstream = new URL(`${getApiBaseUrl()}/v1/webhooks/inbound/events`);
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
