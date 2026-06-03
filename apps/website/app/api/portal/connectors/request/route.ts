import { NextResponse } from 'next/server';
import { portalProxy } from '../../_utils';

export async function POST(request: Request): Promise<Response> {
    let body: unknown;
    try { body = await request.json(); } catch {
        return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }
    const upstream = await portalProxy(request, '/portal/data/connectors/request', { method: 'POST', body });
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
}
