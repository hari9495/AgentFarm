import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../../lib/internal-session';

type BatchDecisionPayload = {
    workspace_id?: string;
    decision?: 'approve_all' | 'reject_all' | 'review_individually' | string;
    reason?: string;
};

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(request: Request, context: { params: Promise<{ batchId: string }> }) {
    const params = await context.params;
    const batchId = params.batchId?.trim();

    let payload: BatchDecisionPayload;

    try {
        payload = (await request.json()) as BatchDecisionPayload;
    } catch {
        return NextResponse.json(
            { error: 'invalid_request', message: 'Invalid JSON body.' },
            { status: 400 },
        );
    }

    const workspaceId = payload.workspace_id?.trim();
    const decision = payload.decision?.trim();

    if (!batchId || !workspaceId || !decision) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'batchId, workspace_id, and decision are required.' },
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

    const response = await fetch(`${getApiBaseUrl()}/v1/approvals/batch/${encodeURIComponent(batchId)}/decision`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            Authorization: authHeader,
        },
        body: JSON.stringify({
            workspace_id: workspaceId,
            decision,
            reason: payload.reason,
        }),
        cache: 'no-store',
    });

    const body = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse approval batch decision response.',
    }));

    return NextResponse.json(body, { status: response.status });
}
