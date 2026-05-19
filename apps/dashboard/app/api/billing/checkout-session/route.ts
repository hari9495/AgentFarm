import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader, getSessionPayload } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    const session = await getSessionPayload();
    const tenantId = session?.tenantId;
    if (!tenantId) {
        return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    const payload = body as Record<string, unknown>;
    payload['tenantId'] = tenantId;
    let res: Response;
    try {
        res = await fetch(`${getApiBaseUrl()}/v1/billing/checkout-session`, {
            method: 'POST',
            headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    } catch {
        return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
}
