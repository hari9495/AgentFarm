import { NextRequest, NextResponse } from 'next/server';

const getApiBaseUrl = (): string => process.env.API_GATEWAY_URL ?? 'http://localhost:3000';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const upstream = `${getApiBaseUrl()}/v1/marketplace/listings?${searchParams.toString()}`;

    const response = await fetch(upstream, { cache: 'no-store' });

    const body = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse listings response.',
    }));

    return NextResponse.json(body, { status: response.status });
}
