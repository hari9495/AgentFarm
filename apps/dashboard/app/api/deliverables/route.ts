import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id');

    if (!workspaceId) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'workspace_id is required.' },
            { status: 400 },
        );
    }

    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Internal session required.' }, { status: 403 });
    }

    const upstream = new URL(`${getApiBaseUrl()}/v1/workspaces/${encodeURIComponent(workspaceId)}/deliverables`);
    for (const [key, value] of searchParams.entries()) {
        if (key !== 'workspace_id') {
            upstream.searchParams.set(key, value);
        }
    }

    const response = await fetch(upstream.toString(), {
        headers: { Authorization: authHeader },
        cache: 'no-store',
    });

    const body = await response.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(body, { status: response.status });
}
