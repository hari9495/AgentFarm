import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

type DecisionPayload = {
    approval_id?: string;
    workspace_id?: string;
    decision?: 'approved' | 'rejected' | 'timeout_rejected' | string;
    reason?: string;
    selected_option_id?: string;
};

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(request: Request) {
    let payload: DecisionPayload;

    try {
        payload = (await request.json()) as DecisionPayload;
    } catch {
        return NextResponse.json(
            { error: 'invalid_request', message: 'Invalid JSON body.' },
            { status: 400 },
        );
    }

    const approvalId = payload.approval_id?.trim();
    const workspaceId = payload.workspace_id?.trim();
    const decision = typeof payload.decision === 'string' ? payload.decision.trim() : '';
    const reason = payload.reason?.trim();
    const selectedOptionId = payload.selected_option_id?.trim();

    if (!approvalId || !workspaceId || !decision) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'approval_id, workspace_id, and decision are required.' },
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

    const response = await fetch(`${getApiBaseUrl()}/v1/approvals/${approvalId}/decision`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            Authorization: authHeader,
        },
        body: JSON.stringify({
            workspace_id: workspaceId,
            decision,
            reason,
            selected_option_id: selectedOptionId,
        }),
        cache: 'no-store',
    });

    const body = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse decision response.',
    }));

    return NextResponse.json(body, { status: response.status });
}
