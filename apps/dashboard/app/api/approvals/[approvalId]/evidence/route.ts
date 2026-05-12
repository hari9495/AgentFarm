import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ approvalId: string }> },
): Promise<Response> {
    const { approvalId } = await params;

    if (!approvalId?.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'approvalId is required.' },
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

    const { searchParams } = new URL(request.url);
    const targetUrl = `${getApiBaseUrl()}/v1/approvals/${encodeURIComponent(approvalId)}/evidence?${searchParams.toString()}`;

    const response = await fetch(targetUrl, {
        method: 'GET',
        headers: { Authorization: authHeader },
        cache: 'no-store',
    });

    const body = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse evidence response.',
    }));

    return NextResponse.json(body, { status: response.status });
}
