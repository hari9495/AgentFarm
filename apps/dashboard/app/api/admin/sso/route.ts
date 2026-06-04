import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = () => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET() {
    const auth = await getInternalSessionAuthHeader();
    if (!auth) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const res  = await fetch(`${getApiBaseUrl()}/v1/admin/sso/config`, { headers: { Authorization: auth }, cache: 'no-store' }).catch(() => null);
    if (!res) return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
    const data = await res.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(data, { status: res.status });
}

export async function PUT(request: Request) {
    const auth = await getInternalSessionAuthHeader();
    if (!auth) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid_request' }, { status: 400 }); }
    const res  = await fetch(`${getApiBaseUrl()}/v1/admin/sso/config`, { method: 'PUT', headers: { Authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' }).catch(() => null);
    if (!res) return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
    const data = await res.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(data, { status: res.status });
}

export async function DELETE() {
    const auth = await getInternalSessionAuthHeader();
    if (!auth) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const res  = await fetch(`${getApiBaseUrl()}/v1/admin/sso/config`, { method: 'DELETE', headers: { Authorization: auth }, cache: 'no-store' }).catch(() => null);
    if (!res) return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
    const data = await res.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(data, { status: res.status });
}
