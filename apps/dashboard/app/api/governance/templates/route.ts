import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    const { searchParams } = new URL(request.url);
    const qs = searchParams.toString();

    const response = await fetch(
        `${getApiBaseUrl()}/v1/governance/workflows/templates${qs ? `?${qs}` : ''}`,
        {
            method: 'GET',
            headers: { Authorization: authHeader },
            cache: 'no-store',
        },
    );

    const body = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse templates response.',
    }));

    return NextResponse.json(body, { status: response.status });
}

export async function POST(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: 'invalid_request', message: 'Request body must be valid JSON.' },
            { status: 400 },
        );
    }

    const response = await fetch(
        `${getApiBaseUrl()}/v1/governance/workflows/templates`,
        {
            method: 'POST',
            headers: { 'content-type': 'application/json', Authorization: authHeader },
            body: JSON.stringify(body),
            cache: 'no-store',
        },
    );

    const data = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse response.',
    }));

    return NextResponse.json(data, { status: response.status });
}
