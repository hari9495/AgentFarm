import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

type RouteParams = {
    params: Promise<{ workspaceId: string }>;
};

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(request: Request, { params }: RouteParams) {
    const { workspaceId } = await params;

    if (!workspaceId?.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'workspaceId is required.' },
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

    let body: { branch?: string;[key: string]: unknown };
    try {
        body = (await request.json()) as { branch?: string;[key: string]: unknown };
    } catch {
        return NextResponse.json(
            { error: 'invalid_request', message: 'Invalid JSON body.' },
            { status: 400 },
        );
    }

    if (!body.branch?.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'branch is required.' },
            { status: 400 },
        );
    }

    try {
        const response = await fetch(
            `${getApiBaseUrl()}/v1/workspaces/${encodeURIComponent(workspaceId)}/pull-requests/draft`,
            {
                method: 'POST',
                headers: {
                    Authorization: authHeader,
                    'content-type': 'application/json',
                },
                body: JSON.stringify(body),
            },
        );

        const data = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse pr-draft response.',
        }));

        return NextResponse.json(data, { status: response.status });
    } catch {
        return NextResponse.json(
            { error: 'upstream_unavailable', message: 'PR drafts upstream is unavailable.' },
            { status: 502 },
        );
    }
}
