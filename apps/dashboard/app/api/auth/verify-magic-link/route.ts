import { NextResponse } from 'next/server';
import { consumeMagicToken, peekMagicToken } from '../_magic-link-store';

const getApiBaseUrl = (): string => process.env['DASHBOARD_API_BASE_URL'] ?? 'http://localhost:3000';
const getSharedToken = (): string =>
    process.env['PASSWORDLESS_LOGIN_SHARED_TOKEN'] ?? 'dev-passwordless-token';

// Use the public dashboard URL for redirects — request.url reflects the internal
// localhost address when running behind Cloudflare Tunnel or any reverse proxy.
const getPublicOrigin = (fallback: string): string =>
    process.env['NEXT_PUBLIC_DASHBOARD_URL'] ??
    process.env['NEXT_PUBLIC_SITE_URL'] ??
    fallback;

/**
 * GET /api/auth/verify-magic-link?token=xxx
 *
 * Email security scanners pre-fetch links via GET to check for phishing.
 * We must NOT consume the token on GET — instead return a confirmation page
 * requiring a real button click (POST). Scanners don't submit forms.
 */
export async function GET(request: Request) {
    const { searchParams, origin: internalOrigin } = new URL(request.url);
    const origin = getPublicOrigin(internalOrigin);
    const token = searchParams.get('token');

    if (!token) {
        return NextResponse.redirect(`${origin}/login?error=invalid_link`);
    }

    // Peek without consuming — just check if the token is still valid
    const peek = await peekMagicToken(token);
    if ('error' in peek) {
        return NextResponse.redirect(`${origin}/login?error=${peek.error}`);
    }

    // Return a confirmation page — the actual sign-in is triggered by the button (POST)
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in to AgentFarms</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      font-family: system-ui, -apple-system, sans-serif;
      background: #f5f5f7; color: #1a1a2e;
    }
    .card {
      background: #fff; border-radius: 18px; padding: 2.5rem 2rem;
      box-shadow: 0 4px 24px -8px rgba(0,0,0,0.12);
      max-width: 420px; width: 100%; text-align: center;
    }
    .badge {
      display: inline-flex; align-items: center; gap: 6px;
      background: rgba(0,102,204,0.06); border: 1px solid rgba(0,102,204,0.18);
      border-radius: 9999px; padding: 4px 12px;
      font-size: 0.72rem; font-weight: 600; letter-spacing: 0.03em;
      color: #0066cc; text-transform: uppercase; margin-bottom: 1.25rem;
    }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: #0066cc; }
    h1 { font-size: 1.6rem; font-weight: 700; margin-bottom: 0.5rem; }
    p { color: #666; font-size: 0.9rem; margin-bottom: 1.75rem; line-height: 1.5; }
    button {
      width: 100%; padding: 0.75rem 1.5rem;
      background: #4f46e5; color: #fff; border: none; border-radius: 9999px;
      font-size: 1rem; font-weight: 600; cursor: pointer;
      transition: background 150ms ease;
    }
    button:hover { background: #4338ca; }
    button:active { background: #3730a3; }
    .note { margin-top: 1.25rem; font-size: 0.78rem; color: #999; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge"><span class="dot"></span>AgentFarms Internal</div>
    <h1>Complete sign-in</h1>
    <p>Click the button below to securely sign in to your dashboard.</p>
    <form method="POST" action="/api/auth/verify-magic-link">
      <input type="hidden" name="token" value="${token}">
      <button type="submit">Sign in to AgentFarms →</button>
    </form>
    <p class="note">This link expires 15 minutes after it was requested.</p>
  </div>
</body>
</html>`;

    return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
}

/**
 * POST /api/auth/verify-magic-link
 *
 * Triggered by the confirmation button in the GET response above.
 * Consumes the token, exchanges it for a session, sets the cookie.
 */
export async function POST(request: Request) {
    const { origin: internalOrigin } = new URL(request.url);
    const origin = getPublicOrigin(internalOrigin);

    let token: string | null = null;
    try {
        const ct = request.headers.get('content-type') ?? '';
        if (ct.includes('application/x-www-form-urlencoded')) {
            const text = await request.text();
            token = new URLSearchParams(text).get('token');
        } else {
            const body = (await request.json()) as { token?: string };
            token = body.token ?? null;
        }
    } catch {
        return NextResponse.redirect(`${origin}/login?error=invalid_link`);
    }

    if (!token) {
        return NextResponse.redirect(`${origin}/login?error=invalid_link`);
    }

    const result = await consumeMagicToken(token);

    if ('error' in result) {
        return NextResponse.redirect(`${origin}/login?error=${result.error}`);
    }

    // Exchange verified email for a session token via the API gateway
    let sessionToken: string | undefined;
    try {
        const loginRes = await fetch(`${getApiBaseUrl()}/auth/passwordless-login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${getSharedToken()}`,
            },
            body: JSON.stringify({ email: result.email }),
            cache: 'no-store',
        });

        if (loginRes.ok) {
            const data = (await loginRes.json()) as { token?: string };
            sessionToken = data.token;
        }
    } catch {
        // fall through to redirect with error
    }

    if (!sessionToken) {
        return NextResponse.redirect(`${origin}/login?error=login_failed`);
    }

    const response = NextResponse.redirect(`${origin}/`);
    response.cookies.set('agentfarm_internal_session', encodeURIComponent(sessionToken), {
        path: '/',
        sameSite: 'strict',
        maxAge: 28800,
        httpOnly: false,
    });
    return response;
}
