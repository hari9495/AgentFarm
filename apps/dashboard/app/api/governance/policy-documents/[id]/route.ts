import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader, getSessionPayload } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const session = await getSessionPayload();
    if (!session?.tenantId) return NextResponse.json({ error: 'invalid_session' }, { status: 400 });
    const { id } = await params;
    const response = await fetch(`${getApiBaseUrl()}/v1/governance/policy-documents/${id}`, {
        headers: { Authorization: authHeader },
        cache: 'no-store',
    });
    const body = await response.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(body, { status: response.status });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const session = await getSessionPayload();
    if (!session?.tenantId) return NextResponse.json({ error: 'invalid_session' }, { status: 400 });
    const { id } = await params;
    const response = await fetch(`${getApiBaseUrl()}/v1/governance/policy-documents/${id}`, {
        method: 'DELETE',
        headers: { Authorization: authHeader },
        cache: 'no-store',
    });
    const body = await response.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(body, { status: response.status });
}
