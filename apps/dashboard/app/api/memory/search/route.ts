import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Internal session required.' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    if (!q?.trim()) {
        return NextResponse.json({ error: 'bad_request', message: 'q param required.' }, { status: 400 });
    }
    const response = await fetch(
        `${getApiBaseUrl()}/v1/memory/search?${searchParams.toString()}`,
        { method: 'GET', headers: { Authorization: authHeader }, cache: 'no-store' },
    );
    const body = await response.json().catch(() => ({ error: 'upstream_error', message: 'Unable to parse memory search response.' }));
    return NextResponse.json(body, { status: response.status });
}
