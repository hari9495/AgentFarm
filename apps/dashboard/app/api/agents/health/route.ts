import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = () => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET() {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    try {
        const res  = await fetch(`${getApiBaseUrl()}/v1/agents/health`, { headers: { Authorization: authHeader }, cache: 'no-store' });
        const data = await res.json().catch(() => ({ error: 'upstream_error' }));
        return NextResponse.json(data, { status: res.status });
    } catch {
        return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
    }
}
