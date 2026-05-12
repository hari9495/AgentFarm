import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ botId: string }> },
) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Internal session required.' }, { status: 403 });
    }
    const { botId } = await params;
    if (!botId?.trim()) {
        return NextResponse.json({ error: 'bad_request', message: 'botId / taskId is required.' }, { status: 400 });
    }
    const response = await fetch(
        `${getApiBaseUrl()}/feedback/${encodeURIComponent(botId)}`,
        { method: 'GET', headers: { Authorization: authHeader }, cache: 'no-store' },
    );
    const body = await response.json().catch(() => ({ error: 'upstream_error', message: 'Unable to parse feedback response.' }));
    return NextResponse.json(body, { status: response.status });
}
