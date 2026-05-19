import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ botId: string }> },
) {
    const { botId } = await params;
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    const url = new URL(request.url);
    const page = url.searchParams.get('page') ?? '1';
    const pageSize = url.searchParams.get('page_size') ?? '20';
    let res: Response;
    try {
        res = await fetch(
            `${getApiBaseUrl()}/v1/disclosure/${encodeURIComponent(botId)}/audit?page=${page}&page_size=${pageSize}`,
            { headers: { Authorization: authHeader }, cache: 'no-store' },
        );
    } catch {
        return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
}
