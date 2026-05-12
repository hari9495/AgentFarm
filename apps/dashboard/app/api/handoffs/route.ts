import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json(
            { error: 'invalid_request', message: 'Invalid JSON body.' },
            { status: 400 },
        );
    }

    if (!body.workspace_id || typeof body.workspace_id !== 'string' || !body.workspace_id.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'workspace_id is required.' },
            { status: 400 },
        );
    }

    if (!body.task_id || typeof body.task_id !== 'string' || !body.task_id.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'task_id is required.' },
            { status: 400 },
        );
    }

    if (!body.from_bot_id || typeof body.from_bot_id !== 'string' || !body.from_bot_id.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'from_bot_id is required.' },
            { status: 400 },
        );
    }

    if (!body.to_bot_id || typeof body.to_bot_id !== 'string' || !body.to_bot_id.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'to_bot_id is required.' },
            { status: 400 },
        );
    }

    try {
        const response = await fetch(`${getApiBaseUrl()}/v1/handoffs/initiate`, {
            method: 'POST',
            headers: {
                Authorization: authHeader,
                'content-type': 'application/json',
            },
            body: JSON.stringify(body),
            cache: 'no-store',
        });

        const data = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse handoff initiate response.',
        }));

        return NextResponse.json(data, { status: response.status });
    } catch {
        return NextResponse.json(
            { error: 'upstream_unavailable', message: 'Handoffs upstream is unavailable.' },
            { status: 502 },
        );
    }
}
