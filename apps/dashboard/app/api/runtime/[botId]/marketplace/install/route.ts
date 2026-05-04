import { NextResponse } from 'next/server';
import { runRuntimeProxy } from '../../../route-handler-core';
import { buildMarketplaceInstallRouteContract } from '../../route-contract';
import { getInternalSessionAuthHeader } from '../../../../../lib/internal-session';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ botId: string }> },
) {
    await params; // botId reserved for future multi-bot routing

    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
        return NextResponse.json(
            { error: 'invalid_payload', message: 'JSON payload is required.' },
            { status: 400 },
        );
    }

    const contract = buildMarketplaceInstallRouteContract(body);
    const result = await runRuntimeProxy({
        sessionAuthHeader: authHeader,
        upstreamUrl: contract.upstreamUrl,
        requestInit: contract.requestInit,
    });

    return NextResponse.json(result.body, { status: result.status });
}
