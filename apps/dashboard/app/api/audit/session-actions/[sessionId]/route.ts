import { NextResponse } from 'next/server';
import { getRuntimeBaseUrl, buildUpstreamHeaders } from '../../../runtime/runtime-proxy-utils';

export async function GET(
    _request: Request,
    context: { params: Promise<{ sessionId: string }> },
) {
    const { sessionId } = await context.params;
    if (!sessionId?.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'sessionId is required.' },
            { status: 400 },
        );
    }

    const url = `${getRuntimeBaseUrl()}/v1/audit/sessions/${encodeURIComponent(sessionId)}/actions`;

    const response = await fetch(url, {
        method: 'GET',
        headers: buildUpstreamHeaders(),
        cache: 'no-store',
    });

    const body = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse session actions response.',
    }));

    return NextResponse.json(body, { status: response.status });
}
