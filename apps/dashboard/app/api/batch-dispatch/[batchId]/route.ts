import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

type Params = { params: Promise<{ batchId: string }> };

export async function GET(_req: Request, { params }: Params) {
    const { batchId } = await params;
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const res = await fetch(`${getApiBaseUrl()}/v1/agents/batch-dispatch/${encodeURIComponent(batchId)}`, {
        headers: { Authorization: authHeader },
        cache: 'no-store',
    });
    const body = await res.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(body, { status: res.status });
}
