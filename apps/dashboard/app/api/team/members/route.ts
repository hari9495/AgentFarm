import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET() {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Internal session required.' }, { status: 403 });
    }
    const response = await fetch(`${getApiBaseUrl()}/v1/team/members`, {
        method: 'GET',
        headers: { Authorization: authHeader },
        cache: 'no-store',
    });
    const body = await response.json().catch(() => ({ error: 'upstream_error', message: 'Unable to parse team members response.' }));
    return NextResponse.json(body, { status: response.status });
}

export async function POST(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Internal session required.' }, { status: 403 });
    }
    const bodyText = await request.text();
    const response = await fetch(`${getApiBaseUrl()}/v1/team/invite`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: bodyText,
    });
    const body = await response.json().catch(() => ({ error: 'upstream_error', message: 'Unable to parse invite response.' }));
    return NextResponse.json(body, { status: response.status });
}
