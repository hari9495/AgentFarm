
import { NextResponse } from 'next/server';
import { portalProxy } from '../_utils';

export async function GET(request: Request): Promise<Response> {
    const upstream = await portalProxy(request, '/portal/data/profile');
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
}

export async function PATCH(request: Request): Promise<Response> {
    const body = await request.json().catch(() => ({}));
    const upstream = await portalProxy(request, '/portal/data/profile', {
        method: 'PATCH',
        body,
    });
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
}

