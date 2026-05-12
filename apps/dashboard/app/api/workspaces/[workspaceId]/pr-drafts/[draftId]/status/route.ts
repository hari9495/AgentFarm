import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../../../lib/internal-session';

type RouteParams = {
    params: Promise<{ workspaceId: string; draftId: string }>;
};

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(_request: Request, { params }: RouteParams) {
    const { workspaceId, draftId } = await params;

    if (!workspaceId?.trim() || !draftId?.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'workspaceId and draftId are required.' },
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

    try {
        const response = await fetch(
            `${getApiBaseUrl()}/v1/workspaces/${encodeURIComponent(workspaceId)}/pull-requests/${encodeURIComponent(draftId)}/status`,
            {
                method: 'GET',
                headers: { Authorization: authHeader },
                cache: 'no-store',
            },
        );

        const data = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse PR status response.',
        }));

        return NextResponse.json(data, { status: response.status });
    } catch {
        return NextResponse.json(
            { error: 'upstream_unavailable', message: 'PR status upstream is unavailable.' },
            { status: 502 },
        );
    }
}
