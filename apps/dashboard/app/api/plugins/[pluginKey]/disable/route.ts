import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ pluginKey: string }> },
) {
    const { pluginKey } = await params;
    if (!pluginKey?.trim()) {
        return NextResponse.json({ error: 'invalid_request', message: 'pluginKey is required.' }, { status: 400 });
    }

    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Internal session required.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));

    const response = await fetch(
        `${getApiBaseUrl()}/v1/plugins/${encodeURIComponent(pluginKey)}/disable`,
        {
            method: 'POST',
            headers: {
                Authorization: authHeader,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            cache: 'no-store',
        },
    );

    const data = await response.json().catch(() => ({ error: 'upstream_error', message: 'Unable to parse disable response.' }));
    return NextResponse.json(data, { status: response.status });
}
