import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader, getSessionPayload } from '../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    const session = await getSessionPayload();
    if (!session?.tenantId) {
        return NextResponse.json(
            { error: 'invalid_session', message: 'Unable to resolve tenantId from session.' },
            { status: 400 },
        );
    }

    const body = await request.json().catch(() => null);
    if (!body) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'Invalid JSON body.' },
            { status: 400 },
        );
    }

    const response = await fetch(`${getApiBaseUrl()}/v1/meetings`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            Authorization: authHeader,
        },
        body: JSON.stringify({ ...body, tenantId: session.tenantId }),
        cache: 'no-store',
    });

    const data = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse response.',
    }));

    return NextResponse.json(data, { status: response.status });
}
