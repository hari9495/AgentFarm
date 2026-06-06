/**
 * Portal auth proxy: /api/portal/auth/* → api-gateway /v1/portal/auth/*
 *
 * On login success the api-gateway issues a `portal_session` cookie.
 * We re-set it here on the dashboard domain so the browser sends it to
 * both Next.js (for server-side session checks) and the api-gateway
 * WebSocket endpoints (same-site on localhost / same top-level domain in prod).
 */

import type { NextRequest } from 'next/server';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';
const isSecure = (): boolean => process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';

/** Extract the `portal_session` token value from a Set-Cookie header string. */
function extractPortalSessionToken(setCookie: string): string | null {
    const entry = setCookie.split(',').find((part) => part.trim().startsWith('portal_session='));
    if (!entry) return null;
    const valueSection = entry.trim().split(';')[0] ?? '';
    const raw = valueSection.slice('portal_session='.length);
    return raw ? decodeURIComponent(raw) : null;
}

/** Build a portal_session Set-Cookie header on the dashboard domain. */
function buildPortalSessionCookie(token: string, clear = false): string {
    const secureFlag = isSecure() ? '; Secure' : '';
    if (clear) {
        return `portal_session=; HttpOnly; SameSite=Lax; Path=/${secureFlag}; Max-Age=0`;
    }
    const maxAge = 7 * 24 * 60 * 60; // 7 days
    return `portal_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/${secureFlag}; Max-Age=${maxAge}`;
}

async function proxyRequest(request: NextRequest, pathSegments: string[]): Promise<Response> {
    const subPath = pathSegments.join('/');
    const upstreamUrl = `${getApiBaseUrl()}/v1/portal/auth/${subPath}`;

    const headers: Record<string, string> = {};
    const contentType = request.headers.get('content-type');
    if (contentType) headers['content-type'] = contentType;

    // Forward portal_session cookie if present (for /me, /logout, /change-password)
    const portalCookie = request.cookies.get('portal_session');
    if (portalCookie?.value) {
        headers['Cookie'] = `portal_session=${portalCookie.value}`;
    }

    let body: string | undefined;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        body = await request.text();
    }

    let upstream: Response;
    try {
        upstream = await fetch(upstreamUrl, {
            method: request.method,
            headers,
            body,
        });
    } catch {
        return new Response(JSON.stringify({ error: 'upstream_unavailable' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const upstreamBody = await upstream.text();
    const responseHeaders = new Headers({ 'Content-Type': 'application/json' });

    // On login: extract portal_session from upstream Set-Cookie and re-set on dashboard domain
    if (subPath === 'login' && upstream.status === 200) {
        const upstreamCookie = upstream.headers.get('set-cookie') ?? '';
        const token = extractPortalSessionToken(upstreamCookie);
        if (token) {
            responseHeaders.set('Set-Cookie', buildPortalSessionCookie(token));
        }
    }

    // On logout: clear the cookie on dashboard domain too
    if (subPath === 'logout') {
        responseHeaders.set('Set-Cookie', buildPortalSessionCookie('', true));
    }

    return new Response(upstreamBody, {
        status: upstream.status,
        headers: responseHeaders,
    });
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, { params }: RouteContext): Promise<Response> {
    const { path } = await params;
    return proxyRequest(request, path);
}

export async function POST(request: NextRequest, { params }: RouteContext): Promise<Response> {
    const { path } = await params;
    return proxyRequest(request, path);
}
