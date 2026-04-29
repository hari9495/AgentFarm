import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

type RouteParams = {
    params: Promise<{ workspaceId: string }>;
};

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(_request: Request, { params }: RouteParams) {
    const { workspaceId } = await params;
    const authHeader = await getInternalSessionAuthHeader();

    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    const response = await fetch(`${getApiBaseUrl()}/v1/workspaces/${encodeURIComponent(workspaceId)}/budget/limits`, {
        method: 'GET',
        headers: {
            Authorization: authHeader,
        },
        cache: 'no-store',
    });

    const body = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse budget limit response.',
    }));

    return NextResponse.json(body, { status: response.status });
}

export async function PUT(request: Request, { params }: RouteParams) {
    const { workspaceId } = await params;
    const authHeader = await getInternalSessionAuthHeader();

    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    let payload: unknown;
    try {
        payload = await request.json();
    } catch {
        return NextResponse.json(
            { error: 'invalid_request', message: 'Invalid JSON body.' },
            { status: 400 },
        );
    }

    const response = await fetch(`${getApiBaseUrl()}/v1/workspaces/${encodeURIComponent(workspaceId)}/budget/limits`, {
        method: 'PUT',
        headers: {
            Authorization: authHeader,
            'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
    });

    const body = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse budget limit response.',
    }));

    return NextResponse.json(body, { status: response.status });
}