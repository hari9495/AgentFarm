import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

// Catch-all proxy for meeting sub-paths (action-items, dispatch, execute,
// analyze-transcript, …) → api-gateway /v1/meetings/:id/*. More specific
// sibling routes (audit-events, speaking-agent) take precedence over this.
const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

async function proxy(request: Request, paramsP: Promise<{ sessionId: string; rest: string[] }>) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Internal session required.' }, { status: 403 });
    }
    const { sessionId, rest } = await paramsP;
    if (!sessionId) {
        return NextResponse.json({ error: 'bad_request', message: 'sessionId is required.' }, { status: 400 });
    }
    const sub = (rest ?? []).map(encodeURIComponent).join('/');
    const url = `${getApiBaseUrl()}/v1/meetings/${encodeURIComponent(sessionId)}/${sub}`;
    const method = request.method;
    const body = method === 'GET' || method === 'HEAD' ? undefined : await request.text();
    const response = await fetch(url, {
        method,
        headers: { Authorization: authHeader, 'content-type': 'application/json' },
        body,
        cache: 'no-store',
    });
    const data = await response.json().catch(() => ({ error: 'upstream_error', message: 'Unable to parse response.' }));
    return NextResponse.json(data, { status: response.status });
}

type Ctx = { params: Promise<{ sessionId: string; rest: string[] }> };
export const GET = (request: Request, ctx: Ctx) => proxy(request, ctx.params);
export const POST = (request: Request, ctx: Ctx) => proxy(request, ctx.params);
export const PATCH = (request: Request, ctx: Ctx) => proxy(request, ctx.params);
