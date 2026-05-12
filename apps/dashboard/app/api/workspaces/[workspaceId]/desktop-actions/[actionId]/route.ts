import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../../lib/internal-session';

type RouteParams = {
    params: Promise<{ workspaceId: string; actionId: string }>;
};

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function PUT(request: Request, { params }: RouteParams) {
    const { workspaceId, actionId } = await params;

    if (!workspaceId?.trim() || !actionId?.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'workspaceId and actionId are required.' },
            { status: 400 },
        );
    }

    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    let body: unknown = {};
    try {
        body = await request.json();
    } catch {
        // Optional fields — proceed with empty object
    }

    try {
        const response = await fetch(
            `${getApiBaseUrl()}/v1/workspaces/${encodeURIComponent(workspaceId)}/desktop-actions/${encodeURIComponent(actionId)}`,
            {
                method: 'PUT',
                headers: {
                    Authorization: authHeader,
                    'content-type': 'application/json',
                },
                body: JSON.stringify(body),
            },
        );

        const data = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse desktop-action update response.',
        }));

        return NextResponse.json(data, { status: response.status });
    } catch {
        return NextResponse.json(
            { error: 'upstream_unavailable', message: 'Desktop-actions upstream is unavailable.' },
            { status: 502 },
        );
    }
}
