import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getInternalSessionAuthHeader, getSessionPayload } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(request: NextRequest) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    const session = await getSessionPayload();
    const tenantId = session?.tenantId;
    if (!tenantId) {
        return NextResponse.json(
            { error: 'bad_request', message: 'tenantId required.' },
            { status: 400 },
        );
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from') ?? '';
    const to = searchParams.get('to') ?? '';
    const workspaceId = searchParams.get('workspaceId') ?? '';

    const upstreamUrl =
        `${getApiBaseUrl()}/v1/analytics/agent-performance` +
        `?tenantId=${encodeURIComponent(tenantId)}` +
        `&from=${encodeURIComponent(from)}` +
        `&to=${encodeURIComponent(to)}` +
        (workspaceId ? `&workspaceId=${encodeURIComponent(workspaceId)}` : '');

    let res: Response;
    try {
        res = await fetch(upstreamUrl, {
            headers: { Authorization: authHeader },
            cache: 'no-store',
        });
    } catch {
        return NextResponse.json(
            { error: 'upstream_error', message: 'Failed to reach analytics service.' },
            { status: 502 },
        );
    }

    const body = await res.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse agent performance response.',
    }));

    return NextResponse.json(body, { status: res.status });
}
