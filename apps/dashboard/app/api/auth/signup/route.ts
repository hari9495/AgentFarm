import { NextResponse } from 'next/server';
import { INTERNAL_DOMAIN } from '../_otp-store';

type SignupPayload = {
    name?: string;
    email?: string;
    password?: string;
    companyName?: string;
};

const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(request: Request) {
    let payload: SignupPayload;

    try {
        payload = (await request.json()) as SignupPayload;
    } catch {
        return NextResponse.json(
            { error: 'invalid_request', message: 'Invalid JSON body.' },
            { status: 400 },
        );
    }

    const name = payload.name?.trim();
    const email = payload.email?.trim().toLowerCase();
    const password = payload.password;
    const companyName = payload.companyName?.trim();

    if (!name || !email || !password) {
        return NextResponse.json(
            { error: 'validation_failed', message: 'Name, email and password are required.' },
            { status: 400 },
        );
    }

    if (!email.endsWith(`@${INTERNAL_DOMAIN}`)) {
        return NextResponse.json(
            { error: 'not_internal', message: `Only @${INTERNAL_DOMAIN} email addresses can sign up.` },
            { status: 403 },
        );
    }

    if (!STRONG_PASSWORD.test(password)) {
        return NextResponse.json(
            {
                error: 'weak_password',
                message: 'Password must be at least 8 characters and include uppercase, lowercase, a number, and a symbol.',
            },
            { status: 400 },
        );
    }

    const response = await fetch(`${getApiBaseUrl()}/auth/signup`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({ name, email, password, companyName }),
        cache: 'no-store',
    });

    const body = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse signup response.',
    }));

    return NextResponse.json(body, { status: response.status });
}
