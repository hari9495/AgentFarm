import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

// GET — managed connector catalog with provisioning status (live vs coming-soon).
// Operator-facing read-only view of which Tier-2 connectors have a provisioned proxy.
export async function GET(): Promise<Response> {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    try {
        const response = await fetch(`${getApiBaseUrl()}/v1/mcp/catalog`, {
            headers: { Authorization: authHeader },
            cache: 'no-store',
        });
        const body = await response.json().catch(() => ({ catalog: [] }));
        return NextResponse.json(body, { status: response.status });
    } catch {
        return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
    }
}
