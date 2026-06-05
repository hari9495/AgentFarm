/**
 * Catch-all proxy for /api/support/* → api-gateway /v1/support/*
 *
 * Handles:
 *   GET  /api/support/issues          → SSE stream pass-through
 *   GET  /api/support/issues/:id
 *   POST /api/support/issues
 *   POST /api/support/issues/:id/resolve
 *   GET  /api/support/stats
 *
 * WebSocket (/api/support/chat-session) is NOT proxied here — the browser
 * widget connects directly to NEXT_PUBLIC_API_URL which is the gateway base.
 */

import type { NextRequest } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

async function proxyRequest(
    request: NextRequest,
    pathSegments: string[],
): Promise<Response> {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return new Response(
            JSON.stringify({ error: 'forbidden', message: 'Internal session required.' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } },
        );
    }

    const upstreamPath = pathSegments.join('/');
    const { searchParams } = new URL(request.url);
    const qs = searchParams.toString();
    const upstreamUrl = `${getApiBaseUrl()}/v1/support/${upstreamPath}${qs ? `?${qs}` : ''}`;

    const headers: Record<string, string> = { Authorization: authHeader };

    const contentType = request.headers.get('content-type');
    if (contentType) headers['content-type'] = contentType;

    const acceptHeader = request.headers.get('accept') ?? '';
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

    // SSE streams: pass body through without buffering
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

    // Regular JSON responses
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
