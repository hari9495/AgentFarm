import { NextResponse } from 'next/server';
import { portalProxy } from '../../../_utils';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ botId: string }> },
): Promise<Response> {
    const { botId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit');
    const qs = limit ? `?limit=${encodeURIComponent(limit)}` : '';
    const upstream = await portalProxy(request, `/portal/data/agents/${encodeURIComponent(botId)}/tasks${qs}`);
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ botId: string }> },
): Promise<Response> {
    const { botId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const upstream = await portalProxy(request, `/portal/data/agents/${encodeURIComponent(botId)}/tasks`, {
        method: 'POST',
        body,
    });
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
}
