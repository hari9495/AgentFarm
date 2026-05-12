import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    const { id } = await params;
    if (!id?.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'id is required.' },
            { status: 400 },
        );
    }

    try {
        const response = await fetch(
            `${getApiBaseUrl()}/v1/mcp/${encodeURIComponent(id)}`,
            {
                method: 'DELETE',
                headers: { Authorization: authHeader },
                cache: 'no-store',
            },
        );

        const body = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse MCP delete response.',
        }));

        return NextResponse.json(body, { status: response.status });
    } catch {
        return NextResponse.json(
            { error: 'gateway_error', message: 'Failed to reach MCP registry.' },
            { status: 502 },
        );
    }
}
