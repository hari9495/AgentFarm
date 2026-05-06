import { NextResponse } from 'next/server';
import { runRuntimeProxy } from '../../route-handler-core';
import { buildWeeklyQualityRoiRouteContract } from '../route-contract';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

export async function GET(
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

    const contract = buildWeeklyQualityRoiRouteContract(request.url);

    const result = await runRuntimeProxy({
        sessionAuthHeader: authHeader,
        upstreamUrl: contract.upstreamUrl,
        requestInit: contract.requestInit,
    });

    return NextResponse.json(result.body, { status: result.status });
}
