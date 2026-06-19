import { NextResponse } from 'next/server';
import { portalProxy } from '../../../../../_utils';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ botId: string; taskId: string }> },
): Promise<Response> {
    const { botId, taskId } = await params;
    const upstream = await portalProxy(
        request,
        `/portal/data/agents/${encodeURIComponent(botId)}/tasks/${encodeURIComponent(taskId)}/actions`,
    );
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
}
