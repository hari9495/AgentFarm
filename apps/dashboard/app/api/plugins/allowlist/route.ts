import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Internal session required.' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (body === null) {
        return NextResponse.json({ error: 'invalid_request', message: 'Request body is required.' }, { status: 400 });
    }

    const response = await fetch(
        `${getApiBaseUrl()}/v1/plugins/allowlist/upsert`,
        {
            method: 'POST',
            headers: {
                Authorization: authHeader,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            cache: 'no-store',
        },
    );

    const data = await response.json().catch(() => ({ error: 'upstream_error', message: 'Unable to parse allowlist response.' }));
    return NextResponse.json(data, { status: response.status });
}
