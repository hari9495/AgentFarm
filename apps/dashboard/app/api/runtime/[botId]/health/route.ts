import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { runRuntimeProxy } from '../../route-handler-core';
import { buildHealthUrl, buildUpstreamHeaders, getRuntimeBaseUrl } from '../../runtime-proxy-utils';

const getAuthHeader = async (): Promise<string | null> => {
    const cookieStore = await cookies();
    const session = cookieStore.get('agentfarm_session');
    if (!session?.value) {
        return null;
    }
    return `Bearer ${decodeURIComponent(session.value)}`;
};

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ botId: string }> },
) {
    await params; // botId reserved for future multi-bot routing

    const authHeader = await getAuthHeader();
    const upstreamHeaders = buildUpstreamHeaders();

    const result = await runRuntimeProxy({
        sessionAuthHeader: authHeader,
        upstreamUrl: buildHealthUrl(getRuntimeBaseUrl()),
        requestInit: {
            headers: upstreamHeaders,
            cache: 'no-store',
        },
    });

    return NextResponse.json(result.body, { status: result.status });
}
