import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader, getSessionPayload } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

type SubscriptionResponse = {
    status: string;
    expiresAt?: string | null;
    gracePeriodDays?: number;
    suspendedAt?: string | null;
    daysUntilSuspension?: number | null;
};

export async function GET() {
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

    let res: Response;
    try {
        res = await fetch(
            `${getApiBaseUrl()}/v1/billing/subscription?tenantId=${encodeURIComponent(tenantId)}`,
            { headers: { Authorization: authHeader }, cache: 'no-store' },
        );
    } catch {
        return NextResponse.json(
            { error: 'upstream_error', message: 'Failed to reach billing service.' },
            { status: 502 },
        );
    }

    if (!res.ok) {
        return NextResponse.json<SubscriptionResponse>({ status: 'none' });
    }

    const data = (await res.json()) as SubscriptionResponse;
    return NextResponse.json(data);
}
