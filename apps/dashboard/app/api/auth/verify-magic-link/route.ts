import { NextResponse } from 'next/server';
import { consumeMagicToken } from '../_magic-link-store';

const getApiBaseUrl = (): string => process.env['DASHBOARD_API_BASE_URL'] ?? 'http://localhost:3000';
const getSharedToken = (): string =>
    process.env['PASSWORDLESS_LOGIN_SHARED_TOKEN'] ?? 'dev-passwordless-token';

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
        return NextResponse.redirect(`${origin}/login?error=invalid_link`);
    }

    const result = consumeMagicToken(token);

    if ('error' in result) {
        return NextResponse.redirect(`${origin}/login?error=${result.error}`);
    }

    // Exchange verified email for a session token via the API gateway
    let sessionToken: string | undefined;
    try {
        const loginRes = await fetch(`${getApiBaseUrl()}/auth/passwordless-login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${getSharedToken()}`,
            },
            body: JSON.stringify({ email: result.email }),
            cache: 'no-store',
        });

        if (loginRes.ok) {
            const data = (await loginRes.json()) as { token?: string };
            sessionToken = data.token;
        }
    } catch {
        // fall through to redirect with error
    }

    if (!sessionToken) {
        return NextResponse.redirect(`${origin}/login?error=login_failed`);
    }

    const response = NextResponse.redirect(`${origin}/`);
    response.cookies.set('agentfarm_internal_session', encodeURIComponent(sessionToken), {
        path: '/',
        sameSite: 'strict',
        maxAge: 28800,
        httpOnly: false,
    });
    return response;
}
