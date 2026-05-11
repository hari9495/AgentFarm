import type { NextRequest } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

/**
 * GET /api/sse/tasks
 *
 * Proxy that streams the api-gateway SSE task feed to the dashboard client.
 * The upstream body is passed through directly — no buffering.
 *
 * Query params forwarded:
 *   workspaceId — required by the upstream gateway (optional at this layer,
 *                 the gateway will return 403 if it is missing)
 */
export async function GET(request: NextRequest): Promise<Response> {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return new Response(JSON.stringify({ error: 'forbidden', message: 'Internal session required.' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // Build upstream URL — /sse/tasks (no /v1/ prefix, confirmed from sse-tasks.ts)
    const upstreamUrl = new URL(`${getApiBaseUrl()}/sse/tasks`);

    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (workspaceId) {
        upstreamUrl.searchParams.set('workspaceId', workspaceId);
    }

    const upstreamHeaders: Record<string, string> = {
        Authorization: authHeader,
        Accept: 'text/event-stream',
    };

    // Forward Last-Event-ID so the gateway can replay missed events on reconnect
    const lastEventId = request.headers.get('last-event-id');
    if (lastEventId) {
        upstreamHeaders['Last-Event-ID'] = lastEventId;
    }

    let upstreamRes: Response;
    try {
        upstreamRes = await fetch(upstreamUrl.toString(), {
            method: 'GET',
            headers: upstreamHeaders,
        });
    } catch {
        return new Response(JSON.stringify({ error: 'upstream_unavailable' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    if (!upstreamRes.ok) {
        return new Response(JSON.stringify({ error: 'upstream_error', status: upstreamRes.status }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // Stream the body directly — no transforms, no buffering.
    return new Response(upstreamRes.body, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
