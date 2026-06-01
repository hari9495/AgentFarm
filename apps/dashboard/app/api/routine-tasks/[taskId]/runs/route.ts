import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ taskId: string }> },
): Promise<Response> {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const { taskId } = await params;
    if (!taskId?.trim()) {
        return NextResponse.json({ error: 'invalid_request', message: 'taskId is required.' }, { status: 400 });
    }

    try {
        const response = await fetch(
            `${getApiBaseUrl()}/v1/routine-tasks/${encodeURIComponent(taskId)}/runs`,
            {
                method: 'POST',
                headers: { Authorization: authHeader, 'content-type': 'application/json' },
                body: JSON.stringify({}),
                cache: 'no-store',
            },
        );
        const body = await response.json().catch(() => ({ error: 'upstream_error' }));
        return NextResponse.json(body, { status: response.status });
    } catch {
        return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
    }
}
