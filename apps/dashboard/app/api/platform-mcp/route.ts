import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader, getSessionPayload } from '../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

/**
 * POST /api/platform-mcp
 *
 * Registers a platform-level MCP server — available to ALL agents across ALL tenants.
 * Stored in the MCP registry without a workspaceId (global scope).
 * The agent-runtime's ensureServers() picks it up for every tenant automatically.
 */
export async function POST(request: Request): Promise<Response> {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const session = await getSessionPayload();

    let body: { connectorId: string; url: string; label: string };
    try { body = (await request.json()) as typeof body; }
    catch { return NextResponse.json({ error: 'invalid_request' }, { status: 400 }); }

    if (!body.connectorId?.trim() || !body.url?.trim()) {
        return NextResponse.json({ error: 'connectorId and url are required.' }, { status: 400 });
    }

    try {
        // Register as a tenant-level server (workspaceId = null = all workspaces)
        // The agent-runtime will auto-provision this to every tenant via ensureServers()
        const res = await fetch(`${getApiBaseUrl()}/v1/mcp`, {
            method: 'POST',
            headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name:        body.connectorId,
                url:         body.url.trim(),
                workspaceId: null,  // null = platform-wide, all tenants
                tenantId:    session?.tenantId,
                label:       body.label,
            }),
            cache: 'no-store',
        });
        const resBody = await res.json().catch(() => ({}));
        return NextResponse.json(resBody, { status: res.status });
    } catch {
        return NextResponse.json({ error: 'gateway_unavailable' }, { status: 502 });
    }
}

/**
 * DELETE /api/platform-mcp?connector=github
 * Removes a platform-level MCP server registration.
 */
export async function DELETE(request: Request): Promise<Response> {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const connectorId = searchParams.get('connector');
    if (!connectorId) return NextResponse.json({ error: 'connector param required' }, { status: 400 });

    try {
        const res = await fetch(`${getApiBaseUrl()}/v1/mcp/${encodeURIComponent(connectorId)}`, {
            method: 'DELETE', headers: { Authorization: authHeader }, cache: 'no-store',
        });
        return NextResponse.json({}, { status: res.status });
    } catch {
        return NextResponse.json({ error: 'gateway_unavailable' }, { status: 502 });
    }
}
