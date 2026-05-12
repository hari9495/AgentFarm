import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ userId: string }> },
) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Internal session required.' }, { status: 403 });
    }
    const { userId } = await params;
    if (!userId?.trim()) {
        return NextResponse.json({ error: 'bad_request', message: 'userId is required.' }, { status: 400 });
    }
    const response = await fetch(
        `${getApiBaseUrl()}/v1/team/members/${encodeURIComponent(userId)}`,
        {
            method: 'DELETE',
            headers: { Authorization: authHeader },
        },
    );
    if (response.status === 204) {
        return new NextResponse(null, { status: 204 });
    }
    const body = await response.json().catch(() => ({ error: 'upstream_error', message: 'Unable to parse delete response.' }));
    return NextResponse.json(body, { status: response.status });
}
