import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(request: Request, context: { params: Promise<{ batchId: string }> }) {
    const params = await context.params;
    const batchId = params.batchId?.trim();
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspace_id')?.trim();

    if (!batchId || !workspaceId) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'batchId and workspace_id are required.' },
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

    const response = await fetch(`${getApiBaseUrl()}/v1/approvals/batch/${encodeURIComponent(batchId)}?workspace_id=${encodeURIComponent(workspaceId)}`, {
        method: 'GET',
        headers: {
            Authorization: authHeader,
        },
        cache: 'no-store',
    });

    const body = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse approval batch status response.',
    }));

    return NextResponse.json(body, { status: response.status });
}
