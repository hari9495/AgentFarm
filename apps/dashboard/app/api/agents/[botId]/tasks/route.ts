import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader, getSessionPayload } from '../../../../lib/internal-session';

type RouteParams = {
    params: Promise<{ botId: string }>;
};

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(request: Request, { params }: RouteParams) {
    const { botId } = await params;

    if (!botId?.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'botId is required.' },
            { status: 400 },
        );
    }

    const [authHeader, sessionPayload] = await Promise.all([
        getInternalSessionAuthHeader(),
        getSessionPayload(),
    ]);

    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') ?? undefined;
    const limit = searchParams.get('limit') ?? '50';

    const workspaceId = sessionPayload?.workspaceIds?.[0];
    if (!workspaceId) {
        return NextResponse.json({ total: 0, tasks: [] });
    }

    // Proxy to the task-queue endpoint scoped by tenant, then filter by botId client-side
    const upstream = new URL('/v1/task-queue', getApiBaseUrl());
    if (status) upstream.searchParams.set('status', status);

    try {
        const response = await fetch(upstream.toString(), {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                Authorization: authHeader,
            },
        });

        if (!response.ok) {
            const data: unknown = await response.json().catch(() => null);
            return NextResponse.json(data ?? { total: 0, tasks: [] }, { status: response.status });
        }

        const data = (await response.json()) as { entries?: Array<{ botId?: string; workspaceId?: string }>; count?: number } | null;
        const entries = data?.entries ?? [];

        // Filter by botId to return per-agent counts
        const filtered = entries.filter(
            (e) => e.botId === botId && e.workspaceId === workspaceId,
        );

        const effectiveLimit = parseInt(limit, 10);
        const sliced = Number.isNaN(effectiveLimit) ? filtered : filtered.slice(0, effectiveLimit);

        return NextResponse.json({ total: filtered.length, tasks: sliced });
    } catch {
        return NextResponse.json({ total: 0, tasks: [] });
    }
}
