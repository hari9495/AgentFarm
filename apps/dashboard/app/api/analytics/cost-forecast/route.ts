import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = () => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);

    try {
        const response = await fetch(
            `${getApiBaseUrl()}/v1/analytics/cost-forecast?${searchParams.toString()}`,
            { method: 'GET', headers: { Authorization: authHeader }, cache: 'no-store' },
        );
        const data = await response.json().catch(() => ({ error: 'upstream_error' }));
        return NextResponse.json(data, { status: response.status });
    } catch {
        return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
    }
}
