import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ loopId: string }> },
) {
    const { loopId } = await params;

    if (!loopId || loopId.trim().length === 0) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'loopId is required.' },
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

    try {
        const response = await fetch(
            `${getApiBaseUrl()}/v1/autonomous-loops/${encodeURIComponent(loopId)}`,
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
    } catch {
        return NextResponse.json(
            { error: 'upstream_unavailable', message: 'Gateway request failed.' },
            { status: 502 },
        );
    }
}

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ loopId: string }> },
) {
    const { loopId } = await params;

    if (!loopId || loopId.trim().length === 0) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'loopId is required.' },
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

    try {
        const response = await fetch(
            `${getApiBaseUrl()}/v1/autonomous-loops/${encodeURIComponent(loopId)}`,
            {
                method: 'DELETE',
                headers: { Authorization: authHeader },
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
