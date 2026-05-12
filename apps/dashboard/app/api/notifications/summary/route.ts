import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Internal session required.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);

    const response = await fetch(
        `${getApiBaseUrl()}/v1/notifications/summary?${searchParams.toString()}`,
        {
            method: 'GET',
            headers: { Authorization: authHeader },
            cache: 'no-store',
        },
    );

    const body = await response.json().catch(() => ({ error: 'upstream_error', message: 'Unable to parse notifications summary response.' }));
    return NextResponse.json(body, { status: response.status });
}
