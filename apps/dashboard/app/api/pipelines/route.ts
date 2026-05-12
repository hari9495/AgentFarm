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
        const response = await fetch(`${getApiBaseUrl()}/pipelines`, {
            method: 'GET',
            headers: { Authorization: authHeader },
            cache: 'no-store',
        });

        const data = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse pipelines response.',
        }));

        return NextResponse.json(data, { status: response.status });
    } catch {
        return NextResponse.json(
            { error: 'upstream_unavailable', message: 'Pipelines upstream is unavailable.' },
            { status: 502 },
        );
    }
}
