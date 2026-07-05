/**
 * DEV-ONLY endpoint — reads the current OTP from the store for local testing
 * (e.g. when no SMTP is configured and the code is only logged).
 *
 * HARD-DISABLED in production: returns 404 regardless of secret. This endpoint
 * can read a live OTP, so leaving it reachable in prod would be a 2FA-bypass if
 * API_SESSION_SECRET ever leaked. The secret check is a second layer for the
 * non-production case only.
 *
 * GET /api/auth/dev-otp-peek?email=info@agentfarms.in   (header: x-dev-secret)
 */
import { NextResponse } from 'next/server';
import { getRedisClient } from '@agentfarm/redis-client';

const g = globalThis as typeof globalThis & {
    __otpStore?: Map<string, { code: string; expiresAt: number; sentAt: number; attempts: number }>;
};

export async function GET(request: Request) {
    // Never reachable in production — an OTP-peek must not ship live.
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    // Second layer (non-prod): a shared secret so the code isn't readable by
    // anyone who can reach the dev server.
    const secret = process.env.API_SESSION_SECRET ?? '';
    const auth = request.headers.get('x-dev-secret') ?? '';
    if (!secret || auth !== secret) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // ?env=1 — dump relevant env vars for debugging
    const url = new URL(request.url);
    if (url.searchParams.get('env') === '1') {
        return NextResponse.json({
            DASHBOARD_ALLOWED_DOMAINS: process.env.DASHBOARD_ALLOWED_DOMAINS ?? '(not set)',
            DASHBOARD_PRIMARY_DOMAIN: process.env.DASHBOARD_PRIMARY_DOMAIN ?? '(not set)',
            SMTP_HOST: process.env.SMTP_HOST ?? '(not set)',
            SMTP_USER: process.env.SMTP_USER ?? '(not set)',
        });
    }

    const email = url.searchParams.get('email')?.toLowerCase() ?? '';
    if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

    const redis = getRedisClient();
    if (redis) {
        const raw = await redis.get(`otp:${email}`);
        if (!raw) return NextResponse.json({ error: 'no otp found' }, { status: 404 });
        const entry = JSON.parse(raw);
        return NextResponse.json({ code: entry.code, expiresAt: new Date(entry.expiresAt).toISOString() });
    }

    const entry = g.__otpStore?.get(email);
    if (!entry) return NextResponse.json({ error: 'no otp found' }, { status: 404 });
    return NextResponse.json({ code: entry.code, expiresAt: new Date(entry.expiresAt).toISOString() });
}
