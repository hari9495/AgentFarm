import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { runRuntimeProxy } from '../../route-handler-core';
import { buildKillUrl, buildUpstreamHeaders, getRuntimeBaseUrl } from '../../runtime-proxy-utils';

const getAuthHeader = async (): Promise<string | null> => {
    const cookieStore = await cookies();
    const session = cookieStore.get('agentfarm_session');
    if (!session?.value) {
        return null;
    }
    return `Bearer ${decodeURIComponent(session.value)}`;
};

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ botId: string }> },
) {
    await params; // botId reserved for future multi-bot routing

    const authHeader = await getAuthHeader();
    const upstreamHeaders = buildUpstreamHeaders(true);

    const result = await runRuntimeProxy({
        sessionAuthHeader: authHeader,
        upstreamUrl: buildKillUrl(getRuntimeBaseUrl()),
        requestInit: {
            method: 'POST',
            headers: upstreamHeaders,
        },
    });

    return NextResponse.json(result.body, { status: result.status });
}
