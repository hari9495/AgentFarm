import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader, getSessionPayload } from '../../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const session = await getSessionPayload();
    if (!session?.tenantId) return NextResponse.json({ error: 'invalid_session' }, { status: 400 });
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    const response = await fetch(`${getApiBaseUrl()}/v1/governance/policy-documents/${id}/apply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: authHeader },
        body: JSON.stringify(body),
        cache: 'no-store',
    });
    const data = await response.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(data, { status: response.status });
}
