import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ patternId: string }> },
) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Internal session required.' }, { status: 403 });
    }
    const { patternId } = await params;
    if (!patternId?.trim()) {
        return NextResponse.json({ error: 'bad_request', message: 'patternId is required.' }, { status: 400 });
    }
    const response = await fetch(
        `${getApiBaseUrl()}/v1/memory/patterns/${encodeURIComponent(patternId)}/reinforce`,
        {
            method: 'POST',
            headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        },
    );
    const body = await response.json().catch(() => ({ error: 'upstream_error', message: 'Unable to parse reinforce response.' }));
    return NextResponse.json(body, { status: response.status });
}
