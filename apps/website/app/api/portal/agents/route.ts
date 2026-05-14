
import { NextResponse } from 'next/server';
import { portalProxy } from '../_utils';

export async function GET(request: Request): Promise<Response> {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit');
    const qs = limit ? `?limit=${encodeURIComponent(limit)}` : '';

    const upstream = await portalProxy(request, `/portal/data/agents${qs}`);
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
}

