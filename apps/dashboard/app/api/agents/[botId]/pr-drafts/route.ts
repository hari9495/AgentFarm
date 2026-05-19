import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader, getSessionPayload } from '../../../../lib/internal-session';

type RouteParams = {
    params: Promise<{ botId: string }>;
};

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(request: Request, { params }: RouteParams) {
    const { botId } = await params;

    if (!botId?.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'botId is required.' },
            { status: 400 },
        );
    }

    const [authHeader, sessionPayload] = await Promise.all([
        getInternalSessionAuthHeader(),
        getSessionPayload(),
    ]);

    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') ?? undefined;
    const limit = searchParams.get('limit') ?? '50';

    // Resolve workspaceId from the session token (first workspace the user has access to)
    const workspaceId = sessionPayload?.workspaceIds?.[0];
    if (!workspaceId) {
        return NextResponse.json({ total: 0, drafts: [] });
    }

    const upstream = new URL(
        `/v1/workspaces/${encodeURIComponent(workspaceId)}/pull-requests`,
        getApiBaseUrl(),
    );
    if (status) upstream.searchParams.set('status', status);
    upstream.searchParams.set('limit', limit);

    try {
        const response = await fetch(upstream.toString(), {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                Authorization: authHeader,
            },
        });

        const data: unknown = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch {
        return NextResponse.json(
            { error: 'upstream_error', message: 'Failed to reach API gateway.' },
            { status: 502 },
        );
    }
}
