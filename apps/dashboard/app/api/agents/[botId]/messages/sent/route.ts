import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../../lib/internal-session';

const getApiBaseUrl = () => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(
    request: Request,
    context: { params: Promise<{ botId: string }> },
) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'No active session.' }, { status: 403 });
    }

    const { botId } = await context.params;
    const { searchParams } = new URL(request.url);
    const response = await fetch(
        `${getApiBaseUrl()}/v1/agents/${botId}/messages/sent?${searchParams.toString()}`,
        { method: 'GET', headers: { Authorization: authHeader }, cache: 'no-store' },
    );
    const body = await response.json().catch(() => ({ error: 'upstream_error', message: 'Failed to parse upstream response.' }));
    return NextResponse.json(body, { status: response.status });
}
