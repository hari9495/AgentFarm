import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';

// Dev-only route — disabled in production
export async function GET() {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const secret = process.env.API_SESSION_SECRET ?? 'dev-only-secret-change-in-prod';

    const payload = {
        userId: 'dev-user-001',
        tenantId: 'dev-tenant-001',
        workspaceIds: ['dev-workspace-001'],
        scope: 'internal' as const,
        role: 'admin',
        expiresAt: Date.now() + 8 * 60 * 60 * 1000,
    };

    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = createHmac('sha256', secret).update(`v1.${encoded}`).digest('hex');
    const token = `v1.${encoded}.${signature}`;

    const response = NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3001'));
    response.cookies.set('agentfarm_internal_session', encodeURIComponent(token), {
        path: '/',
        sameSite: 'strict',
        maxAge: 28800,
        httpOnly: false,
    });

    return response;
}
