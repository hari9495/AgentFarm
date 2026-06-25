import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader, getSessionPayload } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET() {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Internal session required.' }, { status: 403 });
    }
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        return NextResponse.json({ error: 'invalid_session', message: 'Unable to resolve tenantId.' }, { status: 400 });
    }
    const response = await fetch(`${getApiBaseUrl()}/v1/governance/policy-documents`, {
        headers: { Authorization: authHeader },
        cache: 'no-store',
    });
    const body = await response.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(body, { status: response.status });
}

export async function POST(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Internal session required.' }, { status: 403 });
    }
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        return NextResponse.json({ error: 'invalid_session', message: 'Unable to resolve tenantId.' }, { status: 400 });
    }
    // Forward the multipart body verbatim (preserve boundary + content-type).
    const contentType = request.headers.get('content-type') ?? 'application/octet-stream';
    const raw = Buffer.from(await request.arrayBuffer());
    const response = await fetch(`${getApiBaseUrl()}/v1/governance/policy-documents`, {
        method: 'POST',
        headers: { 'content-type': contentType, Authorization: authHeader },
        body: raw,
        cache: 'no-store',
    });
    const data = await response.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(data, { status: response.status });
}
