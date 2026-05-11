import { NextResponse } from 'next/server';
import { runRuntimeProxy } from '../../route-handler-core';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = () => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

// POST /api/runtime/[botId]/repro-pack
// Proxies to POST /v1/workspaces/:workspaceId/repro-packs
// botId is used as workspaceId per schema (Bot.workspaceId)
export async function POST(
    request: Request,
    { params }: { params: Promise<{ botId: string }> },
) {
    const { botId } = await params;
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
    }

    let forwardedBody: string | undefined;
    try {
        const raw = await request.json() as Record<string, unknown>;
        forwardedBody = JSON.stringify(raw);
    } catch {
        forwardedBody = undefined;
    }

    const result = await runRuntimeProxy({
        sessionAuthHeader: authHeader,
        upstreamUrl: `${getApiBaseUrl()}/v1/workspaces/${botId}/repro-packs`,
        requestInit: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: authHeader },
            ...(forwardedBody !== undefined ? { body: forwardedBody } : {}),
        },
    });

    return NextResponse.json(result.body, { status: result.status });
}
