import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader, getSessionPayload } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Internal session required.' }, { status: 403 });
    }
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        return NextResponse.json({ error: 'invalid_session', message: 'Unable to resolve tenantId.' }, { status: 400 });
    }
    const { searchParams } = new URL(request.url);
    const upstream = `${getApiBaseUrl()}/v1/governance/role-baseline-blocks?${searchParams.toString()}`;
    const response = await fetch(upstream, { headers: { Authorization: authHeader }, cache: 'no-store' });
    const body = await response.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(body, { status: response.status });
}
