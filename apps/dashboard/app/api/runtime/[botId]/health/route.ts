import { NextResponse } from 'next/server';
import { runRuntimeProxy } from '../../route-handler-core';
import { buildHealthRouteContract } from '../route-contract';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ botId: string }> },
) {
    await params; // botId reserved for future multi-bot routing

    const authHeader = await getInternalSessionAuthHeader();
    const contract = buildHealthRouteContract();

    const result = await runRuntimeProxy({
        sessionAuthHeader: authHeader,
        upstreamUrl: contract.upstreamUrl,
        requestInit: contract.requestInit,
    });

    return NextResponse.json(result.body, { status: result.status });
}
