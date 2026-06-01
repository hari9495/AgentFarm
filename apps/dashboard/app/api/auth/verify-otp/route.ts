import { NextResponse } from 'next/server';
import { verifyOtp } from '../_otp-store';

const MESSAGES = {
    invalid: 'Invalid code. Please check and try again.',
    expired: 'Code has expired. Please request a new one.',
    too_many_attempts: 'Too many failed attempts. Please request a new code.',
} as const;

export async function POST(request: Request) {
    let body: { email?: string; code?: string };
    try {
        body = (await request.json()) as { email?: string; code?: string };
    } catch {
        return NextResponse.json({ error: 'invalid_request', message: 'Invalid JSON body.' }, { status: 400 });
    }

    const email = (body.email ?? '').trim().toLowerCase();
    const code = (body.code ?? '').trim();

    if (!email || !code) {
        return NextResponse.json(
            { error: 'missing_fields', message: 'Email and code are required.' },
            { status: 400 },
        );
    }

    const result = verifyOtp(email, code);

    if (result === 'valid') {
        return NextResponse.json({ success: true });
    }

    return NextResponse.json(
        { error: result, message: MESSAGES[result] },
        { status: 400 },
    );
}
