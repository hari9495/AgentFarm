import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

type AnswerPayload = {
    question_id?: string;
    answer?: string;
    tenant_id?: string;
    workspace_id?: string;
    answered_by?: string;
};

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(request: Request) {
    let payload: AnswerPayload;

    try {
        payload = (await request.json()) as AnswerPayload;
    } catch {
        return NextResponse.json(
            { error: 'invalid_request', message: 'Invalid JSON body.' },
            { status: 400 },
        );
    }

    const questionId = payload.question_id?.trim();
    const answer = payload.answer?.trim();
    const tenantId = payload.tenant_id?.trim();
    const workspaceId = payload.workspace_id?.trim();
    const answeredBy = payload.answered_by?.trim() ?? 'internal_operator';

    if (!questionId || !answer || !tenantId || !workspaceId) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'question_id, answer, tenant_id, workspace_id are required.' },
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

    const response = await fetch(`${getApiBaseUrl()}/v1/questions/${encodeURIComponent(questionId)}/answer`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            Authorization: authHeader,
        },
        body: JSON.stringify({
            answer,
            answeredBy,
        }),
        cache: 'no-store',
    });

    const body = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse answer response.',
    }));

    return NextResponse.json(body, { status: response.status });
}
