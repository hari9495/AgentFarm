import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader, getSessionPayload } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    const session = await getSessionPayload();
    const tenantId = session?.tenantId;
    if (!tenantId) {
        return NextResponse.json(
            { error: 'bad_request', message: 'tenantId not found in session.' },
            { status: 400 },
        );
    }

    const url = new URL(request.url);
    const from = url.searchParams.get('from') ?? undefined;
    const to = url.searchParams.get('to') ?? undefined;

    const params = new URLSearchParams({ tenantId });
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    let res: Response;
    try {
        res = await fetch(
            `${getApiBaseUrl()}/v1/billing/metering/period?${params.toString()}`,
            { headers: { Authorization: authHeader }, cache: 'no-store' },
        );
    } catch {
        return NextResponse.json(
            { error: 'upstream_error', message: 'Failed to reach billing service.' },
            { status: 502 },
        );
    }

    if (!res.ok) {
        return NextResponse.json(
            { error: 'upstream_error', message: 'Billing metering service returned an error.' },
            { status: res.status },
        );
    }

    const data = (await res.json()) as unknown;
    return NextResponse.json(data);
}
