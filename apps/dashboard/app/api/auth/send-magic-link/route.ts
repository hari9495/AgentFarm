import { NextResponse } from 'next/server';
import { generateMagicToken } from '../_magic-link-store';
import { INTERNAL_DOMAIN } from '../_otp-store';
import { sendEmail } from '../_mailer';

const getDashboardBaseUrl = (): string =>
    process.env['NEXT_PUBLIC_DASHBOARD_URL'] ??
    process.env['NEXT_PUBLIC_SITE_URL'] ??
    'https://dashboard.agentfarms.in';

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

    // Always log for ops access
    console.info(`[MAGIC LINK] ${email} → ${link}`);

    await sendEmail({
        to: email,
        subject: 'Sign in to AgentFarms',
        html: `
            <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px">
              <h2 style="color:#1a1a2e;margin-bottom:8px">Sign in to AgentFarms</h2>
              <p style="color:#555;margin-bottom:24px">
                Click the button below to sign in to your dashboard.
                This link expires in <strong>15 minutes</strong>.
              </p>
              <a href="${link}"
                 style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;
                        padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px">
                Sign in to AgentFarms →
              </a>
              <p style="color:#888;font-size:13px;margin-top:24px">
                Or copy this link into your browser:<br/>
                <a href="${link}" style="color:#4f46e5;word-break:break-all">${link}</a>
              </p>
              <p style="color:#bbb;font-size:12px;margin-top:16px">
                If you didn't request this, you can safely ignore this email.
              </p>
            </div>
        `,
        text: `Sign in to AgentFarms:\n\n${link}\n\nThis link expires in 15 minutes.\n\nIf you didn't request this, ignore this email.`,
    });

    return NextResponse.json({ success: true });
}
