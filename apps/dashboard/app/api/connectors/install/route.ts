import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader, getSessionPayload } from '../../../lib/internal-session';

const API_BASE = process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

/**
 * POST /api/connectors/install
 * Installs (provisions) a new connector for a workspace.
 * Proxies to POST /v1/connectors on the api-gateway.
 */
export async function POST(request: Request): Promise<Response> {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Internal session required.' }, { status: 403 });
    }

    const session = await getSessionPayload();
    if (!session?.tenantId) {
        return NextResponse.json({ error: 'invalid_session' }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try { body = (await request.json()) as Record<string, unknown>; }
    catch { return NextResponse.json({ error: 'invalid_request', message: 'Invalid JSON.' }, { status: 400 }); }

    // Inject workspace_id from session if not provided
    const workspaceId = (body.workspace_id as string | undefined) ?? session.workspaceIds?.[0];
    if (!workspaceId) {
        return NextResponse.json({ error: 'missing_workspace_id' }, { status: 400 });
    }

    try {
        const res = await fetch(`${API_BASE}/v1/connectors`, {
            method: 'POST',
            headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, workspace_id: workspaceId, tenant_id: session.tenantId }),
            cache: 'no-store',
        });
        const resBody = await res.json().catch(() => ({}));
        return NextResponse.json(resBody, { status: res.status });
    } catch {
        return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
    }
}
