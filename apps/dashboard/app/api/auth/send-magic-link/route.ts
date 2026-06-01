import { NextResponse } from 'next/server';
import { generateMagicToken } from '../_magic-link-store';
import { INTERNAL_DOMAIN } from '../_otp-store';

const getDashboardBaseUrl = (): string =>
    process.env['NEXT_PUBLIC_DASHBOARD_URL'] ?? 'http://localhost:3001';

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

    const token = generateMagicToken(email);
    const link = `${getDashboardBaseUrl()}/api/auth/verify-magic-link?token=${token}`;

    // In production: send via email service.
    // In development: log to server console so developers can copy the link.
    console.info(`[MAGIC LINK] ${email} → ${link}`);

    return NextResponse.json({ success: true });
}
