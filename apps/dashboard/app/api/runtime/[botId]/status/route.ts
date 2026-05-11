import { NextResponse } from 'next/server';
import { runRuntimeProxy } from '../../route-handler-core';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = () => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ botId: string }> },
) {
    const { botId } = await params;
    const authHeader = await getInternalSessionAuthHeader();

    const { status, body } = await runRuntimeProxy({
        sessionAuthHeader: authHeader,
        upstreamUrl: `${getApiBaseUrl()}/v1/agents/${botId}/status`,
        requestInit: {
            method: 'GET',
            headers: { Authorization: authHeader ?? '' },
        },
    });

    return NextResponse.json(body, { status });
}
