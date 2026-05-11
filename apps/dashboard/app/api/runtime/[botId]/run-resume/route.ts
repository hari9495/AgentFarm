import { NextResponse } from 'next/server';
import { runRuntimeProxy } from '../../route-handler-core';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = () => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

// POST /api/runtime/[botId]/run-resume
// Reads runId from request body, proxies to POST /v1/runs/:runId/resume
export async function POST(
    request: Request,
    { params }: { params: Promise<{ botId: string }> },
) {
    const { botId: _ } = await params; // botId unused — runId drives the route

    let body: Record<string, unknown> = {};
    try {
        body = await request.json() as Record<string, unknown>;
    } catch {
        body = {};
    }

    const runId = typeof body.runId === 'string' ? body.runId : undefined;
    if (!runId) {
        return NextResponse.json({ error: 'runId required' }, { status: 400 });
    }

    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
    }

    const strategy =
        typeof body.strategy === 'string' ? body.strategy : 'last_checkpoint';

    const result = await runRuntimeProxy({
        sessionAuthHeader: authHeader,
        upstreamUrl: `${getApiBaseUrl()}/v1/runs/${runId}/resume`,
        requestInit: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: authHeader },
            body: JSON.stringify({ strategy }),
        },
    });

    return NextResponse.json(result.body, { status: result.status });
}
