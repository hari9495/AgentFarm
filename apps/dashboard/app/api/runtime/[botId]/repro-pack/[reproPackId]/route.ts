import { NextResponse } from 'next/server';
import { runRuntimeProxy } from '../../../route-handler-core';
import { getInternalSessionAuthHeader } from '../../../../../lib/internal-session';

const getApiBaseUrl = () => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

// GET /api/runtime/[botId]/repro-pack/[reproPackId]
// Proxies to GET /v1/workspaces/:workspaceId/repro-packs/:reproPackId
// botId is used as workspaceId per schema (Bot.workspaceId)
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ botId: string; reproPackId: string }> },
) {
    const { botId, reproPackId } = await params;
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
    }

    const result = await runRuntimeProxy({
        sessionAuthHeader: authHeader,
        upstreamUrl: `${getApiBaseUrl()}/v1/workspaces/${botId}/repro-packs/${reproPackId}`,
        requestInit: {
            method: 'GET',
            headers: { Authorization: authHeader },
        },
    });

    return NextResponse.json(result.body, { status: result.status });
}
