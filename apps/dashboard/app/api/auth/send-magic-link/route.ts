import { NextResponse } from 'next/server';
import { generateMagicToken } from '../_magic-link-store';
import { INTERNAL_DOMAIN } from '../_otp-store';

const getDashboardBaseUrl = (): string =>
    process.env['NEXT_PUBLIC_DASHBOARD_URL'] ??
    process.env['NEXT_PUBLIC_SITE_URL'] ??
    'http://localhost:3001';

async function deliverMagicLink(email: string, link: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.OTP_FROM_EMAIL ?? `noreply@${INTERNAL_DOMAIN}`;

    if (!apiKey) {
        console.info(`[MAGIC LINK] ${email} → ${link}`);
        return;
    }

    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);

    const { error } = await resend.emails.send({
        from: fromAddress,
        to: email,
        subject: 'Your AgentFarms magic link',
        html: `
            <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px">
              <h2 style="color:#1a1a2e;margin-bottom:8px">Sign in to AgentFarms</h2>
              <p style="color:#555;margin-bottom:24px">
                Click the button below to sign in. This link expires in 15 minutes.
              </p>
              <a href="${link}"
                 style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;
                        padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px">
                Sign in →
              </a>
              <p style="color:#888;font-size:13px;margin-top:24px">
                Or copy this link:<br/>
                <a href="${link}" style="color:#4f46e5;word-break:break-all">${link}</a>
              </p>
              <p style="color:#bbb;font-size:12px;margin-top:16px">
                If you didn't request this, you can ignore this email.
              </p>
            </div>
        `,
        text: `Sign in to AgentFarms:\n\n${link}\n\nThis link expires in 15 minutes.`,
    });

    if (error) {
        console.error('[MAGIC LINK] Resend delivery failed:', error.message);
        console.info(`[MAGIC LINK FALLBACK] ${email} → ${link}`);
    }
}

export async function POST(request: Request) {
    let body: { email?: string };
    try {
        body = (await request.json()) as { email?: string };
    } catch {
        return NextResponse.json({ message: 'Invalid request body.' }, { status: 400 });
    }

    const email = (body.email ?? '').trim().toLowerCase();

    if (!email) {
        return NextResponse.json({ message: 'Email is required.' }, { status: 400 });
    }

    if (!email.endsWith(`@${INTERNAL_DOMAIN}`)) {
        return NextResponse.json(
            { message: `Only @${INTERNAL_DOMAIN} addresses are allowed.` },
            { status: 403 },
        );
    }

    const token = await generateMagicToken(email);
    const link = `${getDashboardBaseUrl()}/api/auth/verify-magic-link?token=${token}`;

    await deliverMagicLink(email, link);

    return NextResponse.json({ success: true });
}
