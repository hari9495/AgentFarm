import { NextResponse } from 'next/server';

/**
 * Public liveness probe — no auth required.
 * Used by E2E global-setup to verify the dashboard process is running
 * before Playwright tests start polling authenticated routes.
 */
export async function GET() {
    return NextResponse.json({ status: 'ok' });
}
