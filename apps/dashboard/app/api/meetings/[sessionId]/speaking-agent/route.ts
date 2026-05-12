import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ sessionId: string }> },
) {
    const { sessionId } = await params;

    if (!sessionId || sessionId.trim().length === 0) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'sessionId is required.' },
            { status: 400 },
        );
    }

    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body.text !== 'string' || body.text.trim().length === 0) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'text is required.' },
            { status: 400 },
        );
    }

    try {
        const response = await fetch(
            `${getApiBaseUrl()}/v1/meetings/${encodeURIComponent(sessionId)}/speaking-agent`,
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    Authorization: authHeader,
                },
                body: JSON.stringify(body),
                cache: 'no-store',
            },
        );

        const data = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse response.',
        }));

        return NextResponse.json(data, { status: response.status });
    } catch {
        return NextResponse.json(
            { error: 'upstream_unavailable', message: 'Gateway request failed.' },
            { status: 502 },
        );
    }
}
