import { NextResponse } from 'next/server';

const getApiBaseUrl = (): string => process.env['DASHBOARD_API_BASE_URL'] ?? 'http://localhost:3000';
const getSharedToken = (): string =>
    process.env['PASSWORDLESS_LOGIN_SHARED_TOKEN'] ?? 'dev-passwordless-token';

/**
 * POST /api/auth/passwordless-login
 *
 * Called by the login page after OTP verification succeeds (OTP login mode).
 * Forwards to the API gateway with the PASSWORDLESS_LOGIN_SHARED_TOKEN bearer token.
 * The API gateway creates and returns an internal-scope session token.
 */
export async function POST(request: Request) {
    let body: { email?: string };
    try {
        body = (await request.json()) as { email?: string };
    } catch {
        return NextResponse.json({ error: 'invalid_request', message: 'Invalid JSON body.' }, { status: 400 });
    }

    const email = (body.email ?? '').trim().toLowerCase();
    if (!email) {
        return NextResponse.json({ error: 'validation_failed', message: 'Email is required.' }, { status: 400 });
    }

    const res = await fetch(`${getApiBaseUrl()}/auth/passwordless-login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getSharedToken()}`,
        },
        body: JSON.stringify({ email }),
        cache: 'no-store',
    }).catch(() => null);

    if (!res) {
        return NextResponse.json(
            { error: 'upstream_unreachable', message: 'Cannot reach authentication service.' },
            { status: 503 },
        );
    }

    const data = await res.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(data, { status: res.status });
}
