import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ sessionId: string }> },
) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    const { sessionId } = await params;
    if (!sessionId) {
        return NextResponse.json({ error: 'bad_request', message: 'sessionId is required.' }, { status: 400 });
    }

    const response = await fetch(
        `${getApiBaseUrl()}/v1/meetings/${encodeURIComponent(sessionId)}/audit-events`,
        {
            headers: { Authorization: authHeader },
            cache: 'no-store',
        },
    );

    const data = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse response.',
    }));

    return NextResponse.json(data, { status: response.status });
}
