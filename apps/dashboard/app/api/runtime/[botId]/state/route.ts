import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { runRuntimeProxy } from '../../route-handler-core';
import { buildStateHistoryUrl, buildUpstreamHeaders, getRuntimeBaseUrl, resolveLimit } from '../../runtime-proxy-utils';

const getAuthHeader = async (): Promise<string | null> => {
    const cookieStore = await cookies();
    const session = cookieStore.get('agentfarm_session');
    if (!session?.value) {
        return null;
    }
    return `Bearer ${decodeURIComponent(session.value)}`;
};

export async function GET(
    request: Request,
    { params }: { params: Promise<{ botId: string }> },
) {
    await params; // botId reserved for future multi-bot routing

    const authHeader = await getAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'unauthorized', message: 'Missing session cookie.' },
            { status: 401 },
        );
    }

    const { searchParams } = new URL(request.url);
    const limit = resolveLimit(searchParams.get('limit'), '20');
    const upstreamHeaders = buildUpstreamHeaders();

    const result = await runRuntimeProxy({
        sessionAuthHeader: authHeader,
        upstreamUrl: buildStateHistoryUrl(getRuntimeBaseUrl(), limit),
        requestInit: {
            headers: upstreamHeaders,
            cache: 'no-store',
        },
    });

    return NextResponse.json(result.body, { status: result.status });
}
