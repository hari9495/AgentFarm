import { NextResponse } from 'next/server';
import { runRuntimeProxy } from '../../route-handler-core';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = () => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

// GET /api/runtime/[botId]/tasks
// Proxies to GET /v1/workspaces/:workspaceId/tasks
// botId is used as workspaceId per schema (Bot.workspaceId)
export async function GET(
    request: Request,
    { params }: { params: Promise<{ botId: string }> },
) {
    const { botId } = await params;
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit');
    const cursor = searchParams.get('cursor');

    const query = new URLSearchParams();
    if (limit) query.set('limit', limit);
    if (cursor) query.set('cursor', cursor);
    const qs = query.size > 0 ? `?${query.toString()}` : '';

    const result = await runRuntimeProxy({
        sessionAuthHeader: authHeader,
        upstreamUrl: `${getApiBaseUrl()}/v1/workspaces/${botId}/tasks${qs}`,
        requestInit: {
            method: 'GET',
            headers: { Authorization: authHeader },
        },
    });

    return NextResponse.json(result.body, { status: result.status });
}
