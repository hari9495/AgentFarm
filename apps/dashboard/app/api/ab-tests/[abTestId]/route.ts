import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(
    _request: Request,
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

    let res: Response;
    try {
        res = await fetch(
            `${getApiBaseUrl()}/v1/ab-tests/${encodeURIComponent(abTestId)}`,
            {
                headers: { Authorization: authHeader },
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
