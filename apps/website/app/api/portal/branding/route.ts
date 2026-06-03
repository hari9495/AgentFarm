import { NextResponse } from 'next/server';
import { portalProxy } from '../_utils';

export async function GET(request: Request): Promise<Response> {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenant_id') ?? '';
    const upstream = await portalProxy(request, `/portal/data/branding?tenant_id=${encodeURIComponent(tenantId)}`);
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
}
