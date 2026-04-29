import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Internal session required.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id')?.trim();
    if (!workspaceId) {
        return NextResponse.json({ error: 'invalid_request', message: 'workspace_id is required.' }, { status: 400 });
    }

    const response = await fetch(
        `${getApiBaseUrl()}/v1/plugins/status?workspace_id=${encodeURIComponent(workspaceId)}`,
        {
            method: 'GET',
            headers: { Authorization: authHeader },
            cache: 'no-store',
        },
    );

    const body = await response.json().catch(() => ({ error: 'upstream_error', message: 'Unable to parse plugin status response.' }));
    return NextResponse.json(body, { status: response.status });
}
