import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../../lib/internal-session.js';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ botId: string; versionId: string }> },
): Promise<Response> {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const { botId, versionId } = await params;

    if (!botId?.trim() || !versionId?.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'botId and versionId are required.' },
            { status: 400 },
        );
    }

    const targetUrl = `${getApiBaseUrl()}/v1/agents/${botId}/versions/${versionId}`;

    try {
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: { Authorization: authHeader },
            cache: 'no-store',
        });
        const body = await response.json().catch(() => ({ error: 'upstream_error' }));
        return NextResponse.json(body, { status: response.status });
    } catch {
        return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
    }
}
