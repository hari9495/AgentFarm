import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

type RetentionPayload = {
    workspace_id?: string;
    retention_days?: number;
    dry_run?: boolean;
};

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

const getAuthHeader = async (): Promise<string | null> => {
    const cookieStore = await cookies();
    const session = cookieStore.get('agentfarm_session');
    if (!session?.value) {
        return null;
    }

    return `Bearer ${decodeURIComponent(session.value)}`;
};

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

    const authHeader = await getAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'unauthorized', message: 'Missing session cookie.' },
            { status: 401 },
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
