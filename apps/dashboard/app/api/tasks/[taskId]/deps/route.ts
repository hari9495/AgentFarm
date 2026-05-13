import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

/**
 * GET /api/tasks/[taskId]/deps
 *
 * Proxies to GET /v1/task-queue/:taskId and returns the raw entry
 * (includes id, status, dependsOn, dependencyMet fields).
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ taskId: string }> },
) {
    const { taskId } = await params;

    if (!taskId?.trim()) {
        return NextResponse.json(
            { error: 'bad_request', message: 'taskId is required.' },
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

    let res: Response;
    try {
        res = await fetch(`${getApiBaseUrl()}/v1/task-queue/${encodeURIComponent(taskId)}`, {
            headers: { Authorization: authHeader },
            cache: 'no-store',
        });
    } catch {
        return NextResponse.json(
            { error: 'upstream_error', message: 'Failed to reach task queue service.' },
            { status: 502 },
        );
    }

    const data = await res.json().catch(() => ({ error: 'upstream_error' }));
    return NextResponse.json(data, { status: res.status });
}
