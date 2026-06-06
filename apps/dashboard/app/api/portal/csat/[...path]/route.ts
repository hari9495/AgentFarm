/**
 * Portal CSAT proxy: /api/portal/csat/* → api-gateway /v1/portal/csat/*
 *
 * CSAT surveys are authenticated by the CSAT token itself (in the URL),
 * not by portal_session — so this proxy needs no session forwarding.
 */

import type { NextRequest } from 'next/server';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

async function proxyRequest(request: NextRequest, pathSegments: string[]): Promise<Response> {
    const upstreamPath = pathSegments.join('/');
    const { searchParams } = new URL(request.url);
    const qs = searchParams.toString();
    const upstreamUrl = `${getApiBaseUrl()}/v1/portal/csat/${upstreamPath}${qs ? `?${qs}` : ''}`;

    const headers: Record<string, string> = {};
    const contentType = request.headers.get('content-type');
    if (contentType) headers['content-type'] = contentType;

    let body: string | undefined;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        body = await request.text();
    }

    let upstream: Response;
    try {
        upstream = await fetch(upstreamUrl, { method: request.method, headers, body });
    } catch {
        return new Response(JSON.stringify({ error: 'upstream_unavailable' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const data = await upstream.text();
    return new Response(data, {
        status: upstream.status,
        headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
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
