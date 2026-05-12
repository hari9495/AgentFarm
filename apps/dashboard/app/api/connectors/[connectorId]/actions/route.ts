import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ connectorId: string }> },
) {
    const { connectorId } = await params;

    if (!connectorId) {
        return NextResponse.json(
            { error: 'bad_request', message: 'connectorId is required.' },
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

    const incomingUrl = new URL(request.url);
    const targetUrl = `${getApiBaseUrl()}/v1/connectors/${encodeURIComponent(connectorId)}/actions?${incomingUrl.searchParams.toString()}`;

    const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
            Authorization: authHeader,
        },
        cache: 'no-store',
    });

    const body = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse connector actions response.',
    }));

    return NextResponse.json(body, { status: response.status });
}
