import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(request: Request): Promise<Response> {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const query = new URLSearchParams();
    if (searchParams.get('workspace_id')) query.set('workspace_id', searchParams.get('workspace_id')!);
    if (searchParams.get('source')) query.set('source', searchParams.get('source')!);
    if (searchParams.get('limit')) query.set('limit', searchParams.get('limit')!);

    try {
        const response = await fetch(`${getApiBaseUrl()}/v1/wake/runs?${query.toString()}`, {
            headers: { Authorization: authHeader },
            cache: 'no-store',
        });
        const body = await response.json().catch(() => ({ error: 'upstream_error' }));
        return NextResponse.json(body, { status: response.status });
    } catch {
        return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
    }
}
