import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ workspaceId: string }> },
): Promise<Response> {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const { workspaceId } = await params;
    if (!workspaceId?.trim()) {
        return NextResponse.json({ error: 'invalid_request', message: 'workspaceId is required.' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const query = new URLSearchParams();
    if (searchParams.get('status')) query.set('status', searchParams.get('status')!);
    if (searchParams.get('limit')) query.set('limit', searchParams.get('limit')!);

    const targetUrl = `${getApiBaseUrl()}/v1/workspaces/${workspaceId}/ci-failures?${query.toString()}`;

    try {
        const response = await fetch(targetUrl, {
            headers: { Authorization: authHeader },
            cache: 'no-store',
        });
        const body = await response.json().catch(() => ({ error: 'upstream_error' }));
        return NextResponse.json(body, { status: response.status });
    } catch {
        return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
    }
}
