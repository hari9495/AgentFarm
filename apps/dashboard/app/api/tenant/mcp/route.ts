import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET() {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    try {
        const response = await fetch(`${getApiBaseUrl()}/v1/mcp`, {
            method: 'GET',
            headers: { Authorization: authHeader },
            cache: 'no-store',
        });

        const body = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse MCP servers response.',
        }));

        return NextResponse.json(body, { status: response.status });
    } catch {
        return NextResponse.json(
            { error: 'gateway_error', message: 'Failed to reach MCP registry.' },
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

    let bodyJson: unknown;
    try {
        bodyJson = await request.json();
    } catch {
        return NextResponse.json(
            { error: 'invalid_request', message: 'Request body must be valid JSON.' },
            { status: 400 },
        );
    }

    try {
        const response = await fetch(`${getApiBaseUrl()}/v1/mcp`, {
            method: 'POST',
            headers: {
                Authorization: authHeader,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(bodyJson),
            cache: 'no-store',
        });

        const body = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse MCP register response.',
        }));

        return NextResponse.json(body, { status: response.status });
    } catch {
        return NextResponse.json(
            { error: 'gateway_error', message: 'Failed to reach MCP registry.' },
            { status: 502 },
        );
    }
}
