export const runtime = 'edge'

import { NextResponse } from 'next/server';
import { portalProxy } from '../../_utils';

export async function GET(request: Request): Promise<Response> {
    const upstream = await portalProxy(request, '/portal/data/billing/subscription');
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
}

