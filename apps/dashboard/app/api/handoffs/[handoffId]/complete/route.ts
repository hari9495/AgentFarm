import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

type RouteParams = {
    params: Promise<{ handoffId: string }>;
};

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(request: Request, { params }: RouteParams) {
    const { handoffId } = await params;

    if (!handoffId?.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'handoffId is required.' },
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

    let body: unknown = {};
    try {
        body = await request.json();
    } catch {
        // Optional body — proceed with empty object
    }

    try {
        const response = await fetch(
            `${getApiBaseUrl()}/v1/handoffs/${encodeURIComponent(handoffId)}/complete`,
            {
                method: 'POST',
                headers: {
                    Authorization: authHeader,
                    'content-type': 'application/json',
                },
                body: JSON.stringify(body),
                cache: 'no-store',
            },
        );

        const data = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse handoff complete response.',
        }));

        return NextResponse.json(data, { status: response.status });
    } catch {
        return NextResponse.json(
            { error: 'upstream_unavailable', message: 'Handoffs upstream is unavailable.' },
            { status: 502 },
        );
    }
}
