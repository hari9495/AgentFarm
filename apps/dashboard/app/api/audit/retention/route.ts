import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

type RetentionPayload = {
    workspace_id?: string;
    retention_days?: number;
    dry_run?: boolean;
};

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(request: Request) {
    let payload: RetentionPayload;

    try {
        payload = (await request.json()) as RetentionPayload;
    } catch {
        return NextResponse.json(
            { error: 'invalid_request', message: 'Invalid JSON body.' },
            { status: 400 },
        );
    }

    const workspaceId = payload.workspace_id?.trim();
    if (!workspaceId) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'workspace_id is required.' },
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

    const response = await fetch(`${getApiBaseUrl()}/v1/audit/retention/cleanup`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            Authorization: authHeader,
        },
        body: JSON.stringify({
            workspace_id: workspaceId,
            retention_days: payload.retention_days,
            dry_run: payload.dry_run,
        }),
        cache: 'no-store',
    });

    const body = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse retention response.',
    }));

    return NextResponse.json(body, { status: response.status });
}
