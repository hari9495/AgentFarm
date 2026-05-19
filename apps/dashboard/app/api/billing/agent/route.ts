import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const botId = url.searchParams.get('botId');
    const from = url.searchParams.get('from') ?? undefined;
    const to = url.searchParams.get('to') ?? undefined;

    if (!botId) {
        return NextResponse.json({ error: 'botId is required' }, { status: 400 });
    }

    const params = new URLSearchParams({ botId });
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    try {
        const res = await fetch(
            `${getApiBaseUrl()}/v1/billing/metering/agent?${params.toString()}`,
            { headers: { Authorization: authHeader }, cache: 'no-store' },
        );
        const body = (await res.json()) as unknown;
        return NextResponse.json(body, { status: res.status });
    } catch {
        return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
    }
}
