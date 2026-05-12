import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../lib/internal-session';

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
    const params = searchParams.toString();

    const response = await fetch(
        `${getApiBaseUrl()}/v1/chat/sessions${params ? `?${params}` : ''}`,
        {
            headers: { Authorization: authHeader },
            cache: 'no-store',
        },
    );

    const body = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse response.',
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

    const body = await request.json().catch(() => null);
    if (!body) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'Invalid JSON body.' },
            { status: 400 },
        );
    }

    const response = await fetch(`${getApiBaseUrl()}/v1/chat/sessions`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            Authorization: authHeader,
        },
        body: JSON.stringify(body),
        cache: 'no-store',
    });

    const data = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse response.',
    }));

    return NextResponse.json(data, { status: response.status });
}
