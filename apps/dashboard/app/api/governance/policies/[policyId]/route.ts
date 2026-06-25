import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader, getSessionPayload } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function DELETE(_request: Request, { params }: { params: Promise<{ policyId: string }> }) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Internal session required.' }, { status: 403 });
    }
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        return NextResponse.json({ error: 'invalid_session', message: 'Unable to resolve tenantId from session.' }, { status: 400 });
    }
    const { policyId } = await params;
    const response = await fetch(`${getApiBaseUrl()}/v1/governance/policies/${encodeURIComponent(policyId)}`, {
        method: 'DELETE',
        headers: { Authorization: authHeader },
        cache: 'no-store',
    });
    const data = await response.json().catch(() => ({ error: 'upstream_error', message: 'Unable to parse response.' }));
    return NextResponse.json(data, { status: response.status });
}
