import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader, getSessionPayload } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET() {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const session = await getSessionPayload();
    const tenantId = session?.tenantId;
    if (!tenantId) {
        return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    try {
        const res = await fetch(
            `${getApiBaseUrl()}/v1/billing/orders/${encodeURIComponent(tenantId)}`,
            { headers: { Authorization: authHeader }, cache: 'no-store' },
        );
        const data = (await res.json()) as unknown;
        return NextResponse.json(data, { status: res.status });
    } catch {
        return NextResponse.json({ error: 'upstream_error', orders: [] }, { status: 502 });
    }
}
