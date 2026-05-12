import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ workflowId: string }> },
) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    const { workflowId } = await params;
    if (!workflowId?.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'workflowId is required.' },
            { status: 400 },
        );
    }

    try {
        const response = await fetch(
            `${getApiBaseUrl()}/v1/governance/workflows/${encodeURIComponent(workflowId)}`,
            {
                method: 'GET',
                headers: { Authorization: authHeader },
                cache: 'no-store',
            },
        );

        const body = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse workflow response.',
        }));

        return NextResponse.json(body, { status: response.status });
    } catch {
        return NextResponse.json(
            { error: 'gateway_error', message: 'Failed to reach governance service.' },
            { status: 502 },
        );
    }
}
