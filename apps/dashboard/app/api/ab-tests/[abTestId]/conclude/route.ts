import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ abTestId: string }> },
) {
    const { abTestId } = await params;

    if (!abTestId?.trim()) {
        return NextResponse.json(
            { error: 'bad_request', message: 'abTestId is required.' },
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

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        body = {};
    }

    let res: Response;
    try {
        res = await fetch(
            `${getApiBaseUrl()}/v1/ab-tests/${encodeURIComponent(abTestId)}/conclude`,
            {
                method: 'POST',
                headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                cache: 'no-store',
            },
        );
    } catch {
        return NextResponse.json(
            { error: 'upstream_error', message: 'Failed to reach A/B test service.' },
            { status: 502 },
        );
    }

    const data = await res.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(data, { status: res.status });
}
