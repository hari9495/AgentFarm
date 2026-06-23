import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ ruleId: string }> },
) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Internal session required.' }, { status: 403 });
    }

    const { ruleId } = await params;
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const res = await fetch(
        `${getApiBaseUrl()}/v1/webhooks/inbound/rules/${encodeURIComponent(ruleId)}`,
        {
            method: 'PATCH',
            headers: { Authorization: authHeader, 'content-type': 'application/json' },
            body: JSON.stringify(payload),
            cache: 'no-store',
        },
    );

    const body = await res.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(body, { status: res.status });
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ ruleId: string }> },
) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Internal session required.' }, { status: 403 });
    }

    const { ruleId } = await params;

    const res = await fetch(
        `${getApiBaseUrl()}/v1/webhooks/inbound/rules/${encodeURIComponent(ruleId)}`,
        {
            method: 'DELETE',
            headers: { Authorization: authHeader },
            cache: 'no-store',
        },
    );

    const body = await res.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(body, { status: res.status });
}
