import { NextResponse } from 'next/server';

type LoginPayload = {
    email?: string;
    password?: string;
};

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(request: Request) {
    let payload: LoginPayload;

    try {
        payload = (await request.json()) as LoginPayload;
    } catch {
        return NextResponse.json(
            { error: 'invalid_request', message: 'Invalid JSON body.' },
            { status: 400 },
        );
    }

    const email = payload.email?.trim();
    const password = payload.password;

    if (!email || !password) {
        return NextResponse.json(
            { error: 'validation_failed', message: 'Email and password are required.' },
            { status: 400 },
        );
    }

    const response = await fetch(`${getApiBaseUrl()}/auth/internal-login`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
        cache: 'no-store',
    });

    const body = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse login response.',
    }));

    return NextResponse.json(body, { status: response.status });
}
