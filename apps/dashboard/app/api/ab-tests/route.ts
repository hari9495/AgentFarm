import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getInternalSessionAuthHeader } from '../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET() {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    let res: Response;
    try {
        res = await fetch(`${getApiBaseUrl()}/v1/ab-tests`, {
            headers: { Authorization: authHeader },
            cache: 'no-store',
        });
    } catch {
        return NextResponse.json(
            { error: 'upstream_error', message: 'Failed to reach A/B test service.' },
            { status: 502 },
        );
    }

    const data = await res.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(data, { status: res.status });
}

export async function POST(request: NextRequest) {
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
            { error: 'bad_request', message: 'Invalid JSON body.' },
            { status: 400 },
        );
    }

    let res: Response;
    try {
        res = await fetch(`${getApiBaseUrl()}/v1/ab-tests`, {
            method: 'POST',
            headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            cache: 'no-store',
        });
    } catch {
        return NextResponse.json(
            { error: 'upstream_error', message: 'Failed to reach A/B test service.' },
            { status: 502 },
        );
    }

    const data = await res.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(data, { status: res.status });
}
