import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id') ?? '';

    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const url = `${getApiBaseUrl()}/v1/notifications/in-app${workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : ''}`;
    const response = await fetch(url, {
        headers: { Authorization: authHeader },
        cache: 'no-store',
    });
    const body = await response.json().catch(() => ({ items: [], total: 0 }));
    return NextResponse.json(body, { status: response.status });
}
