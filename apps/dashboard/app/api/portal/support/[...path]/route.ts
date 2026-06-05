/**
 * Portal support proxy: /api/portal/support/* → api-gateway /v1/support/*
 *
 * Forwards the portal_session cookie from the browser directly to the
 * api-gateway as a Cookie header so the gateway can authenticate the request.
 *
 * WebSocket connections (chat-session, voice-session) are NOT proxied here —
 * the browser connects directly to NEXT_PUBLIC_API_URL with the portal_session
 * cookie (the WS upgrade handler on the gateway accepts portal_session).
 */

import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

async function proxyRequest(request: NextRequest, pathSegments: string[]): Promise<Response> {
    const cookieStore = await cookies();
    const portalSession = cookieStore.get('portal_session');

    if (!portalSession?.value) {
        return new Response(
            JSON.stringify({ error: 'unauthorized', message: 'Portal session required.' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
        );
    }

    const upstreamPath = pathSegments.join('/');
    const { searchParams } = new URL(request.url);
    const qs = searchParams.toString();
    const upstreamUrl = `${getApiBaseUrl()}/v1/support/${upstreamPath}${qs ? `?${qs}` : ''}`;

    const headers: Record<string, string> = {
        Cookie: `portal_session=${portalSession.value}`,
    };

    const contentType = request.headers.get('content-type');
    if (contentType) headers['content-type'] = contentType;
    const acceptHeader = request.headers.get('accept');
    if (acceptHeader) headers['accept'] = acceptHeader;

    let body: BodyInit | null = null;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        body = await request.text();
    }

    let upstream: Response;
    try {
        upstream = await fetch(upstreamUrl, {
            method: request.method,
            headers,
            body: body ?? undefined,
        });
    } catch {
        return new Response(
            JSON.stringify({ error: 'upstream_unavailable' }),
            { status: 502, headers: { 'Content-Type': 'application/json' } },
        );
    }

    const upstreamContentType = upstream.headers.get('content-type') ?? '';
    if (upstreamContentType.includes('text/event-stream')) {
        return new Response(upstream.body, {
            status: upstream.status,
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
                'X-Accel-Buffering': 'no',
            },
        });
    }

    const data = await upstream.text();
    return new Response(data, {
        status: upstream.status,
        headers: { 'Content-Type': upstreamContentType || 'application/json' },
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
