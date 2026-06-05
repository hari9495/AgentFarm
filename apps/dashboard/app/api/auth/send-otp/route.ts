import { NextResponse } from 'next/server';
import { generateOtp, INTERNAL_DOMAIN } from '../_otp-store';

export async function POST(request: Request) {
    let body: { email?: string };
    try {
        body = (await request.json()) as { email?: string };
    } catch {
        return NextResponse.json({ error: 'invalid_request', message: 'Invalid JSON body.' }, { status: 400 });
    }

    const email = (body.email ?? '').trim().toLowerCase();
    if (!email) {
        return NextResponse.json({ error: 'email_required', message: 'Email is required.' }, { status: 400 });
    }

    if (!email.endsWith(`@${INTERNAL_DOMAIN}`)) {
        return NextResponse.json(
            { error: 'not_internal', message: `Only @${INTERNAL_DOMAIN} email addresses can sign up.` },
            { status: 403 },
        );
    }

    const result = await generateOtp(email);

    if ('cooldown' in result) {
        return NextResponse.json(
            { error: 'rate_limited', message: `Please wait ${result.cooldown}s before requesting another code.` },
            { status: 429 },
        );
    }

    // In production: send result.code via your email / notification service.
    // In development: printed to the server console so you can test locally.
    console.info(`[OTP] ${email} → ${result.code}`);

    return NextResponse.json({ success: true });
}
