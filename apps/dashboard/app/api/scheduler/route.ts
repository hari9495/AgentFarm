import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(_req: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    try {
        const response = await fetch(`${getApiBaseUrl()}/scheduler/jobs`, {
            method: 'GET',
            headers: { Authorization: authHeader },
            cache: 'no-store',
        });

        const data = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse scheduler jobs response.',
        }));

        return NextResponse.json(data, { status: response.status });
    } catch {
        return NextResponse.json(
            { error: 'upstream_unavailable', message: 'Scheduler upstream is unavailable.' },
            { status: 502 },
        );
    }
}

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

    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'name is required.' },
            { status: 400 },
        );
    }

    if (!body.target) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'target is required.' },
            { status: 400 },
        );
    }

    if (!body.frequency) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'frequency is required.' },
            { status: 400 },
        );
    }

    try {
        const response = await fetch(`${getApiBaseUrl()}/scheduler/jobs`, {
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
            message: 'Unable to parse create job response.',
        }));

        return NextResponse.json(data, { status: response.status });
    } catch {
        return NextResponse.json(
            { error: 'upstream_unavailable', message: 'Scheduler upstream is unavailable.' },
            { status: 502 },
        );
    }
}
