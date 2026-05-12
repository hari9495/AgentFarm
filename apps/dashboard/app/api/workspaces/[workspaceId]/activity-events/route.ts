import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

type RouteParams = {
    params: Promise<{ workspaceId: string }>;
};

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(request: Request, { params }: RouteParams) {
    const { workspaceId } = await params;

    if (!workspaceId?.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'workspaceId is required.' },
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

    const { searchParams } = new URL(request.url);

    try {
        const response = await fetch(
            `${getApiBaseUrl()}/v1/workspaces/${encodeURIComponent(workspaceId)}/activity-events?${searchParams.toString()}`,
            {
                method: 'GET',
                headers: { Authorization: authHeader },
                cache: 'no-store',
            },
        );

        const data = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse activity-events response.',
        }));

        return NextResponse.json(data, { status: response.status });
    } catch {
        return NextResponse.json(
            { error: 'upstream_unavailable', message: 'Activity events upstream is unavailable.' },
            { status: 502 },
        );
    }
}

export async function POST(request: Request, { params }: RouteParams) {
    const { workspaceId } = await params;

    if (!workspaceId?.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'workspaceId is required.' },
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

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json(
            { error: 'invalid_request', message: 'Invalid JSON body.' },
            { status: 400 },
        );
    }

    if (!body.category || typeof body.category !== 'string' || !body.category.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'category is required.' },
            { status: 400 },
        );
    }

    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'title is required.' },
            { status: 400 },
        );
    }

    try {
        const response = await fetch(
            `${getApiBaseUrl()}/v1/workspaces/${encodeURIComponent(workspaceId)}/activity-events`,
            {
                method: 'POST',
                headers: {
                    Authorization: authHeader,
                    'content-type': 'application/json',
                },
                body: JSON.stringify(body),
                cache: 'no-store',
            },
        );

        const data = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse emit activity-event response.',
        }));

        return NextResponse.json(data, { status: response.status });
    } catch {
        return NextResponse.json(
            { error: 'upstream_unavailable', message: 'Activity events upstream is unavailable.' },
            { status: 502 },
        );
    }
}
