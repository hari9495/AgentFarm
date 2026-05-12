import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

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

    if (!body.pipeline_id || typeof body.pipeline_id !== 'string' || !body.pipeline_id.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'pipeline_id is required.' },
            { status: 400 },
        );
    }

    try {
        const response = await fetch(`${getApiBaseUrl()}/pipelines/run`, {
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
            message: 'Unable to parse pipeline run response.',
        }));

        return NextResponse.json(data, { status: response.status });
    } catch {
        return NextResponse.json(
            { error: 'upstream_unavailable', message: 'Pipelines upstream is unavailable.' },
            { status: 502 },
        );
    }
}
