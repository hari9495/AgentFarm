import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(request: NextRequest) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    try {
        const res = await fetch(`${getApiBaseUrl()}/v1/auth/mfa/setup/confirm`, {
            method: 'POST',
            headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            cache: 'no-store',
        });
        const data = await res.json().catch(() => ({ error: 'upstream_error' }));
        return NextResponse.json(data, { status: res.status });
    } catch {
        return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
    }
}
