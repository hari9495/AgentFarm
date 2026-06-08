import { NextResponse } from 'next/server';
import { generateOtp, INTERNAL_DOMAIN, isAllowedEmail } from '../_otp-store';
import { sendEmail } from '../_mailer';

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

    if (!isAllowedEmail(email)) {
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

    const code = result.code;

    // Always log to console so the dev-otp-peek endpoint + ops can read it
    console.info(`[OTP] ${email} → ${code}`);

    await sendEmail({
        to: email,
        subject: 'Your AgentFarms login code',
        html: `
            <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px">
              <h2 style="color:#1a1a2e;margin-bottom:8px">Your login code</h2>
              <p style="color:#555;margin-bottom:24px">
                Use this 6-digit code to sign in to AgentFarms Dashboard.
                It expires in <strong>5 minutes</strong>.
              </p>
              <div style="background:#f4f4f8;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
                <span style="font-size:40px;font-weight:700;letter-spacing:10px;color:#1a1a2e;font-family:monospace">
                  ${code}
                </span>
              </div>
              <p style="color:#888;font-size:13px">
                If you didn't request this code, you can safely ignore this email.
              </p>
            </div>
        `,
        text: `Your AgentFarms login code is: ${code}\n\nThis code expires in 5 minutes.\n\nIf you didn't request this, ignore this email.`,
    });

    return NextResponse.json({ success: true });
}
