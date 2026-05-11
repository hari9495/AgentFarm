import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    const incomingUrl = new URL(request.url);
    const tenantId = incomingUrl.searchParams.get('tenantId');
    if (!tenantId) {
        return NextResponse.json(
            { error: 'bad_request', message: 'tenantId is required.' },
            { status: 400 },
        );
    }

    const targetUrl = `${getApiBaseUrl()}/v1/billing/subscription?tenantId=${encodeURIComponent(tenantId)}`;

    try {
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                Authorization: authHeader,
            },
            cache: 'no-store',
        });

        const body = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse subscription response.',
        }));

        return NextResponse.json(body, { status: response.status });
    } catch {
        return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
    }
}
