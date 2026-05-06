import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

type BatchIntakePayload = {
    workspace_id?: string;
    task_id?: string;
    actions?: Array<{
        task_id?: string;
        action_type?: string;
        risk_level?: 'medium' | 'high' | string;
        payload?: Record<string, unknown>;
    }>;
};

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(request: Request) {
    let payload: BatchIntakePayload;

    try {
        payload = (await request.json()) as BatchIntakePayload;
    } catch {
        return NextResponse.json(
            { error: 'invalid_request', message: 'Invalid JSON body.' },
            { status: 400 },
        );
    }

    const workspaceId = payload.workspace_id?.trim();
    if (!workspaceId || !Array.isArray(payload.actions) || payload.actions.length === 0) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'workspace_id and non-empty actions are required.' },
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

    const response = await fetch(`${getApiBaseUrl()}/v1/approvals/batch/intake`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            Authorization: authHeader,
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
    });

    const body = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse approval batch intake response.',
    }));

    return NextResponse.json(body, { status: response.status });
}
