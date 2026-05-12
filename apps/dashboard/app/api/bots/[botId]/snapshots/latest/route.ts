import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../../lib/internal-session';

type RouteParams = {
    params: Promise<{ botId: string }>;
};

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(_request: Request, { params }: RouteParams) {
    const { botId } = await params;

    if (!botId?.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'botId is required.' },
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
            `${getApiBaseUrl()}/v1/bots/${encodeURIComponent(botId)}/capability-snapshot/latest`,
            {
                method: 'GET',
                headers: { Authorization: authHeader },
                cache: 'no-store',
            },
        );

        const data = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse snapshot response.',
        }));

        return NextResponse.json(data, { status: response.status });
    } catch {
        return NextResponse.json(
            { error: 'upstream_unavailable', message: 'Snapshot upstream is unavailable.' },
            { status: 502 },
        );
    }
}
