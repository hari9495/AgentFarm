import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

/**
 * POST /api/kill-switches/[id]/resume — resume after kill-switch resolution
 * Proxies to POST /v1/kill-switches/:id/resume on the api-gateway.
 */
export async function POST(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const { id } = await params;

    try {
        const response = await fetch(`${getApiBaseUrl()}/v1/kill-switches/${encodeURIComponent(id)}/resume`, {
            method: 'POST',
            headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
            cache: 'no-store',
        });
        const body = await response.json().catch(() => ({ error: 'upstream_error' }));
        return NextResponse.json(body, { status: response.status });
    } catch {
        return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
    }
}
