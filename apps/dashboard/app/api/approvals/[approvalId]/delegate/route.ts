import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ approvalId: string }> },
) {
    const { approvalId } = await params;

    let payload: unknown;
    try {
        payload = await request.json();
    } catch {
        return NextResponse.json(
            { error: 'invalid_request', message: 'Invalid JSON body.' },
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

    const response = await fetch(
        `${getApiBaseUrl()}/v1/approvals/${encodeURIComponent(approvalId)}/delegate`,
        {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                Authorization: authHeader,
            },
            body: JSON.stringify(payload),
            cache: 'no-store',
        },
    );

    const body = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse delegation response.',
    }));

    return NextResponse.json(body, { status: response.status });
}
