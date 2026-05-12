import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

type RouteParams = {
    params: Promise<{ jobId: string }>;
};

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(_req: Request, { params }: RouteParams) {
    const { jobId } = await params;

    if (!jobId?.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'jobId is required.' },
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

    try {
        const response = await fetch(
            `${getApiBaseUrl()}/scheduler/jobs/${encodeURIComponent(jobId)}/resume`,
            {
                method: 'POST',
                headers: { Authorization: authHeader },
                cache: 'no-store',
            },
        );

        const data = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse resume job response.',
        }));

        return NextResponse.json(data, { status: response.status });
    } catch {
        return NextResponse.json(
            { error: 'upstream_unavailable', message: 'Scheduler upstream is unavailable.' },
            { status: 502 },
        );
    }
}
