import { NextResponse } from 'next/server';
import { generateOtp, INTERNAL_DOMAIN } from '../_otp-store';

// Send OTP via Resend when RESEND_API_KEY is configured.
// Falls back to console.info for local dev without the key set.
async function deliverOtp(email: string, code: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.OTP_FROM_EMAIL ?? `noreply@${INTERNAL_DOMAIN}`;

    if (!apiKey) {
        // Dev fallback — visible in server console / dev-otp-peek endpoint
        console.info(`[OTP] ${email} → ${code}`);
        return;
    }

    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);

    const { error } = await resend.emails.send({
        from: fromAddress,
        to: email,
        subject: 'Your AgentFarms login code',
        html: `
            <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px">
              <h2 style="color:#1a1a2e;margin-bottom:8px">Your login code</h2>
              <p style="color:#555;margin-bottom:24px">
                Use this code to sign in to AgentFarms Dashboard.
                It expires in 5 minutes.
              </p>
              <div style="background:#f4f4f8;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
                <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#1a1a2e">
                  ${code}
                </span>
              </div>
              <p style="color:#888;font-size:13px">
                If you didn't request this, you can ignore this email.
              </p>
            </div>
        `,
        text: `Your AgentFarms login code is: ${code}\n\nThis code expires in 5 minutes.`,
    });

    if (error) {
        console.error('[OTP] Resend delivery failed:', error.message);
        // Log to console as fallback so ops can still unblock users
        console.info(`[OTP FALLBACK] ${email} → ${code}`);
    }
}

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

    await deliverOtp(email, result.code);

    return NextResponse.json({ success: true });
}
