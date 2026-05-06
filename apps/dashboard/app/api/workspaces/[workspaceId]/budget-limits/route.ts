import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';
import { proxyBudgetLimitsGet, proxyBudgetLimitsPut } from './proxy-core';

type RouteParams = {
    params: Promise<{ workspaceId: string }>;
};

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(_request: Request, { params }: RouteParams) {
    const { workspaceId } = await params;
    const authHeader = await getInternalSessionAuthHeader();
    const result = await proxyBudgetLimitsGet({ workspaceId, authHeader, apiBaseUrl: getApiBaseUrl() });
    return NextResponse.json(result.body, { status: result.status });
}

export async function PUT(request: Request, { params }: RouteParams) {
    const { workspaceId } = await params;
    const authHeader = await getInternalSessionAuthHeader();

    let payload: unknown;
    try {
        payload = await request.json();
    } catch {
        return NextResponse.json(
            { error: 'invalid_request', message: 'Invalid JSON body.' },
            { status: 400 },
        );
    }

    const result = await proxyBudgetLimitsPut({ workspaceId, authHeader, payload, apiBaseUrl: getApiBaseUrl() });
    return NextResponse.json(result.body, { status: result.status });
}