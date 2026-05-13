import { NextRequest, NextResponse } from 'next/server';
import { GATEWAY_URL } from '@agentfarm/config';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const upstream = `${GATEWAY_URL}/v1/marketplace/listings?${searchParams.toString()}`;

    const response = await fetch(upstream, { cache: 'no-store' });

    const body = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse listings response.',
    }));

    return NextResponse.json(body, { status: response.status });
}
