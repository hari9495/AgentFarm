import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    const body = await request.text();
    const response = await fetch(`${getApiBaseUrl()}/v1/connectors/health/check`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body,
        cache: 'no-store',
    });

    const data = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse health check response.',
    }));
    return NextResponse.json(data, { status: response.status });
}
